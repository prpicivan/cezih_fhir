/**
 * inject-session.js
 * 
 * Helper script za ubacivanje CEZIH gateway sesije dobivene
 * putem smart kartice u browseru.
 * 
 * Pokretanje:
 *   node scripts/inject-session.js
 * 
 * ili s cookie vrijednošću kao argumentom:
 *   node scripts/inject-session.js 2706b939-b933-4ec7-8823-b963d5da9c02
 */

const http = require('http');
const readline = require('readline');
require('dotenv').config();

const BACKEND_PORT = process.env.PORT || 3010;
const BACKEND_HOST = 'localhost';

const COOKIE_NAME = 'mod_auth_openidc_session';

async function injectSession(cookieValue) {
    return new Promise((resolve, reject) => {
        cookieValue = cookieValue.trim();

        // Support "name=value" or just "value"
        const cookieString = cookieValue.includes('=')
            ? cookieValue
            : `${COOKIE_NAME}=${cookieValue}`;

        const body = JSON.stringify({
            cookies: [cookieString],
            sessionToken: cookieValue.includes('=')
                ? cookieValue.split('=').slice(1).join('=')
                : cookieValue,
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
                    console.log('\n✅ Sesija uspješno ubačena! Backend je autoriziran.');
                    console.log('   Cookie:', cookieString.substring(0, 50) + '...');
                    resolve(true);
                } else {
                    console.error(`\n❌ Greška: status ${res.statusCode}`);
                    console.error('   Odgovor:', data);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.error(`\n❌ Backend nije pokrenut na portu ${BACKEND_PORT}.`);
                console.error('   Pokrenite backend s: npm run dev (u mapi cezih_fhir)');
            } else {
                console.error('\n❌ Greška:', err.message);
            }
            resolve(false);
        });

        req.write(body);
        req.end();
    });
}

async function checkStatus() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/auth/status',
            method: 'GET',
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const status = JSON.parse(data);
                    if (status.authenticated) {
                        const age = status.createdAt
                            ? Math.round((Date.now() - status.createdAt) / 60000)
                            : '?';
                        console.log(`   Status: ✅ Autoriziran (${status.method}, ${age} min)`);
                    } else {
                        console.log('   Status: ❌ Nije autoriziran');
                    }
                } catch {
                    console.log('   Status: (nije moguće pročitati)');
                }
                resolve();
            });
        });
        req.on('error', () => resolve());
        req.end();
    });
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  CEZIH Smart Card Session Injection Tool  ');
    console.log('═══════════════════════════════════════════');
    console.log(`  Backend: http://${BACKEND_HOST}:${BACKEND_PORT}`);

    // Check current status
    process.stdout.write('\nTrenutni status: ');
    await checkStatus();

    // Cookie value from CLI arg or prompt
    let cookieValue = process.argv[2];

    if (!cookieValue) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        cookieValue = await new Promise((resolve) => {
            console.log('\nUpute:');
            console.log('  1. Otvorite browser → https://certws2.cezih.hr:8443/services-router/gateway');
            console.log('  2. Autentificirajte se pametnom karticom (unesite PIN)');
            console.log('  3. Pritisnite F12 → Application → Cookies → certws2.cezih.hr:8443');
            console.log('  4. Pronađite "mod_auth_openidc_session" i kopirajte vrijednost\n');
            rl.question('Unesite vrijednost kolačića: ', (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    if (!cookieValue || cookieValue.trim().length < 10) {
        console.error('\n❌ Vrijednost kolačića je prekratka ili prazna.');
        process.exit(1);
    }

    await injectSession(cookieValue);
}

main();
