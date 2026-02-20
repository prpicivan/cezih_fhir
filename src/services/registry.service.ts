/**
 * Healthcare Subject Registry Service (Test Case 9)
 * Retrieves organizations, practitioners, and healthcare services via IHE mCSD ITI-90.
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
    }): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();
            const searchParams = new URLSearchParams();

            if (params?.active !== undefined) searchParams.append('active', String(params.active));
            if (params?.name) searchParams.append('name', params.name);
            if (params?.identifier) searchParams.append('identifier', params.identifier);

            const url = `${config.cezih.fhirUrl}/Organization?${searchParams.toString()}`;
            const response = await axios.get(url, { headers });

            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
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
    }): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();
            const searchParams = new URLSearchParams();

            if (params?.active !== undefined) searchParams.append('active', String(params.active));
            if (params?.name) searchParams.append('name', params.name);
            if (params?.identifier) searchParams.append('identifier', params.identifier);

            const url = `${config.cezih.fhirUrl}/Practitioner?${searchParams.toString()}`;
            const response = await axios.get(url, { headers });

            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
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
    }): Promise<any[]> {
        try {
            const headers = await authService.getSystemAuthHeaders();
            const searchParams = new URLSearchParams();

            if (params?.active !== undefined) searchParams.append('active', String(params.active));
            if (params?.organization) searchParams.append('organization', params.organization);

            const url = `${config.cezih.fhirUrl}/HealthcareService?${searchParams.toString()}`;
            const response = await axios.get(url, { headers });

            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
            console.error('[RegistryService] Failed to search healthcare services:', error.message);
            throw error;
        }
    }
}

export const registryService = new RegistryService();
