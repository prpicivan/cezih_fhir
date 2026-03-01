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

            console.log(`[OidService] Generated ${response.data.oid.length} OIDs`);
            return response.data.oid;
        } catch (error: any) {
            // ⚠️  OFFLINE FALLBACK: OID-ovi generirani lokalno NISU registrirani u CEZIH OID registru!
            //    Dokument s ovakvim OID-om neće biti prepoznat od strane CEZIH-a.
            //    Provjeri VPN konekciju i dostupnost CEZIH servisa.
            console.error(`[OidService] ❌ CEZIH OID registry nedostupan — generiram LOKALNE OID-ove (NISU VALIDNI ZA CEZIH): ${error.message}`);

            const localOids = [];
            for (let i = 0; i < quantity; i++) {
                const randomPart = Math.floor(Math.random() * 100000000000000).toString();
                localOids.push(`2.16.840.1.113883.3.33.1.2.1.1.1.${randomPart}`);
            }
            return localOids;
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
