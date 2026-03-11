const ax = require('axios');

const base = 'https://certws2.cezih.hr:9443/services-router/gateway/terminology-services/api/v1';
const vsUrl = 'http://fhir.cezih.hr/specifikacije/ValueSet/document-type';

// Get system token first
async function run() {
    // Get token using client_credentials from .env
    const dotenv = require('dotenv');
    dotenv.config();

    const tokenUrl = process.env.CEZIH_TOKEN_URL || 'https://certws2.cezih.hr:9443/auth/realms/cezih-ext/protocol/openid-connect/token';

    let token;
    try {
        const r = await ax.post(tokenUrl, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.CEZIH_CLIENT_ID,
            client_secret: process.env.CEZIH_CLIENT_SECRET,
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        token = r.data.access_token;
        console.log('Token OK');
    } catch (e) {
        console.log('Token fail:', e.response?.status, e.message);
        return;
    }

    const h = { Authorization: 'Bearer ' + token };

    // 1. Try $expand
    console.log('\n--- $expand on 9443 ---');
    try {
        const r = await ax.get(base + '/ValueSet/$expand', { headers: h, params: { url: vsUrl } });
        console.log('$expand OK:', r.data?.expansion?.contains?.length, 'concepts');
        r.data.expansion.contains.slice(0, 5).forEach(c => console.log('  ', c.code, '-', c.display));
        return;
    } catch (e) { console.log('$expand FAIL:', e.response?.status); }

    // 2. Try GET ValueSet?url=... (search by URL)
    console.log('\n--- GET ValueSet?url= on 9443 ---');
    try {
        const r = await ax.get(base + '/ValueSet', { headers: h, params: { url: vsUrl } });
        console.log('Search OK:', r.status, 'total:', r.data.total);
        const entries = r.data.entry || [];
        if (entries[0]) {
            const vs = entries[0].resource;
            console.log('  Name:', vs.name, '/ compose?', !!vs.compose, '/ expansion?', !!vs.expansion);
            if (vs.compose?.include?.[0]?.concept) {
                console.log('  Inline concepts:', vs.compose.include[0].concept.length);
                vs.compose.include[0].concept.slice(0, 5).forEach(c => console.log('    ', c.code, '-', c.display));
            }
        }
    } catch (e) { console.log('Search FAIL:', e.response?.status); }

    // 3. Try GET all ValueSets (see what's available)
    console.log('\n--- All ValueSets on 9443 ---');
    try {
        const r = await ax.get(base + '/ValueSet', { headers: h, params: { _count: 5 } });
        const entries = r.data.entry || [];
        console.log('Total:', r.data.total, 'Showing first 5:');
        entries.forEach(e => console.log('  ', e.resource.url, '-', e.resource.name));
    } catch (e) { console.log('List FAIL:', e.response?.status); }
}

run();
