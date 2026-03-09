import * as crypto from 'crypto';
import * as fs from 'fs';

// Import pkcs11js for smart card support
let pkcs11js: any = null;
try {
    pkcs11js = require('pkcs11js');
} catch (e) {
    console.warn('[Pkcs11Service] pkcs11js not installed. Smart card hardware access will be unavailable.');
}

export interface Pkcs11KeyInfo {
    certificate: string;
    certificateDer: Buffer;
    publicKey: crypto.KeyObject;
    algo: 'ES256' | 'ES384' | 'ES512' | 'RS256';
}

class Pkcs11Service {
    private pkcs11Module: any = null;

    // ── Primary token (Iden) ── for FHIR Messages (TC12, TC16)
    private pkcs11Session: Buffer | null = null;
    private privateKeyHandle: Buffer | null = null;
    private keyInfo: Pkcs11KeyInfo | null = null;
    private savedPin: string = '';
    private savedSlot: Buffer | null = null;
    private requiresContextLogin: boolean = false;

    // ── Secondary token (Sign) ── for FHIR Document Bundles (TC18)
    private signSession: Buffer | null = null;
    private signKeyHandle: Buffer | null = null;
    private signKeyInfo: Pkcs11KeyInfo | null = null;
    private signPinSaved: string = '';
    private signSlotSaved: Buffer | null = null;

    isActive(): boolean {
        return this.privateKeyHandle !== null;
    }

    getKeyInfo(): Pkcs11KeyInfo | null {
        return this.keyInfo;
    }

