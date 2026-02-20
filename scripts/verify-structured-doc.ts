import { clinicalDocumentService } from '../src/services/clinical-document.service';
import { ClinicalDocumentType } from '../src/types';

async function verifyStructuredDoc() {
    console.log('Testing structured FHIR document generation...');

    const testData = {
        type: ClinicalDocumentType.AMBULATORY_REPORT,
        patientMbo: '123456789',
        practitionerId: 'practitioner-1',
        organizationId: 'org-1',
        title: 'Testni Strukturirani Nalaz',
        anamnesis: 'Pacijent se žali na glavobolju.',
        status: 'Tlak 140/90.',
        finding: 'Opće stanje dobro.',
        recommendation: 'Više tekućine.',
        diagnosisCode: 'I10',
        diagnosisDisplay: 'Esencijalna hipertenzija',
        date: new Date().toISOString()
    };

    // We need to mock patient and visit since sendDocument normally fetches them
    // But we can test the buildFullDocumentBundle directly if we make it public or use a wrapper

    // For this test, let's just see if we can trigger a bundle generation logic
    // We'll use a simplified check on the internal builder

    try {
        // Accessing private method for verification (testing internal logic)
        const documentOid = 'test-oid';
        const patient = { name: { given: ['Ivan'], family: ['Horvat'] } };
        const visit = { id: 'visit-1' };

        const bundle = (clinicalDocumentService as any).buildFullDocumentBundle(
            testData,
            documentOid,
            patient,
            visit
        );

        console.log('Bundle generated successfully.');

        const composition = bundle.entry[0].resource;
        console.log('Composition Sections:', composition.section.length);

        const hasCondition = bundle.entry.some((e: any) => e.resource.resourceType === 'Condition');
        console.log('Has Condition Resource:', hasCondition);

        const diagnosisSection = composition.section.find((s: any) => s.title === 'Dijagnoza');
        console.log('Has Diagnosis Section:', !!diagnosisSection);

        if (hasCondition && diagnosisSection) {
            console.log('SUCCESS: Structured document meets CEZIH requirements.');
        } else {
            console.error('FAILURE: Missing structured components.');
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

verifyStructuredDoc();
