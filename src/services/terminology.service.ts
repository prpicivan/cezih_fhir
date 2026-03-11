/**
 * Terminology Service (Test Cases 7, 8)
 * Syncs CodeSystems and ValueSets from CEZIH using IHE SVCM.
 */
import axios from 'axios';
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

class TerminologyService {
    private cachedCodeSystems: Map<string, any> = new Map();
    private cachedValueSets: Map<string, any> = new Map();
    private lastSyncDate: Date | null = null;

    // ============================================================
    // Test Case 7: CodeSystem Synchronization (IHE SVCM ITI-96)
    // ============================================================

    /**
     * Query and sync CodeSystems from CEZIH.
     * Uses IHE SVCM ITI-96 (Query Code System) transaction.
     *
     * @param lastUpdatedAfter Only fetch CodeSystems updated after this date
     */
    async syncCodeSystems(lastUpdatedAfter?: Date): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();

            let url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/CodeSystem`;
            console.log('[TerminologyService] Syncing CodeSystems from:', url);
            if (lastUpdatedAfter) {
                const dateStr = lastUpdatedAfter.toISOString().split('T')[0];
                url += `?_lastUpdated=gt${dateStr}`;
            }

            const response = await axios.get<FhirBundle>(url, { headers });

            const codeSystems = response.data.entry?.map(e => e.resource) || [];

            // Cache and Persist the code systems
            const insertStmt = db.prepare('INSERT OR REPLACE INTO terminology_concepts (system, code, display, version) VALUES (?, ?, ?, ?)');
            const syncStmt = db.prepare('INSERT OR REPLACE INTO terminology_sync (system, lastSync) VALUES (?, ?)');

            for (const cs of codeSystems) {
                if (cs.url) {
                    this.cachedCodeSystems.set(cs.url, cs);

                    // Persist concepts if available
                    if (cs.concept) {
                        const transaction = db.transaction((concepts: any[]) => {
                            for (const concept of concepts) {
                                insertStmt.run(cs.url, concept.code, concept.display, cs.version || '1.0');
                            }
                        });
                        transaction(cs.concept);
                    }

                    syncStmt.run(cs.url, new Date().toISOString());
                }
            }

            console.log(`[TerminologyService] Synced and Persisted ${codeSystems.length} CodeSystems`);
            return codeSystems;
        } catch (error: any) {
            console.error('[TerminologyService] Failed to sync CodeSystems:', error.message);
            throw error;
        }
    }

    // ============================================================
    // Test Case 8: ValueSet Synchronization (IHE SVCM ITI-95)
    // ============================================================

    /**
     * Query and sync ValueSets from CEZIH.
     * Uses IHE SVCM ITI-95 (Query Value Set) transaction.
     *
     * @param lastUpdatedAfter Only fetch ValueSets updated after this date
     */
    async syncValueSets(lastUpdatedAfter?: Date): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();

            let url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/ValueSet`;
            console.log('[TerminologyService] Syncing ValueSets from:', url);
            if (lastUpdatedAfter) {
                const dateStr = lastUpdatedAfter.toISOString().split('T')[0];
                url += `?_lastUpdated=gt${dateStr}`;
            }

            const response = await axios.get<FhirBundle>(url, { headers });

            const valueSets = response.data.entry?.map(e => e.resource) || [];

            // CEZIH sometimes omits its own ValueSets from the main list. 
            // We'll add some essential ones if they are missing.
            const essentialUrls = [
                'http://fhir.cezih.hr/specifikacije/ValueSet/document-type',
                'http://fhir.cezih.hr/specifikacije/ValueSet/djelatnosti-zz',
                'http://ent.hr/fhir/ValueSet/ehe-message-types',
                'http://fhir.cezih.hr/specifikacije/ValueSet/icd10-hr',
                'http://fhir.cezih.hr/specifikacije/ValueSet/atc-hr',
                'http://fhir.cezih.hr/specifikacije/ValueSet/mtp-hr'
            ];

