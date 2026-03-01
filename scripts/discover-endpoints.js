/**
 * CEZIH Gateway Discovery Script
 * Probes the gateway for available service paths using /metadata endpoint (FHIR CapabilityStatement)
 */
require('dotenv').config();
const axios = require('axios');

async function run() {
    console.log('Probing CEZIH gateway for available endpoints...\n');

    // Use the local backend (which has the gateway session) to make authenticated requests
    const localBase = 'http://127.0.0.1:3010';

    // Step 1: Get auth status from backend
    try {
        const status = await axios.get(`${localBase}/api/auth/status`);
        const auth = status.data;
        if (!auth.authenticated) {
            console.log('⚠️  Backend has no active gateway session. Login via Certilia first for authenticated probes.');
            console.log('   Probing unauthenticated anyway (some endpoints may return 401/403 instead of 404)...\n');
        } else {
            console.log('✅ Backend is authenticated (gateway session active)\n');
        }
    } catch (e) {
        console.log('❌ Could not reach local backend:', e.message);
        return;
    }

    // Step 2: Probe each known service base with /metadata (FHIR CapabilityStatement)
    const servicePaths = [
        '/encounter-services/api/v1',
        '/health-issue-services/api/v1',
        '/doc-mhd-svc/api/v1',
        '/ihe-qedm-services/api/v1',
        '/patient-registry-services/api/v1',
        '/identifier-registry-services/api/v1',
        '/terminology-services/api/v1',
        '/notification-pull-service/api/v1',
        '/sgp-referral-service/api/v1',
        '/fhir',
    ];

    const gatewayBase = (process.env.CEZIH_BASE_URL || 'https://certws2.cezih.hr:8443') + '/services-router/gateway';

    // Get gateway headers from backend
    let headers = {};
    try {
        // Use the local backend to get the probe done
        const probeResp = await axios.get(`${localBase}/api/registry/probe-meta`, { timeout: 5000 }).catch(() => null);
        if (!probeResp) {
            // Backend doesn't have a probe-meta endpoint - probe directly using system token via our backend
            // We'll just hit the backend endpoints that proxy to cezih and see what happens
        }
    } catch (e) {
        // ignore
    }

    console.log('=== Gateway Service Metadata Probe ===\n');

    for (const path of servicePaths) {
        const metadataUrl = `${gatewayBase}${path}/metadata`;
        const base = `${gatewayBase}${path}`;
        try {
            // Try /metadata first (FHIR CapabilityStatement)
            const r = await axios.get(metadataUrl, {
                timeout: 8000,
                validateStatus: () => true,
                headers: { Accept: 'application/fhir+json' }
            });

            if (r.status === 200) {
                const resources = r.data.rest?.[0]?.resource?.map(res => res.type) || [];
                console.log(`✅ ${path}/metadata -> HTTP ${r.status}`);
                console.log(`   Resources: ${resources.join(', ') || 'No resources listed'}\n`);
            } else if (r.status === 400 && typeof r.data === 'string' && r.data.includes('Cookie')) {
                console.log(`🔒 ${path} -> Needs auth (gateway cookie)\n`);
            } else {
                console.log(`${r.status === 404 ? '❌' : '⚠️ '} ${path} -> HTTP ${r.status}\n`);
            }
        } catch (e) {
            console.log(`❌ ${path} -> ERROR: ${e.message}\n`);
        }
    }

    // Step 3: Also try the raw gateway base
    console.log('\n=== Raw Gateway Base Probe ===\n');
    const extraUrls = [
        `${gatewayBase}`,
        `${gatewayBase}/metadata`,
        `https://certws2.cezih.hr:8443/services-router`,
        `https://certws2.cezih.hr:8443/services-router/actuator`,
        `https://certws2.cezih.hr:8443/services-router/actuator/health`,
    ];

    for (const url of extraUrls) {
        try {
            const r = await axios.get(url, {
                timeout: 5000,
                validateStatus: () => true,
                maxRedirects: 0
            });
            const contentType = r.headers['content-type'] || '';
            const snippet = typeof r.data === 'string' ? r.data.substring(0, 100).replace(/\n/g, ' ') : JSON.stringify(r.data).substring(0, 100);
            console.log(`${r.status < 300 ? '✅' : '⚠️ '} ${url.replace('https://certws2.cezih.hr:8443', '')} -> HTTP ${r.status} [${contentType.split(';')[0]}]`);
            if (r.status === 200) console.log(`   Preview: ${snippet}`);
            console.log();
        } catch (e) {
            console.log(`❌ ${url.replace('https://certws2.cezih.hr:8443', '')} -> ${e.message}\n`);
        }
    }
}

run().catch(console.error);
