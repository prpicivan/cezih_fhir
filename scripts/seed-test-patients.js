/**
 * seed-test-patients.js
 * Seeds 10 Croatian test patients into the middleware SQLite DB.
 * Run with: node scripts/seed-test-patients.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'cezih.db');
const db = new Database(DB_PATH);

const testPatients = [
    {
        mbo: '100000001',
        oib: '12345678901',
        firstName: 'Ivan',
        lastName: 'Horvat',
        dateOfBirth: '1975-03-15',
        gender: 'male',
        city: 'Zagreb'
    },
    {
        mbo: '100000002',
        oib: '23456789012',
        firstName: 'Marija',
        lastName: 'Kovač',
        dateOfBirth: '1988-07-22',
        gender: 'female',
        city: 'Split'
    },
    {
        mbo: '100000003',
        oib: '34567890123',
        firstName: 'Josip',
        lastName: 'Babić',
        dateOfBirth: '1960-11-30',
        gender: 'male',
        city: 'Rijeka'
    },
    {
        mbo: '100000004',
        oib: '45678901234',
        firstName: 'Ana',
        lastName: 'Knežević',
        dateOfBirth: '1995-01-10',
        gender: 'female',
        city: 'Osijek'
    },
    {
        mbo: '100000005',
        oib: '56789012345',
        firstName: 'Tomislav',
        lastName: 'Petrović',
        dateOfBirth: '1952-06-05',
        gender: 'male',
        city: 'Zadar'
    },
    {
        mbo: '100000006',
        oib: '67890123456',
        firstName: 'Maja',
        lastName: 'Novak',
        dateOfBirth: '1982-09-18',
        gender: 'female',
        city: 'Pula'
    },
    {
        mbo: '100000007',
        oib: '78901234567',
        firstName: 'Stjepan',
        lastName: 'Jurić',
        dateOfBirth: '1970-04-25',
        gender: 'male',
        city: 'Varaždin'
    },
    {
        mbo: '100000008',
        oib: '89012345678',
        firstName: 'Katarina',
        lastName: 'Blažević',
        dateOfBirth: '1999-12-03',
        gender: 'female',
        city: 'Dubrovnik'
    },
    {
        mbo: '100000009',
        oib: '90123456789',
        firstName: 'Nikola',
        lastName: 'Vuković',
        dateOfBirth: '1943-08-14',
        gender: 'male',
        city: 'Sisak'
    },
    {
        mbo: '100000010',
        oib: '01234567890',
        firstName: 'Petra',
        lastName: 'Marković',
        dateOfBirth: '2001-05-28',
        gender: 'female',
        city: 'Karlovac'
    }
];

const upsert = db.prepare(`
  INSERT INTO patients (mbo, oib, firstName, lastName, dateOfBirth, gender, city, lastSyncAt)
  VALUES (@mbo, @oib, @firstName, @lastName, @dateOfBirth, @gender, @city, @lastSyncAt)
  ON CONFLICT(mbo) DO UPDATE SET
    oib = excluded.oib,
    firstName = excluded.firstName,
    lastName = excluded.lastName,
    dateOfBirth = excluded.dateOfBirth,
    gender = excluded.gender,
    city = excluded.city,
    lastSyncAt = excluded.lastSyncAt
`);

const now = new Date().toISOString();

for (const patient of testPatients) {
    upsert.run({ ...patient, lastSyncAt: now });
    console.log(`✓ Seeded: ${patient.firstName} ${patient.lastName} (MBO: ${patient.mbo})`);
}

console.log(`\nDone. ${testPatients.length} test patients seeded into ${DB_PATH}`);
db.close();
