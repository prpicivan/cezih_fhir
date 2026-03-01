const axios = require('axios');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function run() {
    // First check backend for active gateway session
    const sessionRes = await axios.get('http://127.0.0.1:3010/api/auth/session-status').catch(e => null);

    if (!sessionRes || !sessionRes.data?.authenticated) {
        console.log('❌ No active gateway session in backend. Please log in via Certilia first.');
        console.log('   Open the app and log in, then re-run this script.');
        return;
    }
    console.log('✅ Active gateway session found:', JSON.stringify(sessionRes.data));

    // Now use the backend to search organizations and practitioners
    // The backend's API will use the gateway session cookies it has stored
    console.log('\n--- Testing TC9: Organization Search via backend ---');
    try {
        const orgRes = await axios.get('http://127.0.0.1:3010/api/registry/organizations?active=true', {
            validateStatus: () => true
        });
        console.log(`[HTTP ${orgRes.status}] Organization search`);
        console.log('Response:', JSON.stringify(orgRes.data, null, 2).substring(0, 800));
    } catch (e) {
        console.log('Organization search error:', e.message);
    }

    console.log('\n--- Testing TC9: Practitioner Search via backend ---');
    try {
        const pracRes = await axios.get('http://127.0.0.1:3010/api/registry/practitioners?active=true', {
            validateStatus: () => true
        });
        console.log(`[HTTP ${pracRes.status}] Practitioner search`);
        console.log('Response:', JSON.stringify(pracRes.data, null, 2).substring(0, 800));
    } catch (e) {
        console.log('Practitioner search error:', e.message);
    }
}

run().catch(e => console.error("Script failed:", e.message));
