import { Router, Request, Response } from 'express';
import {
    patientService,
    clinicalDocumentService,
    caseService,
    visitService
} from '../services';

const router = Router();

/**
 * GET /api/patient/registry
 * Fuzzy search across local patients for the registry view.
 */
router.get('/registry', async (req: Request, res: Response) => {
    try {
        const q = req.query.q as string | undefined;
        const patients = await patientService.getLocalPatients(q);
        res.json({ success: true, count: patients.length, patients });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/patient/:mbo/chart
 * Aggregated clinical chart view.
 */
router.get('/:mbo/chart', async (req: Request, res: Response) => {
    try {
        const mbo = req.params.mbo as string;
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';

        // 1. Get Basic Demography (local or remote)
        const refresh = req.query.refresh === 'true';
        let patient;

        if (refresh) {
            patient = await patientService.syncPatient(mbo, userToken);
        } else {
            const patients = await patientService.searchByMbo(mbo, userToken);
            patient = patients[0];
        }

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // 2. Aggregate Clinical Data
        const documents = await clinicalDocumentService.searchDocuments({ patientMbo: mbo }, userToken);
        const cases = await caseService.getPatientCases(mbo, userToken, refresh);
        const visits = visitService.getVisits(mbo);

        res.json({
            success: true,
            chart: {
                patient,
                lastDocument: documents[0] || null,
                allDocuments: documents,
                activeCases: cases.filter(c => c.status === 'active'),
                allCases: cases,
                recentVisits: visits.slice(0, 5),
                allVisits: visits,
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Re-export old search and register for compatibility if needed, 
// but we'll likely move them all here.
router.get('/search-remote', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const mbo = req.query.mbo as string | undefined;
        if (!mbo) return res.status(400).json({ error: 'MBO is required' });

        const patients = await patientService.searchRemoteByMbo(mbo, userToken);
        res.json({ success: true, count: patients.length, patients });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/sync', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const { mbo } = req.body;
        if (!mbo) return res.status(400).json({ error: 'MBO is required' });

        const patient = await patientService.syncPatient(mbo, userToken);
        res.json({ success: true, patient });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/search', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const mbo = req.query.mbo as string | undefined;
        const oib = req.query.oib as string | undefined;
        const passport = req.query.passport as string | undefined;
        const euCard = req.query.euCard as string | undefined;

        let patients;
        if (mbo) {
            patients = await patientService.searchByMbo(mbo, userToken);
        } else if (oib) {
            patients = await patientService.searchByOib(oib, userToken);
        } else if (passport) {
            patients = await patientService.searchByPassport(passport, userToken);
        } else if (euCard) {
            patients = await patientService.searchByEuCard(euCard, userToken);
        } else {
            return res.status(400).json({ error: 'Provide mbo, oib, passport or euCard' });
        }
        res.json({ success: true, count: patients.length, patients });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/foreigner/register', async (req: Request, res: Response) => {
    try {
        console.log('[TC11 Route] Body received:', JSON.stringify(req.body).slice(0, 300));
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await patientService.registerForeigner(req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[TC11 Route] ERROR:', error.message);
        console.error('[TC11 Route] STACK:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

export default router;
