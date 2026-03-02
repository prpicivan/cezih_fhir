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

        const conditionUuid = uuidv4();
        const conditionEntryId = `urn:uuid:${conditionUuid}`;
        const headerEntryId = `urn:uuid:${messageId}`;

        // TC16: Šaljemo Condition resurs (CEZIH 'Slučaj' = FHIR Condition)
        // Profil bundle:  hr-create-health-issue-message
        // Event code:     ehe-message-types / 2.1  (fixedCoding iz StructureDefinition)
        // ZABRANJENO: clinicalStatus (max:0), recorder (max:0), recordedDate (max:0), abatement (max:0)
        const bundle = {
            resourceType: 'Bundle',
            id: messageId,
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-create-health-issue-message'],
            },
            type: 'message',
            timestamp: new Date().toISOString(),
            entry: [
                {
                    fullUrl: headerEntryId,
                    resource: {
                        resourceType: 'MessageHeader',
                        id: messageId,
                        meta: {
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-hi-management-message-header'],
                        },
                        // event[x] — fixedCoding iz hr-create-health-issue-message
                        eventCoding: {
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '2.1',
                        },
                        // DIGSIG-1: autor poruke mora biti jednak Bundle.signature.who
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            }
                        },
                        source: {
                            endpoint: config.cezih.baseUrl,
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
                        },
                        focus: [{ reference: conditionEntryId }],
                    },
                },
                {
                    fullUrl: conditionEntryId,
                    resource: {
                        resourceType: 'Condition',
                        id: localCaseId,
                        meta: {
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-condition'],
                        },
                        identifier: [
                            {
                                // sliceName: lokalni-identifikator (globalni-identifikator je max:0)
                                system: CEZIH_IDENTIFIERS.LOCAL_CASE_ID,
                                value: localCaseId,
                            },
                        ],
                        // clinicalStatus je max:0 u TC16 profilu — NE ŠALJEMO!
                        verificationStatus: {
                            // VS: health-issue-management-verification-status-create
                            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
                        },
                        ...(data.diagnosisCode ? {
                            code: {
                                coding: [{
                                    system: ENCOUNTER_CODES.ICD10_HR,
                                    code: data.diagnosisCode,
                                    display: data.diagnosisDisplay,
                                }],
                                text: data.diagnosisDisplay,
                            },
                        } : {}),
                        subject: {
                            type: 'Patient',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.MBO,
                                value: data.patientMbo,
                            },
                        },
                        onsetDateTime: data.startDate || new Date().toISOString(),
                        // recorder je max:0 u TC16 profilu — NE ŠALJEMO!
                        // recordedDate je max:0 u TC16 profilu — NE ŠALJEMO!
                        asserter: {
                            type: 'Practitioner',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                                value: data.practitionerId || config.practitioner.hzjzId,
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
        const conditionUuid = uuidv4();

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
            id: messageId,
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-update-health-issue-message'],
                // NOTE: CEZIH selects profile by event code, not by meta.profile
            },
            type: 'message',
            timestamp: new Date().toISOString(),
            entry: [
                {
                    fullUrl: `urn:uuid:${messageId}`,
                    resource: {
                        resourceType: 'MessageHeader',
                        id: messageId,
                        meta: {
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-hi-management-message-header'],
                        },
                        eventCoding: {
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '2.6', // 2.1=create 2.2=recurrence 2.3=remission 2.4=resolve 2.5=relapse 2.6=?
                        },
                        // DIGSIG-1: autor poruke = Bundle.signature.who
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            }
                        },
                        source: {
                            endpoint: config.cezih.baseUrl,
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
                        },
                        focus: [{ reference: `urn:uuid:${conditionUuid}` }],
                    },
                },
                {
                    fullUrl: `urn:uuid:${conditionUuid}`,
                    resource: {
                        resourceType: 'Condition',
                        id: conditionUuid,
                        meta: {
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-condition'],
                        },
                        identifier: [
                            {
                                // globalni-identifikator: CEZIH-generated case ID
                                system: CEZIH_IDENTIFIERS.CASE_ID,
                                value: caseId,
                            },
                        ],
                        ...(data.status === 'resolved' || data.status === 'inactive' ? {
                            clinicalStatus: {
                                coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: data.status }],
                            },
                        } : {
                            clinicalStatus: {
                                coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
                            },
                        }),
                        verificationStatus: {
                            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
                        },
                        ...(data.diagnosisCode ? {
                            code: {
                                coding: [{
                                    system: ENCOUNTER_CODES.ICD10_HR,
                                    code: data.diagnosisCode,
                                    display: data.diagnosisDisplay,
                                }],
                                text: data.diagnosisDisplay,
                            },
                        } : {}),
                        subject: {
                            type: 'Patient',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.MBO,
                                value: data.patientMbo || '999999423',
                            },
                        },
                        onsetDateTime: data.startDate || new Date().toISOString(),
                        ...(data.endDate ? { abatementDateTime: data.endDate } : {}),
                        asserter: {
                            type: 'Practitioner',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                                value: data.practitionerId || config.practitioner.hzjzId,
                            },
                        },
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
            console.log('[CaseService] Auth headers keys:', Object.keys(headers));
            console.log('[CaseService] Using gateway?', !!headers['Cookie'], '| Cookie preview:', (headers['Cookie'] || '').substring(0, 60));
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
            await auditService.log({
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
    // TEMP: testira event kodove prema health-issue-services
    async testEventCodes(userToken: string): Promise<any[]> {
        const headers = authService.getUserAuthHeaders(userToken);
        const url = `${config.cezih.gatewayBase}${config.cezih.services.healthIssue}/$process-message`;

        const CODES = [
            // Correct per StructureDefinition hr-create-health-issue-message (fixedCoding):
            { system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types', code: '2.1' },
            // Alternatives tested previously:
            { system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/message-events', code: 'condition-create' },
            { system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/message-events', code: 'health-issue-create' },
            { system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types', code: 'condition-create' },
            { system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types', code: 'health-issue-create' },
            { system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types', code: 'HI_CREATE' },
        ];

        const results: any[] = [];
        for (const c of CODES) {
            const msgId = uuidv4(); const condId = uuidv4();
            const bundle = {
                resourceType: 'Bundle', id: msgId, type: 'message', timestamp: new Date().toISOString(),
                entry: [
                    {
                        fullUrl: `urn:uuid:${msgId}`, resource: {
                            resourceType: 'MessageHeader', id: msgId,
                            eventCoding: { system: c.system, code: c.code },
                            source: { endpoint: config.cezih.baseUrl, name: 'test', software: 'test', version: '1.0' },
                            focus: [{ reference: `urn:uuid:${condId}` }],
                        }
                    },
                    {
                        fullUrl: `urn:uuid:${condId}`, resource: {
                            resourceType: 'Condition', id: condId,
                            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-condition'] },
                            identifier: [{ system: CEZIH_IDENTIFIERS.LOCAL_CASE_ID, value: uuidv4() }],
                            // clinicalStatus: max:0 — NE ŠALJI!
                            verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
                            code: { coding: [{ system: ENCOUNTER_CODES.ICD10_HR, code: 'M17.1', display: 'Primarna gonartroza' }] },
                            subject: { type: 'Patient', identifier: { system: CEZIH_IDENTIFIERS.MBO, value: '999999423' } },
                            onsetDateTime: '2026-03-01',
                            // recorder: max:0 — NE ŠALJI! recordedDate: max:0 — NE ŠALJI!
                            asserter: { type: 'Practitioner', identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: '30160453873' } },
                        }
                    },
                ],
            };
            try {
                const r = await axios.post(url, bundle, { headers, timeout: 20000 });
                results.push({ code: c.code, system: c.system, status: r.status, success: true, body: r.data });
            } catch (e: any) {
                const oo = e.response?.data?.entry?.find((x: any) => x.resource?.resourceType === 'OperationOutcome')?.resource;
                const errCode = oo?.issue?.[0]?.details?.coding?.[0]?.code || '';
                const errMsg = oo?.issue?.[0]?.details?.coding?.[0]?.display || e.message;
                results.push({ code: c.code, system: c.system, status: e.response?.status, success: false, errCode, errMsg: errMsg?.substring(0, 200) });
            }
        }
        return results;
    }
}

export const caseService = new CaseService();
