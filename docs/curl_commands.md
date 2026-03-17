# CEZIH FHIR Middleware — API pozivi (cURL)

Ovaj dokument pokriva **sve API endpointe** CezihFhir middleware-a s primjerima poziva, parametrima i očekivanim odgovorima. Namijenjen je G9 developerima i služi kao referentni priručnik za integraciju.

---

## 0. Autentikacija — prije prvog poziva

Middleware koristi **gateway sesiju** koju inicijalizira liječnik putem smart kartice ili Certilia mobilne aplikacije. Svi API pozivi se izvršavaju u kontekstu te sesije.

### Opcija A: Smart Card (PKCS#11) — preporučeno za produkciju
```bash
# 1. Pokreni interaktivni SC login (otvara browser za SSO)
curl -X POST http://localhost:3010/api/auth/smartcard/interactive

# 2. Provjeri status sesije
curl -X GET http://localhost:3010/api/auth/status
```

### Opcija B: Certilia mobile.ID
```bash
# 1. Pokreni Certilia login (vraća transactionCode)
curl -X POST http://localhost:3010/api/auth/certilia/initiate

# 2. Provjeri status (polling dok korisnik potvrdi na mobitelu)
curl -X GET "http://localhost:3010/api/auth/certilia/check?transactionCode=<CODE>"

# 3. Dovrši login
curl -X POST http://localhost:3010/api/auth/certilia/login \
     -H "Content-Type: application/json" \
     -d '{"transactionCode": "<CODE>"}'
```

### Opcija C: System Token (M2M, za pozadinske servise)
```bash
curl -X POST http://localhost:3010/api/auth/system-token
```
**Response:**
```json
{"success": true, "token": "eyJ...", "expiresIn": 300}
```

### Provjera sesije
```bash
curl -X GET http://localhost:3010/api/auth/status
```
**Response:**
```json
{
  "authenticated": true,
  "sessionAge": "45 min",
  "bootInstance": "q4ka2s",
  "lastKeepAlive": "2026-03-16T12:30:00Z"
}
```

> **Napomena:** Većina endpointa NE zahtijeva eksplicitni `Authorization` header — middleware automatski koristi aktivnu gateway sesiju. Header je potreban samo ako koristite system token ili radite M2M integraciju.

---

## 1. Health Check

```bash
curl -X GET http://localhost:3010/api/health
```
**Response:**
```json
{
  "status": "ok",
  "service": "CEZIH FHIR Integration",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "testCases": {"total": 22, "implemented": 22}
}
```

---

## 2. Autentikacija i sesija (TC 1–4)

### TC1: Smart Card Login
```bash
# Info o smart kartici
curl -X GET http://localhost:3010/api/auth/smartcard

# Interaktivni login
curl -X POST http://localhost:3010/api/auth/smartcard/interactive
```
**Response (smartcard info):**
```json
{
  "available": true,
  "tokens": ["CertiliaGen2Card (Sign)", "CertiliaGen2Card (Iden)"],
  "algorithm": "ES256",
  "subject": "CN=Ivan Prpić, serialNumber=PNOHR-30160453873"
}
```

### TC2: Certilia Remote Login
```bash
curl -X POST http://localhost:3010/api/auth/certilia/initiate
```
**Response:**
```json
{"success": true, "transactionCode": "abc123", "qrUrl": "https://..."}
```

### TC3: SSO Callback
```bash
# Inicijacija SSO flowa — vraća redirect URL
curl -X GET "http://localhost:3010/api/auth/initiate?redirectUri=http://localhost:3001/callback"
```

### TC4: System Token (AKD validacija)
```bash
curl -X POST http://localhost:3010/api/auth/system-token
```

### Dijagnostika sesije
```bash
curl -X GET http://localhost:3010/api/auth/diagnostics
```
**Response:**
```json
{
  "bootInstance": "q4ka2s",
  "pid": 9212,
  "uptime": "2h 15m",
  "sessionAge": "45 min",
  "keepAliveCount": 12,
  "lastKeepAlive": "2026-03-16T12:30:00Z",
  "cookieCount": 1
}
```

---

## 3. OID Generiranje (TC 6)

