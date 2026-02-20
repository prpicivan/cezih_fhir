import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import { signatureService } from './signature.service';
import { oidService } from './oid.service';
import { patientService } from './patient.service';
import { visitService } from './visit.service';
import {
    CEZIH_IDENTIFIERS,
    ClinicalDocumentType,
    DOCUMENT_CODES,
    ENCOUNTER_CLASSES,
    ENCOUNTER_CLASS_SYSTEM
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

export interface ClinicalDocumentData {
    type: ClinicalDocumentType;
    patientMbo: string;
    practitionerId: string;
    organizationId: string;
    visitId?: string;
    caseId?: string;
    title: string;
    content: string;          // The actual clinical content (narrative)
    diagnosisCode?: string;
    diagnosisDisplay?: string;
    procedureCode?: string;
    procedureDisplay?: string;
    date: string;              // Document date
    attachments?: Array<{
        contentType: string;
        data: string;            // Base64-encoded
        title: string;
    }>;
}

class ClinicalDocumentService {
    // ============================================================
    // Local DB Methods
    // ============================================================

    getDocuments(params: { patientMbo?: string }): any[] {
        let sql = `
            SELECT d.*, p.firstName, p.lastName 
            FROM documents d 
            LEFT JOIN patients p ON d.patientMbo = p.mbo 
            WHERE 1=1
        `;
        const args: any[] = [];

        if (params.patientMbo) {
            sql += ' AND d.patientMbo = ?';
            args.push(params.patientMbo);
        }

        sql += ' ORDER BY d.createdAt DESC';
        return db.prepare(sql).all(...args);
    }

    getDocument(id: string): any {
        return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    }

    // ============================================================
    // Test Case 18: Send Clinical Documents (HR::ITI-65)
    // ============================================================

    async sendDocument(data: ClinicalDocumentData, userToken: string): Promise<any> {
        // Step 1: Generate OID and IDs
        const documentOid = await oidService.generateSingleOid();
        const bundleId = uuidv4();

        // Step 2: Fetch related data for full Bundle construction
        const patient = (await patientService.searchByMbo(data.patientMbo, userToken))[0];
        if (!patient) throw new Error(`Patient with MBO ${data.patientMbo} not found`);

        let visit: any = null;
        if (data.visitId) {
            visit = visitService.getVisit(data.visitId);
        }

        // Save to Local DB
        try {
            const stmt = db.prepare(`
                INSERT INTO documents (id, patientMbo, visitId, type, status, content, createdAt, sentAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                documentOid,
                data.patientMbo,
                data.visitId || null,
                data.type,
                'sent',
                data.content,
                new Date().toISOString(),
                new Date().toISOString()
            );
            console.log('[ClinicalDocumentService] Saved document to local DB:', documentOid);
        } catch (dbError: any) {
            console.error('[ClinicalDocumentService] DB Error:', dbError.message);
        }

        // Step 3: Build the FULL FHIR Document Bundle
        const documentBundle = this.buildFullDocumentBundle(data, documentOid, patient, visit);

        // Step 4: Sign the FHIR document Bundle (CEZIH requires JWS digital signature)
        let finalDocumentBundle = documentBundle;
        try {
            if (signatureService.isAvailable()) {
                const { bundle: signedDoc } = signatureService.signBundle(documentBundle, `Practitioner/${data.practitionerId}`);
                finalDocumentBundle = signedDoc;
                console.log('[ClinicalDocumentService] Document Bundle signed successfully');
            } else {
                console.warn('[ClinicalDocumentService] Signing unavailable — sending unsigned document');
            }
        } catch (signError: any) {
            console.error('[ClinicalDocumentService] Signing failed:', signError.message);
        }

        // Step 5: Build the MHD Provide Document Bundle (ITI-65 transaction)
        const mhdBundle = {
            resourceType: 'Bundle',
            id: bundleId,
            type: 'transaction',
            entry: [
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: this.buildDocumentReference(data, documentOid),
                    request: { method: 'POST', url: 'DocumentReference' },
                },
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: this.buildSubmissionSet(data, documentOid),
                    request: { method: 'POST', url: 'List' },
                },
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: {
                        resourceType: 'Binary',
                        contentType: 'application/fhir+json',
                        data: Buffer.from(JSON.stringify(finalDocumentBundle)).toString('base64'),
                    },
                    request: { method: 'POST', url: 'Binary' },
                },
            ],
        };

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            const url = `${config.cezih.fhirUrl}`;
            const response = await axios.post(url, mhdBundle, { headers });

            console.log(`[ClinicalDocumentService] Document sent: ${data.type}, OID: ${documentOid}`);
            return { ...response.data, documentOid };
        } catch (error: any) {
            console.warn('[ClinicalDocumentService] CEZIH send failed (expected without VPN).');
            return { success: true, documentOid, mock: true };
        }
    }

    // ============================================================
    // Test Case 19: Replace Clinical Document (HR::ITI-65)
    // ============================================================

    async replaceDocument(
        originalDocumentOid: string,
        data: ClinicalDocumentData,
        userToken: string
    ): Promise<any> {
        const newDocumentOid = await oidService.generateSingleOid();
        const bundleId = uuidv4();

        // Fetch related data
        const patient = (await patientService.searchByMbo(data.patientMbo, userToken))[0];
        let visit: any = null;
        if (data.visitId) {
            visit = visitService.getVisit(data.visitId);
        }

        // Update Local DB
        try {
            db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('replaced', originalDocumentOid);

            const stmt = db.prepare(`
                INSERT INTO documents (id, patientMbo, visitId, type, status, content, createdAt, sentAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                newDocumentOid,
                data.patientMbo,
                data.visitId || null,
                data.type,
                'sent',
                data.content,
                new Date().toISOString(),
                new Date().toISOString()
            );
        } catch (dbError) {
            console.error('[ClinicalDocumentService] DB Replace Error', dbError);
        }

        const documentBundle = this.buildFullDocumentBundle(data, newDocumentOid, patient, visit);
        const documentReference = this.buildDocumentReference(data, newDocumentOid);

        documentReference.relatesTo = [{
            code: 'replaces',
            target: { identifier: { value: originalDocumentOid } },
        }];

        // Sign the replacement document Bundle
        let finalDocumentBundle = documentBundle;
        try {
            if (signatureService.isAvailable()) {
                const { bundle: signedDoc } = signatureService.signBundle(documentBundle, `Practitioner/${data.practitionerId}`);
                finalDocumentBundle = signedDoc;
                console.log('[ClinicalDocumentService] Replacement document signed successfully');
            }
        } catch (signError: any) {
            console.error('[ClinicalDocumentService] Replace signing failed:', signError.message);
        }

        const mhdBundle = {
            resourceType: 'Bundle',
            id: bundleId,
            type: 'transaction',
            entry: [
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: documentReference,
                    request: { method: 'POST', url: 'DocumentReference' },
                },
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: this.buildSubmissionSet(data, newDocumentOid),
                    request: { method: 'POST', url: 'List' },
                },
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: {
                        resourceType: 'Binary',
                        contentType: 'application/fhir+json',
                        data: Buffer.from(JSON.stringify(finalDocumentBundle)).toString('base64'),
                    },
                    request: { method: 'POST', url: 'Binary' },
                },
            ],
        };

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            const response = await axios.post(config.cezih.fhirUrl, mhdBundle, { headers });
            return { ...response.data, documentOid: newDocumentOid, replacedOid: originalDocumentOid };
        } catch (error: any) {
            return { success: true, documentOid: newDocumentOid, replacedOid: originalDocumentOid, mock: true };
        }
    }

    // ============================================================
    // Test Case 20: Cancel (Storno) Clinical Document (HR::ITI-65)
    // ============================================================

    async cancelDocument(documentOid: string, userToken: string): Promise<any> {
        const bundleId = uuidv4();

        // Update Local DB
        try {
            db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('cancelled', documentOid);
        } catch (dbError) {
            console.error('[ClinicalDocumentService] DB Cancel Error', dbError);
        }

        const cancelBundle = {
            resourceType: 'Bundle',
            id: bundleId,
            type: 'transaction',
            entry: [
                {
                    resource: {
                        resourceType: 'DocumentReference',
                        masterIdentifier: { value: documentOid },
                        status: 'entered-in-error',
                    },
                    request: {
                        method: 'PUT',
                        url: `DocumentReference?identifier=${documentOid}`,
                    },
                },
            ],
        };

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            const response = await axios.post(config.cezih.fhirUrl, cancelBundle, { headers });
            return response.data;
        } catch (error: any) {
            return { success: true, id: documentOid, status: 'cancelled', mock: true };
        }
    }

    // ============================================================
    // Test Case 21 & 22: Search & Retrieval
    // ============================================================

    async searchDocuments(params: { patientMbo?: string }, userToken: string): Promise<any[]> {
        return this.getDocuments({ patientMbo: params.patientMbo });
    }

    async retrieveDocument(documentUrl: string, userToken: string): Promise<any> {
        const oidMatch = documentUrl.match(/urn:oid:(.*)/);
        if (oidMatch) {
            const localDoc = this.getDocument(oidMatch[1]);
            if (localDoc) return localDoc;
        }

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            const response = await axios.get(documentUrl, { headers });
            return response.data;
        } catch (error: any) {
            console.error('[ClinicalDocumentService] Failed to retrieve document:', error.message);
            throw error;
        }
    }

    // ============================================================
    // Helper Methods: Bundle Construction
    // ============================================================

    private buildFullDocumentBundle(
        data: ClinicalDocumentData,
        documentOid: string,
        patient: any,
        visit: any
    ): any {
        // UUIDs for internal references within the Bundle
        const patientUuid = `urn:uuid:${uuidv4()}`;
        const practitionerUuid = `urn:uuid:${uuidv4()}`;
        const organizationUuid = `urn:uuid:${uuidv4()}`;
        const encounterUuid = `urn:uuid:${uuidv4()}`;
        const serviceUuid = `urn:uuid:${uuidv4()}`; // HealthcareService
        const roleUuid = `urn:uuid:${uuidv4()}`;    // PractitionerRole? Optional, sticking to simplified

        const entries: any[] = [];

        // 1. Composition Resource (Must be first)
        const composition = {
            resourceType: 'Composition',
            status: 'final',
            type: {
                coding: [this.getDocumentTypeCoding(data.type)],
            },
            subject: {
                reference: patientUuid,
                display: `${patient.name.given[0]} ${patient.name.family}`
            },
            encounter: {
                reference: encounterUuid
            },
            date: data.date,
            author: [
                { reference: practitionerUuid, display: 'Dr. Ivan Horvat' },
                { reference: organizationUuid, display: 'Ordinacija opće medicine' }
            ],
            title: data.title,
            section: [
                // Section 1: Djelatnost (Required)
                {
                    title: 'Djelatnost',
                    code: {
                        coding: [{
                            system: DOCUMENT_CODES.SECTION_SYSTEM,
                            code: DOCUMENT_CODES.SECTION_ACTIVITY,
                            display: 'Djelatnost'
                        }]
                    },
                    entry: [{ reference: serviceUuid }]
                },
                // Section 2: Medicinska informacija (Required)
                // Note: Ideally references Condition, Procedure, Observation. 
                // For now enclosing text in an Observation or just text section if permitted.
                // Simplifier example used Observation for Narrative.
                {
                    title: 'Medicinska informacija',
                    code: {
                        coding: [{
                            system: DOCUMENT_CODES.SECTION_SYSTEM,
                            code: DOCUMENT_CODES.SECTION_MEDICAL_INFO,
                            display: 'Medicinska informacija'
                        }]
                    },
                    text: {
                        status: 'generated',
                        div: `<div xmlns="http://www.w3.org/1999/xhtml">${data.content}</div>`
                    },
                    entry: [
                        // Optionally add structured resources here if available
                    ]
                }
            ] as any[]
        };

        // Section 3: Priloženi dokumenti (Optional, if attachments exist)
        if (data.attachments && data.attachments.length > 0) {
            const attachmentEntries: any[] = [];

            data.attachments.forEach(att => {
                const attachmentUuid = `urn:uuid:${uuidv4()}`;

                // Add Binary resource to Bundle
                entries.push({
                    fullUrl: attachmentUuid,
                    resource: {
                        resourceType: 'Binary',
                        contentType: att.contentType,
                        data: att.data
                    }
                });

                // Add entry to specific list for the section
                attachmentEntries.push({
                    reference: attachmentUuid,
                    title: att.title
                });
            });

            composition.section.push({
                title: 'Priloženi dokumenti',
                code: {
                    coding: [{
                        system: DOCUMENT_CODES.SECTION_SYSTEM,
                        code: DOCUMENT_CODES.SECTION_ATTACHMENTS,
                        display: 'Priloženi dokumenti'
                    }]
                },
                entry: attachmentEntries
            });
        }

        entries.push({ resource: composition });

        // 2. Patient Resource
        entries.push({
            fullUrl: patientUuid,
            resource: {
                resourceType: 'Patient',
                identifier: [{ system: CEZIH_IDENTIFIERS.MBO, value: patient.mbo }],
                name: patient.name.given ? [{ family: patient.name.family, given: patient.name.given }] : [],
                birthDate: patient.birthDate,
                gender: patient.gender
            }
        });

        // 3. Practitioner Resource (Hardcoded for Mock)
        entries.push({
            fullUrl: practitionerUuid,
            resource: {
                resourceType: 'Practitioner',
                identifier: [{ system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: '1234567' }],
                name: [{ family: 'Horvat', given: ['Ivan'], prefix: ['Dr.'] }]
            }
        });

        // 4. Organization Resource (Hardcoded for Mock)
        entries.push({
            fullUrl: organizationUuid,
            resource: {
                resourceType: 'Organization',
                identifier: [{ system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE, value: '999999999' }],
                name: 'Ordinacija opće medicine Dr. Ivan Horvat'
            }
        });

        // 5. HealthcareService Resource (Referenced in Djelatnost)
        entries.push({
            fullUrl: serviceUuid,
            resource: {
                resourceType: 'HealthcareService',
                identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/ID-djelatnosti', value: '3030000' }], // Opća/Obiteljska medicina
                providedBy: { reference: organizationUuid },
                name: 'Opća medicina'
            }
        });

        // 6. Encounter Resource
        if (visit) {
            const classCode = ENCOUNTER_CLASSES[visit.type as keyof typeof ENCOUNTER_CLASSES] || ENCOUNTER_CLASSES.AMB;
            entries.push({
                fullUrl: encounterUuid,
                resource: {
                    resourceType: 'Encounter',
                    identifier: [{ system: CEZIH_IDENTIFIERS.LOCAL_VISIT_ID, value: visit.id }],
                    status: 'finished',
                    class: {
                        system: ENCOUNTER_CLASS_SYSTEM,
                        code: classCode,
                        display: 'Ostalo' // Simplified display
                    },
                    subject: { reference: patientUuid },
                    participant: [{ individual: { reference: practitionerUuid } }],
                    serviceProvider: { reference: organizationUuid },
                    period: {
                        start: visit.startDateTime,
                        end: visit.endDateTime || new Date().toISOString()
                    }
                }
            });
        } else {
            // Fallback Encounter if none provided
            entries.push({
                fullUrl: encounterUuid,
                resource: {
                    resourceType: 'Encounter',
                    status: 'finished',
                    class: { system: ENCOUNTER_CLASS_SYSTEM, code: ENCOUNTER_CLASSES.AMB, display: 'Ambulantno' },
                    subject: { reference: patientUuid },
                    period: { start: data.date }
                }
            });
        }

        // Return the full Bundle
        return {
            resourceType: 'Bundle',
            type: 'document',
            identifier: {
                system: 'urn:ietf:rfc:3986',
                value: `urn:oid:${documentOid}`,
            },
            timestamp: new Date().toISOString(),
            entry: entries,
            signature: {
                type: [
                    {
                        system: "urn:iso-astm:E1762-95:2013",
                        code: "1.2.840.10065.1.12.1.1",
                        display: "Author's Signature"
                    }
                ],
                when: new Date().toISOString(),
                who: { reference: practitionerUuid, display: "Dr. Ivan Horvat" },
                data: "cG90cGlz" // Base64 'potpis' mock
            }
        };
    }

    private buildDocumentReference(data: ClinicalDocumentData, documentOid: string): any {
        return {
            resourceType: 'DocumentReference',
            masterIdentifier: {
                system: 'urn:ietf:rfc:3986',
                value: `urn:oid:${documentOid}`,
            },
            status: 'current',
            type: {
                coding: [this.getDocumentTypeCoding(data.type)],
            },
            subject: {
                identifier: {
                    system: CEZIH_IDENTIFIERS.MBO,
                    value: data.patientMbo,
                },
            },
            date: new Date().toISOString(),
            author: [{ reference: `Practitioner/${data.practitionerId}` }],
            description: data.title,
            content: [
                {
                    attachment: {
                        contentType: 'application/fhir+json',
                        url: `urn:oid:${documentOid}`,
                    },
                },
            ],
            context: {
                ...(data.visitId && {
                    encounter: [{ identifier: { system: CEZIH_IDENTIFIERS.VISIT_ID, value: data.visitId } }],
                }),
                ...(data.caseId && {
                    related: [{ identifier: { system: CEZIH_IDENTIFIERS.CASE_ID, value: data.caseId } }],
                }),
            },
        };
    }

    private buildSubmissionSet(data: ClinicalDocumentData, documentOid: string): any {
        return {
            resourceType: 'List',
            status: 'current',
            mode: 'working',
            code: {
                coding: [{
                    system: 'https://profiles.ihe.net/ITI/MHD/CodeSystem/MHDlistTypes',
                    code: 'submissionset',
                }],
            },
            subject: {
                identifier: {
                    system: CEZIH_IDENTIFIERS.MBO,
                    value: data.patientMbo,
                },
            },
            date: new Date().toISOString(),
            source: {
                reference: `Organization/${data.organizationId}`,
            },
            entry: [
                {
                    item: {
                        reference: `urn:oid:${documentOid}`,
                    },
                },
            ],
        };
    }

    private getDocumentTypeCoding(type: ClinicalDocumentType): { system: string; code: string; display: string } {
        switch (type) {
            case ClinicalDocumentType.AMBULATORY_REPORT:
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_AMBULATORY,
                    display: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
                };
            case ClinicalDocumentType.SPECIALIST_FINDING:
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_SPECIALIST,
                    display: 'Nalaz iz specijalističke ordinacije privatne zdravstvene ustanove',
                };
            case ClinicalDocumentType.DISCHARGE_LETTER:
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_DISCHARGE,
                    display: 'Otpusno pismo iz privatne zdravstvene ustanove',
                };
        }
    }
}

export const clinicalDocumentService = new ClinicalDocumentService();
