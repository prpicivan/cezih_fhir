const db = require('better-sqlite3')('cezih.db');
const ax = require('axios');
const gw = db.prepare("SELECT value FROM settings WHERE key = 'gateway_session'").get();
const s = JSON.parse(gw.value);
const h = { Cookie: s.cookies };

ax.get('https://certws2.cezih.hr:8443/services-router/gateway/ihe-qedm-services/api/v1/Condition', {
    headers: h,
    params: { 'patient:identifier': 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO|999999423', _count: 2 }
}).then(r => {
    const entries = r.data.entry || [];
    console.log('Total:', r.data.total || entries.length);
    entries.forEach((x, i) => {
        console.log(`\n--- Entry ${i} ---`);
        console.log(JSON.stringify(x.resource, null, 2));
    });
}).catch(e => console.log('ERR:', e.response?.status, JSON.stringify(e.response?.data).substring(0, 500)));
