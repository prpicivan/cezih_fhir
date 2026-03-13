/**
 * Patient Service (Test Cases 10, 11)
 * Patient demographics retrieval (IHE PDQm ITI-78) and foreigner registration (IHE PMIR).
 */
import axios from 'axios';
import { config } from '../config';
import { authService } from './auth.service';
import {
    CEZIH_IDENTIFIERS,
    CEZIH_EXTENSIONS
} from '../types';
import db from '../db';
import { auditService } from './audit.service';

export interface PatientDemographics {
    id: string;
    mbo?: string;
    oib?: string;
    cezihId?: string; // MPI ID from CEZIH
    name: {
        text: string;
        family: string;
        given: string[];
    };
    gender: string;
    birthDate: string;
    deceasedDateTime?: string;
    lastContact?: string;
    lastSyncAt?: string;
    active: boolean;
    raw: any; // Full FHIR Patient resource
    passportNumber?: string;
    euCardNumber?: string;
    cezihUniqueId?: string;
}

export interface ForeignerRegistrationData {
    passportNumber?: string;
    euCardNumber?: string;
    // Legacy mapping support
    idNumber?: string;
    idType?: string;
    firstName?: string;
    lastName?: string;

    name: {
        family: string;
        given: string[];
    };
    gender: 'male' | 'female' | 'other' | 'unknown';
    birthDate: string;
    nationality?: string;
}

class PatientService {
    // ============================================================
    // Test Case 10: Patient Demographics (IHE PDQm ITI-78)
    // ============================================================

    /**
     * Search for patient demographics by MBO.
     * Requires end-user authentication.
     */
    async searchByMbo(mbo: string, userToken: string): Promise<PatientDemographics[]> {
        return this.searchPatients(
            `identifier=${CEZIH_IDENTIFIERS.MBO}|${mbo}`,
            userToken
        );
    }

    /**
     * Search for patient demographics by OIB.
     */
    async searchByOib(oib: string, userToken: string): Promise<PatientDemographics[]> {
        return this.searchPatients(
            `identifier=${CEZIH_IDENTIFIERS.OIB}|${oib}`,
            userToken
        );
    }

    /**
     * Search for multiple patients by MBOs.
     */
    async searchByMultipleMbos(mbos: string[], userToken: string): Promise<PatientDemographics[]> {
        const identifiers = mbos
            .map(mbo => `${CEZIH_IDENTIFIERS.MBO}|${mbo}`)
            .join(',');
        return this.searchPatients(`identifier=${identifiers}`, userToken);
    }

    /**
     * Search for patient demographics by Passport.
     */
    async searchByPassport(passport: string, userToken: string): Promise<PatientDemographics[]> {
        return this.searchPatients(
            `identifier=${CEZIH_IDENTIFIERS.PASSPORT}|${passport}`,
            userToken
        );
    }

    /**
     * Search for patient demographics by EU Card / EKZO.
     */
    async searchByEuCard(euCard: string, userToken: string): Promise<PatientDemographics[]> {
        return this.searchPatients(
            `identifier=${CEZIH_IDENTIFIERS.EU_CARD}|${euCard}`,
            userToken
        );
    }

    /**
     * Search for patient with fallback: local DB first, then CEZIH identifier search.
     * Useful for searching foreigners by passport/EKZO.
     */
    async searchByIdentifier(identifier: string, userToken: string): Promise<PatientDemographics[]> {
        // 1. Check local DB first (fuzzy match or exact identifier)
        const local = await this.getLocalPatients(identifier);
        const match = local.find(p =>
            p.mbo === identifier ||
            p.oib === identifier ||
            p.passportNumber === identifier ||
            p.euCardNumber === identifier ||
            p.cezihUniqueId === identifier
        );
        if (match) return [match];

        // 2. Fallback to CEZIH PDQm search using raw identifier
        return this.searchPatients(`identifier=${identifier}`, userToken);
    }

    async searchRemoteByMbo(mbo: string, userToken: string): Promise<PatientDemographics[]> {
        return this.searchPatients(
            `identifier=${CEZIH_IDENTIFIERS.MBO}|${mbo}`,
            userToken,
            false // autoSave = false for pure remote lookup
        );
    }

