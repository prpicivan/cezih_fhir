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
        const patients = await patientService.searchByMbo(mbo, userToken);
        const patient = patients[0];

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // 2. Aggregate Clinical Data
        const documents = await clinicalDocumentService.searchDocuments({ patientMbo: mbo }, userToken);
        const cases = await caseService.getPatientCases(mbo, userToken);
        const visits = visitService.getVisits(mbo);

        res.json({
            success: true,
            chart: {
                patient,
                lastDocument: documents[0] || null,
                allDocuments: documents,
                activeCases: cases.filter(c => c.status === 'active'),
                recentVisits: visits.slice(0, 5)
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Re-export old search and register for compatibility if needed, 
// but we'll likely move them all here.
router.get('/search', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const mbo = req.query.mbo as string | undefined;
        const oib = req.query.oib as string | undefined;
        let patients;
        if (mbo) {
            patients = await patientService.searchByMbo(mbo, userToken);
        } else if (oib) {
            patients = await patientService.searchByOib(oib, userToken);
        } else {
            return res.status(400).json({ error: 'Provide mbo or oib' });
        }
        res.json({ success: true, count: patients.length, patients });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/foreigner/register', async (req: Request, res: Response) => {
    try {
        const userToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const result = await patientService.registerForeigner(req.body, userToken);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
