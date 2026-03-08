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
}

export interface ForeignerRegistrationData {
    passportNumber?: string;
    euCardNumber?: string;
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
            const idMatch = query.match(/\|([A-Za-z0-9]+)/);
            if (idMatch && autoSave) {
                const idValue = idMatch[1];
                const stmt = db.prepare('SELECT * FROM patients WHERE mbo = ? OR oib = ?');
                const localPatient = stmt.get(idValue, idValue) as any;

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

    private saveOrUpdatePatient(patient: PatientDemographics) {
        if (!patient.mbo) return;
        try {
            const now = new Date().toISOString();
            const stmt = db.prepare(`
                INSERT INTO patients (mbo, oib, firstName, lastName, dateOfBirth, gender, lastSyncAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mbo) DO UPDATE SET
                    oib = excluded.oib,
                    firstName = excluded.firstName,
                    lastName = excluded.lastName,
                    dateOfBirth = excluded.dateOfBirth,
                    gender = excluded.gender,
                    lastSyncAt = ?
            `);
            stmt.run(
                patient.mbo,
                patient.oib || null,
                patient.name.given[0] || '',
                patient.name.family || '',
                patient.birthDate || null,
                patient.gender || null,
                now,
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
            sql += ` WHERE firstName LIKE ? OR lastName LIKE ? OR mbo LIKE ? OR oib LIKE ?`;
            const wildcard = `%${search}%`;
            params.push(wildcard, wildcard, wildcard, wildcard);
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
        const lastContactExt = resource.extension?.find(
            (ext: any) => ext.url === CEZIH_EXTENSIONS.PATIENT_LAST_CONTACT
        );

        return {
            id: resource.id,
            mbo: mboIdentifier?.value,
            oib: oibIdentifier?.value,
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
    buildPMIRBundle(data: ForeignerRegistrationData): any {
        const crypto = require('crypto');
        const now = new Date().toISOString();
        const bundleId = crypto.randomUUID();
        const messageHeaderFullUrl = `urn:uuid:${crypto.randomUUID()}`;
        const historyBundleFullUrl = `urn:uuid:${crypto.randomUUID()}`;
        const patientFullUrl = `urn:uuid:${crypto.randomUUID()}`;

        // Patient identifiers (closed slicing, min=1, max=2)
        const patientIdentifiers: any[] = [];
        if (data.passportNumber) {
            patientIdentifiers.push({
                system: CEZIH_IDENTIFIERS.PASSPORT,
                value: data.passportNumber,
            });
        }
        if (data.euCardNumber) {
            patientIdentifiers.push({
                system: CEZIH_IDENTIFIERS.EU_CARD,
                value: data.euCardNumber,
            });
        }
        if (patientIdentifiers.length === 0) {
            throw new Error('Registracija stranca zahtijeva barem jedan identifikator: broj putovnice ili EU kartica.');
        }

        const orgHzzoCode = config.organization.hzzoCode;
        const practitionerHzjzId = config.practitioner.hzjzId;

        if (!orgHzzoCode) throw new Error('ORGANIZATION_HZZO_CODE nije konfiguriran u .env');
        if (!practitionerHzjzId) throw new Error('PRACTITIONER_HZJZ_ID nije konfiguriran u .env');

        // Bundle.signature.who — must match MessageHeader.author
        const practitionerWho = {
            type: 'Practitioner',
            identifier: {
                system: CEZIH_IDENTIFIERS.HZJZ_WORKER_NUMBER,
                value: practitionerHzjzId,
            },
        };

        const bundle: any = {
            resourceType: 'Bundle',
            id: bundleId,
            meta: {
                profile: ['http://fhir.cezih.hr/specifikacije/StructureDefinition/HRRegisterPatient'],
            },
            type: 'message',
            timestamp: now,
            // entry[0]: MessageHeader
            entry: [
                {
                    fullUrl: messageHeaderFullUrl,
                    resource: {
                        resourceType: 'MessageHeader',
                        meta: {
                            profile: ['https://profiles.ihe.net/ITI/PMIR/StructureDefinition/IHE.PMIR.MessageHeader'],
                        },
                        eventUri: 'urn:ihe:iti:pmir:2019:patient-feed',
                        destination: [{
                            endpoint: 'http://cezih.hr',
                        }],
                        sender: {
                            type: 'Organization',
                            identifier: {
                                system: CEZIH_IDENTIFIERS.HZZO_ORG_CODE,
                                value: orgHzzoCode,
                            },
                        },
                        author: practitionerWho,
                        source: {
                            endpoint: `urn:oid:${config.organization.sourceEndpointOid}`,
                        },
                        focus: [{
                            reference: historyBundleFullUrl,
                        }],
                    },
                },
                // entry[1]: History Bundle with Patient
                {
                    fullUrl: historyBundleFullUrl,
                    resource: {
                        resourceType: 'Bundle',
                        meta: {
                            profile: ['https://profiles.ihe.net/ITI/PMIR/StructureDefinition/IHE.PMIR.Bundle.History'],
                        },
                        type: 'history',
                        entry: [
                            {
                                fullUrl: patientFullUrl,
                                resource: {
                                    resourceType: 'Patient',
                                    identifier: patientIdentifiers,
                                    active: true,
                                    name: [{
                                        use: 'official',
                                        family: data.name.family,
                                        given: data.name.given,
                                    }],
                                    address: [{
                                        country: data.nationality || 'UNK',
                                    }],
                                },
                                request: {
                                    method: 'POST',
                                    url: 'Patient',
                                },
                                response: {
                                    status: '201',
                                },
                            },
                        ],
                    },
                },
            ],
            // signature placeholder — signBundle() will populate data
            signature: {
                type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
                when: now,
                who: practitionerWho,
                data: '', // Will be filled by signatureService.signBundle()
            },
        };

        return bundle;
    }

    async registerForeigner(data: ForeignerRegistrationData, userToken: string): Promise<any> {
        // Normalize input: accept both flat {firstName, lastName} and FHIR {name:{family, given}}
        const rawData = data as any;
        if (!rawData.name && (rawData.firstName || rawData.lastName)) {
            (data as any).name = {
                family: rawData.lastName || '',
                given: [rawData.firstName || ''],
            };
        }
        // Map documentType/documentNumber to passportNumber/euCardNumber
        if (!data.passportNumber && !data.euCardNumber && rawData.documentNumber) {
            if (rawData.documentType === 'euCard' || rawData.documentType === 'EKZO') {
                data.euCardNumber = rawData.documentNumber;
            } else {
                // Default to passport
                data.passportNumber = rawData.documentNumber;
            }
        }
        if (!data.gender && rawData.gender) data.gender = rawData.gender;
        if (!data.birthDate && rawData.birthDate) data.birthDate = rawData.birthDate;
        if (!data.nationality && rawData.nationality) data.nationality = rawData.nationality;

        console.log('[PatientService] registerForeigner normalized data.name:', JSON.stringify(data.name));

        try {
            // 1. Save to local DB first
            const stmt = db.prepare(`
                INSERT INTO patients (mbo, firstName, lastName, dateOfBirth, gender, city)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const tempId = 'F' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');

            stmt.run(
                tempId,
                data.name.given[0],
                data.name.family,
                data.birthDate,
                data.gender,
                data.nationality || 'Foreign/Unknown'
            );
            console.log('[PatientService] Saved foreigner to local DB:', tempId);

            // 2. Build and sign PMIR bundle
            const pmirBundle = this.buildPMIRBundle(data);
            console.log('[PatientService] Built PMIR bundle for foreigner registration');

            // 3. Sign the bundle
            let signedBundle = pmirBundle;
            try {
                const { signatureService } = require('./index');
                const { bundle: signed } = await signatureService.signBundle(
                    pmirBundle,
                    undefined, // signerRef extracted from bundle.signature.who
                    userToken
                );
                signedBundle = signed;
                console.log('[PatientService] ✅ PMIR bundle signed');
            } catch (signErr: any) {
                console.warn('[PatientService] Signing failed, sending unsigned:', signErr.message);
            }

            // 4. Send to CEZIH patient-registry-services
            try {
                const headers = authService.getUserAuthHeaders(userToken);
                // ITI-93 uses /api/iti93 (NOT /api/v1/iti93) — confirmed by CEZIH team
                const url = `${config.cezih.gatewayBase}/patient-registry-services/api/iti93`;
                console.log('[PatientService] Sending PMIR bundle to:', url);

                const response = await axios.post(url, signedBundle, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/fhir+json',
                        'Accept': 'application/fhir+json',
                    },
                });

                console.log('[PatientService] ✅ CEZIH registration response:', response.status);

                // Extract assigned MBO/ID from response
                const responseBundle = response.data;
                if (responseBundle?.entry) {
                    // CEZIH typically returns the registered Patient with assigned identifiers
                    const patientEntry = responseBundle.entry.find((e: any) =>
                        e.resource?.resourceType === 'Patient'
                    );
                    if (patientEntry?.resource) {
                        const assignedMbo = patientEntry.resource.identifier?.find(
                            (id: any) => id.system === CEZIH_IDENTIFIERS.MBO
                        );
                        if (assignedMbo) {
                            // Update local DB with real MBO
                            db.prepare('UPDATE patients SET mbo = ? WHERE mbo = ?')
                                .run(assignedMbo.value, tempId);
                            console.log('[PatientService] Updated local DB with assigned MBO:', assignedMbo.value);
                        }
                        return this.mapPatient(patientEntry.resource);
                    }
                }

                return {
                    resourceType: 'Patient',
                    id: tempId,
                    name: [{ family: data.name.family, given: data.name.given }],
                    identifier: [{ system: CEZIH_IDENTIFIERS.MBO, value: tempId }],
                    _cezihResponse: responseBundle,
                };
            } catch (cezihErr: any) {
                console.warn('[PatientService] CEZIH registration failed:', cezihErr.message);
                if (cezihErr.response?.data) {
                    console.warn('[PatientService] CEZIH response:', JSON.stringify(cezihErr.response.data).substring(0, 500));
                }
                // Return local-only result
                return {
                    resourceType: 'Patient',
                    id: tempId,
                    name: [{ family: data.name.family, given: data.name.given }],
                    identifier: [{ system: CEZIH_IDENTIFIERS.MBO, value: tempId }],
                    _localOnly: true,
                    _cezihError: cezihErr.response?.data || cezihErr.message,
                };
            }
        } catch (error: any) {
            console.error('[PatientService] Failed to register foreigner:', error.message);
            throw error;
        }
    }

    async updateForeigner(patientId: string, data: Partial<ForeignerRegistrationData>, userToken: string): Promise<any> {
        // PMIR Update uses PMIREntryUpdate — requires JedinstveniIdentifikatorPacijenta from CEZIH
        // For now, only update local DB
        if (data.name) {
            db.prepare('UPDATE patients SET firstName = ?, lastName = ? WHERE mbo = ?')
                .run(data.name.given?.[0] || '', data.name.family || '', patientId);
        }
        return { success: true, id: patientId };
    }
}

export const patientService = new PatientService();