```bash
curl -X POST http://localhost:3010/api/oid/generate \
     -H "Content-Type: application/json" \
     -d '{"quantity": 5}'
```
**Response:**
```json
{
  "success": true,
  "oids": [
    "2.16.840.1.113883.2.7.50.2.1.740001",
    "2.16.840.1.113883.2.7.50.2.1.740002",
    "..."
  ]
}
```

---

## 4. Terminologija (TC 7–8)

### TC7: Sinkronizacija CodeSystem-a (ITI-96)
```bash
# Puna sinkronizacija s CEZIH-a (traje ~30s)
curl -X POST http://localhost:3010/api/terminology/sync
```
**Response:**
```json
{"success": true, "codeSystems": 142, "valueSets": 56}
```

### TC7: Dohvat CodeSystem-a
```bash
# Svi sa CEZIH-a
curl -X GET http://localhost:3010/api/terminology/code-systems

# Lokalni cache
curl -X GET http://localhost:3010/api/terminology/local-code-systems
```

### TC8: Dohvat ValueSet-a (ITI-95)
```bash
curl -X GET http://localhost:3010/api/terminology/value-sets

# Lokalni cache
curl -X GET http://localhost:3010/api/terminology/local-value-sets
```

### Pretraga dijagnoza (MKB-10)
```bash
curl -X GET "http://localhost:3010/api/terminology/diagnoses?q=hipertenz"
```
**Response:**
```json
{
  "results": [
    {"code": "I10", "display": "Hypertensio arterialis essentialis (primaria)"},
    {"code": "I11", "display": "Morbus cordis hypertensivus"}
  ]
}
```

### Pretraga koncepata
```bash
curl -X GET "http://localhost:3010/api/terminology/local-concepts?system=vrsta-posjete&code=1"
```

---

## 5. mCSD Registar (TC 9)

Podržani resursi: `Organization`, `Practitioner`, `PractitionerRole`, `HealthcareService`, `Location`, `Endpoint`

### Pretraga organizacija
```bash
curl -X GET "http://localhost:3010/api/registry/Organization?name=bolnica"
```
**Response:**
```json
{
  "success": true,
  "data": {
    "resourceType": "Bundle",
    "type": "searchset",
    "total": 3,
    "entry": [
      {"resource": {"resourceType": "Organization", "name": "KBC Zagreb", "..."}}
    ]
  }
}
```

### Pretraga djelatnika
```bash
curl -X GET "http://localhost:3010/api/registry/Practitioner?name=Horvat"
```

### Dohvat po ID-u
```bash
curl -X GET "http://localhost:3010/api/registry/Organization/12345"
```

### Povijest promjena
```bash
curl -X GET "http://localhost:3010/api/registry/Organization/_history"
```

---

## 6. Pacijenti (TC 10–11)

### TC10: Pretraga pacijenta po MBO (PDQm ITI-78)
```bash
curl -X GET "http://localhost:3010/api/patient/search?mbo=999999423"
```
**Response:**
```json
{
  "success": true,
  "patient": {
    "mbo": "999999423",
    "name": "Pero Perić",
    "birthDate": "1990-01-01",
    "gender": "male",
    "address": "Zagreb, Ilica 1"
  }
}
```

### Lokalni registar pacijenata
```bash
curl -X GET http://localhost:3010/api/patient/registry
```

### Pacijentov eKarton (dokumenti + slučajevi)
```bash
curl -X GET "http://localhost:3010/api/patient/999999118/chart"
```
**Response:**
```json
{
  "chart": {
    "patient": {"mbo": "999999118", "name": "Ana Anić"},
    "documents": [...],
    "lastDocument": {...},
    "cases": [...]
  }
}
```

### TC11: Registracija stranog pacijenta (PMIR ITI-93)
```bash
curl -X POST http://localhost:3010/api/patient/foreigner/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": {"family": "Müller", "given": ["Hans"]},
       "birthDate": "1985-06-15",
       "gender": "male",
       "nationality": "DE",
       "documentType": "passport",
       "documentNumber": "C01234567"
     }'
```
**Response:**
```json
{
  "success": true,
  "patient": {
    "cezihId": "Patient/foreign-12345",
    "identifier": "PNOHR-C01234567"
  }
}
```

---

## 7. Posjete — Encounter (TC 12–14)

