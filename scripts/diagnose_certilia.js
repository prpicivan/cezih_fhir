/**
 * Certilia Auth Diagnostic Script — Full Trace
 * 
 * Traces every step after credentials are submitted.
 * Key question: does the server redirect to mobileid.jsp or back to login.do?
 */
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const username = process.env.USER_EMAIL || 'ivan.prpic@wbs.hr';
const password = process.env.USER_PASSWORD;

if (!password) {
    console.error('ERROR: USER_PASSWORD not set in .env');
    process.exit(1);
}

console.log(`User: ${username}, Password length: ${password.length}`);

async function main() {
    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
    }));

    // ---- Step 1: Follow gateway → SSO → Certilia login.do ----
    console.log('\n=== PHASE 1: Follow redirect chain to login page ===');
    let loginPageUrl = null;
    let currentUrl = 'https://certws2.cezih.hr:8443/services-router/gateway';

    for (let i = 0; i < 15; i++) {
        const res = await client.get(currentUrl);
        console.log(`[${i + 1}] ${res.status} ${currentUrl.substring(0, 100)}`);

        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            currentUrl = new URL(res.headers.location, currentUrl).href;
            if (currentUrl.includes('login.do')) {
                loginPageUrl = currentUrl;
                console.log('✅ Reached login.do');
                break;
            }
        } else {
            console.log('Chain stopped unexpectedly at step', i + 1);
            break;
        }
    }

    if (!loginPageUrl) {
        console.error('❌ Could not reach login.do');
        return;
    }

    // ---- Step 2: Load the login form to extract sessionDataKey ----
    console.log('\n=== PHASE 2: Load login form ===');
    const formRes = await client.get(loginPageUrl);
    const formBody = String(formRes.data);

    // Log Set-Cookie from loading the form page
    const setCookieHeader = formRes.headers['set-cookie'];
    console.log(`Set-Cookie from login.do GET: ${setCookieHeader ? JSON.stringify(setCookieHeader) : 'NONE'}`);

    // Extract JSESSIONID — it has Path=/authenticationendpoint so tough-cookie
    // won't send it automatically to /commonauth. We must forward it manually.
    let jsessionId = null;
    if (setCookieHeader) {
        const sessionCookie = setCookieHeader.find(c => c.startsWith('JSESSIONID='));
        if (sessionCookie) {
            jsessionId = sessionCookie.split(';')[0]; // "JSESSIONID=xxx"
            console.log(`Extracted JSESSIONID (first 30 chars): ${jsessionId.substring(0, 30)}...`);
        }
    }

    const sdkUrl = new URL(loginPageUrl).searchParams.get('sessionDataKey');
    const sdkForm = (formBody.match(/name="sessionDataKey"\s+value="([^"]+)"/) || [])[1];
    const sessionDataKey = sdkForm || sdkUrl;
    const actionRaw = (formBody.match(/action="([^"]+)"/) || [])[1];
    const action = actionRaw ? new URL(actionRaw, loginPageUrl).href : null;

    console.log(`SessionDataKey: ${sessionDataKey}`);
    console.log(`Form action: ${action}`);
    console.log(`URL authenticators: ${new URL(loginPageUrl).searchParams.get('authenticators')}`);

    // Log all cookies currently in the jar on the Certilia domain
    const certiliaCookies = await jar.getCookies('https://idp.test.certilia.com');
    console.log(`\nCookies on idp.test.certilia.com before POST: ${certiliaCookies.length}`);
    certiliaCookies.forEach(c => console.log(`  ${c.key}=${c.value.substring(0, 20)}...`));

    if (!action || !sessionDataKey) {
        console.error('❌ Could not parse login form');
        return;
    }

    // ---- Step 3: Submit credentials ----
    console.log('\n=== PHASE 3: Submit credentials ===');
    const params = new URLSearchParams();
    params.append('usernameUserInput', username);
    params.append('username', username);
    params.append('password', password);
    params.append('sessionDataKey', sessionDataKey);

    console.log(`Sending Referer: ${loginPageUrl.substring(0, 80)}`);
    const cookieHeader = jsessionId ? `${jsessionId}; lang=en` : 'lang=en';
    console.log(`Sending Cookie: ${cookieHeader.substring(0, 50)}`);
    const postRes = await client.post(action, params.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': loginPageUrl,
            'Origin': 'https://idp.test.certilia.com',
            'Cookie': cookieHeader,
        },
        maxRedirects: 0,
    });

    console.log(`POST status: ${postRes.status}`);
    if (!postRes.headers.location) {
        const body = String(postRes.data);
        console.log('No redirect after POST. authFailure in body?', body.includes('authFailure'));
        console.log(body.substring(0, 300));
        return;
    }

    const postRedirect = new URL(postRes.headers.location, action).href;
    console.log(`POST redirect: ${postRedirect}`);

    if (postRedirect.includes('authFailure')) {
        console.log('❌ CREDENTIALS REJECTED — authFailure in redirect URL');
        return;
    }

    // ---- Step 4: Follow every redirect after login and print each one ----
    console.log('\n=== PHASE 4: Tracing post-login redirects ===');
    let url = postRedirect;
    for (let i = 0; i < 15; i++) {
        console.log(`\n[Hop ${i + 1}] ${url}`);

        if (url.includes('mobileid')) {
            console.log('🎉 FOUND mobileid in URL — success path!');
        }

        const res = await client.get(url);
        const body = String(res.data);
        console.log(`  Status: ${res.status}`);

        if (body.includes('mobileid')) {
            console.log('  🎉 "mobileid" string found in BODY (mobileid.jsp page loaded)');
        }
        if (body.includes('checkUserAuthURL')) {
            console.log('  ✅ checkUserAuthURL found — mobile polling available');
            const match = body.match(/id="checkUserAuthURL"[^>]*value='([^']*)'/);
            if (match) console.log('  checkUserAuthURL:', match[1].substring(0, 80));
        }
        if (body.includes('authFailure') || body.includes('login.fail.message')) {
            console.log('  ❌ authFailure or login.fail.message in body');
        }
        if (body.includes('Whitelabel Error') || res.status === 404) {
            console.log('  ❌ 404 / Whitelabel Error');
        }

        if (res.headers.location) {
            url = new URL(res.headers.location, url).href;
        } else {
            console.log('  End of chain (no location header).');
            break;
        }
    }

    console.log('\n=== DONE ===');
    const allCookies = await jar.getCookies('https://certws2.cezih.hr');
    console.log(`Gateway cookies: ${allCookies.length}`);
    const session = allCookies.find(c => c.key.includes('mod_auth'));
    if (session) {
        console.log('✅ SESSION COOKIE FOUND:', session.key);
    } else {
        console.log('❌ No session cookie from gateway');
    }
}

main().catch(e => console.error('Fatal error:', e.message));
