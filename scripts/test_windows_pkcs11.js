/**
 * PKCS#11 Diagnostic Script for Windows
 * Run this on your Windows machine to verify the smartcard setup.
 */
const pkcs11js = require('pkcs11js');
const fs = require('fs');
require('dotenv').config();

const modulePath = process.env.PKCS11_MODULE_PATH || 'C:\\Program Files\\AKD\\Certilia\\pkcs11.dll';

console.log(`Checking PKCS11 module at: ${modulePath}`);

if (!fs.existsSync(modulePath)) {
    console.error('❌ Error: PKCS11 DLL not found at specified path.');
    console.log('Please check your .env or the default installation path.');
    process.exit(1);
}

try {
    const pkcs11 = new pkcs11js.PKCS11();
    pkcs11.load(modulePath);
    pkcs11.C_Initialize();

    const slots = pkcs11.C_GetSlotList(true);
    console.log(`✅ Success: Found ${slots.length} active slots.`);

    for (const slot of slots) {
        const tokenInfo = pkcs11.C_GetTokenInfo(slot);
        console.log(` - Slot [${slot.toString('hex')}]: ${tokenInfo.label.trim()}`);
    }

    pkcs11.C_Finalize();
    console.log('\n✅ Diagnosis complete. Your Windows environment is ready for signing.');
} catch (err) {
    console.error('❌ Error during PKCS11 initialization:');
    console.error(err.message);
}
