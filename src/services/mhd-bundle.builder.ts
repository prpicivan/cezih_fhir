/**
 * MHD Bundle Builder — Shared logic for TC18 (create) and TC19 (replace)
 * Extracted from TC18's proven, CEZIH-accepted bundle structure.
 */
import { v4 as uuidv4 } from 'uuid';
import { signatureService } from './signature.service';
import { authService } from './auth.service';
import { oidService } from './oid.service';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// ── Constants ──
const CEZIH_SYSTEMS = {
    MBO: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO',
    HZJZ: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
    OIB: 'http://fhir.cezih.hr/specifikacije/identifikatori/OIB',
    HZZO_ORG: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
    VISIT: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-posjete',
    CASE: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-slucaja',
    ACTIVITY: 'http://fhir.cezih.hr/specifikacije/identifikatori/ID-djelatnosti',
};

export interface MhdDocumentParams {
    docOid: string;                  // Document OID (urn:oid:...)
    patientMbo: string;
    patientName: { family: string; given: string[] };
    patientGender: string;
    patientBirthDate: string;
    patientCezihId: string;          // e.g. "1118065" — Patient logical ID on CEZIH
    practitionerId: string;          // HZJZ number
    practitionerOib: string;
    practitionerName: { family: string; given: string[] };
    orgId: string;                   // HZZO org code
    orgDisplay: string;
    encCezihId: string;              // CEZIH visit identifier
    condFhirId: string;              // CEZIH case identifier
    diagnosisCode: string;
    anamnesis: string;
    finding?: string;                // Klinički nalaz i status
    status?: string;                 // Status (alternative key for finding)
    recommendation?: string;         // Preporuka
    activityCode?: string;           // Healthcare service code (default: 3030000)
    activityDisplay?: string;
    signPin?: string;                // Sign token PIN (optional)
    replacesOid?: string;            // TC19: OID being replaced (urn:oid:... format)
}

/**
 * Generate the precise timestamp format CEZIH expects
 * toISOString() gives ms + Z → we keep ms and replace Z with +01:00
 */
function cezihTimestamp(): string {
    const now = new Date();
    const offsetMin = now.getTimezoneOffset();
    const sign = offsetMin <= 0 ? '+' : '-';
    const absOff = Math.abs(offsetMin);
    const tzH = String(Math.floor(absOff / 60)).padStart(2, '0');
    const tzM = String(absOff % 60).padStart(2, '0');
    return now.toISOString().replace(/\.(\d{3})Z$/, `.$1${sign}${tzH}:${tzM}`);
}

/**
 * Build the self-contained inner document bundle (9 resources)
 * Identical to TC18 proven structure.
 */