    /**
     * Explicitly sync a patient by MBO from CEZIH to local DB.
     */
    async syncPatient(mbo: string, userToken: string): Promise<PatientDemographics> {
        console.log('[PatientService] Explicit sync for MBO:', mbo);
        const results = await this.searchPatients(
            `identifier=${CEZIH_IDENTIFIERS.MBO}|${mbo}`,
            userToken,
            true // autoSave = true
        );
        if (results.length === 0) {
            throw new Error(`Patient with MBO ${mbo} not found on CEZIH.`);
        }

        // Deep Sync: Also refresh cases
        try {
            const { caseService } = require('./index'); // Avoid circular dep if needed, or import at top
            await caseService.getPatientCases(mbo, userToken, true);
        } catch (caseErr: any) {
            console.warn('[PatientService] Deep sync (cases) failed:', caseErr.message);
        }

        return results[0];
    }

    /**
     * Get the best identifier for FHIR references (e.g., MBO for locals, Unique ID for foreigners).
     * Returns { system, value }
     */
    getPatientIdentifier(identifierValue: string): { system: string, value: string } {
        try {
            const patient = db.prepare('SELECT * FROM patients WHERE mbo = ? OR oib = ? OR cezihUniqueId = ?').get(identifierValue, identifierValue, identifierValue) as any;
            if (patient) {
                if (patient.cezihUniqueId) {
                    return { system: CEZIH_IDENTIFIERS.UNIQUE_PATIENT_ID, value: patient.cezihUniqueId };
                } else if (patient.mbo && /^\d{9}$/.test(patient.mbo)) {
                    return { system: CEZIH_IDENTIFIERS.MBO, value: patient.mbo };
                } else if (patient.euCardNumber) {
                    return { system: CEZIH_IDENTIFIERS.EU_CARD, value: patient.euCardNumber };
                } else if (patient.passportNumber) {
                    return { system: CEZIH_IDENTIFIERS.PASSPORT, value: patient.passportNumber };
                }
            }
        } catch (e) {
            console.warn('[PatientService] DB lookup failed for identifier mapping', e);
        }

        // Default fallback (compatible with existing hardcoded logic)
        return { system: CEZIH_IDENTIFIERS.MBO, value: identifierValue };
    }

    private async searchPatients(query: string, userToken: string, autoSave: boolean = true): Promise<PatientDemographics[]> {
        // Log the incoming request from G9 immediately — before any local or remote lookup
        const mboFromQuery = query.match(/\|([A-Za-z0-9]+)/)?.[1];
        await auditService.log({
            patientMbo: mboFromQuery,
            action: 'PATIENT_SEARCH',
            direction: 'INCOMING_G9',
            status: 'SUCCESS',
            payload_req: { query, source: 'G9 aplikacija' },
        });

        try {
            // 1. Try Local DB first (Mock Mode / Hybrid) unless explicitly searching remote
            const idMatch = query.match(/\|([A-Za-z0-9-]+)/);
            if (idMatch && autoSave) {
                const idValue = idMatch[1];
                const stmt = db.prepare(`
                    SELECT * FROM patients 
                    WHERE mbo = ? OR oib = ? OR cezihId = ? 
                    OR mbo IN (SELECT mbo FROM patients WHERE mbo = ?)
                `);
                // For passport/ekzo we might need a better local mapping if they are not stored as MBO
                // But typically for registered foreigners, MBO is the temp ID or assigned MBO.
                const localPatient = db.prepare(`
                    SELECT * FROM patients 
                    WHERE mbo = ? OR oib = ? OR cezihId = ?
                `).get(idValue, idValue, idValue) as any;

                if (localPatient) {
                    console.log('[PatientService] Found patient in local DB:', idValue);
                    return [this.mapLocalPatient(localPatient)];
                }
            }

            // 2. Fallback to CEZIH API
            const headers = authService.getUserAuthHeaders(userToken);
            const baseUrl = `${config.cezih.gatewayBase}${config.cezih.services.patient}/Patient`;

            // Parse query into params for proper URL encoding
            // e.g., "identifier=http://...MBO|999999423" → { identifier: "http://...MBO|999999423" }
            const params: Record<string, string> = {};
            query.split('&').forEach(part => {
                const [key, ...valueParts] = part.split('=');
                params[key] = valueParts.join('=');
            });

            console.log('[PatientService] Searching CEZIH:', baseUrl);
            console.log('[PatientService] Params:', JSON.stringify(params));
            console.log('[PatientService] Headers:', JSON.stringify(Object.keys(headers)));
            const response = await axios.get(baseUrl, { headers, params });

            if (response.data.resourceType === 'Patient') {
                const patient = this.mapPatient(response.data);
                if (autoSave) this.saveOrUpdatePatient(patient);
                return [patient];
            }
            const patients = (response.data.entry || []).map((e: any) => this.mapPatient(e.resource));
            if (autoSave) {
                patients.forEach((p: PatientDemographics) => this.saveOrUpdatePatient(p));
            }
            return patients;
        } catch (error: any) {
            console.error('[PatientService] Failed to search patients:', error.message);
            if (error.response) {
                console.error('[PatientService] Status:', error.response.status);
                console.error('[PatientService] Response data:', JSON.stringify(error.response.data)?.substring(0, 500));
                console.error('[PatientService] Response headers:', JSON.stringify(error.response.headers)?.substring(0, 300));
            }
            throw error;
        } finally {
            // Log outgoing query to CEZIH (or mock) for the audit trail
            const mboMatch = query.match(/MBO\|([A-Za-z0-9]+)/);
            auditService.log({
                patientMbo: mboMatch ? mboMatch[1] : undefined,
                action: 'PATIENT_SEARCH',
                direction: 'OUTGOING_CEZIH',
                status: 'SUCCESS', // Usually success if we got here
                payload_req: { query },
                payload_res: { count: '...' } // Don't log full patient data for privacy
            });
        }
    }

