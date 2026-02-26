const http = require('http');

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1', port: 3010, path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let buf = '';
            res.on('data', d => buf += d);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    // Create a planned visit (1 year in future → planned status)
    console.log('--- 1. Create planned visit ---');
    const cr = await post('/api/visit/create', {
        patientMbo: '100000001', practitionerId: 'p1', organizationId: 'o1',
        startDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(), class: 'AMB'
    });
    const visitId = cr.body?.result?.localVisitId;
    console.log('visitId:', visitId, 'success:', cr.body?.success);

    console.log('\n--- 2. Start visit (planned → in-progress) via POST /start ---');
    const sr = await post(`/api/visit/${visitId}/start`, {});
    console.log('success:', sr.body?.success);
    console.log('action should appear as ENCOUNTER_START in audit — check /api/audit/logs/' + visitId);
}

main().catch(console.error);
