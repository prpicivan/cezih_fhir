/**
 * test-vpn-connectivity.js
 * 
 * Quick VPN connectivity test to CEZIH test environment.
 * Tests network reachability + OAuth2 system authentication (TC3).
 * 
 * Usage:  node scripts/test-vpn-connectivity.js
 * 
 * Prerequisites:
 *   - VPN connected to CEZIH network
 *   - Valid CEZIH_CLIENT_ID and CEZIH_CLIENT_SECRET in .env
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

// ── Configuration ──────────────────────────────────────────────
const CEZIH_BASE_URL = process.env.CEZIH_BASE_URL || 'https://test.fhir.cezih.hr';
const CEZIH_FHIR_URL = process.env.CEZIH_FHIR_URL || 'https://test.fhir.cezih.hr/R4/fhir';
const CEZIH_TOKEN_URL = process.env.CEZIH_TOKEN_URL || 'https://test.fhir.cezih.hr/auth/realms/cezih/protocol/openid-connect/token';
const CEZIH_OID_URL = process.env.CEZIH_OID_REGISTRY_URL || 'https://test.fhir.cezih.hr/oid-registry';
const CLIENT_ID = process.env.CEZIH_CLIENT_ID;
const CLIENT_SECRET = process.env.CEZIH_CLIENT_SECRET;

const COLORS = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
};

function ok(msg) { console.log(`${COLORS.green}  ✅ ${msg}${COLORS.reset}`); }
function fail(msg) { console.log(`${COLORS.red}  ❌ ${msg}${COLORS.reset}`); }
function info(msg) { console.log(`${COLORS.cyan}  ℹ️  ${msg}${COLORS.reset}`); }
function header(msg) { console.log(`\n${COLORS.bold}${COLORS.yellow}═══ ${msg} ═══${COLORS.reset}`); }

// ── Helpers ────────────────────────────────────────────────────

/** Simple HTTPS GET with timeout */
function httpsGet(urlStr, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const req = https.get({
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            timeout: timeoutMs,
            rejectUnauthorized: true,  // Verify TLS certificates
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
        req.on('error', reject);
    });
}

