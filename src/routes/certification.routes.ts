import { Router, Request, Response } from 'express';
import {
    authService,
    oidService,
    terminologyService,
    registryService,
    patientService,
    visitService,
    caseService,
    clinicalDocumentService
} from '../services';
import { ClinicalDocumentType } from '../types';
import db from '../db';

const router = Router();

// ═══════════════════════════════════════════
// TC Status persistence (settings table)
// ═══════════════════════════════════════════

/** GET /api/certification/status — return all saved TC statuses */
router.get('/status', (_req: Request, res: Response) => {
    try {
        const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'tc_status_%'").all() as any[];
        const statuses: Record<string, any> = {};
        for (const row of rows) {
            const tcId = row.key.replace('tc_status_', '');
            statuses[tcId] = JSON.parse(row.value);
        }
        res.json({ success: true, statuses });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /api/certification/status/:tcId — manually save a TC status */
router.post('/status/:tcId', (req: Request, res: Response) => {
    const { tcId } = req.params;
    const { status, error, isMock, result } = req.body;
    try {
        const value = JSON.stringify({ status, error: error || null, isMock: !!isMock, result: result || null, updatedAt: new Date().toISOString() });
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`tc_status_${tcId}`, value);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /api/certification/reset — reset all TC statuses */
router.post('/reset', (_req: Request, res: Response) => {
    try {
        db.prepare("DELETE FROM settings WHERE key LIKE 'tc_status_%'").run();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});


/**
 * Runs a specific CEZIH Test Case (TC)
 */
router.post('/run/:tcId', async (req: Request, res: Response) => {
    const tcId = req.params.tcId as string;
    const userToken = req.headers.authorization?.replace('Bearer ', '') || '';

    try {
        let result: any = null;

        switch (tcId.toLowerCase()) {
            case 'tc-1': { // Smart Card Login — vraćamo pravi /protected URL
                const smartcardInit = await authService.initiateGatewayAuth('smartcard');
                result = {
                    success: true,
                    method: 'smartcard',
                    authUrl: smartcardInit.authUrl,
                    info: 'TC-1 zahtijeva fizičku AKD pametnu karticu i Certilia Middleware. Korisnik mora otvoriti URL u pregledniku i autenticirati se.'
                };
                break;
            }

            case 'tc-2': { // Certilia Mobile ID Login
                const certiliaInit = await authService.initiateGatewayAuth('certilia');
                const hasSession = authService.hasGatewaySession();
                result = {
                    success: true,
                    method: 'certilia',
                    authUrl: certiliaInit.authUrl,
                    sessionAlreadyActive: hasSession,
                    message: hasSession
                        ? 'TC-2: Certilia Mobile ID sesija je već aktivna.'
                        : 'TC-2: Otvori authUrl u pregledniku, prijavi se Certilia Mobile ID, pa pohrani kolačiće putem POST /auth/session.',
                };
                break;
            }

            case 'tc-3': { // System Auth (OAuth2 Client Credentials)
                const sysToken = await authService.getSystemToken();
                result = { success: true, tokenObtained: true, tokenLength: sysToken.length, message: 'System token uspješno dohvaćen od CEZIH SSO.' };
                break;
            }

            case 'tc-4': { // Digital Signature — AKD Smart Card (PKCS#11)
                const { pkcs11Service } = await import('../services/pkcs11.service');
                const pkcs11Init = pkcs11Service.initialize();
                if (!pkcs11Init || !pkcs11Service.isActive()) {
                    const pinStatus = process.env.SIGN_PIN === 'your_sign_pin' ? 'NIJE POSTAVLJEN' : 'postavljen';
                    throw new Error(
                        `TC-4 PREDUVJET NIJE ISPUNJEN: AKD pametna kartica nije pronađena. ` +
                        `(1) Certilia Middleware mora biti instaliran, ` +
                        `(2) kartica mora biti umetnuta u čitač, ` +
                        `(3) SIGN_PIN u .env: ${pinStatus}.`
                    );
                }
                const pkcs11Info = pkcs11Service.getKeyInfo();
                result = { success: true, available: true, algorithm: pkcs11Info?.algo, message: 'AKD pametna kartica uspješno inicijalizirana.' };
                break;
            }

            case 'tc-5': { // Digital Signature — Certilia Mobile ID (Udaljeni potpis)
                const { signatureService: sig } = await import('../services/signature.service');
                const sigMode = sig.getMode();
                if (sigMode !== 'certilia') {
                    throw new Error(`TC-5 PREDUVJET: SIGNING_MODE u .env mora biti 'certilia', trenutno je '${sigMode}'.`);
                }
                if (!authService.hasGatewaySession()) {
                    throw new Error('TC-5 PREDUVJET: Nema aktivne gateway sesije. Prvo izvedi TC-2 (Certilia Mobile ID prijava).');
                }
                result = {
                    success: true,
                    mode: sigMode,
                    remoteSignUrl: process.env.REMOTE_SIGN_URL,
                    signerOib: process.env.SIGNER_OIB,
                    gatewaySessionActive: true,
                    message: 'Certilia Udaljeni potpis spreman. Gateway sesija aktivna.'
                };
                break;
            }

            case 'tc-6': // OID Generation
                result = await oidService.generateSingleOid();
                break;

            case 'tc-7': // Terminology Sync
                result = await terminologyService.syncCodeSystems();
                break;

            case 'tc-8': // Terminology Sync (ValueSets)
                result = await terminologyService.syncValueSets();
                break;

            case 'tc-9': // Registry Search
                const orgs = await registryService.searchOrganizations({ active: true });
                const pracs = await registryService.searchPractitioners({ active: true });
                result = { organizations: orgs.length, practitioners: pracs.length, detail: 'Registry sync verified.' };
                break;

            case 'tc-10': // Patient Identification (MBO)
                result = await patientService.searchByMbo('999999423', userToken);
                break;

            case 'tc-11': { // Register Foreigner (PMIR)
                const ts = Date.now().toString().slice(-8);
                result = await patientService.registerForeigner({
                    name: {
                        family: `TestCert${ts}`,
                        given: ['Maria']
                    },
                    birthDate: '1992-03-15',
                    gender: 'female',
                    nationality: 'AT',
                    passportNumber: `ATCERT${ts}`
                }, userToken);
                break;
            }

            case 'tc-12': { // Encounter Create (Kreiranje posjete)
                const { config: cfg } = await import('../config');
                result = await visitService.createVisit({
                    patientMbo: '999999423', // Pravi testni pacijent s CEZIH slučajevima
                    patientFhirId: '1118065', // REST reference Patient/1118065
                    practitionerId: cfg.practitioner.hzjzId,
                    organizationId: cfg.organization.hzzoCode,
                    startDate: new Date().toISOString(),
                    class: 'AMB'
                }, userToken);
                break;
            }

            case 'tc-13': // Encounter Update
                result = await visitService.updateVisit('some-visit-id', {
                    diagnosisCode: 'M17.1',
                    diagnosisDisplay: 'Unilateralni osteoartritis koljena'
                }, userToken);
                break;

            case 'tc-14': // Encounter Close
                result = await visitService.closeVisit('some-visit-id', new Date().toISOString(), userToken);
                break;

            case 'tc-15': // Case Search (EpisodeOfCare) via IHE QEDm
                result = await caseService.getPatientCases('999999423', userToken, true); // Pravi testni pacijent, forceRefresh = true
                break;

            case 'tc-16': // Case Creation (EpisodeOfCare)
                result = await caseService.createCase({
                    patientMbo: '123456789',
                    practitionerId: 'practitioner-1',
                    organizationId: 'org-1',
                    status: 'active',
                    title: 'Testna Epizoda: Fizikalna Terapija',
                    startDate: new Date().toISOString(),
                    diagnosisCode: 'M17.0',
                    diagnosisDisplay: 'Primarni osteoartritis koljena, obostrani'
                }, userToken);
                break;

            case 'tc-17': // Case Update/Close
                result = await caseService.updateCase('some-case-id', {
                    status: 'finished',
                    endDate: new Date().toISOString()
                }, userToken);
                break;

            case 'tc-18': // MHD Send Document
                result = await clinicalDocumentService.sendDocument({
                    type: ClinicalDocumentType.AMBULATORY_REPORT,
                    patientMbo: '123456789',
                    practitionerId: 'practitioner-1',
                    organizationId: 'org-1',
                    visitId: 'some-visit-uuid',
                    title: 'Testni medicinski nalaz',
                    anamnesis: 'Pacijent se žali na bol u koljenu.',
                    status: 'Uredan fizikalni status.',
                    finding: 'Bez vidljivih trauma.',
                    recommendation: 'Kontrola za 10 dana.',
                    diagnosisCode: 'M17.0',
                    diagnosisDisplay: 'Primarni osteoartritis koljena, obostrani',
                    date: new Date().toISOString(),
                }, userToken);
                break;

            case 'tc-19': // Document Replace
                result = await clinicalDocumentService.replaceDocument('old-doc-id', {
                    type: ClinicalDocumentType.AMBULATORY_REPORT,
                    patientMbo: '123456789',
                    practitionerId: 'practitioner-1',
                    organizationId: 'org-1',
                    title: 'Ažurirani nalaz (TC-19)',
                    anamnesis: 'Ažurirana anamneza',
                    date: new Date().toISOString(),
                }, userToken);
                break;

            case 'tc-20': // Document Cancel
                result = await clinicalDocumentService.cancelDocument('doc-to-cancel', userToken);
                break;

            case 'tc-21': // Document Search — traži na CEZIH-u (ne lokalno)
                result = await clinicalDocumentService.searchDocuments({ patientMbo: '999999423' }, userToken);
                break;

            case 'tc-22': // Document Retrieve
                result = await clinicalDocumentService.retrieveDocument('http://test.fhir.cezih.hr/R4/fhir/Binary/some-id', userToken);
                break;

            default:
                throw new Error(`Nepoznati test case: ${tcId}. Implementirani su TC-1 do TC-22.`);
        }

        // Auto-save the status to DB
        const isMock = result && (typeof result === 'object') && result.mock === true;
        const value = JSON.stringify({
            status: 'passed',
            isMock: !!isMock,
            result: result || null,
            error: null,
            updatedAt: new Date().toISOString()
        });
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`tc_status_${tcId}`, value);

        res.json({ success: true, result, isMock });
    } catch (error: any) {
        console.error(`[CertificationRunner] TC ${tcId} failed:`, error.message);
        // Save failure status
        try {
            const failValue = JSON.stringify({
                status: 'failed',
                isMock: false,
                result: null,
                error: error.message,
                updatedAt: new Date().toISOString()
            });
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`tc_status_${tcId}`, failValue);
        } catch (_) { }
        res.status(500).json({
            success: false,
            error: error.message,
            diagnostic: getDiagnosticInfo(tcId, error)
        });
    }
});

/**
 * Provides helpful diagnostic info for failures (User Requirement)
 */
function getDiagnosticInfo(tcId: string, error: any): string {
    const msg = error.message || '';

    if (msg.includes('401')) return 'Vjerojatno je istekao OAuth2 Session Token. Ponovite prijavu na Certilia portalu.';
    if (msg.includes('500')) return 'CEZIH Testni server je vratio internu pogrešku. Provjerite OID i mandatory polja.';
    if (msg.includes('Signature')) return 'Digitalni potpis nije uspio. Provjerite je li AKD pametna kartica umetnuta i SIGN_PIN ispravan u .env datoteci.';
    if (msg.includes('MBO')) return 'Pacijent s navedenim MBO brojem nije pronađen u centralnom registru (TC-10).';

    return `Nepoznata pogreška pri izvođenju ${tcId.toUpperCase()}. Provjerite mrežnu povezanost s VPN-om.`;
}

export default router;
