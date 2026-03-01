const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

async function getSystemToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CEZIH_CLIENT_ID || '');
    params.append('client_secret', process.env.CEZIH_CLIENT_SECRET || '');
    const response = await axios.post(process.env.CEZIH_TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data.access_token;
}

async function run() {
    const token = await getSystemToken();
    const url = 'https://certws2.cezih.hr:9443/services-router/gateway/terminology-services/api/v1/CodeSystem?url=http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr';
    console.log('Querying:', url);
    try {
        const resp = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/fhir+json' }
        });
        const bundle = resp.data;
        const entries = bundle.entry || [];
        console.log('Entries found:', entries.length);
        if (entries.length > 0) {
            const cs = entries[0].resource;
            console.log('CodeSystem URL:', cs.url);
            console.log('Concept count in resource:', cs.concept ? cs.concept.length : 'none');
            console.log('Total in bundle:', bundle.total);
        }
    } catch (err) {
        console.error('Error:', err.response?.status, err.message);
    }
}

run();