export function buildInnerBundle(p: MhdDocumentParams): any {
    const docDate = cezihTimestamp();
    const U = {
        comp: uuidv4(), pat: uuidv4(), prac: uuidv4(), org: uuidv4(),
        enc: uuidv4(), ci: uuidv4(), hcs: uuidv4(),
        obsAnam: uuidv4(), obsIshod: uuidv4(),
        obsNalaz: uuidv4(), obsPreporuka: uuidv4(),
    };
    const actCode = p.activityCode || '3030000';
    const actDisplay = p.activityDisplay || 'Opca/obiteljska medicina';

    return {
        resourceType: 'Bundle', id: uuidv4(), type: 'document',
        identifier: { system: 'urn:ietf:rfc:3986', value: p.docOid },
        timestamp: docDate,
        entry: [
            {
                fullUrl: `urn:uuid:${U.comp}`,
                resource: {
                    resourceType: 'Composition',
                    meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/izvjesce-nakon-pregleda-u-ambulanti-privatne-zdravstvene-ustanove'] },
                    identifier: { system: 'urn:ietf:rfc:3986', value: p.docOid },
                    language: 'hr', status: 'final', confidentiality: 'N',
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
                        },
                        {
                            title: 'Anamneza i anamnestički podaci',
                            text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${p.anamnesis}</div>` },
                        },
                        ...(p.finding || p.status ? [{
                            title: 'Klinički nalaz i status',
                            text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${p.finding || p.status}</div>` },
                        }] : []),
                        ...(p.recommendation ? [{
                            title: 'Terapija',
                            text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${p.recommendation}</div>` },
                        },
                        {
                            title: 'Preporuka',
                            text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${p.recommendation}</div>` },
                        }] : [])
                    ]
                }
            },
            { fullUrl: `urn:uuid:${U.pat}`, resource: { resourceType: 'Patient', identifier: [{ system: CEZIH_SYSTEMS.MBO, value: p.patientMbo }], name: [{ family: p.patientName.family, given: p.patientName.given }], gender: p.patientGender, birthDate: p.patientBirthDate } },
            { fullUrl: `urn:uuid:${U.prac}`, resource: { resourceType: 'Practitioner', identifier: [{ system: CEZIH_SYSTEMS.HZJZ, value: p.practitionerId }, { system: CEZIH_SYSTEMS.OIB, value: p.practitionerOib }], name: [{ family: p.practitionerName.family, given: p.practitionerName.given }] } },
            { fullUrl: `urn:uuid:${U.org}`, resource: { resourceType: 'Organization', identifier: [{ system: CEZIH_SYSTEMS.HZZO_ORG, value: p.orgId }] } },
            { fullUrl: `urn:uuid:${U.enc}`, resource: { resourceType: 'Encounter', identifier: [{ system: CEZIH_SYSTEMS.VISIT, value: p.encCezihId }], status: 'finished', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' }, subject: { reference: `urn:uuid:${U.pat}` } } },
            { fullUrl: `urn:uuid:${U.ci}`, resource: { resourceType: 'Condition', identifier: [{ system: CEZIH_SYSTEMS.CASE, value: p.condFhirId }], clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, subject: { reference: `urn:uuid:${U.pat}` }, code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr', code: p.diagnosisCode }] } } },
            { fullUrl: `urn:uuid:${U.hcs}`, resource: { resourceType: 'HealthcareService', identifier: [{ system: CEZIH_SYSTEMS.ACTIVITY, value: actCode }], providedBy: { reference: `urn:uuid:${U.org}` }, name: actDisplay } },
            { fullUrl: `urn:uuid:${U.obsAnam}`, resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/observations', code: '15', display: 'Anamneza' }] }, subject: { reference: `urn:uuid:${U.pat}` }, valueString: p.anamnesis } },
            { fullUrl: `urn:uuid:${U.obsIshod}`, resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/observations', code: '24', display: 'Ishod pregleda' }] }, valueCodeableConcept: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/sifrarnik-zavrsetaka-pregleda', version: '0.1.0', code: '1', display: 'Pregled zavrsen uspjesno' }] } } }
        ],
        signature: {
            type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
            when: docDate,
            who: { reference: `urn:uuid:${U.prac}` },
            data: ''
        }
    };
}

/**
 * Sign the inner bundle and build the outer MHD transaction wrapper.
 * Returns the complete outer bundle ready for CEZIH submission.
 */
