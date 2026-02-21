import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'cezih.db');
const db: Database.Database = new Database(dbPath, { verbose: console.log });

export function initDatabase() {
  console.log('Initializing SQLite database at', dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      mbo TEXT PRIMARY KEY,
      oib TEXT,
      firstName TEXT,
      lastName TEXT,
      dateOfBirth TEXT,
      gender TEXT,
      address TEXT,
      city TEXT,
      lastSyncAt TEXT
    );
  `);

  // Ensure lastSyncAt exist for existing databases
  try {
    db.exec('ALTER TABLE patients ADD COLUMN lastSyncAt TEXT');
  } catch (e) {
    // Column might already exist
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      patientMbo TEXT,
      status TEXT, -- 'planned', 'arrived', 'in-progress', 'finished', 'cancelled'
      startDateTime TEXT,
      endDateTime TEXT,
      type TEXT, -- 'first-exam', 'control-exam'
      priority TEXT, -- 'regular', 'urgent'
      doctorName TEXT,
      diagnosis TEXT,
      FOREIGN KEY(patientMbo) REFERENCES patients(mbo)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, -- OID
      patientMbo TEXT,
      visitId TEXT,
      type TEXT, -- 'MEDICINSKI_NALAZ', 'UPUTNICA', 'RECEPT'
      status TEXT, -- 'sent', 'cancelled', 'replaced'
      anamnesis TEXT,
      status_text TEXT,
      finding TEXT,
      recommendation TEXT,
      diagnosisCode TEXT,
      diagnosisDisplay TEXT,
      content TEXT, -- Legacy combined content
      createdAt TEXT,
      sentAt TEXT,
      FOREIGN KEY(patientMbo) REFERENCES patients(mbo),
      FOREIGN KEY(visitId) REFERENCES visits(id)
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      patientMbo TEXT,
      title TEXT,
      status TEXT,
      start TEXT,
      end TEXT,
      FOREIGN KEY(patientMbo) REFERENCES patients(mbo)
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      code TEXT PRIMARY KEY,
      display TEXT
    );
    
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        visitId TEXT,
        action TEXT,
        direction TEXT, -- 'OUTGOING', 'INCOMING'
        status TEXT, -- 'SUCCESS', 'ERROR'
        payload_req TEXT, -- JSON string
        payload_res TEXT, -- JSON string
        error_msg TEXT,
        timestamp TEXT,
        FOREIGN KEY(visitId) REFERENCES visits(id)
    );

    CREATE TABLE IF NOT EXISTS terminology_concepts (
        system TEXT,
        code TEXT,
        display TEXT,
        version TEXT,
        PRIMARY KEY (system, code)
    );

    CREATE TABLE IF NOT EXISTS terminology_sync (
        system TEXT PRIMARY KEY,
        lastSync TEXT
    );
  `);

  // Seed dummy patients if empty
  const patientCount = db.prepare('SELECT count(*) as count FROM patients').get() as { count: number };
  if (patientCount.count === 0) {
    console.log('Seeding dummy patients...');
    const insert = db.prepare('INSERT INTO patients (mbo, oib, firstName, lastName, dateOfBirth, gender, address, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insert.run('123456789', '12345678901', 'Ivan', 'Horvat', '1980-01-01', 'male', 'Ilica 1', 'Zagreb');
    insert.run('987654321', '10987654321', 'Ana', 'Kovač', '1990-05-15', 'female', 'Vukovarska 10', 'Split');
    insert.run('112233445', '11223344556', 'Marko', 'Marić', '1975-11-20', 'male', 'Riva 5', 'Rijeka');
  }

  // Seed some settings
  const settingsCount = db.prepare('SELECT count(*) as count FROM settings').get() as { count: number };
  if (settingsCount.count === 0) {
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insert.run('terminology_last_sync', new Date().toISOString());
    insert.run('cezih_environment', 'TEST');
  }
}

export default db;
