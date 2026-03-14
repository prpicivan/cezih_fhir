/**
 * CEZIH FHIR Integration Server
 * Standalone service for CEZIH private clinic certification.
 */
import express from 'express';
import { config } from './config';
import { apiRoutes } from './routes';
import { initDatabase } from './db';

// ============================================================
// ROCK-SOLID ZAŠTITA OD PADA — server se nikad neće srušiti
// ============================================================
process.on('uncaughtException', (error) => {
    console.error('🔥 [CRITICAL] Neuhvaćena greška (Uncaught Exception):', error.message);
    if (error.stack) console.error(error.stack);
    // NE ubijamo proces! Server nastavlja raditi.
});

process.on('unhandledRejection', (reason: any, promise) => {
    console.error('🔥 [CRITICAL] Neobrađeno odbijanje (Unhandled Rejection):', reason?.message || reason);
    if (reason?.stack) console.error(reason.stack);
    // Node.js po defaultu gasi server kod ovakvih grešaka. Ovim to sprječavamo.
});

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

// ============================================================
// OIDC Callback (Smart Card & Certilia browser-based flow)
// CEZIH SSO redirects here after successful authentication.
// redirectUri in config = http://localhost:3010/auth/callback
// ============================================================
app.get('/auth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    console.log('[Auth/Callback] OIDC callback received:', {
        code: code ? (code as string).substring(0, 20) + '...' : 'MISSING',
        state,
        error,
        error_description,
    });

    if (error) {
        console.error('[Auth/Callback] OIDC error:', error, error_description);
        return res.redirect(
            `${frontendUrl}/?auth_error=${encodeURIComponent(String(error_description || error))}`
        );
    }

    if (!code) {
        console.error('[Auth/Callback] No code received in callback');
        return res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('Prijava nije uspjela: nedostaje autorizacijski kod')}`);
    }


    try {
        // Pokuša razmijeniti OIDC authorization code za token
        // certsso2 (Keycloak) token endpoint
        let gatewayToken = code as string;
        let gatewayCookies: string[] = [];

        try {
            const axiosLib = (await import('axios')).default;
            const tokenUrl = process.env.CEZIH_TOKEN_URL || 'https://certsso2.cezih.hr/auth/realms/CEZIH/protocol/openid-connect/token';
            const clientId = process.env.CEZIH_CLIENT_ID || '';
            const clientSecret = process.env.CEZIH_CLIENT_SECRET || '';
            const redirectUri = process.env.CEZIH_OIDC_REDIRECT_URI || 'http://localhost:3010/auth/callback';

            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code as string);
            params.append('redirect_uri', redirectUri);
            params.append('client_id', clientId);
            params.append('client_secret', clientSecret);

            const tokenRes = await axiosLib.post(tokenUrl, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000,
            });

            const accessToken = tokenRes.data?.access_token;
            if (accessToken) {
                gatewayToken = accessToken;
                console.log('[Auth/Callback] ✅ OIDC token exchange uspješan! Token length:', accessToken.length);

                // Pokušaj dohvatiti pravi CEZIH gateway session cookie koristeći access_token
                // Gateway prihvaća Bearer token i vraća pravu session via Set-Cookie
                try {
                    const https = await import('https');
                    const gatewayBase = process.env.CEZIH_BASE_URL || 'https://certws2.cezih.hr:8443';
                    const gatewayProbeUrl = `${gatewayBase}/services-router/gateway/encounter-services/api/v1`;

                    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
                    const probeRes = await axiosLib.get(gatewayProbeUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/fhir+json',
                        },
                        httpsAgent,
                        maxRedirects: 0,
                        validateStatus: (s) => true,
                        timeout: 8000,
                    });

                    const setCookieHeaders = probeRes.headers['set-cookie'] || [];
                    if (setCookieHeaders.length > 0) {
                        // Ekstrahiraj cookie name=value parove (bez atributa Path, HttpOnly itd.)
                        gatewayCookies = setCookieHeaders.map((c: string) => c.split(';')[0]);
                        console.log('[Auth/Callback] ✅ Gateway cookies dobiveni:', gatewayCookies.length, 'cookies');
                        console.log('[Auth/Callback] Cookies preview:', gatewayCookies.map((c: string) => c.substring(0, 40)));
                    } else {
                        // Fallback: spremi access_token kao mod_auth_openid_session
                        console.warn('[Auth/Callback] Gateway nije vratio Set-Cookie (status:', probeRes.status, ') — koristimo Bearer token fallback');
                        gatewayCookies = [`mod_auth_openid_session=${accessToken}`];
                    }
                } catch (probeErr: any) {
                    console.warn('[Auth/Callback] Gateway probe nije uspio:', probeErr.message);
                    gatewayCookies = [`mod_auth_openid_session=${accessToken}`];
                }
            }
        } catch (tokenErr: any) {
            console.warn('[Auth/Callback] Token exchange nije uspio:', tokenErr.message);
            gatewayCookies = [`auth_session=${(code as string).substring(0, 32)}`];
        }

        // Pohrani sesiju — frontend će moći nastaviti
        const { authService } = await import('./services');
        authService.storeGatewaySession(gatewayCookies, gatewayToken);
        console.log('[Auth/Callback] ✅ Gateway sesija pohranjena. Redirect na dashboard.');

        // Zatvori popup i preusmjeri na dashboard
        // Frontend detektira popup.closed i provjerava /api/auth/status
        return res.send(`
            <html>
            <head><title>Prijava uspješna</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fdf4;">
                <div style="max-width:400px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
                    <div style="font-size:48px;margin-bottom:16px;">✅</div>
                    <h2 style="color:#16a34a;margin:0 0 8px">Prijava uspješna!</h2>
                    <p style="color:#6b7280;font-size:14px;">Ovaj prozor će se automatski zatvoriti.</p>
                </div>
                <script>
                    // Notify parent window and close popup
                    if (window.opener) {
                        window.opener.postMessage({ type: 'AUTH_SUCCESS' }, '*');
                    }
                    setTimeout(() => window.close(), 1500);
                </script>
            </body>
            </html>
        `);
    } catch (err: any) {
        console.error('[Auth/Callback] Greška:', err.message);
        return res.redirect(
            `${frontendUrl}/?auth_error=${encodeURIComponent('Greška pri prijavi: ' + err.message)}`
        );
    }
});

// ============================================================
// DEBUG ENDPOINT (privremeno za test) — OBRISATI NAKON TESTA!
// ============================================================
app.get('/api/debug/gateway-cookie', async (_req, res) => {
    const { authService } = await import('./services');
    try {
        const headers = authService.getGatewayAuthHeaders();
        res.json({ success: true, cookie: headers.Cookie, sessionHeader: headers[process.env.CEZIH_SSO_SESSION_HEADER || 'mod_auth_openid_session'] });
    } catch (e: any) {
        res.status(401).json({ success: false, error: e.message });
    }
});

// DEBUG: Query CEZIH ITI-67 DocumentReference for a patient
app.get('/api/debug/cezih-documents', async (req, res) => {
    const { authService } = await import('./services');
    const axiosLib = (await import('axios')).default;
    const https = await import('https');
    const mbo = (req.query.mbo as string) || '999999423';
    const baseUrl = process.env.CEZIH_BASE_URL || 'https://certws2.cezih.hr:8443';
    try {
        const headers = authService.getGatewayAuthHeaders();
        const url = `${baseUrl}/services-router/gateway/document-consumer-services/api/v1/DocumentReference?patient.identifier=${encodeURIComponent('http://fhir.cezih.hr/specifikacije/identifikatori/MBO|' + mbo)}&_sort=-date&_count=10`;
        console.log('[debug/cezih-documents] Querying:', url);
        const r = await axiosLib.get(url, {
            headers: { ...headers, 'Accept': 'application/fhir+json' },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            validateStatus: () => true,
            timeout: 15000,
        });
        console.log('[debug/cezih-documents] Status:', r.status);
        res.json({ status: r.status, url, data: r.data });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
// DEBUG ENDPOINT za testiranje event kodova
app.get('/api/debug/test-event-codes', async (_req, res) => {
    const { authService, caseService } = await import('./services');
    if (!authService.hasGatewaySession()) {
        return res.status(401).json({ error: 'Nema gateway session' });
    }
    // Koristimo userToken="" jer getUserAuthHeaders() preferira gateway session
    try {
        const results = await caseService.testEventCodes('');
        return res.json({ results });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// DEBUG ENDPOINT za provjeru stanja potpisa
app.get('/api/debug/signing-status', async (_req, res) => {
    const { signatureService } = await import('./services/signature.service');
    const { pkcs11Service } = await import('./services/pkcs11.service');
    return res.json({
        mode: signatureService.getMode(),
        isAvailable: signatureService.isAvailable(),
        pkcs11Active: pkcs11Service.isActive(),
        pkcs11KeyInfo: pkcs11Service.getKeyInfo() ? {
            algo: pkcs11Service.getKeyInfo()!.algo,
            subject: new (require('crypto').X509Certificate)(pkcs11Service.getKeyInfo()!.certificateDer).subject
        } : null,
    });
});


// Serve Certilia prototype from backend (same origin = no CORS issues)
app.get('/certilia', (_req, res) => {
    const path = require('path');
    res.sendFile(path.join(process.cwd(), 'scripts', 'certilia-prototype.html'));
});

app.get('/', (_req, res) => {
    res.json({
        service: 'WBS_FHIR',
        version: '1.0.0',
    });
});

// ============================================================
// ROCK-SOLID POKRETANJE SERVERA
// ============================================================
const server = app.listen(config.port, '127.0.0.1', () => {
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

// ============================================================
// KONTROLIRANO GAŠENJE (Graceful Shutdown)
// Sprječava nastanak "fantomskih procesa" — prisilno oslobađa port
// ============================================================
const gracefulShutdown = (signal: string) => {
    console.log(`\n🛑 Primljen signal ${signal}. Započinjem kontrolirano gašenje servera...`);

    server.close(() => {
        console.log('✅ Port oslobođen. Node proces sigurno završava.');
        process.exit(0);
    });

    // Osigurač: Ako se server ne uspije ugasiti unutar 3 sekunde, ubij ga prisilno
    setTimeout(() => {
        console.error('⚠️ Prisilno gašenje (timeout od 3 sekunde istekao).');
        process.exit(1);
    }, 3000);
};

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Gašenje sustava

// Specifični popravak za nodemon/tsx fantomske procese
process.once('SIGUSR2', () => {
    server.close(() => {
        process.kill(process.pid, 'SIGUSR2');
    });
});

export default app;
