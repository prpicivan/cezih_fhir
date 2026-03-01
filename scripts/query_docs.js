const Database = require('better-sqlite3');
const db = new Database('cezih.db');
const docs = db.prepare('SELECT * FROM documents ORDER BY createdAt DESC LIMIT 5').all();
console.log('DOCUMENTS:', JSON.stringify(docs, null, 2));
const logs = db.prepare("SELECT * FROM audit_logs WHERE action LIKE '%DOCUMENT%' ORDER BY timestamp DESC LIMIT 5").all();
console.log('AUDIT LOGS (DOCUMENT):', JSON.stringify(logs, null, 2));
db.close();
