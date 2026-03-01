/**
 * Probe: find which CEZIH gateway path triggers auth redirect (302→SSO)
 */
const https = require('https');
const http = require('http');

const BASE = 'https://certws2.cezih.hr:8443';

const PATHS = [
    '/services-router/gateway',
    '/services-router/gateway/',
    '/services-router/gateway/metadata',
    '/services-router/gateway/encounter-services/api/v1/metadata',
    '/services-router/gateway/patient-registry-services/api/v1/metadata',
    '/services-router/gateway/doc-mhd-svc/api/v1/metadata',
    '/services-router/gateway/fhir/metadata',
    '/services-router/gateway/health-issue-services/api/v1/metadata',
    '/services-router/gateway/health-issue-services/api/v1',
    '/auth',
    '/auth/realms/CEZIH',
];

function probe(url) {
    return new Promise((resolve) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { rejectUnauthorized: false }, (res) => {
            resolve({
                url,
                status: res.statusCode,
                location: res.headers['location'] || '',
            });
        });
        req.on('error', (e) => resolve({ url, status: 'ERR', location: e.message }));
        req.setTimeout(6000, () => { req.destroy(); resolve({ url, status: 'TIMEOUT', location: '' }); });
    });
}

async function main() {
    console.log(`Probing ${PATHS.length} paths on ${BASE}...\n`);
    for (const p of PATHS) {
        const r = await probe(BASE + p);
        const mark = r.status === 302 ? '✅' : r.status === 200 ? '🟡' : '❌';
        console.log(`${mark} [${r.status}] ${r.url}`);
        if (r.location) console.log(`       → ${r.location.substring(0, 100)}`);
    }
}

main().catch(console.error);
