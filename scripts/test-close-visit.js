const http = require('http');

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3010,
            path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let buf = '';
            res.on('data', d => buf += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
                catch (e) { resolve({ status: res.statusCode, raw: buf }); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log('--- 1. Create visit ---');
    const createRes = await post('/api/visit/create', {
        patientMbo: '100000001',
        practitionerId: 'p1',
        organizationId: 'o1',
        startDate: new Date().toISOString(),
        class: 'AMB'
    });
    console.log('Status:', createRes.status);
    console.log('Body:', JSON.stringify(createRes.body, null, 2));

    const visitId = createRes.body?.result?.localVisitId;
    console.log('\nvisitId from response:', visitId);

    if (!visitId) {
        console.error('No visitId returned — CANNOT TEST CLOSE');
        return;
    }

    console.log('\n--- 2. Close visit ---');
    const closeRes = await post(`/api/visit/${visitId}/close`, {
        endDate: new Date().toISOString()
    });
    console.log('Status:', closeRes.status);
    console.log('Body:', JSON.stringify(closeRes.body ?? closeRes.raw, null, 2));
}

main().catch(console.error);
