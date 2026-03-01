/**
 * Probe: fetch the Certilia login page and dump its content
 * to find smart card / certificate auth method/link.
 */
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

async function probe() {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, maxRedirects: 15, validateStatus: () => true }));

    const r = await client.get('https://certws2.cezih.hr:8443/services-router/gateway');
    const finalUrl = r.request?.res?.responseUrl || '';
    const body = typeof r.data === 'string' ? r.data : '';

    console.log('Final URL:', finalUrl);
    console.log('Status:', r.status);
    console.log('\n=== Certilia Login Form HTML (first 4000 chars) ===');
    console.log(body.substring(0, 4000));

    // Look for smart card / certificate links
    const links = [...body.matchAll(/href="([^"]*cert[^"]*|[^"]*card[^"]*|[^"]*karta[^"]*|[^"]*smartcard[^"]*|[^"]*kartica[^"]*)"/gi)];
    console.log('\n=== Cert/Card links found ===');
    links.forEach(m => console.log(' -', m[1]));

    // Look for form inputs and buttons
    const inputs = [...body.matchAll(/<(input|button|a)[^>]*(type="[^"]*"|value="[^"]*"|href="[^"]*")[^>]*>/gi)];
    console.log('\n=== Interactive elements (first 20) ===');
    inputs.slice(0, 20).forEach(m => console.log(' -', m[0]));
}

probe().catch(e => console.error('Fatal:', e.message));
