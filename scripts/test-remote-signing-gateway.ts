/**
 * Test skript za CEZIH Udaljeni potpis sa GATEWAY sesijom
 *
 * Dohvaća gateway session cookie s backend API-ja
 * (koji je pohranjen od prethodne Certilia prijave)
 * i koristi ga za poziv CEZIH /api/remoteSign.
 *
 * Pokretanje:
 *   npx ts-node scripts/test-remote-signing-gateway.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../src/config';

const BACKEND_URL = `http://localhost:${config.port || 3010}`;
const CEZIH_URL = config.cezih.baseUrl; // https://certws2.cezih.hr:8443

// ============================================================
// Test Data: Minimalni FHIR Message Bundle
// ============================================================

const testBundle = {
    resourceType: 'Bundle',
    type: 'message',
    timestamp: new Date().toISOString(),
    entry: [
        {
            fullUrl: 'urn:uuid:' + uuidv4(),
            resource: {
                resourceType: 'MessageHeader',
                eventCoding: {
                    system: 'http://cezih.hr/fhir/CodeSystem/message-events',
                    code: 'document-notification',
                },
                source: {
                    name: 'WBS_FHIR',
                    software: 'WBS_FHIR',
                    version: '1.0.0',
                    endpoint: BACKEND_URL,
                },
                author: { reference: 'Practitioner/test-doctor' },
                sender: { reference: `Organization/${config.organization.hzzoCode}` },
            },
        },
        {
            fullUrl: 'urn:uuid:' + uuidv4(),
            resource: {
                resourceType: 'Patient',
                identifier: [{ system: 'urn:oid:2.16.840.1.113883.3.4424.4.1.5', value: '00000000001' }],
                name: [{ family: 'Testni', given: ['Pacijent'] }],
                gender: 'male',
                birthDate: '1990-01-01',
            },
        },
    ],
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// Main
// ============================================================

async function run() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   CEZIH Udaljeni Potpis — TEST S GATEWAY SESIJOM           ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Dohvaća cookies iz aktivne Certilia sesije s backend-a.   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // 1. Provjera gateway sesije
    console.log('[1/5] Provjera auth statusa na backendu...');
    const statusRes = await axios.get(`${BACKEND_URL}/api/auth/status`);
    console.log('      Status:', JSON.stringify(statusRes.data));

    if (!statusRes.data.authenticated) {
        console.error('❌ Nema aktivne gateway sesije!');
        console.log('💡 Prijavite se na http://localhost:3011 s Certilia mobile.ID pa pokrenite ponovo.');
        process.exit(1);
    }
    console.log('[1/5] ✅ Gateway sesija aktivna\n');

    // 2. Dohvat gateway cookies s backend API-ja
    console.log('[2/5] Dohvat gateway cookies...');
    let cookieHeader = '';
    let sessionToken = '';
    try {
        const tokenRes = await axios.get(`${BACKEND_URL}/api/auth/gateway-token`);
        cookieHeader = tokenRes.data.cookieHeader || '';
        sessionToken = tokenRes.data.sessionToken || '';
        console.log(`      Cookie header: ${cookieHeader.substring(0, 80)}${cookieHeader.length > 80 ? '...' : ''}`);
        if (sessionToken) {
            console.log(`      Session token: ${sessionToken.substring(0, 30)}...`);
        }
    } catch (err: any) {
        console.error('❌ Nije moguće dohvatiti gateway cookies:', err.message);
        process.exit(1);
    }
    console.log('[2/5] ✅ Cookies dohvaćeni\n');

    // 3. Priprema dokumenta
    console.log('[3/5] Priprema FHIR Bundle za potpis...');
    const messageId = uuidv4();
    const base64Document = Buffer.from(JSON.stringify(testBundle), 'utf-8').toString('base64');
    const requestId = uuidv4();
    const oib = config.remoteSigning.signerOib;

    if (!oib) {
        console.error('❌ SIGNER_OIB nije postavljen u .env');
        process.exit(1);
    }

    const remoteSignPayload = {
        documents: [{
            documentType: 'FHIR_MESSAGE',
            mimeType: 'JSON',
            base64Document,
            messageId,
        }],
        oib,
        sourceSystem: config.remoteSigning.sourceSystem || 'DEV',
        requestId,
    };
    console.log(`      messageId: ${messageId}`);
    console.log(`      OIB: ${oib}, RequestID: ${requestId}`);
    console.log('[3/5] ✅ Bundle pripremljen\n');

    // 4. Slanje na CEZIH /api/remoteSign
    console.log('[4/5] Slanje na CEZIH Remote Sign API...');
    console.log('      📱 Provjerite Certilia mobileID aplikaciju na telefonu!\n');

    let transactionCode = '';
    try {
        const signRes = await axios.post(
            `${CEZIH_URL}/api/remoteSign`,
            remoteSignPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookieHeader,
                    ...(sessionToken ? { 'mod_auth_openid_session': sessionToken } : {}),
                },
                timeout: 30000,
            }
        );
        transactionCode = signRes.data.transactionCode;
        console.log(`[4/5] ✅ Submitted! Transaction: ${transactionCode}`);
        console.log(`      Čeka se odobrenje na mobitelu...\n`);
    } catch (err: any) {
        console.error('❌ Submit failed!');
        if (err.response) {
            console.error('    HTTP Status:', err.response.status);
            console.error('    Response:', JSON.stringify(err.response.data, null, 2).substring(0, 500));
        } else {
            console.error('    Error:', err.message);
        }
        process.exit(1);
    }

    // 5. Polling notifikacija + dohvat potpisanog dokumenta
    console.log('[5/5] Čekanje odobrenja i dohvat potpisanog dokumenta...');
    const timeoutMs = 120_000;
    const pollMs = 3_000;
    const start = Date.now();
    let signed = false;

    while (Date.now() - start < timeoutMs) {
        await sleep(pollMs);
        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`\r      ⏳ Čekanje... ${elapsed}s / ${timeoutMs / 1000}s`);

        // Poll notification service
        try {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            const params = new URLSearchParams({
                recipient: `http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije|${config.organization.hzzoCode}`,
                recipient_type: 'organization',
                date_from: fiveMinAgo.toISOString(),
            });
            const notifRes = await axios.get(
                `${CEZIH_URL}/API/notificationService/getNotifications?${params}`,
                { headers: { 'Cookie': cookieHeader }, timeout: 5000 }
            );
            const notifs: any[] = notifRes.data || [];
            for (const notif of notifs) {
                if (notif.operation === 'FULLY_SIGNED') {
                    try {
                        const resource = typeof notif.resource === 'string' ? JSON.parse(notif.resource) : notif.resource;
                        if (resource.transactionCode === transactionCode) {
                            signed = true;
                            break;
                        }
                    } catch { /* skip */ }
                }
            }
            if (signed) break;
        } catch { /* polling error, continue */ }
    }

    console.log(''); // new line after progress

    // Fetch signed documents
    try {
        const fetchRes = await axios.get(`${CEZIH_URL}/api/getSignedDocuments`, {
            params: { transactionId: transactionCode },
            headers: { 'Cookie': cookieHeader },
            timeout: 30000,
        });
        const result = fetchRes.data;

        console.log('\n═══════════ REZULTAT ═══════════');
        console.log(`Status:         ${result.signatureStatus}`);
        console.log(`Transaction:    ${result.transactionCode}`);
        console.log(`Potpisanih dok: ${result.signedDocuments?.length || 0}`);

        if (result.signatureStatus === 'FULLY_SIGNED') {
            for (const doc of (result.signedDocuments || [])) {
                console.log(`\n  📄 ${doc.documentType} (${doc.mimeType})`);
                console.log(`     messageId: ${doc.messageId}`);
                console.log(`     Veličina:  ${doc.base64Document.length} chars (base64)`);
            }
            console.log('\n✅ UDALJENI POTPIS USPJEŠAN!\n');
        } else {
            console.error(`\n❌ Status potpisa: ${result.signatureStatus}`);
            if (result.errorCode) console.error(`   Error code: ${result.errorCode}`);
            process.exit(1);
        }
    } catch (err: any) {
        console.error('\n❌ Greška pri dohvatu potpisanog dokumenta:', err.message);
        if (err.response) {
            console.error('   HTTP:', err.response.status);
            console.error('   Data:', JSON.stringify(err.response.data, null, 2).substring(0, 500));
        }
        process.exit(1);
    }
}

run().catch(err => {
    console.error('\nUncaught error:', err.message);
    process.exit(1);
});
