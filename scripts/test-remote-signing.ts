/**
 * Test skript za CEZIH Udaljeni potpis (Remote Signing via Certilia mobile.ID)
 * 
 * Ovaj skript testira cijeli flow:
 * 1. Autentikacija (OIDC via Certilia mobile.ID ili mock token)
 * 2. Priprema FHIR Bundle za potpis
 * 3. Šalje na CEZIH Remote Sign API
 * 4. Čeka odobrenje na mobitelu (Certilia mobileID push)
 * 5. Dohvaća potpisane dokumente
 * 
 * Pokretanje:
 *   npx ts-node scripts/test-remote-signing.ts
 *   npx ts-node scripts/test-remote-signing.ts --mock    (bez CEZIH pristupa)
 */
import dotenv from 'dotenv';
dotenv.config();

import { remoteSignService, RemoteSignDocument } from '../src/services/remote-sign.service';
import { authService } from '../src/services/auth.service';
import { config } from '../src/config';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Test Data: FHIR Message Bundle
// ============================================================

const testFhirBundle = {
    resourceType: "Bundle",
    type: "message",
    timestamp: new Date().toISOString(),
    entry: [
        {
            fullUrl: "urn:uuid:" + uuidv4(),
            resource: {
                resourceType: "MessageHeader",
                eventCoding: {
                    system: "http://cezih.hr/fhir/CodeSystem/message-events",
                    code: "document-notification"
                },
                source: {
                    name: config.software.name,
                    software: config.software.name,
                    version: config.software.version,
                    endpoint: `http://localhost:${config.port}`
                },
                author: {
                    reference: "Practitioner/test-doctor"
                },
                sender: {
                    reference: `Organization/${config.organization.hzzoCode}`
                }
            }
        },
        {
            fullUrl: "urn:uuid:" + uuidv4(),
            resource: {
                resourceType: "Practitioner",
                identifier: [
                    {
                        system: "urn:oid:1.3.6.1.4.1.28284.1.6.2.2.1",
                        value: "12345678"
                    }
                ],
                name: [{ family: "Test", given: ["Doktor"] }]
            }
        },
        {
            fullUrl: "urn:uuid:" + uuidv4(),
            resource: {
                resourceType: "Patient",
                identifier: [
                    {
                        system: "urn:oid:2.16.840.1.113883.3.4424.4.1.5",
                        value: "00000000001"
                    }
                ],
                name: [{ family: "Testni", given: ["Pacijent"] }],
                gender: "male",
                birthDate: "1990-01-01"
            }
        }
    ]
};

// ============================================================
// Main
// ============================================================

async function runMockTest() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║         CEZIH Udaljeni Potpis — MOCK TEST                   ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Ovo je simulacija — ne zove pravi CEZIH API.               ║');
    console.log('║  Za pravi test koristite: npx ts-node test-remote-signing   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const oib = config.remoteSigning.signerOib || '30160453873';
    console.log(`[Mock] OIB: ${oib}`);
    console.log(`[Mock] Broj dokumenata: 1 (FHIR_MESSAGE)`);

    // Prepare document
    const doc = remoteSignService.prepareFhirMessageDocument(testFhirBundle);
    console.log(`[Mock] Document messageId: ${doc.messageId}`);
    console.log(`[Mock] Document size: ${doc.base64Document.length} chars (base64)`);

    // Simulate the request payload
    console.log('\n--- Request koji bi se poslao na CEZIH: ---');
    const requestPayload = {
        documents: [{
            documentType: doc.documentType,
            mimeType: doc.mimeType,
            messageId: doc.messageId,
            base64Document: doc.base64Document.substring(0, 50) + '...(truncated)',
        }],
        oib,
        sourceSystem: config.remoteSigning.sourceSystem,
        requestId: uuidv4(),
    };
    console.log(JSON.stringify(requestPayload, null, 2));

    // Simulate response
    const mockTransactionCode = uuidv4();
    console.log('\n--- Simulirani odgovor s CEZIH-a: ---');
    console.log(JSON.stringify({
        transactionCode: mockTransactionCode,
        oib,
        documents: 1,
    }, null, 2));

    console.log('\n📱 [SIMULACIJA] Push notifikacija bi bila poslana na Certilia mobileID...');
    console.log('📱 [SIMULACIJA] Korisnik bi odobrio potpis na telefonu...');

    // Simulate notification
    console.log('\n--- Simulirana notifikacija FULLY_SIGNED: ---');
    console.log(JSON.stringify({
        operation: 'FULLY_SIGNED',
        resource: JSON.stringify({ transactionCode: mockTransactionCode }),
        timestamp: new Date().toISOString(),
        uuid: uuidv4(),
    }, null, 2));

    // Simulate signed document
    console.log('\n--- Simulirani potpisani dokument: ---');
    console.log(JSON.stringify({
        transactionCode: mockTransactionCode,
        signatureStatus: 'FULLY_SIGNED',
        signedDocuments: [{
            messageId: doc.messageId,
            mimeType: 'JSON',
            documentType: 'FHIR_MESSAGE',
            base64Document: '#base64EncodedSignedDocument (sadrži JWS potpis)',
        }]
    }, null, 2));

    console.log('\n✅ MOCK test završen uspješno!');
    console.log('\n💡 Za pravi test s mobilnim potpisom:');
    console.log('   1. Dobijte CEZIH test pristup (VPN + credentials)');
    console.log('   2. Popunite CEZIH_CLIENT_ID i CEZIH_CLIENT_SECRET u .env');
    console.log('   3. Pokrenite: npx ts-node scripts/test-remote-signing.ts');
}

