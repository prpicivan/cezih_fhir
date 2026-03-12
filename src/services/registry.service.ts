/**
 * Healthcare Subject Registry Service (Test Case 9)
 * IHE mCSD ITI-90: Find Matching Care Services
 *
 * Supports GET + POST search on:
 *   Organization, Location, Practitioner, PractitionerRole,
 *   HealthcareService, Endpoint, OrganizationAffiliation
 *
 * Common parameters (_id, _lastUpdated with prefixes gt/lt/ge/le/sa/eb)
 * String modifiers: :contains, :exact
 *
 * CEZIH profiles:
 *   - Organization: hr-organizacija (4 identifier slices: HZZOBroj, UUID, HZJZ, OIB)
 *   - Practitioner: hr-practitioner
 *   - HealthcareService: hr-healthcare-service
 *
 * NOTE: mCSD runs exclusively on port 9443 (system auth / OAuth2 client credentials).
 * Path: /mcsd/api/{ResourceType} — confirmed by CEZIH endpoint list 2026-03-05.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';

// ============================================================
// Search Parameter Interfaces (per ITI-90 spec §2:3.90.4.1.2)
// ============================================================

/** Common FHIR search params supported on all mCSD resources */
interface CommonSearchParams {
    _id?: string;
    _lastUpdated?: string;  // with prefixes: gt, lt, ge, le, sa, eb
    _count?: number;
}

/** §2:3.90.4.1.2.2 Organization search params */
export interface OrganizationSearchParams extends CommonSearchParams {
    active?: boolean;
    identifier?: string;
    name?: string;
    'name:contains'?: string;
    'name:exact'?: string;
    partof?: string;
    type?: string;
    _include?: 'Organization:endpoint' | 'Organization:endpoint'[];
    _revinclude?: string | string[];  // Location:organization, OrganizationAffiliation:*
}

/** §2:3.90.4.1.2.3 Location search params */
export interface LocationSearchParams extends CommonSearchParams {
    identifier?: string;
    name?: string;
    'name:contains'?: string;
    'name:exact'?: string;
    organization?: string;
    partof?: string;
    status?: string;
    type?: string;
    near?: string;  // Location Distance Option
    _include?: 'Location:organization' | 'Location:organization'[];
}

/** §2:3.90.4.1.2.4 Practitioner search params */
export interface PractitionerSearchParams extends CommonSearchParams {
    active?: boolean;
    identifier?: string;
    name?: string;
    'name:contains'?: string;
    'name:exact'?: string;
    given?: string;
    'given:contains'?: string;
    'given:exact'?: string;
    family?: string;
    'family:contains'?: string;
    'family:exact'?: string;
}

/** §2:3.90.4.1.2.5 PractitionerRole search params */
export interface PractitionerRoleSearchParams extends CommonSearchParams {
    active?: boolean;
    location?: string;
    organization?: string;
    practitioner?: string;
    role?: string;
    service?: string;
    specialty?: string;
    _include?: 'PractitionerRole:practitioner' | 'PractitionerRole:practitioner'[];
}

/** §2:3.90.4.1.2.6 HealthcareService search params */
export interface HealthcareServiceSearchParams extends CommonSearchParams {
    active?: boolean;
    identifier?: string;
    location?: string;
    name?: string;
    'name:contains'?: string;
    'name:exact'?: string;
    organization?: string;
    'service-type'?: string;
}

/** §2:3.90.4.1.2.8 Endpoint search params */
export interface EndpointSearchParams extends CommonSearchParams {
    identifier?: string;
    organization?: string;
    status?: string;
}

/** §2:3.90.4.1.2.9 OrganizationAffiliation search params */
export interface OrgAffiliationSearchParams extends CommonSearchParams {
    active?: boolean;
    date?: string;
    identifier?: string;
    'participating-organization'?: string;
    'primary-organization'?: string;
    role?: string;
    _include?: 'OrganizationAffiliation:endpoint' | 'OrganizationAffiliation:endpoint'[];
}

// ============================================================
// Registry Service
// ============================================================

class RegistryService {
    /**
     * Build the base URL for mCSD queries.
     * mCSD is exclusively on port 9443 (system auth).
     */
    private getMcsdBaseUrl(): string {
        return `${config.cezih.gatewaySystem}${config.cezih.services.mcsd}`;
    }

