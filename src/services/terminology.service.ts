/**
 * Terminology Service (Test Cases 7, 8)
 * Syncs CodeSystems and ValueSets from CEZIH using IHE SVCM.
 */
import axios from 'axios';
import https from 'https';
import { config } from '../config';
import { authService } from './auth.service';
import db from '../db';

interface FhirBundle {
    resourceType: 'Bundle';
    type: string;
    total?: number;
    entry?: Array<{
        resource: any;
        fullUrl?: string;
    }>;
}

// Globalni agent za stabilnost
const termAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

const TERMINOLOGY_MAPPING: Record<string, { name: string; title: string }> = {
    'document-type': { name: 'HRVrstaDokumenta', title: 'Tipovi kliničkih dokumenata' },
    'djelatnosti-zz': { name: 'HRDjelatnostiZZ', title: 'Djelatnosti zdravstvene zaštite' },
    'ehe-message-types': { name: 'EHEMessageTypes', title: 'Vrste eKarton poruka' },
    'icd10-hr': { name: 'ICD10HR', title: 'MKB-10 Dijagnoze (Hrvatska)' },
    'atc-hr': { name: 'ATCHR', title: 'ATC Klasifikacija lijekova' },
    'mtp-hr': { name: 'MTPHR', title: 'MTP Postupci' },
    'vrsta-posjete': { name: 'HRVrstaPosjete', title: 'Vrste posjete' },
    'nacin-prijema': { name: 'HRNacinPrijema', title: 'Načini prijema u zdravstvenu ustanovu' },
    'sifra-oslobodjenja-od-sudjelovanja-u-troskovima': { name: 'HROslobodjenje', title: 'Šifre oslobođenja' }
};

const ESSENTIAL_CS = [
    'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type',
    'http://fhir.cezih.hr/specifikacije/CodeSystem/djelatnosti-zz',
    'http://ent.hr/fhir/CodeSystem/ehe-message-types',
    'http://fhir.cezih.hr/specifikacije/CodeSystem/vrsta-posjete',
    'http://fhir.cezih.hr/specifikacije/CodeSystem/sifra-oslobodjenja-od-sudjelovanja-u-troskovima'
];

const ESSENTIAL_VS = [
    'http://fhir.cezih.hr/specifikacije/ValueSet/document-type',
    'http://fhir.cezih.hr/specifikacije/ValueSet/djelatnosti-zz',
    'http://ent.hr/fhir/ValueSet/ehe-message-types',
    'http://fhir.cezih.hr/specifikacije/ValueSet/icd10-hr',
    'http://fhir.cezih.hr/specifikacije/ValueSet/atc-hr',
    'http://fhir.cezih.hr/specifikacije/ValueSet/mtp-hr',
    'http://fhir.cezih.hr/specifikacije/ValueSet/vrsta-posjete',
    'http://fhir.cezih.hr/specifikacije/ValueSet/nacin-prijema',
    'http://fhir.cezih.hr/specifikacije/ValueSet/sifra-oslobodjenja-od-sudjelovanja-u-troskovima'
];

class TerminologyService {
    private cachedCodeSystems: Map<string, any> = new Map();
    private cachedValueSets: Map<string, any> = new Map();
    private lastSyncDate: Date | null = null;

    async syncCodeSystems(lastUpdatedAfter?: Date): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();
            const baseUrl = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/CodeSystem`;
            
            const codeSystems: any[] = [];
            
            // 1. Get essential CodeSystems (fetch full if missing)
            for (const eUrl of ESSENTIAL_CS) {
                try {
                    const res = await axios.get(`${baseUrl}?url=${encodeURIComponent(eUrl)}`, { headers, httpsAgent: termAgent });
                    const cs = res.data.entry?.[0]?.resource;
                    if (cs) codeSystems.push(cs);
                } catch (err) {}
            }

            const insertStmt = db.prepare('INSERT OR REPLACE INTO terminology_concepts (system, code, display, version) VALUES (?, ?, ?, ?)');
            const syncStmt = db.prepare('INSERT OR REPLACE INTO terminology_sync (system, lastSync) VALUES (?, ?)');

            for (const cs of codeSystems) {
                if (!cs.url) continue;
                this.cachedCodeSystems.set(cs.url, cs);

                if (cs.concept) {
                    try {
                        const transaction = db.transaction((concepts: any[]) => {
                            for (const concept of concepts) {
                                if (concept.code) insertStmt.run(cs.url, concept.code, concept.display || concept.code, cs.version || '1.0');
                            }
                        });
                        transaction(cs.concept);
                    } catch (dbErr) {}
                }
                syncStmt.run(cs.url, new Date().toISOString());
            }

            return codeSystems;
        } catch (error: any) { throw error; }
    }

    async syncValueSets(lastUpdatedAfter?: Date): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();
            const baseUrl = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/ValueSet`;
            
