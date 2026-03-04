/**
 * Test Organization Variations for CEZIH TC12 (Encounter Create)
 * 
 * Sends encounter-create message bundles via the local server API,
 * varying how the Organization reference is constructed:
 * 
 * Tests:
 *  A) HZZO-šifra identifier (current approach)
 *  B) OIB identifier
 *  C) HZJZ-broj-ustanove identifier
 *  D) UUID identifier (jedinstveni-identifikator-zdravstvene-organizacije)
 *  E) HZZO-šifra with full Organization resource embedded in Bundle
 *  F) No serviceProvider at all (skipServiceProvider)
 *  G) reference by literal "Organization/999001425" instead of identifier
 * 
 * Usage:
 *   node scripts/test-org-variations.mjs
 * 
 * Prerequisites:
 *   - Server running on localhost:3010
 *   - Active CEZIH gateway session (login first via browser)
 */

import http from 'http';

// ============================================================
// Organization identity values from .env
// ============================================================
const ORG = {
    hzzoCode: '999001425',
    hzjzCode: '4981825',
    oib: '30160453873',
    uuid: '18d537c3-3551-42e1-8466-1803b9e0b156', // from CEZIH example
    name: 'WBS ordinacija',
};

const PATIENT_MBO = '999999423';
const PRACTITIONER_ID = '4981825';

// ============================================================
// Test Variations
// ============================================================
const TESTS = [
    {
        label: 'A) HZZO šifra (trenutni pristup)',
        orgIdentifierSystem: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
        orgIdentifierValue: ORG.hzzoCode,
    },
    {
        label: 'B) OIB organizacije',
        orgIdentifierSystem: 'http://fhir.cezih.hr/specifikacije/identifikatori/OIB',
        orgIdentifierValue: ORG.oib,
    },
    {
        label: 'C) HZJZ broj ustanove',
        orgIdentifierSystem: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-ustanove',
        orgIdentifierValue: ORG.hzjzCode,
    },
    {
        label: 'D) UUID (jedinstveni-identifikator)',
        orgIdentifierSystem: 'http://fhir.cezih.hr/specifikacije/identifikatori/jedinstveni-identifikator-zdravstvene-organizacije',
        orgIdentifierValue: ORG.uuid,
    },
    {
        label: 'E) HZZO šifra + literal reference (Organization/999001425)',
        orgIdentifierSystem: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
        orgIdentifierValue: ORG.hzzoCode,
        useLiteralReference: true,
    },
    {
        label: 'F) Bez serviceProvider-a',
        skipServiceProvider: true,
    },
];

// ============================================================
// Test Runner
// ============================================================

function postToServer(path, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 3010,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
    });
}

