/**
 * Test CEZIH health case create (TC16) — 4 combinations
 * Event code: 2.1, Resource: Condition
 * Endpoint: health-issue-services/$process-message
 * 
 * Usage: node scripts/test-case-example.mjs
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
            path: '/api/case/create', method: 'POST',
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
    if (raw.includes('"code":"ok"')) return '✅ SUCCESS';
    if (raw.includes('login-pf') || raw.includes('DOCTYPE')) return '❌ Sesija istekla (login redirect)';
    // Show short detail for unknown errors
    const errMatch = raw.match(/cezihError":"([^"]{0,200})/);
    if (errMatch) return '⚠️ ' + errMatch[1].substring(0, 150);
    return '❓ ' + raw.substring(0, 200);
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  CEZIH Health Case Create (TC16) — 4 kombinacije           ║');
    console.log('║  Event: 2.1 | Resource: Condition | health-issue-services  ║');
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
                title: 'Test slučaj',
                diagnosisCode: 'C00',
                diagnosisDisplay: 'Zloćudna novotvorina usne',
                status: 'active',
                startDate: new Date().toISOString(),
            });

            console.log(`  → ${analyze(result)}`);
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
    console.log('  A,C padaju + B,D rade → Problem je NAŠA org');
    console.log('  SVE pada              → Nijedna org nije registrirana');
    console.log('  Neke rade             → Zanimljivo! Pogledaj detalje.');
    console.log('═══════════════════════════════════════════════════════════════');
}

main();
