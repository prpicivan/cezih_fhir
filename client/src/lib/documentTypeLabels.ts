/**
 * CEZIH Clinical Document Type Labels
 * Based on CodeSystem: http://fhir.cezih.hr/specifikacije/CodeSystem/document-type
 *
 * Only codes relevant for private healthcare institutions (011, 012, 013).
 * Labels can be customized via Settings → Nazivi kliničke dokumentacije.
 */

// Default full labels
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    '011': 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
    '012': 'Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove',
    '013': 'Otpusno pismo iz privatne zdravstvene ustanove',
};

// Short labels for compact UI elements (sidebar, table cells, etc.)
export const DOCUMENT_TYPE_SHORT_LABELS: Record<string, string> = {
    '011': 'Ambulantno izvješće',
    '012': 'Specijalistički nalaz',
    '013': 'Otpusno pismo',
    // Legacy aliases — backward compat for documents already in DB with old type strings
    'ambulatory-report': 'Ambulantno izvješće',
    'specialist-finding': 'Specijalistički nalaz',
    'discharge-letter': 'Otpusno pismo',
    'discharge-summary': 'Otpusno pismo',
    'AMBULATORY_REPORT': 'Ambulantno izvješće',
    'SPECIALIST_REPORT': 'Specijalistički nalaz',
    'DISCHARGE_SUMMARY': 'Otpusno pismo',
};

/** Full Croatian display name for a CEZIH document type code. Falls back to raw code. */
export function getDocumentTypeLabel(code: string): string {
    return DOCUMENT_TYPE_LABELS[code] || code;
}

/** Short Croatian label for compact UI elements. Falls back to raw code. */
export function getDocumentTypeShortLabel(code: string): string {
    return DOCUMENT_TYPE_SHORT_LABELS[code] || code;
}
