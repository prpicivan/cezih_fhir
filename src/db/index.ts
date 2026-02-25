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

  // Ensure columns exist for existing databases
  try {
    db.exec('ALTER TABLE patients ADD COLUMN lastSyncAt TEXT');
  } catch (e) {
    // Column might already exist
  }

  try {
    db.exec('ALTER TABLE audit_logs ADD COLUMN patientMbo TEXT');
  } catch (e) {
    // Column might already exist
  }

  // Migration: recreate audit_logs without FK constraints if they exist
  // FK constraints block inserts when visitId/patientMbo not in local DB
  try {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_logs'").get() as any;
    if (info?.sql?.includes('FOREIGN KEY')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs_new (
          id TEXT PRIMARY KEY, visitId TEXT, patientMbo TEXT,
          action TEXT, direction TEXT, status TEXT,
          payload_req TEXT, payload_res TEXT, error_msg TEXT, timestamp TEXT
        );
        INSERT OR IGNORE INTO audit_logs_new SELECT id, visitId, patientMbo, action, direction, status, payload_req, payload_res, error_msg, timestamp FROM audit_logs;
        DROP TABLE audit_logs;
        ALTER TABLE audit_logs_new RENAME TO audit_logs;
      `);
      console.log('[DB] Migrated audit_logs: removed FK constraints');
    }
  } catch (e) {
    console.error('[DB] Migration audit_logs failed:', e);
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
        visitId TEXT,        -- no FK: G9 visitIds may not exist in middleware DB
        patientMbo TEXT,     -- no FK: patientMbo may not exist in middleware DB
        action TEXT,
        direction TEXT,
        status TEXT,
        payload_req TEXT,
        payload_res TEXT,
        error_msg TEXT,
        timestamp TEXT
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
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('terminology_last_sync', new Date().toISOString());
  insertSetting.run('cezih_environment', 'TEST');

  const defaultMenu = [
    { id: 'dashboard', name: 'Nadzorna ploča', href: '/dashboard', icon: 'LayoutDashboard', isVisible: true, orderIndex: 0 },
    { id: 'patients', name: 'Pacijenti', href: '/dashboard/patients', icon: 'Users', isVisible: true, orderIndex: 1 },
    { id: 'calendar', name: 'Kalendar', href: '/dashboard/calendar', icon: 'Calendar', isVisible: true, orderIndex: 2 },
    { id: 'documents', name: 'Klinički dokumenti', href: '/dashboard/documents', icon: 'Activity', isVisible: true, orderIndex: 3 },
    { id: 'audit', name: 'Praćenje statusa', href: '/dashboard/audit', icon: 'ShieldCheck', isVisible: true, orderIndex: 4 },
    { id: 'registry', name: 'Registar (TC 9)', href: '/dashboard/registry', icon: 'Users', isVisible: true, orderIndex: 5 },
    { id: 'settings', name: 'Postavke', href: '/dashboard/settings', icon: 'Settings', isVisible: true, orderIndex: 6 },
    { id: 'certification', name: 'Certifikacija', href: '/dashboard/certification', icon: 'Award', isVisible: true, orderIndex: 7 },
  ];
  insertSetting.run('menu_config', JSON.stringify(defaultMenu));
}

export default db;