    private async saveForeignerLocally(data: ForeignerRegistrationData, docNumber: string): Promise<PatientDemographics> {
        const firstName = data.firstName || data.name.given[0];
        const lastName = data.lastName || data.name.family;
        
        const localPatient: PatientDemographics = {
            id: docNumber,
            mbo: docNumber, // Using doc number as ID/MBO for local lookup
            passportNumber: data.passportNumber,
            euCardNumber: data.euCardNumber,
            name: {
                text: `${firstName} ${lastName}`,
                family: lastName,
                given: [firstName]
            },
            gender: data.gender,
            birthDate: data.birthDate,
            active: true,
            lastSyncAt: new Date().toISOString(),
            raw: { ...data, status: 'local_only' }
        };

        await this.saveOrUpdatePatient(localPatient);
        return localPatient;
    }

    async saveOrUpdatePatient(patient: PatientDemographics) {
        // Fallback: if MBO is missing, use technical ID or unique identifier as "MBO" for the table primary key
        // We use .id (technical) which is guaranteed, but prefer Unique ID for FHIR references
        const mboValue = patient.mbo || patient.id;
        if (!mboValue) {
            console.warn('[PatientService] Cannot save patient: no MBO or ID found');
            return;
        }

        try {
            const now = new Date().toISOString();
            const stmt = db.prepare(`
                INSERT INTO patients (
                    mbo, oib, cezihId, firstName, lastName, dateOfBirth, gender, 
                    lastSyncAt, passportNumber, euCardNumber, cezihUniqueId
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mbo) DO UPDATE SET
                    oib = excluded.oib,
                    cezihId = COALESCE(excluded.cezihId, patients.cezihId),
                    firstName = excluded.firstName,
                    lastName = excluded.lastName,
                    dateOfBirth = excluded.dateOfBirth,
                    gender = excluded.gender,
                    lastSyncAt = ?,
                    passportNumber = excluded.passportNumber,
                    euCardNumber = excluded.euCardNumber,
                    cezihUniqueId = excluded.cezihUniqueId
            `);
            stmt.run(
                mboValue,
                patient.oib || null,
                patient.cezihId || null,
                patient.name.given[0] || '',
                patient.name.family || '',
                patient.birthDate || null,
                patient.gender || null,
                now,
                patient.passportNumber || null,
                patient.euCardNumber || null,
                patient.cezihUniqueId || null,
                now
            );
        } catch (err: any) {
            console.error('[PatientService] DB Sync failed:', err.message);
        }
    }

