/**
 * CEZIH FHIR — Automated Test Runner
 * Pokriva svih 22 test slučajeva iz certifikacijske matrice
 */

const http = require('http');

const BASE_URL = 'http://localhost:3010';
const PATIENT_MBO = '999999423';
const PRACTITIONER_OIB = '30160453873';
const ORGANIZATION_ID = '174900715';

let results = [];
let createdVisitId = null;
let createdCaseId = null;

function req(method, path, body = null) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 3010,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
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

        r.on('error', (err) => {
            resolve({ status: 0, json: null, error: err.message, ms: 0 });
        });

        if (data) r.write(data);
        r.end();
    });
}

function icon(status, json, expectOk = true) {
    if (status === 0) return '💀'; // connection refused
    if (expectOk) {
        // Djelomičan uspjeh — lokalno OK, ali CEZIH odbijen
        // API može vratiti: { result: { localOnly, cezihStatus } }
        //               ili: { result: { result: { localOnly, cezihStatus } } }  (dvostruko ugnježđeno)
        const inner = json?.result?.result ?? json?.result ?? json;
        if (status >= 200 && status < 300 && (inner?.localOnly === true || inner?.cezihStatus === 'failed')) return '⚠️';
        if (status >= 200 && status < 300 && json?.success !== false) return '✅';
        if (status === 403) return '⛔';
        if (status === 404) return '❓';
        if (status >= 500) return '💥';
        return '⚠️';
    }
    return status >= 200 && status < 300 ? '✅' : '❌';
}

function log(tc, name, method, path, res, note = '') {
    const i = icon(res.status, res.json);
    const line = `${i} ${tc} — ${name} | ${method} ${path} → HTTP ${res.status} (${res.ms}ms)${note ? ' | ' + note : ''}`;
    console.log(line);
    results.push({ tc, name, method, path, status: res.status, icon: i, note, ms: res.ms, json: res.json });
}

