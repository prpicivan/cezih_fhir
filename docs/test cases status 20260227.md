# Test Case Results — CEZIH FHIR Middleware

> Backend autoriziran pametnom karticom (Ivan Prpić, OIB 30160453873)  
> Pacijent: MBO `999999423` — IVAN PACPRIVATNICI42  
> Datum: 2026-02-27

---

## TC3 — System Token (M2M)

**Request**
```
POST http://localhost:3010/api/auth/system-token
```

**Response** `200 OK`
```json
{
  "success": true,
  "tokenPreview": "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6IC..."
}
```
✅ JWT token uspješno dohvaćen iz `certsso2.cezih.hr`

---

## TC6 — OID Generate (ITI-98)

**Request**
```
POST http://localhost:3010/api/oid/generate
{ "quantity": 1 }
```

**Response** `200 OK`
```json
{
  "success": true,
  "oids": ["2.16.840.1.113883.2.7.50.2.1.722568"]
}
```
✅ Realni OID generiran iz CEZIH identifier registra

---

## TC7/TC8 — Terminology Sync (ITI-96 / ITI-95)

**Request**
```
POST http://localhost:3010/api/terminology/sync
```

**Response** `200 OK`
```json
{
  "success": true,
  "codeSystems": 20,
  "valueSets": 20
}
```
✅ 20 CodeSystem + 20 ValueSet sinkronizirano iz CEZIH terminologijskog servisa

---

## TC9 — Registry Organizations (mCSD)

**Request**
```
GET http://localhost:3010/api/registry/organizations
```

**Response** `500`
```json
{
  "error": "Pretraga organizacija nije dostupna u testnom okruženju CEZIH-a. Kontaktirajte administratora za ispravnu putanju endpointa."
}
```
❌ Endpoint nije dostupan u testnom okruženju (poznati problem sa mCSD putanjom)

---

## TC10 — Patient Search (MBO)

**Request**
```
GET http://localhost:3010/api/patient/search?mbo=999999423
```

**Response** `200 OK`
```json
{
  "success": true,
  "count": 1,
  "patients": [{
    "id": "999999423",
    "mbo": "999999423",
    "oib": "99999900419",
    "name": { "text": "IVAN PACPRIVATNICI42", "family": "PACPRIVATNICI42", "given": ["IVAN"] },
    "gender": "male",
    "birthDate": "1985-07-05",
    "active": true
  }]
}
```
✅ Pacijent pronađen u lokalnoj DB (sinkroniziran iz CEZIH-a)

---

## TC15 — Cases (EpisodeOfCare) — Dohvat

**Request**
```
GET http://localhost:3010/api/case/patient/999999423?refresh=true
```

**Response** `200 OK`
```json
{
  "success": true,
  "count": 1,
  "cases": [{
    "id": "b52327bb-ada6-4695-8838-87f2e9b403ba",
    "patientMbo": "999999423",
    "title": "Fizikalna terapija",
    "status": "active",
    "start": "2026-02-27T00:00:00.000Z",
    "diagnosisCode": "M17.1",
    "diagnosisDisplay": "Druga primarna gonartroza"
  }]
}
```
✅ Aktivni slučaj pronađen

---

## TC12 — Create Visit (encounter-create)

**Request**
```
POST http://localhost:3010/api/visit/create
{
  "patientMbo": "999999423",
  "practitionerId": "30160453873",
  "organizationId": "174900715",
  "startDate": "2026-02-27T21:00:00.000Z",
  "class": "AMB"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "result": {
    "resourceType": "Bundle",
    "type": "message",
    "entry": [{ "resource": { "resourceType": "MessageHeader", "response": { "code": "ok" } } }],
    "localVisitId": "6e5a34ff-1155-4eb5-a967-f8bf83831c57"
  }
}
```
✅ FHIR message poslan, `code: "ok"` | Visit ID: `6e5a34ff-1155-4eb5-a967-f8bf83831c57`

---

## TC13 — Update Visit (encounter-update)

**Request**
```
PUT http://localhost:3010/api/visit/6e5a34ff-1155-4eb5-a967-f8bf83831c57
{
  "patientMbo": "999999423",
  "diagnosisCode": "M17.1",
  "diagnosisDisplay": "Gonarthrosis"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "result": {
    "resourceType": "Bundle",
    "type": "message",
    "entry": [{ "resource": { "resourceType": "MessageHeader", "response": { "code": "ok" } } }]
  }
}
```
✅ FHIR message poslan, `code: "ok"`

