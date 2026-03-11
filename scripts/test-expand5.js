const ax = require('axios');
const dotenv = require('dotenv'); dotenv.config();

async function run() {
    const tokenUrl = process.env.CEZIH_TOKEN_URL || 'https://certws2.cezih.hr:9443/auth/realms/cezih-ext/protocol/openid-connect/token';
    const r = await ax.post(tokenUrl, new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.CEZIH_CLIENT_ID,
        client_secret: process.env.CEZIH_CLIENT_SECRET,
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const h = { Authorization: 'Bearer ' + r.data.access_token };

    const base = 'https://certws2.cezih.hr:9443/services-router/gateway/terminology-services/api/v1';
    const vsUrl = 'http://fhir.cezih.hr/specifikacije/ValueSet/document-type';

    const res = await ax.get(base + '/ValueSet', { headers: h, params: { url: vsUrl } });
    const vs = res.data.entry[0].resource;

    console.log('ValueSet:', vs.name);
    console.log('compose.include count:', vs.compose.include.length);

    for (const inc of vs.compose.include) {
        console.log('\n  System:', inc.system);
        console.log('  Concepts:', inc.concept?.length || 'none (filter-based)');
        if (inc.concept) {
            inc.concept.forEach(c => console.log('    ', c.code, '-', c.display));
        }
        if (inc.filter) {
            console.log('  Filters:', JSON.stringify(inc.filter));
        }
    }
}
run();
