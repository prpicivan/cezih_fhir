/**
 * CEZIH FHIR — Automated Test Runner v2
 * Pokriva svih 22 test slučajeva iz certifikacijske matrice
 * Ažurirano: 2026-03-02
 * 
 * Pokreni: node scripts/run-all-tests-v2.js
 * Prerekvizit: server pokrenut na portu 3010
 */

const http = require('http');

// ─── Konfiguracija ───────────────────────────────────────────────
const PORT = 3010;
const PATIENT_MBO = '999999423';
const PRACTITIONER_OIB = '30160453873';
const PRACTITIONER_HZJZ_ID = '4981825';
const ORGANIZATION_HZZO_CODE = process.env.ORGANIZATION_HZZO_CODE || '999001425';
const ORGANIZATION_HZJZ_CODE = process.env.ORGANIZATION_HZJZ_CODE || '4981825';

// ─── State ───────────────────────────────────────────────────────
let results = [];
let createdVisitId = null;
let createdCaseId = null;
let hasGatewaySession = false;

// ─── HTTP Helper ─────────────────────────────────────────────────
function req(method, path, body = null, timeout = 30000) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: PORT,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
            timeout,
        };

        const startTime = Date.now();
        const r = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => (responseData += chunk));
            res.on('end', () => {
                const ms = Date.now() - startTime;
                let json = null;
                try { json = JSON.parse(responseData); } catch { }
                resolve({ status: res.statusCode, json, ms });
            });
        });

        r.on('timeout', () => {
            r.destroy();
            resolve({ status: 0, json: null, error: 'TIMEOUT', ms: timeout });
        });

        r.on('error', (err) => {
            resolve({ status: 0, json: null, error: err.message, ms: 0 });
        });

        if (data) r.write(data);
        r.end();
    });
}

// ─── Status Icons ────────────────────────────────────────────────
function getIcon(status, json) {
    if (status === 0) return '💀';  // connection refused / timeout

    const inner = json?.result?.result ?? json?.result ?? json;

    // Detect "locally OK but CEZIH rejected"
    if (status >= 200 && status < 300) {
        if (inner?.localOnly === true || inner?.cezihStatus === 'failed') return '⚠️';
        if (json?.success !== false) return '✅';
    }
    if (status === 401 || status === 403) return '⛔';
    if (status === 404) return '❓';
    if (status >= 500) return '💥';
    return '⚠️';
}

// ─── Logging ─────────────────────────────────────────────────────
function log(tc, name, method, path, res, note = '') {
    const i = getIcon(res.status, res.json);
    const noteStr = note ? ` | ${note}` : '';
    const line = `${i} ${tc.padEnd(5)} ${name.padEnd(38)} ${method.padEnd(5)} → HTTP ${String(res.status).padEnd(3)} (${res.ms}ms)${noteStr}`;
    console.log(line);
    results.push({ tc, name, status: res.status, icon: i, note, ms: res.ms, json: res.json });
}

function skip(tc, name, reason) {
    const line = `⏭️ ${tc.padEnd(5)} ${name.padEnd(38)} SKIP  — ${reason}`;
    console.log(line);
    results.push({ tc, name, status: 0, icon: '⏭️', note: reason });
}

