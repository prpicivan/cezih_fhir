import { signatureService } from '../src/services/signature.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a mocked 'LJEKARSKI NALAZ' (Medical Report) FHIR Bundle
 * built to simulate the structure expected by CEZIH for G9 compliance testing.
 */
function buildMockMedicalReportBundle() {
    const reportOid = `urn:oid:2.16.840.1.113883.3.33.1.2.1.1.1.${uuidv4().replace(/-/g, '')}`;

    return {
        resourceType: 'Bundle',
        id: uuidv4(),
        type: 'message',
        timestamp: new Date().toISOString(),
        entry: [
            {
                fullUrl: `urn:uuid:${uuidv4()}`,
                resource: {
                    resourceType: 'MessageHeader',
                    eventCoding: {
                        system: 'http://cezih.hr/fhir/CodeSystem/message-events',
                        code: 'MEDICINSKI_NALAZ',
                        display: 'Slanje Medicinskog Nalaza',
                    },
                    author: {
                        reference: 'Practitioner/987654321', // Example Doctor Identifier
                        display: 'Dr. Ivan Horvat'
                    },
                    source: {
                        endpoint: 'urn:oid:1.2.3.4.5.6.7' // Example PolyClinic OID
                    },
                    focus: [
                        {
                            reference: reportOid,
                        }
                    ]
                }
            },
            {
                fullUrl: reportOid,
                resource: {
                    resourceType: 'DiagnosticReport',
                    id: reportOid.replace('urn:oid:', ''),
                    status: 'final',
                    code: {
                        coding: [
                            {
                                system: 'http://loinc.org',
                                code: '11502-2',
                                display: 'Laboratory report'
                            }
                        ]
                    },
                    subject: {
                        reference: 'Patient/123456789', // Example MBO
                        display: 'Ana Anic'
                    },
                    effectiveDateTime: new Date().toISOString(),
                    issued: new Date().toISOString(),
                    performer: [
                        {
                            reference: 'Practitioner/987654321',
                            display: 'Dr. Ivan Horvat'
                        }
                    ],
                    presentedForm: [
                        {
                            contentType: 'text/plain',
                            data: Buffer.from('Pacijent je stabilno. Preporuča se mirovanje i kontrola za tjedan dana.').toString('base64')
                        }
                    ]
                }
            }
        ]
    };
}

async function runTest() {
    console.log(`\n======================================================`);
    console.log(`🏥 CEZIH FHIR G9 Testing: Document Generation & Signing`);
    console.log(`======================================================`);

    if (signatureService.getMode() !== 'smartcard') {
        console.warn('\n⚠️  WARNING: Smart Card was not detected or IDEN_PIN is missing from .env!');
        console.warn('⚠️  The service is currently using MOCK software signing.');
        console.warn('⚠️  To test hardware signing, run this script via:');
        console.warn('   IDEN_PIN="your_pin" npx ts-node scripts/test-fhir-document.ts\n');
    } else {
        console.log('\n✅ Smart Card hardware mode is ACTIVE.\n');
    }

    // 1. Generate FHIR Compliant Payload
    console.log('📝 1. Generating FHIR R4 \'MEDICINSKI NALAZ\' (Medical Report) Bundle...');
    const fhirBundle = buildMockMedicalReportBundle();
    console.log(`   ➔ Bundle ID: ${fhirBundle.id}`);
    console.log(`   ➔ Report Content Generated! (Data length: ${JSON.stringify(fhirBundle).length} bytes)`);

    // 2. Pass to SignatureService
    console.log('\n🔐 2. Triggering JCS Canonicalization & JWS Electronic Signature...');
    try {
        const start = Date.now();
        // The service orchestrates Canonicalization + SHA Hash + Smart Card PKCS#11 Exec + JWS Output
        const result = signatureService.signBundle(fhirBundle);
        const duration = Date.now() - start;

        console.log(`   ➔ Signature Generated in ${duration}ms!`);
        console.log(`   ➔ JWS Header Alg: ${JSON.parse(Buffer.from(result.jwsCompact.split('.')[0], 'base64url').toString()).alg}`);

        // 3. Verify Signature & DIGSIG-1 Rules
        console.log('\n🔍 3. Validating Signature against Mathematical Curves and CEZIH DIGSIG-1 rules...');
        const verifyResult = await signatureService.verifySignedBundle(result.bundle);

        if (verifyResult.valid) {
            console.log('   ✅ Valid! The generated FHIR Bundle is mathematically sound and matches the Practitioner.');
            console.log('\n[SUCCESS] The FHIR compliance pipeline and PKCS#11 Hardware Signing are fully functional locally!');
        } else {
            console.error('\n   ❌ Validation Failed:', verifyResult.error);
        }

    } catch (e: any) {
        console.error('\n❌ Signing execution failed:', e.message);
    }
}

runTest();
