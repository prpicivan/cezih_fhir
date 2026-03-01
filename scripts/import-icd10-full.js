const axios = require('axios');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
dotenv.config();

const db = new Database('cezih.db');

async function getSystemToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CEZIH_CLIENT_ID || '');
    params.append('client_secret', process.env.CEZIH_CLIENT_SECRET || '');
    const response = await axios.post(process.env.CEZIH_TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data.access_token;
}

// Recursively flatten nested concept arrays
function flattenConcepts(concepts, system, version, result = []) {
    for (const c of concepts || []) {
        if (c.code && c.display) {
            result.push({ system, code: c.code, display: c.display, version: version || '1.0' });
        }
        if (c.concept) {
            flattenConcepts(c.concept, system, version, result);
        }
    }
    return result;
}

async function run() {
    console.log('Fetching system token...');
    const token = await getSystemToken();

    const url = 'https://certws2.cezih.hr:9443/services-router/gateway/terminology-services/api/v1/CodeSystem?url=http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr';
    console.log('Fetching ICD-10 CodeSystem from CEZIH...');

    const resp = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/fhir+json' }
    });

    const entries = resp.data.entry || [];
    const cs = entries.find(e => e.resource?.url === 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr')?.resource;

    if (!cs) {
        console.error('Could not find icd10-hr CodeSystem in response');
        process.exit(1);
    }

    console.log(`Found CodeSystem: ${cs.url} (version: ${cs.version})`);
    const allConcepts = flattenConcepts(cs.concept, cs.url, cs.version);
    console.log(`Total concepts to import: ${allConcepts.length}`);

    const insertLegacy = db.prepare('INSERT OR REPLACE INTO diagnoses (code, display) VALUES (?, ?)');
    const insertModern = db.prepare('INSERT OR REPLACE INTO terminology_concepts (system, code, display, version) VALUES (?, ?, ?, ?)');

    const transaction = db.transaction((concepts) => {
        for (const c of concepts) {
            insertLegacy.run(c.code, c.display);
            insertModern.run(c.system, c.code, c.display, c.version);
        }
    });

    console.log('Importing into DB...');
    transaction(allConcepts);

    // Verify
    const legacyCount = db.prepare('SELECT count(*) as cnt FROM diagnoses').get();
    const modernCount = db.prepare("SELECT count(*) as cnt FROM terminology_concepts WHERE system = 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr'").get();

    console.log(`\nDone!`);
    console.log(`diagnoses table:              ${legacyCount.cnt} rows`);
    console.log(`terminology_concepts (icd10): ${modernCount.cnt} rows`);

    db.close();
}

run().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