    /**
     * Initialize the PKCS#11 module and login to the token.
     * Certilia kartica ima dva tokena:
     *   - "Sign" token (SIGN_PIN) — za digitalni potpis dokumenata (ne-poricanje)
     *   - "Iden" token (IDEN_PIN) — za autentikaciju
     * Za potpisivanje FHIR Bundle-a koristimo Sign token.
     */
    /**
     * Test if a token can perform signing programmatically.
     * Some tokens (like Sign with CKA_ALWAYS_AUTHENTICATE=true) require
     * per-operation PIN via middleware UI and can't be used headlessly.
     */
    private testTokenSigning(slot: Buffer, pin: string): { ok: boolean; needsContextLogin: boolean } {
        if (!this.pkcs11Module) return { ok: false, needsContextLogin: false };
        let testSession: Buffer | null = null;
        try {
            // Aggressively clean up stale sessions from previous backend processes
            try { this.pkcs11Module.C_CloseAllSessions(slot); } catch (_) { }

            testSession = this.pkcs11Module.C_OpenSession(slot, 0x04 | 0x02);
            try {
                this.pkcs11Module.C_Login(testSession, 1, pin); // CKU_USER = 1
            } catch (loginErr: any) {
                if (loginErr.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) {
                    // Already logged in from this process — fine, proceed
                    console.log('[Pkcs11Service] Already logged in on this slot — proceeding.');
                } else if (loginErr.message?.includes('CKR_USER_ANOTHER_ALREADY_LOGGED_IN')) {
                    // Another process has an active session — try full module reset
                    console.log('[Pkcs11Service] Another session active, resetting PKCS#11 module...');
                    try { this.pkcs11Module.C_CloseSession(testSession); } catch (_) { }
                    try { this.pkcs11Module.C_Finalize(); } catch (_) { }
                    try { this.pkcs11Module.C_Initialize(); } catch (ie: any) {
                        if (!ie.message?.includes('CKR_CRYPTOKI_ALREADY_INITIALIZED')) throw ie;
                    }
                    testSession = this.pkcs11Module.C_OpenSession(slot, 0x04 | 0x02);
                    this.pkcs11Module.C_Login(testSession, 1, pin);
                    console.log('[Pkcs11Service] Module reset + login OK.');
                } else {
                    throw loginErr;
                }
            }

            // Find a private key
            this.pkcs11Module.C_FindObjectsInit(testSession, []);
            const objs: Buffer[] = [];
            let o: Buffer[];
            while ((o = this.pkcs11Module.C_FindObjects(testSession, 1)).length > 0) objs.push(o[0]);
            this.pkcs11Module.C_FindObjectsFinal(testSession);

            let privKey: Buffer | null = null;
            for (const obj of objs) {
                const attrs = this.pkcs11Module.C_GetAttributeValue(testSession, obj, [{ type: 0x00000000 }]);
                const cls = attrs[0]?.value?.readUInt32LE?.(0) ?? attrs[0]?.value?.[0];
                if (cls === 3 || cls === 3n) { privKey = obj; break; }
            }

            if (!privKey) return { ok: false, needsContextLogin: false };

            // Check CKA_ALWAYS_AUTHENTICATE
            let alwaysAuth = false;
            try {
                const aa = this.pkcs11Module.C_GetAttributeValue(testSession, privKey, [{ type: 0x00000202, value: Buffer.alloc(4) }]);
                if (aa[0]?.value?.[0] === 1) {
                    alwaysAuth = true;
                    console.log('[Pkcs11Service] Token has CKA_ALWAYS_AUTHENTICATE=true — will use context-specific login (CKU=2).');
                }
            } catch (_) { /* attribute not supported = probably fine */ }

            // Try an actual test sign
            const hash = crypto.createHash('sha256').update('pkcs11-test').digest();
            const kt = this.pkcs11Module.C_GetAttributeValue(testSession, privKey, [{ type: 0x00000100 }]);
            const keyType = kt[0]?.value?.[0];
            const mech = keyType === 3 ? 0x00001041 : 0x00000040; // CKM_ECDSA or CKM_SHA256_RSA_PKCS
            this.pkcs11Module.C_SignInit(testSession, { mechanism: mech, parameter: null }, privKey);

            // If CKA_ALWAYS_AUTHENTICATE, do context-specific login between SignInit and Sign
            if (alwaysAuth) {
                this.pkcs11Module.C_Login(testSession, 2, pin); // CKU_CONTEXT_SPECIFIC = 2
                console.log('[Pkcs11Service] Context-specific login (CKU=2) OK.');
            }

            this.pkcs11Module.C_Sign(testSession, keyType === 3 ? hash : Buffer.from('pkcs11-test'), Buffer.alloc(4096));
            console.log(`[Pkcs11Service] Test sign successful on this token (alwaysAuth=${alwaysAuth}).`);
            return { ok: true, needsContextLogin: alwaysAuth };
        } catch (e: any) {
            console.log(`[Pkcs11Service] Test sign failed: ${e.message}`);
            return { ok: false, needsContextLogin: false };
        } finally {
            if (testSession) {
                try { this.pkcs11Module.C_Logout(testSession); } catch (_) { }
                try { this.pkcs11Module.C_CloseSession(testSession); } catch (_) { }
            }
        }
    }