    /**
     * Get auth headers — mCSD uses system token (OAuth2 client credentials) on port 9443.
     */
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
        // Fallback: try gateway cookies
        if (authService.hasGatewaySession()) {
            return authService.getUserAuthHeaders('');
        }
        throw new Error('Nema dostupne autentifikacije za mCSD. Potreban je system token (OAuth2 client credentials) ili gateway sesija.');
    }

    /**
     * Generic FHIR resource search on mCSD (port 9443 only).
     */
    async searchResources(
        resourceType: string,
        params: Record<string, any> = {},
    ): Promise<{ total: number; resources: any[]; bundle: any }> {
        const headers = await this.getAuthHeaders();
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null) continue;
            if (Array.isArray(value)) {
                value.forEach(v => searchParams.append(key, String(v)));
            } else {
                searchParams.append(key, String(value));
            }
        }

        const queryString = searchParams.toString();
        const baseUrl = this.getMcsdBaseUrl();
        const url = queryString
            ? `${baseUrl}/${resourceType}?${queryString}`
            : `${baseUrl}/${resourceType}`;
        console.log(`[RegistryService] SEARCH ${resourceType}: ${url}`);

        const response = await axios.get(url, {
            headers,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 15000,
        });

        const resources = response.data.entry?.map((e: any) => e.resource) || [];
        const total = response.data.total ?? resources.length;
        console.log(`[RegistryService] Found ${resources.length} ${resourceType} (total: ${total})`);
        return { total, resources, bundle: response.data };
    }

    /**
     * Get a specific resource by ID.
     */
    async getResourceById(resourceType: string, id: string): Promise<any> {
        const headers = await this.getAuthHeaders();
        const baseUrl = this.getMcsdBaseUrl();
        const url = `${baseUrl}/${resourceType}/${id}`;
        console.log(`[RegistryService] GET ${resourceType}/${id}: ${url}`);

        const response = await axios.get(url, {
            headers,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 15000,
        });

        return response.data;
    }

    /**
     * Save (Create or Update) a resource.
     * mCSD uses POST for creating and potentially updating (depending on server implementation).
     */
    async saveResource(resourceType: string, resource: any): Promise<any> {
        const headers = await this.getAuthHeaders();
        const baseUrl = this.getMcsdBaseUrl();
        const url = `${baseUrl}/${resourceType}`;
        console.log(`[RegistryService] POST ${resourceType}: ${url}`);

        const response = await axios.post(url, resource, {
            headers: {
                ...headers,
                'Content-Type': 'application/fhir+json',
            },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 15000,
        });

        return response.data;
    }

    /**
     * Get history of a specific resource instance.
     */
    async getResourceHistory(resourceType: string, id: string): Promise<any> {
        const headers = await this.getAuthHeaders();
        const baseUrl = this.getMcsdBaseUrl();
        const url = `${baseUrl}/${resourceType}/${id}/_history`;
        console.log(`[RegistryService] HISTORY ${resourceType}/${id}: ${url}`);

        const response = await axios.get(url, {
            headers,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 15000,
        });

        return response.data;
    }

    /**
     * Get history of all resources of a certain type.
     */
    async getTypeHistory(resourceType: string): Promise<any> {
        const headers = await this.getAuthHeaders();
        const baseUrl = this.getMcsdBaseUrl();
        const url = `${baseUrl}/${resourceType}/_history`;
        console.log(`[RegistryService] HISTORY ${resourceType}: ${url}`);

        const response = await axios.get(url, {
            headers,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 15000,
        });

        return response.data;
    }

    /**
     * Wrap searchResource with common error handling.
     */
    private async executeSearch(
        resourceType: string,
        params: Record<string, any>,
    ): Promise<any[]> {
        try {
            const result = await this.searchResources(resourceType, params);
            return result.resources;
        } catch (error: any) {
            if (error.response) {
                console.error(`[RegistryService] ${resourceType}: HTTP ${error.response.status}`, JSON.stringify(error.response.data).substring(0, 300));
                throw new Error(
                    `CEZIH mCSD ${resourceType}: ${error.response.status} — ` +
                    `${JSON.stringify(error.response.data).substring(0, 200)}`
                );
            }
            console.error(`[RegistryService] Failed ${resourceType} search:`, error.message);
            throw error;
        }
    }

    // ============================================================
    // Public API — one method per mCSD resource type
    // ============================================================

    /** Search Organization (§2:3.90.4.1.2.2) */
    async searchOrganizations(params?: OrganizationSearchParams): Promise<any[]> {
        return this.executeSearch('Organization', params || {});
    }

    /** Search Location (§2:3.90.4.1.2.3) */
    async searchLocations(params?: LocationSearchParams): Promise<any[]> {
        return this.executeSearch('Location', params || {});
    }

    /** Search Practitioner (§2:3.90.4.1.2.4) */
    async searchPractitioners(params?: PractitionerSearchParams): Promise<any[]> {
        return this.executeSearch('Practitioner', params || {});
    }

    /** Search PractitionerRole (§2:3.90.4.1.2.5) */
    async searchPractitionerRoles(params?: PractitionerRoleSearchParams): Promise<any[]> {
        return this.executeSearch('PractitionerRole', params || {});
    }

    /** Search HealthcareService (§2:3.90.4.1.2.6) */
    async searchHealthcareServices(params?: HealthcareServiceSearchParams): Promise<any[]> {
        return this.executeSearch('HealthcareService', params || {});
    }

    /** Search Endpoint (§2:3.90.4.1.2.8) */
    async searchEndpoints(params?: EndpointSearchParams): Promise<any[]> {
        return this.executeSearch('Endpoint', params || {});
    }

    /** Search OrganizationAffiliation (§2:3.90.4.1.2.9) */
    async searchOrgAffiliations(params?: OrgAffiliationSearchParams): Promise<any[]> {
        return this.executeSearch('OrganizationAffiliation', params || {});
    }
}

export const registryService = new RegistryService();
