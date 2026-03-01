
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const config = {
    // Port 9443 for OID
    oidUrl: 'https://certws2.cezih.hr:9443/services-router/gateway/identifier-registry-services/api/v1/oid/generateOIDBatch',
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

        console.log('\n--- Step 2: Generate OID (TC6) on port 9443 ---');
        const url = config.oidUrl;
        console.log('URL:', url);

        try {
            const response = await axios.post(url, {
                oidType: { system: 'http://ent.hr/fhir/CodeSystem/ehe-oid-types', code: '1' },
                quantity: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('Success!', JSON.stringify(response.data));
        } catch (error) {
            console.error('FAILED with status:', error.response?.status);
            if (error.response?.data) {
                console.error('Response body:', JSON.stringify(error.response.data, null, 2));
            }
        }

    } catch (err) {
        console.error('Fatal error:', err.message);
    }
}

run();
