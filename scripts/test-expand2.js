const ax = require('axios');
const db = require('better-sqlite3')('cezih.db');

// System auth (OAuth2 token)
async function getSystemToken() {
    const r = await ax.post('https://certws2.cezih.hr:9443/auth/realms/cezih-ext/protocol/openid-connect/token',
        new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.CEZIH_CLIENT_ID || 'fhir-app',
            client_secret: process.env.CEZIH_CLIENT_SECRET || '',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return r.data.access_token;
}

// Gateway auth (cookies)
const gw = db.prepare("SELECT value FROM settings WHERE key = 'gateway_session'").get();
const s = JSON.parse(gw.value);
const gwHeaders = { Cookie: s.cookies };

const valuesets = [
    'http://fhir.cezih.hr/specifikacije/ValueSet/document-type',
    'http://fhir.cezih.hr/specifikacije/ValueSet/djelatnosti-zz',
    'http://ent.hr/fhir/ValueSet/ehe-message-types',
];

const base9443 = 'https://certws2.cezih.hr:9443/services-router/gateway/terminology-services/api/v1';
const base8443 = 'https://certws2.cezih.hr:8443/services-router/gateway/terminology-services/api/v1';

(async () => {
    // Get system token
    let sysHeaders;
    try {
        const token = await getSystemToken();
        sysHeaders = { Authorization: 'Bearer ' + token };
        console.log('Got system token OK');
    } catch (e) {
        console.log('System token failed:', e.message);
    }

    for (const vsUrl of valuesets) {
        console.log('\n=== ' + vsUrl + ' ===');

        // Try 9443 GET with system auth
        if (sysHeaders) {
            try {
                const r = await ax.get(base9443 + '/ValueSet/$expand', { headers: sysHeaders, params: { url: vsUrl } });
                console.log('  9443 GET OK:', r.status, 'concepts:', r.data?.expansion?.contains?.length);
                continue;
            } catch (e) { console.log('  9443 GET FAIL:', e.response?.status, e.response?.data?.issue?.[0]?.diagnostics || ''); }
        }

        // Try 8443 GET with gateway auth
        try {
            const r = await ax.get(base8443 + '/ValueSet/$expand', { headers: gwHeaders, params: { url: vsUrl } });
            console.log('  8443 GET OK:', r.status, 'concepts:', r.data?.expansion?.contains?.length);
        } catch (e) { console.log('  8443 GET FAIL:', e.response?.status, e.response?.data?.issue?.[0]?.diagnostics || ''); }
    }
})();
