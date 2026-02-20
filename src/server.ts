/**
 * CEZIH FHIR Integration Server
 * Standalone service for CEZIH private clinic certification.
 */
import express from 'express';
import { config } from './config';
import { apiRoutes } from './routes';
import { initDatabase } from './db';

const app = express();

// Initialize Database
initDatabase();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for development
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (_req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Request logging
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (_req, res) => {
    res.json({
        service: 'CEZIH FHIR Integration',
        version: '1.0.0',
        description: 'Standalone FHIR R4 integration service for CEZIH private clinic certification',
        endpoints: {
            health: '/api/health',
            auth: {
                systemToken: 'POST /api/auth/system-token',
                smartCard: 'GET /api/auth/smartcard',
                certilia: 'GET /api/auth/certilia',
                callback: 'GET /api/auth/callback',
            },
            oid: {
                generate: 'POST /api/oid/generate',
            },
            terminology: {
                sync: 'POST /api/terminology/sync',
                codeSystems: 'GET /api/terminology/code-systems',
                valueSets: 'GET /api/terminology/value-sets',
            },
            registry: {
                organizations: 'GET /api/registry/organizations',
                practitioners: 'GET /api/registry/practitioners',
            },
            patient: {
                search: 'GET /api/patient/search?mbo=...',
                registerForeigner: 'POST /api/patient/foreigner/register',
            },
            visit: {
                create: 'POST /api/visit/create',
                update: 'PUT /api/visit/:id',
                close: 'POST /api/visit/:id/close',
            },
            case: {
                getPatientCases: 'GET /api/case/patient/:mbo',
                create: 'POST /api/case/create',
                update: 'PUT /api/case/:id',
            },
            document: {
                send: 'POST /api/document/send',
                replace: 'POST /api/document/replace',
                cancel: 'POST /api/document/cancel',
                search: 'GET /api/document/search',
                retrieve: 'GET /api/document/retrieve?url=...',
            },
        },
        testCaseMapping: {
            '1': 'GET /api/auth/smartcard',
            '2': 'GET /api/auth/certilia',
            '3': 'POST /api/auth/system-token',
            '4': 'Digital signature (integrated in document/message sending)',
            '5': 'Digital signature (integrated in document/message sending)',
            '6': 'POST /api/oid/generate',
            '7': 'GET /api/terminology/code-systems',
            '8': 'GET /api/terminology/value-sets',
            '9': 'GET /api/registry/organizations + /api/registry/practitioners',
            '10': 'GET /api/patient/search',
            '11': 'POST /api/patient/foreigner/register',
            '12': 'POST /api/visit/create',
            '13': 'PUT /api/visit/:id',
            '14': 'POST /api/visit/:id/close',
            '15': 'GET /api/case/patient/:mbo',
            '16': 'POST /api/case/create',
            '17': 'PUT /api/case/:id',
            '18': 'POST /api/document/send',
            '19': 'POST /api/document/replace',
            '20': 'POST /api/document/cancel',
            '21': 'GET /api/document/search',
            '22': 'GET /api/document/retrieve',
        },
    });
});

// Start server
app.listen(config.port, '127.0.0.1', () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║     CEZIH FHIR Integration Service              ║
║     Port: ${config.port}                               ║
║     Environment: ${config.nodeEnv.padEnd(30)}║
║     FHIR Server: ${(config.cezih.fhirUrl || 'not configured').substring(0, 30).padEnd(30)}║
╚══════════════════════════════════════════════════╝
  `);
    console.log('All 22 test cases mapped to API endpoints.');
    console.log('Visit http://localhost:' + config.port + ' for endpoint documentation.');
});

export default app;
