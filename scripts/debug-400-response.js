const axios = require('axios');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function getSystemToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CEZIH_CLIENT_ID);
    params.append('client_secret', process.env.CEZIH_CLIENT_SECRET);

    const response = await axios.post(process.env.CEZIH_TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data.access_token;
}

async function run() {
    const token = await getSystemToken();
    console.log('Got token.\n');

    // Checking more paths we haven'tested, and show full response body for known 400s
    const urlsToDebug = [
        'https://certws2.cezih.hr:8443/services-router/gateway/mcsd-services/api/v1/metadata',
        'https://certws2.cezih.hr:8443/services-router/gateway/patient-registry-services/api/v1/metadata',
        'https://certws2.cezih.hr:8443/services-router/gateway/mcsd-services/api/v1/Organization',
        'https://certws2.cezih.hr:8443/services-router/gateway/mcsd-services/api/v1/Practitioner',
        // Without Auth to see if that changes anything
        'https://certws2.cezih.hr:8443/services-router/gateway/mcsd-services/api/v1/metadata',
    ];

    console.log('--- Full response bodies for key 400 responses ---\n');

    let i = 0;
    for (const url of urlsToDebug) {
        i++;
        const withAuth = i <= 4;
        try {
            const res = await axios.get(url, {
                headers: withAuth ? {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/fhir+json'
                } : {
                    'Accept': 'application/fhir+json'
                },
                httpsAgent,
                validateStatus: () => true,
                timeout: 5000
            });

            console.log(`[HTTP ${res.status}] ${url} (${withAuth ? 'WITH auth' : 'NO auth'})`);
            console.log('Response body:', JSON.stringify(res.data, null, 2).substring(0, 800));
            console.log('---');
        } catch (e) {
            console.log(`[ERROR] ${url}: ${e.message}`);
        }
    }

    console.log('\n--- Also trying: known working OID base path + /metadata ---');
    // We know OID works at:
    // https://certws2.cezih.hr:9443/services-router/gateway/identifier-registry-services/api/v1/oid/generateOIDBatch
    // So let's try /metadata on that same base
    const oidBase = 'https://certws2.cezih.hr:9443/services-router/gateway/identifier-registry-services/api/v1';
    const oidMetadata = `${oidBase}/metadata`;
    try {
        const res = await axios.get(oidMetadata, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/fhir+json' },
            httpsAgent,
            validateStatus: () => true,
            timeout: 5000
        });
        console.log(`[HTTP ${res.status}] ${oidMetadata}`);
        console.log('Response body:', JSON.stringify(res.data, null, 2).substring(0, 1200));
    } catch (e) {
        console.log(`[ERROR] ${oidMetadata}: ${e.message}`);
    }
}

run().catch(e => console.error("Script failed:", e.message));
