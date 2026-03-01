/**
 * Verify x509 URL from /api/auth/initiate?method=smartcard
 */
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3010,
    path: '/api/auth/initiate?method=smartcard',
    method: 'GET',
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        try {
            const data = JSON.parse(body);
            console.log('success:', data.success);
            console.log('method:', data.method);
            const url = data.authUrl || '';
            const hasX509 = url.includes('x509Certificate');
            const hasBasic = url.includes('BasicAuth');
            console.log('Has x509CertificateAuthenticator:', hasX509 ? '✅' : '❌');
            console.log('Has BasicAuthenticator:', hasBasic ? '⚠️' : '✅ (removed)');
            console.log('Auth URL (first 200):', url.substring(0, 200));
        } catch {
            console.log('Raw:', body.substring(0, 300));
        }
    });
});
req.on('error', e => console.error('Error:', e.message));
req.end();
