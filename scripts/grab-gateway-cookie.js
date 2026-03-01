/**
 * grab-gateway-cookie.js
 *
 * Automatski otvara CEZIH gateway u Chromium browseru,
 * čeka da korisnik izvrši autentifikaciju pametnom karticom,
 * pa izvlači mod_auth_openidc_session cookie i šalje ga backendu.
 *
 * Pokretanje:
 *   node scripts/grab-gateway-cookie.js
 *
 * Preduvjeti (jedanput):
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const http = require('http');
require('dotenv').config();

const BACKEND_PORT = process.env.PORT || 3010;
const BACKEND_HOST = 'localhost';
const GATEWAY_URL = 'https://certws2.cezih.hr:8443/services-router/gateway';
const COOKIE_NAME = 'mod_auth_openidc_session';
const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minuta

// ─── ANSI boje ────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(msg) { console.log(msg); }
function ok(msg) { log(`${c.green}✅ ${msg}${c.reset}`); }
function warn(msg) { log(`${c.yellow}⚠️  ${msg}${c.reset}`); }
function err(msg) { log(`${c.red}❌ ${msg}${c.reset}`); }
function info(msg) { log(`${c.cyan}ℹ️  ${msg}${c.reset}`); }

// ─── Backend injection ─────────────────────────────────────────────
async function injectSession(cookieValue) {
    return new Promise((resolve) => {
        const cookieString = `${COOKIE_NAME}=${cookieValue}`;
        const body = JSON.stringify({
            cookies: [cookieString],
            sessionToken: cookieValue,
        });

        const req = http.request({
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/auth/session',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    ok('Sesija uspješno ubačena! Backend je autoriziran.');
                    log(`${c.dim}   Cookie: ${cookieString.substring(0, 55)}...${c.reset}`);
                    resolve(true);
                } else {
                    err(`Backend vratio status ${res.statusCode}: ${data}`);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            if (e.code === 'ECONNREFUSED') {
                err(`Backend nije pokrenut na portu ${BACKEND_PORT}. Pokrenite: npm run dev`);
            } else {
                err(`Greška pri spajanju na backend: ${e.message}`);
            }
            resolve(false);
        });

        req.write(body);
        req.end();
    });
}

// ─── Polling za cookie ─────────────────────────────────────────────
async function waitForCookie(context) {
    const deadline = Date.now() + TIMEOUT_MS;
    let dots = 0;

    while (Date.now() < deadline) {
        const cookies = await context.cookies('https://certws2.cezih.hr:8443');
        const sessionCookie = cookies.find(c => c.name === COOKIE_NAME);

        if (sessionCookie) {
            return sessionCookie.value;
        }

        // Ljupki loading indikator
        process.stdout.write(`\r${c.yellow}⏳ Čekam autentifikaciju${'.'.repeat((dots % 3) + 1)}   ${c.reset}`);
        dots++;
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    return null;
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
    log('');
    log(`${c.bold}══════════════════════════════════════════════════${c.reset}`);
    log(`${c.bold}  CEZIH Gateway Cookie Grabber (Playwright)       ${c.reset}`);
    log(`${c.bold}══════════════════════════════════════════════════${c.reset}`);
    log('');

    log(`${c.bold}Upute:${c.reset}`);
    log('  1. Browser će se otvoriti na CEZIH gateway stranici');
    log('  2. Browser će vas pitati za certifikat — odaberite IDEN certifikat');
    log('  3. Unesite IDEN PIN kad vas zatraži');
    log('  4. Skripta automatski detektira cookie i injektira ga u backend');
    log('');
    info(`Gateway URL: ${GATEWAY_URL}`);
    log('');

    let browser;
    try {
        // Pokrećemo vidljivi (headed) browser — TLS certifikat mora odabrati korisnik
        info('Pokrećem browser...');
        browser = await chromium.launch({
            headless: false,        // MORA biti false — TLS cert dialog zahtijeva UI
            args: [
                '--ignore-certificate-errors',
                '--start-maximized',
            ],
        });

        const context = await browser.newContext({
            ignoreHTTPSErrors: true,
            viewport: null, // koristi sistemsku veličinu prozora
        });

        const page = await context.newPage();

        // Postavi listener za certificate selector — Playwright ga ne može
        // automatski kliknuti (OS-razina dialog), ali može otvoriti stranicu
        log(`${c.cyan}🌐 Otvaram gateway...${c.reset}`);
        await page.goto(GATEWAY_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        }).catch(() => {
            // 404 / Whitelabel error je normalan — autentifikacija je prošla
        });

        log('');
        warn('Ako browser pita za certifikat — odaberite IDEN certifikat i unesite PIN.');
        log(`${c.dim}   (Skripta čeka do 5 minuta)${c.reset}`);
        log('');

        // Pollaj dok cookie ne bude dostupan
        const cookieValue = await waitForCookie(context);

        process.stdout.write('\r' + ' '.repeat(50) + '\r'); // čisti loading...

        if (!cookieValue) {
            err('Timeout — cookie nije detektiran u 5 minuta.');
            err('Provjerite jeste li odabrali certifikat i unijeli PIN.');
            process.exit(1);
        }

        ok(`Cookie detektiran: ${cookieValue.substring(0, 36)}...`);
        log('');

        // Zatvori browser
        await browser.close();
        browser = null;

        // Injektiraj u backend
        info('Injektiram sesiju u backend...');
        const success = await injectSession(cookieValue);

        if (success) {
            log('');
            log(`${c.bold}${c.green}🎉 Gotovo! Backend je spreman za CEZIH API pozive.${c.reset}`);
            log(`${c.dim}   Sesija traje ~4 sata. Ponovite postupak kad istekne.${c.reset}`);
        }

    } catch (e) {
        if (e.message?.includes('Executable doesn\'t exist')) {
            err('Playwright Chromium nije instaliran.');
            log('');
            log('Pokrenite jedanput:');
            log(`  ${c.bold}npx playwright install chromium${c.reset}`);
            log('');
            log('Zatim ponovo pokrenite ovu skriptu.');
        } else {
            err(`Neočekivana greška: ${e.message}`);
        }
        process.exit(1);
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

main();
