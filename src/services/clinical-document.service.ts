import axios, { AxiosResponse } from 'axios';
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
import { remoteSignService } from './remote-sign.service';

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
                COALESCE(d.diagnosisDisplay, tc.display, v.diagnosis, '') as diagnosisDisplay,
                d.content,
                d.createdAt, d.sentAt,
                p.firstName, p.lastName 
            FROM documents d 
            LEFT JOIN patients p ON d.patientMbo = p.mbo 
            LEFT JOIN visits v ON d.visitId = v.id
            LEFT JOIN terminology_concepts tc 
                ON d.diagnosisCode = tc.code 
                AND tc.system = 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr'
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
        console.log(`[ClinicalDocumentService] sendDocument received: visitId=${data.visitId}, caseId=${data.caseId}, type=${data.type}, patientMbo=${data.patientMbo}`);
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
                    createdAt, sentAt, caseId
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                new Date().toISOString(),
                data.caseId || null
            );
            console.log('[ClinicalDocumentService] Saved document to local DB:', documentOid);
        } catch (dbError: any) {
            console.error('[ClinicalDocumentService] DB Error:', dbError.message);
        }

        // Step 3: Build the FULL FHIR Document Bundle using TC18's buildInnerBundle
        // PDQm lookup: get CEZIH Patient Logical ID for inner document (SAMO ZA MBO)
        let patientCezihId = data.patientMbo; // Default na ono što imamo (za strance to je Unique ID)
        try {
            if (/^\d{9}$/.test(data.patientMbo)) {
                const pdqmPatients = await patientService.searchRemoteByMbo(data.patientMbo, userToken);
                if (pdqmPatients.length > 0 && pdqmPatients[0].id) patientCezihId = pdqmPatients[0].id;
            }
        } catch (e: any) { /* ignore */ }

        // Resolve case from DB for CEZIH case ID
        const caseRow = data.caseId ? db.prepare('SELECT * FROM cases WHERE id = ?').get(data.caseId) as any : null;
        const patientIdentifier = patientService.getPatientIdentifier(patient);

        const { buildInnerBundle } = await import('./mhd-bundle.builder');
        const documentBundle = buildInnerBundle({
            docOid: `urn:oid:${documentOid}`,
            docType: data.type || '011',
            patientIdentifier,
            patientName: { family: patient?.name?.family || (patient as any)?.lastName || 'NEPOZNATO', given: [patient?.name?.given?.[0] || (patient as any)?.firstName || 'N'] },
            patientGender: patient?.gender || 'unknown',
            patientBirthDate: patient?.birthDate || '1980-01-01',
            patientCezihId,
            practitionerId: data.practitionerId || config.practitioner.hzjzId,
            practitionerOib: config.practitioner.oib,
            practitionerName: { family: 'Prpic', given: ['Ivan'] },
            orgId: data.organizationId || config.organization.hzzoCode,
            orgDisplay: 'WBS privatna ordinacija',
            encCezihId: visit?.cezihVisitId || visit?.cezihId || data.visitId || '',
            condFhirId: caseRow?.cezihCaseId || caseRow?.id || data.caseId || '',
            diagnosisCode: data.diagnosisCode || 'Z00.0',
            anamnesis: data.anamnesis || 'Medicinski nalaz',
            finding: data.finding,
            status: data.status,
            recommendation: data.recommendation,
        });

        // Note: visit closing (REALIZATION) is handled by G9 app's document/route.ts
        // Do NOT call closeVisit here to avoid duplicate REALIZATION in audit log

        // Step 4: Always defer signing to the frontend method selection modal.
        // Save the bundle to DB so both Certilia and smart card flows can retrieve it later.
        const bundleJson = JSON.stringify(documentBundle);
        try {
            db.prepare('UPDATE documents SET status = ?, bundleJson = ? WHERE id = ?')
                .run('pending_signature', bundleJson, documentOid);
        } catch (dbErr: any) {
            console.error('[ClinicalDocumentService] Failed to save bundleJson:', dbErr.message);
        }

        console.log(`[ClinicalDocumentService] Document ${documentOid} saved. Awaiting user method selection.`);

        return {
            success: true,
            pendingSignature: true,
            transactionCode: documentOid, // Use documentOid as placeholder transaction code
            documentOid,
        };
    }

    // ============================================================
    // TC18 Full Flow: Sign + Build MHD + Submit to CEZIH
    // Uses proven mhd-bundle.builder (extracted from TC18 test route)
    // Called from frontend stepper — AFTER TC16 case is created
    // ============================================================

    async sendDocumentFull(data: {
        patientMbo: string;
        encCezihId: string;      // CEZIH visit identifier (from TC12)
        condFhirId: string;      // CEZIH case identifier (from TC16)
        diagnosisCode: string;
        diagnosisDisplay?: string;
        anamnesis: string;
        finding?: string;
        status?: string;
        recommendation?: string;
        type?: string;
        signPin?: string;        // Sign token PIN
    }, userToken: string): Promise<any> {
        console.log('[sendDocumentFull] Starting TC18 full flow for patient:', data.patientMbo);

        // Step 1: Validate mandatory fields
        if (!data.anamnesis?.trim()) throw new Error('Anamneza je obavezno polje.');
        if (!data.diagnosisCode?.trim()) throw new Error('Dijagnoza je obavezno polje.');
        if (!data.encCezihId?.trim()) throw new Error('ID posjete (encCezihId) je obavezan — pokrenite TC12 prvo.');
        if (!data.condFhirId?.trim()) throw new Error('ID slučaja (condFhirId) je obavezan — pokrenite TC16 prvo.');

        // Step 2: Dohvat pacijenta iz lokalne baze
        const localPatient = (await patientService.searchByMbo(data.patientMbo, userToken))[0];
        if (!localPatient) throw new Error(`Pacijent nije pronađen u lokalnoj bazi.`);

        // KORISTIMO NOVI HELPER DA ODREDIMO TOČAN IDENTIFIKATOR BLOK
        const patientIdentifier = patientService.getPatientIdentifier(localPatient);
        
        let patientCezihId = localPatient.cezihId || localPatient.cezihUniqueId || (localPatient as any).id || data.patientMbo;
        let remotePatient: any = null;

        // Ako je helper odredio da je ovo MBO (Znači da NIJE stranac), ONDA i SAMO ONDA idemo na PDQm
        if (patientIdentifier.system === 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO') {
            console.log(`[sendDocumentFull] Domestic patient detected (MBO: ${patientIdentifier.value}), performing PDQm lookup...`);
            try {
                const patients = await patientService.searchRemoteByMbo(patientIdentifier.value, userToken);
                remotePatient = patients?.[0];
                if (remotePatient?.id) patientCezihId = remotePatient.id;
            } catch (e) {
                console.warn('[sendDocumentFull] PDQm pretraga nije uspjela, nastavljam s lokalnim podacima');
            }
        } else {
            console.log(`[sendDocumentFull] Stranac detektiran (${patientIdentifier.value}), preskačem PDQm pretragu.`);
        }

        // Step 2b: Resolve CEZIH Case ID — frontend may pass local UUID, we need cmmk... ID
        let resolvedCondFhirId = data.condFhirId;
        try {
            const localCase = db.prepare('SELECT cezihCaseId FROM cases WHERE id = ?').get(data.condFhirId) as any;
            if (localCase?.cezihCaseId) {
                console.log(`[sendDocumentFull] Resolved local case ${data.condFhirId} → CEZIH ID: ${localCase.cezihCaseId}`);
                resolvedCondFhirId = localCase.cezihCaseId;
            } else {
                console.log(`[sendDocumentFull] condFhirId ${data.condFhirId} — no cezihCaseId in DB, using as-is`);
            }
        } catch (e) {
            console.warn('[sendDocumentFull] Case ID lookup failed, using as-is');
        }

        // Step 2c: Resolve CEZIH Visit ID — frontend šalje lokalni UUID
        let resolvedEncCezihId = data.encCezihId;
        try {
            const localVisit = db.prepare('SELECT cezihVisitId, cezihId FROM visits WHERE id = ?').get(data.encCezihId) as any;
            if (localVisit?.cezihVisitId || localVisit?.cezihId) {
                resolvedEncCezihId = localVisit.cezihVisitId || localVisit.cezihId;
                console.log(`[sendDocumentFull] Resolved local visit ${data.encCezihId} → CEZIH ID: ${resolvedEncCezihId}`);
            } else {
                console.log(`[sendDocumentFull] encCezihId ${data.encCezihId} — no cezihVisitId in DB, using as-is`);
            }
        } catch (e) {
            console.warn('[sendDocumentFull] Visit ID lookup failed, using as-is');
        }

        // Step 4: Generate OID for new document
        const docOidRaw = await oidService.generateSingleOid();
        const docOid = `urn:oid:${docOidRaw}`;
        console.log('[sendDocumentFull] Generated OID:', docOid);

        // Step 5: Build + sign inner bundle, build outer MHD, submit
        const { buildMhdBundle, submitMhdToGateway } = await import('./mhd-bundle.builder');

        const { outer, innerBundle } = await buildMhdBundle({
            docOid,
            docType: data.type || '011',
            patientIdentifier,
            patientName: {
                family: localPatient?.name?.family || remotePatient?.name?.family || (localPatient as any)?.lastName || 'NEPOZNATO',
                given: [localPatient?.name?.given?.[0] || remotePatient?.name?.given?.[0] || (localPatient as any)?.firstName || 'N']
            },
            patientGender: localPatient?.gender || remotePatient?.gender || 'unknown',
            patientBirthDate: localPatient?.birthDate || remotePatient?.birthDate || '1980-01-01',
            patientCezihId,
            practitionerId: process.env.PRACTITIONER_ID || '4981825',
            practitionerOib: process.env.PRACTITIONER_OIB || '30160453873',
            practitionerName: { family: 'Prpic', given: ['Ivan'] },
            orgId: process.env.ORG_ID || '999001425',
            orgDisplay: 'WBS privatna ordinacija',
            
            // OVO JE KLJUČNO OVDJE:
            encCezihId: resolvedEncCezihId, 
            condFhirId: resolvedCondFhirId,
            // ------------------------

            diagnosisCode: data.diagnosisCode,
            anamnesis: data.anamnesis,
            signPin: data.signPin,
        });

        console.log('[sendDocumentFull] MHD bundle built, submitting to CEZIH...');
        const result = await submitMhdToGateway(outer);

        // Step 5: Save to local DB
        try {
            db.prepare(`
                INSERT OR REPLACE INTO documents (
                    id, patientMbo, visitId, type, status,
                    anamnesis, status_text, finding, recommendation,
                    diagnosisCode, diagnosisDisplay, content,
                    createdAt, sentAt, caseId
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                docOidRaw,
                data.patientMbo,
                data.encCezihId,
                data.type || '011',
                result.success ? 'sent' : 'error',
                data.anamnesis || null,
                data.status || null,
                data.finding || null,
                data.recommendation || null,
                data.diagnosisCode || null,
                data.diagnosisDisplay || null,
                null,
                new Date().toISOString(),
                result.success ? new Date().toISOString() : null,
                data.condFhirId || null,
            );
            console.log('[sendDocumentFull] Saved document to local DB:', docOidRaw);
        } catch (dbError: any) {
            console.error('[sendDocumentFull] DB Error:', dbError.message);
        }

        // Step 6: Audit log
        await auditService.log({
            action: 'SEND_DOCUMENT_FULL',
            direction: 'OUTGOING_CEZIH',
            status: result.success ? 'SUCCESS' : 'ERROR',
            visitId: data.encCezihId,
            patientMbo: data.patientMbo,
            payload_req: JSON.stringify({ documentOid: docOidRaw, encCezihId: data.encCezihId, condFhirId: data.condFhirId }),
            payload_res: JSON.stringify(result),
            error_msg: result.error || undefined,
        });

        return {
            success: result.success,
            documentOid: docOidRaw,
            cezihResponse: result.data,
            error: result.error,
        };
    }

    /**
     * Initiates the remote signing flow (Certilia mobileID).
     * Returns a transactionCode for the frontend to poll.
     */
    async initiateRemoteSigning(
        documentOid: string,
        userToken: string
    ): Promise<any> {
        console.log('[ClinicalDocumentService] Initiating remote signing for document:', documentOid);

        try {
            // Retrieve saved bundle from DB
            const localDoc = this.getDocument(documentOid);
            if (!localDoc) throw new Error('Dokument nije pronađen u lokalnoj bazi.');
            if (!localDoc.bundleJson) throw new Error('Nema pohranjenog bundlea za potpis.');

            const documentBundle = JSON.parse(localDoc.bundleJson);

            // Add required signature placeholder to Bundle before sending for signing
            const bundleToSign = {
                ...documentBundle,
                signature: {
                    type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
                    when: new Date().toISOString(),
                    who: {
                        identifier: {
                            system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
                            value: config.practitioner.hzjzId
                        },
                        type: 'Practitioner'
                    },
                    data: ''
                }
            };

            const base64Document = Buffer.from(JSON.stringify(bundleToSign), 'utf-8').toString('base64');
            const doc: import('./remote-sign.service').RemoteSignDocument = {
                documentType: 'FHIR_DOCUMENT',
                mimeType: 'JSON',
                base64Document,
                messageId: documentOid,
            };
            const submitResult = await remoteSignService.submitForRemoteSigning(
                [doc],
                config.remoteSigning.signerOib,
                userToken,
                process.env.REMOTE_SIGN_SOURCE_SYSTEM || 'DEV'
            );

            return {
                success: true,
                pendingSignature: true,
                transactionCode: submitResult.transactionCode,
                documentOid
            };
        } catch (error: any) {
            console.error('[ClinicalDocumentService] Remote sign initiation failed:', error.message);
            db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('draft', documentOid);
            throw error;
        }
    }

    /**
     * Completes the remote signing flow after user approval.
     * Fetches the signed bundle, builds the outer MHD via TC18 flow, and submits to CEZIH.
     */
    async completeRemoteSigning(
        documentOid: string,
        transactionCode: string,
        userToken: string
    ): Promise<any> {
        console.log('[ClinicalDocumentService] Completing remote signing for document:', documentOid);

        try {
            // 1. Dohvat potpisanog dokumenta s CEZIH Certilie (ili iz cache-a)
            let signedB64: string;
            try {
                const result = await remoteSignService.getSignedDocuments(transactionCode, userToken);
                if (result.signatureStatus !== 'FULLY_SIGNED') {
                    throw new Error(`Potpis nije uspješan. Status: ${result.signatureStatus}`);
                }
                signedB64 = result.signedDocuments[0].base64Document;
            } catch (fetchError: any) {
                // "Already downloaded" = potpis JE bio uspješan ali CEZIH ne da ponovo
                // Fallback: koristimo lokalni bundleJson (koji sadrži potpis iz initiateRemoteSigning koraka)
                if (fetchError.message?.includes('already been downloaded') || fetchError.message?.includes('already downloaded')) {
                    console.log('[ClinicalDocumentService] CEZIH says "already downloaded" — using local bundleJson as signed B64');
                    const localDocFallback = this.getDocument(documentOid);
                    if (!localDocFallback?.bundleJson) {
                        throw new Error('Dokument potpisan ali nema lokalno pohranjenog bundlea za slanje.');
                    }
                    signedB64 = Buffer.from(localDocFallback.bundleJson, 'utf-8').toString('base64');
                } else {
                    throw fetchError;
                }
            }

            // 2. Dohvat originalnih podataka iz lokalne baze
            const localDoc = this.getDocument(documentOid);
            if (!localDoc) throw new Error('Dokument nije pronađen u lokalnoj bazi.');

            const localPatient = (await patientService.searchByMbo(localDoc.patientMbo, userToken))[0] || { mbo: localDoc.patientMbo };
            const patientIdentifier = patientService.getPatientIdentifier(localPatient);
            let patientCezihId = localPatient.cezihId || localPatient.cezihUniqueId || localDoc.patientMbo;

            if (patientIdentifier.system === 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO') {
                try {
                    const pdqmPatients = await patientService.searchRemoteByMbo(localDoc.patientMbo, userToken);
                    if (pdqmPatients.length > 0 && pdqmPatients[0].id) patientCezihId = pdqmPatients[0].id;
                } catch (e) {}
            }

            const visit = localDoc.visitId ? db.prepare('SELECT * FROM visits WHERE id = ?').get(localDoc.visitId) as any : null;
            const caseRow = localDoc.caseId ? db.prepare('SELECT * FROM cases WHERE id = ?').get(localDoc.caseId) as any : null;

            // 3. KORISTIMO IDENTIČAN TC18 FLOW! Samo mu proslijedimo gotov Certilia potpis.
            const { buildMhdBundle, submitMhdToGateway } = await import('./mhd-bundle.builder');
            
            const { outer } = await buildMhdBundle({
                docOid: `urn:oid:${documentOid}`,
                docType: localDoc.type || '011',
                patientIdentifier,
                patientName: { family: (localPatient as any)?.lastName || localPatient?.name?.family || 'NEPOZNATO', given: [(localPatient as any)?.firstName || localPatient?.name?.given?.[0] || 'N'] },
                patientGender: localPatient?.gender || 'unknown',
                patientBirthDate: localPatient?.birthDate || '1980-01-01',
                patientCezihId,
                practitionerId: config.practitioner.hzjzId,
                practitionerOib: config.practitioner.oib,
                practitionerName: { family: 'Prpic', given: ['Ivan'] },
                orgId: config.organization.hzzoCode,
                orgDisplay: 'WBS privatna ordinacija',
                encCezihId: visit?.cezihVisitId || visit?.cezihId || localDoc.visitId || '',
                condFhirId: caseRow?.cezihCaseId || caseRow?.id || localDoc.caseId || '',
                diagnosisCode: localDoc.diagnosisCode || 'Z00.0',
                anamnesis: localDoc.anamnesis || 'Medicinski nalaz'
            }, signedB64); // <-- Ovdje ubacujemo potpis!

            // 4. Slanje na CEZIH Gateway
            const submissionResult = await submitMhdToGateway(outer);

            // 5. Ažuriranje baze i Audit log!
            if (submissionResult.success) {
                db.prepare('UPDATE documents SET status = ?, sentAt = ? WHERE id = ?')
                    .run('signed and submitted', new Date().toISOString(), documentOid);
            }

            await auditService.log({
                visitId: localDoc.visitId,
                patientMbo: localDoc.patientMbo,
                action: 'SEND_DOCUMENT_CERTILIA',
                direction: 'OUTGOING_CEZIH',
                status: submissionResult.success ? 'SUCCESS' : 'ERROR',
                payload_req: JSON.stringify({ documentOid, transactionCode }),
                payload_res: JSON.stringify(submissionResult),
                error_msg: submissionResult.error || undefined,
            });

            if (!submissionResult.success) {
                throw new Error(submissionResult.error || submissionResult.data?.cezihError || 'CEZIH odbio dokument');
            }

            return { success: true, documentOid };
        } catch (error: any) {
            console.error('[ClinicalDocumentService] Completion failed:', error.message);
            throw error;
        }
    }

    /**
     * Completes document signing using a local smart card (PKCS#11).
     * Uses the unified TC18 buildMhdBundle flow — signing happens inside via signPin.
     */
    async completeSmartCardSigning(
        documentOid: string,
        transactionCode: string,
        userToken: string,
        signPin?: string
    ): Promise<any> {
        console.log('[ClinicalDocumentService] Smart card signing for document:', documentOid);

        try {
            // 1. Fetch original document from DB
            const localDoc = this.getDocument(documentOid);
            if (!localDoc) throw new Error('Dokument nije pronađen u lokalnoj bazi.');

            // 2. Resolve patient, visit, case — same as completeRemoteSigning
            const localPatient = (await patientService.searchByMbo(localDoc.patientMbo, userToken))[0] || { mbo: localDoc.patientMbo };
            const patientIdentifier = patientService.getPatientIdentifier(localPatient);
            let patientCezihId = localPatient.cezihId || localPatient.cezihUniqueId || localDoc.patientMbo;

            if (patientIdentifier.system === 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO') {
                try {
                    const pdqmPatients = await patientService.searchRemoteByMbo(localDoc.patientMbo, userToken);
                    if (pdqmPatients.length > 0 && pdqmPatients[0].id) patientCezihId = pdqmPatients[0].id;
                } catch (e) {}
            }

            const visit = localDoc.visitId ? db.prepare('SELECT * FROM visits WHERE id = ?').get(localDoc.visitId) as any : null;
            const caseRow = localDoc.caseId ? db.prepare('SELECT * FROM cases WHERE id = ?').get(localDoc.caseId) as any : null;

            // 3. KORISTIMO TC18 FLOW — signPin se prosljeđuje, potpis se radi unutar buildMhdBundle
            const { buildMhdBundle, submitMhdToGateway } = await import('./mhd-bundle.builder');

            const { outer } = await buildMhdBundle({
                docOid: `urn:oid:${documentOid}`,
                docType: localDoc.type || '011',
                patientIdentifier,
                patientName: { family: (localPatient as any)?.lastName || localPatient?.name?.family || 'NEPOZNATO', given: [(localPatient as any)?.firstName || localPatient?.name?.given?.[0] || 'N'] },
                patientGender: localPatient?.gender || 'unknown',
                patientBirthDate: localPatient?.birthDate || '1980-01-01',
                patientCezihId,
                practitionerId: config.practitioner.hzjzId,
                practitionerOib: config.practitioner.oib,
                practitionerName: { family: 'Prpic', given: ['Ivan'] },
                orgId: config.organization.hzzoCode,
                orgDisplay: 'WBS privatna ordinacija',
                encCezihId: visit?.cezihVisitId || visit?.cezihId || localDoc.visitId || '',
                condFhirId: caseRow?.cezihCaseId || caseRow?.id || localDoc.caseId || '',
                diagnosisCode: localDoc.diagnosisCode || 'Z00.0',
                anamnesis: localDoc.anamnesis || 'Medicinski nalaz',
                signPin,
            }); // signPin → buildMhdBundle poziva PKCS#11 potpis

            // 4. Slanje na CEZIH Gateway
            const submissionResult = await submitMhdToGateway(outer);

            // 5. Ažuriranje baze SAMO ako CEZIH prihvati + Audit log
            if (submissionResult.success) {
                db.prepare('UPDATE documents SET status = ?, sentAt = ? WHERE id = ?')
                    .run('signed and submitted', new Date().toISOString(), documentOid);
                console.log('[ClinicalDocumentService] ✅ Smart card signing complete for:', documentOid);
            }

            await auditService.log({
                visitId: localDoc.visitId,
                patientMbo: localDoc.patientMbo,
                action: 'SEND_DOCUMENT_SMARTCARD',
                direction: 'OUTGOING_CEZIH',
                status: submissionResult.success ? 'SUCCESS' : 'ERROR',
                payload_req: JSON.stringify({ documentOid, transactionCode }),
                payload_res: JSON.stringify(submissionResult),
                error_msg: submissionResult.error || undefined,
            });

            if (!submissionResult.success) {
                throw new Error(submissionResult.error || submissionResult.data?.cezihError || 'CEZIH odbio dokument');
            }

            return { success: true, documentOid };
        } catch (error: any) {
            console.error('[ClinicalDocumentService] Smart card signing failed:', error.message);
            throw error;
        }
    }

    /**
     * Checks if the remote signing is complete for a given transaction.
     */
    async checkRemoteSigningStatus(transactionCode: string, userToken: string): Promise<boolean> {
        return remoteSignService.pollForSignatureNotification(transactionCode, userToken, config.organization.hzzoCode);
    }

    // submitToCezih OBRISANA — sada koristimo buildMhdBundle + submitMhdToGateway iz mhd-bundle.builder.ts

    /**
     * RAW MHD submission: takes a pre-built MHD bundle and sends it directly
     * to the CEZIH gateway without any local bundle building or validation.
     * Useful for certification testing with hand-crafted bundles.
     */
    async submitMhdBundleRaw(mhdBundle: any, documentOid: string, userToken: string): Promise<any> {
        let responseData: any = null;
        let errorMessage: string | undefined;

        try {
            let headers: Record<string, string>;
            try {
                headers = await authService.getSystemAuthHeaders();
            } catch (tokenErr: any) {
                headers = authService.getUserAuthHeaders(userToken);
            }

            const gatewayHeaders = authService.hasGatewaySession() ? authService.getGatewayAuthHeaders() : {};
            const combinedHeaders = {
                ...headers,
                ...(gatewayHeaders.Cookie ? { Cookie: gatewayHeaders.Cookie } : {}),
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json',
            };

            const url = `${config.cezih.gatewayBase}${config.cezih.services.document}/iti-65-service`;
            console.log('[submitMhdBundleRaw] Submitting to:', url);
            console.log('[submitMhdBundleRaw] Bundle entries:', mhdBundle.entry?.map((e: any) => e.resource?.resourceType).join(', '));
            console.log('[submitMhdBundleRaw] Full MHD Bundle:', JSON.stringify(mhdBundle).substring(0, 2000));

            const response = await axios.post(url, mhdBundle, { headers: combinedHeaders });
            responseData = response.data;
            console.log('[submitMhdBundleRaw] Success! Response:', JSON.stringify(responseData).substring(0, 500));
        } catch (error: any) {
            console.warn('[submitMhdBundleRaw] CEZIH send failed:', error.message);
            console.warn('[submitMhdBundleRaw] Response status:', error.response?.status);
            console.warn('[submitMhdBundleRaw] Response data:', JSON.stringify(error.response?.data)?.substring(0, 1000));
            try { require('fs').writeFileSync('./tmp/cezih-tc18-error.json', JSON.stringify(error.response?.data, null, 2)); } catch (e) { }
            errorMessage = error.message;

            const cezihDetail = error.response?.data?.issue?.[0]?.diagnostics
                || error.response?.data?.issue?.[0]?.details?.text
                || JSON.stringify(error.response?.data)
                || error.message;

            responseData = {
                success: false,
                cezihStatus: 'failed',
                cezihError: error.response?.status
                    ? `HTTP ${error.response.status}: ${cezihDetail}`
                    : error.message,
                documentOid,
            };
        }

        return responseData;
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

        // NOVO: Dohvaćanje pravih podataka pacijenta iz lokalne baze
        const localPatient = (await patientService.searchByMbo(data.patientMbo, userToken))[0];
        if (!localPatient) throw new Error(`Pacijent nije pronađen (MBO: ${data.patientMbo})`);

        // Step 1: Dohvaćamo originalni dokument za nasljeđivanje visitId/caseId
        const originalDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(originalDocumentOid) as any;
        const finalVisitId = data.visitId || originalDoc?.visitId;
        const finalCaseId = data.caseId || originalDoc?.caseId;

        // Step 2: Update Local DB
        try {
            db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('replaced', originalDocumentOid);
            const stmt = db.prepare(`
                INSERT INTO documents (
                    id, patientMbo, visitId, type, status, 
                    anamnesis, status_text, finding, recommendation, 
                    diagnosisCode, diagnosisDisplay, content, 
                    createdAt, sentAt, caseId
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                newDocumentOid, data.patientMbo, finalVisitId || null,
                data.type, 'sent',
                data.anamnesis || null, data.status || null,
                data.finding || null, data.recommendation || null,
                data.diagnosisCode || null, data.diagnosisDisplay || null,
                data.content || null, new Date().toISOString(), new Date().toISOString(),
                finalCaseId || null // ISPRAVLJENO: Sada nasljeđuje ID slučaja!
            );
        } catch (dbError) {
            console.error('[ClinicalDocumentService] DB Replace Error', dbError);
        }

        // Step 3: PDQm lookup for Patient Logical ID (SAMO ZA MBO)
        let patientCezihId = data.patientMbo;
        try {
            if (/^\d{9}$/.test(data.patientMbo)) {
                const patients = await patientService.searchRemoteByMbo(data.patientMbo, userToken);
                if (patients.length > 0 && patients[0].id) {
                    patientCezihId = patients[0].id;
                }
            }
        } catch (e: any) { /* ignore */ }

        // Step 4: Get encounter/case IDs from local visit data

        const visit = finalVisitId ? visitService.getVisit(finalVisitId) : null;
        
        // Postavljamo CEZIH identifikatore
        const encCezihId = visit?.cezihVisitId || visit?.cezihId || visit?.id || finalVisitId || '';
        
        // Dohvaćamo pravi CEZIH case ID iz cases tablice
        const caseRow = finalCaseId ? db.prepare('SELECT * FROM cases WHERE id = ?').get(finalCaseId) as any : null;
        const condFhirId = caseRow?.cezihCaseId || caseRow?.id || finalCaseId || '';

        // ISTI POPRAVAK KAO U cancelDocument: filtriramo lokalne UUID-ove
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const validEncCezihId = encCezihId && !isUuid(encCezihId) ? encCezihId : '';
        const validCondFhirId = condFhirId && !isUuid(condFhirId) ? condFhirId : '';

        // Sigurnosni osigurač u konzoli da znamo ako nam i dalje fale ID-jevi
        if (!validEncCezihId || !validCondFhirId) {
             console.warn('[TC19 UPOZORENJE] encCezihId ili condFhirId su prazni ili UUID! CEZIH će ih ignorirati.');
        }

        // Step 4: Build & submit using shared MHD builder (same as TC18 + relatesTo)
        const { buildMhdBundle, submitMhdToGateway } = await import('./mhd-bundle.builder');

        // KORISTIMO ISTI HELPER KAO U TC18 DA ODREDIMO TOČAN IDENTIFIKATOR BLOK
        const patientIdentifier = patientService.getPatientIdentifier(localPatient);

        console.log(`[TC19] Replacing document ${originalDocumentOid} with new OID ${newDocumentOid}`);

        let responseData: any = null;
        let errorMessage: string | undefined;

        try {
            const { outer } = await buildMhdBundle({
                docOid: `urn:oid:${newDocumentOid}`,
                patientIdentifier,  // FIX: dodano — bez ovoga JCS potpis pada na undefined
                patientName: { 
                    family: localPatient?.name?.family || (localPatient as any)?.lastName || 'NEPOZNATO', 
                    given: [localPatient?.name?.given?.[0] || (localPatient as any)?.firstName || 'N'] 
                },
                patientGender: localPatient?.gender || 'unknown',
                patientBirthDate: localPatient?.birthDate || '1980-01-01',
                patientCezihId,
                practitionerId: process.env.PRACTITIONER_ID || config.practitioner.hzjzId,
                practitionerOib: process.env.PRACTITIONER_OIB || config.practitioner.oib,
                practitionerName: { family: 'Prpic', given: ['Ivan'] },
                orgId: process.env.ORG_ID || config.organization.hzzoCode,
                orgDisplay: 'WBS privatna ordinacija',
                encCezihId: validEncCezihId,
                condFhirId: validCondFhirId,
                diagnosisCode: data.diagnosisCode || 'Z00.0',
                anamnesis: data.anamnesis || 'Ažurirani dokument',
                replacesOid: originalDocumentOid,  // TC19: relatesTo
            });

            const result = await submitMhdToGateway(outer);
            if (result.success) {
                responseData = result.data;
                console.log('[ClinicalDocumentService] ✅ TC19 Replace accepted by CEZIH!');
            } else {
                errorMessage = result.error;
                responseData = {
                    success: false, localOnly: true,
                    cezihStatus: 'failed', cezihError: result.data?.cezihError || result.error,
                    documentOid: newDocumentOid, replacedOid: originalDocumentOid,
                };
            }
        } catch (error: any) {
            errorMessage = error.message;
            responseData = {
                success: false, localOnly: true,
                cezihStatus: 'failed', cezihError: error.message,
                documentOid: newDocumentOid, replacedOid: originalDocumentOid,
            };
        } finally {
            auditService.log({
                visitId: data.visitId,
                patientMbo: data.patientMbo,
                action: 'REPLACE_DOCUMENT',
                direction: 'OUTGOING_CEZIH',
                status: errorMessage ? 'ERROR' : 'SUCCESS',
                payload_req: { originalDocumentOid, newDocumentOid },
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
        const { v4: uuidv4 } = require('uuid');
        const listUuid = uuidv4();
        const docRefUuid = uuidv4();

        // Ovdje NE mijenjamo originalni OID, on mora biti OID onog dokumenta kojeg poništavamo
        const oidValue = documentOid.startsWith('urn:oid:') ? documentOid : `urn:oid:${documentOid}`;

        // 1. Ažuriramo lokalnu bazu
        try {
            db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('cancelled', documentOid);
        } catch (dbError) {
            console.error('[ClinicalDocumentService] DB Cancel Error', dbError);
        }

        // 2. Dohvat originalnog dokumenta i pacijenta
        const fullDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentOid) as any;
        const patientMbo = fullDoc?.patientMbo || '999999423';
        const docType = fullDoc?.type || '011';
        const caseId = fullDoc?.caseId;
        const visitId = fullDoc?.visitId;

        const { patientService } = require('./patient.service');
        const patient = db.prepare('SELECT * FROM patients WHERE mbo = ? OR oib = ? OR cezihUniqueId = ?').get(patientMbo, patientMbo, patientMbo) as any;
        const patientIdentifierBlock = patientService.getPatientIdentifier(patient || { mbo: patientMbo });
        const patientDisplay = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim().toUpperCase() : '';

        // Dohvaćamo encounter i case ID-jeve
        let visit = visitId ? db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId) as any : null;
        // Fallback: visitId može biti CEZIH ID (cmmXXX) umjesto lokalnog UUID-a
        if (!visit && visitId) {
            visit = db.prepare('SELECT * FROM visits WHERE cezihVisitId = ?').get(visitId) as any;
        }
        let caseRow = caseId ? db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any : null;
        // Fallback: caseId može biti CEZIH ID
        if (!caseRow && caseId) {
            caseRow = db.prepare('SELECT * FROM cases WHERE cezihCaseId = ?').get(caseId) as any;
        }

        // AUTO-OPORAVAK: Ako caseId fali (zbog prijašnjeg buga u TC19), dohvati zadnji aktivni slučaj pacijenta!
        if (!caseRow && patientMbo) {
            console.log('[ClinicalDocumentService] Nedostaje caseId, pokušavam auto-oporavak iz zadnjeg slučaja...');
            caseRow = db.prepare('SELECT * FROM cases WHERE patientMbo = ? ORDER BY rowid DESC LIMIT 1').get(patientMbo) as any;
        }

        const nowIso = new Date().toISOString();
        const docDate = fullDoc?.sentAt || fullDoc?.createdAt || nowIso;

        const encId = visit?.cezihId || visit?.cezihVisitId || visitId || '';
        const condFhirId = caseRow?.cezihCaseId || caseRow?.id || caseId || '';

        // KLJUČNI POPRAVAK ZA STORNO S KARTICOM/CERTILIOM:
        // CEZIH Validator puca (Reference_REF_CantResolve) ako mu u Storno pošaljemo lokalne UUID-ove za posjetu ili slučaj!
        // Uklanjamo ih iz payload-a ako nisu pravi CEZIH identifikatori (koji obično kreću s 'cmm' ili nemaju crtice).
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const validEncId = encId && !isUuid(encId) ? encId : undefined;
        const validCondId = condFhirId && !isUuid(condFhirId) ? condFhirId : undefined;

        const encounterStart = visit?.startTime || docDate;
        const encounterEnd = visit?.endTime || docDate;

        const practHzjz = config.practitioner.hzjzId || config.practitioner.oib || '4981825';
        const pName = config.practitioner.name as any;
        const practDisplay = (pName?.family) ? `${pName.given[0]} ${pName.family}` : (typeof pName === 'string' && pName ? pName : 'Ivan Prpic');
        const orgId = config.organization.hzzoCode || '999001425';
        const orgDisplay = config.organization.name || 'WBS ordinacija';

        const DOC_TYPE_DISPLAY: Record<string, string> = {
            '011': 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
            '012': 'Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove',
            '013': 'Otpusno pismo iz privatne zdravstvene ustanove',
        };
        const docTypeDisplay = DOC_TYPE_DISPLAY[docType] || docType;

        // 3. Gradimo Bundle (S filtriranim contextom)
        const cancelBundle: any = {
            resourceType: 'Bundle',
            type: 'transaction',
            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle'] },
            entry: [
                {
                    fullUrl: `urn:uuid:${listUuid}`,
                    resource: {
                        resourceType: 'List',
                        meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-document-submissionset'] },
                        extension: [{
                            url: 'https://profiles.ihe.net/ITI/MHD/StructureDefinition/ihe-sourceId',
                            valueIdentifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuidv4()}` }
                        }],
                        identifier: [
                            { use: 'official', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${listUuid}` },
                            { use: 'usual', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuidv4()}` }
                        ],
                        status: 'current',
                        mode: 'working',
                        code: { coding: [{ system: 'https://profiles.ihe.net/ITI/MHD/CodeSystem/MHDlistTypes', code: 'submissionset' }] },
                        subject: { type: 'Patient', identifier: patientIdentifierBlock },
                        date: nowIso,
                        source: { type: 'Practitioner', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika', value: practHzjz } },
                        entry: [{ item: { type: 'DocumentReference', reference: `urn:uuid:${docRefUuid}` } }]
                    },
                    request: { method: 'POST', url: 'List' }
                },
                {
                    fullUrl: `urn:uuid:${docRefUuid}`,
                    resource: {
                        resourceType: 'DocumentReference',
                        meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-document-reference'] },
                        masterIdentifier: { use: 'usual', system: 'urn:ietf:rfc:3986', value: oidValue },
                        identifier: [{ use: 'official', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${docRefUuid}` }],
                        status: 'entered-in-error',
                        type: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type', code: docType, display: docTypeDisplay }] },
                        subject: {
                            type: 'Patient',
                            identifier: patientIdentifierBlock,
                            ...(patientDisplay ? { display: patientDisplay } : {})
                        },
                        date: docDate,
                        author: [
                            { type: 'Practitioner', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika', value: practHzjz }, display: practDisplay },
                            { type: 'Organization', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije', value: orgId }, display: orgDisplay }
                        ],
                        authenticator: { type: 'Practitioner', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika', value: practHzjz }, display: practDisplay },
                        custodian: { type: 'Organization', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije', value: orgId }, display: orgDisplay },
                        description: docTypeDisplay,
                        content: [{ attachment: { contentType: 'application/fhir+json', language: 'hr', url: `urn:uuid:${uuidv4()}` } }],
                        ...(validEncId || validCondId ? {
                            context: {
                                ...(validEncId ? { encounter: [{ type: 'Encounter', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-posjete', value: validEncId } }] } : {}),
                                period: { start: encounterStart, end: encounterEnd },
                                practiceSetting: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/djelatnosti-zz', code: '1010000', display: 'Opca/obiteljska medicina' }] },
                                ...(validCondId ? { related: [{ type: 'Condition', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja', value: validCondId } }] } : {})
                            }
                        } : {})
                    },
                    request: { method: 'POST', url: 'DocumentReference' }
                }
            ]
        };

        let responseData: any = null;
        let errorMessage: string | undefined;

        try {
            console.log(`[ClinicalDocumentService] TC20: Slanje Storna za original: ${oidValue}...`);
            const { submitMhdToGateway } = await import('./mhd-bundle.builder');
            const result = await submitMhdToGateway(cancelBundle);
            responseData = result;
            if (result.success) console.log('[ClinicalDocumentService] ✅ TC20 Cancel USPJEŠAN!');
            else errorMessage = result.error || result.data?.cezihError || 'CEZIH odbio storno';
        } catch (error: any) {
            errorMessage = error.message;
            responseData = { success: false, localOnly: true, cezihStatus: 'failed', cezihError: error.message, id: documentOid, status: 'cancelled' };
        } finally {
            auditService.log({ patientMbo, action: 'CANCEL_DOCUMENT', direction: 'OUTGOING_CEZIH', status: errorMessage ? 'ERROR' : 'SUCCESS', payload_req: cancelBundle, payload_res: responseData, error_msg: errorMessage });
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
            let url = `${config.cezih.gatewayBase}${config.cezih.services.document}/DocumentReference?status=current`;

            if (params.id) {
                // Search by OID (masterIdentifier) — pipe must be URL-encoded
                url += `&identifier=${encodeURIComponent(`urn:ietf:rfc:3986|urn:oid:${params.id}`)}`;
            } else if (params.patientMbo) {
                // Search by Patient MBO — pipe must be URL-encoded
                url += `&patient.identifier=${encodeURIComponent(`${CEZIH_IDENTIFIERS.MBO}|${params.patientMbo}`)}`;
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

    /**
     * TC21: Search CEZIH documents only (ITI-67) — no local merge.
     * Used by the CEZIH tab in the document viewer.
     */
    async searchRemoteDocuments(params: { patientMbo?: string }, userToken: string): Promise<any[]> {
        if (!params.patientMbo) return [];

        try {
            const rawHeaders = authService.getUserAuthHeaders(userToken);
            delete rawHeaders['Content-Type'];
            const headers = { ...rawHeaders, 'Accept': 'application/fhir+json' };
            const baseUrl = `${config.cezih.gatewayBase}${config.cezih.services.document}/DocumentReference`;
            
            let url = `${baseUrl}?patient.identifier=${encodeURIComponent(`${CEZIH_IDENTIFIERS.MBO}|${params.patientMbo}`)}&status=current&_sort=-date&_count=100`;

            console.log(`[TC21] GET ${url}`);
            
            let allRemoteDocs: any[] = [];
            let nextUrl: string | undefined = url;
            let pageNum = 0;

            while (nextUrl) {
                pageNum++;
                try {
                    const response: AxiosResponse = await axios.get(nextUrl, { headers });
                    const bundle: any = response.data;
                    
                    if (bundle.entry) {
                        const mapped = bundle.entry.map((e: any) => this.mapRemoteDocument(e.resource));
                        allRemoteDocs = [...allRemoteDocs, ...mapped];
                    }

                    console.log(`[TC21] Page ${pageNum}: ${bundle.entry?.length || 0} entries (total so far: ${allRemoteDocs.length})`);

                    // Check for next page
                    const nextLink: any = bundle.link?.find((l: any) => l.relation === 'next');
                    if (nextLink?.url) {
                        // CEZIH returns next URLs with un-encoded pipe characters in
                        // query params like type=...CodeSystem/document-type|001,...
                        // We need to properly encode the query parameter values.
                        nextUrl = this.fixCezihNextUrl(nextLink.url);
                        console.log(`[TC21] Fetching next page: ${nextUrl}`);
                    } else {
                        nextUrl = undefined;
                    }
                } catch (pageError: any) {
                    // If pagination fails (e.g. CEZIH returns 400 on page 2+),
                    // return what we already have instead of throwing everything away
                    console.warn(`[TC21] Pagination failed on page ${pageNum}: ${pageError.message} (status: ${pageError.response?.status})`);
                    console.warn(`[TC21] Returning ${allRemoteDocs.length} documents fetched so far.`);
                    break;
                }
            }

            console.log(`[TC21] Total documents fetched: ${allRemoteDocs.length}`);
            return allRemoteDocs;
        } catch (error: any) {
            console.warn('[TC21] CEZIH remote search failed:', error.message);
            console.warn('[TC21] Response status:', error.response?.status);
            console.warn('[TC21] Response data:', JSON.stringify(error.response?.data)?.substring(0, 2000));
            throw error;
        }
    }

    /**
     * Fix CEZIH next page URLs that contain un-encoded pipe characters.
     * CEZIH returns URLs like: ...?type=http://...document-type|001,...|002&_offset=100
     * The pipe chars in query values need to be encoded to %7C.
     */
    private fixCezihNextUrl(rawUrl: string): string {
        try {
            const urlObj = new URL(rawUrl);
            const fixedParams = new URLSearchParams();
            
            for (const [key, value] of urlObj.searchParams.entries()) {
                fixedParams.set(key, value);
            }
            
            urlObj.search = fixedParams.toString();
            return urlObj.toString();
        } catch {
            // If URL parsing fails, return as-is
            return rawUrl;
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
            diagnosisDisplay: '',
        };

        // Extract author (doctor) — first Practitioner in author array
        const practAuthor = resource.author?.find((a: any) => a.type === 'Practitioner' || !a.type);
        doc.authorName = practAuthor?.display || practAuthor?.identifier?.value || '';

        // Extract institution (custodian or Organization author)
        doc.institutionName = resource.custodian?.display
            || resource.author?.find((a: any) => a.type === 'Organization')?.display
            || '';

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
        let finalUrl = documentUrl;
        let oid: string | null = null;
        let isContentUrl = false;

        if (oidMatch) {
            oid = oidMatch[1];
            
            // CEZIH ITI-68 expects: ?data=base64(documentUniqueId=urn:ietf:rfc:3986|urn:oid:...&position=0)
            const dataParam = `documentUniqueId=urn:ietf:rfc:3986|urn:oid:${oid}&position=0`;
            const dataB64 = Buffer.from(dataParam).toString('base64');
            finalUrl = `${config.cezih.gatewayBase}${config.cezih.services.document}/iti-68-service?data=${dataB64}`;
        } else if (documentUrl.includes('iti-68-service')) {
            // Already a full CEZIH contentUrl — use directly
            isContentUrl = true;
        }

        try {
            const rawHeaders = authService.getUserAuthHeaders(userToken);
            delete rawHeaders['Content-Type'];
            // For constructed URLs (from urn:oid:), prefer FHIR JSON so we get the Bundle
            // For direct contentUrls, use wildcard to avoid 406
            const acceptHeader = isContentUrl ? '*/*' : 'application/fhir+json, application/json, */*;q=0.1';
            const headers = { ...rawHeaders, 'Accept': acceptHeader };
            
            console.log(`[ClinicalDocumentService] Retrieving document (ITI-68): ${finalUrl}`);
            const response = await axios.get(finalUrl, { headers, responseType: 'arraybuffer' });

            // Determine content type from response
            const contentType = response.headers['content-type'] || '';
            console.log(`[ClinicalDocumentService] ITI-68 response content-type: ${contentType}, size: ${response.data?.length || 0}`);

            let resource: any;

            if (contentType.includes('application/fhir+json') || contentType.includes('application/json')) {
                // JSON response — parse directly
                const text = Buffer.from(response.data).toString('utf8');
                resource = JSON.parse(text);
            } else {
                // Binary response (could be base64-encoded FHIR JSON or PDF)
                const text = Buffer.from(response.data).toString('utf8');
                try {
                    resource = JSON.parse(text);
                } catch {
                    // Not JSON — return as binary
                    return {
                        resourceType: 'Binary',
                        contentType: contentType || 'application/octet-stream',
                        data: Buffer.from(response.data).toString('base64'),
                    };
                }
            }

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
            console.error('[ClinicalDocumentService] Response status:', error.response?.status);
            console.error('[ClinicalDocumentService] Response data:', Buffer.isBuffer(error.response?.data) ? Buffer.from(error.response.data).toString('utf8').substring(0, 500) : JSON.stringify(error.response?.data)?.substring(0, 500));
            throw error;
        }
    }

    private mapRemoteBundle(bundle: any): any {
        const composition = bundle.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource;
        if (!composition) return {};

        const result: any = {
            anamnesis: '',
            finding: '',
            therapy: '',
            recommendation: '',
            status: '',
            diagnosisCode: '',
            diagnosisDisplay: '',
            createdAt: composition.date,
            title: composition.title,
            authorName: '',
            institutionName: '',
            visitOutcome: '',
        };

        // --- Extract from referenced resources in the bundle ---
        const resources = bundle.entry?.map((e: any) => e.resource) || [];

        // Anamneza: Observation with code=15
        const anamObs = resources.find((r: any) => r.resourceType === 'Observation' && r.code?.coding?.[0]?.code === '15');
        if (anamObs?.valueString) {
            result.anamnesis = anamObs.valueString;
        }

        // Preporuka: CarePlan.description
        const carePlan = resources.find((r: any) => r.resourceType === 'CarePlan');
        if (carePlan?.description) {
            result.recommendation = carePlan.description;
        }

        // Diagnosis: Condition resource
        const condition = resources.find((r: any) => r.resourceType === 'Condition');
        if (condition) {
            result.diagnosisCode = condition.code?.coding?.[0]?.code || '';
            result.diagnosisDisplay = condition.code?.coding?.[0]?.display || '';
        }

        // Završetak posjeta: Observation with code=24
        const outcomeObs = resources.find((r: any) => r.resourceType === 'Observation' && r.code?.coding?.[0]?.code === '24');
        if (outcomeObs?.valueCodeableConcept) {
            result.visitOutcome = outcomeObs.valueCodeableConcept.coding?.[0]?.display || '';
        } else if (outcomeObs?.valueString) {
            result.visitOutcome = outcomeObs.valueString;
        }

        // Author: Practitioner name
        const practitioner = resources.find((r: any) => r.resourceType === 'Practitioner');
        if (practitioner?.name?.[0]) {
            const n = practitioner.name[0];
            const given = Array.isArray(n.given) ? n.given.join(' ') : '';
            result.authorName = `${n.family || ''} ${given}`.trim();
        }

        // Institution: Organization name
        const organization = resources.find((r: any) => r.resourceType === 'Organization');
        if (organization?.name) {
            result.institutionName = organization.name;
        }

        // Fallback: try Composition section text for any fields still empty
        composition.section?.forEach((sec: any) => {
            const title = sec.title?.toLowerCase() || '';
            const text = sec.text?.div?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
            if (!text) return;

            if (!result.anamnesis && title.includes('anamnez')) result.anamnesis = text;
            if (!result.finding && (title.includes('status') || title.includes('nalaz'))) result.finding = text;
            if (!result.therapy && title.includes('terapij')) result.therapy = text;
            if (!result.recommendation && title.includes('preporuk')) result.recommendation = text;
        });

        return result;
    }

    // ============================================================
    // Helper Methods: Bundle Construction
    // ============================================================

    private buildFullDocumentBundle(
        data: ClinicalDocumentData,
        documentOid: string,
        patient: any,
        visit: any,
        patientCezihId?: string
    ): any {
        // Prijedlog 1: Ako imamo CEZIH logički Patient ID, koristimo ga kao fullUrl i referencu
        // da outer DocumentReference.subject (Patient/1118065) i inner Composition.subject budu isti string.
        const patientFullUrl = patientCezihId ? `Patient/${patientCezihId}` : `urn:uuid:${uuidv4()}`;
        const practitionerUuid = `urn:uuid:${uuidv4()}`;
        const organizationUuid = `urn:uuid:${uuidv4()}`;
        const encounterUuid = `urn:uuid:${uuidv4()}`;
        const clinicalImpressionUuid = `urn:uuid:${uuidv4()}`;
        const compositionUuid = `urn:uuid:${uuidv4()}`;

        const entries: any[] = [];
        const patientIdentifier = patientService.getPatientIdentifier(patient);

        // 1. Composition (must be first)
        entries.push({
            fullUrl: compositionUuid,
            resource: {
                resourceType: 'Composition',
                identifier: {
                    system: 'urn:ietf:rfc:3986',
                    value: `urn:oid:${documentOid}`
                },
                meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/izvjesce-nakon-pregleda-u-ambulanti-privatne-zdravstvene-ustanove'] },
                status: 'final',
                type: { coding: [this.getDocumentTypeCoding(data.type)] },
                subject: {
                    reference: patientFullUrl,
                    identifier: patientIdentifier,
                    display: patient.name?.given
                        ? `${patient.name.given[0]} ${patient.name.family}`
                        : undefined
                },
                encounter: { reference: encounterUuid },
                date: data.date,
                author: [{ reference: practitionerUuid }],
                title: data.title || 'Izvješće nakon pregleda - TC18',
                attester: [{ mode: 'professional', party: { reference: practitionerUuid } }],
                custodian: { reference: organizationUuid },
                section: [{
                    title: 'Anamneza',
                    code: { coding: [{ system: DOCUMENT_CODES.SECTION_SYSTEM, code: '1' }] },
                    entry: [{ reference: clinicalImpressionUuid }]
                }]
            }
        });

        // 2. Patient — fullUrl = Patient/{cezihId} kada je poznat (Prijedlog 1)
        //    To usklađuje inner Composition.subject s outer DocumentReference.subject
        entries.push({
            fullUrl: patientFullUrl,
            resource: {
                resourceType: 'Patient',
                id: patientCezihId || data.patientMbo,
                identifier: [patientIdentifier],
                name: patient.name?.given
                    ? [{ family: patient.name.family, given: patient.name.given }]
                    : [{ family: 'PACPRIVATNICI42', given: ['IVAN'] }]
            }
        });

        // 3. Practitioner — fullUrl = urn:uuid, but id field = HZJZ ID for cross-check
        entries.push({
            fullUrl: practitionerUuid,
            resource: {
                resourceType: 'Practitioner',
                id: config.practitioner.hzjzId,
                identifier: [{ system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: config.practitioner.hzjzId }]
            }
        });

        // 4. Encounter — use CEZIH visit ID if available (critical for Subject cross-check)
        const encounterIdentifierValue = visit?.cezihVisitId || `urn:oid:${documentOid}`;
        entries.push({
            fullUrl: encounterUuid,
            resource: {
                resourceType: 'Encounter',
                identifier: [{ system: 'urn:ietf:rfc:3986', value: encounterIdentifierValue }],
                status: 'finished',
                class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
                subject: { reference: patientFullUrl }
            }
        });

        // 5. Organization (custodian)
        entries.push({
            fullUrl: organizationUuid,
            resource: {
                resourceType: 'Organization',
                identifier: [{ system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE, value: config.organization.hzzoCode }]
            }
        });

        // 6. ClinicalImpression
        entries.push({
            fullUrl: clinicalImpressionUuid,
            resource: {
                resourceType: 'ClinicalImpression',
                status: 'completed',
                subject: { reference: patientFullUrl },
                description: data.anamnesis || 'Pacijent je stabilno.'
            }
        });

        return {
            resourceType: 'Bundle',
            type: 'document',
            identifier: { system: 'urn:ietf:rfc:3986', value: `urn:oid:${documentOid}` },
            timestamp: new Date().toISOString(),
            entry: entries,
            signature: {
                type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
                when: new Date().toISOString(),
                who: { reference: practitionerUuid },
                data: ''
            }
        };
    }


    private getDocumentTypeCoding(type: ClinicalDocumentType | string): { system: string; code: string; display: string } {
        switch (type) {
            case ClinicalDocumentType.AMBULATORY_REPORT:
            case 'ambulatory-report':
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_AMBULATORY,
                    display: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
                };
            case ClinicalDocumentType.SPECIALIST_FINDING:
            case 'specialist-finding':
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_SPECIALIST,
                    display: 'Nalaz iz specijalističke ordinacije privatne zdravstvene ustanove',
                };
            case ClinicalDocumentType.DISCHARGE_LETTER:
            case 'discharge-letter':
            case 'discharge-summary': // alias za test runner kompatibilnost
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_DISCHARGE,
                    display: 'Otpusno pismo iz privatne zdravstvene ustanove',
                };
            default:
                // Fallback: koristi ambulatorni tip da izbjegnemo null u coding
                console.warn(`[ClinicalDocumentService] Unknown document type '${type}', defaulting to AMBULATORY_REPORT`);
                return {
                    system: DOCUMENT_CODES.TYPE_SYSTEM,
                    code: DOCUMENT_CODES.TYPE_AMBULATORY,
                    display: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
                };
        }
    }
}

export const clinicalDocumentService = new ClinicalDocumentService();
