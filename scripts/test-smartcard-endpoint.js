/**
 * Quick test of the smartcard gateway endpoint
 */
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3010,
    path: '/api/auth/smartcard/gateway',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        try { console.log('Body:', JSON.stringify(JSON.parse(body), null, 2)); }
        catch { console.log('Body:', body); }
    });
});
req.on('error', e => console.error('Error:', e.message));
req.end();
