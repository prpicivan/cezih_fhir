/**
 * Probe: dump all PKCS#11 slot/token/object info from the smart card.
 * Helps identify correct slot, key type, and mechanism for signing.
 */
require('dotenv').config();

let pkcs11js;
try { pkcs11js = require('pkcs11js'); }
catch { console.error('pkcs11js not installed'); process.exit(1); }

const MODULE_PATH = process.env.PKCS11_MODULE_PATH ||
    'C:\\Program Files\\AKD\\Certilia Middleware\\pkcs11\\CertiliaPkcs11_64.dll';
const IDEN_PIN = process.env.IDEN_PIN;

console.log('Module:', MODULE_PATH);
console.log('PIN set:', !!IDEN_PIN);

const p11 = new pkcs11js.PKCS11();
p11.load(MODULE_PATH);
try { p11.C_Initialize(); } catch (e) {
    if (!e.message?.includes('ALREADY')) throw e;
}

const slots = p11.C_GetSlotList(true);
console.log(`\nFound ${slots.length} slot(s):`);

for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    let tokenInfo;
    try { tokenInfo = p11.C_GetTokenInfo(slot); } catch { continue; }
    const label = Buffer.from(tokenInfo.label).toString().trim();
    const serial = Buffer.from(tokenInfo.serialNumber).toString().trim();
    console.log(`\n[Slot ${i}] Label: "${label}" | Serial: "${serial}"`);

    if (!IDEN_PIN) { console.log('  (skipping objects — no IDEN_PIN)'); continue; }

    let session;
    try {
        session = p11.C_OpenSession(slot, 0x04 | 0x02);
        try { p11.C_Login(session, 1, IDEN_PIN); }
        catch (e) { if (!e.message?.includes('ALREADY')) { console.log('  LOGIN FAILED:', e.message); continue; } }
    } catch (e) { console.log('  OpenSession failed:', e.message); continue; }

    // Enumerate all objects
    p11.C_FindObjectsInit(session, []);
    const objs = [];
    let o;
    while ((o = p11.C_FindObjects(session, 1)).length > 0) objs.push(o[0]);
    p11.C_FindObjectsFinal(session);

    console.log(`  Objects: ${objs.length}`);

    for (const obj of objs) {
        // CKA_CLASS
        let cls, keyType, label_attr, id_attr;
        try {
            const clsA = p11.C_GetAttributeValue(session, obj, [{ type: 0x00 }]);
            const raw = clsA[0]?.value;
            cls = raw?.readUInt32LE?.(0) ?? raw?.[0];
        } catch { cls = '?'; }

        const clsName = { 0: 'DATA', 1: 'CERT', 2: 'PUB_KEY', 3: 'PRIV_KEY', 4: 'SECRET' }[cls] || cls;

        try {
            const ktA = p11.C_GetAttributeValue(session, obj, [{ type: 0x100 }]); // CKA_KEY_TYPE
            const raw = ktA[0]?.value;
            keyType = raw?.readUInt32LE?.(0) ?? raw?.[0];
        } catch { keyType = '-'; }

        const keyName = { 0: 'RSA', 1: 'DSA', 2: 'DH', 3: 'EC' }[keyType] || keyType;

        console.log(`  obj class=${clsName} keyType=${keyName}`);

        if (cls === 3) { // PRIV_KEY - try to get key label/id
            try {
                const lblA = p11.C_GetAttributeValue(session, obj, [{ type: 0x03 }]); // CKA_LABEL
                const lbl = Buffer.from(lblA[0]?.value || []).toString().trim();
                console.log(`    label: "${lbl}"`);
            } catch { }

            // Try common signing mechanisms
            const mechs = [
                { name: 'CKM_SHA256_RSA_PKCS', id: 0x00000040 },
                { name: 'CKM_SHA1_RSA_PKCS', id: 0x00000006 },
                { name: 'CKM_RSA_PKCS', id: 0x00000001 },
                { name: 'CKM_ECDSA', id: 0x00001041 },
                { name: 'CKM_ECDSA_SHA1', id: 0x00001042 },
                { name: 'CKM_ECDSA_SHA256', id: 0x00001043 },
                { name: 'CKM_ECDSA_SHA384', id: 0x00001044 },
            ];
            console.log('    Testing mechanisms:');
            for (const m of mechs) {
                try {
                    const testData = Buffer.from('hello world');
                    p11.C_SignInit(session, { mechanism: m.id, parameter: null }, obj);
                    const sig = p11.C_Sign(session, testData, Buffer.alloc(4096));
                    const sigLen = sig ? Math.min(sig.length, 200) : 0;
                    console.log(`      ✅ ${m.name} (0x${m.id.toString(16)}) — sig len=${sigLen}`);
                } catch (e) {
                    console.log(`      ❌ ${m.name} (0x${m.id.toString(16)}) — ${e.message}`);
                }
            }
        }
    }

    try { p11.C_Logout(session); } catch { }
    try { p11.C_CloseSession(session); } catch { }
}

try { p11.C_Finalize(); } catch { }
console.log('\nDone.');