    async getLocalPatients(search?: string): Promise<PatientDemographics[]> {
        let sql = 'SELECT * FROM patients';
        const params: any[] = [];
        if (search) {
            sql += ` WHERE firstName LIKE ? OR lastName LIKE ? OR mbo LIKE ? OR oib LIKE ? OR passportNumber LIKE ? OR euCardNumber LIKE ? OR cezihUniqueId LIKE ?`;
            const wildcard = `%${search}%`;
            params.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
        }
        sql += ' ORDER BY lastName ASC, firstName ASC';
        const rows = db.prepare(sql).all(...params) as any[];
        return rows.map(r => this.mapLocalPatient(r));
    }

    private mapLocalPatient(row: any): PatientDemographics {
        return {
            id: row.mbo,
            mbo: row.mbo,
            oib: row.oib,
            name: {
                text: `${row.firstName} ${row.lastName}`,
                family: row.lastName,
                given: [row.firstName]
            },
            gender: row.gender,
            birthDate: row.dateOfBirth,
            lastSyncAt: row.lastSyncAt,
            active: true,
            passportNumber: row.passportNumber,
            euCardNumber: row.euCardNumber,
            cezihUniqueId: row.cezihUniqueId,
            raw: { resourceType: 'Patient', ...row }
        };
    }

    private mapPatient(resource: any): PatientDemographics {
        const mboIdentifier = resource.identifier?.find(
            (id: any) => id.system === CEZIH_IDENTIFIERS.MBO
        );
        const oibIdentifier = resource.identifier?.find(
            (id: any) => id.system === CEZIH_IDENTIFIERS.OIB
        );
        const passportIdentifier = resource.identifier?.find(
            (id: any) => id.system === CEZIH_IDENTIFIERS.PASSPORT
        );
        const euCardIdentifier = resource.identifier?.find(
            (id: any) => id.system === CEZIH_IDENTIFIERS.EU_CARD
        );
        const uniqueIdIdentifier = resource.identifier?.find(
            (id: any) => id.system === CEZIH_IDENTIFIERS.UNIQUE_PATIENT_ID
        );
        const lastContactExt = resource.extension?.find(
            (ext: any) => ext.url === CEZIH_EXTENSIONS.PATIENT_LAST_CONTACT
        );

        return {
            id: resource.id,
            mbo: mboIdentifier?.value,
            oib: oibIdentifier?.value,
            passportNumber: passportIdentifier?.value,
            euCardNumber: euCardIdentifier?.value,
            cezihUniqueId: uniqueIdIdentifier?.value,
            name: resource.name?.[0] || { text: '', family: '', given: [] },
            gender: resource.gender,
            birthDate: resource.birthDate,
            deceasedDateTime: resource.deceasedDateTime,
            lastContact: lastContactExt?.valueDate,
            active: resource.active ?? true,
            raw: resource,
        };
    }

    // ============================================================
    // Test Case 11: Foreigner Registration (IHE PMIR ITI-93)
    // Profile: HRRegisterPatient
    // Endpoint: POST /patient-registry-services/api/v1
    // ============================================================

