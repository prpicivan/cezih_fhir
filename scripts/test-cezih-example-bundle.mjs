/**
 * Send CEZIH's OWN example encounter bundle — with our IDs substituted.
 * If this fails with CantResolve, it proves Organization is not registered.
 * 
 * Usage: node scripts/test-cezih-example-bundle.mjs
 * Requires: active gateway session
 */
import https from 'https';
import http from 'http';

// Our real values
const OUR_ORG_HZZO = '999001425';
const OUR_PRACTITIONER_HZJZ = '4981825';
const OUR_PATIENT_MBO = '999999423';

// Also test with CEZIH's own example values (1234 / 1234567 / 18022306986)
const CEZIH_ORG = '1234';
const CEZIH_PRACT = '1234567';
const CEZIH_PATIENT = '18022306986';

function buildBundle(orgId, practId, patientMbo, label) {
    const msgUuid = crypto.randomUUID();
    const encUuid = crypto.randomUUID();
    const now = new Date().toISOString();

    return {
        label,
        bundle: {
            resourceType: 'Bundle',
            id: crypto.randomUUID(),
            type: 'message',
            timestamp: now,
            entry: [
                {
                    fullUrl: `urn:uuid:${msgUuid}`,
                    resource: {
                        resourceType: 'MessageHeader',
                        eventCoding: {
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '1.1',
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
                                value: orgId,
                            },
                        },
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: practId,
                            },
                        },
                        source: {
                            endpoint: 'urn:oid:1.2.3.4.5.6',
                        },
                        focus: [{ reference: `urn:uuid:${encUuid}` }],
                    },
                },
                {
                    fullUrl: `urn:uuid:${encUuid}`,
                    resource: {
                        resourceType: 'Encounter',
                        extension: [
                            {
                                url: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-troskovi-sudjelovanje',
                                extension: [
                                    {
                                        url: 'oznaka',
                                        valueCoding: {
                                            system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/sudjelovanje-u-troskovima',
                                            code: 'N',
                                        },
                                    },
                                    {
                                        url: 'sifra-oslobodjenja',
                                        valueCoding: {
                                            system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/sifra-oslobodjenja-od-sudjelovanja-u-troskovima',
                                            code: '55',
                                        },
                                    },
                                ],
                            },
                        ],
                        status: 'in-progress',
                        class: {
                            system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/nacin-prijema',
                            code: '9',
                            display: 'Interna uputnica',
                        },
                        subject: {
                            type: 'Patient',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO',
                                value: patientMbo,
                            },
                        },
                        participant: [
                            {
                                individual: {
                                    type: 'Practitioner',
                                    identifier: {
                                        system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                        value: practId,
                                    },
                                },
                            },
                        ],
                        period: { start: now },
                        serviceProvider: {
                            type: 'Organization',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
                                value: orgId,
                            },
                        },
                    },
                },
            ],
            signature: {
                type: [
                    {
                        system: 'urn:iso-astm:E1762-95:2013',
                        code: '1.2.840.10065.1.12.1.1',
                    },
                ],
                when: now,
                who: {
                    type: 'Practitioner',
                    identifier: {
                        system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                        value: practId,
                    },
                },
                data: 'dGVzdA==', // placeholder
            },
        },
    };
}

// Step 1: Get gateway cookies from our server
async function getGatewayCookies() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:3010/api/auth/gateway-token', (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success) resolve(json.cookieHeader);
                    else reject(new Error('No gateway session'));
                } catch {
                    reject(new Error('Parse error'));
                }
            });
        }).on('error', reject);
    });
}

// Step 2: Send bundle directly to CEZIH
async function sendToGateway(bundle, cookieHeader) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(bundle);
        const options = {
            hostname: 'certws2.cezih.hr',
            port: 8443,
            path: '/services-router/gateway/encounter-services/api/v1/$process-message',
            method: 'POST',
            headers: {
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json',
                Cookie: cookieHeader,
                'Content-Length': Buffer.byteLength(postData),
            },
            rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                resolve({ status: res.statusCode, body: data });
            });
        });
        req.on('error', (e) => resolve({ status: 0, body: e.message }));
        req.write(postData);
        req.end();
    });
}

function extractError(raw) {
    try {
        const j = JSON.parse(raw);
        // OperationOutcome
        if (j.issue) {
            return j.issue.map((i) => `[${i.severity}] ${i.details?.text || i.diagnostics || ''}`).join(' | ');
        }
        // Bundle with OperationOutcome
        if (j.entry) {
            const oo = j.entry.find((e) => e.resource?.resourceType === 'OperationOutcome')?.resource;
            if (oo) {
                return oo.issue?.map((i) => `[${i.severity}] ${i.details?.coding?.[0]?.display || i.diagnostics || ''}`).join(' | ');
            }
            // Success?
            const mh = j.entry.find((e) => e.resource?.resourceType === 'MessageHeader')?.resource;
            if (mh?.response?.code === 'ok') return '✅ SUCCESS!';
        }
    } catch { }
    return raw.substring(0, 300);
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  CEZIH Example Bundle Test — Direktno na CEZIH gateway     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();

    // Get cookies
    let cookieHeader;
    try {
        cookieHeader = await getGatewayCookies();
        console.log('  ✅ Gateway session aktivan');
    } catch (e) {
        console.log('  ❌ Nema gateway sesije:', e.message);
        process.exit(1);
    }

    const tests = [
        buildBundle(OUR_ORG_HZZO, OUR_PRACTITIONER_HZJZ, OUR_PATIENT_MBO,
            `A) NAŠI podaci (Org=${OUR_ORG_HZZO}, Pract=${OUR_PRACTITIONER_HZJZ}, MBO=${OUR_PATIENT_MBO})`),
        buildBundle(CEZIH_ORG, CEZIH_PRACT, CEZIH_PATIENT,
            `B) CEZIH primjer podaci (Org=${CEZIH_ORG}, Pract=${CEZIH_PRACT}, MBO=${CEZIH_PATIENT})`),
        buildBundle(OUR_ORG_HZZO, CEZIH_PRACT, CEZIH_PATIENT,
            `C) NAŠA org + CEZIH pract/patient (Org=${OUR_ORG_HZZO}, Pract=${CEZIH_PRACT})`),
        buildBundle(CEZIH_ORG, OUR_PRACTITIONER_HZJZ, OUR_PATIENT_MBO,
            `D) CEZIH org + NAŠI pract/patient (Org=${CEZIH_ORG}, Pract=${OUR_PRACTITIONER_HZJZ})`),
    ];

    console.log();
    for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        console.log('───────────────────────────────────────────────────────────────');
        console.log(`  [${i + 1}/${tests.length}] ${t.label}`);

        const result = await sendToGateway(t.bundle, cookieHeader);
        console.log(`  HTTP ${result.status}`);
        console.log(`  → ${extractError(result.body)}`);

        if (i < tests.length - 1) {
            console.log('  ⏳ Čekam 2s...');
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Ako test A i C padaju a B i D rade → Problem je naša org.');
    console.log('  Ako SVE pada → Nijedna org nije registrirana.');
    console.log('═══════════════════════════════════════════════════════════════');
}

main();
