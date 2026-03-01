
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const config = {
    gatewayBase: (process.env.CEZIH_BASE_URL || 'https://certws2.cezih.hr:8443') + '/services-router/gateway',
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

async function run() {
    try {
        console.log('--- Step 1: Get System Token ---');
        const token = await getSystemToken();
        console.log('Token obtained:', token.substring(0, 50) + '...');

        console.log('\n--- Step 2: Query CodeSystem (TC7) ---');
        const url = `${config.gatewayBase}/terminology-services/api/v1/CodeSystem`;
        console.log('URL:', url);

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/fhir+json'
                }
            });
            console.log('Success!', response.status);
        } catch (error) {
            console.error('FAILED with status:', error.response?.status);
            if (error.response?.data) {
                console.error('Response body:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error('No response body. Error:', error.message);
            }
            console.error('Response headers:', JSON.stringify(error.response?.headers, null, 2));
        }

    } catch (err) {
        console.error('Fatal error:', err.message);
    }
}

run();
