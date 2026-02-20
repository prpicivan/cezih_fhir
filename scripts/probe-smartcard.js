/**
 * Extract certificate details — with buffer pre-allocation
 */
const pkcs11js = require('pkcs11js');
const crypto = require('crypto');

const PKCS11_MODULE = '/Applications/CertiliaMiddleware.app/Contents/pkcs11/libCertiliaPkcs11.dylib';
const pkcs11 = new pkcs11js.PKCS11();

try {
    pkcs11.load(PKCS11_MODULE);
    pkcs11.C_Initialize();

    const slots = pkcs11.C_GetSlotList(true);

    for (const slot of slots) {
        const tokenInfo = pkcs11.C_GetTokenInfo(slot);
        const label = tokenInfo.label.trim();
        console.log(`\n=== ${label} ===`);

        const session = pkcs11.C_OpenSession(slot, 0x04); // CKF_SERIAL_SESSION

        // Find ALL objects without login
        pkcs11.C_FindObjectsInit(session, []);
        let allObjs = [];
        let obj;
        while ((obj = pkcs11.C_FindObjects(session, 1)).length > 0) allObjs.push(obj[0]);
        pkcs11.C_FindObjectsFinal(session);

        console.log(`Objects found: ${allObjs.length}`);

        for (const o of allObjs) {
            try {
                // First get class and label
                const basicAttrs = pkcs11.C_GetAttributeValue(session, o, [
                    { type: 0x00000000 },  // CKA_CLASS
                    { type: 0x00000003 },  // CKA_LABEL
                ]);

                const cls = basicAttrs[0]?.value?.readUInt32LE?.(0) ?? basicAttrs[0]?.value?.[0] ?? -1;
                const lbl = basicAttrs[1]?.value?.toString('utf8') || '?';

                console.log(`\n  Object: "${lbl}" (class=${cls})`);

                // If certificate, get value with pre-allocated buffer
                if (cls === 1) { // CKO_CERTIFICATE
                    try {
                        // Pre-allocate large buffer for certificate value
                        const valueAttr = pkcs11.C_GetAttributeValue(session, o, [
                            { type: 0x00000011, value: Buffer.alloc(4096) },  // CKA_VALUE
                        ]);

                        const certDer = valueAttr[0]?.value;
                        console.log(`  DER bytes: ${certDer?.length || 0}`);

                        if (certDer && certDer.length > 0) {
                            try {
                                const x509 = new crypto.X509Certificate(certDer);
                                console.log(`  Subject:    ${x509.subject}`);
                                console.log(`  Issuer:     ${x509.issuer}`);
                                console.log(`  Valid From: ${x509.validFrom}`);
                                console.log(`  Valid To:   ${x509.validTo}`);
                                console.log(`  Serial:     ${x509.serialNumber}`);
                                console.log(`  Pub Key:    ${x509.publicKey.asymmetricKeyType} ${x509.publicKey.asymmetricKeySize || ''}`);

                                const keyUsage = x509.keyUsage;
                                if (keyUsage) console.log(`  Key Usage:  ${JSON.stringify(keyUsage)}`);

                                const subjectAlt = x509.subjectAltName;
                                if (subjectAlt) console.log(`  SubjAlt:    ${subjectAlt}`);
                            } catch (e2) {
                                console.log(`  X509 parse error: ${e2.message}`);
                                // Dump first 20 bytes hex for debugging
                                console.log(`  First 20 bytes: ${certDer.slice(0, 20).toString('hex')}`);
                            }
                        }
                    } catch (e) {
                        console.log(`  Error reading CKA_VALUE: ${e.message}`);
                    }
                }

                // If key, get key type
                if (cls === 2 || cls === 3) { // PUBLIC_KEY or PRIVATE_KEY
                    try {
                        const keyAttrs = pkcs11.C_GetAttributeValue(session, o, [
                            { type: 0x00000100 },  // CKA_KEY_TYPE
                        ]);
                        const kt = keyAttrs[0]?.value?.[0];
                        const keyTypes = { 0: 'RSA', 1: 'DSA', 3: 'EC' };
                        console.log(`  Key Type: ${keyTypes[kt] || kt}`);
                    } catch (e) {
                        console.log(`  Error reading key type: ${e.message}`);
                    }
                }
            } catch (e) {
                console.log(`  Error: ${e.message}`);
            }
        }

        pkcs11.C_CloseSession(session);
    }

    pkcs11.C_Finalize();
    console.log(`\n=== Done ===`);
} catch (e) {
    console.error(`Error: ${e.message}`);
    try { pkcs11.C_Finalize(); } catch (_) { }
}
