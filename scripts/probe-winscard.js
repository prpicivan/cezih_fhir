/**
 * Test: Use Windows SCard API (winscard.dll) to list cards in the reader.
 * WinSCard is separate from PKCS#11 and can coexist with VPN.
 */

const { execSync } = require('child_process');

// Method 1: certutil -scinfo 
console.log('=== Method 1: certutil -scinfo ===');
try {
    const out = execSync('certutil -scinfo 2>&1', { timeout: 10000 }).toString();
    console.log(out.substring(0, 2000));
} catch (e) {
    console.log('certutil error:', e.stdout?.toString()?.substring(0, 500) || e.message);
}

// Method 2: List certs from smart card in Windows cert store
console.log('\n=== Method 2: Certs in My store (smart card) ===');
try {
    const out = execSync('certutil -store -user My 2>&1', { timeout: 10000 }).toString();
    // Print cert subjects
    const lines = out.split('\n');
    for (const line of lines) {
        if (line.includes('Subject') || line.includes('Issuer') || line.includes('Serial') || line.includes('Provider')) {
            console.log(line.trim());
        }
    }
} catch (e) {
    console.log('certutil -store error:', e.message);
}

// Method 3: Check PowerShell Get-ChildItem Cert:\CurrentUser\My
console.log('\n=== Method 3: PowerShell cert store ===');
try {
    const cmd = `powershell -Command "Get-ChildItem Cert:\\CurrentUser\\My | Select-Object Subject,Thumbprint,NotAfter,HasPrivateKey | Format-List"`;
    const out = execSync(cmd, { timeout: 10000 }).toString();
    console.log(out.substring(0, 2000));
} catch (e) {
    console.log('PowerShell error:', e.message);
}
