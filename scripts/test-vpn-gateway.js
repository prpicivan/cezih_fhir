/**
 * Test: Can backend reach CEZIH gateway through VPN without TLS client cert?
 * If VPN is connected, our backend requests should go through authenticated tunnel.
 */
const https = require('https');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

async function test() {
    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        maxRedirects: 15,
        validateStatus: () => true,
        timeout: 10000,
    }));

    console.log('Test 1: Can we reach CEZIH gateway through VPN?');
    try {
        const r = await client.get('https://certws2.cezih.hr:8443/services-router/gateway');
        const finalUrl = r.request?.res?.responseUrl || '';
        const body = typeof r.data === 'string' ? r.data : '';
        console.log('✅ Status:', r.status);
        console.log('Final URL:', finalUrl.substring(0, 120));
        console.log('Body preview:', body.substring(0, 200));

        // List all cookies collected
        const cookies = await jar.getCookies('https://certws2.cezih.hr:8443');
        console.log('\nCookies on certws2:', cookies.map(c => c.key));

        // Check if we landed on Certilia
        if (finalUrl.includes('certilia') || finalUrl.includes('idp')) {
            console.log('\n✅ Gateway redirected to Certilia IDP — VPN tunnel works!');
            console.log('Certilia URL:', finalUrl.substring(0, 150));
        } else if (r.status === 200 && finalUrl.includes('certws2')) {
            console.log('\n🎉 Already authenticated via VPN! We are on the gateway.');
        }
    } catch (e) {
        console.error('❌ Cannot reach gateway:', e.message);
    }

    console.log('\nTest 2: Check cookies from gateway chain');
    const allCookies = await jar.getCookies('https://certws2.cezih.hr:8443');
    const idpCookies = await jar.getCookies('https://idp.test.certilia.com');
    const ssoCookies = await jar.getCookies('https://certsso2.cezih.hr');
    console.log('certws2 cookies:', allCookies.map(c => `${c.key}=${c.value.substring(0, 10)}...`));
    console.log('idp cookies:', idpCookies.map(c => c.key));
    console.log('sso cookies:', ssoCookies.map(c => c.key));
}

test().catch(e => console.error('Fatal:', e.message));
