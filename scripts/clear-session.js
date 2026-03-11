const Database = require('better-sqlite3');
const db = new Database('cezih.db');

const row = db.prepare("SELECT value FROM settings WHERE key = 'gateway_session'").get();
if (row) {
    const s = JSON.parse(row.value);
    console.log('Stara sesija kreirana:', new Date(s.createdAt).toISOString());
    console.log('Stara (min):', Math.round((Date.now() - s.createdAt) / 60000), 'min');
    console.log('Cookies:', s.cookies?.map(c => c.substring(0, 60)));
    db.prepare("DELETE FROM settings WHERE key = 'gateway_session'").run();
    console.log('✅ Sesija obrisana! Potrebna je nova prijava.');
} else {
    console.log('Nema sesije u DB - već je prazna.');
}
db.close();