            for (const url of essentialUrls) {
                if (!valueSets.find(vs => vs && vs.url === url)) {
                    try {
                        console.log(`[TerminologyService] Fetching essential ValueSet: ${url}`);
                        const vsRes = await axios.get(`${config.cezih.gatewaySystem}${config.cezih.services.terminology}/ValueSet?url=${encodeURIComponent(url)}`, { headers });
                        const vs = vsRes.data.entry?.[0]?.resource;
                        if (vs) valueSets.push(vs);
                    } catch (e) { /* ignore */ }
                }
            }

            // Cache and persist the value sets
            const upsertStmt = db.prepare(
                'INSERT OR REPLACE INTO terminology_valuesets (url, name, title, version, status, lastSync, fullResource) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            const now = new Date().toISOString();
            for (const vs of valueSets) {
                if (vs && vs.url) {
                    this.cachedValueSets.set(vs.url, vs);
                    upsertStmt.run(
                        vs.url, 
                        vs.name || null, 
                        vs.title || null, 
                        vs.version || null, 
                        vs.status || null, 
                        now,
                        JSON.stringify(vs)
                    );
                }
            }

            console.log(`[TerminologyService] Synced and persisted ${valueSets.length} ValueSets (with fullResource)`);
            return valueSets;
        } catch (error: any) {
            console.error('[TerminologyService] Failed to sync ValueSets:', error.message);
            throw error;
        }
    }

    /**
     * Full synchronization of all terminologies.
     * @param force - If true, ignores lastSyncDate and fetches everything
     */
    async syncAll(force = true): Promise<{ codeSystems: any[]; valueSets: any[] }> {
        const lastUpdated = force ? undefined : (this.lastSyncDate || undefined);
        const codeSystems = await this.syncCodeSystems(lastUpdated);
        const valueSets = await this.syncValueSets(lastUpdated);
        
        if (codeSystems.length > 0 || valueSets.length > 0) {
            this.lastSyncDate = new Date();
        }

        return { codeSystems, valueSets };
    }

    /**
     * Get a cached CodeSystem by URL.
     */
    getCodeSystem(url: string): any | undefined {
        return this.cachedCodeSystems.get(url);
    }

    /**
     * Get a cached ValueSet by URL.
     */
    getValueSet(url: string): any | undefined {
        return this.cachedValueSets.get(url);
    }

    /**
     * Read all CodeSystems from local DB (no CEZIH call).
     * Returns each system URL with its concept count and last sync date.
     */
    getLocalCodeSystems(): { system: string; conceptCount: number; lastSync: string | null }[] {
        const rows = db.prepare(`
            SELECT s.system, s.lastSync, COUNT(c.code) AS conceptCount
            FROM terminology_sync s
            LEFT JOIN terminology_concepts c ON c.system = s.system
            GROUP BY s.system
            ORDER BY s.lastSync DESC
        `).all() as any[];
        return rows.map(r => ({
            system: r.system,
            conceptCount: r.conceptCount ?? 0,
            lastSync: r.lastSync ?? null,
        }));
    }

    /**
     * Read all ValueSets from local DB (no CEZIH call).
     */
    getLocalValueSets(): { url: string; name: string | null; title: string | null; version: string | null; status: string | null; lastSync: string | null }[] {
        const rows = db.prepare(`
            SELECT url, name, title, version, status, lastSync
            FROM terminology_valuesets
            ORDER BY lastSync DESC
        `).all() as any[];
        return rows.map(r => ({
            url: r.url,
            name: r.name ?? null,
            title: r.title ?? null,
            version: r.version ?? null,
            status: r.status ?? null,
            lastSync: r.lastSync ?? null,
        }));
    }

    /**
     * Look up a concept in a CodeSystem.
     * Check DB first, then cache.
     */
    lookupConcept(codeSystemUrl: string, code: string): { code: string; display: string } | undefined {
        // 1. Try DB first
        try {
            const dbConcept = db.prepare('SELECT code, display FROM terminology_concepts WHERE system = ? AND code = ?').get(codeSystemUrl, code) as any;
            if (dbConcept) return dbConcept;
        } catch (err) {
            console.warn('[TerminologyService] DB lookup failed:', err);
        }

        // 2. Fallback for ICD-10 to legacy diagnoses table
        if (codeSystemUrl === 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr') {
            try {
                const diag = db.prepare('SELECT code, display FROM diagnoses WHERE code = ?').get(code) as any;
                if (diag) return diag;
            } catch (err) {
                console.warn('[TerminologyService] Legacy diagnoses lookup failed:', err);
            }
        }

        // 3. Fallback to cache
        const cs = this.cachedCodeSystems.get(codeSystemUrl);
        if (!cs?.concept) return undefined;

        const findConcept = (concepts: any[]): any => {
            for (const concept of concepts) {
                if (concept.code === code) return concept;
                if (concept.concept) {
                    const found = findConcept(concept.concept);
                    if (found) return found;
                }
            }
            return undefined;
        };

        return findConcept(cs.concept);
    }

    /**
     * Get all concepts for a specific CodeSystem or ValueSet from the local database.
     */
    async getLocalConcepts(id: string): Promise<{ code: string; display: string }[]> {
        if (!id) return [];

        // 1. Try if it's a CodeSystem first (Exact Match)
        const csSqlExact = `
            SELECT code, display 
            FROM terminology_concepts 
            WHERE system = ?
            ORDER BY code ASC
        `;
        let csConcepts = db.prepare(csSqlExact).all(id) as { code: string; display: string }[];
        
        // 2. Try Partial Match for CodeSystem
        if (csConcepts.length === 0) {
            const csSqlPartial = `
                SELECT code, display 
                FROM terminology_concepts 
                WHERE system LIKE ? OR system LIKE ?
                ORDER BY code ASC
            `;
            csConcepts = db.prepare(csSqlPartial).all(`%/CodeSystem/${id}`, `%/${id}%`) as { code: string; display: string }[];
        }

        if (csConcepts.length > 0) return csConcepts;

        // 3. Try if it's a ValueSet
        try {
            const vsSql = 'SELECT fullResource FROM terminology_valuesets WHERE url = ? OR url LIKE ? OR url LIKE ?';
            const vsRow = db.prepare(vsSql).get(id, `%/ValueSet/${id}`, `%/${id}%`) as any;
            
            if (vsRow?.fullResource) {
                const vs = JSON.parse(vsRow.fullResource);
                
                // A) Resolution via Expansion if already present
                if (vs.expansion?.contains) {
                    return vs.expansion.contains.map((c: any) => ({ code: c.code, display: c.display || c.code }));
                }

                // B) Resolution via Compose: if it includes a system, fetch concepts for that system locally
                const include = vs.compose?.include?.[0];
                if (include?.system) {
                    const localConcepts = await this.getLocalConcepts(include.system);
                    if (localConcepts.length > 0) return localConcepts;
                }
            }
        } catch (err: any) {
            console.error('[TerminologyService] Local ValueSet check failed:', err.message);
        }

        // 4. ON-DEMAND REMOTE EXPAND (If all local attempts failed)
        console.log(`[TerminologyService] 🚀 On-demand remote expand for: ${id}`);
        try {
            return await this.remoteExpand(id);
        } catch (e: any) {
            console.error(`[TerminologyService] Remote expand failed for ${id}:`, e.message);
            return [];
        }
    }

    /**
     * Remote $expand operation for CodeSystem or ValueSet.
     */
    private async remoteExpand(id: string): Promise<{ code: string; display: string }[]> {
        const headers = await authService.getSystemAuthHeaders();
        
        // 1. Try ValueSet $expand first
        try {
            let url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/ValueSet/$expand?url=${encodeURIComponent(id)}`;
            const response = await axios.get(url, { headers, timeout: 15000 });
            if (response.data.expansion?.contains) {
                const concepts = response.data.expansion.contains.map((c: any) => ({
                    code: c.code,
                    display: c.display || c.code
                }));
                
                if (concepts.length > 0) {
                    db.prepare('UPDATE terminology_valuesets SET fullResource = ? WHERE url = ?').run(
                        JSON.stringify(response.data), id
                    );
                }
                return concepts;
            }
        } catch (e: any) {
            console.log(`[TerminologyService] remoteExpand: $expand failed for ${id}, falling back to metadata fetch.`);
        }

        // 2. Fallback: Fetch ValueSet Metadata and try to resolve via CodeSystem
        try {
            const url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/ValueSet?url=${encodeURIComponent(id)}`;
            const response = await axios.get(url, { headers, timeout: 10000 });
            const vs = response.data.entry?.[0]?.resource;
            
            if (vs) {
                // Save it for next time
                db.prepare('UPDATE terminology_valuesets SET fullResource = ? WHERE url = ?').run(
                    JSON.stringify(vs), id
                );
                
                // Try to resolve concepts via include system
                const includeSystem = vs.compose?.include?.[0]?.system;
                if (includeSystem) {
                    console.log(`[TerminologyService] Resolving ValueSet concepts via CodeSystem: ${includeSystem}`);
                    return this.getLocalConcepts(includeSystem);
                }
            }
        } catch (e) {
            console.log(`[TerminologyService] remoteExpand: Metadata fetch failed for ${id}.`);
        }

        // 3. Try CodeSystem lookup directly (maybe it's a CodeSystem URL being expanded?)
        try {
            let url = `${config.cezih.gatewaySystem}${config.cezih.services.terminology}/CodeSystem?url=${encodeURIComponent(id)}`;
            const response = await axios.get(url, { headers, timeout: 10000 });
            const cs = response.data.entry?.[0]?.resource;
            
            if (cs?.concept) {
                const concepts = cs.concept.map((c: any) => ({ code: c.code, display: c.display || c.code }));
                
                // Persist concepts locally
                const insertStmt = db.prepare('INSERT OR REPLACE INTO terminology_concepts (system, code, display, version) VALUES (?, ?, ?, ?)');
                const syncStmt = db.prepare('INSERT OR REPLACE INTO terminology_sync (system, lastSync) VALUES (?, ?)');
                
                const transaction = db.transaction((concepts: any[]) => {
                    for (const concept of concepts) {
                        insertStmt.run(id, concept.code, concept.display, cs.version || '1.0');
                    }
                    syncStmt.run(id, new Date().toISOString());
                });
                transaction(concepts);
                
                return concepts;
            }
        } catch (e: any) {
            console.error(`[TerminologyService] Remote search for CodeSystem failed for ${id}:`, e.message);
        }

        return [];
    }

    /**
     * Search concepts in a CodeSystem from the database.
     */
    searchConcepts(system: string, query: string, limit: number = 50): any[] {
        const sql = `
            SELECT code, display 
            FROM terminology_concepts 
            WHERE system = ? AND (LOWER(code) LIKE ? OR LOWER(display) LIKE ?)
            LIMIT ?
        `;
        const q = `%${query.toLowerCase()}%`;
        const results = db.prepare(sql).all(system, q, q, limit);

        // Fallback for ICD-10 to legacy diagnoses table if empty
        if (results.length === 0 && system === 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr') {
            console.log('[TerminologyService] Falling back to legacy diagnoses table');
            const fallbackSql = `
                SELECT code, display 
                FROM diagnoses 
                WHERE LOWER(code) LIKE ? OR LOWER(display) LIKE ?
                LIMIT ?
            `;
            return db.prepare(fallbackSql).all(q, q, limit);
        }

        return results;
    }
}

export const terminologyService = new TerminologyService();
