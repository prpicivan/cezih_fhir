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

// ============================================================
// Types
// ============================================================

export type SigningMode = 'mock' | 'smartcard' | 'certilia';

export interface SigningKeyPair {
    privateKey: crypto.KeyObject;
    certificate: string;      // PEM-encoded X.509 certificate
    certificateDer: Buffer;   // DER-encoded certificate (for x5c)
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
 * 
 * Rules:
 * - Object keys sorted lexicographically (Unicode code point order)
 * - No insignificant whitespace
 * - Numbers in shortest form (no trailing zeros, no leading zeros)
 * - Strings escaped per RFC 8785
 * - null, true, false as literals
 */
function jcsCanonicalizeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        // RFC 8785: Use ES6 number serialization (which is what JSON.stringify does)
        if (!isFinite(value)) throw new Error('JCS: Infinity/NaN not allowed');
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        // RFC 8785: Standard JSON string escaping
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        const items = value.map(item => jcsCanonicalizeValue(item));
        return '[' + items.join(',') + ']';
    }
    if (typeof value === 'object') {
        // Sort keys lexicographically by Unicode code points
        const keys = Object.keys(value).sort();
        const pairs = keys
            .filter(key => value[key] !== undefined) // Skip undefined values
            .map(key => JSON.stringify(key) + ':' + jcsCanonicalizeValue(value[key]));
        return '{' + pairs.join(',') + '}';
    }
    throw new Error(`JCS: Unsupported type: ${typeof value}`);
}

