import { signatureService } from '../src/services/signature.service';

const testBundle = {
    resourceType: "Bundle",
    type: "message",
    entry: [
        {
            fullUrl: "urn:uuid:1234",
            resource: {
                resourceType: "MessageHeader",
                eventCoding: {
                    system: "http://cezih.hr/fhir/CodeSystem/message-events",
                    code: "request"
                },
                author: {
                    reference: "Practitioner/12345"
                }
            }
        },
        {
            fullUrl: "Practitioner/12345",
            resource: {
                resourceType: "Practitioner",
                identifier: [
                    {
                        system: "urn:oid:1.3.6.1.4.1.28284.1.6.2.2.1",
                        value: "12345678"
                    }
                ]
            }
        }
    ]
};

async function run() {
    console.log(`\n=== Testing SignatureService (${signatureService.getMode()}) ===`);

    if (signatureService.getMode() !== 'smartcard') {
        console.error('❌ Service failed to initialize smart card mode! Check PIN and reader.');
        process.exit(1);
    }

    try {
        console.log('\nSigning bundle...');
        const result = signatureService.signBundle(testBundle);

        console.log('\n✅ Successfully signed!');
        console.log('JWS Compact:');
        console.log(result.jwsCompact.substring(0, 100) + '...');

        console.log('\nSignature Data (Double Base64):');
        console.log(result.bundle.signature[0].data.substring(0, 50) + '...');

        console.log('\n--- Verifying Signature ---');
        const verifyResult = await signatureService.verifySignedBundle(result.bundle);

        if (verifyResult.valid) {
            console.log('✅ Signature is VALID cryptographically and matches author (DIGSIG-1)');
        } else {
            console.error('❌ Verification failed:', verifyResult.error);
        }

    } catch (e: any) {
        console.error('❌ Error during signing/verifying:', e.message);
    }
}

run();