async function runRealTest() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║       CEZIH Udaljeni Potpis — PRAVI TEST                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Ovaj test šalje FHIR dokument na CEZIH za potpis.          ║');
    console.log('║  Na mobitel ćete dobiti push za odobrenje potpisa.           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const oib = config.remoteSigning.signerOib;
    if (!oib) {
        console.error('❌ SIGNER_OIB nije postavljen u .env!');
        process.exit(1);
    }

    // Check CEZIH credentials
    if (!config.auth.clientId || config.auth.clientId === 'your_client_id_here') {
        console.error('❌ CEZIH_CLIENT_ID nije postavljen u .env!');
        console.log('💡 Popunite CEZIH_CLIENT_ID i CEZIH_CLIENT_SECRET u .env datoteci.');
        process.exit(1);
    }

    try {
        // Step 1: Get user auth token
        console.log('[1/4] Autentikacija korisnika...');

        // For testing, we'll use the system token 
        // In production, user would go through OIDC + Certilia mobile.ID flow
        console.log('[1/4] Koristimo system token za test...');
        const systemToken = await authService.getSystemToken();
        console.log('[1/4] ✅ Token dobiven');

        // Step 2: Prepare FHIR document
        console.log('\n[2/4] Priprema FHIR Bundle za potpis...');
        const doc = remoteSignService.prepareFhirMessageDocument(testFhirBundle);
        console.log(`[2/4] ✅ messageId: ${doc.messageId}`);

        // Step 3: Submit for remote signing → sends push to mobile
        console.log('\n[3/4] Slanje na CEZIH Remote Sign API...');
        console.log('📱 Provjerite Certilia mobileID aplikaciju na telefonu!');

        const result = await remoteSignService.signAndWait(
            [doc],
            oib,
            systemToken,
            {
                timeoutMs: 120_000,  // 2 minute timeout
                pollIntervalMs: 3_000,
            }
        );

        // Step 4: Display results
        console.log('\n[4/4] ═══ REZULTAT ═══');
        console.log(`Status: ${result.signatureStatus}`);
        console.log(`Transaction: ${result.transactionCode}`);
        console.log(`Potpisanih dokumenata: ${result.signedDocuments.length}`);

        for (const signedDoc of result.signedDocuments) {
            console.log(`\n  📄 ${signedDoc.documentType} (${signedDoc.mimeType})`);
            console.log(`     messageId: ${signedDoc.messageId}`);
            console.log(`     base64 size: ${signedDoc.base64Document.length} chars`);

            // Try to decode and show a preview
            try {
                const decoded = Buffer.from(signedDoc.base64Document, 'base64').toString('utf-8');
                const parsed = JSON.parse(decoded);
                if (parsed.signature) {
                    console.log('     ✅ Dokument sadrži signature element!');
                    console.log(`     Signature data (preview): ${JSON.stringify(parsed.signature).substring(0, 100)}...`);
                }
            } catch (e) {
                console.log(`     (Raw preview): ${signedDoc.base64Document.substring(0, 80)}...`);
            }
        }

        console.log('\n✅ UDALJENI POTPIS USPJEŠAN!');

    } catch (error: any) {
        console.error('\n❌ Greška:', error.message);
        if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            console.log('\n💡 Nije moguće spojiti se na CEZIH. Provjerite:');
            console.log('   - VPN konekcija prema CEZIH mreži');
            console.log('   - CEZIH_BASE_URL u .env datoteci');
        }
        process.exit(1);
    }
}

// ============================================================
// Entry Point
// ============================================================

const args = process.argv.slice(2);
const isMock = args.includes('--mock');

if (isMock) {
    runMockTest().catch(console.error);
} else {
    runRealTest().catch(console.error);
}
