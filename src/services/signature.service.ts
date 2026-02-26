import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { config } from '../config';
import { pkcs11Service } from './pkcs11.service';

// ============================================================
// Types
// ============================================================

export type SigningMode = 'mock' | 'smartcard' | 'certilia' | 'bridge';

export interface SigningKeyPair {
    privateKey: crypto.KeyObject | null; // null when using smart card/bridge
    certificate: string;      // PEM-encoded X.509 certificate
    certificateDer: Buffer;   // DER-encoded certificate (for x5c)
    publicKey?: crypto.KeyObject; // For verifying
}

export interface SignedBundle {
    bundle: any;               // The Bundle with signature attached
    jwsCompact: string;        // The JWS compact serialization (for debugging)
}

// ============================================================
// Helper Functions (JCS & Base64URL)
// ============================================================

function jcsCanonicalizeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!isFinite(value)) throw new Error('JCS: Infinity/NaN not allowed');
        return JSON.stringify(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
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

function base64urlEncode(data: string | Buffer): string {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    private bridgeAlgo: string = 'RS256';

    constructor() {
        this.initializeSigning();
    }

    private async initializeSigning() {
        const mode = (process.env.SIGNING_MODE as SigningMode) || 'mock';
        this.signingMode = mode;

        if (mode === 'smartcard') {
            const success = pkcs11Service.initialize();
            if (success && pkcs11Service.isActive()) {
                const info = pkcs11Service.getKeyInfo()!;
                this.keyPair = {
                    privateKey: null,
                    certificate: info.certificate,
                    certificateDer: info.certificateDer,
                    publicKey: info.publicKey
                };
            } else {
                console.warn('[SignatureService] Smart card mode requested but hardware not found. Falling back to mock.');
                this.loadMockCertificate();
            }
        } else if (mode === 'bridge') {
            await this.initializeBridge();
        } else {
            this.loadMockCertificate();
        }
    }

    private async initializeBridge() {
        try {
            const { bridgeUrl, bridgeToken } = config.signing;
            console.log(`[SignatureService] Connecting to Signing Bridge at ${bridgeUrl}`);

            const res = await axios.get(`${bridgeUrl}/certificate`, {
                headers: { 'Authorization': `Bearer ${bridgeToken}` }
            });

            if (res.data.certificate) {
                const certPem = res.data.certificate;
                const x509 = new crypto.X509Certificate(certPem);
                this.keyPair = {
                    privateKey: null,
                    certificate: certPem,
                    certificateDer: x509.raw,
                    publicKey: x509.publicKey
                };
                this.bridgeAlgo = res.data.algo || 'RS256';
                console.log(`[SignatureService] ✅ Connected to Bridge. Remote Cert: ${x509.subject}`);
            }
        } catch (err: any) {
            console.error('[SignatureService] Failed to connect to Signing Bridge:', err.message);
            console.warn('[SignatureService] Falling back to mock certificate.');
            this.loadMockCertificate();
        }
    }

    private loadMockCertificate(): void {
        try {
            const certPath = config.signing.certPath || path.join(process.cwd(), 'certs', 'test-cert.pem');
            const keyPath = config.signing.keyPath || path.join(process.cwd(), 'certs', 'test-key.pem');

            if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
                console.warn('[SignatureService] No mock certificates found. Signing will be unavailable.');
                return;
            }

            const certPem = fs.readFileSync(certPath, 'utf-8');
            const keyPem = fs.readFileSync(keyPath, 'utf-8');
            const x509 = new crypto.X509Certificate(certPem);

            this.keyPair = {
                privateKey: crypto.createPrivateKey(keyPem),
                certificate: certPem,
                certificateDer: x509.raw,
                publicKey: x509.publicKey,
            };
            this.signingMode = 'mock';
            console.log('[SignatureService] Mock certificate loaded.');
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

    private async performSignature(signingInput: string, finalAlg: string): Promise<Buffer> {
        if (this.signingMode === 'smartcard') {
            return pkcs11Service.sign(signingInput, finalAlg);
        }

        if (this.signingMode === 'bridge') {
            const { bridgeUrl, bridgeToken } = config.signing;
            const res = await axios.post(`${bridgeUrl}/sign`, {
                payload: signingInput,
                algorithm: finalAlg
            }, {
                headers: { 'Authorization': `Bearer ${bridgeToken}` }
            });

            if (res.data.signature) {
                return Buffer.from(res.data.signature, 'base64');
            }
            throw new Error('Bridge did not return a signature');
        }

        if (this.keyPair && this.keyPair.privateKey) {
            const sign = crypto.createSign('SHA256');
            sign.update(signingInput);
            sign.end();
            const signatureBytes = sign.sign(this.keyPair.privateKey);

            if (this.keyPair.publicKey?.asymmetricKeyType === 'ec') {
                return this.formatEcdsaSignatureForJws(signatureBytes);
            }
            return signatureBytes;
        }

        throw new Error('No valid signing mechanism configured');
    }

    private formatEcdsaSignatureForJws(derSignature: Buffer, coordLen: number = 32): Buffer {
        let offset = 0;
        if (derSignature[offset++] !== 0x30) throw new Error('Invalid signature format');
        offset++; // len
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
        return Buffer.concat([extract(), extract()]);
    }

    async signBundle(bundle: any, signerRef?: string): Promise<SignedBundle> {
        if (!this.keyPair) throw new Error('Signing not available.');

        const authorRef = signerRef || this.extractAuthorFromBundle(bundle);
        const publicKey = this.keyPair.publicKey!;
        const jwk = publicKey.export({ format: 'jwk' });

        let finalAlg = (jwk.kty === 'EC')
            ? (jwk.crv === 'P-384' ? 'ES384' : (jwk.crv === 'P-521' ? 'ES512' : 'ES256'))
            : 'RS256';

        // Placeholder for JCS canonicalization
        const bundleWithSigPlaceholder = {
            ...bundle,
            signature: [{
                type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1', display: "Author's Signature" }],
                when: new Date().toISOString(),
                who: { reference: authorRef },
                sigFormat: 'application/jose',
                data: '',
            }],
        };

        const canonicalized = jcsCanonialize(bundleWithSigPlaceholder);
        const payloadB64url = base64urlEncode(canonicalized);

        const header: any = {
            alg: finalAlg,
            jwk: { kty: jwk.kty },
            x5c: [this.keyPair.certificateDer.toString('base64')],
        };

        if (jwk.kty === 'EC') {
            header.jwk.crv = jwk.crv;
            header.jwk.x = jwk.x;
            header.jwk.y = jwk.y;
        } else {
            header.jwk.n = jwk.n;
            header.jwk.e = jwk.e;
        }

        const headerB64url = base64urlEncode(JSON.stringify(header));
        const signingInput = `${headerB64url}.${payloadB64url}`;

        const signatureBytes = await this.performSignature(signingInput, finalAlg);
        const signatureB64url = base64urlEncode(signatureBytes);

        const jwsCompact = `${headerB64url}.${payloadB64url}.${signatureB64url}`;

        return {
            bundle: {
                ...bundleWithSigPlaceholder,
                signature: [{ ...bundleWithSigPlaceholder.signature[0], data: base64Encode(jwsCompact) }]
            },
            jwsCompact
        };
    }

    private extractAuthorFromBundle(bundle: any): string {
        const mh = bundle.entry?.find((e: any) => e.resource?.resourceType === 'MessageHeader')?.resource;
        return mh?.author?.reference || mh?.sender?.reference || 'Practitioner/unknown';
    }

    async verifySignedBundle(signedBundle: any): Promise<{ valid: boolean; error?: string }> {
        try {
            const jwsCompact = Buffer.from(signedBundle.signature[0].data, 'base64').toString('utf-8');
            const [headerB64] = jwsCompact.split('.');
            const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));

            const jose = require('jose');
            const publicKey = await jose.importJWK(header.jwk, header.alg);
            await jose.compactVerify(jwsCompact, publicKey);

            return { valid: true };
        } catch (error: any) {
            return { valid: false, error: error.message };
        }
    }
}

export const signatureService = new SignatureService();
