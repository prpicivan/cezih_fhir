/**
 * Probe PKCS#11 with CKF_OS_LOCKING_OK flag to allow shared access.
 */
require('dotenv').config();
const pkcs11js = require('pkcs11js');

const MODULE_PATH = process.env.PKCS11_MODULE_PATH ||
    'C:\\Program Files\\AKD\\Certilia Middleware\\pkcs11\\CertiliaPkcs11_64.dll';
const IDEN_PIN = process.env.IDEN_PIN;

console.log('Testing with CKF_OS_LOCKING_OK...');
const p11 = new pkcs11js.PKCS11();
p11.load(MODULE_PATH);

// Try with CKF_OS_LOCKING_OK = 0x00000002
try {
    p11.C_Initialize({ flags: 2 });
    console.log('✅ C_Initialize with CKF_OS_LOCKING_OK succeeded!');
} catch (e) {
    console.log('❌ With CKF_OS_LOCKING_OK:', e.message);

    // Try without arguments 
    try {
        p11.C_Initialize();
        console.log('✅ C_Initialize without args succeeded!');
    } catch (e2) {
        console.log('❌ Without args:', e2.message);

        // Maybe VPN has it — try to just open session directly without C_Initialize
        try {
            const slots = p11.C_GetSlotList(true);
            console.log('✅ C_GetSlotList without C_Initialize succeeded! Slots:', slots.length);
        } catch (e3) {
            console.log('❌ C_GetSlotList:', e3.message);
        }
        process.exit(1);
    }
}

// List slots
try {
    const slots = p11.C_GetSlotList(true);
    console.log(`\nSlots found: ${slots.length}`);
    for (const slot of slots) {
        const info = p11.C_GetTokenInfo(slot);
        const label = Buffer.from(info.label).toString().trim();
        console.log(`  Slot: "${label}"`);
    }
} catch (e) {
    console.log('C_GetSlotList error:', e.message);
}
