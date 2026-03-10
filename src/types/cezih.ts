/**
 * CEZIH FHIR Identifier System URIs
 * Based on: https://simplifier.net/guide/cezih-osnova/Početna/Identifikatori
 */
export const CEZIH_IDENTIFIERS = {
    // Patient Identifiers
    MBO: 'http://fhir.cezih.hr/specifikacije/identifikatori/MBO',
    OIB: 'http://fhir.cezih.hr/specifikacije/identifikatori/OIB',
    EU_CARD: 'http://fhir.cezih.hr/specifikacije/identifikatori/europska-kartica',
    PASSPORT: 'http://fhir.cezih.hr/specifikacije/identifikatori/putovnica',
    UNIQUE_PATIENT_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/jedinstveni-identifikator-pacijenta',
    SUPPLEMENTARY_INSURANCE: 'http://fhir.cezih.hr/specifikacije/identifikatori/dopunsko-osiguranje',

    // Visit/Case Identifiers
    VISIT_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/identifikator-posjete',
    LOCAL_VISIT_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/lokalni-identifikator-posjete',
    CASE_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/slucaj',
    LOCAL_CASE_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/lokalni-identifikator-slucaja',
    REFERRAL_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/ID-uputnice',
    EMERGENCY_ADMISSION_NUMBER: 'http://fhir.cezih.hr/specifikacije/identifikatori/evidencijski-broj-hitnog-prijema',
    PATIENT_RECORD: 'http://fhir.cezih.hr/specifikacije/identifikatori/bolesnicki-list',

    // Organization Identifiers
    HZZO_ORG_CODE: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije',
    HZJZ_ORG_NUMBER: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-ustanove',
    UNIQUE_ORG_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/jedinstveni-identifikator-zdravstvene-organizacije',

    // Practitioner Identifiers
    HZJZ_WORKER_NUMBER: 'http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika',
    UNIQUE_PRACTITIONER_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/jedinstveni-identifikator-zdravstvenog-djelatnika',
    HZJZ_EMPLOYMENT_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/hzjz-id-zaposlenja',
    HZJZ_WORKER_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/hzjz-id-djelatnika',

    // Other Identifiers
    INFO_SYSTEM: 'http://fhir.cezih.hr/specifikacije/identifikatori/informacijski-sustav',
    SPECIMEN_ID: 'http://fhir.cezih.hr/specifikacije/identifikatori/specimen-id',
    CUSTOMER_ORDER_NUMBER: 'http://fhir.cezih.hr/specifikacije/identifikatori/customer-order-number',
    ORDERED_TEST_NUMBER: 'http://fhir.cezih.hr/specifikacije/identifikatori/ordered-test-number',
    APPROVAL_ID: 'http://fhir.cezih.hr/identifikatori/ID-odobrenja',
} as const;

/**
 * CEZIH FHIR Extensions
 */
export const CEZIH_EXTENSIONS = {
    PATIENT_LAST_CONTACT: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-patient-last-contact',
    ENCOUNTER_PROFILE: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter',
    EPISODE_OF_CARE_PROFILE: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-episode-of-care',
    COST_PARTICIPATION: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-troskovi-sudjelovanje',
    RELATED_CASE: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/vezani-slucaj',
    PREVIOUS_HEALTH_ISSUE: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/prethodni-zdravstveni-problem',
    ANNOTATION_TYPE: 'http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-annotation-type',
} as const;

/**
 * OID Type CodeSystem
 */
export const OID_TYPES = {
    SYSTEM: 'http://ent.hr/fhir/CodeSystem/ehe-oid-types',
    DOCUMENT: '1', // OID type for documents
} as const;

/**
 * Error CodeSystem
 */
export const ERROR_TYPES = {
    SYSTEM: 'http://ent.hr/fhir/CodeSystem/message-error-type',
} as const;

/**
 * Document & Section CodeSystems
 */
export const DOCUMENT_CODES = {
    TYPE_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-type',
    SECTION_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/document-section',

    // Document Types
    TYPE_AMBULATORY: '011',  // Izvješće nakon pregleda...
    TYPE_SPECIALIST: '012',  // Nalaz iz specijalističke... (Assumption, verify)
    TYPE_DISCHARGE: '013',   // Otpusno pismo... (Assumption, verify)

    // Sections
    SECTION_ACTIVITY: '12',             // Djelatnost
    SECTION_MEDICAL_INFO: '18',         // Medicinska informacija
    SECTION_ATTACHMENTS: '16',          // Priloženi dokumenti
} as const;

/**
 * Encounter & Case Coding Systems
 */
export const ENCOUNTER_CODES = {
    COST_PARTICIPATION_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/sudjelovanje-u-troskovima',
    EXEMPTION_REASON_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/sifra-oslobodjenja-od-sudjelovanja-u-troskovima',
    VISIT_TYPE_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/vrsta-posjete',
    VISIT_SUBTYPE_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/hr-tip-posjete',
    ICD10_HR: 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr',
    ANNOTATION_TYPE_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/annotation-type',
    RELATIONSHIP_TYPE_SYSTEM: 'http://fhir.cezih.hr/specifikacije/CodeSystem/relationship-type',
} as const;

/**
 * Encounter Class CodeSystem
 */
export const ENCOUNTER_CLASS_SYSTEM = 'http://fhir.cezih.hr/specifikacije/CodeSystem/nacin-prijema';
export const ENCOUNTER_CLASSES = {
    AMB: '1',    // Redovni
    EMER: '2',   // Hitni
    IMP: '3',    // Stacionarni
    OTHER: '6',  // Ostalo
} as const;

/**
 * Clinical Document Types for Private Clinics
 */
export enum ClinicalDocumentType {
    AMBULATORY_REPORT = '011',       // Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove
    SPECIALIST_FINDING = '012',       // Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove
    DISCHARGE_LETTER = '013',         // Otpusno pismo iz privatne zdravstvene ustanove
}

/**
 * CEZIH User Roles (for authorization)
 */
export type CezihRole =
    | 'admission_officer'
    | 'aid_approver'
    | 'aid_supplier'
    | 'biochemistry_engineer'
    | 'dentist'
    | 'ftuk_approver'
    | 'gynecologist'
    | 'home_caregiver'
    | 'home_therapist'
    | 'laboratory_technician'
    | 'nurse'
    | 'pediatrician'
    | 'pharmacist_technician'
    | 'pharmacologist'
    | 'physician_school'
    | 'physicians'
    | 'sgp_administrator'
    | 'sgp_laboratory_technician'
    | 'specialist'
    | 'specialistic_nurse'
    | 'specialistic_technician'
    | 'private_care_specialist';

/**
 * Auth Token Response from CEZIH OAuth2
 */
export interface CezihTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_expires_in: number;
    refresh_token: string;
    token_type: string;
    'not-before-policy': number;
    session_state: string;
}

/**
 * OID Registry Request
 */
export interface OidRegistryRequest {
    oidType: {
        system: string;
        code: string;
    };
    quantity: number;
}

/**
 * OID Registry Response
 */
export interface OidRegistryResponse {
    oid: string[];
}

/**
 * CEZIH Error Response
 */
export interface CezihErrorResponse {
    error: {
        errorCode: {
            system: string;
            code: string;
        };
        errorDescription: string;
    };
}
