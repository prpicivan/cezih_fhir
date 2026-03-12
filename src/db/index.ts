import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'cezih.db');
const db: Database.Database = new Database(dbPath);

export function initDatabase() {
  console.log('Initializing SQLite database at', dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      mbo TEXT PRIMARY KEY,
      oib TEXT,
      cezihId TEXT,
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
    db.exec('ALTER TABLE patients ADD COLUMN cezihId TEXT');
  } catch (e) {
    // Column might already exist
  }

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

  // Migration: recreate documents without FK constraints if they exist
  try {
    const docInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'").get() as any;
    if (docInfo?.sql?.includes('FOREIGN KEY')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS documents_new (
          id TEXT PRIMARY KEY, patientMbo TEXT, visitId TEXT,
          type TEXT, status TEXT, anamnesis TEXT, status_text TEXT,
          finding TEXT, recommendation TEXT, diagnosisCode TEXT,
          diagnosisDisplay TEXT, content TEXT, createdAt TEXT, sentAt TEXT
        );
        INSERT OR IGNORE INTO documents_new SELECT id, patientMbo, visitId, type, status, anamnesis, status_text, finding, recommendation, diagnosisCode, diagnosisDisplay, content, createdAt, sentAt FROM documents;
        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
      `);
      console.log('[DB] Migrated documents: removed FK constraints');
    }
  } catch (e) {
    console.error('[DB] Migration documents failed:', e);
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
      visitId TEXT,        -- no FK: G9 visitIds may not exist in middleware DB
      type TEXT,
      status TEXT,
      anamnesis TEXT,
      status_text TEXT,
      finding TEXT,
      recommendation TEXT,
      diagnosisCode TEXT,
      diagnosisDisplay TEXT,
      content TEXT,
      createdAt TEXT,
      sentAt TEXT
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      patientMbo TEXT,
      title TEXT,
      status TEXT,
      start TEXT,
      end TEXT,
      diagnosisCode TEXT,
      diagnosisDisplay TEXT,
      practitionerName TEXT
    );
  `);

  // Migration: add new columns to cases if they don't exist
  const caseMigrations = ['diagnosisCode TEXT', 'diagnosisDisplay TEXT', 'practitionerName TEXT'];
  for (const col of caseMigrations) {
    try {
      db.exec(`ALTER TABLE cases ADD COLUMN ${col}`);
    } catch (e) { /* column already exists */ }
  }

  // Migration: add bundleJson column to documents (for deferred signing)
  try {
    db.exec('ALTER TABLE documents ADD COLUMN bundleJson TEXT');
  } catch (e) { /* column already exists */ }

  // Migration: add caseId column to documents (for TC18 MHD reference resolution)
  try {
    db.exec('ALTER TABLE documents ADD COLUMN caseId TEXT');
  } catch (e) { /* column already exists */ }

  // Migration: add foreigner columns to patients (TC11)
  try {
    db.exec('ALTER TABLE patients ADD COLUMN passportNumber TEXT');
    db.exec('ALTER TABLE patients ADD COLUMN euCardNumber TEXT');
    db.exec('ALTER TABLE patients ADD COLUMN cezihUniqueId TEXT');
  } catch (e) { /* columns already exist */ }

  // Migration: add cezihVisitId column to visits (CEZIH-assigned identifier for TC13/TC14)
  try {
    db.exec('ALTER TABLE visits ADD COLUMN cezihVisitId TEXT');
  } catch (e) { /* column already exists */ }

  // Migration: add reasonCode/reasonDisplay to visits (TC13 — razlog dolaska)
  try {
    db.exec('ALTER TABLE visits ADD COLUMN reasonCode TEXT');
  } catch (e) { /* column already exists */ }
  try {
    db.exec('ALTER TABLE visits ADD COLUMN reasonDisplay TEXT');
  } catch (e) { /* column already exists */ }

  // Migration: add cezihCaseId column to cases (CEZIH-assigned identifier for TC17)
  try {
    db.exec('ALTER TABLE cases ADD COLUMN cezihCaseId TEXT');
  } catch (e) { /* column already exists */ }

  // Migration: add clinicalStatus column to cases (recurrence/remission/resolved)
  try {
    db.exec('ALTER TABLE cases ADD COLUMN clinicalStatus TEXT');
  } catch (e) { /* column already exists */ }

  // Migration: remove FK constraints from cases if they exist
  try {
    const caseInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cases'").get() as any;
    if (caseInfo?.sql?.includes('FOREIGN KEY')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cases_new (
          id TEXT PRIMARY KEY, patientMbo TEXT, title TEXT, status TEXT,
          start TEXT, end TEXT, diagnosisCode TEXT, diagnosisDisplay TEXT, practitionerName TEXT
        );
        INSERT OR IGNORE INTO cases_new SELECT id, patientMbo, title, status, start, end, diagnosisCode, diagnosisDisplay, practitionerName FROM cases;
        DROP TABLE cases;
        ALTER TABLE cases_new RENAME TO cases;
      `);
      console.log('[DB] Migrated cases: removed FK constraints');
    }
  } catch (e) {
    console.error('[DB] Migration cases failed:', e);
  }

  db.exec(`

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

    CREATE TABLE IF NOT EXISTS terminology_valuesets (
        url      TEXT PRIMARY KEY,
        name     TEXT,
        title    TEXT,
        version  TEXT,
        status   TEXT,
        lastSync TEXT,
        fullResource TEXT
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

  // Seed 15 MKB-10 diagnoses if empty
  const diagCount = db.prepare('SELECT count(*) as count FROM diagnoses').get() as { count: number };
  if (diagCount.count === 0) {
    console.log('Seeding MKB-10 diagnoses...');
    const insertDiag = db.prepare('INSERT INTO diagnoses (code, display) VALUES (?, ?)');
    const commonDiagnoses = [
      { code: 'I10', display: 'Esencijalna (primarna) hipertenzija' },
      { code: 'E11', display: 'Dijabetes melitus neovisan o inzulinu' },
      { code: 'J06.9', display: 'Akutna infekcija gornjega dišnog sustava' },
      { code: 'M54.5', display: 'Križobolja' },
      { code: 'K21.9', display: 'Gastroezofagealna refluksna bolest (GERB)' },
      { code: 'N39.0', display: 'Infekcija mokraćnog sustava' },
      { code: 'F41.1', display: 'Opći anksiozni poremećaj' },
      { code: 'G44.2', display: 'Tenzijska glavobolja' },
      { code: 'I25.1', display: 'Aterosklerotična bolest srca' },
      { code: 'J45.9', display: 'Astma, nespecificirana' },
      { code: 'L20.9', display: 'Atopijski dermatitis' },
      { code: 'M17.9', display: 'Gonoartroza (artroza koljena)' },
      { code: 'R05', display: 'Kašalj' },
      { code: 'R51', display: 'Glavobolja' },
      { code: 'Z00.0', display: 'Opći medicinski pregled' }
    ];
    for (const d of commonDiagnoses) {
      insertDiag.run(d.code, d.display);
    }
  }

  // Seed some settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('terminology_last_sync', new Date().toISOString());
  insertSetting.run('cezih_environment', 'TEST');

  const defaultMenu = [
    { id: 'dashboard', name: 'Nadzorna ploča', href: '/dashboard', icon: 'LayoutDashboard', isVisible: false, orderIndex: 0 },
    { id: 'patients', name: 'Pacijenti', href: '/dashboard/patients', icon: 'Users', isVisible: true, orderIndex: 1 },
    { id: 'calendar', name: 'Termini', href: '/dashboard/calendar', icon: 'Calendar', isVisible: true, orderIndex: 2 },
    { id: 'documents', name: 'Klinički dokumenti', href: '/dashboard/documents', icon: 'Activity', isVisible: true, orderIndex: 3 },
    { id: 'audit', name: 'Praćenje statusa', href: '/dashboard/audit', icon: 'ShieldCheck', isVisible: true, orderIndex: 4 },
    { id: 'registry', name: 'CEZIH Registri', href: '/dashboard/registry', icon: 'BookOpen', isVisible: true, orderIndex: 5 },
    { id: 'settings', name: 'Postavke', href: '/dashboard/settings', icon: 'Settings', isVisible: true, orderIndex: 6 },
    { id: 'certification', name: 'Certifikacija', href: '/dashboard/certification', icon: 'Award', isVisible: true, orderIndex: 7 },
  ];

  // Use INSERT OR REPLACE to ensure the menu is updated even if it already exists
  const insertMenu = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  insertMenu.run('menu_config', JSON.stringify(defaultMenu));
}

export default db;
