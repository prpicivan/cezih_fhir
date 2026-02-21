/**
 * API Routes for CEZIH FHIR Integration
 * Each route group maps to a set of test cases.
 */
import { Router, Request, Response } from 'express';
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
// Auth Routes (Test Cases 1-3)
// ============================================================

// Test Case 3: Get system token (OAuth2 Client Credentials)
router.post('/auth/system-token', async (_req: Request, res: Response) => {
    try {
        const token = await authService.getSystemToken();
        res.json({ success: true, tokenPreview: token.substring(0, 50) + '...' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Test Case 1: Initiate Smart Card auth
router.get('/auth/smartcard', (req: Request, res: Response) => {
    const state = Math.random().toString(36).substring(7);
    const authUrl = authService.getSmartCardAuthUrl(state);
    res.json({ authUrl, state });
});

// Test Case 2: Initiate Certilia mobile.ID auth
router.get('/auth/certilia', (req: Request, res: Response) => {
    const state = Math.random().toString(36).substring(7);
    const authUrl = authService.getCertiliaAuthUrl(state);
    res.json({ authUrl, state });
});

// Auth callback (shared by Test Cases 1 & 2)
router.get('/auth/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;
        if (!code) {
            return res.status(400).json({ error: 'Missing authorization code' });
        }
        const tokenResponse = await authService.exchangeAuthCode(code as string);
        const sessionId = state as string || 'default';
        authService.storeUserSession(sessionId, tokenResponse.access_token, tokenResponse.expires_in);

        // Redirect back to frontend dashboard
        // Assuming frontend is at http://localhost:3011
        res.redirect('http://localhost:3011/dashboard?sessionId=' + sessionId);
    } catch (error: any) {
        res.redirect('http://localhost:3011/?error=' + encodeURIComponent(error.message));
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
// Registry Routes (Test Case 9)
// ============================================================

router.get('/registry/organizations', async (req: Request, res: Response) => {
    try {
        const organizations = await registryService.searchOrganizations({
            active: req.query.active === 'true',
            name: req.query.name as string,
        });
        res.json({ success: true, count: organizations.length, organizations });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/registry/practitioners', async (req: Request, res: Response) => {
    try {
        const practitioners = await registryService.searchPractitioners({
            name: req.query.name as string,
        });
        res.json({ success: true, count: practitioners.length, practitioners });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Patient Routes (Test Cases 10, 11 + Registry/Chart)
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

router.post('/visit/:id/close', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { endDate } = req.body;
        const result = await visitService.closeVisit(req.params.id as string, endDate, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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

// ============================================================
// Case Routes (Test Cases 15-17)
// ============================================================

router.get('/case/patient/:mbo', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const cases = await caseService.getPatientCases(req.params.mbo as string, userToken);
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

// ============================================================
// Clinical Document Routes (Test Cases 18-22)
// ============================================================

router.post('/document/send', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await clinicalDocumentService.sendDocument(req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/document/replace', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { originalDocumentOid, ...data } = req.body;
        const result = await clinicalDocumentService.replaceDocument(originalDocumentOid, data, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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

router.get('/document/search', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const documents = await clinicalDocumentService.searchDocuments({
            patientMbo: req.query.patientMbo as string
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

export default router;
