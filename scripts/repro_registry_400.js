
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const config = {
    gatewayBase: (process.env.CEZIH_BASE_URL || 'https://certws2.cezih.hr:8443') + '/services-router/gateway',
    services: {
        patient: '/patient-registry-services/api/v1',
    },
    auth: {
        clientId: process.env.CEZIH_CLIENT_ID || '',
        clientSecret: process.env.CEZIH_CLIENT_SECRET || '',
        tokenUrl: process.env.CEZIH_TOKEN_URL || '',
    }
};

async function getSystemToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.auth.clientId);
    params.append('client_secret', config.auth.clientSecret);

    const response = await axios.post(config.auth.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data.access_token;
}

async function testSearch(resource) {
    try {
        console.log('We cannot easily fetch actual gateway cookies headlessly.');
        console.log(`We will hit the local backend's /api/registry/${resource.toLowerCase()}s endpoint.`);
        console.log('NOTE: Ensure you are logged into the frontend in your browser so the backend has an active session.');

        const url = `http://127.0.0.1:3010/api/registry/${resource.toLowerCase()}s?name=a`;
        console.log(`Testing ${resource} search at: ${url}`);

        try {
            // We need to pass the real Authorization header from the browser if possible. 
            // The local API accepts an empty userToken and tries to find a session, but usually the frontend sends the token.
            // Let's just make the request. If it fails due to auth, we know it's working but needs a browser session.
            const response = await axios.get(url);
            console.log(`Success! Found ${response.data.count || 0} entries.`);
        } catch (error) {
            console.error(`Failed with status ${error.response?.status}: ${error.message}`);
            if (error.response?.data) {
                console.error('Error details:', JSON.stringify(error.response.data, null, 2));
            }
        }
    } catch (err) {
        console.error('Setup failed:', err.message);
    }
}

async function run() {
    console.log('--- Testing Organization ---');
    await testSearch('Organization');
    console.log('\n--- Testing Practitioner ---');
    await testSearch('Practitioner');
}

run();
