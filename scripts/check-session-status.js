const Database = require('better-sqlite3');
const db = new Database('cezih.db');

try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gateway_session'").get();
    if (row) {
        const s = JSON.parse(row.value);
        const createdAt = new Date(s.createdAt);
        const ageMs = Date.now() - s.createdAt;
        const ageMin = Math.round(ageMs / 60000);
        const maxAge = 4 * 60 * 60 * 1000; // 4h
        
        console.log('--- Session Status ---');
        console.log('Created at:', createdAt.toLocaleString());
        console.log('Age:', ageMin, 'minutes');
        console.log('Expires in:', Math.round((maxAge - ageMs) / 60000), 'minutes');
        console.log('Is valid (local check):', ageMs < maxAge);
        console.log('Cookies count:', s.cookies ? s.cookies.length : 0);
        if (s.sessionToken) {
            console.log('Session token present:', s.sessionToken.substring(0, 10) + '...');
        }
    } else {
        console.log('No session found in database.');
    }
} catch (e) {
    console.error('Error reading session:', e.message);
} finally {
    db.close();
}
