const axios = require('axios');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testEndpoints() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CEZIH_CLIENT_ID);
    params.append('client_secret', process.env.CEZIH_CLIENT_SECRET);

    const authRes = await axios.post(process.env.CEZIH_TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const token = authRes.data.access_token;

    console.log('Got token, length:', token.length);

    const HZZO_ORG_URI = 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije';
    const testOrgId = '7920000';
    const HZJZ_PRAC_URI = 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika';
    const testPracId = '1234567';

    // Different base URLs
    const baseUrls = [
        'https://certws2.cezih.hr:8443/services-router/gateway',
        'https://certws2.cezih.hr:9443/services-router/gateway'
    ];

    const possiblePaths = [
        '/encounter-services/api/v1',
        '/patient-registry-services/api/v1',
        '/identifier-registry-services/api/v1',
    ];

    console.log('\n--- Probing Paths ---');
    for (const base of baseUrls) {
        for (const path of possiblePaths) {
            const urls = [
                `${base}${path}/Organization?identifier=${encodeURIComponent(HZZO_ORG_URI + '|' + testOrgId)}`,
                `${base}${path}/Practitioner?identifier=${encodeURIComponent(HZJZ_PRAC_URI + '|' + testPracId)}`
            ];

            for (const url of urls) {
                try {
                    const res = await axios.get(url, {
                        headers: { Authorization: `Bearer ${token}` },
                        httpsAgent,
                        validateStatus: () => true
                    });
                    if (res.status !== 404 && res.status !== 502) {
                        console.log(`[HTTP ${res.status}] FOUND POTENTIAL ENDPOINT: ${url}`);
                        if (res.data && res.data.resourceType) {
                            console.log(`  -> Response is a FHIR Resource: ${res.data.resourceType}`);
                        } else if (res.data && res.data.issue) {
                            console.log(`  -> Issue: ${res.data.issue[0]?.diagnostics}`);
                        }
                    }
                } catch (e) { }
            }
        }
    }
}

testEndpoints().catch(e => console.error("Script failed:", e.message));
