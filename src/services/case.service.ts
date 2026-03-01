/**
 * Case Management Service (Test Cases 15-17)
 * Retrieve, create, and update health cases using FHIR Messaging and IHE QEDm.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import { signatureService } from './signature.service';
import {
    CEZIH_IDENTIFIERS,
    CEZIH_EXTENSIONS,
    ENCOUNTER_CODES
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { auditService } from './audit.service';

export interface CaseData {
    patientMbo: string;
    practitionerId: string;
    organizationId: string;
    localCaseId?: string;
    title: string;  // Added title for the UI
    diagnosisCode?: string;
    diagnosisDisplay?: string;
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
     * Searches the local SQLite table for quick rendering.
     * Falls back to remote CEZIH search if local is empty or for refresh.
     */
    async getPatientCases(patientMbo: string, userToken: string, forceRefresh: boolean = false): Promise<any[]> {
        console.log(`[CaseService] getPatientCases for MBO: ${patientMbo}`);

        // 1. Check local DB
        const rows = db.prepare('SELECT * FROM cases WHERE patientMbo = ? ORDER BY start DESC').all(patientMbo);
        if (rows.length > 0 && !forceRefresh) {
            console.log(`[CaseService] Returning ${rows.length} cases from local DB`);
            return rows;
        }

        // 2. Fallback: Search remote CEZIH (IHE QEDm / FHIR search)
        try {
            console.log(`[CaseService] No local cases found, searching remote CEZIH...`);
            const remoteCases = await this.searchRemoteCases(patientMbo, userToken);
            if (remoteCases.length > 0) {
                console.log(`[CaseService] Found ${remoteCases.length} remote cases, syncing...`);
                // Sync to local DB
                for (const caseData of remoteCases) {
                    this.saveOrUpdateCase(caseData);
                }
                return remoteCases;
            }
        } catch (err: any) {
            console.warn(`[CaseService] Remote search failed: ${err.message}`);
        }

        // No cases found locally or remotely — return empty array
        console.log(`[CaseService] No cases found for MBO: ${patientMbo} (local or remote)`);
        return [];
    }

    private async searchRemoteCases(patientMbo: string, userToken: string): Promise<any[]> {
        const headers = authService.getUserAuthHeaders(userToken);
        const url = `${config.cezih.gatewayBase}${config.cezih.services.healthIssue}/EpisodeOfCare`;
        const params = {
            'patient.identifier': `${CEZIH_IDENTIFIERS.MBO}|${patientMbo}`,
            _sort: '-date',
            _count: 50
        };

        try {
            const response = await axios.get(url, { headers, params });
            const entries = response.data.entry || [];
            return entries.map((e: any) => this.mapRemoteCase(e.resource));
        } catch (err: any) {
            throw new Error(`CEZIH EpisodeOfCare search failed: ${err.message}`);
        }
    }

    private mapRemoteCase(resource: any): any {
        const patientMbo = resource.patient?.identifier?.value || '';
        const diagnosis = resource.diagnosis?.[0];
        const period = resource.period || {};

        return {
            id: resource.id, // Using CEZIH ID as the primary ID
            patientMbo,
            title: diagnosis?.condition?.display || 'Health Case',
            status: resource.status,
            start: period.start,
            end: period.end || null,
            diagnosisCode: diagnosis?.role?.coding?.[0]?.code || '',
            diagnosisDisplay: diagnosis?.role?.coding?.[0]?.display || diagnosis?.condition?.display || '',
            practitionerName: resource.careManager?.display || 'Unknown Practitioner',
        };
    }

    private saveOrUpdateCase(data: any) {
        try {
            db.prepare(`
                INSERT INTO cases (id, patientMbo, title, status, start, end, diagnosisCode, diagnosisDisplay, practitionerName)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    end = excluded.end,
                    title = excluded.title,
                    diagnosisCode = excluded.diagnosisCode,
                    diagnosisDisplay = excluded.diagnosisDisplay
            `).run(
                data.id,
                data.patientMbo,
                data.title,
                data.status,
                data.start,
                data.end,
                data.diagnosisCode,
                data.diagnosisDisplay,
                data.practitionerName
            );
        } catch (err: any) {
            console.error('[CaseService] DB Sync failed:', err.message);
        }
    }

    // ============================================================
    // Test Case 16: Create Case (FHIR Messaging)
    // ============================================================

    async createCase(data: CaseData, userToken: string): Promise<any> {
        const messageId = uuidv4();
        const localCaseId = data.localCaseId || uuidv4();

        // Save to DB (including diagnosis and practitioner for UI display)
        try {
            db.prepare(`
                INSERT INTO cases (id, patientMbo, title, status, start, end, diagnosisCode, diagnosisDisplay, practitionerName)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                localCaseId,
                data.patientMbo,
                data.title || data.diagnosisDisplay || 'Nova Epizoda',
                data.status || 'active',
                data.startDate || new Date().toISOString(),
                data.endDate || null,
                data.diagnosisCode || null,
                data.diagnosisDisplay || null,
                data.practitionerId || null
            );
        } catch (err: any) {
            console.error('Case DB Insert error:', err.message);
        }

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
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
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
                        ...(data.diagnosisCode ? {
                            diagnosis: [{
                                condition: {
                                    display: data.diagnosisDisplay,
                                },
                                role: {
                                    coding: [{
                                        system: ENCOUNTER_CODES.ICD10_HR,
                                        code: data.diagnosisCode,
                                        display: data.diagnosisDisplay,
                                    }],
                                },
                            }]
                        } : {}),
                        period: {
                            start: data.startDate,
                            end: data.endDate,
                        },
                        managingOrganization: {
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId,
                            },
                        },
                        careManager: {
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                                value: data.practitionerId,
                            },
                        },
                    },
                },
            ],
        };

        return this.sendMessage(bundle, userToken, 'CASE_CREATE', localCaseId, data.patientMbo);
    }

    // ============================================================
    // Test Case 17: Update Case (FHIR Messaging)
    // ============================================================

    async updateCase(caseId: string, data: Partial<CaseData>, userToken: string): Promise<any> {
        const messageId = uuidv4();

        // Update DB
        try {
            if (data.status) {
                db.prepare('UPDATE cases SET status = ? WHERE id = ?').run(data.status, caseId);
            }
            if (data.endDate) {
                db.prepare('UPDATE cases SET end = ? WHERE id = ?').run(data.endDate, caseId);
            }
        } catch (err: any) {
            console.error('Case DB Update error:', err.message);
        }

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
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
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
                                        system: ENCOUNTER_CODES.ICD10_HR,
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

        return this.sendMessage(bundle, userToken, 'CASE_UPDATE', caseId, data.patientMbo);
    }


    private async sendMessage(bundle: any, userToken: string, action: string, caseId?: string, patientMbo?: string): Promise<any> {
        console.log('[CaseService] sendMessage entered');
        let bundleToSend = bundle;
        let finalResponse: any = null;
        let errorMessage: string | undefined;

        try {
            // Sign the bundle before sending (CEZIH requires JWS digital signature)
            try {
                if (signatureService.isAvailable()) {
                    console.log('[CaseService] Attempting to sign bundle');
                    const { bundle: signedBundle } = await signatureService.signBundle(bundle, undefined, userToken);
                    bundleToSend = signedBundle;
                    console.log('[CaseService] Bundle signed successfully');
                } else {
                    console.warn('[CaseService] Signing unavailable — sending unsigned bundle');
                }
            } catch (signError: any) {
                console.error('[CaseService] Signing failed:', signError.message);
                errorMessage = `Signing failed: ${signError.message}`;
            }

            console.log('[CaseService] Preparing to send to CEZIH...');
            const headers = authService.getUserAuthHeaders(userToken);
            const url = `${config.cezih.gatewayBase}${config.cezih.services.healthIssue}/$process-message`;
            console.log('[CaseService] Sending to:', url);
            const response = await axios.post(url, bundleToSend, { headers });

            console.log('[CaseService] Message sent successfully');
            finalResponse = response.data;
        } catch (error: any) {
            const cezihStatus = error.response?.status;
            const cezihBody = error.response?.data;
            console.warn(`[CaseService] CEZIH send failed: HTTP ${cezihStatus || '?'}: ${error.message}`);
            console.warn(`[CaseService] CEZIH Error Body:`, JSON.stringify(cezihBody)?.slice(0, 2000) || '""');
            errorMessage = error.message;

            const cezihError = (() => {
                if (!cezihBody) return error.message;
                if (typeof cezihBody === 'string') return cezihBody.slice(0, 2000);

                // Try to find OperationOutcome in a Bundle response
                if (cezihBody.resourceType === 'Bundle') {
                    const outcome = cezihBody.entry?.find((e: any) => e.resource?.resourceType === 'OperationOutcome')?.resource;
                    if (outcome) {
                        return outcome.issue?.[0]?.details?.coding?.[0]?.display
                            || outcome.issue?.[0]?.diagnostics
                            || JSON.stringify(outcome).slice(0, 2000);
                    }
                }

                return cezihBody?.issue?.[0]?.diagnostics
                    || cezihBody?.error?.errorDescription
                    || JSON.stringify(cezihBody).slice(0, 2000);
            })();

            finalResponse = {
                localOnly: true,
                cezihStatus: 'failed',
                cezihError: `HTTP ${cezihStatus}: ${cezihError}`,
                id: undefined,
            };
        } finally {
            auditService.log({
                visitId: undefined,
                patientMbo,
                action,
                direction: 'OUTGOING_CEZIH',
                status: errorMessage ? 'ERROR' : 'SUCCESS',
                payload_req: bundleToSend,
                payload_res: finalResponse,
                error_msg: errorMessage
            });
        }

        return {
            success: true,
            result: finalResponse ?? { cezihStatus: 'sent' },
        };
    }
}

export const caseService = new CaseService();
