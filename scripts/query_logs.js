const Database = require('better-sqlite3');
const db = new Database('cezih.db');
const logs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10').all();
console.log(JSON.stringify(logs, null, 2));
db.close();