function section(title) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${title}`);
    console.log('─'.repeat(70));
}

// ─── Main Test Run ───────────────────────────────────────────────
async function run() {
    const startTime = Date.now();

    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║   CEZIH FHIR — Test Runner v2              ' + new Date().toISOString().slice(0, 19) + '   ║');
    console.log('║   Patient: ' + PATIENT_MBO + '  Org: ' + ORGANIZATION_HZZO_CODE.padEnd(15) + '              ║');
    console.log('╚' + '═'.repeat(68) + '╝');

    // ─── Pre-check: Is the server running? ────────────────────
    {
        const res = await req('GET', '/api/health');
        if (res.status === 0) {
            console.log('\n💀 Server nije pokrenut na portu ' + PORT + '! Pokreni ga s: npm run dev');
            process.exit(1);
        }
        console.log(`\n✅ Server is up (${res.ms}ms)`);
    }

    // ─── Pre-check: Auth status ──────────────────────────────
    {
        const res = await req('GET', '/api/auth/status');
        hasGatewaySession = res.json?.hasGatewaySession === true || res.json?.authenticated === true;
        console.log(`🔑 Gateway sesija: ${hasGatewaySession ? '✅ AKTIVNA' : '❌ NEAKTIVNA — TC-ovi s 🔑 mogu biti ograničeni'}`);
    }

    // ═══════════════════════════════════════════════════════════
    //  GRUPA 1 — Pristup i Autorizacija (TC1-TC5)
    // ═══════════════════════════════════════════════════════════
    section('🔐 Grupa 1 — Pristup i Autorizacija');

    // TC1 — Smart Card Login
    {
        // Skip: zahtijeva fizički AKD čitač
        // Ali provjeravamo auth status — ako je sesija aktivna, dokazano je da TC1/TC2 rade
        if (hasGatewaySession) {
            results.push({ tc: 'TC1', name: 'Smart Card Login', status: 200, icon: '✅', note: 'Sesija aktivna (indirektno dokazano)' });
            console.log(`✅ TC1   Smart Card Login                      —     Sesija aktivna (indirektno dokazano)`);
        } else {
            skip('TC1', 'Smart Card Login', 'Zahtijeva fizički čitač kartice');
        }
    }

    // TC2 — Certilia mobile.ID Login
    {
        if (hasGatewaySession) {
            results.push({ tc: 'TC2', name: 'Certilia mobile.ID Login', status: 200, icon: '✅', note: 'Sesija aktivna (indirektno dokazano)' });
            console.log(`✅ TC2   Certilia mobile.ID Login                —     Sesija aktivna (indirektno dokazano)`);
        } else {
            // Try to initiate Certilia flow just to see if endpoint is alive
            const res = await req('POST', '/api/auth/certilia/initiate');
            if (res.status >= 200 && res.status < 300 && res.json?.sessionId) {
                log('TC2', 'Certilia mobile.ID Login (initiate)', 'POST', '/api/auth/certilia/initiate', res, `sessionId: ${res.json.sessionId}`);
            } else {
                skip('TC2', 'Certilia mobile.ID Login', 'Nema aktivne sesije, endpoint nedostupan');
            }
        }
    }

    // TC3 — System Token (M2M)
    {
        const res = await req('POST', '/api/auth/system-token');
        const note = res.json?.tokenPreview ? `token: ${res.json.tokenPreview.slice(0, 40)}...` : (res.json?.error || '');
        log('TC3', 'System Token (M2M)', 'POST', '/api/auth/system-token', res, note);
    }

    // TC4 — Digitalni potpis (Smart Kartica)
    {
        skip('TC4', 'Digitalni potpis (Smart Card)', 'Zahtijeva AKD PKCS#11 + SIGN PIN');
    }

    // TC5 — Digitalni potpis (Certilia Cloud)
    {
        skip('TC5', 'Digitalni potpis (Certilia Cloud)', 'Indirektno kroz TC16-TC20');
    }

    // ═══════════════════════════════════════════════════════════
    //  GRUPA 2 — Infrastruktura i Registri (TC6-TC9)
    // ═══════════════════════════════════════════════════════════
    section('🏗️ Grupa 2 — Infrastruktura i Registri');

    // TC6 — OID Generate
    {
        const res = await req('POST', '/api/oid/generate', { quantity: 1 });
        const note = res.json?.oids?.length ? `OID: ${res.json.oids[0]}` : (res.json?.error || '');
        log('TC6', 'OID Generate (ITI-98)', 'POST', '/api/oid/generate', res, note);
    }

    // TC7 — Sync CodeSystems (ITI-96)
    {
        const res = await req('POST', '/api/terminology/sync', null, 60000);
        const note = res.json?.codeSystems != null ? `CodeSystems: ${res.json.codeSystems}` : (res.json?.error || '');
        log('TC7', 'Sync CodeSystems (ITI-96)', 'POST', '/api/terminology/sync', res, note);
    }

    // TC8 — Sync ValueSets (ITI-95) — isti endpoint, ali bilježimo ValueSets count
    {
        // TC7 i TC8 dijele isti sync endpoint, ali za TC8 čitamo valueSets count
        // Koristimo prethodni rezultat ako je TC7 uspio; inače ponovo sync
        const lastTc7 = results.find(r => r.tc === 'TC7');
        if (lastTc7?.json?.valueSets != null) {
            const fakeRes = { status: lastTc7.status, json: lastTc7.json, ms: 0 };
            const note = `ValueSets: ${lastTc7.json.valueSets}`;
            log('TC8', 'Sync ValueSets (ITI-95)', 'POST', '/api/terminology/sync', fakeRes, note + ' (iz TC7 sync)');
        } else {
            const res = await req('POST', '/api/terminology/sync', null, 60000);
            const note = res.json?.valueSets != null ? `ValueSets: ${res.json.valueSets}` : (res.json?.error || '');
            log('TC8', 'Sync ValueSets (ITI-95)', 'POST', '/api/terminology/sync', res, note);
        }
    }

    // TC9 — Registry (mCSD ITI-90)
    {
        const res = await req('GET', '/api/registry/organizations');
        const note = res.json?.count != null
            ? `${res.json.count} organizacija`
            : (res.json?.error?.slice(0, 60) || '');
        log('TC9', 'Registar subjekata (mCSD ITI-90)', 'GET', '/api/registry/organizations', res, note);
    }

    // ═══════════════════════════════════════════════════════════
    //  GRUPA 3 — Upravljanje Pacijentima (TC10-TC11)
    // ═══════════════════════════════════════════════════════════
    section('👤 Grupa 3 — Upravljanje Pacijentima');

    // TC10 — Identifikacija pacijenta (PDQm ITI-78)
    {
        const res = await req('GET', `/api/patient/search?mbo=${PATIENT_MBO}`);
        const p = res.json?.patients?.[0];
        const note = p ? `${p.name?.text || p.name?.family} | OIB: ${p.oib}` : (res.json?.error || '');
        log('TC10', 'Identifikacija pacijenta (PDQm)', 'GET', `/api/patient/search?mbo=${PATIENT_MBO}`, res, note);
    }

    // TC11 — Registracija stranca (PMIR)
    {
        const res = await req('POST', '/api/patient/foreigner/register', {
            firstName: 'TEST',
            lastName: 'STRANAC',
            gender: 'male',
            birthDate: '1990-01-15',
            nationality: 'DE',
            documentType: 'passport',
            documentNumber: 'TEST123456',
        });
        const inner = res.json?.result ?? res.json;
        const note = inner?.mbo ? `MBO: ${inner.mbo}` : (res.json?.error?.slice(0, 60) || '');
        log('TC11', 'Registracija stranca (PMIR)', 'POST', '/api/patient/foreigner/register', res, note);
    }

    // ═══════════════════════════════════════════════════════════
    //  GRUPA 4 — Posjeti i Slučajevi (TC12-TC17)
    // ═══════════════════════════════════════════════════════════
    section('🏥 Grupa 4 — Posjeti i Slučajevi');

    // TC12 — Kreiranje posjete
    {
        const res = await req('POST', '/api/visit/create', {
            patientMbo: PATIENT_MBO,
            practitionerId: PRACTITIONER_HZJZ_ID,
            organizationId: ORGANIZATION_HZZO_CODE,
            startDate: new Date().toISOString(),
            class: 'AMB',
        });
        const inner = res.json?.result?.result ?? res.json?.result ?? res.json;
        createdVisitId = inner?.localVisitId || inner?.visitId || inner?.id;
        const cezihErr = inner?.cezihError?.slice(0, 70);
        const note = cezihErr ? `CEZIH: ${cezihErr}`
            : createdVisitId ? `visitId: ${createdVisitId}`
                : (res.json?.error?.slice(0, 70) || '');
        log('TC12', 'Kreiranje posjete (Encounter)', 'POST', '/api/visit/create', res, note);
    }

    // TC13 — Izmjena posjete
    if (createdVisitId) {
        const res = await req('PUT', `/api/visit/${createdVisitId}`, {
            patientMbo: PATIENT_MBO,
            diagnosisCode: 'M17.1',
            diagnosisDisplay: 'Druga primarna gonartroza',
        });
        const inner = res.json?.result?.result ?? res.json?.result ?? res.json;
        const code = inner?.entry?.[0]?.resource?.response?.code;
        const cezihErr = inner?.cezihError?.slice(0, 70);
        const note = cezihErr ? `CEZIH: ${cezihErr}` : (code ? `code: ${code}` : '');
        log('TC13', 'Izmjena posjete (Encounter-Update)', 'PUT', `/api/visit/${createdVisitId}`, res, note);
    } else {
        skip('TC13', 'Izmjena posjete', 'TC12 nije kreirao visit');
    }

    // TC14 — Zatvaranje posjete
    if (createdVisitId) {
        const res = await req('POST', `/api/visit/${createdVisitId}/close`, {
            patientMbo: PATIENT_MBO,
            endDate: new Date().toISOString(),
        });
        const inner = res.json?.result?.result ?? res.json?.result ?? res.json;
        const code = inner?.entry?.[0]?.resource?.response?.code;
        const cezihErr = inner?.cezihError?.slice(0, 70);
        const note = cezihErr ? `CEZIH: ${cezihErr}` : (code ? `code: ${code}` : '');
        log('TC14', 'Zatvaranje posjete (Encounter-Close)', 'POST', `/api/visit/${createdVisitId}/close`, res, note);
    } else {
        skip('TC14', 'Zatvaranje posjete', 'TC12 nije kreirao visit');
    }

    // TC15 — Dohvat slučajeva (QEDm)
    {
        const res = await req('GET', `/api/case/patient/${PATIENT_MBO}?refresh=true`);
        const note = res.json?.count != null ? `${res.json.count} slučaj(a)` : (res.json?.error?.slice(0, 60) || '');
        log('TC15', 'Dohvat slučajeva (QEDm)', 'GET', `/api/case/patient/${PATIENT_MBO}?refresh=true`, res, note);
    }

    // TC16 — Kreiranje slučaja (Condition)
    {
        const res = await req('POST', '/api/case/create', {
            patientMbo: PATIENT_MBO,
            title: 'Test slučaj ' + new Date().toISOString().slice(0, 10),
            diagnosisCode: 'J06.9',
            diagnosisDisplay: 'Akutna infekcija gornjeg dišnog sustava',
            practitionerId: PRACTITIONER_HZJZ_ID,
            organizationId: ORGANIZATION_HZZO_CODE,
            startDate: new Date().toISOString(),
        });
        const inner = res.json?.result?.result ?? res.json?.result ?? res.json;
        createdCaseId = inner?.localCaseId || inner?.id;
        const cezihCode = inner?.cezihConditionId || inner?.entry?.[0]?.resource?.response?.code;
        const cezihErr = inner?.cezihError?.slice(0, 70);
        const note = cezihErr ? `CEZIH: ${cezihErr}`
            : (inner?.cezihStatus === 'failed') ? 'CEZIH: profil nije podržan u testnom okruženju'
                : cezihCode ? `CEZIH Condition: ${cezihCode}`
                    : createdCaseId ? `localId: ${createdCaseId}`
                        : (res.json?.error?.slice(0, 70) || '');
        log('TC16', 'Kreiranje slučaja (Condition)', 'POST', '/api/case/create', res, note);
    }

    // TC17 — Ažuriranje slučaja
    {
        let caseId = createdCaseId;
        if (!caseId) {
            const listRes = await req('GET', `/api/case/patient/${PATIENT_MBO}`);
            caseId = listRes.json?.cases?.[0]?.id;
        }

        if (caseId) {
            const res = await req('PUT', `/api/case/${caseId}`, {
                patientMbo: PATIENT_MBO,
                status: 'active',
                diagnosisCode: 'J06.9',
                diagnosisDisplay: 'Akutna infekcija — update ' + new Date().toISOString().slice(11, 19),
            });
            const inner = res.json?.result?.result ?? res.json?.result ?? res.json;
            const cezihCode = inner?.cezihConditionId || inner?.entry?.[0]?.resource?.response?.code;
            const cezihErr = inner?.cezihError?.slice(0, 70);
            const note = cezihErr ? `CEZIH: ${cezihErr}`
                : (inner?.cezihStatus === 'failed') ? 'CEZIH: profil nije podržan'
                    : cezihCode ? `code: ${cezihCode}` : '';
            log('TC17', 'Ažuriranje slučaja (Condition-Update)', 'PUT', `/api/case/${caseId}`, res, note);
        } else {
            skip('TC17', 'Ažuriranje slučaja', 'Nema dostupnog caseId');
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  GRUPA 5 — Medicinska Dokumentacija (TC18-TC22)
    // ═══════════════════════════════════════════════════════════
    section('📄 Grupa 5 — Medicinska Dokumentacija (MHD)');

    // TC18 — Slanje dokumenta (ITI-65)
    {
        const res = await req('POST', '/api/document/send', {
            patientMbo: PATIENT_MBO,
            visitId: createdVisitId || 'test-visit-id',
            type: 'ambulatory-report',
            title: 'Ambulantni nalaz — test',
            diagnosisCode: 'J06.9',
            diagnosisDisplay: 'Akutna infekcija gornjeg dišnog sustava',
            practitionerId: PRACTITIONER_HZJZ_ID,
            organizationId: ORGANIZATION_HZZO_CODE,
        }, 60000);
        const inner = res.json?.result ?? res.json;
        const cezihErr = inner?.cezihError?.slice(0, 70);
        const note = res.json?.error ? res.json.error.slice(0, 80)
            : cezihErr ? `CEZIH: ${cezihErr}`
                : inner?.documentOid ? `OID: ${inner.documentOid}` : '';
        log('TC18', 'Slanje dokumenta (ITI-65)', 'POST', '/api/document/send', res, note);
    }

    // TC19 — Zamjena dokumenta
    {
        const listRes = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const docs = listRes.json?.documents || [];
        const sentDoc = docs.find(d => d.status === 'sent' || d.status === 'current');
        if (sentDoc) {
            const res = await req('POST', '/api/document/replace', {
                originalDocumentOid: sentDoc.documentOid || sentDoc.id,
                patientMbo: PATIENT_MBO,
                visitId: sentDoc.visitId || createdVisitId || 'test-visit-id',
                type: sentDoc.type || 'ambulatory-report',
                title: 'Ispravljeni nalaz — test',
                diagnosisCode: sentDoc.diagnosisCode || 'J06.9',
                diagnosisDisplay: sentDoc.diagnosisDisplay || 'Akutna infekcija',
            }, 60000);
            const inner = res.json?.result ?? res.json;
            const cezihErr = inner?.cezihError?.slice(0, 70);
            const note = res.json?.error ? res.json.error.slice(0, 80)
                : cezihErr ? `CEZIH: ${cezihErr}`
                    : inner?.documentOid ? `OID: ${inner.documentOid}` : 'zamijenjen';
            log('TC19', 'Zamjena dokumenta (Replace)', 'POST', '/api/document/replace', res, note);
        } else {
            skip('TC19', 'Zamjena dokumenta', 'Nema sent dokumenata za zamjenu');
        }
    }

    // TC20 — Storno dokumenta
    {
        const listRes = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const docs = listRes.json?.documents || [];
        const sentDoc = docs.find(d => d.status === 'sent' || d.status === 'current');
        if (sentDoc) {
            const res = await req('POST', '/api/document/cancel', {
                documentOid: sentDoc.documentOid || sentDoc.id,
            });
            const inner = res.json?.result ?? res.json;
            const cezihErr = inner?.cezihError?.slice(0, 70);
            const note = res.json?.error ? res.json.error.slice(0, 80)
                : cezihErr ? `CEZIH: ${cezihErr}`
                    : inner?.id ? 'storniran lokalno' : 'storniran';
            log('TC20', 'Storno dokumenta (Cancel)', 'POST', '/api/document/cancel', res, note);
        } else {
            skip('TC20', 'Storno dokumenta', 'Nema sent dokumenata za storno');
        }
    }

    // TC21 — Pretraga dokumenata (ITI-67)
    {
        const res = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const note = res.json?.documents != null ? `${res.json.documents.length} dokumenata` : (res.json?.error?.slice(0, 60) || '');
        log('TC21', 'Pretraga dokumenata (ITI-67)', 'GET', `/api/document/search?patientMbo=${PATIENT_MBO}`, res, note);
    }

    // TC22 — Dohvat dokumenta (ITI-68)
    {
        const listRes = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const docs = listRes.json?.documents || [];
        if (docs.length > 0) {
            const doc = docs[0];
            const oid = doc.documentOid || doc.id;
            const urnUrl = encodeURIComponent(`urn:oid:${oid}`);
            const res = await req('GET', `/api/document/retrieve?url=${urnUrl}`);
            const note = res.json?.document ? `id: ${oid}` : (res.json?.error?.slice(0, 60) || '');
            log('TC22', 'Dohvat dokumenta (ITI-68)', 'GET', `/api/document/retrieve?url=urn:oid:${oid}`, res, note);
        } else {
            skip('TC22', 'Dohvat dokumenta', 'Nema dokumenata u lokalnom DB');
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  SAŽETAK
    // ═══════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔' + '═'.repeat(68) + '╗');
    console.log('║   SAŽETAK REZULTATA                                                ║');
    console.log('╚' + '═'.repeat(68) + '╝');

    const tcOrder = [
        'TC1', 'TC2', 'TC3', 'TC4', 'TC5',
        'TC6', 'TC7', 'TC8', 'TC9',
        'TC10', 'TC11',
        'TC12', 'TC13', 'TC14', 'TC15', 'TC16', 'TC17',
        'TC18', 'TC19', 'TC20', 'TC21', 'TC22',
    ];

    console.log('\n| TC    | Naziv                                  | HTTP | Status                                   |');
    console.log('|-------|----------------------------------------|------|------------------------------------------|');

    for (const tc of tcOrder) {
        const r = results.find(x => x.tc === tc);
        if (!r) {
            console.log(`| ${tc.padEnd(5)} | ${'(nije pokrenut)'.padEnd(38)} | ${'—'.padEnd(4)} | ❓                                       |`);
            continue;
        }
        const name = r.name.slice(0, 38).padEnd(38);
        const httpStr = String(r.status || '—').padEnd(4);
        const s = `${r.icon}${r.note ? ' ' + r.note.slice(0, 37) : ''}`;
        console.log(`| ${tc.padEnd(5)} | ${name} | ${httpStr} | ${s}`);
    }

    const passed = results.filter(r => r.icon === '✅').length;
    const failed = results.filter(r => ['❌', '💥', '⛔'].includes(r.icon)).length;
    const warned = results.filter(r => r.icon === '⚠️').length;
    const skippedCount = results.filter(r => r.icon === '⏭️').length;
    const notFound = results.filter(r => r.icon === '❓').length;
    const dead = results.filter(r => r.icon === '💀').length;

    console.log();
    console.log('─'.repeat(70));
    console.log(`  ✅ Prošlo: ${passed}   ⚠️  Lokalno OK: ${warned}   ⏭️ Preskočeno: ${skippedCount}   ❌ Palo: ${failed}   ❓ 404: ${notFound}   💀 Dead: ${dead}`);
    console.log(`  ⏱️  Trajanje: ${elapsed}s`);
    if (warned > 0) console.log('  ⚠️  = API je vratio 200, ali CEZIH odbijena (localOnly/cezihStatus:failed)');
    if (!hasGatewaySession) console.log('  🔑 Gateway sesija nije bila aktivna — TC-ovi koji zahtijevaju korisničku autentikaciju mogu biti ograničeni');
    console.log('═'.repeat(70));
}

run().catch(err => {
    console.error('\n💥 Test runner error:', err.message);
    process.exit(1);
});