### TC12: Kreiranje posjete
```bash
curl -X POST http://localhost:3010/api/visit/create \
     -H "Content-Type: application/json" \
     -d '{
       "patientMbo": "999999423",
       "class": "AMB",
       "startDate": "2026-03-16T10:00:00Z"
     }'
```
**Response:**
```json
{
  "success": true,
  "visit": {
    "id": "a1b2c3d4-e5f6-...",
    "cezihVisitId": "identifikator-posjete-12345",
    "status": "in-progress",
    "class": "AMB"
  }
}
```

> **`class` vrijednosti:** `AMB` (ambulantni), `IMP` (bolnički), `HH` (kućna posjeta), `EMER` (hitna), `VR` (virtualna)

### TC13: Ažuriranje posjete
```bash
curl -X PUT http://localhost:3010/api/visit/<VISIT_ID> \
     -H "Content-Type: application/json" \
     -d '{
       "diagnosisCode": "I10",
       "diagnosisDisplay": "Hypertensio arterialis essentialis"
     }'
```
**Response:**
```json
{"success": true, "visit": {"id": "...", "status": "in-progress"}}
```

### TC14: Zatvaranje posjete
```bash
curl -X POST http://localhost:3010/api/visit/<VISIT_ID>/close \
     -H "Content-Type: application/json" \
     -d '{"endDate": "2026-03-16T11:00:00Z"}'
```
**Response:**
```json
{"success": true, "visit": {"id": "...", "status": "finished"}}
```

### Storniranje posjete
```bash
curl -X POST http://localhost:3010/api/visit/<VISIT_ID>/cancel
```

### Sve lokalne posjete
```bash
curl -X GET http://localhost:3010/api/visit/all
```

### TC15: Dohvat posjeta s CEZIH-a (QEDm)
```bash
curl -X GET http://localhost:3010/api/visit/remote/999999423
```

---

## 8. Zdravstveni slučajevi — Condition (TC 15–17)

### TC15: Slučajevi pacijenta (QEDm)
```bash
curl -X GET http://localhost:3010/api/case/patient/999999423
```
**Response:**
```json
{
  "success": true,
  "cases": [
    {
      "id": "case-1",
      "cezihCaseId": "cezih-condition-123",
      "status": "active",
      "diagnosisCode": "I10",
      "diagnosisDisplay": "Hypertensio arterialis essentialis",
      "startDate": "2026-03-01"
    }
  ]
}
```

### TC16: Kreiranje slučaja
```bash
curl -X POST http://localhost:3010/api/case/create \
     -H "Content-Type: application/json" \
     -d '{
       "patientMbo": "999999423",
       "diagnosisCode": "I10",
       "diagnosisDisplay": "Hypertensio arterialis essentialis",
       "startDate": "2026-03-16T10:00:00Z",
       "notes": "Novodijagnosticirana hipertenzija"
     }'
```
**Response:**
```json
{
  "success": true,
  "case": {
    "id": "case-abc123",
    "cezihCaseId": "cezih-condition-456",
    "status": "active"
  }
}
```

### TC17: Ažuriranje slučaja
```bash
curl -X PUT http://localhost:3010/api/case/<CASE_ID> \
     -H "Content-Type: application/json" \
     -d '{"status": "resolved", "endDate": "2026-03-16T11:00:00Z"}'
```

### Akcije na slučaju
```bash
curl -X POST http://localhost:3010/api/case/<CASE_ID>/action \
     -H "Content-Type: application/json" \
     -d '{"action": "reactivate"}'
```

---

## 9. Klinička dokumentacija (TC 18–22)

### TC18: Potpuno slanje dokumenta (potpis + MHD)

Ovo je **primarni endpoint** za slanje dokumenta. Potpisuje bundle i šalje na CEZIH u jednom pozivu.

```bash
curl -X POST http://localhost:3010/api/document/send-full \
     -H "Content-Type: application/json" \
     -d '{
       "patientMbo": "999999423",
       "visitId": "<VISIT_ID>",
       "caseId": "<CASE_ID>",
       "documentType": "011",
       "title": "Ambulantni izvještaj",
       "anamnesis": "Pacijent se žali na glavobolju i vrtoglavicu.",
       "finding": "RR 160/95 mmHg, puls 88/min.",
       "recommendation": "Kontrola za 2 tjedna.",
       "diagnosisCode": "I10",
       "diagnosisDisplay": "Hypertensio arterialis essentialis",
       "visitOutcome": "1"
     }'
```
**Response (uspjeh):**
```json
{
  "success": true,
  "documentOid": "2.16.840.1.113883.2.7.50.2.1.740001",
  "cezihResponse": {
    "status": 200,
    "operationOutcome": "All OK"
  }
}
```

