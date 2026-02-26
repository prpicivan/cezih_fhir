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
    private pkcs11Session: Buffer | null = null;
    private privateKeyHandle: Buffer | null = null;
    private keyInfo: Pkcs11KeyInfo | null = null;

    isActive(): boolean {
        return this.privateKeyHandle !== null;
    }

    getKeyInfo(): Pkcs11KeyInfo | null {
        return this.keyInfo;
    }

    /**
     * Initialize the PKCS#11 module and login to the token.
     */
    initialize(): boolean {
        if (!pkcs11js) return false;

        const PKCS11_MODULE_PATH = process.env.PKCS11_MODULE_PATH || '/Applications/CertiliaMiddleware.app/Contents/pkcs11/libCertiliaPkcs11.dylib';
        const idenPin = process.env.IDEN_PIN;

        if (!fs.existsSync(PKCS11_MODULE_PATH)) {
            console.log(`[Pkcs11Service] Smart card middleware not found at ${PKCS11_MODULE_PATH}`);
            return false;
        }

        if (!idenPin) {
            console.log('[Pkcs11Service] IDEN_PIN not set in environment.');
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

            for (const slot of slots) {
                const tokenInfo = this.pkcs11Module.C_GetTokenInfo(slot);
                if (tokenInfo.label.trim().includes('Iden')) {
                    targetSlot = slot;
                    break;
                }
            }

            if (!targetSlot) {
                console.warn('[Pkcs11Service] Smart card Iden token not found.');
                return false;
            }

            this.pkcs11Session = this.pkcs11Module.C_OpenSession(targetSlot, 0x04 | 0x02); // CKF_SERIAL_SESSION | CKF_RW_SESSION
            this.pkcs11Module.C_Login(this.pkcs11Session, 1, idenPin); // CKU_USER = 1

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
                throw new Error('Required objects (private key/certificate) not found on card');
            }

            this.privateKeyHandle = privKeyHandle;

            // Get Key Type (EC or RSA)
            const keyTypeAttrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, privKeyHandle, [{ type: 0x00000100 }]); // CKA_KEY_TYPE
            const ckaKeyType = keyTypeAttrs[0]?.value?.[0];
            const algo = (ckaKeyType === 3) ? 'ES256' : 'RS256';

            // Extract Certificate
            const certAttrs = this.pkcs11Module.C_GetAttributeValue(this.pkcs11Session, certHandle, [{ type: 0x00000011, value: Buffer.alloc(4096) }]); // CKA_VALUE
            const certDer = certAttrs[0].value;
            const x509 = new crypto.X509Certificate(certDer);

            this.keyInfo = {
                certificate: x509.toString(),
                certificateDer: certDer,
                publicKey: x509.publicKey,
                algo: algo as any,
            };

            console.log(`[Pkcs11Service] PKCS#11 initialized (${algo})`);
            return true;
        } catch (error: any) {
            console.error('[Pkcs11Service] Initialization failed:', error.message);
            this.cleanup();
            return false;
        }
    }

    /**
     * Perform hardware signature of the input data.
     */
    sign(signingInput: string, finalAlg: string): Buffer {
        if (!this.pkcs11Session || !this.privateKeyHandle) {
            throw new Error('PKCS#11 session not initialized');
        }

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
