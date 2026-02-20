/**
 * Case Management Service (Test Cases 15-17)
 * Retrieve, create, and update health cases using FHIR Messaging and IHE QEDm.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import { signatureService } from './signature.service';
import { CEZIH_IDENTIFIERS } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface CaseData {
    patientMbo: string;
    practitionerId: string;
    organizationId: string;
    localCaseId?: string;
    diagnosisCode: string;
    diagnosisDisplay: string;
    status: 'planned' | 'active' | 'onhold' | 'finished' | 'cancelled';
    startDate: string;
    endDate?: string;
}

class CaseService {
    // ============================================================
    // Test Case 15: Retrieve Existing Cases (IHE QEDm)
    // ============================================================

    /**
     * Retrieve existing health cases for a patient.
     * Uses national extension of IHE QEDm integration profile.
     */
    async getPatientCases(patientMbo: string, userToken: string): Promise<any[]> {
        try {
            const headers = authService.getUserAuthHeaders(userToken);
            const url = `${config.cezih.fhirUrl}/EpisodeOfCare?patient.identifier=${CEZIH_IDENTIFIERS.MBO}|${patientMbo}`;

            const response = await axios.get(url, { headers });
            return response.data.entry?.map((e: any) => e.resource) || [];
        } catch (error: any) {
            console.error('[CaseService] Failed to retrieve cases:', error.message);
            throw error;
        }
    }

    // ============================================================
    // Test Case 16: Create Case (FHIR Messaging)
    // ============================================================

    async createCase(data: CaseData, userToken: string): Promise<any> {
        const messageId = uuidv4();
        const localCaseId = data.localCaseId || uuidv4();

        const bundle = {
            resourceType: 'Bundle',
            type: 'message',
            entry: [
                {
                    fullUrl: `urn:uuid:${messageId}`,
                    resource: {
                        resourceType: 'MessageHeader',
                        id: messageId,
                        eventCoding: {
                            system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/message-events',
                            code: 'episode-of-care-create',
                        },
                        source: {
                            endpoint: config.cezih.baseUrl,
                        },
                        focus: [{ reference: 'urn:uuid:case-1' }],
                    },
                },
                {
                    fullUrl: 'urn:uuid:case-1',
                    resource: {
                        resourceType: 'EpisodeOfCare',
                        status: data.status,
                        identifier: [
                            {
                                system: CEZIH_IDENTIFIERS.LOCAL_CASE_ID,
                                value: localCaseId,
                            },
                        ],
                        patient: {
                            identifier: {
                                system: CEZIH_IDENTIFIERS.MBO,
                                value: data.patientMbo,
                            },
                        },
                        diagnosis: [
                            {
                                condition: {
                                    display: data.diagnosisDisplay,
                                },
                                role: {
                                    coding: [{
                                        code: data.diagnosisCode,
                                        display: data.diagnosisDisplay,
                                    }],
                                },
                            },
                        ],
                        period: {
                            start: data.startDate,
                            end: data.endDate,
                        },
                        managingOrganization: {
                            reference: `Organization/${data.organizationId}`,
                        },
                        careManager: {
                            reference: `Practitioner/${data.practitionerId}`,
                        },
                    },
                },
            ],
        };

        return this.sendMessage(bundle, userToken);
    }

    // ============================================================
    // Test Case 17: Update Case (FHIR Messaging)
    // ============================================================

    async updateCase(caseId: string, data: Partial<CaseData>, userToken: string): Promise<any> {
        const messageId = uuidv4();

        const bundle = {
            resourceType: 'Bundle',
            type: 'message',
            entry: [
                {
                    fullUrl: `urn:uuid:${messageId}`,
                    resource: {
                        resourceType: 'MessageHeader',
                        id: messageId,
                        eventCoding: {
                            system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/message-events',
                            code: 'episode-of-care-update',
                        },
                        source: {
                            endpoint: config.cezih.baseUrl,
                        },
                        focus: [{ reference: 'urn:uuid:case-1' }],
                    },
                },
                {
                    fullUrl: 'urn:uuid:case-1',
                    resource: {
                        resourceType: 'EpisodeOfCare',
                        identifier: [
                            {
                                system: CEZIH_IDENTIFIERS.CASE_ID,
                                value: caseId,
                            },
                        ],
                        status: data.status,
                        ...(data.endDate && {
                            period: { end: data.endDate },
                        }),
                        ...(data.diagnosisCode && {
                            diagnosis: [{
                                condition: { display: data.diagnosisDisplay },
                                role: {
                                    coding: [{
                                        code: data.diagnosisCode,
                                        display: data.diagnosisDisplay,
                                    }],
                                },
                            }],
                        }),
                    },
                },
            ],
        };

        return this.sendMessage(bundle, userToken);
    }

    private async sendMessage(bundle: any, userToken: string): Promise<any> {
        try {
            // Sign the bundle before sending (CEZIH requires JWS digital signature)
            let bundleToSend = bundle;
            try {
                if (signatureService.isAvailable()) {
                    const { bundle: signedBundle } = signatureService.signBundle(bundle);
                    bundleToSend = signedBundle;
                    console.log('[CaseService] Bundle signed successfully');
                } else {
                    console.warn('[CaseService] Signing unavailable — sending unsigned bundle');
                }
            } catch (signError: any) {
                console.error('[CaseService] Signing failed:', signError.message);
                console.warn('[CaseService] Proceeding with unsigned bundle');
            }

            const headers = authService.getUserAuthHeaders(userToken);
            const url = `${config.cezih.fhirUrl}/$process-message`;
            const response = await axios.post(url, bundleToSend, { headers });

            console.log('[CaseService] Message sent successfully');
            return response.data;
        } catch (error: any) {
            console.error('[CaseService] Failed to send message:', error.response?.data || error.message);
            throw error;
        }
    }
}

export const caseService = new CaseService();
