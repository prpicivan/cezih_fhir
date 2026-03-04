/**
 * Test TC18 (ITI-65 Document Submit) using CEZIH's example Document Bundle
 * with our real data substituted.
 * 
 * Sends via /api/document/send endpoint on localhost:3010
 * 
 * Usage: node scripts/test-tc18-example.mjs
 * Requires: server running, active gateway session
 */
import http from 'http';

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost', port: 3010,
            path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
            let out = '';
            res.on('data', c => out += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(out) }); }
                catch { resolve({ status: res.statusCode, body: out }); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  TC18 Document Submit (ITI-65) — CEZIH example + naši ID   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Use our real data
    const payload = {
        patientMbo: '999999423',
        practitionerId: '4981825',
        organizationId: '999001425',
        documentType: '011',
        documentTitle: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
        // Sections from CEZIH example
        anamneza: 'Tekstualni opis anamneze pacijenta.',
        dijagnoza: 'C00',
        dijagnozaDisplay: 'Zloćudna novotvorina usne',
        terapija: 'Tekstualni opis svih preporučenih postupaka za daljnje liječenje pacijenta...',
        zakljucak: 'Pregled završen uspješno',
    };

    console.log('  Podaci:');
    console.log(`    Org:    ${payload.organizationId}`);
    console.log(`    Pract:  ${payload.practitionerId}`);
    console.log(`    MBO:    ${payload.patientMbo}`);
    console.log(`    DocType: ${payload.documentType}`);
    console.log();

    try {
        console.log('  Šaljem na /api/document/send ...');
        const result = await post('/api/document/send', payload);

        console.log(`  HTTP ${result.status}`);
        const raw = JSON.stringify(result.body);

        if (raw.includes('CantResolve') || raw.includes('Unable to resolve')) {
            console.log('  → ❌ CantResolve (Organization nije registrirana u doc-mhd-svc)');
        } else if (raw.includes('slicing') || raw.includes('CLOSED')) {
            console.log('  → ❌ Slicing error (vjerojatno Organization resolve problem)');
        } else if (raw.includes('"code":"ok"') || raw.includes('success')) {
            console.log('  → ✅ SUCCESS!');
        } else if (raw.includes('login-pf')) {
            console.log('  → ❌ Sesija istekla — prijavite se ponovo');
        } else if (raw.includes('transactionCode')) {
            console.log('  → ⏳ Bundle prepared, awaiting signature (deferred signing)');
        } else {
            console.log('  → ❓ Unexpected response');
        }

        // Print detail
        console.log();
        console.log('  Detail:');
        console.log('  ', raw.substring(0, 600));

        // Also extract cezihError if present
        if (result.body?.result?.cezihError) {
            console.log();
            console.log('  CEZIH Error:');
            console.log('  ', result.body.result.cezihError.substring(0, 500));
        }
    } catch (e) {
        console.log(`  → 💥 Error: ${e.message}`);
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
}

main();