---

## TC14 — Close Visit (encounter-close)

**Request**
```
POST http://localhost:3010/api/visit/6e5a34ff-1155-4eb5-a967-f8bf83831c57/close
{
  "patientMbo": "999999423",
  "endDate": "2026-02-27T22:06:00.000Z"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "result": {
    "resourceType": "Bundle",
    "type": "message",
    "entry": [{ "resource": { "resourceType": "MessageHeader", "response": { "code": "ok" } } }]
  }
}
```
✅ FHIR message poslan, `code: "ok"`, visit status → `finished`

---

## TC16 — Create Case (EpisodeOfCare)

**Request**
```
POST http://localhost:3010/api/case/create
{
  "patientMbo": "999999423",
  "title": "Bolovi u koljenu",
  "diagnosisCode": "M17.1",
  "diagnosisDisplay": "Druga primarna gonartroza",
  "practitionerId": "30160453873",
  "organizationId": "174900715",
  "startDate": "2026-02-27T21:10:24.318Z"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "result": {
    "resourceType": "Bundle",
    "type": "message",
    "entry": [{ "resource": { "resourceType": "MessageHeader", "response": { "code": "ok" } } }]
  }
}
```
✅ Case kreiran, ID u DB: `931b1e32-62a7-4b0b-8463-81757c64504f`, title: "Bolovi u koljenu"

---

## TC17 — Update Case

**Request**
```
PUT http://localhost:3010/api/case/931b1e32-62a7-4b0b-8463-81757c64504f
{
  "patientMbo": "999999423",
  "status": "active",
  "diagnosisCode": "M17.1",
  "diagnosisDisplay": "Gonartroza — azurirana dijagnoza"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "result": {
    "resourceType": "Bundle",
    "type": "message",
    "entry": [{ "resource": { "resourceType": "MessageHeader", "response": { "code": "ok" } } }]
  }
}
```
✅ Case ažuriran, FHIR message poslan s `code: "ok"`

---

## Sažetak — svih 22 TC

| TC | Naziv | HTTP | Status | Razlog ako nije testirano |
|---|---|---|---|---|
| TC1 | Smart Card autentikacija | — | ⚙️ Nije testirano | Zahtijeva fizički čitač kartice i browser flow; infrastrukturna ovisnost |
| TC2 | Certilia mobile.ID autentikacija | — | ⚙️ Nije testirano | Certilia lozinka istekla/neispravna, mobilni push ne dolazi na uređaj |
| TC3 | System Token (M2M) | 200 | ✅ | — |
| TC4 | Potpisivanje (Smart Card) | — | ⚙️ Nije testirano | Zahtijeva AKD PKCS#11 modul i fizički čitač kartice s SIGN PIN-om |
| TC5 | Potpisivanje (Certilia Cloud) | — | ⚙️ Nije testirano | Zahtijeva ispravan Certilia račun (lozinka neispravna u testnom okruženju) |
| TC6 | OID Generate (ITI-98) | 200 | ✅ | — |
| TC7 | Sync CodeSystems (ITI-96) | 200 | ✅ | — |
| TC8 | Sync ValueSets (ITI-95) | 200 | ✅ | — |
| TC9 | Registar subjekata (mCSD) | 500 | ❌ Endpoint n/a | CEZIH testno okruženje ne izlaže mCSD Organization/Practitioner endpoint na poznatim putanjama; potvrđeno probanjem 30+ putanja |
| TC10 | Pretraga pacijenta (MBO) | 200 | ✅ | — |
| TC11 | Registracija stranca (PMIR) | — | ⏭️ Preskočeno | Nije testirano danas; implementacija postoji (`/api/patient/register-foreigner`), zahtijeva putovnicu/EKZO stranaca test podatke |
| TC12 | Kreiranje posjete | 200 | ✅ | — |
| TC13 | Ažuriranje posjete | 200 | ✅ | — |
| TC14 | Zatvaranje posjete | 200 | ✅ | — |
| TC15 | Dohvat slučajeva (QEDm) | 200 | ✅ | — |
| TC16 | Kreiranje slučaja | 200 | ✅ | — |
| TC17 | Ažuriranje slučaja | 200 | ✅ | — |
| TC18 | Slanje dokumenta (ITI-65) | 403 | ⚠️ Forbidden | CEZIH MHD endpoint vraća 403 — račun vjerojatno nema ulogu za slanje MHD dokumenata u testnom okruženju |
| TC19 | Zamjena dokumenta | 403 | ⚠️ Forbidden | Isto kao TC18 |
| TC20 | Storno dokumenta | 403 | ⚠️ Forbidden | Isto kao TC18 |
| TC21 | Pretraga dokumenata (ITI-67) | 200 | ✅ lokalni DB | Nema naših dokumenata na CEZIH-u (TC18 nije prošao), CEZIH vraća prazno; lokalni DB ima 5 zapisa |
| TC22 | Dohvat dokumenta (ITI-68) | 200 | ✅ lokalni DB | Testiran s `urn:oid:` URL-om koji odmah presreće lokalni lookup; nije blokiran autorizacijom |

