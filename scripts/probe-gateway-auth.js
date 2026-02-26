/**
 * Probe: Dump the mobileid.jsp HTML to find its JavaScript polling mechanism.
 * Uses real auth flow up to the mobile page.
 */
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

async function probe() {
    const jar = new tough.CookieJar();
    const client = wrapper(axios.create({ jar, maxRedirects: 15, validateStatus: () => true }));

    // Step 1: Follow to Certilia login
    console.log('Step 1: Getting login form...');
    const r1 = await client.get('https://certws2.cezih.hr:8443/services-router/gateway');
    const loginUrl = r1.request?.res?.responseUrl || '';
    const body1 = typeof r1.data === 'string' ? r1.data : '';
    const sessionDataKey = new URL(loginUrl).searchParams.get('sessionDataKey');
    console.log('sessionDataKey:', sessionDataKey);

    // Extract form action
    const actionMatch = body1.match(/action="([^"]+)"/);
    const formAction = new URL(actionMatch[1], loginUrl).href;
    console.log('formAction:', formAction);

    // Step 2: Submit credentials — don't follow redirect
    console.log('\nStep 2: Submitting credentials (dummy)...');
    const params = new URLSearchParams();
    params.append('usernameUserInput', 'test@test.com');
    params.append('username', 'test@test.com');
    params.append('password', 'test123');
    params.append('sessionDataKey', sessionDataKey);

    const r2 = await client.post(formAction, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0,
    });

    console.log('Status:', r2.status);

    if (r2.status >= 300 && r2.headers.location) {
        const redirectUrl = r2.headers.location;
        console.log('Redirect to:', redirectUrl);

        if (redirectUrl.includes('mobileid')) {
            // Follow to mobile page
            const r3 = await client.get(redirectUrl, { maxRedirects: 0, validateStatus: () => true });
            console.log('\nmobileid.jsp status:', r3.status);
            const body = typeof r3.data === 'string' ? r3.data : '';
            console.log('Body length:', body.length);

            // Show FULL body
            console.log('\n=== MOBILEID.JSP HTML ===');
            console.log(body);
            console.log('=== END ===');
        } else {
            // Not mobile — might be login page (wrong creds)
            const r3 = await client.get(redirectUrl, { maxRedirects: 0, validateStatus: () => true });
            const body = typeof r3.data === 'string' ? r3.data : '';
            console.log('\nNot mobileid. Status:', r3.status);
            console.log('Body (first 500):', body.substring(0, 500));
        }
    } else {
        const body = typeof r2.data === 'string' ? r2.data : '';
        console.log('Not redirect. Body (first 500):', body.substring(0, 500));
    }
}

probe().catch(e => console.error('Fatal:', e.message));
