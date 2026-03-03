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
        console.log(`[SmartCard/Playwright] Started grab-gateway-cookie.js (PID: ${child.pid})`);

        child.stdout?.on('data', (data: Buffer) => {
            process.stdout.write('[GrabCookie] ' + data.toString());
        });
        child.stderr?.on('data', (data: Buffer) => {
            process.stderr.write('[GrabCookie] ' + data.toString());
        });
        child.on('close', (code: number) => {
            console.log(`[SmartCard/Playwright] Process exited (code: ${code})`);
            playwrightSession = null;
        });
        child.on('error', (err: Error) => {
            console.error('[SmartCard/Playwright] Process error:', err.message);
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
    });
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

router.post('/terminology/sync', async (req: Request, res: Response) => {
    try {
        const result = await terminologyService.syncAll();
        res.json({ success: true, codeSystems: result.codeSystems.length, valueSets: result.valueSets.length });
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
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const organizations = await registryService.searchOrganizations({
            active: req.query.active === 'true',
            name: req.query.name as string,
        }, userToken);
        res.json({ success: true, count: organizations.length, organizations });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/registry/practitioners', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const practitioners = await registryService.searchPractitioners({
            name: req.query.name as string,
            identifier: req.query.identifier as string,
        }, userToken);
        res.json({ success: true, count: practitioners.length, practitioners });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/registry/healthcare-services', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const services = await registryService.searchHealthcareServices({
            active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
            organization: req.query.organization as string,
        }, userToken);
        res.json({ success: true, count: services.length, services });
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

// Transition a planned visit to in-progress — logs ENCOUNTER_START (not ENCOUNTER_UPDATE)
router.post('/visit/:id/start', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await visitService.startVisit(req.params.id as string, req.body, userToken);
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

// ============================================================
// Clinical Document Routes (Test Cases 18-22)
// ============================================================

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

export default router;
