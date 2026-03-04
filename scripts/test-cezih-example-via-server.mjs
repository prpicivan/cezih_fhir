/**
 * Send CEZIH's OWN example encounter bundle — through our local server.
 * Tests 4 combinations to isolate whether it's our Org or all Orgs.
 * 
 * Usage: node scripts/test-cezih-example-via-server.mjs
 * Requires: server running on localhost:3010, active gateway session
 */
import http from 'http';
import crypto from 'crypto';

const OUR_ORG = '999001425';
const OUR_PRACT = '4981825';
const OUR_MBO = '999999423';

const CEZIH_ORG = '1234';
const CEZIH_PRACT = '1234567';
const CEZIH_MBO = '18022306986';

const TESTS = [
    { label: 'A) NAŠI podaci', org: OUR_ORG, pract: OUR_PRACT, mbo: OUR_MBO },
    { label: 'B) CEZIH primjer podaci', org: CEZIH_ORG, pract: CEZIH_PRACT, mbo: CEZIH_MBO },
    { label: 'C) NAŠA org + CEZIH ostalo', org: OUR_ORG, pract: CEZIH_PRACT, mbo: CEZIH_MBO },
    { label: 'D) CEZIH org + NAŠI ostali', org: CEZIH_ORG, pract: OUR_PRACT, mbo: OUR_MBO },
];

function post(body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost', port: 3010,
            path: '/api/visit/create', method: 'POST',
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

function analyze(result) {
    const raw = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    if (raw.includes('CantResolve') || raw.includes('Unable to resolve')) return '❌ CantResolve';
    if (raw.includes('slicing') || raw.includes('CLOSED')) return '❌ Slicing';
    if (raw.includes('"code":"ok"') || raw.includes('response')) return '✅ SUCCESS';
    if (raw.includes('Practitioner')) return '⚠️ Practitioner error';
    if (raw.includes('Patient')) return '⚠️ Patient error';
    return '❓ ' + raw.substring(0, 200);
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  CEZIH Example Bundle — 4 kombinacije                      ║');
    console.log('║  Šalje se kroz lokalni server (pravilna autorizacija)       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    for (let i = 0; i < TESTS.length; i++) {
        const t = TESTS[i];
        console.log('───────────────────────────────────────────────────────────────');
        console.log(`  [${i + 1}/${TESTS.length}] ${t.label}`);
        console.log(`     Org: ${t.org} | Pract: ${t.pract} | MBO: ${t.mbo}`);

        try {
            const result = await post({
                patientMbo: t.mbo,
                practitionerId: t.pract,
                organizationId: t.org,
                orgIdentifierSystem: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
                orgIdentifierValue: t.org,
                class: 'AMB',
                startDate: new Date().toISOString(),
            });

            const verdict = analyze(result);
            console.log(`  → ${verdict}`);

            // Show more detail for non-standard errors
            if (verdict.startsWith('❓') || verdict.startsWith('⚠️')) {
                const raw = JSON.stringify(result.body);
                console.log(`     Detail: ${raw.substring(0, 300)}`);
            }
        } catch (e) {
            console.log(`  → 💥 Error: ${e.message}`);
        }

        if (i < TESTS.length - 1) {
            console.log('  ⏳ 2s...');
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  INTERPRETACIJA:');
    console.log('  A,C padaju + B,D rade → Problem je NAŠA organizacija');
    console.log('  SVE pada              → Nijedna org nije registrirana');
    console.log('  A,D rade + B,C padaju → Problem je CEZIH primjer org');
    console.log('═══════════════════════════════════════════════════════════════');
}

main();
