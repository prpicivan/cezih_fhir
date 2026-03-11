const ax = require('axios');
const db = require('better-sqlite3')('cezih.db');
const gw = db.prepare("SELECT value FROM settings WHERE key = 'gateway_session'").get();
const s = JSON.parse(gw.value);
const h = { Cookie: s.cookies };

const base = 'https://certws2.cezih.hr:8443/services-router/gateway/terminology-services/api/v1';
const vsUrl = 'http://fhir.cezih.hr/specifikacije/ValueSet/document-type';

(async () => {
    // Try GET ValueSet?url=... (returns full ValueSet with compose/expansion inline?)
    try {
        const r = await ax.get(base + '/ValueSet', { headers: h, params: { url: vsUrl } });
        console.log('ValueSet search OK:', r.status);
        const entries = r.data.entry || [];
        console.log('Entries:', entries.length);
        if (entries[0]) {
            const vs = entries[0].resource;
            console.log('Name:', vs.name, 'Title:', vs.title);
            console.log('Has compose?', !!vs.compose);
            console.log('Has expansion?', !!vs.expansion);
            if (vs.compose?.include) {
                console.log('Compose includes:', vs.compose.include.length);
                const inc = vs.compose.include[0];
                console.log('First include system:', inc.system);
                console.log('Concepts:', inc.concept?.length || 0);
                if (inc.concept) {
                    inc.concept.slice(0, 5).forEach(c => console.log('  ', c.code, '-', c.display));
                }
            }
        }
    } catch (e) {
        console.log('ValueSet search FAIL:', e.response?.status, e.response?.data?.issue?.[0]?.diagnostics || e.message);
    }
})();