            const valueSets: any[] = [];

            // 1. Get essential ValueSets (fetch full persistence)
            for (const eUrl of ESSENTIAL_VS) {
                try {
                    const res = await axios.get(`${baseUrl}?url=${encodeURIComponent(eUrl)}`, { headers, httpsAgent: termAgent });
                    const vs = res.data.entry?.[0]?.resource;
                    if (vs) valueSets.push(vs);
                } catch (err) {}
            }

            const upsertStmt = db.prepare('INSERT OR REPLACE INTO terminology_valuesets (url, name, title, version, status, lastSync, fullResource) VALUES (?, ?, ?, ?, ?, ?, ?)');
            const now = new Date().toISOString();
            
            for (const vs of valueSets) {
                if (vs.url) {
                    this.cachedValueSets.set(vs.url, vs);
                    const fullResource = JSON.stringify(vs);
                    try { 
                        upsertStmt.run(vs.url, vs.name || null, vs.title || null, vs.version || null, vs.status || null, now, fullResource); 
                    } catch (dbErr) {}
                }
            }

            return valueSets;
        } catch (error: any) { throw error; }
    }

    async syncAll(): Promise<{ codeSystems: any[]; valueSets: any[] }> {
        const [codeSystems, valueSets] = await Promise.all([
            this.syncCodeSystems(this.lastSyncDate || undefined),
            this.syncValueSets(this.lastSyncDate || undefined)
        ]);
        this.lastSyncDate = new Date();
        return { codeSystems, valueSets };
    }

    getCodeSystem(url: string): any | undefined { return this.cachedCodeSystems.get(url); }
    getValueSet(url: string): any | undefined { return this.cachedValueSets.get(url); }

    getLocalCodeSystems(): { system: string; conceptCount: number; lastSync: string | null }[] {
        const rows = db.prepare(`
            SELECT s.system, s.lastSync, COUNT(c.code) AS conceptCount
            FROM terminology_sync s
            LEFT JOIN terminology_concepts c ON c.system = s.system
            GROUP BY s.system ORDER BY s.lastSync DESC
        `).all() as any[];
        return rows.map(r => ({ system: r.system, conceptCount: r.conceptCount ?? 0, lastSync: r.lastSync ?? null }));
    }

    getLocalValueSets(): { url: string; name: string | null; title: string | null; version: string | null; status: string | null; lastSync: string | null }[] {
        const rows = db.prepare(`SELECT url, name, title, version, status, lastSync FROM terminology_valuesets ORDER BY lastSync DESC`).all() as any[];
        return rows.map(r => {
            let name = r.name, title = r.title;
            const slug = (r.url as string).endsWith('/') ? (r.url as string).slice(0, -1).split('/').pop() : (r.url as string).split('/').pop();
            if (slug && TERMINOLOGY_MAPPING[slug]) {
                name = name || TERMINOLOGY_MAPPING[slug].name;
                title = title || TERMINOLOGY_MAPPING[slug].title;
            }
            return { url: r.url, name: name || null, title: title || null, version: r.version || null, status: r.status || null, lastSync: r.lastSync || null };
        });
    }

    lookupConcept(codeSystemUrl: string, code: string): { code: string; display: string } | undefined {
        try {
            const dbConcept = db.prepare('SELECT code, display FROM terminology_concepts WHERE system = ? AND code = ?').get(codeSystemUrl, code) as any;
            if (dbConcept) return dbConcept;
        } catch (err) { }

        if (codeSystemUrl.includes('icd10-hr')) {
            try {
                const diag = db.prepare('SELECT code, display FROM diagnoses WHERE code = ?').get(code) as any;
                if (diag) return diag;
            } catch (err) { }
        }
        return undefined;
    }

    searchConcepts(system: string, query: string, limit: number = 50): any[] {
        const q = `%${query.toLowerCase()}%`;
        const results = db.prepare(`SELECT code, display FROM terminology_concepts WHERE system = ? AND (LOWER(code) LIKE ? OR LOWER(display) LIKE ?) LIMIT ?`).all(system, q, q, limit);

        if (results.length === 0 && system.includes('icd10-hr')) {
            return db.prepare(`SELECT code, display FROM diagnoses WHERE LOWER(code) LIKE ? OR LOWER(display) LIKE ? LIMIT ?`).all(q, q, limit);
        }
        return results;
    }

    // ============================================================
    // VRAĆENA FUNKCIJA KOJA PUNI PADAJUĆE IZBORNIKE!
    // ============================================================
    async getLocalConcepts(id: string, visited = new Set<string>()): Promise<{ code: string; display: string }[]> {
        if (!id || visited.has(id)) return [];
        visited.add(id); // Osiguranje od beskonačne petlje

        // 1. Zlatni rudnik za MKB-10 (direktno iz vaše tablice diagnoses)
        if (id.includes('icd10-hr')) {
            try {
                const diag = db.prepare('SELECT code, display FROM diagnoses ORDER BY code ASC LIMIT 2000').all() as any[];
                if (diag.length > 0) return diag;
            } catch(e) {}
        }

        // 2. Tražimo u CodeSystem lokalnoj bazi
        let csConcepts = db.prepare(`SELECT code, display FROM terminology_concepts WHERE system LIKE ? ORDER BY code ASC`).all(`%${id}%`) as any[];
        if (csConcepts.length > 0) return csConcepts;

        // 3. Tražimo u ValueSet bazi
        try {
            const vsRow = db.prepare('SELECT fullResource FROM terminology_valuesets WHERE url LIKE ?').get(`%${id}%`) as any;
            if (vsRow?.fullResource) {
                const vs = JSON.parse(vsRow.fullResource);
                if (vs.expansion?.contains) {
                    return vs.expansion.contains.map((c: any) => ({ code: c.code, display: c.display || c.code }));
                }
                const includeSystem = vs.compose?.include?.[0]?.system;
                if (includeSystem && includeSystem !== id) {
                    const localFromSystem = await this.getLocalConcepts(includeSystem, visited);
                    if (localFromSystem.length > 0) return localFromSystem;
                }
            }
        } catch (err: any) {}

        // 4. ON-DEMAND PREUZIMANJE S CEZIH-a (Ako fali lokalno)
        console.log(`[TerminologyService] 🚀 On-Demand Remote Expand for: ${id}`);
        try {
            return await this.remoteExpand(id);
        } catch (e: any) {
            return [];
        }
    }

    private async remoteExpand(id: string): Promise<{ code: string; display: string }[]> {
        const headers = await authService.getSystemAuthHeaders();

        // 4a. Pokušaj Expand ValueSeta
        try {
            let url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/ValueSet/$expand?url=${encodeURIComponent(id)}`;
            const response = await axios.get(url, { headers, httpsAgent: termAgent, timeout: 10000 });
            
            if (response.data.expansion?.contains) {
                const concepts = response.data.expansion.contains.map((c: any) => ({ code: c.code, display: c.display || c.code }));
                try {
                    db.prepare('UPDATE terminology_valuesets SET fullResource = ? WHERE url = ?').run(JSON.stringify(response.data), id);
                } catch(e) {}
                return concepts;
            }
        } catch (e) {}

        // 4b. Pokušaj dohvatiti CodeSystem
        try {
            let url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/CodeSystem?url=${encodeURIComponent(id)}`;
            const response = await axios.get(url, { headers, httpsAgent: termAgent, timeout: 10000 });
            const cs = response.data.entry?.[0]?.resource;
            
            if (cs?.concept) {
                const concepts = cs.concept.map((c: any) => ({ code: c.code, display: c.display || c.code }));
                try {
                    const insertStmt = db.prepare('INSERT OR REPLACE INTO terminology_concepts (system, code, display, version) VALUES (?, ?, ?, ?)');
                    db.transaction((concs: any[]) => {
                        for (const c of concs) if (c.code) insertStmt.run(id, c.code, c.display, '1.0');
                    })(concepts);
                } catch(e) {}
                return concepts;
            }
        } catch(e) {}

        return [];
    }
}

export const terminologyService = new TerminologyService();
