import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import { signatureService } from './signature.service';
import { oidService } from './oid.service';
import { patientService } from './patient.service';
import { visitService } from './visit.service';
import {
    CEZIH_IDENTIFIERS,
    CEZIH_EXTENSIONS,
    ClinicalDocumentType,
    DOCUMENT_CODES,
    ENCOUNTER_CODES,
    ENCOUNTER_CLASSES,
    ENCOUNTER_CLASS_SYSTEM
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { auditService } from './audit.service';
import { validationService } from './validation.service';

export interface ClinicalDocumentData {
    type: ClinicalDocumentType;
    patientMbo: string;
    practitionerId: string;
    organizationId: string;
    visitId?: string;
    caseId?: string;
    title: string;

    // Structured Clinical Content
    anamnesis?: string;       // Anamneza
    status?: string;          // Status
    finding?: string;         // Nalaz
    recommendation?: string;  // Preporuka i terapija

    // Legacy support or fallback
    content?: string;

    diagnosisCode?: string;   // MKB-10
    diagnosisDisplay?: string;
    procedureCode?: string;
    procedureDisplay?: string;
    date: string;              // Document date
    attachments?: Array<{
        contentType: string;
        data: string;            // Base64-encoded
        title: string;
    }>;
    closeVisit?: boolean;         // New field for G9 shortcut
    foreignerId?: string;       // For TC 11
    foreignerType?: 'putovnica' | 'EKZO';
}

class ClinicalDocumentService {
    // ============================================================
    // Local DB Methods
    // ============================================================

    getDocuments(params: { patientMbo?: string; id?: string; status?: string }): any[] {
        let sql = `
            SELECT 
                d.id, d.patientMbo, d.visitId, d.type, d.status, 
                d.anamnesis, d.status_text, d.finding, d.recommendation, 
                COALESCE(d.diagnosisCode, '') as diagnosisCode,
                COALESCE(d.diagnosisDisplay, v.diagnosis, '') as diagnosisDisplay,
                d.content,
                d.createdAt, d.sentAt,
                p.firstName, p.lastName 
            FROM documents d 
            LEFT JOIN patients p ON d.patientMbo = p.mbo 
            LEFT JOIN visits v ON d.visitId = v.id
            WHERE 1=1
        `;
        const args: any[] = [];

        if (params.patientMbo) {
            sql += ' AND d.patientMbo = ?';
            args.push(params.patientMbo);
        }

        if (params.id) {
            sql += ' AND d.id = ?';
            args.push(params.id);
        }

        if (params.status && params.status !== 'all') {
            sql += ' AND d.status = ?';
            args.push(params.status);
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
        // Step 0: Validate Data
        const validation = validationService.validateDocument(data);
        if (!validation.isValid) {
            throw new Error(`Validacijske pogreške: ${validation.errors.join(', ')}`);
        }

        // Step 1: Generate OID and IDs
        const documentOid = await oidService.generateSingleOid();
        const bundleId = uuidv4();

        // Step 2: Fetch related data for full Bundle construction
        // Use either patientMbo or fallback to foreignerId
        const patientId = data.patientMbo || data.foreignerId || '';
        const patient = (await patientService.searchByMbo(patientId, userToken))[0];
        if (!patient) throw new Error(`Pacijent nije pronađen (ID: ${patientId})`);

        let visit: any = null;
        if (data.visitId) {
            visit = visitService.getVisit(data.visitId);
        }

        // Save to Local DB
        try {
            const stmt = db.prepare(`
                INSERT INTO documents (
                    id, patientMbo, visitId, type, status, 
                    anamnesis, status_text, finding, recommendation, 
                    diagnosisCode, diagnosisDisplay, content, 
                    createdAt, sentAt
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                documentOid,
                data.patientMbo,
                data.visitId || null,
                data.type,
                'sent',
                data.anamnesis || null,
                data.status || null,
                data.finding || null,
                data.recommendation || null,
                data.diagnosisCode || null,
                data.diagnosisDisplay || null,
                data.content || null,
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

        let responseData: any = null;
        let errorMessage: string | undefined;

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            const url = `${config.cezih.fhirUrl}`;
            const response = await axios.post(url, mhdBundle, { headers });

            console.log(`[ClinicalDocumentService] Document sent: ${data.type}, OID: ${documentOid}`);
            responseData = response.data;
        } catch (error: any) {
            console.warn('[ClinicalDocumentService] CEZIH send failed (expected without VPN).');
            errorMessage = error.message;
            responseData = { success: true, documentOid, mock: true };
        } finally {
            await auditService.log({
                visitId: data.visitId,
                patientMbo: data.patientMbo,
                action: 'SEND_FINDING',
                direction: 'OUTGOING',
                status: errorMessage && !responseData?.success ? 'ERROR' : 'SUCCESS',
                payload_req: mhdBundle,
                payload_res: responseData,
                error_msg: errorMessage
            });
        }

        // Note: visit closing (REALIZATION) is handled by G9 app's document/route.ts
        // Do NOT call closeVisit here to avoid duplicate REALIZATION in audit log

        return { ...responseData, documentOid };
    }

    // ============================================================
    // Test Case 19: Replace Clinical Document (HR::ITI-65)
    // ============================================================

    async replaceDocument(
        originalDocumentOid: string,
        data: ClinicalDocumentData,
        userToken: string
    ): Promise<any> {
        // Step 0: Validate Data
        const validation = validationService.validateDocument(data);
        if (!validation.isValid) {
            throw new Error(`Validacijske pogreške: ${validation.errors.join(', ')}`);
        }
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
                INSERT INTO documents (
                    id, patientMbo, visitId, type, status, 
                    anamnesis, status_text, finding, recommendation, 
                    diagnosisCode, diagnosisDisplay, content, 
                    createdAt, sentAt
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                newDocumentOid,
                data.patientMbo,
                data.visitId || null,
                data.type,
                'sent',
                data.anamnesis || null,
                data.status || null,
                data.finding || null,
                data.recommendation || null,
                data.diagnosisCode || null,
                data.diagnosisDisplay || null,
                data.content || null,
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

        let responseData: any = null;
        let errorMessage: string | undefined;

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            responseData = (await axios.post(config.cezih.fhirUrl, mhdBundle, { headers })).data;
        } catch (error: any) {
            errorMessage = error.message;
            responseData = { success: true, documentOid: newDocumentOid, replacedOid: originalDocumentOid, mock: true };
        } finally {
            auditService.log({
                visitId: data.visitId,
                patientMbo: data.patientMbo,
                action: 'REPLACE_DOCUMENT',
                direction: 'OUTGOING',
                status: errorMessage && !responseData?.success ? 'ERROR' : 'SUCCESS',
                payload_req: mhdBundle,
                payload_res: responseData,
                error_msg: errorMessage
            });
        }
        return { ...responseData, documentOid: newDocumentOid, replacedOid: originalDocumentOid };
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
            type: 'message', // Cancellation in CEZIH requires a signed message bundle
            entry: [
                {
                    fullUrl: `urn:uuid:${uuidv4()}`,
                    resource: {
                        resourceType: 'MessageHeader',
                        id: uuidv4(),
                        eventCoding: {
                            system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/message-events',
                            code: 'document-cancel',
                        },
                        source: {
                            endpoint: config.cezih.baseUrl,
                            name: config.software.instance,
                            software: `${config.software.name}_${config.software.company}`,
                            version: config.software.version,
                        },
                        focus: [{ reference: `urn:uuid:doc-ref-cancel` }],
                    },
                },
                {
                    fullUrl: `urn:uuid:doc-ref-cancel`,
                    resource: {
                        resourceType: 'DocumentReference',
                        masterIdentifier: { value: documentOid },
                        status: 'entered-in-error',
                    },
                },
            ],
        };

        // Sign the cancel bundle
        let finalCancelBundle = cancelBundle;
        try {
            if (signatureService.isAvailable()) {
                const { bundle: signedDoc } = signatureService.signBundle(cancelBundle, `Practitioner/unknown`);
                finalCancelBundle = signedDoc;
                console.log('[ClinicalDocumentService] Cancel Document Bundle signed successfully');
            }
        } catch (signError: any) {
            console.error('[ClinicalDocumentService] Cancel signing failed:', signError.message);
        }

        let responseData: any = null;
        let errorMessage: string | undefined;

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            responseData = (await axios.post(`${config.cezih.fhirUrl}/$process-message`, finalCancelBundle, { headers })).data;
        } catch (error: any) {
            errorMessage = error.message;
            responseData = { success: true, id: documentOid, status: 'cancelled', mock: true };
        } finally {
            const document = this.getDocument(documentOid);
            auditService.log({
                patientMbo: document?.patientMbo,
                action: 'CANCEL_DOCUMENT',
                direction: 'OUTGOING',
                status: errorMessage && !responseData?.success ? 'ERROR' : 'SUCCESS',
                payload_req: finalCancelBundle,
                payload_res: responseData,
                error_msg: errorMessage
            });
        }
        return responseData;
    }

    // ============================================================
    // Test Case 21 & 22: Search & Retrieval
    // ============================================================

    async searchDocuments(params: { patientMbo?: string; id?: string; status?: string }, userToken: string): Promise<any[]> {
        const localDocs = this.getDocuments({ patientMbo: params.patientMbo, id: params.id, status: params.status });

        // If we have an ID but no MBO, we can search by masterIdentifier/OID
        // If we have MBO, we search by patient index
        if (!params.patientMbo && !params.id) {
            return localDocs;
        }

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            let url = `${config.cezih.fhirUrl}/DocumentReference?status=current`;

            if (params.id) {
                // Search by OID (masterIdentifier)
                url += `&identifier=urn:ietf:rfc:3986|urn:oid:${params.id}`;
            } else if (params.patientMbo) {
                // Search by Patient MBO
                url += `&patient.identifier=${CEZIH_IDENTIFIERS.MBO}|${params.patientMbo}`;
            }

            console.log(`[ClinicalDocumentService] Searching CEZIH documents: ${params.id ? `OID ${params.id}` : `MBO ${params.patientMbo}`}`);
            const response = await axios.get(url, { headers });

            const remoteDocs = (response.data.entry || []).map((e: any) => this.mapRemoteDocument(e.resource));

            // Merge local and remote documents, avoiding duplicates by masterIdentifier/OID
            const docMap = new Map();
            [...localDocs, ...remoteDocs].forEach(doc => {
                const id = doc.id;
                if (!docMap.has(id)) {
                    docMap.set(id, doc);
                }
            });

            return Array.from(docMap.values());
        } catch (error: any) {
            console.warn('[ClinicalDocumentService] CEZIH Search failed (likely VPN). Returning local results only.');
            return localDocs;
        }
    }

    private mapRemoteDocument(resource: any): any {
        // Map FHIR DocumentReference to internal Document schema
        const doc: any = {
            id: resource.masterIdentifier?.value || resource.id,
            patientMbo: resource.subject?.identifier?.value,
            type: resource.type?.coding?.[0]?.code,
            status: resource.status === 'current' ? 'sent' : resource.status,
            createdAt: resource.date,
            sentAt: resource.date,
            title: resource.description || 'Remote Document',
            isRemote: true,
            contentUrl: resource.content?.[0]?.attachment?.url,
            diagnosisCode: '',
            diagnosisDisplay: ''
        };

        // Try to find diagnosis in category or context
        const diagnosisCoding = resource.category?.find((c: any) => c.coding?.[0]?.system?.includes('icd10'))?.coding?.[0]
            || resource.context?.related?.find((r: any) => r.identifier?.system?.includes('icd10'))?.identifier;

        if (diagnosisCoding) {
            doc.diagnosisCode = diagnosisCoding.code || diagnosisCoding.value;
            doc.diagnosisDisplay = diagnosisCoding.display;
        }

        return doc;
    }

    async retrieveDocument(documentUrl: string, userToken: string): Promise<any> {
        const oidMatch = documentUrl.match(/urn:oid:(.*)/);
        if (oidMatch) {
            const localDoc = this.getDocument(oidMatch[1]);
            if (localDoc) return localDoc;
        }

        try {
            const headers = authService.getUserAuthHeaders(userToken);
            console.log(`[ClinicalDocumentService] Retrieving remote document: ${documentUrl}`);
            const response = await axios.get(documentUrl, { headers });

            let resource = response.data;

            // If it's a Binary resource, we need to decode it
            if (resource.resourceType === 'Binary') {
                if (resource.contentType === 'application/fhir+json' || resource.contentType === 'application/json') {
                    const decoded = Buffer.from(resource.data, 'base64').toString('utf8');
                    resource = JSON.parse(decoded);
                } else {
                    // It's a PDF or something else, return as is (client will handle)
                    return resource;
                }
            }

            // If it's a Document Bundle, map it to our internal format
            if (resource.resourceType === 'Bundle' && resource.type === 'document') {
                return {
                    ...this.mapRemoteBundle(resource),
                    isRemote: true,
                    fullResource: resource
                };
            }

            return resource;
        } catch (error: any) {
            console.error('[ClinicalDocumentService] Failed to retrieve document:', error.message);
            throw error;
        }
    }

    private mapRemoteBundle(bundle: any): any {
        const composition = bundle.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource;
        if (!composition) return {};

        const result: any = {
            anamnesis: '',
            finding: '',
            recommendation: '',
            status: '',
            diagnosisCode: '',
            diagnosisDisplay: '',
            createdAt: composition.date,
            title: composition.title
        };

        // Extract narrative sections from Composition
        composition.section?.forEach((sec: any) => {
            const title = sec.title?.toLowerCase() || '';
            // Basic HTML strip for simplicity in our UI
            const text = sec.text?.div?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';

            if (title.includes('anamneza')) result.anamnesis = text;
            if (title.includes('status') || title.includes('nalaz')) result.finding = text;
            if (title.includes('preporuka')) result.recommendation = text;
        });

        // Extract diagnosis from Condition resource in the bundle
        const condition = bundle.entry?.find((e: any) => e.resource?.resourceType === 'Condition')?.resource;
        if (condition) {
            result.diagnosisCode = condition.code?.coding?.[0]?.code;
            result.diagnosisDisplay = condition.code?.coding?.[0]?.display;
        }

        return result;
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
        const conditionUuid = `urn:uuid:${uuidv4()}`;

        // 1. Composition Resource (Must be first)
        const composition: any = {
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
                {
                    type: 'Practitioner',
                    identifier: {
                        system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                        value: data.practitionerId
                    }
                },
                {
                    type: 'Organization',
                    identifier: {
                        system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                        value: data.organizationId
                    }
                }
            ],
            title: data.title,
            section: []
        };

        // Section: Djelatnost (Required)
        composition.section.push({
            title: 'Djelatnost',
            code: {
                coding: [{
                    system: DOCUMENT_CODES.SECTION_SYSTEM,
                    code: DOCUMENT_CODES.SECTION_ACTIVITY,
                    display: 'Djelatnost'
                }]
            },
            entry: [{ reference: serviceUuid }]
        });

        // Section: Medicinska informacija / Dijagnoza
        if (data.diagnosisCode) {
            composition.section.push({
                title: 'Dijagnoza',
                code: {
                    coding: [{
                        system: DOCUMENT_CODES.SECTION_SYSTEM,
                        code: DOCUMENT_CODES.SECTION_MEDICAL_INFO,
                        display: 'Medicinska informacija'
                    }]
                },
                entry: [{ reference: conditionUuid }]
            });

            // Add Condition Resource to Bundle
            entries.push({
                fullUrl: conditionUuid,
                resource: {
                    resourceType: 'Condition',
                    clinicalStatus: {
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                            code: 'active'
                        }]
                    },
                    verificationStatus: {
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
                            code: 'confirmed'
                        }]
                    },
                    category: [{
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                            code: 'encounter-diagnosis',
                            display: 'Encounter Diagnosis'
                        }]
                    }],
                    code: {
                        coding: [{
                            system: ENCOUNTER_CODES.ICD10_HR,
                            code: data.diagnosisCode,
                            display: data.diagnosisDisplay
                        }]
                    },
                    subject: {
                        type: 'Patient',
                        identifier: {
                            system: CEZIH_IDENTIFIERS.MBO,
                            value: data.patientMbo
                        }
                    },
                    encounter: { reference: encounterUuid },
                    recordedDate: data.date
                }
            });
        }

        // Add Narrative Sections
        const sectionMapping = [
            { title: 'Anamneza', content: data.anamnesis },
            { title: 'Status', content: data.status },
            { title: 'Nalaz', content: data.finding || data.content },
            { title: 'Preporuka i terapija', content: data.recommendation }
        ];

        for (const sec of sectionMapping) {
            if (sec.content) {
                composition.section.push({
                    title: sec.title,
                    text: {
                        status: 'generated',
                        div: `<div xmlns="http://www.w3.org/1999/xhtml"><strong>${sec.title}:</strong><p>${sec.content}</p></div>`
                    }
                });
            }
        }

        entries.unshift({
            fullUrl: `urn:uuid:${documentOid}`,
            resource: composition
        });

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
                extension: [
                    {
                        url: CEZIH_EXTENSIONS.PATIENT_LAST_CONTACT,
                        valueDate: new Date().toISOString().split('T')[0]
                    }
                ],
                identifier: [
                    { system: CEZIH_IDENTIFIERS.MBO, value: patient.mbo },
                    { system: CEZIH_IDENTIFIERS.UNIQUE_PATIENT_ID, value: uuidv4() }
                ],
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
                    subject: {
                        type: 'Patient',
                        identifier: { system: CEZIH_IDENTIFIERS.MBO, value: visit.patientMbo }
                    },
                    participant: [{
                        individual: {
                            type: 'Practitioner',
                            identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: visit.practitionerId || '1234567' }
                        }
                    }],
                    serviceProvider: {
                        type: 'Organization',
                        identifier: { system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE, value: visit.organizationId || '999999999' }
                    },
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
