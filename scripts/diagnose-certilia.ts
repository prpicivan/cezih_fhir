import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

async function test() {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, maxRedirects: 15, validateStatus: () => true }));

    // Step 1: initiate
    console.log('[TEST] Initiating Certilia flow...');
    const r1 = await client.get('https://certws2.cezih.hr:8443/services-router/gateway');
    const body1 = typeof r1.data === 'string' ? r1.data : '';
    const finalUrl: string = (r1.request as any)?.res?.responseUrl || '';
    console.log('[TEST] Landed on:', finalUrl.substring(0, 100));

    const actionMatch = body1.match(/action="([^"]+)"/);
    const sdkMatch = finalUrl.match(/sessionDataKey=([^&]+)/);
    if (!actionMatch || !sdkMatch) {
        console.log('[TEST] FAIL: Missing form data in response');
        console.log('[TEST] Body preview:', body1.substring(0, 300).replace(/<[^>]+>/g, ' '));
        return;
    }

    // Handle relative formAction URL
    let formAction = actionMatch[1];
    try {
        formAction = new URL(formAction, finalUrl).href;
    } catch {
        if (formAction.startsWith('/')) {
            const base = new URL(finalUrl).origin;
            formAction = base + formAction;
        }
    }
    const sdk = decodeURIComponent(sdkMatch[1]);
    console.log('[TEST] formAction:', formAction.substring(0, 80));
    console.log('[TEST] sessionDataKey obtained:', sdk.substring(0, 20) + '...');

    // Step 2: submit credentials
    console.log('[TEST] Submitting credentials: ivan.prpic@wbs.hr');
    const params = new URLSearchParams();
    params.append('usernameUserInput', 'ivan.prpic@wbs.hr');
    params.append('username', 'ivan.prpic@wbs.hr');
    params.append('password', 'zixZew-9vabfi-dyfsog');
    params.append('sessionDataKey', sdk);

    const r2 = await client.post(formAction, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0,
    });

    console.log('[TEST] Response status:', r2.status);
    console.log('[TEST] Location:', r2.headers?.location ? r2.headers.location.substring(0, 100) : 'none');

    const body2 = typeof r2.data === 'string' ? r2.data : '';

    // Check for specific error patterns
    if (body2.includes('login.do') || body2.includes('login-actions')) {
        console.log('[TEST] RESULT: Redirect back to login → credentials INVALID or LOCKOUT');
    } else if (body2.includes('mobileid')) {
        console.log('[TEST] RESULT: Mobile ID flow triggered — credentials OK!');
    } else if (body2.includes('locked') || body2.includes('blocked') || body2.includes('disabled')) {
        console.log('[TEST] RESULT: ACCOUNT LOCKED');
    }

    // Extract error message from HTML
    const errorDivMatch = body2.match(/class="[^"]*(?:error|alert|info)[^"]*"[^>]*>([\s\S]{0,300}?)<\/div>/i);
    if (errorDivMatch) {
        const errorText = errorDivMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log('[TEST] Error div:', errorText);
    }

    // Show body preview
    const preview = body2.substring(0, 800).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('[TEST] Body preview:', preview);
}

test().catch(err => {
    console.error('[TEST] Fatal error:', err.message);
    process.exit(1);
});
