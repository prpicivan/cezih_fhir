/**
 * Digital Signature Service — Mock-First Implementation
 * 
 * Implements JWS (RFC 7515) signing with JCS (RFC 8785) canonicalization
 * as required by CEZIH specification for all FHIR messages.
 * 
 * Current: Uses self-signed test certificate from certs/ directory.
 * Future:  Swap to AKD Smart Card (PKCS#11) or Certilia Remote Signing.
 * 
 * DIGSIG-1 constraint: Bundle.signature.who MUST match MessageHeader.author
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Import pkcs11js for smart card support
let pkcs11js: any = null;
try {
    pkcs11js = require('pkcs11js');
} catch (e) {
    console.warn('[SignatureService] pkcs11js not installed. Smart card signing will be unavailable.');
}

// ============================================================
// Types
// ============================================================

export type SigningMode = 'mock' | 'smartcard' | 'certilia';

export interface SigningKeyPair {
    privateKey: crypto.KeyObject | null; // null when using smart card (key never leaves card)
    certificate: string;      // PEM-encoded X.509 certificate
    certificateDer: Buffer;   // DER-encoded certificate (for x5c)
    publicKey?: crypto.KeyObject; // For verifying
}

export interface SignedBundle {
    bundle: any;               // The Bundle with signature attached
    jwsCompact: string;        // The JWS compact serialization (for debugging)
}

// ============================================================
// JCS (RFC 8785) Canonicalization
// ============================================================

/**
 * Implements JSON Canonicalization Scheme (RFC 8785).
 * Produces deterministic JSON output for consistent signing.
 */
function jcsCanonicalizeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!isFinite(value)) throw new Error('JCS: Infinity/NaN not allowed');
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        const items = value.map(item => jcsCanonicalizeValue(item));
        return '[' + items.join(',') + ']';
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const pairs = keys
            .filter(key => value[key] !== undefined)
            .map(key => JSON.stringify(key) + ':' + jcsCanonicalizeValue(value[key]));
        return '{' + pairs.join(',') + '}';
    }
    throw new Error(`JCS: Unsupported type: ${typeof value}`);
}

export function jcsCanonialize(obj: any): string {
    return jcsCanonicalizeValue(obj);
}

// ============================================================
// Base64URL encoding (RFC 4648 §5)
// ============================================================

