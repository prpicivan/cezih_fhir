const axios = require('axios');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const agent = new https.Agent({ rejectUnauthorized: false });

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

async function test() {
    try {
        const token = await getSystemToken();
        const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/fhir+json' };
        const base = 'https://certws2.cezih.hr:9443/services-router/gateway/terminology-services/api/v1';
        
        const vsUrl = 'http://fhir.cezih.hr/specifikacije/ValueSet/document-type';
        
        console.log('--- Test 1: $expand via url param ---');
        try {
            const url = `${base}/ValueSet/$expand?url=${encodeURIComponent(vsUrl)}`;
            const res = await axios.get(url, { headers, httpsAgent: agent });
            console.log('Success 1!', res.status);
        } catch (e) {
            console.log('Fail 1:', e.response?.status, e.message);
        }

        console.log('\n--- Test 2: GET ValueSet with url param ---');
        try {
            const url = `${base}/ValueSet?url=${encodeURIComponent(vsUrl)}`;
            const res = await axios.get(url, { headers, httpsAgent: agent });
            console.log('Success 2!', res.status);
            const vs = res.data.entry?.[0]?.resource;
            console.log('VS ResourceType:', vs?.resourceType);
            console.log('Has contains:', !!vs?.expansion?.contains);
            console.log('Has compose:', !!vs?.compose);
        } catch (e) {
            console.log('Fail 2:', e.response?.status, e.message);
        }

        console.log('\n--- Test 4: CodeSystem with url param (no summary) ---');
        try {
            const csUrl = 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type';
            const url = `${base}/CodeSystem?url=${encodeURIComponent(csUrl)}`;
            const res = await axios.get(url, { headers, httpsAgent: agent });
            console.log('Success 4!', res.status);
            const cs = res.data.entry?.[0]?.resource;
            console.log('CS ResourceType:', cs?.resourceType);
            console.log('Has concept:', !!cs?.concept);
        } catch (e) {
            console.log('Fail 4:', e.response?.status, e.message);
        }

        console.log('\n--- Test 5: Full CodeSystem list ---');
        try {
            const url = `${base}/CodeSystem`;
            const res = await axios.get(url, { headers, httpsAgent: agent });
            console.log('Success 5!', res.status);
            console.log('Entry count:', res.data.entry?.length);
            if (res.data.entry?.length > 0) {
                const first = res.data.entry[0].resource;
                console.log('First CS URL:', first.url);
                console.log('Has concept:', !!first.concept);
            }
        } catch (e) {
            console.log('Fail 5:', e.response?.status, e.message);
        }

        console.log('\n--- Test 6: Full ValueSet list ---');
        try {
            const url = `${base}/ValueSet`;
            const res = await axios.get(url, { headers, httpsAgent: agent });
            console.log('Success 6!', res.status);
            console.log('Entry count:', res.data.entry?.length);
        } catch (e) {
            console.log('Fail 6:', e.response?.status, e.message);
        }

    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

test();
