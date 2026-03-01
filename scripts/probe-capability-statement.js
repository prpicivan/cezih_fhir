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

    const baseUrls = [
        'https://certws2.cezih.hr:8443/services-router/gateway',
        'https://certws2.cezih.hr:9443/services-router/gateway'
    ];

    const possiblePaths = [
        '/mcsd-services/api/v1',
        '/patient-registry-services/api/v1',
        '/identifier-registry-services/api/v1',
        '/practitioner-registry-services/api/v1',
        '/organization-registry-services/api/v1',
        '/provider-registry-services/api/v1',
        '/encounter-services/api/v1',
        '/health-issue-services/api/v1',
        '/fhir/api/v1',
        '/api/v1'
    ];

    console.log('--- Probing /metadata (CapabilityStatement) on all gateway paths ---');
    for (const base of baseUrls) {
        for (const path of possiblePaths) {
            const url = `${base}${path}/metadata`;
            try {
                const res = await axios.get(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/fhir+json'
                    },
                    httpsAgent,
                    validateStatus: () => true,
                    timeout: 5000
                });

                if (res.status === 200) {
                    console.log(`\n[HTTP 200] *** FOUND CAPABILITY STATEMENT AT: ${url} ***`);
                    const cap = res.data;
                    if (cap && cap.resourceType === 'CapabilityStatement') {
                        console.log('  -> Server:', cap.software?.name, cap.software?.version);
                        console.log('  -> FHIR Version:', cap.fhirVersion);
                        // Print what resources it supports
                        const resources = cap.rest?.[0]?.resource?.map(r => r.type);
                        if (resources) {
                            console.log('  -> Supported Resources:', resources.join(', '));
                        }
                    }
                } else if (res.status !== 404 && res.status !== 502) {
                    console.log(`[HTTP ${res.status}] ${url}`);
                    if (res.data?.resourceType) {
                        console.log(`  -> Returned: ${res.data.resourceType}`);
                    }
                }
            } catch (e) {
                // Ignore timeouts and conn errors
            }
        }
    }
    console.log('\nDone.');
}

run().catch(e => console.error("Script failed:", e.message));
