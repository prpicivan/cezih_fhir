
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const config = {
    // Try 9443 for Organization
    baseUrl: 'https://certws2.cezih.hr:9443/services-router/gateway/patient-registry-services/api/v1/Organization',
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
        console.log('Token obtained');

        console.log('\n--- Step 2: Query Organization on port 9443 ---');
        const url = config.baseUrl;
        console.log('URL:', url);

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/fhir+json'
                },
                params: { active: 'true', name: 'a' }
            });
            console.log('Success!', response.status);
            console.log('Body snippet:', JSON.stringify(response.data).substring(0, 500));
        } catch (error) {
            console.error('FAILED with status:', error.response?.status);
            if (error.response?.data) {
                // console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error('Error:', error.message);
            }
        }

    } catch (err) {
        console.error('Fatal error:', err.message);
    }
}

run();
