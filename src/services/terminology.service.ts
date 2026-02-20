/**
 * Terminology Service (Test Cases 7, 8)
 * Syncs CodeSystems and ValueSets from CEZIH using IHE SVCM.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';

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

            // Cache the code systems
            for (const cs of codeSystems) {
                if (cs.url) {
                    this.cachedCodeSystems.set(cs.url, cs);
                }
            }

            console.log(`[TerminologyService] Synced ${codeSystems.length} CodeSystems`);
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
     */
    lookupConcept(codeSystemUrl: string, code: string): { code: string; display: string } | undefined {
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
}

export const terminologyService = new TerminologyService();