    initialize(): boolean {
        if (!pkcs11js) return false;

        const PKCS11_MODULE_PATH = process.env.PKCS11_MODULE_PATH || 'C:\\Program Files\\AKD\\Certilia Middleware\\pkcs11\\CertiliaPkcs11_64.dll';
        const signPin = process.env.SIGN_PIN;
        const idenPin = process.env.IDEN_PIN;

        if (!fs.existsSync(PKCS11_MODULE_PATH)) {
            console.log(`[Pkcs11Service] Smart card middleware not found at ${PKCS11_MODULE_PATH}`);
            return false;
        }

        if (!signPin && !idenPin) {
            console.log('[Pkcs11Service] Neither SIGN_PIN nor IDEN_PIN is set in environment.');
            return false;
        }

        try {
            this.pkcs11Module = new pkcs11js.PKCS11();
            this.pkcs11Module.load(PKCS11_MODULE_PATH);

            try {
                this.pkcs11Module.C_Initialize();
            } catch (e: any) {
                if (!e.message.includes('CKR_CRYPTOKI_ALREADY_INITIALIZED')) {
                    throw e;
                }
            }

            const slots = this.pkcs11Module.C_GetSlotList(true);
            console.log(`[Pkcs11Service] Found ${slots.length} slot(s) with tokens.`);

            let targetSlot: Buffer | null = null;
            let targetPin: string = '';
            let tokenLabel: string = '';

            // Collect all available slots
            let signSlot: Buffer | null = null;
            let idenSlot: Buffer | null = null;
            for (const slot of slots) {
                const tokenInfo = this.pkcs11Module.C_GetTokenInfo(slot);
                const label = tokenInfo.label.trim();
                console.log(`[Pkcs11Service] Slot token label: "${label}"`);
                if (label.toLowerCase().includes('sign')) signSlot = slot;
                if (label.toLowerCase().includes('iden')) idenSlot = slot;
            }

            // ══ PRIMARY: Iden token (TC12, TC16 — FHIR Messages) ══
            if (!idenSlot || !idenPin) {
                console.warn('[Pkcs11Service] Iden token nije dostupan — potreban za TC12/TC16.');
                return false;
            }
            try {
                this.pkcs11Session = this.pkcs11Module.C_OpenSession(idenSlot, 0x04 | 0x02);
                this.pkcs11Module.C_Login(this.pkcs11Session, 1, idenPin);
            } catch (loginErr: any) {
                if (loginErr.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) {
                    // Already logged in — fine
                } else {
                    throw loginErr;
                }
            }
            targetSlot = idenSlot;
            targetPin = idenPin;
            tokenLabel = 'Iden';
            this.savedPin = idenPin;
            this.savedSlot = idenSlot;
            this.requiresContextLogin = false;
            console.log('[Pkcs11Service] ✅ Iden token inicijaliziran (primarni — TC12/TC16).');

            // Fetch objects
            this.pkcs11Module.C_FindObjectsInit(this.pkcs11Session, []);
            let allObjs: Buffer[] = [];
            let obj;
            while ((obj = this.pkcs11Module.C_FindObjects(this.pkcs11Session, 1)).length > 0) {
                allObjs.push(obj[0]);
            }
            this.pkcs11Module.C_FindObjectsFinal(this.pkcs11Session);

            let privKeyHandle: Buffer | null = null;
            let certHandle: Buffer | null = null;

            for (const o of allObjs) {
                const attrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, o, [{ type: 0x00000000 }]); // CKA_CLASS
                const cls = attrs[0]?.value?.readUInt32LE?.(0) ?? attrs[0]?.value?.[0];
                if (cls === 3 || cls === 3n) privKeyHandle = o;
                else if (cls === 1 || cls === 1n) certHandle = o;
            }

            if (!privKeyHandle || !certHandle) {
                throw new Error('Required objects (private key/certificate) not found on Iden token');
            }
            this.privateKeyHandle = privKeyHandle;

            const keyTypeAttrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, privKeyHandle, [{ type: 0x00000100 }]);
            const ckaKeyType = keyTypeAttrs[0]?.value?.[0];
            const algo = (ckaKeyType === 3) ? 'ES256' : 'RS256';

