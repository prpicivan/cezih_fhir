
import db from '../src/db/index';

console.log('Adding 3 new test patients...');

const newPatients = [
    { mbo: '223344551', oib: '55555555551', firstName: 'Luka', lastName: 'Lukić', dateOfBirth: '1988-02-15', gender: 'male', address: 'Vlaška 20', city: 'Zagreb' },
    { mbo: '223344552', oib: '55555555552', firstName: 'Petra', lastName: 'Petrović', dateOfBirth: '1992-06-25', gender: 'female', address: 'Osječka 50', city: 'Osijek' },
    { mbo: '223344553', oib: '55555555553', firstName: 'Davor', lastName: 'Davorić', dateOfBirth: '1970-12-10', gender: 'male', address: 'Zadarska 1', city: 'Zadar' }
];

const insert = db.prepare('INSERT OR IGNORE INTO patients (mbo, oib, firstName, lastName, dateOfBirth, gender, address, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

newPatients.forEach(p => {
    insert.run(p.mbo, p.oib, p.firstName, p.lastName, p.dateOfBirth, p.gender, p.address, p.city);
    console.log(`Added: ${p.firstName} ${p.lastName} (MBO: ${p.mbo})`);
});

console.log('Refreshed patient list:');
const all = db.prepare('SELECT firstName, lastName, mbo FROM patients').all();
console.table(all);