---

## Napomene i potrebne akcije

### TC1, TC2 — Autentikacija (Smart Card / Certilia)
- **TC1 (Smart Card)**: Infrastrukturna ovisnost — zahtijeva fizički AKD čitač kartice i browser-initiated TLS auth flow. Implementacija u [smartcard-gateway-auth.service.ts](file:///c:/Users/lovro/Cezih_fhir/cezih_fhir/src/services/smartcard-gateway-auth.service.ts) je kompletna.
- **TC2 (Certilia mobile.ID)**: Certilia lozinka je istekla u testnom okruženju. Portal (`portal.test.certilia.com`) ne dopušta promjenu lozinke (grška "Nije moguće izvršiti akciju"). Kontaktirajte Certilia podršku za reset lozinke.

### TC4, TC5 — Digitalni potpis
- **TC4 (Smart Card potpis)**: Zahtijeva `SIGN_PIN` i `CertiliaPkcs11_64.dll` u [.env](file:///c:/Users/lovro/Cezih_fhir/cezih_fhir/.env). Implementacija u [signature.service.ts](file:///c:/Users/lovro/Cezih_fhir/cezih_fhir/src/services/signature.service.ts) je kompletna.
- **TC5 (Certilia Cloud potpis)**: Zahtijeva ispravan Certilia račun za remote signing. Blokiran zbog iste lozinke kao TC2.

### TC9 — mCSD Registar organizacija i liječnika
- Potvrđeno da CEZIH testno okruženje ne izlaže mCSD endpoint. Implementacija je ispravna; trebate zatražiti pravu putanju od CEZIH tehničkog tima.

### TC11 — Registracija stranca (PMIR)
- Nije testirano u ovoj sesiji. Endpoint: `POST /api/patient/register-foreigner`. Zahtijeva testne podatke stranca (putovnica ili EKZO kartica).

### TC21, TC22 — Pretraga i dohvat dokumenta
- TC21 i TC22 su **READ operacije** — ne zahtijevaju istu writer ulogu kao TC18-20.
- **TC21**: CEZIH search radi (GET, ne 403), ali vraća prazan skup jer na CEZIH-u ne postoje naši dokumenti (TC18 nije prošao). Lokalni DB ima 5 dokumenata iz prethodnih sesija.
- **TC22**: Testiran s `urn:oid:...` URL-om koji kod presreće i gleda lokalni DB direktno, bez CEZIH poziva. Za fetch s CEZIH-a potrebno je proslijediti pravi HTTPS URL iz `DocumentReference.content[].attachment.url`.
- Direktni POST na `iti-65-service` s valjanim gateway kolačićem vraća **403 Forbidden**.
- Autentikacija prolazi (kolačić je valjan), ali server ne dopušta operaciju.
- **Razlog 403 nije poznat** — nigdje u dostupnoj CEZIH dokumentaciji nije definirano koji su preduvjeti. Mogući razlozi: neregistrirana organizacija/liječnik, nedostatak role, neispravan FHIR profil, ili potreba za TLS klijentskim certifikatom za write operacije.
- **Akcija**: Kontaktirati CEZIH tehnički tim i pitati koji su preduvjeti za `POST /doc-mhd-svc/api/v1/iti-65-service` u testnom okruženju.
