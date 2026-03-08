/**
 * Visit Management Service (Test Cases 12-14)
 * Create, update, and close patient visits using FHIR Messaging.
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
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
    class: 'AMB' | 'IMP' | 'EMER'; // ambulatory, inpatient, emergency
    caseId?: string;
    // Parameterized org identifier for testing
    orgIdentifierSystem?: string;
    orgIdentifierValue?: string;
    // Skip serviceProvider entirely
    skipServiceProvider?: boolean;
}

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


    async createVisit(data: VisitData, userToken: string): Promise<any> {
        const messageId = uuidv4();
        const encounterUuid = uuidv4();
        const localVisitId = data.localVisitId || uuidv4();

        const now = new Date();
        const visitDate = new Date(data.startDate);
        // If visit is in the future (> 1 hour from now), it's planned. Otherwise in-progress.
        const initialStatus = visitDate.getTime() > now.getTime() + 3600000 ? 'planned' : 'in-progress';

        // 1. Save to Local DB
        try {
            // Ensure the patient exists in the local DB (FK constraint).
            // We use INSERT OR IGNORE so existing records are not overwritten.
            db.prepare(`
                INSERT OR IGNORE INTO patients (mbo, firstName, lastName)
                VALUES (?, ?, ?)
            `).run(
                data.patientMbo,
                (data as any).patientName?.split(' ').slice(1).join(' ') || null,
                (data as any).patientName?.split(' ')[0] || null,
            );

            const stmt = db.prepare(`
                INSERT INTO visits (id, patientMbo, status, startDateTime, endDateTime, type, priority, doctorName)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                localVisitId,
                data.patientMbo,
                initialStatus,
                data.startDate,
                data.endDate || null,
                data.class,
                'regular',
                config.practitioner.name || 'Dr. Ivan Prpić'
            );
            console.log('[VisitService] Saved visit to local DB:', localVisitId);
        } catch (dbError: any) {
            console.error('[VisitService] DB Error:', dbError.message);
            throw new Error(`Database error: ${dbError.message}`);
        }

        const bundle: any = {
            resourceType: 'Bundle',
            id: uuidv4(),
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-create-encounter-message']
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
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header'],
                        },
                        eventCoding: {
                            // ehe-message-types / 1.1 — prema hr-create-encounter-message StructureDefinition
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '1.1',
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId || config.organization.hzzoCode,
                            },
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
                        meta: {
                            profile: [CEZIH_EXTENSIONS.ENCOUNTER_PROFILE]
                        },
                        extension: [
                            {
                                url: CEZIH_EXTENSIONS.COST_PARTICIPATION,
                                extension: [
                                    {
                                        url: 'oznaka',
                                        valueCoding: {
                                            system: ENCOUNTER_CODES.COST_PARTICIPATION_SYSTEM,
                                            code: 'N' // Default to No (Not self-paying)
                                        }
                                    },
                                    {
                                        url: 'sifra-oslobodjenja',
                                        valueCoding: {
                                            system: ENCOUNTER_CODES.EXEMPTION_REASON_SYSTEM,
                                            code: '55' // Default to 55 (General exemption)
                                        }
                                    }
                                ]
                            }
                        ],
                        status: initialStatus as 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled',
                        class: {
                            system: ENCOUNTER_CLASS_SYSTEM,
                            code: ENCOUNTER_CLASSES[data.class] || '1',
                            display: data.class === 'AMB' ? 'Redovni' : data.class === 'EMER' ? 'Hitni' : 'Stacionarni'
                        },
                        type: [
                            {
                                // VrstaPosjete — prisutnost pacijenta (vrsta-posjete)
                                // 1=Pacijent prisutan, 2=Pacijent udaljeno prisutan, 3=Pacijent nije prisutan
                                coding: [
                                    {
                                        system: ENCOUNTER_CODES.VISIT_TYPE_SYSTEM,
                                        code: '1',
                                        display: 'Pacijent prisutan'
                                    }
                                ]
                            },
                            {
                                // TipPosjete — 1=LOM, 2=SKZZ, 3=Hospitalizacija
                                coding: [
                                    {
                                        system: ENCOUNTER_CODES.VISIT_SUBTYPE_SYSTEM,
                                        code: '2', // Posjeta SKZZ (specijalistička)
                                        display: 'Posjeta SKZZ'
                                    }
                                ]
                            }
                        ],
                        identifier: [
                            {
                                // Lokalni identifikator — šalje Gx aplikacija
                                system: CEZIH_IDENTIFIERS.LOCAL_VISIT_ID,
                                value: localVisitId,
                            },
                        ],
                        priority: {
                            coding: [
                                {
                                    system: 'http://terminology.hl7.org/CodeSystem/v3-ActPriority',
                                    code: 'R'
                                }
                            ]
                        },
                        subject: {
                            type: 'Patient',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.MBO,
                                value: data.patientMbo,
                            },
                        },
                        participant: [
                            {
                                individual: {
                                    type: 'Practitioner',
                                    identifier: {
                                        system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                                        value: data.practitionerId || config.practitioner.hzjzId,
                                    },
                                },
                            },
                        ],
                        ...(!data.skipServiceProvider && {
                            serviceProvider: {
                                type: 'Organization',
                                identifier: {
                                    system: data.orgIdentifierSystem || CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                    value: data.orgIdentifierValue || data.organizationId || config.organization?.hzzoCode || '4981825',
                                },
                            },
                        }),
                        period: {
                            start: data.startDate || new Date().toISOString(),
                            ...(data.endDate && { end: data.endDate }),
                        },
                        ...(data.reasonCode && {
                            reasonCode: [{
                                // Spec: reasonCode.coding max=0, samo text!
                                text: data.reasonDisplay || data.reasonCode,
                            }],
                        }),
                        ...(data.caseId && {
                            diagnosis: [{
                                condition: {
                                    type: 'Condition',
                                    identifier: {
                                        system: CEZIH_IDENTIFIERS.CASE_ID,
                                        value: data.caseId
                                    }
                                },
                            }],
                        }),
                    },
                },
            ],
        };

        const response = await this.sendMessage(bundle, userToken, 'ENCOUNTER_START', localVisitId, data.patientMbo);

        // Extract CEZIH-assigned visit ID from response and save to local DB
        // CEZIH returns identifikator-posjete which is required for TC13/TC14
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
    // ENCOUNTER_START: planned → in-progress
    // ============================================================

    async startVisit(visitId: string, data: { patientMbo?: string; startTimestamp?: string }, userToken: string): Promise<any> {
        const messageId = uuidv4();

        // Update Local DB status
        try {
            db.prepare('UPDATE visits SET status = ? WHERE id = ?').run('in-progress', visitId);
            console.log('[VisitService] Started visit in local DB:', visitId);
        } catch (dbError) {
            console.error('[VisitService] DB Start Error', dbError);
        }

        const encounterUuid = uuidv4();

        const bundle: any = {
            resourceType: 'Bundle',
            id: uuidv4(),
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-update-encounter-message'],
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
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header'],
                        },
                        eventCoding: {
                            // ehe-message-types / 1.2 — Start/Update Encounter
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '1.2',
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: config.organization.hzzoCode,
                            },
                        },
                        author: {
                            type: 'Practitioner',
                            identifier: {
                                system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                                value: config.practitioner.hzjzId || config.practitioner.oib,
                            }
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
                        meta: {
                            profile: [CEZIH_EXTENSIONS.ENCOUNTER_PROFILE]
                        },
                        identifier: [
                            {
                                system: CEZIH_IDENTIFIERS.VISIT_ID,
                                value: visitId,
                            },
                        ],
                        status: 'in-progress',
                        period: {
                            start: data.startTimestamp || new Date().toISOString(),
                        },
                        ...(data.patientMbo && {
                            subject: {
                                type: 'Patient',
                                identifier: {
                                    system: CEZIH_IDENTIFIERS.MBO,
                                    value: data.patientMbo,
                                },
                            },
                        }),
                    },
                },
            ],
        };

        return this.sendMessage(bundle, userToken, 'ENCOUNTER_START', visitId, data.patientMbo);
    }

    // ============================================================
    // Test Case 13: Update Visit (FHIR Messaging)
    // ============================================================

    async updateVisit(visitId: string, data: Partial<VisitData>, userToken: string): Promise<any> {
        const messageId = uuidv4();

        // Resolve CEZIH visit ID — required for CEZIH to accept the update
        const localVisit = this.getVisit(visitId);
        const cezihVisitId = localVisit?.cezihVisitId || visitId;
        console.log('[VisitService] Updating visit:', visitId, '→ CEZIH ID:', cezihVisitId);

        // Update Local DB
        try {
            if (data.endDate) {
                db.prepare('UPDATE visits SET endDateTime = ? WHERE id = ?').run(data.endDate, visitId);
            }
            // More updates could be added here
        } catch (dbError) {
            console.error('[VisitService] DB Update Error', dbError);
        }

        const encounterUuid = uuidv4();

        const bundle: any = {
            resourceType: 'Bundle',
            id: uuidv4(),
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-update-encounter-message'],
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
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header'],
                        },
                        eventCoding: {
                            // ehe-message-types / 1.2 — Update Encounter (1.1=create, 1.2=update, 1.3=close)
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '1.2',
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId || config.organization.hzzoCode,
                            },
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
                        meta: {
                            profile: [CEZIH_EXTENSIONS.ENCOUNTER_PROFILE]
                        },
                        identifier: [
                            {
                                system: CEZIH_IDENTIFIERS.VISIT_ID,
                                value: cezihVisitId,
                            },
                        ],
                        status: 'in-progress',
                        class: {
                            system: ENCOUNTER_CLASS_SYSTEM,
                            code: ENCOUNTER_CLASSES[data.class || 'AMB'] || '1',
                        },
                        subject: {
                            type: 'Patient',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.MBO,
                                value: data.patientMbo || this.getVisit(visitId)?.patientMbo || '999999423',
                            },
                        },
                        participant: [
                            {
                                individual: {
                                    type: 'Practitioner',
                                    identifier: {
                                        system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                                        value: data.practitionerId || config.practitioner.hzjzId,
                                    },
                                },
                            },
                        ],
                        serviceProvider: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: data.organizationId || config.organization?.hzzoCode || '4981825',
                            },
                        },
                        period: {
                            start: data.startDate || this.getVisit(visitId)?.startDateTime || new Date().toISOString(),
                            ...(data.endDate && { end: data.endDate }),
                        },
                        ...(data.caseId && {
                            diagnosis: [{
                                condition: {
                                    type: 'Condition',
                                    identifier: {
                                        system: CEZIH_IDENTIFIERS.CASE_ID,
                                        value: data.caseId
                                    }
                                }
                            }],
                        }),
                    },
                },
            ],
        };

        // Resolve patientMbo — fallback to local DB lookup if not provided
        const resolvedPatientMbo = data.patientMbo
            || localVisit?.patientMbo
            || bundle.entry?.[1]?.resource?.subject?.identifier?.value
            || '999999423';
        console.log('[VisitService] Resolved patientMbo for audit:', resolvedPatientMbo, '(from data:', data.patientMbo, ', localVisit:', localVisit?.patientMbo, ')');
        return this.sendMessage(bundle, userToken, 'ENCOUNTER_UPDATE', visitId, resolvedPatientMbo);
    }

    // ============================================================
    // Test Case 14: Close Visit (FHIR Messaging)
    // ============================================================

    async closeVisit(visitId: string, endDate: string, userToken: string, patientMbo?: string): Promise<any> {
        const messageId = uuidv4();
        const encounterUuid = uuidv4();

        // Resolve CEZIH visit ID — required for CEZIH to accept the close
        const localVisit = this.getVisit(visitId);
        const cezihVisitId = localVisit?.cezihVisitId || visitId;
        console.log('[VisitService] Closing visit:', visitId, '→ CEZIH ID:', cezihVisitId);

        // Update Local DB
        try {
            db.prepare('UPDATE visits SET status = ?, endDateTime = ? WHERE id = ?')
                .run('finished', endDate, visitId);
            console.log('[VisitService] Closed visit in local DB:', visitId);
        } catch (dbError) {
            console.error('[VisitService] DB Close Error', dbError);
        }

        const bundle: any = {
            resourceType: 'Bundle',
            id: uuidv4(),
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-close-encounter-message'],
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
                            profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header'],
                        },
                        eventCoding: {
                            system: 'http://ent.hr/fhir/CodeSystem/ehe-message-types',
                            code: '1.3', // Close Encounter (1.1=create, 1.2=update, 1.3=close)
                        },
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: config.organization.hzzoCode,
                            },
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
                        meta: {
                            profile: [CEZIH_EXTENSIONS.ENCOUNTER_PROFILE]
                        },
                        identifier: [
                            {
                                system: CEZIH_IDENTIFIERS.VISIT_ID,
                                value: cezihVisitId,
                            },
                        ],
                        status: 'finished',
                        class: {
                            system: ENCOUNTER_CLASS_SYSTEM,
                            code: '1',
                        },
                        subject: {
                            type: 'Patient',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.MBO,
                                value: patientMbo || this.getVisit(visitId)?.patientMbo || '999999423',
                            },
                        },
                        participant: [
                            {
                                individual: {
                                    type: 'Practitioner',
                                    identifier: {
                                        system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                                        value: config.practitioner.hzjzId,
                                    },
                                },
                            },
                        ],
                        serviceProvider: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: config.organization?.hzzoCode || '4981825',
                            },
                        },
                        period: {
                            end: endDate,
                        },
                    },
                },
            ],
        };

        // Use provided patientMbo (from G9 body); fallback to local DB lookup
        const resolvedPatientMbo = patientMbo ?? this.getVisit(visitId)?.patientMbo;
        return this.sendMessage(bundle, userToken, 'REALIZATION', visitId, resolvedPatientMbo);
    }

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

            // encounter-services on port 8443 requires gateway session cookies.
            // Sending Authorization: Bearer on the user gateway causes a redirect
            // to the Keycloak login page. Prioritize gateway cookies.
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
            const response = await axios.post(url, bundleToSend, { headers });

            console.log('[VisitService] Message sent successfully');
            finalResponse = response.data;
        } catch (error: any) {
            const cezihStatus = error.response?.status;
            const cezihBody = error.response?.data;
            console.warn(`[VisitService] CEZIH send failed: HTTP ${cezihStatus || '?'}: ${error.message}`);
            if (cezihBody) console.warn('[VisitService] CEZIH Error Body:', JSON.stringify(cezihBody)?.slice(0, 2000));
            errorMessage = error.message;

            // Extract human-readable CEZIH error for audit log
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

            // Never re-throw — the visit is already saved to local DB.
            // All CEZIH errors (400, 404, network) are recorded in audit log.
            errorMessage = `HTTP ${cezihStatus}: ${cezihError}`;
            finalResponse = {
                localOnly: true,
                cezihStatus: 'failed',
                cezihError: errorMessage,
            };
        }
        finally {
            // Await the audit log write so it's not dropped as fire-and-forget
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
}

export const visitService = new VisitService();
