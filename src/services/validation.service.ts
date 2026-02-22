/**
 * Validation Service
 * Enforces strict rules for G9 integration.
 */
import { terminologyService } from './terminology.service';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

class ValidationService {
    /**
     * Validate Patient Identifiers
     */
    validatePatientId(id: string, type: 'MBO' | 'OIB' | 'putovnica' | 'EKZO'): ValidationResult {
        const errors: string[] = [];

        switch (type) {
            case 'MBO':
                if (!/^\d{9}$/.test(id)) {
                    errors.push('MBO mora sadržavati točno 9 znamenki.');
                }
                break;
            case 'OIB':
                if (!/^\d{11}$/.test(id)) {
                    errors.push('OIB mora sadržavati točno 11 znamenki.');
                }
                break;
            case 'putovnica':
            case 'EKZO':
                if (!id || id.trim().length < 3) {
                    errors.push(`Identifikator tipa ${type} je prekratak ili neispravan.`);
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate MKB-10 Diagnosis
     */
    validateDiagnosis(code: string): ValidationResult {
        const errors: string[] = [];
        const system = 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr';

        const concept = terminologyService.lookupConcept(system, code);
        if (!concept) {
            errors.push(`Dijagnoza sa šifrom "${code}" nije pronađena u važećem MKB-10 šifrarniku.`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate Text Field Lengths
     */
    validateTextLimits(data: { [key: string]: any }, fields: string[]): ValidationResult {
        const errors: string[] = [];
        const LIMIT = 4000;

        for (const field of fields) {
            const value = data[field];
            if (value && typeof value === 'string' && value.length > LIMIT) {
                errors.push(`Polje "${field}" premašuje limit od ${LIMIT} znakova (trenutno: ${value.length}).`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Comprehensive Document Validation
     */
    validateDocument(data: any): ValidationResult {
        const errors: string[] = [];

        // 1. Validate Patient ID
        if (data.patientMbo) {
            const res = this.validatePatientId(data.patientMbo, 'MBO');
            if (!res.isValid) errors.push(...res.errors);
        } else if (data.foreignerId && data.foreignerType) {
            const res = this.validatePatientId(data.foreignerId, data.foreignerType as any);
            if (!res.isValid) errors.push(...res.errors);
        } else {
            errors.push('Identifikator pacijenta (MBO ili strani identifikator) je obavezan.');
        }

        // 2. Validate Diagnosis
        if (data.diagnosisCode) {
            const res = this.validateDiagnosis(data.diagnosisCode);
            if (!res.isValid) errors.push(...res.errors);
        } else {
            errors.push('Šifra dijagnoze je obavezna za klinički dokument.');
        }

        // 3. Validate Text Limits
        const limitRes = this.validateTextLimits(data, ['anamnesis', 'finding', 'recommendation', 'status_text']);
        if (!limitRes.isValid) errors.push(...limitRes.errors);

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export const validationService = new ValidationService();