export async function buildMhdBundle(p: MhdDocumentParams): Promise<{ outer: any; innerBundle: any }> {
    const innerBundle = buildInnerBundle(p);
    const outerDate = cezihTimestamp();

    // Sign with Sign token
    const signedResult = await signatureService.signBundle(innerBundle, `urn:uuid:${innerBundle.entry[2].fullUrl.split(':').pop()}`, '', p.signPin);
    const signedBundle = signedResult.bundle;
    const signedB64 = Buffer.from(JSON.stringify(signedBundle), 'utf8').toString('base64').replace(/\n/g, '').replace(/\r/g, '');

    const listUuid = uuidv4(), docRefUuid = uuidv4(), binUuid = uuidv4();
    const subOidRaw = await oidService.generateSingleOid();

    const hybridSubject = {
        reference: `Patient/${p.patientCezihId}`,
        identifier: { system: CEZIH_SYSTEMS.MBO, value: p.patientMbo }
    };

    const practitionerDisplay = `${p.practitionerName.given.join(' ')} ${p.practitionerName.family}`;

    // DocumentReference resource
    const docRef: any = {
        resourceType: 'DocumentReference',
        meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HR.MinimalDocumentReference'] },
        masterIdentifier: { use: 'usual', system: 'urn:ietf:rfc:3986', value: p.docOid },
        identifier: [{ use: 'official', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${docRefUuid}` }],
        status: 'current',
        type: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type', code: '011' }] },
        subject: {
            reference: `Patient/${p.patientCezihId}`, type: 'Patient',
            identifier: { system: CEZIH_SYSTEMS.MBO, value: p.patientMbo },
            display: `${p.patientName.given.join(' ')} ${p.patientName.family}`
        },
        date: outerDate,
        author: [{ type: 'Practitioner', identifier: { system: CEZIH_SYSTEMS.HZJZ, value: p.practitionerId }, display: practitionerDisplay }],
        authenticator: { type: 'Practitioner', identifier: { system: CEZIH_SYSTEMS.HZJZ, value: p.practitionerId }, display: practitionerDisplay },
        custodian: { type: 'Organization', identifier: { system: CEZIH_SYSTEMS.HZZO_ORG, value: p.orgId }, display: p.orgDisplay },
        content: [{ attachment: { contentType: 'application/fhir+json; charset=utf-8', language: 'hr', url: `urn:uuid:${binUuid}` } }],
        context: {
            encounter: [{ type: 'Encounter', identifier: { system: CEZIH_SYSTEMS.VISIT, value: p.encCezihId } }],
            period: { start: outerDate },
            practiceSetting: { coding: [{ system: 'http://fhir.cezih.hr/specifikacije/CodeSystem/djelatnosti-zz', code: '1010000', display: 'Opca/obiteljska medicina' }] },
            sourcePatientInfo: { identifier: { system: CEZIH_SYSTEMS.MBO, value: p.patientMbo } },
            related: [{ type: 'Condition', identifier: { system: CEZIH_SYSTEMS.CASE, value: p.condFhirId } }]
        }
    };

    // TC19: Add relatesTo for document replacement
    if (p.replacesOid) {
        docRef.relatesTo = [{
            code: 'replaces',
            target: {
                identifier: {
                    system: 'urn:ietf:rfc:3986',
                    value: p.replacesOid.startsWith('urn:oid:') ? p.replacesOid : `urn:oid:${p.replacesOid}`
                }
            }
        }];
    }

    const outer = {
        resourceType: 'Bundle', type: 'transaction',
        meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle'] },
        entry: [
            {
                fullUrl: `urn:uuid:${listUuid}`,
                resource: {
                    resourceType: 'List',
                    meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalSubmissionSet'] },
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
                resource: docRef,
                request: { method: 'POST', url: 'DocumentReference' }
            },
            {
                fullUrl: `urn:uuid:${binUuid}`,
                resource: { resourceType: 'Binary', id: binUuid, contentType: 'application/fhir+json; charset=utf-8', data: signedB64 },
                request: { method: 'POST', url: 'Binary' }
            }
        ]
    };

    // Debug: save outer bundle
    try { fs.writeFileSync(path.join(process.cwd(), 'tmp', 'mhd-outer.json'), JSON.stringify(outer, null, 2)); } catch (e) { }

    return { outer, innerBundle };
}

/**
 * Submit MHD bundle to CEZIH gateway with proper auth headers.
 */
export async function submitMhdToGateway(bundle: any): Promise<{ success: boolean; data: any; error?: string }> {
    let headers: Record<string, string> = {};
    try { headers = await authService.getSystemAuthHeaders(); } catch { headers = {}; }
    const gatewayHeaders = authService.hasGatewaySession() ? authService.getGatewayAuthHeaders() : {};
    const combinedHeaders = {
        ...headers,
        ...(gatewayHeaders.Cookie ? { Cookie: gatewayHeaders.Cookie } : {}),
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
    };

    const url = `${config.cezih.gatewayBase}${config.cezih.services.document}/iti-65-service`;
    console.log(`[MhdBuilder] Submitting to CEZIH: ${url}`);

    try {
        const response = await axios.post(url, bundle, { headers: combinedHeaders });
        console.log('[MhdBuilder] ✅ CEZIH accepted!');
        return { success: true, data: response.data };
    } catch (error: any) {
        console.warn('[MhdBuilder] CEZIH error:', error.response?.status);
        const fullResponse = error.response?.data;
        // Debug: save full error response
        try { fs.writeFileSync(path.join(process.cwd(), 'tmp', 'cezih-mhd-error.json'), JSON.stringify(fullResponse, null, 2)); } catch (e) { }
        console.error('[MhdBuilder] CEZIH full error:', JSON.stringify(fullResponse, null, 2));
        const issues = fullResponse?.issue?.map((i: any) => ({
            severity: i.severity,
            code: i.details?.coding?.[0]?.code || i.details?.text || i.code,
            diagnostics: i.diagnostics,
            location: i.location
        })) || [];
        return {
            success: false,
            data: { cezihStatus: 'failed', cezihError: `HTTP ${error.response?.status}`, issues, fullResponse },
            error: error.message
        };
    }
}