/**
 * Canonicalize a JavaScript object per JCS (RFC 8785).
 * Returns a deterministic JSON string suitable for signing.
 */
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

    constructor() {
        // Try to load test certificate on startup
        this.loadMockCertificate();
    }

    // --------------------------------------------------------
    // Key Source Management (pluggable)
    // --------------------------------------------------------

    /**
     * Load the mock self-signed test certificate from certs/ directory.
     * This is the default for development. Will be replaced by:
     * - AKD Smart Card (PKCS#11) when hardware arrives
     * - Certilia Remote Signing API
     */
    private loadMockCertificate(): void {
        try {
            const certPath = process.env.SIGNING_CERT_PATH || path.join(process.cwd(), 'certs', 'test-cert.pem');
            const keyPath = process.env.SIGNING_KEY_PATH || path.join(process.cwd(), 'certs', 'test-key.pem');

            if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
                console.warn('[SignatureService] No test certificates found in certs/. Signing will be unavailable.');
                console.warn('[SignatureService] Generate with: openssl req -x509 -newkey rsa:2048 -keyout certs/test-key.pem -out certs/test-cert.pem -days 365 -nodes -subj "/CN=CEZIH Test Signer/C=HR"');
                return;
            }

            const certPem = fs.readFileSync(certPath, 'utf-8');
            const keyPem = fs.readFileSync(keyPath, 'utf-8');

            // Extract DER from PEM for x5c header
            const certBase64 = certPem
                .replace(/-----BEGIN CERTIFICATE-----/g, '')
                .replace(/-----END CERTIFICATE-----/g, '')
                .replace(/\s/g, '');
            const certDer = Buffer.from(certBase64, 'base64');

            this.keyPair = {
                privateKey: crypto.createPrivateKey(keyPem),
                certificate: certPem,
                certificateDer: certDer,
            };

            this.signingMode = 'mock';
            console.log('[SignatureService] Mock certificate loaded from certs/');
        } catch (error: any) {
            console.error('[SignatureService] Failed to load mock certificate:', error.message);
        }
    }

    /**
     * Check if signing is available.
     */
    isAvailable(): boolean {
        return this.keyPair !== null;
    }

    /**
     * Get the current signing mode.
     */
    getMode(): SigningMode {
        return this.signingMode;
    }

    // --------------------------------------------------------
    // Core JWS Signing (works with any key source)
    // --------------------------------------------------------

    /**
     * Sign a FHIR Bundle per CEZIH specification.
     * 
     * Process:
     * 1. Extract MessageHeader.author reference (for DIGSIG-1)
     * 2. Prepare Bundle with empty signature.data placeholder
     * 3. JCS-canonicalize the Bundle
     * 4. Create JWS with JOSE header (alg, jwk, x5c)
     * 5. Double-Base64 encode and attach to Bundle.signature.data
     * 
     * @param bundle - The FHIR Bundle to sign (type: 'message' or 'document')
     * @param signerRef - Reference to the signer (e.g., "Practitioner/123")
     *                    Must match MessageHeader.author for DIGSIG-1
     * @returns The signed Bundle with signature attached
     */
    signBundle(bundle: any, signerRef?: string): SignedBundle {
        if (!this.keyPair) {
            throw new Error(
                'Signing not available. No certificate loaded. ' +
                'Generate test cert with: openssl req -x509 -newkey rsa:2048 -keyout certs/test-key.pem -out certs/test-cert.pem -days 365 -nodes'
            );
        }

        // 1. Determine the signer reference for DIGSIG-1
        const authorRef = signerRef || this.extractAuthorFromBundle(bundle);

        // 2. Create the Bundle with signature placeholder
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
                data: '',  // Empty for JCS canonicalization
            }],
        };

        // 3. JCS-canonicalize the Bundle (with empty signature.data)
        const canonicalized = jcsCanonialize(bundleWithSigPlaceholder);
        const payloadB64url = base64urlEncode(canonicalized);

        // 4. Build JOSE header
        const publicKey = crypto.createPublicKey(this.keyPair.privateKey);
        const jwk = publicKey.export({ format: 'jwk' });

        const header = {
            alg: 'RS256',
            jwk: {
                kty: jwk.kty,
                n: jwk.n,
                e: jwk.e,
            },
            x5c: [this.keyPair.certificateDer.toString('base64')],
        };
        const headerB64url = base64urlEncode(JSON.stringify(header));

        // 5. Create JWS signature
        const signingInput = `${headerB64url}.${payloadB64url}`;
        const sign = crypto.createSign('SHA256');
        sign.update(signingInput);
        sign.end();
        const signatureBytes = sign.sign(this.keyPair.privateKey);
        const signatureB64url = base64urlEncode(signatureBytes);

        // 6. Assemble compact JWS
        const jwsCompact = `${headerB64url}.${payloadB64url}.${signatureB64url}`;

        // 7. Double-Base64: encode the entire JWS string as Base64 for signature.data
        const doubleBase64 = base64Encode(jwsCompact);

        // 8. Set signature.data in the Bundle
        const signedBundle = {
            ...bundleWithSigPlaceholder,
            signature: [{
                ...bundleWithSigPlaceholder.signature[0],
                data: doubleBase64,
            }],
        };

        console.log(`[SignatureService] Bundle signed (${this.signingMode} mode, RS256, DIGSIG-1: ${authorRef})`);

        return {
            bundle: signedBundle,
            jwsCompact,
        };
    }

    /**
     * Extract the author reference from a Bundle's MessageHeader.
     * Used to enforce DIGSIG-1: signature.who must match MessageHeader.author.
     */
    private extractAuthorFromBundle(bundle: any): string {
        if (!bundle.entry || !Array.isArray(bundle.entry)) {
            return 'Practitioner/unknown';
        }

        // Find the MessageHeader entry
        const messageHeaderEntry = bundle.entry.find(
            (e: any) => e.resource?.resourceType === 'MessageHeader'
        );

        if (messageHeaderEntry?.resource?.author?.reference) {
            return messageHeaderEntry.resource.author.reference;
        }

        // Fallback: try sender
        if (messageHeaderEntry?.resource?.sender?.reference) {
            return messageHeaderEntry.resource.sender.reference;
        }

        // Fallback: try to find a Practitioner in the bundle
        const practitionerEntry = bundle.entry.find(
            (e: any) => e.resource?.resourceType === 'Practitioner'
        );
        if (practitionerEntry?.fullUrl) {
            return practitionerEntry.fullUrl;
        }

        return 'Practitioner/unknown';
    }

    // --------------------------------------------------------
    // Verification (for testing/debugging)
    // --------------------------------------------------------

    /**
     * Verify a signed Bundle's JWS signature.
     * Useful for testing that our signed bundles are valid.
     */
    verifySignedBundle(signedBundle: any): { valid: boolean; error?: string } {
        try {
            if (!signedBundle.signature?.[0]?.data) {
                return { valid: false, error: 'No signature.data found in Bundle' };
            }

            // 1. Decode double-Base64 to get JWS compact
            const jwsCompact = Buffer.from(signedBundle.signature[0].data, 'base64').toString('utf-8');
            const [headerB64, payloadB64, signatureB64] = jwsCompact.split('.');

            if (!headerB64 || !payloadB64 || !signatureB64) {
                return { valid: false, error: 'Invalid JWS compact format' };
            }

            // 2. Parse header to get public key
            const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));

            // 3. Reconstruct public key from JWK
            const publicKey = crypto.createPublicKey({
                key: { ...header.jwk, kty: 'RSA' },
                format: 'jwk',
            });

            // 4. Verify signature
            const verify = crypto.createVerify('SHA256');
            verify.update(`${headerB64}.${payloadB64}`);
            verify.end();

            // Convert base64url signature back to buffer
            const sigBuffer = Buffer.from(signatureB64, 'base64url');
            const valid = verify.verify(publicKey, sigBuffer);

            // 5. Verify DIGSIG-1: signature.who matches MessageHeader.author
            const authorRef = this.extractAuthorFromBundle(signedBundle);
            const sigWho = signedBundle.signature?.[0]?.who?.reference;
            if (sigWho && sigWho !== authorRef) {
                return { valid: false, error: `DIGSIG-1 violation: signature.who (${sigWho}) != MessageHeader.author (${authorRef})` };
            }

            return { valid, error: valid ? undefined : 'Signature verification failed' };
        } catch (error: any) {
            return { valid: false, error: error.message };
        }
    }

    // --------------------------------------------------------
    // Future: Smart Card (AKD) — PKCS#11
    // --------------------------------------------------------
    // async loadSmartCardKey(): Promise<void> {
    //     // const pkcs11 = require('pkcs11js');
    //     // const mod = new pkcs11.PKCS11();
    //     // mod.load('/path/to/pkcs11/module.so');
    //     // ... open session, find key, read cert ...
    //     // this.keyPair = { privateKey, certificate, certificateDer };
    //     // this.signingMode = 'smartcard';
    // }

    // --------------------------------------------------------
    // Future: Certilia Remote Signing
    // --------------------------------------------------------
    // async signWithCertilia(bundle: any, userOib: string): Promise<SignedBundle> {
    //     // 1. JCS-canonicalize the bundle
    //     // 2. POST to CEZIH remote signing API with document array
    //     // 3. Wait for user approval via Certilia push notification
    //     // 4. GET signed documents from CEZIH
    //     // 5. Extract JWS, attach to bundle
    // }
}

export const signatureService = new SignatureService();