function base64urlEncode(data: string | Buffer): string {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64Encode(data: string | Buffer): string {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return buf.toString('base64');
}

// ============================================================
// Signature Service
// ============================================================

class SignatureService {
    private signingMode: SigningMode = 'mock';
    private keyPair: SigningKeyPair | null = null;

    // PKCS#11 State
    private pkcs11Module: any = null;
    private pkcs11Session: Buffer | null = null;
    private smartCardPrivateKeyHandle: Buffer | null = null;
    private smartCardAlgo: 'ES256' | 'ES384' | 'ES512' | 'RS256' = 'RS256';

    constructor() {
        // Try to load smart card first, fallback to mock
        this.initializeSigning();
    }

    private async initializeSigning() {
        // Attempt Smart Card load first
        const scLoaded = this.loadSmartCardKey();

        if (!scLoaded) {
            // Fallback to mock
            this.loadMockCertificate();
        }
    }

    // --------------------------------------------------------
    // Key Source Management
    // --------------------------------------------------------

    /**
     * Attempt to initialize the AKD Certilia Smart Card via PKCS#11.
     * Returns true if successful, false otherwise.
     */
    private loadSmartCardKey(): boolean {
        if (!pkcs11js) return false;

        const PKCS11_MODULE_PATH = process.env.PKCS11_MODULE_PATH || '/Applications/CertiliaMiddleware.app/Contents/pkcs11/libCertiliaPkcs11.dylib';
        const idenPin = process.env.IDEN_PIN; // We use the Iden slot for the test card

        if (!fs.existsSync(PKCS11_MODULE_PATH)) {
            console.log(`[SignatureService] Smart card middleware not found at ${PKCS11_MODULE_PATH}`);
            return false;
        }

        if (!idenPin) {
            console.log('[SignatureService] IDEN_PIN not set in environment. Skipping smart card initialization.');
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
            let targetSlot = null;

            // Find the "Iden" slot (test card Sign slot lacks private key exposure)
            for (const slot of slots) {
                const tokenInfo = this.pkcs11Module.C_GetTokenInfo(slot);
                if (tokenInfo.label.trim().includes('Iden')) {
                    targetSlot = slot;
                    break;
                }
            }

            if (!targetSlot) {
                console.warn('[SignatureService] Smart card Iden token not found. Is the card inserted?');
                return false;
            }

            // Open session and login
            this.pkcs11Session = this.pkcs11Module.C_OpenSession(targetSlot, 0x04 | 0x02); // CKF_SERIAL_SESSION | CKF_RW_SESSION
            this.pkcs11Module.C_Login(this.pkcs11Session, 1, idenPin); // CKU_USER = 1

            // Fetch ALL objects to avoid pkcs11js CKA_CLASS struct padding issues on arm64
            this.pkcs11Module.C_FindObjectsInit(this.pkcs11Session, []);
            let allObjs: Buffer[] = [];
            let obj;
            while ((obj = this.pkcs11Module.C_FindObjects(this.pkcs11Session, 1)).length > 0) {
                allObjs.push(obj[0]);
            }
            this.pkcs11Module.C_FindObjectsFinal(this.pkcs11Session);

            let privKeyHandle: Buffer | null = null;
            let certHandle: Buffer | null = null;

            // Iterate and identify objects manually
            for (const o of allObjs) {
                const attrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, o, [
                    { type: 0x00000000 } // CKA_CLASS
                ]);
                const cls = attrs[0]?.value?.readUInt32LE?.(0) ?? attrs[0]?.value?.[0]; // 1=Cert, 3=PrivKey

                if (cls === 3 || cls === 3n) { // CKO_PRIVATE_KEY
                    privKeyHandle = o;
                } else if (cls === 1 || cls === 1n) { // CKO_CERTIFICATE
                    certHandle = o;
                }
            }

            if (!privKeyHandle) {
                throw new Error('No private key found on Iden slot');
            }
            this.smartCardPrivateKeyHandle = privKeyHandle;

            // Determine if RSA or ECDSA (AKD Certilia uses ECDSA on gen2 cards)
            const keyTypeAttrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, this.smartCardPrivateKeyHandle, [
                { type: 0x00000100 } // CKA_KEY_TYPE
            ]);
            const ckaKeyType = keyTypeAttrs[0]?.value?.[0];
            this.smartCardAlgo = (ckaKeyType === 3) ? 'ES256' : 'RS256'; // 3 = CKK_EC natively, ES256 for JWS

            if (!certHandle) {
                throw new Error('No certificate found on Iden slot');
            }

            // Extract DER certificate using a pre-allocated buffer
            const certAttrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, certHandle, [
                { type: 0x00000011, value: Buffer.alloc(4096) } // CKA_VALUE
            ]);

            const certDer = certAttrs[0].value;
            if (!certDer || certDer.length === 0) throw new Error('Extracted certificate is empty');

            const x509 = new crypto.X509Certificate(certDer);
            const certPem = x509.toString();

            this.keyPair = {
                privateKey: null, // Signals we use the smart card handle, not memory
                certificate: certPem,
                certificateDer: certDer,
                publicKey: x509.publicKey,
            };

            this.signingMode = 'smartcard';
            console.log(`[SignatureService] ✅ Smart Card PKCS#11 initialized successfully.`);
            return true;

        } catch (error: any) {
            console.error('[SignatureService] Smart Card initialization failed:', error.message);
            if (this.pkcs11Session && this.pkcs11Module) {
                try {
                    this.pkcs11Module.C_Logout(this.pkcs11Session);
                    this.pkcs11Module.C_CloseSession(this.pkcs11Session);
                } catch (e) { }
            }
            return false;
        }
    }

    /**
     * Load the mock self-signed test certificate from certs/ directory.
     */
    private loadMockCertificate(): void {
        try {
            const certPath = process.env.SIGNING_CERT_PATH || path.join(process.cwd(), 'certs', 'test-cert.pem');
            const keyPath = process.env.SIGNING_KEY_PATH || path.join(process.cwd(), 'certs', 'test-key.pem');

            if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
                console.warn('[SignatureService] No test certificates found in certs/. Signing will be unavailable.');
                return;
            }

            const certPem = fs.readFileSync(certPath, 'utf-8');
            const keyPem = fs.readFileSync(keyPath, 'utf-8');

            const certBase64 = certPem
                .replace(/-----BEGIN CERTIFICATE-----/g, '')
                .replace(/-----END CERTIFICATE-----/g, '')
                .replace(/\s/g, '');
            const certDer = Buffer.from(certBase64, 'base64');
            const x509 = new crypto.X509Certificate(certDer);

            this.keyPair = {
                privateKey: crypto.createPrivateKey(keyPem),
                certificate: certPem,
                certificateDer: certDer,
                publicKey: x509.publicKey,
            };

            this.signingMode = 'mock';
            console.log('[SignatureService] Mock certificate loaded from certs/');
        } catch (error: any) {
            console.error('[SignatureService] Failed to load mock certificate:', error.message);
        }
    }

    isAvailable(): boolean {
        return this.keyPair !== null;
    }

    getMode(): SigningMode {
        return this.signingMode;
    }

    // --------------------------------------------------------
    // Core JWS Signing
    // --------------------------------------------------------

    /**
     * Convert an ASN.1 DER ECDSA signature (from PKCS#11 or standard node crypto)
     * into the raw R|S format required by JWS (RFC 7515).
     */
    private formatEcdsaSignatureForJws(derSignature: Buffer, coordLen: number = 32): Buffer {
        // Simple ASN.1 DER unwrap for ECDSA (SEQUENCE of two INTEGERs R and S)
        let offset = 0;
        if (derSignature[offset++] !== 0x30) throw new Error('Invalid signature format: not a sequence');
        const seqLen = derSignature[offset++];

        if (derSignature[offset++] !== 0x02) throw new Error('Invalid signature format: R is not an integer');
        let rLen = derSignature[offset++];
        let rStart = offset;
        offset += rLen;

        if (derSignature[offset++] !== 0x02) throw new Error('Invalid signature format: S is not an integer');
        let sLen = derSignature[offset++];
        let sStart = offset;

        // Extracts exactly coordLen bytes from the ASN1. Integer
        const extractCoord = (start: number, len: number) => {
            let buf = derSignature.subarray(start, start + len);
            if (buf.length > coordLen && buf[0] === 0x00) buf = buf.subarray(1); // Strip padding
            if (buf.length < coordLen) {
                const p = Buffer.alloc(coordLen);
                buf.copy(p, coordLen - buf.length);
                buf = p;
            }
            return buf;
        };

        const rBuf = extractCoord(rStart, rLen);
        const sBuf = extractCoord(sStart, sLen);

        return Buffer.concat([rBuf, sBuf]);
    }

    /**
     * Perform the actual signing operation, dynamically choosing between Mock or Smart Card.
     */
    private performCryptographicSignature(signingInput: string, finalAlg: string): Buffer {
        if (this.signingMode === 'smartcard' && this.pkcs11Session && this.smartCardPrivateKeyHandle) {
            // Hardware Signing via PKCS#11

            let mechanismBase: number;
            let dataToSign: Buffer;

            if (finalAlg.startsWith('ES')) {
                // For ECDSA, most cards require CKM_ECDSA (0x00001041) which takes the raw Hash
                mechanismBase = 0x00001041;
                // Use correct hash based on Algorithm length
                const hashAlg = finalAlg === 'ES384' ? 'sha384' : (finalAlg === 'ES512' ? 'sha512' : 'sha256');
                dataToSign = crypto.createHash(hashAlg).update(signingInput, 'utf-8').digest();
            } else {
                // For RSA, CKM_SHA256_RSA_PKCS (0x00000040) handles the hashing internally
                mechanismBase = 0x00000040;
                dataToSign = Buffer.from(signingInput, 'utf-8');
            }

            const signMechParams = {
                mechanism: mechanismBase,
                parameter: null
            };

            this.pkcs11Module.C_SignInit(this.pkcs11Session, signMechParams, this.smartCardPrivateKeyHandle);
            const signatureBytes = this.pkcs11Module.C_Sign(this.pkcs11Session, dataToSign, Buffer.alloc(4096));

            // Smart Card ECDSA PKCS#11 generally returns raw R|S directly, but sometimes ASN.1
            if (finalAlg.startsWith('ES')) {
                const coordLen = finalAlg === 'ES384' ? 48 : (finalAlg === 'ES512' ? 66 : 32);
                const expectedTotal = coordLen * 2;

                if (signatureBytes.length === expectedTotal) {
                    return signatureBytes; // Already correct
                }
                if (signatureBytes[0] === 0x30) {
                    return this.formatEcdsaSignatureForJws(signatureBytes, coordLen); // ASN.1 DER wrapped
                }

                // AKD Certilia generates padded signatures (e.g. 96 bytes total for P-256, heavily padded)
                if (signatureBytes.length % 2 === 0 && signatureBytes.length > expectedTotal) {
                    // Split in half
                    const halfLen = signatureBytes.length / 2;
                    const rPadding = signatureBytes.subarray(0, halfLen);
                    const sPadding = signatureBytes.subarray(halfLen);

                    // We only need the last coordLen bytes of each
                    const r = rPadding.subarray(halfLen - coordLen);
                    const s = sPadding.subarray(halfLen - coordLen);

                    return Buffer.concat([r, s]);
                }
            }
            return signatureBytes;

        } else if (this.keyPair && this.keyPair.privateKey) {
            // Software Signing via standard Node.js crypto
            const sign = crypto.createSign('SHA256');
            sign.update(signingInput);
            sign.end();
            const signatureBytes = sign.sign(this.keyPair.privateKey);

            // If we're mocking an EC key, Node.js outputs DER which must be converted for JWS
            if (this.keyPair.publicKey?.asymmetricKeyType === 'ec') {
                return this.formatEcdsaSignatureForJws(signatureBytes);
            }
            return signatureBytes;
        }

        throw new Error('No valid signing mechanism configured');
    }

    signBundle(bundle: any, signerRef?: string): SignedBundle {
        if (!this.keyPair) {
            throw new Error('Signing not available. No certificate loaded.');
        }

        const authorRef = signerRef || this.extractAuthorFromBundle(bundle);
        const alg = this.signingMode === 'smartcard' ? this.smartCardAlgo : (this.keyPair.publicKey?.asymmetricKeyType === 'ec' ? 'ES256' : 'RS256');

        const bundleWithSigPlaceholder = {
            ...bundle,
            signature: [{
                type: [{
                    system: 'urn:iso-astm:E1762-95:2013',
                    code: '1.2.840.10065.1.12.1.1',
                    display: "Author's Signature",
                }],
                when: new Date().toISOString(),
                who: {
                    reference: authorRef,
                },
                sigFormat: 'application/jose',
                data: '',
            }],
        };

        const canonicalized = jcsCanonialize(bundleWithSigPlaceholder);
        const payloadB64url = base64urlEncode(canonicalized);

        const publicKey = this.keyPair.publicKey;
        if (!publicKey) throw new Error("Public key not available for JWK generation");
        const jwk = publicKey.export({ format: 'jwk' });

        // Dynamically determine the JWS algorithm based on the EC curve or RSA
        let finalAlg = alg;
        if (jwk.kty === 'EC') {
            if (jwk.crv === 'P-256') finalAlg = 'ES256';
            else if (jwk.crv === 'P-384') finalAlg = 'ES384';
            else if (jwk.crv === 'P-521') finalAlg = 'ES512';
            else finalAlg = 'ES256'; // Fallback
        }

        const header: any = {
            alg: finalAlg,
            jwk: {
                kty: jwk.kty
            },
            x5c: [this.keyPair.certificateDer.toString('base64')],
        };

        if (jwk.kty === 'EC') {
            header.jwk.crv = jwk.crv || 'P-256';
            // Node JWK export sometimes leaves standard base64 strings or adds padding. MUST be base64url for JWS
            header.jwk.x = jwk.x ? base64urlEncode(Buffer.from(jwk.x, 'base64url')) : undefined;
            header.jwk.y = jwk.y ? base64urlEncode(Buffer.from(jwk.y, 'base64url')) : undefined;
        } else {
            header.jwk.n = jwk.n;
            header.jwk.e = jwk.e;
        }

        // Clean out private key data if it leaked into jwk (d, dp, dq, p, q, qi)
        delete header.jwk.d; delete header.jwk.dp; delete header.jwk.dq;
        delete header.jwk.p; delete header.jwk.q; delete header.jwk.qi;

        const headerB64url = base64urlEncode(JSON.stringify(header));
        const signingInput = `${headerB64url}.${payloadB64url}`;

        const signatureBytes = this.performCryptographicSignature(signingInput, finalAlg);
        const signatureB64url = base64urlEncode(signatureBytes);

        const jwsCompact = `${headerB64url}.${payloadB64url}.${signatureB64url}`;
        const doubleBase64 = base64Encode(jwsCompact);

        const signedBundle = {
            ...bundleWithSigPlaceholder,
            signature: [{
                ...bundleWithSigPlaceholder.signature[0],
                data: doubleBase64,
            }],
        };

        console.log(`[SignatureService] Bundle signed (${this.signingMode} mode, ${alg}, DIGSIG-1: ${authorRef})`);

        return {
            bundle: signedBundle,
            jwsCompact,
        };
    }

    private extractAuthorFromBundle(bundle: any): string {
        if (!bundle.entry || !Array.isArray(bundle.entry)) {
            return 'Practitioner/unknown';
        }

        const messageHeaderEntry = bundle.entry.find(
            (e: any) => e.resource?.resourceType === 'MessageHeader'
        );

        if (messageHeaderEntry?.resource?.author?.reference) {
            return messageHeaderEntry.resource.author.reference;
        }

        if (messageHeaderEntry?.resource?.sender?.reference) {
            return messageHeaderEntry.resource.sender.reference;
        }

        const practitionerEntry = bundle.entry.find(
            (e: any) => e.resource?.resourceType === 'Practitioner'
        );
        if (practitionerEntry?.fullUrl) {
            return practitionerEntry.fullUrl;
        }

        return 'Practitioner/unknown';
    }

    async verifySignedBundle(signedBundle: any): Promise<{ valid: boolean; error?: string }> {
        try {
            if (!signedBundle.signature?.[0]?.data) {
                return { valid: false, error: 'No signature.data found in Bundle' };
            }

            const jwsCompact = Buffer.from(signedBundle.signature[0].data, 'base64').toString('utf-8');
            const [headerB64] = jwsCompact.split('.');

            if (!headerB64) {
                return { valid: false, error: 'Invalid JWS compact format' };
            }

            const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));

            // Construct robust JWK public key map
            const jwkKey: any = { ...header.jwk, alg: header.alg };
            if (header.alg?.startsWith('ES')) {
                jwkKey.kty = 'EC';
            } else {
                jwkKey.kty = 'RSA';
            }

            // We must import the Jose library dynamically since it's only needed for verification
            const jose = require('jose');
            const publicKey = await jose.importJWK(jwkKey, header.alg);

            // Verify JWS signature natively via jose
            await jose.compactVerify(jwsCompact, publicKey);

            // Verify DIGSIG-1: signature.who matches MessageHeader.author
            const authorRef = this.extractAuthorFromBundle(signedBundle);
            const sigWho = signedBundle.signature?.[0]?.who?.reference;
            if (sigWho && sigWho !== authorRef) {
                return { valid: false, error: `DIGSIG-1 violation: signature.who (${sigWho}) != MessageHeader.author (${authorRef})` };
            }

            return { valid: true };
        } catch (error: any) {
            return { valid: false, error: error.message };
        }
    }
}

export const signatureService = new SignatureService();
