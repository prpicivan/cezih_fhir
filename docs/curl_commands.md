# CEZIH Certification CURL Commands

This document provides `curl` commands for all 22 test cases required for certification. You can use these commands to verify the API implementation directly from your terminal.

## General Information
- **Base URL**: `http://localhost:3010/api`
- **Auth Header**: Most commands require a `Bearer` token. You can obtain a system token via TC-3 or a user token via TC-1/2.
- **Convenience Endpoint**: You can trigger any test case via:
  `curl -X POST http://localhost:3010/api/certification/run/tc-XX -H "Authorization: Bearer <TOKEN>"`

---

## 1. Authentication & Authorization (TC 1-3)

### TC 1: Smart Card Auth (Initiate)
```bash
curl -X GET http://localhost:3010/api/auth/smartcard
```

### TC 2: Certilia mobile.ID Auth (Initiate)
```bash
curl -X GET http://localhost:3010/api/auth/certilia
```

### TC 3: System Authentication (Get Token)
```bash
curl -X POST http://localhost:3010/api/auth/system-token
```

---

## 2. Infrastructure & Terminology (TC 4-9)

### TC 4 & 5: Digital Signature Service Check
```bash
curl -X POST http://localhost:3010/api/certification/run/tc-4 -H "Authorization: Bearer <TOKEN>"
```

### TC 6: OID Generation
```bash
curl -X POST http://localhost:3010/api/oid/generate \
     -H "Content-Type: application/json" \
     -d '{"quantity": 1}'
```

### TC 7: Terminology Sync (CodeSystems)
```bash
curl -X POST http://localhost:3010/api/terminology/sync
```

### TC 8: Terminology Sync (ValueSets)
```bash
curl -X GET http://localhost:3010/api/terminology/value-sets
```

### TC 9: Registry Search (Organizations)
```bash
curl -X GET "http://localhost:3010/api/registry/organizations?name=KBC" \
     -H "Authorization: Bearer <TOKEN>"
```

---

## 3. Patient Management (TC 10-11)

### TC 10: Patient Search (MBO)
```bash
curl -X GET "http://localhost:3010/api/patient/search?mbo=123456789" \
     -H "Authorization: Bearer <TOKEN>"
```

### TC 11: Foreigner Registration (PMIR)
```bash
curl -X POST http://localhost:3010/api/patient/foreigner/register \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": {"family": "Doe", "given": ["John"]},
       "birthDate": "1980-01-01",
       "gender": "male",
       "nationality": "DE",
       "euCardNumber": "12345678901234567890"
     }'
```

---

## 4. Visit & Case Management (TC 12-17)

### TC 12: Start Visit (Encounter Start)
```bash
curl -X POST http://localhost:3010/api/visit/create \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "patientMbo": "123456789",
       "practitionerId": "practitioner-1",
       "organizationId": "org-1",
       "startDate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
       "class": "AMB"
     }'
```

### TC 13: Update Visit
```bash
curl -X PUT http://localhost:3010/api/visit/<VISIT_ID> \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "diagnosisCode": "M17.1",
       "diagnosisDisplay": "Unilateralni osteoartritis koljena"
     }'
```

### TC 14: End Visit (Encounter Close)
```bash
curl -X POST http://localhost:3010/api/visit/<VISIT_ID>/close \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"endDate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
```

### TC 15: Case Search (EpisodeOfCare)
```bash
curl -X GET http://localhost:3010/api/case/patient/123456789 \
     -H "Authorization: Bearer <TOKEN>"
```

### TC 16: Case Creation
```bash
curl -X POST http://localhost:3010/api/case/create \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "patientMbo": "123456789",
       "practitionerId": "practitioner-1",
       "organizationId": "org-1",
       "status": "active",
       "title": "Testna Epizoda: Fizikalna Terapija",
       "startDate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
       "diagnosisCode": "M17.0",
       "diagnosisDisplay": "Primarni osteoartritis koljena, obostrani"
     }'
```

### TC 17: Update/Close Case
```bash
curl -X PUT http://localhost:3010/api/case/<CASE_ID> \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"status": "finished", "endDate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
```

---

## 5. Clinical Documents (TC 18-22)

### TC 18: Send Clinical Document (MHD)
```bash
curl -X POST http://localhost:3010/api/document/send \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "type": "AMBULATORY_REPORT",
       "patientMbo": "123456789",
       "practitionerId": "practitioner-1",
       "organizationId": "org-1",
       "title": "Testni medicinski nalaz",
       "anamnesis": "Pacijent se žali na bol u koljenu.",
       "finding": "Bez vidljivih trauma.",
       "diagnosisCode": "M17.0",
       "diagnosisDisplay": "Primarni osteoartritis koljena, obostrani",
       "date": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
     }'
```

### TC 19: Replace Document
```bash
curl -X POST http://localhost:3010/api/document/replace \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "originalDocumentOid": "1.2.3.4.5...",
       "type": "AMBULATORY_REPORT",
       "title": "Ažurirani nalaz (TC-19)",
       "anamnesis": "Dodatne informacije o pacijentu."
     }'
```

### TC 20: Cancel Document (Storno)
```bash
curl -X POST http://localhost:3010/api/document/cancel \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"documentOid": "1.2.3.4.5..."}'
```

### TC 21: Document Search (MHD ITI-67)
```bash
curl -X GET "http://localhost:3010/api/document/search?patientMbo=123456789" \
     -H "Authorization: Bearer <TOKEN>"
```

### TC 22: Document Retrieval (MHD ITI-68)
```bash
curl -X GET "http://localhost:3010/api/document/retrieve?url=urn:oid:1.2.3.4..." \
     -H "Authorization: Bearer <TOKEN>"
```