    /**
     * Build PMIR message bundle for foreign patient registration.
     * Profile: http://fhir.cezih.hr/specifikacije/StructureDefinition/HRRegisterPatient
     */
    /**
     * Build PMIR message bundle for foreign patient registration.
     */
    buildPMIRBundle(data: ForeignerRegistrationData): any {
        const crypto = require('crypto');
        const now = new Date().toISOString();
        const bundleId = crypto.randomUUID();
        const messageHeaderFullUrl = `urn:uuid:${crypto.randomUUID()}`;
        const historyBundleFullUrl = `urn:uuid:${crypto.randomUUID()}`;
        const patientFullUrl = `urn:uuid:${crypto.randomUUID()}`;

        const patientIdentifiers: any[] = [];
        if (data.passportNumber) {
            patientIdentifiers.push({ system: CEZIH_IDENTIFIERS.PASSPORT, value: data.passportNumber.toUpperCase() });
        }
        if (data.euCardNumber) {
            patientIdentifiers.push({ system: CEZIH_IDENTIFIERS.EU_CARD, value: data.euCardNumber.toUpperCase() });
        }

        const orgHzzoCode = config.organization.hzzoCode || '99999';
        const practitionerHzjzId = config.practitioner.hzjzId || '9999999';

        const practitionerWho = {
            type: 'Practitioner',
            identifier: { system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER, value: practitionerHzjzId }
        };

        return {
            resourceType: 'Bundle',
            id: bundleId,
            meta: { profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HRRegisterPatient'] },
            type: 'message',
            timestamp: now,
            entry: [
                {
                    fullUrl: messageHeaderFullUrl,
                    resource: {
                        resourceType: 'MessageHeader',
                        meta: { profile: ['https://profiles.ihe.net/ITI/PMIR/StructureDefinition/IHE.PMIR.MessageHeader'] },
                        eventUri: 'urn:ihe:iti:pmir:2019:patient-feed',
                        destination: [{ endpoint: 'http://cezih.hr' }],
                        sender: { type: 'Organization', identifier: { system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE, value: orgHzzoCode } },
                        author: practitionerWho,
                        source: { endpoint: `urn:oid:${config.organization.sourceEndpointOid}` },
                        focus: [{ reference: historyBundleFullUrl }]
                    }
                },
                {
                    fullUrl: historyBundleFullUrl,
                    resource: {
                        resourceType: 'Bundle',
                        meta: { profile: ['https://profiles.ihe.net/ITI/PMIR/StructureDefinition/IHE.PMIR.Bundle.History'] },
                        type: 'history',
                        entry: [{
                            fullUrl: patientFullUrl,
                            resource: {
                                resourceType: 'Patient',
                                identifier: patientIdentifiers,
                                active: true,
                                name: [{
                                    use: 'official',
                                    family: data.name.family.toUpperCase(),
                                    given: data.name.given.map(g => g.toUpperCase())
                                }],
                                address: [{ country: data.nationality || 'UNK' }]
                            },
                            request: { method: 'POST', url: 'Patient' },
                            response: { status: '201' }
                        }]
                    }
                }
            ],
            signature: {
                type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
                when: now,
                who: practitionerWho,
                data: ''
            }
        };
    }

    async registerForeigner(data: ForeignerRegistrationData, userToken: string): Promise<PatientDemographics> {
        // Normalization
        const rawData = data as any;
        if (!rawData.name && (rawData.firstName || rawData.lastName)) {
            data.name = {
                family: rawData.lastName || '',
                given: [rawData.firstName || ''],
            };
        }
        
        const idNumber = rawData.idNumber || rawData.documentNumber;
        const idType = rawData.idType || rawData.documentType;

        if (!data.passportNumber && !data.euCardNumber && idNumber) {
            if (idType === 'eu-card' || idType === 'eu_card' || idType === 'EKZO') {
                data.euCardNumber = idNumber;
            } else {
                data.passportNumber = idNumber;
            }
        }

        const tempId = data.passportNumber || data.euCardNumber || `F-${Date.now()}`;

        try {
            const bundle = this.buildPMIRBundle(data);
            const { signatureService } = require('./signature.service');
            const signedBundle = await signatureService.signBundle(bundle);

            const headers = authService.getUserAuthHeaders(userToken);
            const url = `${config.cezih.gatewayBase}/patient-registry-services/api/iti93`;
            
            console.log('[PatientService] Sending PMIR bundle to:', url);
            const response = await axios.post(url, signedBundle, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/fhir+json',
                    'Accept': 'application/fhir+json',
                },
            });

            if (response.data?.entry) {
                const patientEntry = response.data.entry.find((e: any) => e.resource?.resourceType === 'Patient');
                if (patientEntry?.resource) {
                    const mapped = this.mapPatient(patientEntry.resource);
                    await this.saveOrUpdatePatient(mapped);
                    return mapped;
                }
            }
            
            return this.saveForeignerLocally(data, tempId);

        } catch (error: any) {
            console.warn('[PatientService] CEZIH registration failed, saving locally:', error.message);
            return this.saveForeignerLocally(data, tempId);
        }
    }

    async updateForeigner(patientId: string, data: Partial<ForeignerRegistrationData>, userToken: string): Promise<any> {
        if (data.name) {
            db.prepare('UPDATE patients SET firstName = ?, lastName = ? WHERE mbo = ?')
                .run(data.name.given?.[0] || '', data.name.family || '', patientId);
        }
        return { success: true, id: patientId };
    }
}

export const patientService = new PatientService();