            const certAttrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session!, certHandle, [{ type: 0x00000011, value: Buffer.alloc(4096) }]);
            const certDer = certAttrs[0].value;
            const x509 = new crypto.X509Certificate(certDer);
            this.keyInfo = { certificate: x509.toString(), certificateDer: certDer, publicKey: x509.publicKey, algo: algo as any };
            console.log(`[Pkcs11Service] ✅ PKCS#11 inicijaliziran — token: "${tokenLabel}", algoritam: ${algo}, subjekt: ${x509.subject}`);

            // ══ SECONDARY: Sign token (TC18 — document bundles, non-repudiation) ══
            if (signSlot && signPin) {
                try {
                    console.log('[Pkcs11Service] Attempting Sign token (sekundarni — TC18 dokumenti)...');
                    try { this.pkcs11Module.C_CloseAllSessions(signSlot); } catch (_) { }
                    let signSess: Buffer;
                    try {
                        signSess = this.pkcs11Module.C_OpenSession(signSlot, 0x04 | 0x02);
                        this.pkcs11Module.C_Login(signSess, 1, signPin);
                    } catch (loginErr: any) {
                        if (loginErr.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) {
                            signSess = this.pkcs11Module.C_OpenSession(signSlot, 0x04 | 0x02);
                        } else if (loginErr.message?.includes('CKR_USER_ANOTHER_ALREADY_LOGGED_IN')) {
                            console.log('[Pkcs11Service] Sign sec: resetting module...');
                            try { this.pkcs11Module.C_Finalize(); } catch (_) { }
                            try { this.pkcs11Module.C_Initialize(); } catch (ie: any) {
                                if (!ie.message?.includes('CKR_CRYPTOKI_ALREADY_INITIALIZED')) throw ie;
                            }
                            signSess = this.pkcs11Module.C_OpenSession(signSlot, 0x04 | 0x02);
                            this.pkcs11Module.C_Login(signSess, 1, signPin);
                        } else { throw loginErr; }
                    }
                    this.signSession = signSess!;
                    this.signPinSaved = signPin;
                    this.signSlotSaved = signSlot;

                    this.pkcs11Module.C_FindObjectsInit(this.signSession, []);
                    const signObjs: Buffer[] = [];
                    let so: Buffer[];
                    while ((so = this.pkcs11Module.C_FindObjects(this.signSession, 1)).length > 0) signObjs.push(so[0]);
                    this.pkcs11Module.C_FindObjectsFinal(this.signSession);

                    let sk: Buffer | null = null, sc: Buffer | null = null;
                    for (const o of signObjs) {
                        const attrs = this.pkcs11Module.C_GetAttributeValue(this.signSession, o, [{ type: 0x00000000 }]);
                        const cls = attrs[0]?.value?.readUInt32LE?.(0) ?? attrs[0]?.value?.[0];
                        if (cls === 3 || cls === 3n) sk = o;
                        else if (cls === 1 || cls === 1n) sc = o;
                    }
                    if (sk && sc) {
                        this.signKeyHandle = sk;
                        const scAttrs = this.pkcs11Module.C_GetAttributeValue(this.signSession, sc, [{ type: 0x00000011, value: Buffer.alloc(4096) }]);
                        const scDer = scAttrs[0].value;
                        const scX509 = new crypto.X509Certificate(scDer);
                        const skKt = this.pkcs11Module.C_GetAttributeValue(this.signSession, sk, [{ type: 0x00000100 }])[0]?.value?.[0];
                        this.signKeyInfo = { certificate: scX509.toString(), certificateDer: scDer, publicKey: scX509.publicKey, algo: (skKt === 3) ? 'ES256' : 'RS256' };
                        console.log(`[Pkcs11Service] ✅ Sign token inicijaliziran (sekundarni) — algo: ${this.signKeyInfo.algo}, subjekt: ${scX509.subject}`);
                    }
                } catch (signErr: any) {
                    console.log(`[Pkcs11Service] Sign secondary init failed (non-fatal): ${signErr.message}`);
                }
            }

            return true;
        } catch (error: any) {
            console.error('[Pkcs11Service] Initialization failed:', error.message);
            this.cleanup();
            return false;
        }
    }

    /**
     * Perform hardware signature of the input data.
     * IMPORTANT: Certilia Sign token (non-repudiation) auto-logs-out after each operation.
     * We must login immediately before every C_Sign call.
     */
    sign(signingInput: string, finalAlg: string): Buffer {
        if (!this.pkcs11Session || !this.privateKeyHandle || !this.pkcs11Module) {
            throw new Error('PKCS#11 session not initialized');
        }

        // Login immediately before signing (Sign token auto-logouts for non-repudiation)
        try {
            this.pkcs11Module.C_Login(this.pkcs11Session, 1, this.savedPin);
            console.log('[Pkcs11Service] C_Login before sign: OK');
        } catch (loginErr: any) {
            // CKR_USER_ALREADY_LOGGED_IN is fine — proceed
            if (!loginErr.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) {
                // Try fresh session if odd error
                console.warn('[Pkcs11Service] Login before sign failed, trying fresh session...', loginErr.message);
                try {
                    try { this.pkcs11Module.C_CloseSession(this.pkcs11Session); } catch (_) { }
                    this.pkcs11Session = this.pkcs11Module.C_OpenSession(this.savedSlot!, 0x04 | 0x02);
                    this.pkcs11Module.C_Login(this.pkcs11Session, 1, this.savedPin);
                    console.log('[Pkcs11Service] Fresh session opened OK.');
                } catch (freshErr: any) {
                    throw new Error(`PKCS#11 login failed: ${freshErr.message}`);
                }
            }
        }

        try {
            const result = this._doSign(signingInput, finalAlg);
            // Logout after signing (maintains non-repudiation: PIN required for each signature)
            try { this.pkcs11Module.C_Logout(this.pkcs11Session); } catch (_) { }
            console.log('[Pkcs11Service] ✅ Signature created, logged out for non-repudiation.');
            return result;
        } catch (signErr: any) {
            try { this.pkcs11Module.C_Logout(this.pkcs11Session); } catch (_) { }
            throw new Error(`PKCS#11 sign failed: ${signErr.message}`);
        }
    }


    private _doSign(signingInput: string, finalAlg: string): Buffer {
        let mechanismBase: number;
        let dataToSign: Buffer;

        if (finalAlg.startsWith('ES')) {
            mechanismBase = 0x00001041; // CKM_ECDSA
            const hashAlg = finalAlg === 'ES384' ? 'sha384' : (finalAlg === 'ES512' ? 'sha512' : 'sha256');
            dataToSign = crypto.createHash(hashAlg).update(signingInput, 'utf-8').digest();
        } else {
            mechanismBase = 0x00000040; // CKM_SHA256_RSA_PKCS
            dataToSign = Buffer.from(signingInput, 'utf-8');
        }

        const signMechParams = { mechanism: mechanismBase, parameter: null };
        this.pkcs11Module.C_SignInit(this.pkcs11Session, signMechParams, this.privateKeyHandle);

        // CKA_ALWAYS_AUTHENTICATE: context-specific login between SignInit and Sign
        if (this.requiresContextLogin) {
            try {
                this.pkcs11Module.C_Login(this.pkcs11Session, 2, this.savedPin); // CKU_CONTEXT_SPECIFIC = 2
            } catch (ctxErr: any) {
                if (!ctxErr.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) {
                    throw new Error(`Context-specific login failed: ${ctxErr.message}`);
                }
            }
        }

        const signatureBytes = this.pkcs11Module.C_Sign(this.pkcs11Session, dataToSign, Buffer.alloc(4096));

        // Format ECDSA if needed
        if (finalAlg.startsWith('ES')) {
            const coordLen = finalAlg === 'ES384' ? 48 : (finalAlg === 'ES512' ? 66 : 32);
            const expectedTotal = coordLen * 2;

            if (signatureBytes.length === expectedTotal) return signatureBytes;

            if (signatureBytes[0] === 0x30) {
                return this.formatEcdsaSignature(signatureBytes, coordLen);
            }

            // Handle padded signatures
            if (signatureBytes.length % 2 === 0 && signatureBytes.length > expectedTotal) {
                const halfLen = signatureBytes.length / 2;
                const r = signatureBytes.subarray(halfLen - coordLen, halfLen);
                const s = signatureBytes.subarray(signatureBytes.length - coordLen);
                return Buffer.concat([r, s]);
            }
        }

        return signatureBytes;
    }

    /**
     * Sign with the secondary Sign token (for TC18 FHIR Document Bundles).
     * CKA_ALWAYS_AUTHENTICATE: requires CKU=2 login between C_SignInit and C_Sign.
     *
     * Certilia single module cannot have concurrent logins on two slots.
     * We use an ATOMIC SWAP: logout Iden → sign with Sign → restore Iden.
     */
    signWithSignToken(signingInput: string, finalAlg: string, pin?: string): Buffer {
        const usePin = pin || this.signPinSaved;
        if (!this.signSlotSaved || !usePin || !this.pkcs11Module) {
            throw new Error('Sign token not initialized — no slot or PIN available');
        }

        // ── Step 1: Suspend Iden session + FULL module reset ──
        // Certilia PKCS11 blocks C_Login on Sign slot unless we clear all prior logins.
        console.log('[Pkcs11Service] Atomic swap: suspending Iden + full module reset for Sign slot...');
        try { this.pkcs11Module.C_Logout(this.pkcs11Session!); } catch (_) { }
        try { this.pkcs11Module.C_CloseSession(this.pkcs11Session!); } catch (_) { }
        this.pkcs11Session = null;

        // Certilia needs full Finalize/Initialize to allow cross-slot login
        try { this.pkcs11Module.C_Finalize(); } catch (_) { }
        try { this.pkcs11Module.C_Initialize(); } catch (ie: any) {
            if (!ie.message?.includes('CKR_CRYPTOKI_ALREADY_INITIALIZED')) {
                console.warn('[Pkcs11Service] C_Initialize warning:', ie.message);
            }
        }
        console.log('[Pkcs11Service] Module reset OK — opening Sign session...');

        let signSess: Buffer | null = null;
        try {
            // ── Step 2: Open Sign session ──
            try { this.pkcs11Module.C_CloseAllSessions(this.signSlotSaved); } catch (_) { }
            signSess = this.pkcs11Module.C_OpenSession(this.signSlotSaved, 0x04 | 0x02);
            try {
                this.pkcs11Module.C_Login(signSess, 1, usePin);
                console.log('[Pkcs11Service] Sign: CKU=1 login OK.');
            } catch (loginErr: any) {
                if (!loginErr.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) throw loginErr;
            }

            // Reload private key handle (session-scoped in some PKIImplementations)
            let privKey: Buffer | null = this.signKeyHandle;
            if (!privKey) {
                this.pkcs11Module.C_FindObjectsInit(signSess, []);
                const objs: Buffer[] = [];
                let o: Buffer[];
                while ((o = this.pkcs11Module.C_FindObjects(signSess, 1)).length > 0) objs.push(o[0]);
                this.pkcs11Module.C_FindObjectsFinal(signSess);
                for (const obj of objs) {
                    const attrs = this.pkcs11Module.C_GetAttributeValue(signSess, obj, [{ type: 0x00000000 }]);
                    const cls = attrs[0]?.value?.readUInt32LE?.(0) ?? attrs[0]?.value?.[0];
                    if (cls === 3 || cls === 3n) { privKey = obj; break; }
                }
            }
            if (!privKey) throw new Error('Sign private key not found');

            // ── Step 3: Sign with CKA_ALWAYS_AUTHENTICATE (CKU=2) ──
            let mechanismBase: number;
            let dataToSign: Buffer;
            if (finalAlg.startsWith('ES')) {
                mechanismBase = 0x00001041; // CKM_ECDSA
                const hashAlg = finalAlg === 'ES384' ? 'sha384' : (finalAlg === 'ES512' ? 'sha512' : 'sha256');
                dataToSign = crypto.createHash(hashAlg).update(signingInput, 'utf-8').digest();
            } else {
                mechanismBase = 0x00000040; // CKM_SHA256_RSA_PKCS
                dataToSign = Buffer.from(signingInput, 'utf-8');
            }

            this.pkcs11Module.C_SignInit(signSess, { mechanism: mechanismBase, parameter: null }, privKey);
            console.log('[Pkcs11Service] Sign: C_SignInit OK. Attempting C_Sign (skipping CKU=2 — Certilia handles PIN internally)...');

            // NOTE: Certilia middleware may handle CKA_ALWAYS_AUTHENTICATE PIN internally.
            // CKU=2 explicit login causes CKR_USER_ANOTHER_ALREADY_LOGGED_IN in Certilia.
            // Try C_Sign directly after CKU=1.

            const sigBytes = this.pkcs11Module.C_Sign(signSess, dataToSign, Buffer.alloc(4096));
            console.log('[Pkcs11Service] ✅ Sign token signature OK!');

            // Logout Sign after signing (non-repudiation)
            try { this.pkcs11Module.C_Logout(signSess); } catch (_) { }
            try { this.pkcs11Module.C_CloseSession(signSess); } catch (_) { }
            signSess = null;

            // ── Step 4: Restore Iden session ──
            this._restoreIdenSession();

            // Format ECDSA if needed
            if (finalAlg.startsWith('ES')) {
                const coordLen = finalAlg === 'ES384' ? 48 : (finalAlg === 'ES512' ? 66 : 32);
                const expectedTotal = coordLen * 2;
                if (sigBytes.length === expectedTotal) return sigBytes;
                if (sigBytes[0] === 0x30) return this.formatEcdsaSignature(sigBytes, coordLen);
                if (sigBytes.length % 2 === 0 && sigBytes.length > expectedTotal) {
                    const halfLen = sigBytes.length / 2;
                    return Buffer.concat([sigBytes.subarray(halfLen - coordLen, halfLen), sigBytes.subarray(sigBytes.length - coordLen)]);
                }
            }
            return sigBytes;
        } catch (signErr: any) {
            if (signSess) { try { this.pkcs11Module.C_Logout(signSess); } catch (_) { } try { this.pkcs11Module.C_CloseSession(signSess); } catch (_) { } }
            this._restoreIdenSession();
            throw new Error(`Sign token sign failed: ${signErr.message}`);
        }
    }

    private _restoreIdenSession(): void {
        if (!this.savedSlot || !this.pkcs11Module) return;
        try {
            this.pkcs11Session = this.pkcs11Module.C_OpenSession(this.savedSlot, 0x04 | 0x02);
            this.pkcs11Module.C_Login(this.pkcs11Session, 1, this.savedPin);
            console.log('[Pkcs11Service] Iden session restored after Sign swap.');
        } catch (e: any) {
            if (e.message?.includes('CKR_USER_ALREADY_LOGGED_IN')) {
                console.log('[Pkcs11Service] Iden restore: already logged in.');
            } else {
                console.warn('[Pkcs11Service] Iden session restore failed:', e.message);
            }
        }
    }

    isSignTokenActive(): boolean { return this.signKeyHandle !== null; }
    getSignKeyInfo(): Pkcs11KeyInfo | null { return this.signKeyInfo; }

    private formatEcdsaSignature(derSignature: Buffer, coordLen: number): Buffer {
        let offset = 0;
        if (derSignature[offset++] !== 0x30) throw new Error('Invalid signature format');
        offset++; // length

        const extract = () => {
            if (derSignature[offset++] !== 0x02) throw new Error('Invalid format');
            const len = derSignature[offset++];
            let buf = derSignature.subarray(offset, offset + len);
            offset += len;
            if (buf.length > coordLen && buf[0] === 0x00) buf = buf.subarray(1);
            if (buf.length < coordLen) {
                const p = Buffer.alloc(coordLen);
                buf.copy(p, coordLen - buf.length);
                buf = p;
            }
            return buf;
        };

        const r = extract();
        const s = extract();
        return Buffer.concat([r, s]);
    }

    private cleanup() {
        if (this.pkcs11Session && this.pkcs11Module) {
            try {
                this.pkcs11Module.C_Logout(this.pkcs11Session);
                this.pkcs11Module.C_CloseSession(this.pkcs11Session);
            } catch (e) { }
        }
        this.pkcs11Session = null;
        this.privateKeyHandle = null;
    }

    shutdown() {
        this.cleanup();
        if (this.pkcs11Module) {
            try { this.pkcs11Module.C_Finalize(); } catch (e) { }
        }
    }
}

export const pkcs11Service = new Pkcs11Service();
