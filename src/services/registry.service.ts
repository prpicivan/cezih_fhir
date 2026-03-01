/**
 * Healthcare Subject Registry Service (Test Case 9)
 * Retrieves organizations, practitioners, and healthcare services via IHE mCSD ITI-90.
 *
 * NOTE: The CEZIH test environment does not expose Organization/Practitioner search
 * at any known gateway path. All 12 attempted service paths return HTTP 404.
 * The feature is gracefully degraded with a clear Croatian-language error message.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';

class RegistryService {
    // ============================================================
    // Test Case 9: Healthcare Subject Registry (IHE mCSD ITI-90)
    // ============================================================

    /**
     * Search for healthcare organizations.
     */
    async searchOrganizations(params?: {
        active?: boolean;
        name?: string;
        identifier?: string;
    }, userToken?: string): Promise<any[]> {
        try {
            const headers = authService.getUserAuthHeaders(userToken || '');
            const searchParams = new URLSearchParams();

            if (params?.active !== undefined) searchParams.append('active', String(params.active));
            if (params?.name) searchParams.append('name', params.name);
            if (params?.identifier) searchParams.append('identifier', params.identifier);

            const url = `${config.cezih.gatewayBase}${config.cezih.services.registry}/Organization?${searchParams.toString()}`;
            console.log(`[RegistryService] Organizations URL: ${url}`);
            const response = await axios.get(url, { headers });

            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
            if (error.response?.status === 404) {
                throw new Error('Pretraga organizacija nije dostupna u testnom okruženju CEZIH-a. Kontaktirajte administratora za ispravnu putanju endpointa.');
            }
            if (error.response?.status === 400 && typeof error.response?.data === 'string' && error.response.data.includes('Cookie not found')) {
                throw new Error('Potrebna je prijava u CEZIH sustav (gateway sesija nije aktivna). Prijavite se putem Certilia ili pametne kartice.');
            }
            if (error.response) {
                throw new Error(`CEZIH server reported ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            console.error('[RegistryService] Failed to search organizations:', error.message);
            throw error;
        }
    }

    /**
     * Search for healthcare practitioners.
     */
    async searchPractitioners(params?: {
        active?: boolean;
        name?: string;
        identifier?: string;
    }, userToken?: string): Promise<any[]> {
        try {
            const headers = authService.getUserAuthHeaders(userToken || '');
            const searchParams = new URLSearchParams();

            if (params?.active !== undefined) searchParams.append('active', String(params.active));
            if (params?.name) searchParams.append('name', params.name);
            if (params?.identifier) searchParams.append('identifier', params.identifier);

            const url = `${config.cezih.gatewayBase}${config.cezih.services.registry}/Practitioner?${searchParams.toString()}`;
            console.log(`[RegistryService] Practitioners URL: ${url}`);
            const response = await axios.get(url, { headers });

            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
            if (error.response?.status === 404) {
                throw new Error('Pretraga djelatnika nije dostupna u testnom okruženju CEZIH-a. Kontaktirajte administratora za ispravnu putanju endpointa.');
            }
            if (error.response?.status === 400 && typeof error.response?.data === 'string' && error.response.data.includes('Cookie not found')) {
                throw new Error('Potrebna je prijava u CEZIH sustav (gateway sesija nije aktivna). Prijavite se putem Certilia ili pametne kartice.');
            }
            if (error.response) {
                throw new Error(`CEZIH server reported ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            console.error('[RegistryService] Failed to search practitioners:', error.message);
            throw error;
        }
    }

    /**
     * Search for healthcare services.
     */
    async searchHealthcareServices(params?: {
        active?: boolean;
        organization?: string;
    }, userToken?: string): Promise<any[]> {
        try {
            const headers = authService.getUserAuthHeaders(userToken || '');
            const searchParams = new URLSearchParams();

            if (params?.active !== undefined) searchParams.append('active', String(params.active));
            if (params?.organization) searchParams.append('organization', params.organization);

            const url = `${config.cezih.gatewayBase}${config.cezih.services.registry}/HealthcareService?${searchParams.toString()}`;
            console.log('[RegistryService] Searching healthcare services at:', url);
            const response = await axios.get(url, { headers });

            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
            if (error.response?.status === 404) {
                throw new Error('Pretraga zdravstvenih usluga nije dostupna u testnom okruženju CEZIH-a. Kontaktirajte administratora za ispravnu putanju endpointa.');
            }
            if (error.response?.status === 400 && typeof error.response?.data === 'string' && error.response.data.includes('Cookie not found')) {
                throw new Error('Potrebna je prijava u CEZIH sustav (gateway sesija nije aktivna). Prijavite se putem Certilia ili pametne kartice.');
            }
            if (error.response) {
                throw new Error(`CEZIH server reported ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            console.error('[RegistryService] Failed to search healthcare services:', error.message);
            throw error;
        }
    }
}

export const registryService = new RegistryService();
