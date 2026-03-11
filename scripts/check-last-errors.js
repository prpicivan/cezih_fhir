const Database = require('better-sqlite3');
const db = new Database('cezih.db');

// Dohvati puni zapis REPLACE_DOCUMENT greške
const row = db.prepare(`
    SELECT id, action, status, error_msg, payload_req, payload_res, timestamp
    FROM audit_logs
    WHERE action = 'REPLACE_DOCUMENT' AND status = 'ERROR'
    ORDER BY timestamp DESC
    LIMIT 1
`).get();

if (!row) {
    console.log('Nema REPLACE_DOCUMENT ERROR zapisa.');
} else {
    console.log('ID:', row.id);
    console.log('Action:', row.action);
    console.log('Status:', row.status);
    console.log('Timestamp:', row.timestamp);
    console.log('error_msg:', row.error_msg);

    console.log('\n--- PAYLOAD_RES (puni odgovor) ---');
    if (row.payload_res) {
        try {
            const res = JSON.parse(row.payload_res);
            console.log(JSON.stringify(res, null, 2));
        } catch {
            console.log(String(row.payload_res));
        }
    } else {
        console.log('(prazno)');
    }

    console.log('\n--- PAYLOAD_REQ (što smo poslali - prvih 3000 znakova) ---');
    if (row.payload_req) {
        try {
            const req = JSON.parse(row.payload_req);
            console.log(JSON.stringify(req, null, 2).substring(0, 3000));
        } catch {
            console.log(String(row.payload_req).substring(0, 3000));
        }
    } else {
        console.log('(prazno)');
    }
}

db.close();