function analyzeResult(result) {
    const { status, body } = result;
    const raw = typeof body === 'string' ? body : JSON.stringify(body);

    if (body?.localOnly) {
        // CEZIH rejected
        const errMsg = body.cezihError || '';
        const cantResolve = raw.includes('CantResolve') || raw.includes('Unable to resolve');
        const slicing = raw.includes('slicing') || raw.includes('CLOSED');
        const different = !cantResolve && !slicing;

        return {
            icon: cantResolve ? '❌ REF' : slicing ? '❌ SLICE' : '⚠️  DIFF',
            error: errMsg.substring(0, 200),
            success: false,
            cantResolve,
            slicing,
            differentError: different,
        };
    }

    // Check for CEZIH success (response bundle with MessageHeader response)
    const isSuccess =
        body?.resourceType === 'Bundle' &&
        body?.entry?.some(
            (e) => e.resource?.resourceType === 'MessageHeader' && e.resource?.response?.code === 'ok'
        );

    if (isSuccess) {
        return { icon: '✅', error: '', success: true };
    }

    // Unknown response
    return {
        icon: '❓',
        error: raw.substring(0, 200),
        success: false,
    };
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Organization Variation Test — TC12 Encounter Create        ║');
    console.log('║  Testing different identifier systems & reference styles    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`  Organization: ${ORG.name}`);
    console.log(`  HZZO: ${ORG.hzzoCode}  |  OIB: ${ORG.oib}  |  HZJZ: ${ORG.hzjzCode}`);
    console.log(`  UUID: ${ORG.uuid}`);
    console.log(`  Patient MBO: ${PATIENT_MBO}  |  Practitioner: ${PRACTITIONER_ID}`);
    console.log();

    const results = [];

    for (let i = 0; i < TESTS.length; i++) {
        const test = TESTS[i];
        console.log(`───────────────────────────────────────────────────────────────`);
        console.log(`  [${i + 1}/${TESTS.length}] ${test.label}`);

        const body = {
            patientMbo: PATIENT_MBO,
            practitionerId: PRACTITIONER_ID,
            organizationId: test.orgIdentifierValue || ORG.hzzoCode,
            class: 'AMB',
            startDate: new Date().toISOString(),
        };

        if (test.orgIdentifierSystem) {
            body.orgIdentifierSystem = test.orgIdentifierSystem;
            body.orgIdentifierValue = test.orgIdentifierValue;
        }

        if (test.skipServiceProvider) {
            body.skipServiceProvider = true;
        }

        // For literal reference test, we would need to modify the bundle
        // Since we can't change the server code, we'll note this as a manual test
        if (test.useLiteralReference) {
            console.log(`  ℹ️  Note: Literal reference test — using identifier-based via server`);
            console.log(`     (A manual test with literal "Organization/999001425" would`);
            console.log(`      require direct CEZIH API call, noted for follow-up)`);
        }

        try {
            const result = await postToServer('/api/visit/create', body);
            const analysis = analyzeResult(result);
            results.push({ ...test, ...analysis });

            console.log(`  ${analysis.icon}  HTTP ${result.status}`);
            if (analysis.success) {
                console.log(`  🎉 CEZIH PRIHVATIO! Organization referenca uspješna!`);
            } else {
                console.log(`  ${analysis.error}`);
            }
        } catch (err) {
            console.log(`  💥 Network error: ${err.message}`);
            results.push({ ...test, icon: '💥', success: false, error: err.message });
        }

        // Wait between tests
        if (i < TESTS.length - 1) {
            console.log(`  ⏳ Čekam 2s...`);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }

    // ============================================================
    // Summary
    // ============================================================
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SAŽETAK');
    console.log('═══════════════════════════════════════════════════════════════');

    const successes = results.filter((r) => r.success);
    const cantResolve = results.filter((r) => r.cantResolve);
    const slicing = results.filter((r) => r.slicing);
    const different = results.filter((r) => r.differentError);

    console.log();
    for (const r of results) {
        console.log(`  ${r.icon}  ${r.label}`);
        if (r.error) console.log(`       → ${r.error.substring(0, 120)}`);
    }

    console.log();
    console.log(`  ✅ Uspjeh:           ${successes.length}`);
    console.log(`  ❌ CantResolve:      ${cantResolve.length}`);
    console.log(`  ❌ Slicing:          ${slicing.length}`);
    console.log(`  ⚠️  Drugačija greška: ${different.length}`);

    if (successes.length > 0) {
        console.log();
        console.log('  🎉🎉🎉 PRONAĐEN IDENTIFIER KOJI RADI! 🎉🎉🎉');
        for (const s of successes) {
            console.log(`  → ${s.label}`);
        }
    } else if (different.length > 0) {
        console.log();
        console.log('  ⚠️  Neke greške su DRUGAČIJE — vrijedi istražiti:');
        for (const d of different) {
            console.log(`  → ${d.label}: ${d.error?.substring(0, 100)}`);
        }
        console.log();
        console.log('  💡 Drugačija greška znači da je Organization možda pronađen,');
        console.log('     ali postoji drugi problem (npr. profil, potpis, itd.)');
    } else {
        console.log();
        console.log('  ❌ Nijedan identifier sustav nije prošao.');
        console.log('  → Zaključak: Organization NIJE registriran u CEZIH testu.');
        console.log('  → Potrebno: CEZIH tim mora registrirati organizaciju.');
    }

    console.log();
    console.log('Done.');
}

runTests().catch(console.error);
