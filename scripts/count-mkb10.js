const db = require('better-sqlite3')('cezih.db');
const diag = db.prepare('SELECT count(*) as cnt FROM diagnoses').get();
const terms = db.prepare("SELECT count(*) as cnt FROM terminology_concepts WHERE system = 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr'").get();
console.log('diagnoses table:', diag.cnt);
console.log('terminology_concepts (icd10-hr):', terms.cnt);
db.close();