> **`documentType` vrijednosti:**
> | Kod | Opis |
> |-----|------|
> | `011` | Izvješće o ishodu liječenja |
> | `012` | Specijalističko-konzilijani nalaz |
> | `013` | Otpusno pismo |

### TC18 (alternativa): Slanje s odvojenim potpisom

Ako koristite Certilia remote potpis, flow je u 3 koraka:

```bash
# 1. Priprema dokumenta (vraca unsigned bundle)
curl -X POST http://localhost:3010/api/document/send \
     -H "Content-Type: application/json" \
     -d '{ ... isti body kao send-full ... }'

# 2. Pokreni Certilia potpis
curl -X POST http://localhost:3010/api/document/certilia-sign \
     -H "Content-Type: application/json" \
     -d '{"documentOid": "<OID>", "bundle": {...}}'

# 3. Provjeri status potpisa (polling)
curl -X GET "http://localhost:3010/api/document/remote-sign/status/<TRANSACTION_CODE>"

# 4. Dovrši slanje nakon potpisa
curl -X POST http://localhost:3010/api/document/send/complete \
     -H "Content-Type: application/json" \
     -d '{"documentOid": "<OID>"}'
```

### TC18 (alternativa): Potpis smart karticom
```bash
curl -X POST http://localhost:3010/api/document/smartcard-sign \
     -H "Content-Type: application/json" \
     -d '{"documentOid": "<OID>", "bundle": {...}}'
```

### TC19: Zamjena dokumenta
```bash
curl -X POST http://localhost:3010/api/document/replace \
     -H "Content-Type: application/json" \
     -d '{
       "originalDocumentOid": "2.16.840.1.113883.2.7.50.2.1.740001",
       "patientMbo": "999999423",
       "visitId": "<VISIT_ID>",
       "documentType": "011",
       "title": "Ažurirani izvještaj (ispravak)",
       "anamnesis": "Korigirana anamneza...",
       "diagnosisCode": "I10",
       "diagnosisDisplay": "Hypertensio arterialis essentialis"
     }'
```
**Response:**
```json
{
  "success": true,
  "newDocumentOid": "2.16.840.1.113883.2.7.50.2.1.740002",
  "replacedOid": "2.16.840.1.113883.2.7.50.2.1.740001"
}
```

### TC20: Storniranje dokumenta
```bash
curl -X POST http://localhost:3010/api/document/cancel \
     -H "Content-Type: application/json" \
     -d '{"documentOid": "2.16.840.1.113883.2.7.50.2.1.740001"}'
```
**Response:**
```json
{"success": true, "cancelledOid": "2.16.840.1.113883.2.7.50.2.1.740001"}
```

### TC21: Pretraga dokumenata na CEZIH-u (ITI-67)
```bash
curl -X GET "http://localhost:3010/api/document/search-remote?mbo=999999118"
```
**Response:**
```json
{
  "success": true,
  "count": 4,
  "documents": [
    {
      "id": "urn:oid:2.16.840.1.113883.2.7.50.2.1.735950",
      "title": "Otpusno pismo iz privatne zdravstvene ustanove",
      "type": "013",
      "status": "current",
      "createdAt": "2026-03-13T10:30:00Z",
      "authorName": "Batek Teo",
      "institutionName": "IN-CON TES_DOK30 JELEN",
      "diagnosisCode": "I10",
      "diagnosisDisplay": "Hypertensio arterialis essentialis (primaria)",
      "isRemote": true
    }
  ]
}
```

### TC21: Pretraga lokalnih dokumenata
```bash
curl -X GET "http://localhost:3010/api/document/search?mbo=999999423"
```