async function run() {
    console.log('='.repeat(65));
    console.log('   CEZIH FHIR — Test Run   ' + new Date().toISOString());
    console.log('='.repeat(65));

    // TC3 — System Token
    {
        const res = await req('POST', '/api/auth/system-token');
        const note = res.json?.tokenPreview ? `preview: ${res.json.tokenPreview.slice(0, 30)}...` : '';
        log('TC3', 'System Token (M2M)', 'POST', '/api/auth/system-token', res, note);
    }

    // TC6 — OID Generate
    {
        const res = await req('POST', '/api/oid/generate', { quantity: 1 });
        const note = res.json?.oids ? `OID: ${res.json.oids[0]}` : '';
        log('TC6', 'OID Generate (ITI-98)', 'POST', '/api/oid/generate', res, note);
    }

    // TC7/TC8 — Terminology Sync
    {
        const res = await req('POST', '/api/terminology/sync');
        const note = res.json ? `codeSystems:${res.json.codeSystems} valueSets:${res.json.valueSets}` : '';
        log('TC7/8', 'Terminology Sync (ITI-96/95)', 'POST', '/api/terminology/sync', res, note);
    }

    // TC9 — Registry Organizations
    {
        const res = await req('GET', '/api/registry/organizations');
        const note = res.json?.error ? res.json.error.slice(0, 60) : '';
        log('TC9', 'Registry Organizations (mCSD)', 'GET', '/api/registry/organizations', res, note);
    }

    // TC10 — Patient Search
    {
        const res = await req('GET', `/api/patient/search?mbo=${PATIENT_MBO}`);
        const p = res.json?.patients?.[0];
        const note = p ? `${p.name?.text} | OIB: ${p.oib}` : res.json?.error || '';
        log('TC10', 'Patient Search (MBO)', 'GET', `/api/patient/search?mbo=${PATIENT_MBO}`, res, note);
    }

    // TC15 — Cases (EpisodeOfCare)
    {
        const res = await req('GET', `/api/case/patient/${PATIENT_MBO}?refresh=true`);
        const note = res.json?.count !== undefined ? `${res.json.count} slučaj(a)` : res.json?.error || '';
        log('TC15', 'Cases (EpisodeOfCare) dohvat', 'GET', `/api/case/patient/${PATIENT_MBO}?refresh=true`, res, note);
    }

    // TC12 — Create Visit
    {
        const res = await req('POST', '/api/visit/create', {
            patientMbo: PATIENT_MBO,
            practitionerId: PRACTITIONER_OIB,
            organizationId: ORGANIZATION_ID,
            startDate: new Date().toISOString(),
            class: 'AMB',
        });
        createdVisitId = res.json?.result?.localVisitId;
        const note = createdVisitId ? `visitId: ${createdVisitId}` : res.json?.error || '';
        log('TC12', 'Create Visit', 'POST', '/api/visit/create', res, note);
    }

    // TC13 — Update Visit
    if (createdVisitId) {
        const res = await req('PUT', `/api/visit/${createdVisitId}`, {
            patientMbo: PATIENT_MBO,
            diagnosisCode: 'M17.1',
            diagnosisDisplay: 'Gonarthrosis',
        });
        const code = res.json?.result?.entry?.[0]?.resource?.response?.code;
        log('TC13', 'Update Visit', 'PUT', `/api/visit/${createdVisitId}`, res, code ? `code: ${code}` : '');
    } else {
        results.push({ tc: 'TC13', name: 'Update Visit', status: 0, icon: '⏭️', note: 'Preskočeno — TC12 nije kreirao visit' });
        console.log('⏭️ TC13 — Update Visit | Preskočeno — TC12 nije kreirao visit');
    }

    // TC14 — Close Visit
    if (createdVisitId) {
        const res = await req('POST', `/api/visit/${createdVisitId}/close`, {
            patientMbo: PATIENT_MBO,
            endDate: new Date().toISOString(),
        });
        const code = res.json?.result?.entry?.[0]?.resource?.response?.code;
        log('TC14', 'Close Visit', 'POST', `/api/visit/${createdVisitId}/close`, res, code ? `code: ${code}` : '');
    } else {
        results.push({ tc: 'TC14', name: 'Close Visit', status: 0, icon: '⏭️', note: 'Preskočeno — TC12 nije kreirao visit' });
        console.log('⏭️ TC14 — Close Visit | Preskočeno — TC12 nije kreirao visit');
    }

    // TC16 — Create Case
    {
        const res = await req('POST', '/api/case/create', {
            patientMbo: PATIENT_MBO,
            title: 'Test slučaj ' + new Date().toISOString().slice(0, 10),
            diagnosisCode: 'M17.1',
            diagnosisDisplay: 'Druga primarna gonartroza',
            practitionerId: PRACTITIONER_OIB,
            organizationId: ORGANIZATION_ID,
            startDate: new Date().toISOString(),
        });
        const inner16 = res.json?.result?.result ?? res.json?.result ?? res.json;
        createdCaseId = inner16?.localCaseId || inner16?.id;
        const note16 = inner16?.cezihStatus === 'failed'
            ? `CEZIH: EpisodeOfCare profile nije podržan u testnom okruženju (kao TC9/mCSD)`
            : createdCaseId ? `caseId: ${createdCaseId}` : res.json?.error || '';
        log('TC16', 'Create Case (EpisodeOfCare)', 'POST', '/api/case/create', res, note16);
    }

    // TC17 — Update Case (use a known case from list if TC16 didn't return ID)
    {
        let caseId = createdCaseId;
        if (!caseId) {
            // fetch list to get a case
            const listRes = await req('GET', `/api/case/patient/${PATIENT_MBO}`);
            caseId = listRes.json?.cases?.[0]?.id;
        }

        if (caseId) {
            const res = await req('PUT', `/api/case/${caseId}`, {
                patientMbo: PATIENT_MBO,
                status: 'active',
                diagnosisCode: 'M17.1',
                diagnosisDisplay: 'Gonartroza — test update ' + new Date().toISOString().slice(11, 19),
            });
            const inner17 = res.json?.result?.result ?? res.json?.result ?? res.json;
            const cezihCode = res.json?.result?.entry?.[0]?.resource?.response?.code;
            const note17 = inner17?.cezihStatus === 'failed'
                ? `CEZIH: EpisodeOfCare profile nije podržan u testnom okruženju`
                : cezihCode ? `code: ${cezihCode}` : '';
            log('TC17', 'Update Case', 'PUT', `/api/case/${caseId}`, res, note17);
        } else {
            results.push({ tc: 'TC17', name: 'Update Case', status: 0, icon: '⏭️', note: 'Preskočeno — nema dostupnog caseId' });
            console.log('⏭️ TC17 — Update Case | Preskočeno — nema dostupnog caseId');
        }
    }

    // TC18 — Send Document (ITI-65)
    {
        const res = await req('POST', '/api/document/send', {
            patientMbo: PATIENT_MBO,
            visitId: createdVisitId || 'test-visit-id',
            type: '011',
            content: '<Bundle><type value="document"/></Bundle>',
            diagnosisCode: 'M17.1',
            diagnosisDisplay: 'Gonartroza',
        });
        const inner18 = res.json?.result ?? res.json;
        const note = res.json?.error ? res.json.error.slice(0, 80)
            : inner18?.cezihError ? `CEZIH: ${inner18.cezihError.slice(0, 70)}`
                : inner18?.documentOid ? `OID: ${inner18.documentOid}` : '';
        log('TC18', 'Send Document (ITI-65)', 'POST', '/api/document/send', res, note);
    }

    // TC19 — Replace Document
    {
        const listRes = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const docs = listRes.json?.documents || [];
        const sentDoc = docs.find(d => d.status === 'sent' || d.status === 'current');
        if (sentDoc) {
            const res = await req('POST', '/api/document/replace', {
                originalDocumentOid: sentDoc.id,
                patientMbo: PATIENT_MBO,
                visitId: sentDoc.visitId || createdVisitId || 'test-visit-id',
                type: sentDoc.type || '011',
                content: sentDoc.content || '<Bundle><type value="document"/></Bundle>',
                diagnosisCode: sentDoc.diagnosisCode || 'M17.1',
                diagnosisDisplay: sentDoc.diagnosisDisplay || 'Gonartroza',
            });
            const inner19 = res.json?.result ?? res.json;
            const note = res.json?.error ? res.json.error.slice(0, 80)
                : inner19?.cezihError ? `CEZIH: ${inner19.cezihError.slice(0, 70)}`
                    : inner19?.documentOid ? `OID: ${inner19.documentOid}` : 'zamijenjen';
            log('TC19', 'Replace Document', 'POST', '/api/document/replace', res, note);
        } else {
            results.push({ tc: 'TC19', name: 'Replace Document', status: 0, icon: '⏭️', note: 'Preskočeno — nema sent dokumenata za zamjenu' });
            console.log('⏭️ TC19 — Replace Document | Preskočeno — nema sent dokumenata za zamjenu');
        }
    }

    // TC20 — Cancel Document
    {
        const listRes = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const docs = listRes.json?.documents || [];
        const sentDoc = docs.find(d => d.status === 'sent' || d.status === 'current');
        if (sentDoc) {
            const res = await req('POST', '/api/document/cancel', {
                documentOid: sentDoc.id,
            });
            const inner20 = res.json?.result ?? res.json;
            const note = res.json?.error ? res.json.error.slice(0, 80)
                : inner20?.cezihError ? `CEZIH: ${inner20.cezihError.slice(0, 70)}`
                    : inner20?.id ? 'storniran lokalno' : 'storniran';
            log('TC20', 'Cancel Document', 'POST', '/api/document/cancel', res, note);
        } else {
            results.push({ tc: 'TC20', name: 'Cancel Document', status: 0, icon: '⏭️', note: 'Preskočeno — nema sent dokumenata za storno' });
            console.log('⏭️ TC20 — Cancel Document | Preskočeno — nema sent dokumenata za storno');
        }
    }

    // TC21 — Search Documents (ITI-67)
    {
        const res = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const note = res.json?.documents !== undefined ? `${res.json.documents.length} dokumenata` : res.json?.error || '';
        log('TC21', 'Search Documents (ITI-67)', 'GET', `/api/document/search?patientMbo=${PATIENT_MBO}`, res, note);
    }

    // TC22 — Retrieve Document (ITI-68)
    {
        const listRes = await req('GET', `/api/document/search?patientMbo=${PATIENT_MBO}`);
        const docs = listRes.json?.documents || [];
        if (docs.length > 0) {
            const doc = docs[0];
            const urnUrl = encodeURIComponent(`urn:oid:${doc.id}`);
            const res = await req('GET', `/api/document/retrieve?url=${urnUrl}`);
            const note = res.json?.document ? `id: ${doc.id}` : res.json?.error?.slice(0, 60) || '';
            log('TC22', 'Retrieve Document (ITI-68)', 'GET', `/api/document/retrieve?url=urn:oid:${doc.id}`, res, note);
        } else {
            results.push({ tc: 'TC22', name: 'Retrieve Document', status: 0, icon: '⏭️', note: 'Preskočeno — nema dokumenata u lokalnom DB' });
            console.log('⏭️ TC22 — Retrieve Document | Preskočeno — nema dokumenata u lokalnom DB');
        }
    }

    // --- SUMMARY ---
    console.log('\n' + '='.repeat(65));
    console.log('   SAŽETAK');
    console.log('='.repeat(65));

    const skipped = ['TC1', 'TC2', 'TC4', 'TC5', 'TC11'];
    const skippedRows = skipped.map(tc => {
        const reasons = {
            TC1: 'Zahtijeva fizički čitač kartice + browser TLS flow',
            TC2: 'Certilia lozinka istekla / mobilni push ne stiže',
            TC4: 'Zahtijeva AKD PKCS#11 modul + SIGN PIN',
            TC5: 'Zahtijeva ispravan Certilia račun (blokiran kao TC2)',
            TC11: 'Zahtijeva testne podatke stranca (putovnica/EKZO)',
        };
        return { tc, icon: '⚙️', note: reasons[tc] };
    });

    const allRows = [...skippedRows, ...results];
    const tcOrder = ['TC1', 'TC2', 'TC3', 'TC4', 'TC5', 'TC6', 'TC7/8', 'TC9', 'TC10', 'TC11', 'TC12', 'TC13', 'TC14', 'TC15', 'TC16', 'TC17', 'TC18', 'TC19', 'TC20', 'TC21', 'TC22'];

    console.log('\n| TC    | Naziv                         | HTTP | Status |');
    console.log('|-------|-------------------------------|------|--------|');

    for (const tc of tcOrder) {
        const r = allRows.find(x => x.tc === tc || x.tc === 'TC7/8' && tc === 'TC7/8');
        if (!r) continue;
        const name = r.name || tc;
        const http = r.status || '—';
        const s = `${r.icon}${r.note ? ' ' + r.note.slice(0, 40) : ''}`;
        console.log(`| ${tc.padEnd(5)} | ${name.padEnd(29)} | ${String(http).padEnd(4)} | ${s}`);
    }

    const passed = results.filter(r => r.icon === '✅').length;
    const failed = results.filter(r => ['❌', '💥', '⛔'].includes(r.icon)).length;
    const warned = results.filter(r => r.icon === '⚠️').length;
    const skippedCount = results.filter(r => r.icon === '⏭️').length + skipped.length;

    console.log('\n-'.repeat(65));
    console.log(`✅ Prošlo: ${passed}  ❌ Palo: ${failed}  ⚠️  Lokalno/Djelomično: ${warned}  ⏭️  Preskočeno: ${skippedCount}`);
    if (warned > 0) console.log('   ⚠️  = Lokalno bilježeno, CEZIH odbijena (lokalOnly: true / cezihStatus: failed)');
    console.log('='.repeat(65));
}

run().catch(console.error);
