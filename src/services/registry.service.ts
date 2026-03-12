/**
 * Healthcare Subject Registry Service (Test Case 9)
 * IHE mCSD ITI-90: Find Matching Care Services
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import https from 'https';

// GLOBALNI AGENT: Sprječava curenje memorije i rušenje pri brzim refreshovima!
const mcsdAgent = new https.Agent({ rejectUnauthorized: false });

export interface CommonSearchParams {
    _id?: string;
    _lastUpdated?: string;
    _count?: number;
}
export interface OrganizationSearchParams extends CommonSearchParams {
    active?: boolean; identifier?: string; name?: string; 'name:contains'?: string; 'name:exact'?: string; partof?: string; type?: string; _include?: string | string[]; _revinclude?: string | string[];
}
export interface LocationSearchParams extends CommonSearchParams {
    identifier?: string; name?: string; 'name:contains'?: string; 'name:exact'?: string; organization?: string; partof?: string; status?: string; type?: string; near?: string; _include?: string | string[];
}
export interface PractitionerSearchParams extends CommonSearchParams {
    active?: boolean; identifier?: string; name?: string; 'name:contains'?: string; 'name:exact'?: string; given?: string; 'given:contains'?: string; 'given:exact'?: string; family?: string; 'family:contains'?: string; 'family:exact'?: string;
}
export interface PractitionerRoleSearchParams extends CommonSearchParams {
    active?: boolean; location?: string; organization?: string; practitioner?: string; role?: string; service?: string; specialty?: string; _include?: string | string[];
}
export interface HealthcareServiceSearchParams extends CommonSearchParams {
    active?: boolean; identifier?: string; location?: string; name?: string; 'name:contains'?: string; 'name:exact'?: string; organization?: string; 'service-type'?: string;
}
export interface EndpointSearchParams extends CommonSearchParams {
    identifier?: string; organization?: string; status?: string;
}
export interface OrgAffiliationSearchParams extends CommonSearchParams {
    active?: boolean; date?: string; identifier?: string; 'participating-organization'?: string; 'primary-organization'?: string; role?: string; _include?: string | string[];
}

class RegistryService {
    private getMcsdBaseUrl(): string {
        return `${config.cezih.gatewaySystem}${config.cezih.services.mcsd}`;
    }

    private async getAuthHeaders(): Promise<Record<string, string>> {
        try {
            const systemToken = await authService.getSystemToken();
            if (systemToken) {
                return {
                    'Authorization': `Bearer ${systemToken}`,
                    'Accept': 'application/fhir+json',
                };
            }
        } catch (e) {
            console.log('[RegistryService] System token failed:', (e as Error).message);
        }
        if (authService.hasGatewaySession()) {
            return authService.getUserAuthHeaders('');
        }
        throw new Error('Nema dostupne autentifikacije za mCSD. Potreban je system token (OAuth2 client credentials) ili gateway sesija.');
    }

    async searchResources(resourceType: string, params: Record<string, any> = {}): Promise<{ total: number; resources: any[]; bundle: any }> {
        const headers = await this.getAuthHeaders();
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null) continue;
            if (Array.isArray(value)) value.forEach(v => searchParams.append(key, String(v)));
            else searchParams.append(key, String(value));
        }

        const queryString = searchParams.toString();
        const baseUrl = this.getMcsdBaseUrl();
        const url = queryString ? `${baseUrl}/${resourceType}?${queryString}` : `${baseUrl}/${resourceType}`;
        console.log(`[RegistryService] SEARCH ${resourceType}: ${url}`);

        const response = await axios.get(url, {
            headers,
            httpsAgent: mcsdAgent,
            timeout: 15000,
        });

        const resources = response.data.entry?.map((e: any) => e.resource) || [];
        const total = response.data.total ?? resources.length;
        return { total, resources, bundle: response.data };
    }

    async getResourceById(resourceType: string, id: string): Promise<any> {
        const headers = await this.getAuthHeaders();
        const url = `${this.getMcsdBaseUrl()}/${resourceType}/${id}`;
        const response = await axios.get(url, { headers, httpsAgent: mcsdAgent, timeout: 15000 });
        return response.data;
    }

    async saveResource(resourceType: string, resource: any): Promise<any> {
        const headers = await this.getAuthHeaders();
        const url = `${this.getMcsdBaseUrl()}/${resourceType}`;
        const response = await axios.post(url, resource, {
            headers: { ...headers, 'Content-Type': 'application/fhir+json' },
            httpsAgent: mcsdAgent,
            timeout: 15000,
        });
        return response.data;
    }

    async getResourceHistory(resourceType: string, id: string): Promise<any> {
        const headers = await this.getAuthHeaders();
        const url = `${this.getMcsdBaseUrl()}/${resourceType}/${id}/_history`;
        const response = await axios.get(url, { headers, httpsAgent: mcsdAgent, timeout: 15000 });
        return response.data;
    }

    async getTypeHistory(resourceType: string): Promise<any> {
        const headers = await this.getAuthHeaders();
        const url = `${this.getMcsdBaseUrl()}/${resourceType}/_history`;
        const response = await axios.get(url, { headers, httpsAgent: mcsdAgent, timeout: 15000 });
        return response.data;
    }

    private async executeSearch(resourceType: string, params: Record<string, any>): Promise<any[]> {
        try {
            const result = await this.searchResources(resourceType, params);
            return result.resources;
        } catch (error: any) {
            // POPRAVLJENO: Sigurno parsiranje greške koje neće srušiti Node.js (TypeError: Cannot read properties of undefined)
            if (error.response) {
                const errDataStr = typeof error.response.data === 'string' 
                    ? error.response.data 
                    : JSON.stringify(error.response.data || {});
                    
                console.error(`[RegistryService] ${resourceType}: HTTP ${error.response.status}`, errDataStr.substring(0, 300));
                throw new Error(`CEZIH mCSD ${resourceType}: ${error.response.status} — ${errDataStr.substring(0, 200)}`);
            }
            console.error(`[RegistryService] Failed ${resourceType} search:`, error.message);
            throw error;
        }
    }

    async searchOrganizations(params?: OrganizationSearchParams): Promise<any[]> { return this.executeSearch('Organization', params || {}); }
    async searchLocations(params?: LocationSearchParams): Promise<any[]> { return this.executeSearch('Location', params || {}); }
    async searchPractitioners(params?: PractitionerSearchParams): Promise<any[]> { return this.executeSearch('Practitioner', params || {}); }
    async searchPractitionerRoles(params?: PractitionerRoleSearchParams): Promise<any[]> { return this.executeSearch('PractitionerRole', params || {}); }
    async searchHealthcareServices(params?: HealthcareServiceSearchParams): Promise<any[]> { return this.executeSearch('HealthcareService', params || {}); }
    async searchEndpoints(params?: EndpointSearchParams): Promise<any[]> { return this.executeSearch('Endpoint', params || {}); }
    async searchOrgAffiliations(params?: OrgAffiliationSearchParams): Promise<any[]> { return this.executeSearch('OrganizationAffiliation', params || {}); }
}

export const registryService = new RegistryService();
