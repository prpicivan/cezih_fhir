/**
 * Verify both slots with specific PINs - find all objects
 */
const pkcs11js = require('pkcs11js');

const PKCS11_MODULE = '/Applications/CertiliaMiddleware.app/Contents/pkcs11/libCertiliaPkcs11.dylib';
const signPin = process.argv[2];  // "kG4VvF2P"
const idenPin = process.argv[3];  // "u6Te1XPa"

const pkcs11 = new pkcs11js.PKCS11();

const CKO_NAMES = {
    0: 'CKO_DATA', 1: 'CKO_CERTIFICATE', 2: 'CKO_PUBLIC_KEY', 3: 'CKO_PRIVATE_KEY',
    4: 'CKO_SECRET_KEY', 5: 'CKO_HW_FEATURE', 6: 'CKO_DOMAIN_PARAMETERS', 7: 'CKO_MECHANISM', 8: 'CKO_OTP_KEY',
};

try {
    pkcs11.load(PKCS11_MODULE);
    pkcs11.C_Initialize();

    const slots = pkcs11.C_GetSlotList(true);

    for (const slot of slots) {
        const tokenInfo = pkcs11.C_GetTokenInfo(slot);
        const label = tokenInfo.label.trim();

        let pinToUse = null;
        if (label.includes('Sign')) pinToUse = signPin;
        if (label.includes('Iden')) pinToUse = idenPin;

        console.log(`\n=== Testing Slot: ${label} ===`);
        if (!pinToUse) {
            console.log(`  Skipping (unknown type)`);
            continue;
        }

        const session = pkcs11.C_OpenSession(slot, 0x04 | 0x02); // SERIAL | RW

        try {
            pkcs11.C_Login(session, 1, pinToUse); // CKU_USER = 1
            console.log(`  ✅ Login successful!`);

            // Look for ALL objects
            pkcs11.C_FindObjectsInit(session, []);
            let objs = [];
            let obj;
            while ((obj = pkcs11.C_FindObjects(session, 1)).length > 0) objs.push(obj[0]);
            pkcs11.C_FindObjectsFinal(session);

            console.log(`  Objects found: ${objs.length}`);

            let privKeyCount = 0;
            for (const o of objs) {
                const attrs = pkcs11.C_GetAttributeValue(session, o, [
                    { type: 0x00000000 }, // CKA_CLASS
                    { type: 0x00000003 }, // CKA_LABEL
                ]);
                const cls = attrs[0]?.value?.readUInt32LE?.(0) ?? attrs[0]?.value?.[0] ?? -1;
                const objLabel = attrs[1]?.value?.toString('utf8') || '?';

                if (cls === 3 || cls === 3n || cls === 0x03) {
                    privKeyCount++;
                }

                console.log(`    - [${CKO_NAMES[cls] || cls}] "${objLabel}"`);
            }
            console.log(`  🔑 Verified access to ${privKeyCount} private keys.`);

            pkcs11.C_Logout(session);
        } catch (e) {
            console.log(`  ❌ Login failed: ${e.message}`);
        }

        pkcs11.C_CloseSession(session);
    }

    pkcs11.C_Finalize();
    console.log(`\n=== Done ===`);
} catch (e) {
    console.error(`Error: ${e.message}`);
    try { pkcs11.C_Finalize(); } catch (_) { }
}
