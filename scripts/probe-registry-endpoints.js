const axios = require('axios');
const fs = require('fs');

async function testEndpoints() {
    const baseUrl = 'https://certws2.cezih.hr:8443/services-router/gateway';

    // We need a valid session token to test this, so we'll just check if we get 404 (Not Found) or 401/403 (Unauthorized, meaning endpoint exists)
    // Actually, maybe we can use the system token? M2M token.

    const possiblePaths = [
        '/encounter-services/api/v1',
        '/health-issue-services/api/v1',
        '/doc-mhd-svc/api/v1',
        '/ihe-qedm-services/api/v1',
        '/patient-registry-services/api/v1',
        '/identifier-registry-services/api/v1',
        '/terminology-services/api/v1'
    ];

    console.log('Fetching system token...');
    const authRes = await axios.post('http://127.0.0.1:3010/api/auth/system-token');
    const token = authRes.data.token;
    console.log('Got token, probing endpoints for Organization...');

    for (const path of possiblePaths) {
        const url = `${baseUrl}${path}/Organization`;
        try {
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` },
                validateStatus: () => true
            });
            console.log(`[HTTP ${res.status}] ${url}`);
        } catch (e) {
            console.log(`[Error] ${url} failed to connect: ${e.message}`);
        }
    }
}

testEndpoints();
