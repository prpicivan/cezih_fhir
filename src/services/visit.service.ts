/**
 * Visit Management Service (Test Cases 12-14)
 * Unified approach: buildEncounterBundle() handles CREATE, UPDATE, CLOSE, CANCEL, ERROR.
 * Full Encounter payload is always sent (PUT semantics).
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import { patientService } from './patient.service';
import { signatureService } from './signature.service';
import {
    CEZIH_IDENTIFIERS,
    CEZIH_EXTENSIONS,
    ENCOUNTER_CODES,
    ENCOUNTER_CLASS_SYSTEM,
    ENCOUNTER_CLASSES
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { auditService } from './audit.service';

export interface VisitData {
    patientMbo: string;
    practitionerId: string;
    organizationId: string;
    localVisitId?: string;
    startDate: string;
    endDate?: string;
    reasonCode?: string;
    reasonDisplay?: string;
    diagnosisCode?: string;
    diagnosisDisplay?: string;
    class: 'AMB' | 'IMP' | 'EMER';
    caseId?: string;       // local or CEZIH case ID for locally-created cases
    cezihCaseId?: string;  // TC15-fetched CEZIH case identifikator-slucaja (cmmm...)
    orgIdentifierSystem?: string;
    orgIdentifierValue?: string;
    skipServiceProvider?: boolean;
    patientFhirId?: string;
}

type EncounterAction = 'CREATE' | 'UPDATE' | 'CLOSE' | 'CANCEL' | 'ERROR';

// Maps action → { eventCode, profile, status }
const ACTION_MAP: Record<EncounterAction, { eventCode: string; profile: string }> = {
    CREATE: { eventCode: '1.1', profile: 'hr-create-encounter-message' },
    UPDATE: { eventCode: '1.2', profile: 'hr-update-encounter-message' },
    CLOSE: { eventCode: '1.3', profile: 'hr-close-encounter-message' },
    CANCEL: { eventCode: '1.2', profile: 'hr-update-encounter-message' }, // cancel = update with status=cancelled
    ERROR: { eventCode: '1.2', profile: 'hr-update-encounter-message' }, // entered-in-error = update
};

class VisitService {
    // ============================================================
    // Local DB Methods
    // ============================================================

    getVisits(patientMbo?: string): any[] {
        let sql = `
            SELECT v.*, p.firstName, p.lastName 
            FROM visits v 
            LEFT JOIN patients p ON v.patientMbo = p.mbo 
        `;

        const args: any[] = [];
        if (patientMbo) {
            sql += ' WHERE v.patientMbo = ?';
            args.push(patientMbo);
        }

        sql += ' ORDER BY v.startDateTime DESC';
        return db.prepare(sql).all(...args);
    }

    getVisit(id: string): any {
        return db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
    }

    // ============================================================
    // Unified Bundle Builder — "Swiss Army Knife"
    // Always emits a FULL Encounter payload (PUT semantics)
    // ============================================================

    private buildEncounterBundle(
        action: EncounterAction,
        data: {
            patientMbo: string;
            practitionerId?: string;
            organizationId?: string;
            localVisitId: string;
            cezihVisitId?: string;
            startDate: string;
            endDate?: string;
            reasonCode?: string;
            reasonDisplay?: string;
            class?: 'AMB' | 'IMP' | 'EMER';
            caseId?: string;        // local/CEZIH case ID for own cases (CASE_ID system)
            cezihCaseId?: string;   // TC15-fetched case identifikator-slucaja (identifikator-slucaja system)
            patientFhirId?: string;
            skipServiceProvider?: boolean;
            orgIdentifierSystem?: string;
            orgIdentifierValue?: string;
        }
    ): any {
        const messageId = uuidv4();
        const encounterUuid = uuidv4();
        const { eventCode, profile } = ACTION_MAP[action];

        // ============================================================
        // TC14 CLOSE: Minimal bundle — just MessageHeader + slim Encounter
        // CEZIH spec: NO Observation, NO Patient/Practitioner entries,
        // NO extension, NO type, NO participant.
        // ============================================================
        if (action === 'CLOSE') {
            return {
                resourceType: 'Bundle',
                id: uuidv4(),
                meta: { profile: [`http://fhir.cezih.hr/specifikacije/StructureDefinition/${profile}`] },
                type: 'message',
                timestamp: new Date().toISOString(),
                entry: [
                    {
                        fullUrl: `urn:uuid:${messageId}`,
                        resource: {
                            resourceType: 'MessageHeader',
                            id: messageId,
                            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header'] },
                            eventCoding: { system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types', code: '1.3' },
                            sender: {
                                type: 'Organization',
                                identifier: { system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE, value: data.organizationId || config.organization.hzzoCode },
                                display: config.organization.name,
                            },
                            author: {
                                type: 'Practitioner',
                                identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: data.practitionerId || config.practitioner.hzjzId },
                                display: config.practitioner.name,
                            },
                            source: {
                                endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
                                name: config.software.instance,
                                software: `${config.software.name}_${config.software.company}`,
                                version: config.software.version,
                            },
                            focus: [{ reference: `urn:uuid:${encounterUuid}` }],
                        },
                    },
                    {
                        fullUrl: `urn:uuid:${encounterUuid}`,
                        resource: {
                            resourceType: 'Encounter',
                            id: encounterUuid,
                            identifier: [{
                                system: CEZIH_IDENTIFIERS.VISIT_ID,
                                value: data.cezihVisitId || data.localVisitId,
                            }],
                            status: 'finished',
                            class: {
                                system: ENCOUNTER_CLASS_SYSTEM,
                                code: ENCOUNTER_CLASSES[data.class || 'AMB'] || '1',
                                display: data.class === 'EMER' ? 'Hitni' : data.class === 'IMP' ? 'Stacionarni' : 'Redovni',
                            },
                            period: {
                                start: data.startDate || new Date().toISOString(),
                                ...(data.endDate && { end: data.endDate }),
                            },
                            subject: {
                                type: 'Patient',
                                identifier: { system: CEZIH_IDENTIFIERS.MBO, value: data.patientMbo },
                            },
                            serviceProvider: {
                                type: 'Organization',
                                identifier: {
                                    system: data.orgIdentifierSystem || CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                    value: data.orgIdentifierValue || data.organizationId || config.organization?.hzzoCode,
                                },
                            },
                        },
                    },
                ],
            };
        }

        // ============================================================
        // CREATE / UPDATE / CANCEL / ERROR: Full Encounter payload
        // ============================================================

        let encounterStatus: string;
        if (action === 'CANCEL') {
            encounterStatus = 'cancelled';
        } else if (action === 'ERROR') {
            encounterStatus = 'entered-in-error';
        } else if (action === 'CREATE') {
            const now = new Date();
            const visitDate = new Date(data.startDate);
            encounterStatus = visitDate.getTime() > now.getTime() + 3600000 ? 'planned' : 'in-progress';
        } else {
            encounterStatus = 'in-progress';
        }

        const encounterIdentifiers: any[] = [];
        if (action === 'CREATE') {
            encounterIdentifiers.push({ system: CEZIH_IDENTIFIERS.LOCAL_VISIT_ID, value: data.localVisitId });
        } else {
            encounterIdentifiers.push({ system: CEZIH_IDENTIFIERS.VISIT_ID, value: data.cezihVisitId || data.localVisitId });
        }

        // Dohvaćamo pacijenta iz baze i koristimo naš centralni helper
        const { patientService } = require('./patient.service');
        let patientRow: any = null;
        try {
            patientRow = db.prepare('SELECT * FROM patients WHERE mbo = ? OR oib = ? OR cezihUniqueId = ?').get(data.patientMbo, data.patientMbo, data.patientMbo);
        } catch (e) {}
        
        // Helper garantira ispravan identifikator
        const patIden = patientService.getPatientIdentifier(patientRow || { mbo: data.patientMbo });

        const subject = {
            type: 'Patient',
            identifier: { system: patIden.system, value: patIden.value || data.patientMbo || '999999423' },
        };

        const encounterResource: any = {
            resourceType: 'Encounter',
            meta: { profile: [CEZIH_EXTENSIONS.ENCOUNTER_PROFILE] },
            extension: [{
                url: CEZIH_EXTENSIONS.COST_PARTICIPATION,
                extension: [
                    { url: 'oznaka', valueCoding: { system: ENCOUNTER_CODES.COST_PARTICIPATION_SYSTEM, code: 'N' } },
                    { url: 'sifra-oslobodjenja', valueCoding: { system: ENCOUNTER_CODES.EXEMPTION_REASON_SYSTEM, code: '55' } },
                ]
            }],
            status: encounterStatus,
            class: {
                system: ENCOUNTER_CLASS_SYSTEM,
                code: ENCOUNTER_CLASSES[data.class || 'AMB'] || '1',
                display: data.class === 'EMER' ? 'Hitni' : data.class === 'IMP' ? 'Stacionarni' : 'Redovni'
            },
            type: [
                { coding: [{ system: ENCOUNTER_CODES.VISIT_TYPE_SYSTEM, code: '1', display: 'Pacijent prisutan' }] },
                { coding: [{ system: ENCOUNTER_CODES.VISIT_SUBTYPE_SYSTEM, code: '2', display: 'Posjeta SKZZ' }] },
            ],
            identifier: encounterIdentifiers,
            priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActPriority', code: 'R' }] },
            subject,
            participant: [{
                individual: {
                    type: 'Practitioner',
                    identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: data.practitionerId || config.practitioner.hzjzId },
                    display: config.practitioner.name,
                },
            }],
            period: {
                start: data.startDate || new Date().toISOString(),
                ...(data.endDate && { end: data.endDate }),
            },
        };

        if (!data.skipServiceProvider) {
            encounterResource.serviceProvider = {
                type: 'Organization',
                identifier: {
                    system: data.orgIdentifierSystem || CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                    value: data.orgIdentifierValue || data.organizationId || config.organization?.hzzoCode,
                },
                display: config.organization.name,
            };
        }

        if (data.reasonCode) {
            encounterResource.reasonCode = [{ text: data.reasonDisplay || data.reasonCode }];
        }

        if (data.cezihCaseId) {
            // TC15-fetched external case: use identifikator-slucaja system (no contained Condition needed)
            encounterResource.diagnosis = [{
                condition: {
                    type: 'Condition',
                    identifier: {
                        system: CEZIH_IDENTIFIERS.CASE_ID, // http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja
                        value: data.cezihCaseId,
                    },
                },
            }];
        } else if (data.caseId) {
            const conditionContainedId = uuidv4();
            // Add contained Condition so HAPI can resolve the reference locally
            encounterResource.contained = [{
                resourceType: 'Condition',
                id: conditionContainedId,
                identifier: [{
                    system: CEZIH_IDENTIFIERS.CASE_ID,
                    value: data.caseId,
                }],
                subject: {
                    type: 'Patient',
                    identifier: { system: CEZIH_IDENTIFIERS.MBO, value: data.patientMbo },
                },
            }];
            encounterResource.diagnosis = [{
                condition: {
                    reference: `#${conditionContainedId}`,
                    type: 'Condition',
                    identifier: { system: CEZIH_IDENTIFIERS.CASE_ID, value: data.caseId },
                },
            }];
        }

        // Bundle entries: only MessageHeader + Encounter (no Patient/Practitioner entries)
        const entries: any[] = [
            {
                fullUrl: `urn:uuid:${messageId}`,
                resource: {
                    resourceType: 'MessageHeader',
                    id: messageId,
                    meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header'] },
                    eventCoding: { system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types', code: eventCode },
                    sender: {
                        type: 'Organization',
                        identifier: { system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE, value: data.organizationId || config.organization.hzzoCode },
                        display: config.organization.name,
                    },
                    author: {
                        type: 'Practitioner',
                        identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: config.practitioner.hzjzId || config.practitioner.oib },
                        display: config.practitioner.name,
                    },
                    source: {
                        endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
                        name: config.software.instance,
                        software: `${config.software.name}_${config.software.company}`,
                        version: config.software.version,
                    },
                    focus: [{ reference: `urn:uuid:${encounterUuid}` }],
                },
            },
            { fullUrl: `urn:uuid:${encounterUuid}`, resource: encounterResource },
        ];

        return {
            resourceType: 'Bundle',
            id: uuidv4(),
            meta: { profile: [`http://fhir.cezih.hr/specifikacije/StructureDefinition/${profile}`] },
            type: 'message',
            timestamp: new Date().toISOString(),
            entry: entries,
        };
    }

    // ============================================================
    // TC12: Create Visit
    // ============================================================

    async createVisit(data: VisitData, userToken: string): Promise<any> {
        const localVisitId = data.localVisitId || uuidv4();

        const now = new Date();
        const visitDate = new Date(data.startDate);
        const initialStatus = visitDate.getTime() > now.getTime() + 3600000 ? 'planned' : 'in-progress';

        // 1. Save to Local DB
        try {
            db.prepare(`
                INSERT OR IGNORE INTO patients (mbo, firstName, lastName)
                VALUES (?, ?, ?)
            `).run(
                data.patientMbo,
                (data as any).patientName?.split(' ').slice(1).join(' ') || null,
                (data as any).patientName?.split(' ')[0] || null,
            );

            db.prepare(`
                INSERT INTO visits (id, patientMbo, status, startDateTime, endDateTime, type, priority, doctorName, reasonCode, reasonDisplay)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                localVisitId,
                data.patientMbo,
                initialStatus,
                data.startDate,
                data.endDate || null,
                data.class,
                'regular',
                config.practitioner.name || 'Dr. Ivan Prpić',
                data.reasonCode || null,
                data.reasonDisplay || null,
            );
            console.log('[VisitService] Saved visit to local DB:', localVisitId);
        } catch (dbError: any) {
            console.error('[VisitService] DB Error:', dbError.message);
            throw new Error(`Database error: ${dbError.message}`);
        }

        // 2. Build unified bundle
        const bundle = this.buildEncounterBundle('CREATE', {
            patientMbo: data.patientMbo,
            practitionerId: data.practitionerId,
            organizationId: data.organizationId,
            localVisitId,
            startDate: data.startDate,
            endDate: data.endDate,
            reasonCode: data.reasonCode,
            reasonDisplay: data.reasonDisplay,
            class: data.class,
            caseId: data.caseId,
            cezihCaseId: (data as any).cezihCaseId,
            patientFhirId: data.patientFhirId,
            skipServiceProvider: data.skipServiceProvider,
            orgIdentifierSystem: data.orgIdentifierSystem,
            orgIdentifierValue: data.orgIdentifierValue,
        });

        // 3. Send and extract CEZIH visit ID
        const response = await this.sendMessage(bundle, userToken, 'ENCOUNTER_START', localVisitId, data.patientMbo);

        let cezihVisitId: string | undefined;
        try {
            const encounter = response?.entry?.find((e: any) => e.resource?.resourceType === 'Encounter')?.resource;
            cezihVisitId = encounter?.identifier?.find(
                (id: any) => id.system === CEZIH_IDENTIFIERS.VISIT_ID
            )?.value;
            if (cezihVisitId) {
                db.prepare('UPDATE visits SET cezihVisitId = ? WHERE id = ?').run(cezihVisitId, localVisitId);
                console.log('[VisitService] Saved CEZIH visit ID:', cezihVisitId, 'for local:', localVisitId);
            }
        } catch (e) {
            console.warn('[VisitService] Could not extract CEZIH visit ID from response');
        }

        return { ...response, localVisitId, cezihVisitId };
    }

    // ============================================================
    // TC13: Update Visit — full Encounter payload + reasonCode change
    // ============================================================

    async updateVisit(visitId: string, data: Partial<VisitData>, userToken: string): Promise<any> {
        const localVisit = this.getVisit(visitId);
        const cezihVisitId = localVisit?.cezihVisitId || visitId;
        const patientMbo = data.patientMbo || localVisit?.patientMbo || '999999423';
        console.log('[VisitService] Updating visit:', visitId, '→ CEZIH ID:', cezihVisitId);

        // Update Local DB
        try {
            const updates: string[] = [];
            const values: any[] = [];

            if (data.endDate) { updates.push('endDateTime = ?'); values.push(data.endDate); }
            if (data.reasonCode) { updates.push('reasonCode = ?'); values.push(data.reasonCode); }
            if (data.reasonDisplay) { updates.push('reasonDisplay = ?'); values.push(data.reasonDisplay); }

            if (updates.length > 0) {
                values.push(visitId);
                db.prepare(`UPDATE visits SET ${updates.join(', ')} WHERE id = ?`).run(...values);
            }
        } catch (dbError) {
            console.error('[VisitService] DB Update Error', dbError);
        }

        // Build full bundle via helper
        const bundle = this.buildEncounterBundle('UPDATE', {
            patientMbo,
            practitionerId: data.practitionerId,
            organizationId: data.organizationId,
            localVisitId: visitId,
            cezihVisitId,
            startDate: data.startDate || localVisit?.startDateTime || new Date().toISOString(),
            endDate: data.endDate,
            reasonCode: data.reasonCode || localVisit?.reasonCode,
            reasonDisplay: data.reasonDisplay || localVisit?.reasonDisplay,
            class: data.class || localVisit?.type || 'AMB',
            caseId: data.caseId,
        });

        return this.sendMessage(bundle, userToken, 'ENCOUNTER_UPDATE', visitId, patientMbo);
    }

    // ============================================================
    // TC14: Close Visit — full payload + Observation for ishod pregleda
    // ============================================================

    async closeVisit(visitId: string, endDate: string, userToken: string, patientMbo?: string): Promise<any> {
        const localVisit = this.getVisit(visitId);
        const cezihVisitId = localVisit?.cezihVisitId || visitId;
        const resolvedMbo = patientMbo || localVisit?.patientMbo || '999999423';
        console.log('[VisitService] Closing visit:', visitId, '→ CEZIH ID:', cezihVisitId);

        // Update Local DB
        try {
            db.prepare('UPDATE visits SET status = ?, endDateTime = ? WHERE id = ?')
                .run('finished', endDate, visitId);
            console.log('[VisitService] Closed visit in local DB:', visitId);
        } catch (dbError) {
            console.error('[VisitService] DB Close Error', dbError);
        }

        const bundle = this.buildEncounterBundle('CLOSE', {
            patientMbo: resolvedMbo,
            localVisitId: visitId,
            cezihVisitId,
            startDate: localVisit?.startDateTime || new Date().toISOString(),
            endDate,
            reasonCode: localVisit?.reasonCode,
            reasonDisplay: localVisit?.reasonDisplay,
            class: localVisit?.type || 'AMB',
        });

        return this.sendMessage(bundle, userToken, 'REALIZATION', visitId, resolvedMbo);
    }

    // ============================================================
    // Cancel Visit — planned → cancelled
    // ============================================================

    async cancelVisit(visitId: string, userToken: string, patientMbo?: string): Promise<any> {
        const localVisit = this.getVisit(visitId);
        const cezihVisitId = localVisit?.cezihVisitId || visitId;
        const resolvedMbo = patientMbo || localVisit?.patientMbo || '999999423';
        console.log('[VisitService] Cancelling visit:', visitId, '→ CEZIH ID:', cezihVisitId);

        // Update local DB
        try {
            db.prepare('UPDATE visits SET status = ? WHERE id = ?').run('cancelled', visitId);
        } catch (dbError) {
            console.error('[VisitService] DB Cancel Error', dbError);
        }

        const bundle = this.buildEncounterBundle('CANCEL', {
            patientMbo: resolvedMbo,
            localVisitId: visitId,
            cezihVisitId,
            startDate: localVisit?.startDateTime || new Date().toISOString(),
            reasonCode: localVisit?.reasonCode,
            reasonDisplay: localVisit?.reasonDisplay,
            class: localVisit?.type || 'AMB',
        });

        return this.sendMessage(bundle, userToken, 'ENCOUNTER_UPDATE', visitId, resolvedMbo);
    }

    // ============================================================
    // Send Message to CEZIH (shared for all actions)
    // ============================================================

    private async sendMessage(bundle: any, userToken: string, action: string, visitId?: string, patientMbo?: string): Promise<any> {
        let bundleToSend = bundle;
        let finalResponse: any = null;
        let errorMessage: string | undefined;

        try {
            // Sign the bundle before sending (CEZIH requires JWS digital signature)
            try {
                if (signatureService.isAvailable()) {
                    const { bundle: signedBundle } = await signatureService.signBundle(bundle, undefined, userToken);
                    bundleToSend = signedBundle;
                    console.log('[VisitService] Bundle signed successfully');
                } else {
                    console.warn('[VisitService] Signing unavailable — sending unsigned bundle');
                }
            } catch (signError: any) {
                console.error('[VisitService] Signing failed:', signError.message);
                errorMessage = `Signing failed: ${signError.message}`;
            }

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
            const url = `${config.cezih.gatewayBase}${config.cezih.services.visit}/$process-message`;
            console.log('[VisitService] Sending to:', url);
            console.log('[VisitService] Generated Bundle:', JSON.stringify(bundleToSend, null, 2).slice(0, 1000) + '...');
            
            const response = await axios.post(url, bundleToSend, { headers });

            console.log('[VisitService] Message sent successfully');
            finalResponse = response.data;
        } catch (error: any) {
            const cezihStatus = error.response?.status;
            const cezihBody = error.response?.data;
            console.warn(`[VisitService] CEZIH send failed: HTTP ${cezihStatus || '?'}: ${error.message}`);
            if (cezihBody) console.warn('[VisitService] CEZIH Error Body:', JSON.stringify(cezihBody)?.slice(0, 2000));
            errorMessage = error.message;

            const cezihError = (() => {
                if (!cezihBody) return error.message;
                if (typeof cezihBody === 'string') return cezihBody.slice(0, 2000);
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

            errorMessage = `HTTP ${cezihStatus}: ${cezihError}`;
            finalResponse = {
                localOnly: true,
                cezihStatus: 'failed',
                cezihError: errorMessage,
            };
        }
        finally {
            await auditService.log({
                visitId,
                patientMbo,
                action,
                direction: 'OUTGOING_CEZIH',
                status: errorMessage ? 'ERROR' : 'SUCCESS',
                payload_req: bundleToSend,
                payload_res: finalResponse,
                error_msg: errorMessage
            });
        }
        return finalResponse;
    }

    // ============================================================
    // Search Remote Visits from CEZIH (FHIR Search)
    // ============================================================

    /**
     * Dohvaća posjete (Encounter) s CEZIH-a za određenog pacijenta.
     */
    async searchRemoteVisits(patientMbo: string, userToken: string): Promise<any[]> {
        console.log(`[VisitService] Dohvaćam posjete s CEZIH-a za MBO: ${patientMbo}`);
        
        try {
            // Use gateway session auth (same as sendMessage)
            let headers: Record<string, string>;
            if (authService.hasGatewaySession()) {
                const gatewayHeaders = authService.getGatewayAuthHeaders();
                headers = {
                    ...(gatewayHeaders.Cookie ? { Cookie: gatewayHeaders.Cookie } : {}),
                    'Accept': 'application/fhir+json',
                };
            } else {
                headers = {
                    ...authService.getUserAuthHeaders(userToken),
                    'Accept': 'application/fhir+json',
                };
            }
            
            // Build search URL — QEDm servis (IHE QEDm) za pretragu Encountera
            const servicePath = config.cezih.services.qedm;
            const baseUrl = `${config.cezih.gatewayBase}${servicePath}/Encounter`;
            
            // FHIR Search upit po MBO-u, sortirano od najnovijeg
            const mboSystem = 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO';
            const url = `${baseUrl}?patient.identifier=${encodeURIComponent(`${mboSystem}|${patientMbo}`)}&_sort=-date`;

            console.log(`[VisitService] Search URL: ${url}`);
            const response = await axios.get(url, { headers });
            const bundle = response.data;

            // Ako nam CEZIH vrati Bundle, mapiramo ga u čistiji format za frontend
            if (bundle.resourceType === 'Bundle' && bundle.entry) {
                const visits = bundle.entry.map((e: any) => {
                    const resource = e.resource;
                    return {
                        id: resource.id,
                        cezihVisitId: resource.identifier?.find((i: any) => i.system?.includes('identifikator-posjete'))?.value || resource.id,
                        status: resource.status,
                        class: resource.class?.code || resource.class?.coding?.[0]?.code,
                        classDisplay: resource.class?.display || resource.class?.coding?.[0]?.display,
                        startTime: resource.period?.start,
                        endTime: resource.period?.end,
                        practitionerId: resource.participant?.[0]?.individual?.identifier?.value,
                        isRemote: true,
                    };
                });
                
                console.log(`[VisitService] ✅ Pronađeno ${visits.length} posjeta.`);
                return visits;
            }
            
            console.log(`[VisitService] ✅ Odgovor bez entry-a, bundle:`, JSON.stringify(bundle).slice(0, 500));
            return [];
        } catch (error: any) {
            const status = error.response?.status;
            const body = error.response?.data;
            console.error(`[VisitService] ❌ Greška pri dohvatu posjeta: HTTP ${status || '?'}: ${error.message}`);
            if (body) console.error('[VisitService] Response body:', JSON.stringify(body)?.slice(0, 1000));
            throw new Error(body?.issue?.[0]?.diagnostics || error.message);
        }
    }
}

export const visitService = new VisitService();
