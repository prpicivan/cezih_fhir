/**
 * OID Registry Service (Test Case 6)
 * Retrieves unique document identifiers from CEZIH Identifier Registry.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import { OID_TYPES, OidRegistryRequest, OidRegistryResponse, CezihErrorResponse } from '../types';

class OidService {
    /**
     * Test Case 6: Generate and register OID identifiers for documents.
     *
     * @param quantity Number of OIDs to generate (max 100)
     * @returns Array of generated OID strings
     */
    async generateOids(quantity: number = 1): Promise<string[]> {
        if (quantity < 1 || quantity > 100) {
            throw new Error('OID quantity must be between 1 and 100');
        }

        try {
            const headers = await authService.getSystemAuthHeaders();

            const requestBody: OidRegistryRequest = {
                oidType: {
                    system: OID_TYPES.SYSTEM,
                    code: OID_TYPES.DOCUMENT,
                },
                quantity,
            };

            const response = await axios.post<OidRegistryResponse>(
                config.cezih.oidRegistryUrl,
                requestBody,
                {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log(`[OidService] Generated ${response.data.OID.length} OIDs`);
            return response.data.OID;
        } catch (error: any) {
            if (error.response?.status === 500) {
                const errorData = error.response.data as CezihErrorResponse;
                console.error('[OidService] CEZIH error:', errorData.error?.errorDescription);
                throw new Error(`CEZIH OID Registry error: ${errorData.error?.errorDescription || 'Unknown error'}`);
            }
            console.error('[OidService] Failed to generate OIDs:', error.message);
            throw error;
        }
    }

    /**
     * Generate a single OID for a document.
     */
    async generateSingleOid(): Promise<string> {
        const oids = await this.generateOids(1);
        return oids[0];
    }
}

export const oidService = new OidService();
