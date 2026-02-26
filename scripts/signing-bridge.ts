import express from 'express';
import cors from 'cors';
import { pkcs11Service } from '../src/services/pkcs11.service';
import dotenv from 'dotenv';

// Load environment for PIN and module path
dotenv.config();

const app = express();
const PORT = process.env.SIGN_BRIDGE_LISTEN_PORT || 3012;
const BRIDGE_TOKEN = process.env.SIGN_BRIDGE_TOKEN || 'dev-secret';

app.use(cors());
app.use(express.json());

// Authorization Middleware
const authorize = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${BRIDGE_TOKEN}`) {
        return res.status(403).json({ error: 'Unauthorized: Invalid Bridge Token' });
    }
    next();
};

app.get('/certificate', authorize, (req, res) => {
    try {
        if (!pkcs11Service.isActive()) {
            const success = pkcs11Service.initialize();
            if (!success) return res.status(503).json({ error: 'Hardware not available' });
        }

        const info = pkcs11Service.getKeyInfo();
        if (!info) return res.status(500).json({ error: 'Failed to retrieve key info' });

        res.json({
            certificate: info.certificate,
            algo: info.algo
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/sign', authorize, (req, res) => {
    const { payload, algorithm } = req.body;

    try {
        if (!pkcs11Service.isActive()) {
            const success = pkcs11Service.initialize();
            if (!success) return res.status(503).json({ error: 'Hardware not available' });
        }

        console.log(`[Bridge] Signing request for algorithm: ${algorithm}`);
        const signature = pkcs11Service.sign(payload, algorithm);

        res.json({ signature: signature.toString('base64') });
    } catch (err: any) {
        console.error(`[Bridge] Signing error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ CEZIH Signing Bridge (Production) running on http://localhost:${PORT}`);
    console.log(`Token: ${BRIDGE_TOKEN}`);

    // Auto-initialize if possible
    pkcs11Service.initialize();
});

// Clean shutdown
process.on('SIGINT', () => {
    pkcs11Service.shutdown();
    process.exit();
});
