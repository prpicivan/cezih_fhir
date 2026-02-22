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

            let url = `${config.cezih.fhirUrl}/CodeSystem`;
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

            let url = `${config.cezih.fhirUrl}/ValueSet`;
            if (lastUpdatedAfter) {
                const dateStr = lastUpdatedAfter.toISOString().split('T')[0];
                url += `?_lastUpdated=gt${dateStr}`;
            }

            const response = await axios.get<FhirBundle>(url, { headers });

            const valueSets = response.data.entry?.map(e => e.resource) || [];

            // Cache the value sets
            for (const vs of valueSets) {
                if (vs.url) {
                    this.cachedValueSets.set(vs.url, vs);
                }
            }

            console.log(`[TerminologyService] Synced ${valueSets.length} ValueSets`);
            return valueSets;
        } catch (error: any) {
            console.error('[TerminologyService] Failed to sync ValueSets:', error.message);
            throw error;
        }
    }

    /**
     * Full synchronization of all terminologies.
     */
    async syncAll(): Promise<{ codeSystems: any[]; valueSets: any[] }> {
        const codeSystems = await this.syncCodeSystems(this.lastSyncDate || undefined);
        const valueSets = await this.syncValueSets(this.lastSyncDate || undefined);
        this.lastSyncDate = new Date();

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

        // 2. Fallback to cache
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
