
import db from '../src/db/index';

console.log('Seeding documents...');

const docs = [
    {
        id: '2.16.840.1.113883.3.1937.777.1.1.1', // Mock OID
        patientMbo: '223344551', // Luka Lukić
        visitId: null,
        type: 'LJEKARSKI_NALAZ',
        status: 'sent',
        content: JSON.stringify({ resourceType: 'Bundle', type: 'document' }),
        createdAt: new Date().toISOString(),
        sentAt: new Date().toISOString()
    },
    {
        id: '2.16.840.1.113883.3.1937.777.1.1.2',
        patientMbo: '223344552', // Petra Petrović
        visitId: null,
        type: 'UPUTNICA',
        status: 'sent',
        content: JSON.stringify({ resourceType: 'Bundle', type: 'document' }),
        createdAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        sentAt: new Date(Date.now() - 86400000).toISOString()
    }
];

const insert = db.prepare('INSERT OR REPLACE INTO documents (id, patientMbo, visitId, type, status, content, createdAt, sentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

docs.forEach(d => {
    insert.run(d.id, d.patientMbo, d.visitId, d.type, d.status, d.content, d.createdAt, d.sentAt);
    console.log(`Added document: ${d.type} for MBO ${d.patientMbo}`);
});

console.log('Seeding documents complete.');