/** HTTPS POST (form-urlencoded) */
function httpsPost(urlStr, formData, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const postData = new URLSearchParams(formData).toString();
        const req = https.request({
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'POST',
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/** HTTPS GET with Bearer token */
function httpsGetAuth(urlStr, token, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const req = https.get({
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            timeout: timeoutMs,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/fhir+json',
            },
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
        req.on('error', reject);
    });
}

// ── Tests ──────────────────────────────────────────────────────

const results = [];

async function test1_dnsReachability() {
    header('Test 1: DNS + TCP reachability');
    info(`Connecting to ${CEZIH_BASE_URL} ...`);
    try {
        const res = await httpsGet(CEZIH_BASE_URL + '/');
        ok(`Server reachable! HTTP ${res.status} (TLS handshake OK)`);
        results.push({ test: 'DNS+TCP', pass: true });
    } catch (err) {
        fail(`Cannot reach CEZIH: ${err.message}`);
        if (err.code === 'ENOTFOUND') {
            info('DNS resolution failed — VPN may not be connected or DNS is not configured.');
        } else if (err.code === 'ETIMEDOUT' || err.message.includes('Timeout')) {
            info('Connection timed out — VPN tunnel may be down or firewall blocking.');
        } else if (err.code === 'ECONNREFUSED') {
            info('Connection refused — server may be down.');
        }
        results.push({ test: 'DNS+TCP', pass: false, error: err.message });
    }
}

async function test2_tlsCertificate() {
    header('Test 2: TLS Certificate validation');
    info(`Verifying TLS cert for ${new URL(CEZIH_BASE_URL).hostname} ...`);
    try {
        const res = await httpsGet(CEZIH_BASE_URL + '/', 10000);
        ok(`TLS certificate is valid and trusted.`);
        results.push({ test: 'TLS', pass: true });
    } catch (err) {
        if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'CERT_HAS_EXPIRED') {
            fail(`TLS certificate problem: ${err.code}`);
            info('The CEZIH test server may use a self-signed or internal CA certificate.');
            info('If so, you may need to set NODE_TLS_REJECT_UNAUTHORIZED=0 for testing only.');
            results.push({ test: 'TLS', pass: false, error: err.code });
        } else {
            // Could be a network issue, not TLS specific
            fail(`Connection error (could be network): ${err.message}`);
            results.push({ test: 'TLS', pass: false, error: err.message });
        }
    }
}

async function test3_oauthToken() {
    header('Test 3: OAuth2 System Token (TC3 — client_credentials)');

    if (!CLIENT_ID || CLIENT_ID === 'your_client_id_here') {
        fail('CEZIH_CLIENT_ID not configured in .env — skipping auth test.');
        info('Set CEZIH_CLIENT_ID and CEZIH_CLIENT_SECRET in .env with real credentials.');
        results.push({ test: 'OAuth2', pass: false, error: 'Not configured' });
        return null;
    }

    info(`Requesting token from ${CEZIH_TOKEN_URL} ...`);
    try {
        const res = await httpsPost(CEZIH_TOKEN_URL, {
            grant_type: 'client_credentials',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        });

        if (res.status === 200) {
            const data = JSON.parse(res.body);
            ok(`Access token obtained! Expires in ${data.expires_in}s`);
            info(`Token type: ${data.token_type}`);
            results.push({ test: 'OAuth2', pass: true });
            return data.access_token;
        } else {
            const data = JSON.parse(res.body);
            fail(`Auth failed: HTTP ${res.status} — ${data.error_description || data.error || res.body}`);
            results.push({ test: 'OAuth2', pass: false, error: `HTTP ${res.status}` });
            return null;
        }
    } catch (err) {
        fail(`OAuth2 request failed: ${err.message}`);
        results.push({ test: 'OAuth2', pass: false, error: err.message });
        return null;
    }
}

async function test4_fhirMetadata(token) {
    header('Test 4: FHIR Metadata / CapabilityStatement');
    info(`GET ${CEZIH_FHIR_URL}/metadata ...`);
    try {
        const res = token
            ? await httpsGetAuth(`${CEZIH_FHIR_URL}/metadata`, token)
            : await httpsGet(`${CEZIH_FHIR_URL}/metadata`);

        if (res.status === 200) {
            const data = JSON.parse(res.body);
            ok(`FHIR server responded: ${data.resourceType || 'OK'}`);
            if (data.fhirVersion) info(`FHIR version: ${data.fhirVersion}`);
            if (data.software?.name) info(`Server: ${data.software.name} ${data.software.version || ''}`);
            results.push({ test: 'FHIR Metadata', pass: true });
        } else {
            fail(`FHIR metadata returned HTTP ${res.status}`);
            info(`Response: ${res.body.substring(0, 200)}`);
            results.push({ test: 'FHIR Metadata', pass: false, error: `HTTP ${res.status}` });
        }
    } catch (err) {
        fail(`FHIR metadata request failed: ${err.message}`);
        results.push({ test: 'FHIR Metadata', pass: false, error: err.message });
    }
}

async function test5_patientSearch(token) {
    header('Test 5: Patient Lookup (testni pacijent)');

    if (!token) {
        fail('Skipping — no valid token available.');
        results.push({ test: 'Patient Search', pass: false, error: 'No token' });
        return;
    }

    // Try to look up a test patient by MBO
    const testMbo = '100000001'; // Default test patient MBO
    info(`Searching Patient by MBO: ${testMbo} ...`);
    try {
        const searchUrl = `${CEZIH_FHIR_URL}/Patient?identifier=urn:oid:1.2.840.113583.1.11.1|${testMbo}`;
        const res = await httpsGetAuth(searchUrl, token);

        if (res.status === 200) {
            const data = JSON.parse(res.body);
            const total = data.total || (data.entry ? data.entry.length : 0);
            ok(`Patient search returned ${total} result(s)`);
            if (data.entry && data.entry.length > 0) {
                const patient = data.entry[0].resource;
                info(`Patient: ${patient.name?.[0]?.family || '?'}, ${patient.name?.[0]?.given?.join(' ') || '?'}`);
            }
            results.push({ test: 'Patient Search', pass: true });
        } else {
            fail(`Patient search returned HTTP ${res.status}`);
            info(`Response: ${res.body.substring(0, 300)}`);
            results.push({ test: 'Patient Search', pass: false, error: `HTTP ${res.status}` });
        }
    } catch (err) {
        fail(`Patient search failed: ${err.message}`);
        results.push({ test: 'Patient Search', pass: false, error: err.message });
    }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
    console.log(`${COLORS.bold}${COLORS.cyan}`);
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║    CEZIH VPN Connectivity Test               ║');
    console.log('║    Target: ' + CEZIH_BASE_URL.padEnd(34) + '║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(COLORS.reset);

    await test1_dnsReachability();
    await test2_tlsCertificate();
    const token = await test3_oauthToken();
    await test4_fhirMetadata(token);
    await test5_patientSearch(token);

    // ── Summary ────────────────────────────────────────────
    header('Summary');
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    console.log('');
    for (const r of results) {
        const icon = r.pass ? '✅' : '❌';
        const err = r.error ? ` (${r.error})` : '';
        console.log(`  ${icon}  ${r.test}${err}`);
    }
    console.log('');
    if (passed === total) {
        ok(`ALL ${total} TESTS PASSED — VPN connection to CEZIH is working! 🎉`);
    } else {
        info(`${passed}/${total} tests passed.`);
        if (!results[0]?.pass) {
            fail('VPN connection does not seem to be active. Check your VPN client.');
        }
    }
}

main().catch(err => {
    fail(`Fatal error: ${err.message}`);
    process.exit(1);
});
