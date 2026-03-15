/**
 * API Routes for CEZIH FHIR Integration
 * Each route group maps to a set of test cases.
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import * as path from 'path';
import { CertiliaAuthClient } from '../services/certilia-auth.service';
import {
    authService,
    oidService,
    terminologyService,
    registryService,
    patientService,
    visitService,
    caseService,
    clinicalDocumentService,
    settingsService,
    auditService,
    smartCardGatewayAuthService,
    signatureService,
} from '../services';
import db from '../db/index';
import { ENCOUNTER_CODES } from '../types';
import certificationRoutes from './certification.routes';
import patientRoutes from './patient.routes';

const router = Router();

// ============================================================
// Health Check
// ============================================================
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        service: 'CEZIH FHIR Integration',
        timestamp: new Date().toISOString(),
        testCases: {
            total: 22,
            implemented: 22,
            pendingInfrastructure: [1, 2, 4, 5], // Require smart card / Certilia
        },
    });
});

// Certification Test Bench Routes
// ============================================================
router.use('/certification', certificationRoutes);

// ============================================================
// Dev/Test Utils
// ============================================================
// Sign an arbitrary bundle using backend's signatureService (PKCS#11 / mock)
router.post('/test/sign-bundle', async (req: Request, res: Response) => {
    try {
        const { bundle, signerRef } = req.body;
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        if (!bundle || bundle.resourceType !== 'Bundle') {
            return res.status(400).json({ error: 'Request body must contain a Bundle resource' });
        }
        const result = await signatureService.signBundle(bundle, signerRef, userToken);
        const signedB64 = Buffer.from(JSON.stringify(result.bundle)).toString('base64');
        res.json({ success: true, signedB64, sigDataLength: result.bundle.signature?.data?.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/test/tc18-full — Full TC18 certification flow with optional Sign PIN
// Runs TC12 (visit) → TC16 (case) → sign document bundle → TC18 CEZIH submit
router.post('/test/tc18-full', async (req: Request, res: Response) => {
    const { signPin } = req.body ?? {};
    const steps: any[] = [];
    const addStep = (name: string, data: any, ok: boolean) => { steps.push({ name, ok, ...data }); };

    try {
        const PATIENT_MBO = '999999423';
        const PRACTITIONER_ID = '4981825';
        const ORG_ID = '999001425';
        let encounterId: string | undefined;
        let localVisitId: string | undefined;

        // ── TC12: Create visit ──
        try {
            const visitReq: any = { patientMbo: PATIENT_MBO, practitionerId: PRACTITIONER_ID, organizationId: ORG_ID, startDate: new Date().toISOString(), class: 'AMB' };
            const visitRes = await visitService.createVisit(visitReq, '');
            // DEBUG: dump response structure
            console.log(`[tc18-full] TC12 response keys:`, Object.keys(visitRes || {}));
            console.log(`[tc18-full] TC12 visitRes.localVisitId:`, visitRes?.localVisitId);
            console.log(`[tc18-full] TC12 visitRes.cezihVisitId:`, visitRes?.cezihVisitId);
            // Response can be flat object or wrapped: .result / .result.result
            const inner = visitRes?.result?.result ?? visitRes?.result ?? visitRes;
            localVisitId = inner?.localVisitId || inner?.visitId;
            const cezihVisitId = inner?.cezihVisitId || inner?.cezihEncounterId || inner?.encounterId;
            // Look for Encounter identifiers in CEZIH response bundle (search nested and root)
            const respEncounter = visitRes?.entry?.find((e: any) => e.resource?.resourceType === 'Encounter')?.resource
                || inner?.entry?.find((e: any) => e.resource?.resourceType === 'Encounter')?.resource;
            if (respEncounter?.identifier) {
                console.log(`[tc18-full] TC12 Encounter identifiers:`, JSON.stringify(respEncounter.identifier));
            }
            // Extract CEZIH technical resource ID (e.g. "1244391") for TC18 reference
            const encResourceId = respEncounter?.id;
            if (!encResourceId) console.warn(`[tc18-full] ⚠️ encResourceId is undefined! respEncounter:`, JSON.stringify(respEncounter || 'null'));
            console.log(`[tc18-full] TC12 extracted: localVisitId=${localVisitId}, cezihVisitId=${cezihVisitId}, encResourceId=${encResourceId}`);
            const ok = !!(localVisitId || cezihVisitId);
            addStep('tc12', { request: visitReq, response: visitRes, localVisitId, cezihVisitId, encResourceId }, ok);
            if (!ok) return res.json({ success: false, steps, error: 'TC12: neither localVisitId nor cezihVisitId returned' });
        } catch (e: any) {
            addStep('tc12', { error: e.message }, false);
            return res.json({ success: false, steps, error: 'TC12: ' + e.message });
        }

        // ── TC16: Create case ──
        let conditionId: string | undefined;
        try {
            const caseReq: any = { patientMbo: PATIENT_MBO, title: `TC18 test ${new Date().toISOString().slice(0, 10)}`, diagnosisCode: 'J06.9', diagnosisDisplay: 'Akutna infekcija gornjih dišnih putova', practitionerId: PRACTITIONER_ID, organizationId: ORG_ID, startDate: new Date().toISOString() };
            const caseRes = await caseService.createCase(caseReq, '');
            // DEBUG: dump TC16 response
            console.log(`[tc18-full] TC16 response keys:`, Object.keys(caseRes || {}));
            console.log(`[tc18-full] TC16 caseRes.cezihCaseId:`, caseRes?.cezihCaseId);
            console.log(`[tc18-full] TC16 caseRes.localCaseId:`, caseRes?.localCaseId);
            // Look for Condition identifiers in CEZIH response
            const inner = caseRes?.result?.result ?? caseRes?.result ?? caseRes;
            const respBundle = inner;
            const respCondition = respBundle?.entry?.find((e: any) => e.resource?.resourceType === 'Condition')?.resource
                || caseRes?.entry?.find((e: any) => e.resource?.resourceType === 'Condition')?.resource;
            if (respCondition?.identifier) {
                console.log(`[tc18-full] TC16 Condition identifiers:`, JSON.stringify(respCondition.identifier));
            }
            const condResourceId = respCondition?.id;
            if (!condResourceId) console.warn(`[tc18-full] ⚠️ condResourceId is undefined! respCondition:`, JSON.stringify(respCondition || 'null'));
            // TC16 response: { success, result: Bundle, localCaseId, cezihCaseId } — IDs at root
            const rootCezihCaseId = caseRes?.cezihCaseId;
            const rootLocalCaseId = caseRes?.localCaseId;
            conditionId = rootCezihCaseId || rootLocalCaseId || inner?.cezihCaseId || inner?.conditionId || inner?.cezihConditionId || inner?.localCaseId;
            console.log(`[tc18-full] TC16 extracted: conditionId=${conditionId}, condResourceId=${condResourceId}`);
            const ok = !!conditionId;
            addStep('tc16', { request: caseReq, response: caseRes, conditionId, condResourceId }, ok);
            if (!ok) return res.json({ success: false, steps, error: 'TC16: no case ID returned' });
        } catch (e: any) {
            addStep('tc16', { error: e.message }, false);
            return res.json({ success: false, steps, error: 'TC16: ' + e.message });
        }

        // ── Wait for CEZIH to index TC12/TC16 resources ──
        console.log('⏳ Čekam 5 sekundi da CEZIH indeksira Posjetu i Slučaj...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('🚀 Indeksiranje gotovo — šaljem TC18!');

        // ── TC18: Build inner bundle, sign with Sign token, build outer, submit ──
        try {
            const fs = require('fs');
            const pathMod = require('path');
            const { v4: uuidv4 } = require('uuid');
            const axios = require('axios');

            // Extract CEZIH IDs from TC12/TC16 steps
            const tc12Step = steps.find((s: any) => s.name === 'tc12');
            const tc16Step = steps.find((s: any) => s.name === 'tc16');
            // Technical resource IDs (e.g. "1244391") — for reference: "Encounter/1244391"
            const encResourceId = tc12Step?.encResourceId;
            const condResourceId = tc16Step?.condResourceId;
            // Business IDs (e.g. "cmmjoeckj...") — for identifier.value
            const encCezihId = tc12Step?.cezihVisitId || localVisitId;
            const condFhirId = tc16Step?.conditionId || conditionId;
            console.log(`[tc18-full] FINAL mapping: Enc ref=Encounter/${encResourceId}, id=${encCezihId} | Cond ref=Condition/${condResourceId}, id=${condFhirId}`);

            // Generate OID for document
            const oidRes = await oidService.generateSingleOid();
            const docOidRaw = oidRes;
            const docOid = `urn:oid:${docOidRaw}`;
            // Generate date with local timezone offset (+01:00) — CEZIH rejects Z format in documents
            const now = new Date();
            const tzOff = -now.getTimezoneOffset();
            const tzS = tzOff >= 0 ? '+' : '-';
            const tzH = String(Math.floor(Math.abs(tzOff) / 60)).padStart(2, '0');
            const tzM = String(Math.abs(tzOff) % 60).padStart(2, '0');
            const docDate = now.toISOString().replace(/\.\d{3}Z$/, `${tzS}${tzH}:${tzM}`);
            const outerDate = docDate;

            // UUIDs for inner bundle resources
            const U = { comp: uuidv4(), pat: uuidv4(), prac: uuidv4(), org: uuidv4(), enc: uuidv4(), ci: uuidv4(), hcs: uuidv4(), obsAnam: uuidv4(), obsIshod: uuidv4() };
            const encVisitId = encCezihId!;
            console.log(`[tc18-full] FINAL IDs: Encounter=${encVisitId}, Condition=${condFhirId}`);

            // ── Build self-contained inner bundle (9 resources) ──
            const innerBundle = {
                resourceType: 'Bundle', id: uuidv4(), type: 'document',
                identifier: { system: 'urn:ietf:rfc:3986', value: docOid },
                timestamp: docDate,
                entry: [
                    {
                        fullUrl: `urn:uuid:${U.comp}`,
                        resource: {
                            resourceType: 'Composition',
                            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/izvjesce-nakon-pregleda-u-ambulanti-privatne-zdravstvene-ustanove'] },
                            identifier: { system: 'urn:ietf:rfc:3986', value: docOid },
                            language: 'hr',
                            status: 'final',
                            confidentiality: 'N',
                            type: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type', code: '011', display: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove' }] },
                            title: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
                            subject: { reference: `urn:uuid:${U.pat}` },
                            encounter: { reference: `urn:uuid:${U.enc}` },
                            date: docDate,
                            author: [
                                { reference: `urn:uuid:${U.prac}` },
                                { reference: `urn:uuid:${U.org}` }
                            ],
                            attester: [
                                { mode: 'professional', party: { reference: `urn:uuid:${U.prac}` } },
                                { mode: 'official', party: { reference: `urn:uuid:${U.org}` } }
                            ],
                            custodian: { reference: `urn:uuid:${U.org}` },
                            section: [
                                {
                                    title: 'Djelatnost',
                                    code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-section', code: '12', display: 'Djelatnost' }] },
                                    entry: [{ reference: `urn:uuid:${U.hcs}` }]
                                },
                                {
                                    title: 'Medicinska informacija',
                                    code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-section', code: '18', display: 'Medicinska informacija' }] },
                                    entry: [
                                        { reference: `urn:uuid:${U.obsAnam}` },
                                        { reference: `urn:uuid:${U.ci}` },
                                        { reference: `urn:uuid:${U.obsIshod}` }
                                    ]
                                }
                            ]
                        }
                    },
                    { fullUrl: `urn:uuid:${U.pat}`, resource: { resourceType: 'Patient', identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO', value: PATIENT_MBO }], name: [{ family: 'PACPRIVATNICI42', given: ['IVAN'] }], gender: 'male', birthDate: '1980-01-01' } },
                    { fullUrl: `urn:uuid:${U.prac}`, resource: { resourceType: 'Practitioner', identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika', value: PRACTITIONER_ID }, { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/OIB', value: '30160453873' }], name: [{ family: 'Prpic', given: ['Ivan'] }] } },
                    { fullUrl: `urn:uuid:${U.org}`, resource: { resourceType: 'Organization', identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije', value: ORG_ID }] } },
                    { fullUrl: `urn:uuid:${U.enc}`, resource: { resourceType: 'Encounter', identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-posjete', value: encCezihId }], status: 'finished', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' }, subject: { reference: `urn:uuid:${U.pat}` } } },
                    { fullUrl: `urn:uuid:${U.ci}`, resource: { resourceType: 'Condition', identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja', value: condFhirId! }], clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, subject: { reference: `urn:uuid:${U.pat}` }, code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr', code: 'J06.9' }] } } },
                    { fullUrl: `urn:uuid:${U.hcs}`, resource: { resourceType: 'HealthcareService', identifier: [{ system: 'http://fhir.cezih.hr/specifikacije/identifikatori/ID-djelatnosti', value: '3030000' }], providedBy: { reference: `urn:uuid:${U.org}` }, name: 'Opca/obiteljska medicina' } },
                    { fullUrl: `urn:uuid:${U.obsAnam}`, resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/observations', code: '15', display: 'Anamneza' }] }, subject: { reference: `urn:uuid:${U.pat}` }, valueString: 'Pacijent se javlja radi tegoba.' } },
                    { fullUrl: `urn:uuid:${U.obsIshod}`, resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/observations', code: '24', display: 'Ishod pregleda' }] }, valueCodeableConcept: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/sifrarnik-zavrsetaka-pregleda', version: '0.1.0', code: '1', display: 'Pregled zavrsen uspjesno' }] } } }
                ],
                signature: {
                    type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
                    when: docDate,
                    who: { reference: `urn:uuid:${U.prac}` },
                    data: ''
                }
            };

            console.log('[tc18-full] Inner bundle built: 9 entries (Composition, Patient, Practitioner, Org, Encounter, Condition, HealthcareService, 2xObservation)');
            // DUMP inner bundle before signing for DOP diagnosis
            fs.writeFileSync(pathMod.join(__dirname, '../../tmp/tc18-inner.json'), JSON.stringify(innerBundle, null, 2));

            // ── Sign with Sign token (using signPin) ──
            // signatureService already imported at top
            const signedResult = await signatureService.signBundle(innerBundle, `urn:uuid:${U.prac}`, '', signPin);
            const signedBundle = signedResult.bundle;
            const signedB64 = Buffer.from(JSON.stringify(signedBundle), 'utf8').toString('base64').replace(/\n/g, '').replace(/\r/g, '');
            console.log(`[tc18-full] Signed with ${signPin ? 'Sign' : 'Iden'} token: ${signedB64.length} chars`);

            // ── Build golden outer wrapper ──
            const listUuid = uuidv4(), docRefUuid = uuidv4(), binUuid = uuidv4();
            const subOidRaw = await oidService.generateSingleOid();

            const hybridSubject = {
                reference: 'Patient/1118065',
                identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO', value: PATIENT_MBO }
            };

            const outer: any = {
                resourceType: 'Bundle', type: 'transaction',
                meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle'] },
                entry: [
                    {
                        fullUrl: `urn:uuid:${listUuid}`,
                        resource: {
                            resourceType: 'List',
                            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-document-submissionset'] },
                            extension: [{ url: 'https://profiles.ihe.net/ITI/MHD/StructureDefinition/ihe-sourceId', valueIdentifier: { system: 'urn:ietf:rfc:3986', value: 'urn:oid:2.16.840.1.113883.2.7.50.2.1' } }],
                            identifier: [
                                { use: 'usual', system: 'urn:ietf:rfc:3986', value: `urn:oid:${subOidRaw}` },
                                { use: 'official', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${listUuid}` }
                            ],
                            status: 'current', mode: 'working',
                            code: { coding: [{ system: 'https://profiles.ihe.net/ITI/MHD/CodeSystem/MHDlistTypes', code: 'submissionset' }] },
                            date: outerDate,
                            subject: hybridSubject,
                            entry: [{ item: { type: 'DocumentReference', reference: `urn:uuid:${docRefUuid}` } }]
                        },
                        request: { method: 'POST', url: 'List' }
                    },
                    {
                        fullUrl: `urn:uuid:${docRefUuid}`,
                        resource: {
                            resourceType: 'DocumentReference',
                            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-document-reference'] },
                            masterIdentifier: { use: 'usual', system: 'urn:ietf:rfc:3986', value: docOid },
                            identifier: [{ use: 'official', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${docRefUuid}` }],
                            status: 'current',
                            type: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type', code: '011' }] },
                            subject: { reference: 'Patient/1118065', type: 'Patient', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO', value: PATIENT_MBO }, display: 'IVAN PACPRIVATNICI42' },
                            date: outerDate,
                            author: [{ type: 'Practitioner', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika', value: PRACTITIONER_ID }, display: 'Ivan Prpic' }],
                            authenticator: { type: 'Practitioner', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika', value: PRACTITIONER_ID }, display: 'Ivan Prpic' },
                            custodian: { type: 'Organization', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije', value: ORG_ID }, display: 'WBS privatna ordinacija' },
                            content: [{ attachment: { contentType: 'application/fhir+json; charset=utf-8', language: 'hr', url: `urn:uuid:${binUuid}` } }],
                            context: {
                                encounter: [{ type: 'Encounter', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-posjete', value: encCezihId } }],
                                period: { start: outerDate },
                                practiceSetting: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/djelatnosti-zz', code: '1010000', display: 'Opca/obiteljska medicina' }] },
                                sourcePatientInfo: { identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO', value: PATIENT_MBO } },
                                related: [{ type: 'Condition', identifier: { system: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja', value: condFhirId! } }]
                            }
                        },
                        request: { method: 'POST', url: 'DocumentReference' }
                    },
                    {
                        fullUrl: `urn:uuid:${binUuid}`,
                        resource: { resourceType: 'Binary', id: binUuid, contentType: 'application/fhir+json; charset=utf-8', data: signedB64 },
                        request: { method: 'POST', url: 'Binary' }
                    }
                ]
            };

            console.log(`[tc18-full] Outer wrapper built: OID=${docOidRaw}, Enc=${encCezihId}, Cond=${condFhirId}`);
            console.log(`[tc18-full] CEZIH ID POSJETE (encResourceId):`, encResourceId);
            console.log(`[tc18-full] CEZIH ID SLUCAJA (condResourceId):`, condResourceId);
            console.log(`[tc18-full] OUTER BUNDLE KONTROLA:`, JSON.stringify(outer.entry[1].resource.context, null, 2));

            // Full URL references: Encounter/uuid and Condition/uuid — direct SQL lookup, no identifier search
            // Dump final JSON for debugging
            const outerJson = JSON.stringify(outer, null, 2);
            fs.writeFileSync(pathMod.join(__dirname, '../../tmp/tc18-outer.json'), outerJson);
            console.log(`[tc18-full] Context references: Encounter/${encVisitId}, Condition/${condFhirId}`);

            // ── Submit to CEZIH with full auth (Bearer + Cookie) ──
            // authService already imported at top
            let headers: Record<string, string> = {};
            try { headers = await authService.getSystemAuthHeaders(); } catch (e) { headers = {}; }
            const gatewayHeaders = authService.hasGatewaySession() ? authService.getGatewayAuthHeaders() : {};
            const combinedHeaders = {
                ...headers,
                ...(gatewayHeaders.Cookie ? { Cookie: gatewayHeaders.Cookie } : {}),
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json',
            };

            const { config: appConfig } = await import('../config');
            const url = `${appConfig.cezih.gatewayBase}${appConfig.cezih.services.document}/iti-65-service`;
            console.log(`[tc18-full] Submitting to CEZIH: ${url}`);

            // Save outer for debugging
            try { fs.writeFileSync(pathMod.join(process.cwd(), 'tmp', 'tc18-outer.json'), JSON.stringify(outer, null, 2)); } catch (e) { }

            let submitRes: any;
            try {
                const response = await axios.post(url, outer, { headers: combinedHeaders });
                submitRes = response.data;
                console.log('[tc18-full] ✅ CEZIH accepted!');
            } catch (error: any) {
                console.warn('[tc18-full] CEZIH error:', error.response?.status);
                const fullResponse = error.response?.data;
                // Save full error response
                try { fs.writeFileSync(pathMod.join(process.cwd(), 'tmp', 'cezih-tc18-error.json'), JSON.stringify(fullResponse, null, 2)); } catch (e) { }
                // Extract ALL issues
                const issues = fullResponse?.issue?.map((i: any) => ({
                    severity: i.severity,
                    code: i.details?.coding?.[0]?.code || i.details?.text || i.code,
                    diagnostics: i.diagnostics,
                    location: i.location
                })) || [];
                submitRes = {
                    success: false,
                    cezihStatus: 'failed',
                    cezihError: `HTTP ${error.response?.status}`,
                    issues,
                    documentOid: docOidRaw,
                    fullResponse
                };
            }

            const ok = submitRes?.success !== false && !submitRes?.cezihStatus;
            addStep('tc18', { request: { documentOid: docOidRaw, signToken: !!signPin }, response: submitRes }, ok);
            return res.json({ success: ok, steps });
        } catch (e: any) {
            addStep('tc18', { error: e.message }, false);
            return res.json({ success: false, steps, error: 'TC18: ' + e.message });
        }
    } catch (e: any) {
        return res.status(500).json({ success: false, steps, error: e.message });
    }
});

// POST /api/test/tc21 — TC21: Search clinical documents for a patient (ITI-67)
router.post('/test/tc21', async (req: Request, res: Response) => {
    try {
        const { patientMbo } = req.body;
        const mbo = patientMbo || process.env.PATIENT_MBO || '999999423';
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';

        console.log(`[tc21] Searching CEZIH documents for MBO=${mbo}`);
        const documents = await clinicalDocumentService.searchRemoteDocuments({ patientMbo: mbo }, userToken);
        console.log(`[tc21] Found ${documents.length} document(s)`);

        return res.json({ success: true, patientMbo: mbo, count: documents.length, documents });
    } catch (e: any) {
        console.error('[tc21] Error:', e.response?.data || e.message);
        return res.status(500).json({ success: false, error: e.message, details: e.response?.data });
    }
});

// ============================================================
// Auth Routes (Test Cases 1-3)
// ============================================================

// Test Case 3: Get system token (OAuth2 Client Credentials)
router.post('/auth/system-token', async (_req: Request, res: Response) => {
    try {
        const token = await authService.getSystemToken();
        res.json({ success: true, token, tokenPreview: token.substring(0, 50) + '...' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Registry Routes (mCSD ITI-90 lookup — uses system token)
// ============================================================

// Generic registry type history
router.get('/registry/:resourceType/_history', async (req: Request, res: Response) => {
    try {
        const resourceType = req.params.resourceType as string;
        const history = await registryService.getTypeHistory(resourceType);
        res.json({ success: true, history });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generic registry instance history
router.get('/registry/:resourceType/:id/_history', async (req: Request, res: Response) => {
    try {
        const resourceType = req.params.resourceType as string;
        const id = req.params.id as string;
        const history = await registryService.getResourceHistory(resourceType, id);
        res.json({ success: true, history });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generic registry get by ID
router.get('/registry/:resourceType/:id', async (req: Request, res: Response) => {
    try {
        const resourceType = req.params.resourceType as string;
        const id = req.params.id as string;
        
        const resource = await registryService.getResourceById(resourceType, id);
        res.json({ success: true, resource });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
    }
});

// Generic registry search (IHE ITI-90 mCSD)
router.get('/registry/:resourceType', async (req: Request, res: Response) => {
    try {
        const resourceType = req.params.resourceType as string;
        const rawParams = { ...req.query };
        const cleanParams: Record<string, any> = {};

        // IHE ITI-90 / CEZIH supported params per resource type
        const SUPPORTED_PARAMS: Record<string, string[]> = {
            'Organization': ['active', 'identifier', 'name', 'partof', 'type', '_include', '_revInclude'],
            'Location': ['identifier', 'name', 'organization', 'partof', 'status', 'type', '_include', 'near'],
            'Practitioner': ['active', 'identifier', 'name', 'given', 'family'],
            'PractitionerRole': ['active', 'location', 'organization', 'practitioner', 'role', 'service', 'specialty', '_include'],
            'HealthcareService': ['active', 'identifier', 'location', 'name', 'organization', 'service-type'],
            'Endpoint': ['identifier', 'organization', 'status'],
            'OrganizationAffiliation': ['active', 'date', 'identifier', 'participating-organization', 'primary-organization', 'role', '_include']
        };

        const supported = SUPPORTED_PARAMS[resourceType] || [];

        // 1. Handle 'name' mapping
        if (rawParams.name && String(rawParams.name).trim() !== '') {
            if (supported.includes('name')) {
                cleanParams['name:contains'] = rawParams.name;
            }
        }

        // 2. Handle 'active' -> 'status' translation
        if (rawParams.active === 'true') {
            if (supported.includes('status')) {
                cleanParams.status = 'active';
            } else if (supported.includes('active')) {
                cleanParams.active = 'true';
            }
        }

        // 3. Forward other supported params
        for (const [key, val] of Object.entries(rawParams)) {
            if (['name', 'active'].includes(key)) continue;
            if (supported.includes(key) && val && String(val).trim() !== '') {
                cleanParams[key] = val;
            }
        }

        console.log(`[API] mCSD ${resourceType} Final Params:`, cleanParams);
        const result = await registryService.searchResources(resourceType, cleanParams);
        
        // Return format that matches what frontend expects
        const key = resourceType.charAt(0).toLowerCase() + resourceType.slice(1);
        const pluralKey = key.endsWith('y') ? key.slice(0, -1) + 'ies' : key + 's';
        
        res.json({ 
            success: true,
            total: result.total, 
            count: result.total,
            [pluralKey]: result.resources,
            bundle: result.bundle 
        });
    } catch (error: any) {
        console.error(`[API] mCSD ${req.params.resourceType} failed:`, error.message);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
    }
});

// Generic registry POST (Create/Update)
router.post('/registry/:resourceType', async (req: Request, res: Response) => {
    try {
        const resourceType = req.params.resourceType as string;
        const resource = req.body;
        
        if (!resource || resource.resourceType !== resourceType) {
            return res.status(400).json({ error: `Invalid resource body or mismatched resourceType` });
        }

        const result = await registryService.saveResource(resourceType, resource);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
    }
});


// Test Cases 1 & 2: Initiate gateway-based user authentication
// method=smartcard → TLS client cert auth (browser handles smart card PIN)
// method=certilia → Certilia mobile.ID (no client cert needed)
router.get('/auth/initiate', async (req: Request, res: Response) => {
    try {
        const method = (req.query.method as string) === 'smartcard' ? 'smartcard' : 'certilia';
        console.log(`[Auth] Initiating ${method} auth via gateway...`);

        const result = await authService.initiateGatewayAuth(method as 'smartcard' | 'certilia');

        res.json({
            success: true,
            authUrl: result.authUrl,
            method: result.method,
            chainCookies: result.chainCookies,
            gatewayUrl: result.gatewayUrl,
            instructions: method === 'smartcard'
                ? 'Open authUrl in browser. Smart card PIN prompt will appear during TLS handshake.'
                : 'Open authUrl in browser. Authenticate via Certilia mobile.ID push notification.',
        });
    } catch (error: any) {
        console.error('[Auth] Initiate failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Store gateway session cookies after browser authentication completes
router.post('/auth/session', (req: Request, res: Response) => {
    try {
        const { cookies, sessionToken } = req.body;
        if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
            return res.status(400).json({ error: 'Missing cookies array' });
        }

        authService.storeGatewaySession(cookies, sessionToken);
        res.json({ success: true, message: 'Gateway session stored' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Check authentication status
router.get('/auth/status', (_req: Request, res: Response) => {
    const status = authService.getSessionStatus();
    res.json(status);
});

// Health check — combined status of all 3 auth methods
router.get('/auth/health-check', async (_req: Request, res: Response) => {
    const gwStatus = authService.getSessionStatus();
    const m2mStatus = authService.getSystemTokenStatus();

    // Smart card PKCS#11 status
    let smartCard: { initialized: boolean; tokenLabel?: string; algorithm?: string; subject?: string } = { initialized: false };
    try {
        const { pkcs11Service } = await import('../services/pkcs11.service');
        const active = pkcs11Service.isActive();
        const signActive = pkcs11Service.isSignTokenActive();
        if (active || signActive) {
            const ki = active ? pkcs11Service.getKeyInfo() : pkcs11Service.getSignKeyInfo();
            const subjectMatch = ki?.certificate?.match(/CN=([^\n]+)/);
            smartCard = {
                initialized: true,
                tokenLabel: active ? 'Iden' : 'Sign',
                algorithm: ki?.algo || 'unknown',
                subject: subjectMatch?.[1]?.trim() || 'unknown',
            };
        }
    } catch (e: any) {
        console.warn('[health-check] PKCS#11 check error:', e.message);
    }

    res.json({
        gateway: {
            active: gwStatus.authenticated,
            ageMinutes: gwStatus.createdAt ? Math.round((Date.now() - gwStatus.createdAt) / 60000) : null,
            maxAgeMinutes: 240,
        },
        systemToken: m2mStatus,
        smartCard,
    });
});

// Full session diagnostics — use this to debug session issues!
router.get('/auth/diagnostics', (_req: Request, res: Response) => {
    const diag = authService.getDiagnostics();
    console.log(`[AuthService] 📊 Diagnostics requested:`, JSON.stringify(diag, null, 2));
    res.json(diag);
});

// Return gateway session headers (for use in test scripts / remote signing)
router.get('/auth/gateway-token', (_req: Request, res: Response) => {
    try {
        if (!authService.hasGatewaySession()) {
            return res.status(401).json({ error: 'No active gateway session' });
        }
        const headers = authService.getGatewayAuthHeaders();
        res.json({
            success: true,
            cookieHeader: headers['Cookie'] || '',
            sessionToken: headers[process.env.CEZIH_SSO_SESSION_HEADER || 'mod_auth_openid_session'] || '',
        });
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
});

// Legacy: Smart Card auth URL (backward compat)
router.get('/auth/smartcard', async (req: Request, res: Response) => {
    try {
        const result = await authService.initiateGatewayAuth('smartcard');
        res.json({ authUrl: result.authUrl, state: 'gateway' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// TC1: Backend smart card TLS authentication via PKCS#11
// The backend opens a direct TLS connection to the CEZIH gateway using
// the IDEN certificate from the card. The private key never leaves hardware.
router.post('/auth/smartcard/gateway', async (_req: Request, res: Response) => {
    try {
        console.log('[API] TC1: Backend smart card auth initiated');
        const result = await smartCardGatewayAuthService.authenticate();
        if (result.success) {
            res.json({
                success: true,
                message: 'Smart card autentifikacija uspješna',
                cookiesCount: result.cookies?.length ?? 0,
            });
        } else {
            res.status(401).json({ success: false, error: result.error });
        }
    } catch (error: any) {
        console.error('[API] Smart card auth error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// TC1 — Playwright-based gateway cookie grabber
// Spawns grab-gateway-cookie.js which opens a visible browser.
// User authenticates with smart card, cookie is auto-injected into backend.
// Frontend should poll /api/auth/status until authenticated.
let playwrightSession: { pid: number; startedAt: number } | null = null;
let playwrightPhase: 'launching' | 'gateway-open' | 'waiting-cert' | 'cookie-found' | 'done' = 'launching';

router.post('/auth/smartcard/playwright-start', (_req: Request, res: Response) => {
    try {
        // Clear existing session so poll starts fresh
        authService.clearGatewaySession();

        // Prevent duplicate launches
        if (playwrightSession) {
            const ageMs = Date.now() - playwrightSession.startedAt;
            if (ageMs < 6 * 60 * 1000) { // still within 6 min window
                return res.json({
                    success: true,
                    alreadyRunning: true,
                    message: 'Browser je već otvoren. Dovršite autentifikaciju u prozoru koji se otvorio.',
                    pid: playwrightSession.pid,
                });
            }
        }

        const scriptPath = path.join(process.cwd(), 'scripts', 'grab-gateway-cookie.js');

        const child = spawn('node', [scriptPath], {
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
            windowsHide: false, // Must be false — Playwright browser must be visible
        });

        playwrightSession = { pid: child.pid!, startedAt: Date.now() };
        playwrightPhase = 'launching';
        console.log(`[SmartCard/Playwright] Started grab-gateway-cookie.js (PID: ${child.pid})`);

        child.stdout?.on('data', (data: Buffer) => {
            process.stdout.write('[GrabCookie] ' + data.toString());
        });
        child.stderr?.on('data', (data: Buffer) => {
            process.stderr.write('[GrabCookie] ' + data.toString());
        });
        child.on('close', (code: number) => {
            console.log(`[SmartCard/Playwright] Process exited (code: ${code})`);
            playwrightPhase = 'done';
            playwrightSession = null;
        });
        child.on('error', (err: Error) => {
            console.error('[SmartCard/Playwright] Process error:', err.message);
            playwrightPhase = 'done';
            playwrightSession = null;
        });

        res.json({
            success: true,
            message: 'Browser se otvara. Odaberite IDEN certifikat i unesite PIN.',
            pid: child.pid,
        });

    } catch (error: any) {
        console.error('[SmartCard/Playwright] Start error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check if Playwright session is still running
router.get('/auth/smartcard/playwright-status', (_req: Request, res: Response) => {
    res.json({
        running: !!playwrightSession,
        pid: playwrightSession?.pid,
        ageMs: playwrightSession ? Date.now() - playwrightSession.startedAt : null,
        phase: playwrightPhase,
    });
});

// Receive phase updates from grab-gateway-cookie.js script
router.post('/auth/smartcard/phase', (req: Request, res: Response) => {
    const { phase } = req.body;
    if (phase) {
        console.log(`[SmartCard/Playwright] Phase update: ${playwrightPhase} -> ${phase}`);
        playwrightPhase = phase;
    }
    res.json({ success: true });
});

// TC1 — Interactive smart card auth (no browser window)
// Uses PowerShell/.NET HttpClient with Automatic cert selection.
// Windows will show the native cert picker and PIN dialogs.
router.post('/auth/smartcard/interactive', async (_req: Request, res: Response) => {
    try {
        console.log('[SmartCard/Interactive] Starting interactive TLS auth...');

        const psScriptPath = path.join(process.cwd(), 'scripts', 'smartcard-auth-interactive.ps1');

        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);

        const { stdout, stderr } = await execFileAsync('powershell', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', psScriptPath,
        ], {
            timeout: 5 * 60 * 1000, // 5 min — wait for user to interact with cert/PIN dialogs
            maxBuffer: 1024 * 256,
            windowsHide: false, // MUST be false — cert/PIN dialogs need to be visible
        });

        if (stderr) console.log('[SmartCard/Interactive] PS stderr:', stderr.substring(0, 500));

        const jsonLine = stdout.split('\n').find((l: string) => l.trim().startsWith('{'));
        if (!jsonLine) {
            return res.status(500).json({ success: false, error: 'No JSON output from PowerShell script' });
        }

        const psResult = JSON.parse(jsonLine.trim());
        console.log(`[SmartCard/Interactive] Result: success=${psResult.success}, status=${psResult.statusCode}, cookies=${psResult.cookieCount}`);

        if (psResult.success && psResult.cookies && psResult.cookies.length > 0) {
            // Store session in auth service
            const sessionToken = psResult.cookies
                .find((c: string) => c.includes('mod_auth_openidc'))
                ?.split('=').slice(1).join('=');
            authService.storeGatewaySession(psResult.cookies, sessionToken);

            return res.json({
                success: true,
                authenticated: true,
                message: 'Smart card autentifikacija uspješna!',
                cookiesCount: psResult.cookies.length,
            });
        }

        // Auth failed
        res.json({
            success: false,
            error: psResult.error || `Autentifikacija nije uspjela (status: ${psResult.statusCode})`,
        });

    } catch (error: any) {
        console.error('[SmartCard/Interactive] Error:', error.message);
        // User may have cancelled the dialog or timed out
        const isTimeout = error.message?.includes('TIMEOUT') || error.killed;
        res.status(isTimeout ? 408 : 500).json({
            success: false,
            error: isTimeout
                ? 'Isteklo je vrijeme čekanja. Pokušajte ponovo.'
                : error.message,
        });
    }
});

// Legacy: Certilia auth URL (backward compat)
router.get('/auth/certilia', async (req: Request, res: Response) => {
    try {
        const result = await authService.initiateGatewayAuth('certilia');
        res.json({ authUrl: result.authUrl, state: 'gateway' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Certilia Programmatic Auth (cookie-jar based)
// ============================================================

// Stores active Certilia auth sessions
const certiliaClients: Map<string, CertiliaAuthClient> = new Map();

// Step 1: Initiate Certilia flow — follow gateway → SSO → Certilia login form
router.post('/auth/certilia/initiate', async (_req: Request, res: Response) => {
    try {
        const client = new CertiliaAuthClient();
        const formData = await client.initiate();

        // Store client with a session ID
        const sessionId = Math.random().toString(36).substring(2, 15);
        certiliaClients.set(sessionId, client);

        // Clean up old sessions after 10 minutes
        setTimeout(() => certiliaClients.delete(sessionId), 10 * 60 * 1000);

        res.json({
            success: true,
            sessionId,
            formData: {
                ready: formData.ready,
                sessionDataKey: formData.sessionDataKey.substring(0, 10) + '...',
            },
            message: 'Unesite Certilia korisničko ime (OIB ili email) i lozinku.',
        });
    } catch (error: any) {
        console.error('[Auth/Certilia] Initiate failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Step 2: Submit Certilia credentials
router.post('/auth/certilia/login', async (req: Request, res: Response) => {
    try {
        const { sessionId, username, password } = req.body;

        if (!sessionId || !username || !password) {
            return res.status(400).json({ error: 'Missing sessionId, username, or password' });
        }

        const client = certiliaClients.get(sessionId);
        if (!client) {
            return res.status(400).json({ error: 'Invalid or expired session. Please initiate again.' });
        }

        console.log(`[Auth/Certilia] Submitting credentials for: ${username}`);
        const result = await client.submitCredentials(username, password);

        if (result.success) {
            authService.storeGatewaySession(result.gatewayCookies, result.sessionToken);
            certiliaClients.delete(sessionId);
            res.json({ success: true, message: 'Autentikacija uspješna!', authenticated: true });
        } else if (result.error === 'PENDING_MOBILE_APPROVAL') {
            // Push notification sent, frontend should poll /auth/certilia/check
            res.json({
                success: true, pendingApproval: true, sessionId,
                message: 'Push obavijest poslana. Odobrite zahtjev u Certilia aplikaciji.'
            });
        } else {
            res.json({ success: false, error: result.error || 'Autentikacija nije uspjela' });
        }
    } catch (error: any) {
        console.error('[Auth/Certilia] Login failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Step 3: Check mobile approval status (called by frontend polling)
router.get('/auth/certilia/check', async (req: Request, res: Response) => {
    try {
        const sessionId = req.query.sessionId as string;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing sessionId' });
        }

        const client = certiliaClients.get(sessionId);
        if (!client) {
            return res.status(400).json({ error: 'Session expired' });
        }

        const result = await client.checkMobileApproval();

        if (result.success) {
            authService.storeGatewaySession(result.gatewayCookies, result.sessionToken);
            certiliaClients.delete(sessionId);
            res.json({ success: true, authenticated: true, message: 'Autentikacija uspješna!' });
        } else if (result.error === 'PENDING_MOBILE_APPROVAL') {
            res.json({ success: true, pending: true });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// OID Routes (Test Case 6)
// ============================================================

router.post('/oid/generate', async (req: Request, res: Response) => {
    try {
        const { quantity = 1 } = req.body;
        const oids = await oidService.generateOids(quantity);
        res.json({ success: true, oids });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Terminology Routes (Test Cases 7, 8)
// ============================================================

router.post('/terminology/sync', async (_req: Request, res: Response) => {
    try {
        const result = await terminologyService.syncAll();
        res.json({
            success: true,
            codeSystems: result.codeSystems.length,
            valueSets: result.valueSets.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/terminology/code-systems', async (req: Request, res: Response) => {
    try {
        const lastUpdated = req.query.lastUpdated
            ? new Date(req.query.lastUpdated as string)
            : undefined;
        const codeSystems = await terminologyService.syncCodeSystems(lastUpdated);
        res.json({ success: true, count: codeSystems.length, codeSystems });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/terminology/value-sets', async (req: Request, res: Response) => {
    try {
        const lastUpdated = req.query.lastUpdated
            ? new Date(req.query.lastUpdated as string)
            : undefined;
        const valueSets = await terminologyService.syncValueSets(lastUpdated);
        res.json({ success: true, count: valueSets.length, valueSets });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Local data endpoints (no CEZIH call, read from SQLite) ---
router.get('/terminology/local-code-systems', (req: Request, res: Response) => {
    try {
        const codeSystems = terminologyService.getLocalCodeSystems();
        res.json({ success: true, count: codeSystems.length, codeSystems });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/terminology/local-value-sets', (req: Request, res: Response) => {
    try {
        const valueSets = terminologyService.getLocalValueSets();
        res.json({ success: true, count: valueSets.length, valueSets });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/terminology/local-concepts', async (req: Request, res: Response) => {
    try {
        const system = req.query.system as string;
        if (!system) return res.status(400).json({ error: 'Missing system parameter' });
        const concepts = await terminologyService.getLocalConcepts(system);
        res.json({ success: true, count: concepts.length, concepts });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/terminology/debug', (req: Request, res: Response) => {
    try {
        const syncCount = db.prepare('SELECT count(*) as c FROM terminology_sync').get() as any;
        const conceptCount = db.prepare('SELECT count(*) as c FROM terminology_concepts').get() as any;
        const vsCount = db.prepare('SELECT count(*) as c FROM terminology_valuesets').get() as any;
        const vsWithResource = db.prepare('SELECT count(*) as c FROM terminology_valuesets WHERE fullResource IS NOT NULL').get() as any;
        
        const sampleSync = db.prepare('SELECT * FROM terminology_sync LIMIT 5').all();
        const sampleVs = db.prepare('SELECT url, (fullResource IS NOT NULL) as hasRes FROM terminology_valuesets LIMIT 5').all();

        res.json({
            success: true,
            counts: {
                sync: syncCount.c,
                concepts: conceptCount.c,
                valueSets: vsCount.c,
                vsWithResource: vsWithResource.c
            },
            samples: {
                sync: sampleSync,
                valueSets: sampleVs
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/terminology/diagnoses', async (req: Request, res: Response) => {
    try {
        const query = (req.query.q as string || '').toLowerCase();
        const results = terminologyService.searchConcepts(ENCOUNTER_CODES.ICD10_HR, query);
        res.json({ success: true, count: results.length, results });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Audit & Telemetry Routes
// ============================================================
router.get('/audit/logs', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const logs = auditService.getAllLogs(limit);
        res.json({ success: true, count: logs.length, logs });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/audit/logs/:visitId', (req: Request, res: Response) => {
    try {
        const logs = auditService.getLogsByVisit(req.params.visitId as string);
        res.json({ success: true, count: logs.length, logs });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// ============================================================
router.use('/patient', patientRoutes);

// ============================================================
// Visit Routes (Test Cases 12-14)
// ============================================================

router.get('/visit/all', async (req: Request, res: Response) => {
    try {
        const patientMbo = req.query.patientMbo as string;
        const visits = visitService.getVisits(patientMbo);
        res.json({ success: true, count: visits.length, visits });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/visit/create', async (req: Request, res: Response) => {
    // ... existing create ...
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await visitService.createVisit(req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/visit/:id', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await visitService.updateVisit(req.params.id as string, req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel a planned visit — sets status to 'cancelled'
router.post('/visit/:id/cancel', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { patientMbo } = req.body;
        const result = await visitService.cancelVisit(req.params.id as string, userToken, patientMbo);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/visit/:id/close', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { endDate, patientMbo } = req.body;
        const result = await visitService.closeVisit(req.params.id as string, endDate, userToken, patientMbo);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/visit/remote/:mbo - Dohvat posjeta s CEZIH-a
router.get('/visit/remote/:mbo', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || '';
        const visits = await visitService.searchRemoteVisits(req.params.mbo as string, token);
        res.json({ success: true, visits });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// Settings Routes
// ============================================================

router.get('/settings', (_req: Request, res: Response) => {
    try {
        const settings = settingsService.getSettings();
        res.json({ success: true, settings });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings/sync', async (_req: Request, res: Response) => {
    try {
        const result = await settingsService.forceSync();
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/settings/menu', (_req: Request, res: Response) => {
    try {
        const config = settingsService.getMenuConfig();
        res.json({ success: true, config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings/menu', (req: Request, res: Response) => {
    try {
        const result = settingsService.updateMenuConfig(req.body);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Document Type Labels — user-customizable display names for CEZIH codes
const DEFAULT_DOC_LABELS: Record<string, string> = {
    '011': 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
    '012': 'Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove',
    '013': 'Otpusno pismo iz privatne zdravstvene ustanove',
};

router.get('/settings/document-types', (_req: Request, res: Response) => {
    try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'document_type_labels'").get() as any;
        const labels = row ? JSON.parse(row.value) : DEFAULT_DOC_LABELS;
        res.json({ success: true, labels });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/settings/document-types', (req: Request, res: Response) => {
    try {
        const labels = req.body;
        if (!labels || typeof labels !== 'object') {
            return res.status(400).json({ success: false, error: 'Expected JSON object with code→label mapping' });
        }
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
            'document_type_labels',
            JSON.stringify(labels)
        );
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// Case Routes (Test Cases 15-17)
// ============================================================

router.get('/case/patient/:mbo', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const forceRefresh = req.query.refresh === 'true';
        const cases = await caseService.getPatientCases(req.params.mbo as string, userToken, forceRefresh);
        res.json({ success: true, count: cases.length, cases });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/case/create', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await caseService.createCase(req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/case/:id', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await caseService.updateCase(req.params.id as string, req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Case action dispatcher (2.2–2.8)
router.post('/case/:id/action', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { action, ...data } = req.body;
        if (!action) {
            return res.status(400).json({ success: false, error: 'Missing action code (2.2, 2.3, 2.4, 2.5, 2.7, 2.8)' });
        }
        const result = await caseService.performCaseAction(req.params.id as string, action, data, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// Clinical Document Routes (Test Cases 18-22)
// ============================================================

// TC18 Full Flow: sign inner bundle + build MHD outer + submit to CEZIH
// Frontend stepper calls TC16 first, waits 5s, then calls this endpoint
router.post('/document/send-full', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await clinicalDocumentService.sendDocumentFull(req.body, userToken);
        res.json(result);
    } catch (error: any) {
        console.error('[send-full] Error:', error.message);
        res.status(error.message?.includes('obavezno') ? 400 : 500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/document/send', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await clinicalDocumentService.sendDocument(req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        const isValidationError = error.message?.includes('Validacijske pogreške');
        res.status(isValidationError ? 400 : 500).json({ error: error.message });
    }
});

router.get('/document/remote-sign/status/:transactionCode', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { transactionCode } = req.params;
        const isSigned = await clinicalDocumentService.checkRemoteSigningStatus(transactionCode as string, userToken);
        res.json({ success: true, isSigned });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/document/send/complete', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { documentOid, transactionCode } = req.body;
        const result = await clinicalDocumentService.completeRemoteSigning(documentOid, transactionCode, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Smart Card signing: signs locally via PKCS#11 and submits to CEZIH
router.post('/document/smartcard-sign', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { documentOid, signPin } = req.body;
        const result = await clinicalDocumentService.completeSmartCardSigning(documentOid, '', userToken, signPin);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// TEMP: Update document bundle (for testing corrected bundle structure)
router.put('/document/:oid/bundle', async (req: Request, res: Response) => {
    try {
        const { oid } = req.params;
        const { bundleJson } = req.body;
        if (!bundleJson) return res.status(400).json({ error: 'Missing bundleJson' });
        db.prepare('UPDATE documents SET bundleJson = ? WHERE id = ?').run(bundleJson, oid);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});



// Sign-only: sign bundle locally and return Base64 WITHOUT submitting to CEZIH
// Used for TC18 to get a signed B64 for a custom outer MHD wrapper
router.post('/document/sign-bundle-only', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { documentOid } = req.body;
        if (!documentOid) return res.status(400).json({ error: 'Missing documentOid' });

        const localDoc = clinicalDocumentService.getDocument(documentOid);
        if (!localDoc || !localDoc.bundleJson) return res.status(404).json({ error: 'Document not found' });

        const pendingBundle = JSON.parse(localDoc.bundleJson);
        const signedResult = await signatureService.signBundle(pendingBundle, undefined, userToken);
        const signedB64 = Buffer.from(JSON.stringify(signedResult.bundle)).toString('base64');

        res.json({ success: true, signedB64, documentOid });
    } catch (error: any) {
        console.error('[Sign-Only] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Certilia signing: initiate Certilia remote signing after user selects this method
router.post('/document/certilia-sign', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { documentOid } = req.body;

        if (!documentOid) {
            return res.status(400).json({ error: 'Missing documentOid' });
        }

        console.log(`[Certilia Sign] Initiating remote signing for doc=${documentOid}`);

        const result = await clinicalDocumentService.initiateRemoteSigning(documentOid, userToken);
        res.json(result);
    } catch (error: any) {
        console.error('[Certilia Sign] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/document/replace', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { originalDocumentOid, ...data } = req.body;
        const result = await clinicalDocumentService.replaceDocument(originalDocumentOid, data, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        const isValidationError = error.message?.includes('Validacijske pogreške');
        res.status(isValidationError ? 400 : 500).json({ error: error.message });
    }
});

router.post('/document/cancel', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { documentOid } = req.body;
        const result = await clinicalDocumentService.cancelDocument(documentOid, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/document/search-remote', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const documents = await clinicalDocumentService.searchRemoteDocuments({
            patientMbo: req.query.patientMbo as string,
        }, userToken);
        res.json({ success: true, count: documents.length, documents });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message, documents: [] });
    }
});

router.get('/document/search', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const documents = await clinicalDocumentService.searchDocuments({
            patientMbo: req.query.patientMbo as string,
            id: (req.query.id || req.query.oid) as string,
            status: req.query.status as string
        }, userToken);
        res.json({ success: true, count: documents.length, documents });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/document/retrieve', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'Provide url query parameter' });
        }
        const document = await clinicalDocumentService.retrieveDocument(url as string, userToken);
        res.json({ success: true, document });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// RAW MHD Send (TC18 bypass) — prihvaća gotov bundle, šalje direktno na CEZIH
// bez ikakve lokalne validacije. Korisno za certification testing.
// ============================================================
router.post('/document/mhd-raw', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { mhdBundle, documentOid } = req.body;

        if (!mhdBundle || mhdBundle.resourceType !== 'Bundle') {
            return res.status(400).json({ error: 'Missing or invalid mhdBundle in request body' });
        }

        // Use clinicalDocumentService to send directly to CEZIH (bypasses validation)
        const result = await clinicalDocumentService.submitMhdBundleRaw(mhdBundle, documentOid || 'raw-test', userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[mhd-raw] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

