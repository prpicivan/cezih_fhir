/**
 * Probe script: test which auth method works for certpubws.cezih.hr
 * Run: npx tsx scripts/probe-certpubws-auth.ts
 */
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const REMOTE_SIGN_URL = process.env.REMOTE_SIGN_URL || 'https://certpubws.cezih.hr/services-router/gateway/extsigner/api/remoteSign';

// Load the stored gateway session (saved to a temp JSON if available)
// We'll read directly from the running backend via API
const BACKEND_URL = 'http://localhost:3010';

const MINIMAL_PAYLOAD = {
    documents: [{
        documentType: 'FHIR_MESSAGE',
        mimeType: 'JSON',
        base64Document: Buffer.from('{"resourceType":"Bundle","type":"message"}').toString('base64'),
        messageId: '00000000-0000-0000-0000-000000000001'
    }],
    oib: process.env.SIGNER_OIB || '30160453873',
    sourceSystem: 'DEV',
    requestId: '00000000-0000-0000-0000-000000000002'
};

async function getSystemToken(): Promise<string> {
    const res = await axios.post(process.env.CEZIH_TOKEN_URL!, new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.CEZIH_CLIENT_ID!,
        client_secret: process.env.CEZIH_CLIENT_SECRET!,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return res.data.access_token;
}

async function getGatewayInfo() {
    try {
        const res = await axios.get(`${BACKEND_URL}/api/auth/gateway-token`);
        return res.data;
    } catch {
        return null;
    }
}

async function probe(label: string, headers: Record<string, string>) {
    console.log(`\n--- Testing: ${label} ---`);
    console.log(`URL: ${REMOTE_SIGN_URL}`);
    console.log(`Headers:`, Object.keys(headers).map(k => `${k}: ${headers[k]?.substring(0, 50)}...`));
    try {
        const res = await axios.post(REMOTE_SIGN_URL, MINIMAL_PAYLOAD, { headers });
        console.log(`✅ SUCCESS! Status: ${res.status}`);
        console.log(`Response:`, res.data);
    } catch (err: any) {
        const status = err.response?.status;
        const data = err.response?.data;
        const isHtml = typeof data === 'string' && data.includes('DOCTYPE');
        console.log(`❌ FAIL (${status}): ${isHtml ? 'HTML LOGIN PAGE (auth redirect)' : JSON.stringify(data)?.substring(0, 300)}`);
    }
}

async function main() {
    console.log(`=== certpubws Auth Probe ===`);
    console.log(`Target: ${REMOTE_SIGN_URL}`);

    // 1. No auth
    await probe('No auth', { 'Content-Type': 'application/json' });

    // 2. System OAuth2 token
    try {
        const systemToken = await getSystemToken();
        console.log(`\nSystem token obtained: ${systemToken.substring(0, 30)}...`);
        await probe('System OAuth2 Bearer token', {
            'Authorization': `Bearer ${systemToken}`,
            'Content-Type': 'application/json'
        });
    } catch (e: any) {
        console.log(`Could not obtain system token: ${e.message}`);
    }

    // 3. Gateway session cookies from running backend
    const gwInfo = await getGatewayInfo();
    if (gwInfo?.cookieHeader) {
        await probe('Gateway cookies (Cookie header)', {
            'Cookie': gwInfo.cookieHeader,
            'Content-Type': 'application/json'
        });

        if (gwInfo.sessionToken) {
            await probe('Gateway sessionToken as Bearer', {
                'Authorization': `Bearer ${gwInfo.sessionToken}`,
                'Content-Type': 'application/json'
            });

            await probe('Gateway cookies + sessionToken as Bearer', {
                'Cookie': gwInfo.cookieHeader,
                'Authorization': `Bearer ${gwInfo.sessionToken}`,
                'Content-Type': 'application/json'
            });
        }
    } else {
        console.log(`\n⚠️  No gateway session available (user not logged in via Certilia)`);
        console.log(`   Please authenticate first then re-run this script.`);
    }

    console.log('\n=== Done ===');
}

main().catch(console.error);