### TC22: Dohvat punog dokumenta (ITI-68)
```bash
curl -X GET "http://localhost:3010/api/document/retrieve?url=urn:oid:2.16.840.1.113883.2.7.50.2.1.735950"
```
**Response:**
```json
{
  "success": true,
  "document": {
    "anamnesis": "pri svijesti, afebrilna, eupnoična...",
    "recommendation": "Apetit dobar, stolica i mokrenje uredno",
    "diagnosisCode": "I10",
    "diagnosisDisplay": "Hypertensio arterialis essentialis (primaria)",
    "visitOutcome": "Pregled završen uspješno",
    "authorName": "Batek Teo",
    "institutionName": "IN-CON TES_DOK30 JELEN",
    "title": "Otpusno pismo iz privatne zdravstvene ustanove",
    "createdAt": "2026-03-13T10:30:00Z",
    "isRemote": true,
    "fullResource": { "resourceType": "Bundle", "type": "document", "..." }
  }
}
```

> **Mapiranje FHIR resursa u odgovor:**
> | Polje | FHIR resurs | FHIR polje |
> |-------|-------------|------------|
> | `anamnesis` | Observation (code=15) | `valueString` |
> | `recommendation` | CarePlan | `description` |
> | `diagnosisCode/Display` | Condition | `code.coding[0]` |
> | `visitOutcome` | Observation (code=24) | `valueCodeableConcept.coding[0].display` |
> | `authorName` | Practitioner | `name[0].family + given` |
> | `institutionName` | Organization | `name` |

---

## 10. Postavke sustava

### Dohvat konfiguracije
```bash
curl -X GET http://localhost:3010/api/settings
```

### Sinkronizacija s CEZIH-om
```bash
curl -X POST http://localhost:3010/api/settings/sync
```

### Izbornik (menu konfiguracija)
```bash
# Dohvat
curl -X GET http://localhost:3010/api/settings/menu

# Ažuriranje
curl -X POST http://localhost:3010/api/settings/menu \
     -H "Content-Type: application/json" \
     -d '{"items": [...]}'
```

### Tipovi dokumenata
```bash
curl -X GET http://localhost:3010/api/settings/document-types
```
**Response:**
```json
{
  "types": [
    {"code": "011", "display": "Izvješće o ishodu liječenja"},
    {"code": "012", "display": "Specijalističko-konzilijani nalaz"},
    {"code": "013", "display": "Otpusno pismo"}
  ]
}
```

---

## 11. Audit Log

### Svi zapisi
```bash
curl -X GET "http://localhost:3010/api/audit/logs?limit=50"
```
**Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "action": "DOCUMENT_SEND",
      "status": "SUCCESS",
      "patientMbo": "999999423",
      "details": "OID: 2.16.840.1.113883.2.7.50.2.1.740001",
      "timestamp": "2026-03-16T10:30:00Z"
    }
  ]
}
```

### Zapisi za posjetu
```bash
curl -X GET "http://localhost:3010/api/audit/logs/<VISIT_ID>"
```

---

## 12. Certifikacijski Test Runner

Automatsko pokretanje testnih slučajeva:

```bash
# Pokreni pojedinačni TC
curl -X POST http://localhost:3010/api/certification/run/tc-6

# Pokreni sve (koji ne zahtijevaju SC)
curl -X POST http://localhost:3010/api/certification/run-all

# Status
curl -X GET http://localhost:3010/api/certification/status
```
**Response (run):**
```json
{
  "testCase": "TC6",
  "status": "PASS",
  "duration": "1.2s",
  "details": "Generated 5 OIDs successfully"
}
```

---

## 13. CEZIH servisne putanje (referenca)

Svi CEZIH servisi su na:
`https://certws2.cezih.hr:8443/services-router/gateway/`

| Servis | Putanja | IHE transakcije |
|--------|---------|-----------------|
| OID registar | `identifier-registry-services/api/v1/` | ITI-98 |
| Terminologija | `terminology-services/api/v1/` | ITI-96, ITI-95 |
| mCSD registar | `mcsd-services/api/v1/` | ITI-90 |
| Pacijenti | `patient-registry-services/api/v1/` | ITI-78, ITI-93 |
| Posjete | `encounter-services/api/v1/` | Encounter lifecycle |
| Slučajevi | `health-issue-services/api/v1/` | Condition lifecycle |
| QEDm | `ihe-qedm-services/api/v1/` | Encounter/Condition query |
| Dokumentacija | `doc-mhd-svc/api/v1/` | ITI-65, ITI-67, ITI-68 |
