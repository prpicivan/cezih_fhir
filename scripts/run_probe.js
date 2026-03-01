require('dotenv').config();
const axios = require('axios');

async function probeLocalApi() {
    try {
        console.log('[PROBE] Asking the local backend to execute the probe...');
        console.log('[PROBE] Make sure you are logged into the UI so the backend has a session.');

        const response = await axios.get('http://127.0.0.1:3010/api/registry/probe', { timeout: 30000 });
        console.log('\n--- PROBE RESULTS ---');
        response.data.results.forEach(res => {
            const isSuccess = res.status >= 200 && res.status < 300;
            const marker = isSuccess ? '✅' : (res.status === 404 ? '❌' : '⚠️');
            console.log(`${marker} ${res.path} -> HTTP ${res.status}`);
        });

    } catch (error) {
        console.error('[PROBE] Failed to reach local backend:', error.message);
        if (error.response?.data) {
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

probeLocalApi();
