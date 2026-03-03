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
 * NOTE: mCSD endpoint path is configurable via CEZIH_MCSD_SERVICE_PATH env var.
 * Default: /R4/fhir. Endpoint not yet deployed in CEZIH test environment (as of 2026-03-02).
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
     * Tries system auth (port 9443) first, falls back to gateway auth (port 8443).
     */
    private getMcsdBaseUrl(useSystemAuth: boolean): string {
        const base = useSystemAuth ? config.cezih.gatewaySystem : config.cezih.gatewayBase;
        return `${base}${config.cezih.services.mcsd}`;
    }

    /**
     * Get auth headers — system token for M2M or gateway cookie for user context.
     */
    private async getAuthHeaders(userToken?: string): Promise<Record<string, string>> {
        if (userToken) {
            return authService.getUserAuthHeaders(userToken);
        }
        // Prefer gateway auth (cookie-based) — mCSD endpoints require it
        if (authService.hasGatewaySession()) {
            return authService.getUserAuthHeaders('');
        }
        // Fallback: system token
        try {
            const systemToken = await authService.getSystemToken();
            if (systemToken) {
                return {
                    'Authorization': `Bearer ${systemToken}`,
                    'Accept': 'application/fhir+json',
                };
            }
        } catch (e) {
            console.log('[RegistryService] System token not available');
        }
        return authService.getUserAuthHeaders('');
    }

    /**
     * Generic FHIR resource search with dual-port fallback.
     * Handles both system auth (9443) and gateway auth (8443).
     */
    private async searchResource(
        resourceType: string,
        params: Record<string, any>,
        userToken?: string,
    ): Promise<{ total: number; resources: any[]; bundle: any }> {
        const headers = await this.getAuthHeaders(userToken);
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

        // When we have gateway cookies, try gateway (8443) first, then system (9443)
        // Gateway cookies only work on port 8443
        const hasGateway = authService.hasGatewaySession();
        const authOrder = hasGateway ? [false, true] : [true, false];
        for (const useSystem of authOrder) {
            const baseUrl = this.getMcsdBaseUrl(useSystem);
            const url = queryString
                ? `${baseUrl}/${resourceType}?${queryString}`
                : `${baseUrl}/${resourceType}`;
            console.log(`[RegistryService] ${resourceType} (${useSystem ? 'sys' : 'gw'}): ${url}`);

            try {
                const response = await axios.get(url, {
                    headers,
                    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
                    timeout: 10000,
                });

                const resources = response.data.entry?.map((e: any) => e.resource) || [];
                const total = response.data.total ?? resources.length;
                console.log(`[RegistryService] Found ${resources.length} ${resourceType} (total: ${total})`);
                return { total, resources, bundle: response.data };
            } catch (innerError: any) {
                if (innerError.response?.status !== 404) {
                    throw innerError;
                }
                console.log(`[RegistryService] ${useSystem ? 'System' : 'Gateway'} path not found, trying next...`);
            }
        }

        throw new Error(
            `Pretraga ${resourceType} nije dostupna u testnom okruženju CEZIH-a. ` +
            `mCSD endpoint nije pronađen. Kontaktirajte administratora za ispravnu putanju.`
        );
    }

    /**
     * Wrap searchResource with common error handling.
     */
    private async executeSearch(
        resourceType: string,
        params: Record<string, any>,
        userToken?: string,
    ): Promise<any[]> {
        try {
            const result = await this.searchResource(resourceType, params, userToken);
            return result.resources;
        } catch (error: any) {
            if (error.response?.status === 400 &&
                typeof error.response?.data === 'string' &&
                error.response.data.includes('Cookie not found')) {
                throw new Error(
                    'Potrebna je prijava u CEZIH sustav (gateway sesija nije aktivna). ' +
                    'Prijavite se putem Certilia ili pametne kartice.'
                );
            }
            if (error.response) {
                throw new Error(
                    `CEZIH server: ${error.response.status}: ` +
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
    async searchOrganizations(params?: OrganizationSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('Organization', params || {}, userToken);
    }

    /** Search Location (§2:3.90.4.1.2.3) */
    async searchLocations(params?: LocationSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('Location', params || {}, userToken);
    }

    /** Search Practitioner (§2:3.90.4.1.2.4) */
    async searchPractitioners(params?: PractitionerSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('Practitioner', params || {}, userToken);
    }

    /** Search PractitionerRole (§2:3.90.4.1.2.5) */
    async searchPractitionerRoles(params?: PractitionerRoleSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('PractitionerRole', params || {}, userToken);
    }

    /** Search HealthcareService (§2:3.90.4.1.2.6) */
    async searchHealthcareServices(params?: HealthcareServiceSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('HealthcareService', params || {}, userToken);
    }

    /** Search Endpoint (§2:3.90.4.1.2.8) */
    async searchEndpoints(params?: EndpointSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('Endpoint', params || {}, userToken);
    }

    /** Search OrganizationAffiliation (§2:3.90.4.1.2.9) */
    async searchOrgAffiliations(params?: OrgAffiliationSearchParams, userToken?: string): Promise<any[]> {
        return this.executeSearch('OrganizationAffiliation', params || {}, userToken);
    }
}

export const registryService = new RegistryService();
