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
    // Optional: CEZIH server-assigned patient ID — if set, uses REST reference instead of MBO identifier
    patientFhirId?: string;
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
        // TC15 uses IHE QEDm profile — Condition resources via qedm-svc (NOT health-issue-services)
        const url = `${config.cezih.gatewayBase}${config.cezih.services.qedm}/Condition`;
        const params: Record<string, string | number> = {
            'patient:identifier': `${CEZIH_IDENTIFIERS.MBO}|${patientMbo}`,
            _sort: '-onset-date',
            _count: 50,
        };

        // Use gateway session (Cookie auth) like all other CEZIH service calls
        let headers: Record<string, string>;
        if (authService.hasGatewaySession()) {
            const gatewayHeaders = authService.getGatewayAuthHeaders();
            headers = {
                ...(gatewayHeaders.Cookie ? { Cookie: gatewayHeaders.Cookie } : {}),
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json',
            };
        } else {
            headers = {
                ...authService.getUserAuthHeaders(userToken),
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json',
            };
        }

        console.log(`[CaseService] TC15 QEDm Condition search: ${url}`);
        console.log(`[CaseService] Params:`, JSON.stringify(params));

        try {
            const response = await axios.get(url, { headers, params });
            const entries = response.data.entry || [];
            console.log(`[CaseService] TC15 found ${entries.length} Condition entries`);
            return entries.map((e: any) => this.mapRemoteCase(e.resource));
        } catch (err: any) {
            const status = err.response?.status;
            const body = err.response?.data ? JSON.stringify(err.response.data).slice(0, 800) : '';
            console.error(`[CaseService] TC15 QEDm failed: HTTP ${status} — ${err.message}`);
            if (body) console.error(`[CaseService] TC15 response body:`, body);
            throw new Error(`CEZIH Condition search failed: ${err.message}`);
        }
    }

    private mapRemoteCase(resource: any): any {
        // resource is a FHIR Condition (IHE QEDm)
        const patientIdentifier = resource.subject?.identifier;
        const patientMbo = Array.isArray(patientIdentifier)
            ? patientIdentifier.find((id: any) => id.system === CEZIH_IDENTIFIERS.MBO)?.value
            : patientIdentifier?.value || '';

        // cezihCaseId = identifikator-slucaja (cmmm... string)
        const identifiers: any[] = resource.identifier || [];
        const cezihCaseId = identifiers.find(
            (id: any) => id.system === CEZIH_IDENTIFIERS.CASE_ID ||
                         id.system === 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja'
        )?.value || resource.id;

        // cezihCaseOid = urn:oid:... global OID
        const cezihCaseOid = identifiers.find(
            (id: any) => id.system === 'urn:ietf:rfc:3986'
        )?.value || null;

        // MKB-10 diagnosis code from Condition.code
        const codingArr: any[] = resource.code?.coding || [];
        const diagnosisCode = codingArr[0]?.code || '';
        const diagnosisDisplay = resource.code?.text || codingArr[0]?.display || '';

        // clinicalStatus (active, remission, recurrence, inactive, resolved)
        const clinicalStatusCode = resource.clinicalStatus?.coding?.[0]?.code
            || resource.clinicalStatus?.text
            || null;

        // Map Condition status → our case status
        // FHIR Condition clinicalStatus: active/recurrence/relapse → active; remission/inactive/resolved → finished
        let status: string;
        if (['active', 'recurrence', 'relapse'].includes(clinicalStatusCode)) {
            status = 'active';
        } else if (['remission'].includes(clinicalStatusCode)) {
            status = 'active'; // remission is still active but with clinicalStatus
        } else if (['inactive', 'resolved'].includes(clinicalStatusCode)) {
            status = 'finished';
        } else {
            status = resource.verificationStatus?.coding?.[0]?.code === 'unconfirmed' ? 'active' : (clinicalStatusCode || 'active');
        }

        // Dates — Condition uses onset/abatement instead of period
        const start = resource.onsetDateTime
            || resource.onsetPeriod?.start
            || resource.recordedDate
            || null;
        const end = resource.abatementDateTime
            || resource.abatementPeriod?.end
            || null;

        // Practitioner who asserted the condition
        const practitionerName = resource.asserter?.display
            || resource.recorder?.display
            || null;

        console.log(`[CaseService] Mapped Condition: ${cezihCaseId} (${diagnosisCode}) clinical=${clinicalStatusCode} status=${status}`);

        return {
            id: cezihCaseId,
            cezihCaseId,
            cezihCaseOid,
            patientMbo,
            title: diagnosisDisplay || diagnosisCode || 'Zdravstveni slučaj',
            status,
            clinicalStatus: clinicalStatusCode,
            start,
            end,
            diagnosisCode,
            diagnosisDisplay,
            practitionerName,
        };
    }

    private saveOrUpdateCase(data: any) {
        try {
            db.prepare(`
                INSERT INTO cases (id, patientMbo, title, status, clinicalStatus, start, end, diagnosisCode, diagnosisDisplay, practitionerName, cezihCaseId, cezihCaseOid)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    clinicalStatus = excluded.clinicalStatus,
                    end = excluded.end,
                    title = excluded.title,
                    diagnosisCode = excluded.diagnosisCode,
                    diagnosisDisplay = excluded.diagnosisDisplay,
                    cezihCaseId = excluded.cezihCaseId,
                    cezihCaseOid = excluded.cezihCaseOid
            `).run(
                data.id,
                data.patientMbo,
                data.title,
                data.status,
                data.clinicalStatus || null,
                data.start,
                data.end,
                data.diagnosisCode,
                data.diagnosisDisplay,
                data.practitionerName,
                data.cezihCaseId || null,
                data.cezihCaseOid || null
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
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId || config.organization.hzzoCode,
                            },
                            display: config.organization.name,
                        },
                        // DIGSIG-1: autor poruke mora biti jednak Bundle.signature.who
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            },
                            display: config.practitioner.name,
                        },
                        source: {
                            endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
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
                        subject: data.patientFhirId
                            ? {
                                reference: `Patient/${data.patientFhirId}`,
                                type: 'Patient',
                                identifier: {
                                    system: CEZIH_IDENTIFIERS.MBO,
                                    value: data.patientMbo,
                                },
                            }
                            : {
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
                            display: config.practitioner.name,
                        },
                    },
                },
            ],
        };

        const response = await this.sendMessage(bundle, userToken, 'CASE_CREATE', localCaseId, data.patientMbo);

        // Extract CEZIH-assigned case ID from response and save to local DB
        // CEZIH returns identifikator-slucaja which is required for TC17 (update)
        let cezihCaseId: string | undefined;
        try {
            const innerResult = response?.result ?? response;
            const condition = innerResult?.entry?.find((e: any) => e.resource?.resourceType === 'Condition')?.resource;
            cezihCaseId = condition?.identifier?.find(
                (id: any) => id.system === CEZIH_IDENTIFIERS.CASE_ID
                    || id.system === 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja'
            )?.value;
            if (cezihCaseId) {
                db.prepare('UPDATE cases SET cezihCaseId = ? WHERE id = ?').run(cezihCaseId, localCaseId);
                console.log('[CaseService] Saved CEZIH case ID:', cezihCaseId, 'for local:', localCaseId);
            } else {
                console.warn('[CaseService] ⚠️ Could not find CEZIH case ID in response identifiers:', JSON.stringify(condition?.identifier));
            }
        } catch (e) {
            console.warn('[CaseService] Could not extract CEZIH case ID from response');
        }

        return { ...response, localCaseId, cezihCaseId };
    }

    // ============================================================
    // Test Case 17: Update Case (FHIR Messaging)
    // ============================================================

    async updateCase(caseId: string, data: Partial<CaseData>, userToken: string): Promise<any> {
        const messageId = uuidv4();
        const conditionUuid = uuidv4();

        // Resolve CEZIH case ID — required for CEZIH to accept the update
        const localCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
        const cezihCaseId = localCase?.cezihCaseId || caseId;
        console.log('[CaseService] Updating case:', caseId, '→ CEZIH ID:', cezihCaseId);

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
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-update-health-issue-data-message'],
                // NOTE: CEZIH selects profile by event code (2.6), not by meta.profile
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
                            code: '2.6', // 2.6=update health issue data (per hr-update-health-issue-data-message)
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId || config.organization.hzzoCode,
                            },
                            display: config.organization.name,
                        },
                        // DIGSIG-1: autor poruke = Bundle.signature.who
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            },
                            display: config.practitioner.name,
                        },
                        source: {
                            endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
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
                                value: cezihCaseId,
                            },
                        ],
                        ...((data.status as string) === 'resolved' || (data.status as string) === 'inactive' ? {
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
                            display: config.practitioner.name,
                        },
                    },
                },
            ],
        };

        return this.sendMessage(bundle, userToken, 'CASE_UPDATE', caseId, data.patientMbo);
    }

    // ============================================================
    // Centralized Case Action Dispatcher (2.2–2.8)
    // ============================================================

    /**
     * Map of CEZIH health issue actions to their event codes, profiles, and clinicalStatus.
     */
    private static readonly ACTION_MAP: Record<string, {
        eventCode: string;
        profile: string;
        clinicalStatus?: string;
        auditAction: string;
    }> = {
            '2.2': {
                eventCode: '2.2',
                profile: 'hr-delete-health-issue-message',
                auditAction: 'CASE_DELETE',
            },
            '2.3': {
                eventCode: '2.3',
                profile: 'hr-create-recurrent-health-issue-message',
                clinicalStatus: 'recurrence',
                auditAction: 'CASE_RECURRENT',
            },
            '2.4': {
                eventCode: '2.4',
                profile: 'hr-update-health-issue-clinical-status-message',
                clinicalStatus: 'relapse', // NOT recurrence — per hr-condition docs
                auditAction: 'CASE_RECIDIV',
            },
            '2.5': {
                eventCode: '2.5',
                profile: 'hr-update-health-issue-clinical-status-message',
                clinicalStatus: 'remission',
                auditAction: 'CASE_REMISSION',
            },
            '2.7': {
                eventCode: '2.7',
                profile: 'hr-delete-health-issue-message', // CEZIH internally maps 2.7 to this profile
                // No clinicalStatus — profile forbids it (max=0)
                auditAction: 'CASE_CLOSE',
            },
            '2.8': {
                eventCode: '2.8',
                profile: 'hr-update-health-issue-clinical-status-message',
                clinicalStatus: 'active',
                auditAction: 'CASE_REOPEN',
            },
        };

    /**
     * Perform a case action (2.2–2.8).
     * Dispatches to the correct FHIR message based on action code.
     */
    async performCaseAction(
        caseId: string,
        action: string,
        data: Partial<CaseData> & { previousCaseId?: string; reason?: string; externalCaseData?: any } | undefined,
        userToken: string
    ): Promise<any> {
        // Action 2.3 (recurrent case) is a special create — delegates to createCase with reference
        if (action === '2.3') {
            return this.createRecurrentCase(caseId, data || {}, userToken);
        }

        const actionDef = CaseService.ACTION_MAP[action];
        if (!actionDef) {
            throw new Error(`Nepoznata akcija: ${action}. Podržane: 2.2, 2.3, 2.4, 2.5, 2.7, 2.8`);
        }

        const messageId = uuidv4();
        const conditionUuid = uuidv4();

        // Resolve CEZIH case ID — check local DB first, fallback to externalCaseData (lazy sync)
        let localCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;

        if (!localCase && data?.externalCaseData) {
            // Lazy sync: CEZIH case not yet in local DB — insert it now
            console.log(`[CaseService] Lazy sync for ${caseId} from externalCaseData before action ${action}`);
            this.saveOrUpdateCase(data.externalCaseData);
            localCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
        }

        if (!localCase) throw new Error(`Slučaj ${caseId} nije pronađen u lokalnoj bazi.`);
        const cezihCaseId = localCase.cezihCaseId || caseId;
        const patientMbo = data?.patientMbo || localCase.patientMbo;

        console.log(`[CaseService] Action ${action} on case: ${caseId} → CEZIH ID: ${cezihCaseId}`);

        // Update local DB based on action
        try {
            if (action === '2.2') {
                // Delete — mark as entered-in-error
                db.prepare('UPDATE cases SET status = ? WHERE id = ?').run('entered-in-error', caseId);
            } else if (action === '2.7') {
                // Close — resolved + endDate
                db.prepare('UPDATE cases SET status = ?, end = ?, clinicalStatus = ? WHERE id = ?')
                    .run('finished', new Date().toISOString(), 'resolved', caseId);
            } else if (action === '2.8') {
                // Reopen — active, clear endDate
                db.prepare('UPDATE cases SET status = ?, end = NULL, clinicalStatus = ? WHERE id = ?')
                    .run('active', 'active', caseId);
            } else if (action === '2.4' || action === '2.5') {
                // Recidiv / Remission — keep active but change clinicalStatus
                db.prepare('UPDATE cases SET clinicalStatus = ? WHERE id = ?')
                    .run(actionDef.clinicalStatus, caseId);
            }
        } catch (err: any) {
            console.error(`[CaseService] DB update for action ${action} failed:`, err.message);
        }

        // Build FHIR Condition resource
        // hr-delete-health-issue-message profile (used for 2.2/2.7) is very restrictive:
        // only identifier, subject, note are allowed (code, asserter, onsetDateTime etc. are max=0)
        const isDeleteProfile = (action === '2.2' || action === '2.7');

        const conditionResource: any = {
            resourceType: 'Condition',
            id: conditionUuid,
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-condition'],
            },
            identifier: [{
                system: CEZIH_IDENTIFIERS.CASE_ID,
                value: cezihCaseId,
            }],
            subject: {
                type: 'Patient',
                identifier: {
                    system: CEZIH_IDENTIFIERS.MBO,
                    value: patientMbo,
                },
            },
        };

        if (isDeleteProfile) {
            // Delete (2.2) / Close (2.7): minimal Condition — only identifier + subject + note
            // Profile hr-delete-health-issue-message forbids: code, clinicalStatus, onsetDateTime, asserter, etc.
            // For 2.2: CEZIH automatically sets verificationStatus=entered-in-error (docs: "zanemaruje")
            // note with annotation-type (himgmt-1 rule)
            conditionResource.note = [{
                extension: [{
                    url: CEZIH_EXTENSIONS.ANNOTATION_TYPE,
                    valueCoding: {
                        system: ENCOUNTER_CODES.ANNOTATION_TYPE_SYSTEM,
                        code: '1',
                        display: 'Razlog brisanja podatka',
                    },
                }],
                text: data?.reason || (action === '2.7' ? 'Zatvaranje slučaja' : 'Brisanje slučaja'),
            }];
        } else {
            // Clinical status updates (2.4, 2.5, 2.8): minimal Condition
            // Docs: asserter, code, onsetDateTime "zanemariti" for these messages; profile may enforce max=0
            // clinicalStatus: docs say CEZIH sets automatically, but we send it as the profile name suggests it
            if (actionDef.clinicalStatus) {
                conditionResource.clinicalStatus = {
                    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: actionDef.clinicalStatus }],
                };
            }
        }

        const bundle = {
            resourceType: 'Bundle',
            id: messageId,
            meta: {
                profile: [`http://fhir.cezih.hr/specifikacije/StructureDefinition/${actionDef.profile}`],
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
                            code: actionDef.eventCode,
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data?.organizationId || config.organization.hzzoCode,
                            },
                            display: config.organization.name,
                        },
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            },
                            display: config.practitioner.name,
                        },
                        source: {
                            endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
                        },
                        focus: [{ reference: `urn:uuid:${conditionUuid}` }],
                    },
                },
                {
                    fullUrl: `urn:uuid:${conditionUuid}`,
                    resource: conditionResource,
                },
            ],
        };

        return this.sendMessage(bundle, userToken, actionDef.auditAction, caseId, patientMbo);
    }

    /**
     * Action 2.3: Create a recurrent case linked to a previous closed case.
     */
    private async createRecurrentCase(
        previousCaseId: string,
        data: Partial<CaseData>,
        userToken: string
    ): Promise<any> {
        // Get previous case info for diagnosis data
        const previousCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(previousCaseId) as any;
        if (!previousCase) throw new Error(`Prethodni slučaj ${previousCaseId} nije pronađen.`);

        const cezihPreviousCaseId = previousCase.cezihCaseId || previousCaseId;
        const messageId = uuidv4();
        const newLocalCaseId = uuidv4();
        const conditionUuid = uuidv4();
        const patientMbo = data.patientMbo || previousCase.patientMbo;

        // Save new case to DB
        try {
            db.prepare(`
                INSERT INTO cases (id, patientMbo, title, status, clinicalStatus, start, diagnosisCode, diagnosisDisplay, practitionerName)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                newLocalCaseId,
                patientMbo,
                data.title || previousCase.title || previousCase.diagnosisDisplay || 'Ponovljeni slučaj',
                'active',
                'recurrence',
                data.startDate || new Date().toISOString(),
                data.diagnosisCode || previousCase.diagnosisCode,
                data.diagnosisDisplay || previousCase.diagnosisDisplay,
                data.practitionerId || config.practitioner.hzjzId
            );
        } catch (err: any) {
            console.error('[CaseService] DB Insert for recurrent case failed:', err.message);
        }

        const conditionResource: any = {
            resourceType: 'Condition',
            id: conditionUuid,
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-condition'],
            },
            identifier: [{
                system: CEZIH_IDENTIFIERS.LOCAL_CASE_ID,
                value: newLocalCaseId,
            }],
            clinicalStatus: {
                coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'recurrence' }],
            },
            verificationStatus: {
                coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
            },
            code: {
                coding: [{
                    system: ENCOUNTER_CODES.ICD10_HR,
                    code: data.diagnosisCode || previousCase.diagnosisCode,
                    display: data.diagnosisDisplay || previousCase.diagnosisDisplay,
                }],
                text: data.diagnosisDisplay || previousCase.diagnosisDisplay,
            },
            subject: {
                type: 'Patient',
                identifier: {
                    system: CEZIH_IDENTIFIERS.MBO,
                    value: patientMbo,
                },
            },
            onsetDateTime: data.startDate || new Date().toISOString(),
            asserter: {
                type: 'Practitioner',
                identifier: {
                    system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                    value: data.practitionerId || config.practitioner.hzjzId,
                },
                display: config.practitioner.name,
            },
            // Reference to previous case (CEZIH extension for recurrent cases)
            extension: [{
                url: CEZIH_EXTENSIONS.PREVIOUS_HEALTH_ISSUE,
                valueReference: {
                    identifier: {
                        system: CEZIH_IDENTIFIERS.CASE_ID,
                        value: cezihPreviousCaseId,
                    },
                },
            }],
        };

        const bundle = {
            resourceType: 'Bundle',
            id: messageId,
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-create-recurrent-health-issue-message'],
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
                            code: '2.3',
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId || config.organization.hzzoCode,
                            },
                            display: config.organization.name,
                        },
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            },
                            display: config.practitioner.name,
                        },
                        source: {
                            endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
                        },
                        focus: [{ reference: `urn:uuid:${conditionUuid}` }],
                    },
                },
                {
                    fullUrl: `urn:uuid:${conditionUuid}`,
                    resource: conditionResource,
                },
            ],
        };

        const response = await this.sendMessage(bundle, userToken, 'CASE_RECURRENT', newLocalCaseId, patientMbo);

        // Extract CEZIH case ID from response
        try {
            const innerResult = response?.result ?? response;
            const condition = innerResult?.entry?.find((e: any) => e.resource?.resourceType === 'Condition')?.resource;
            const cezihNewId = condition?.identifier?.find(
                (id: any) => id.system === CEZIH_IDENTIFIERS.CASE_ID
            )?.value;
            if (cezihNewId) {
                db.prepare('UPDATE cases SET cezihCaseId = ? WHERE id = ?').run(cezihNewId, newLocalCaseId);
            }
        } catch (e) {
            console.warn('[CaseService] Could not extract CEZIH case ID from recurrent response');
        }

        return response;
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
                            asserter: { type: 'Practitioner', identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: config.practitioner.hzjzId } },
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
