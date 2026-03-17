# CEZIH FHIR Integracija — Certifikacijski izvještaj v2
> Datum: 2026-03-16  
> Klijent ID: `ec6256a6-4f6e-4d88-899f-e9e8492229b0`  
> Organizacija: HZZO šifra `999001425`, OIB `30160453873`  
> Testni pacijenti: MBO `999999423`, `999999118`, `999990260`  
> Software: CezihFhir Middleware v2.0 (Node.js + TypeScript)

---

## 1. Sažetak

**Svih 22 testnih slučajeva je implementirano i prolazi.**

| Kategorija | Testovi | Status |
|---|---|---|
| Autentikacija i potpis | TC1–5 | ✅ Radi |
| OID registar | TC6 | ✅ Radi |
| Terminologija | TC7, TC8 | ✅ Radi |
| mCSD registar | TC9 | ✅ Radi |
| PDQm pacijenti | TC10 | ✅ Radi |
| PMIR strani pacijenti | TC11 | ✅ Radi |
| Posjete (Encounter) | TC12, TC13, TC14 | ✅ Radi |
| QEDm upit | TC15 | ✅ Radi |
| Slučajevi (Condition) | TC16, TC17 | ✅ Radi |
| Dokumentacija (MHD) | TC18, TC19, TC20 | ✅ Radi |
| Pretraga dokumenta (ITI-67) | TC21 | ✅ Radi |
| Dohvat dokumenta (ITI-68) | TC22 | ✅ Radi |

---

## 2. Detaljan status testnih slučajeva

| TC | IHE transakcija | Opis | CEZIH endpoint | Status |
|----|-----------------|------|----------------|--------|
| TC1 | — | Autentikacija — Smart Card (PKCS#11) | Gateway SSO | ✅ |
| TC2 | — | Autentikacija — Certilia remote | Gateway SSO | ✅ |
| TC3 | — | Autentikacija — SSO callback | `certsso2.cezih.hr/auth/realms/CEZIH` | ✅ |
| TC4 | — | AKD validacija | Gateway session | ✅ |
| TC5 | — | Digitalni potpis (ES256 PKCS#11) | Lokalni potpis | ✅ |
| TC6 | ITI-98 | Generiranje OID-a | `identifier-registry-services/api/v1/oid/generateOIDBatch` | ✅ |
| TC7 | ITI-96 | CodeSystem pretraga | `terminology-services/api/v1/CodeSystem` | ✅ 142 sustava |
| TC8 | ITI-95 | ValueSet expand | `terminology-services/api/v1/ValueSet` | ✅ 56 skupova |
| TC9 | ITI-90 | mCSD registar (Organization, Practitioner, HealthcareService, Location, Endpoint, PractitionerRole) | `mcsd-services/api/v1/{resourceType}` | ✅ |
| TC10 | ITI-78 | Pretraga pacijenta (PDQm) | `patient-registry-services/api/v1/Patient` | ✅ |
| TC11 | ITI-93 | Registracija stranog pacijenta (PMIR) | `patient-registry-services/api/v1/iti93` | ✅ |
| TC12 | — | Kreiranje posjete (Encounter) | `encounter-services/api/v1/$process-message` | ✅ |
| TC13 | — | Ažuriranje posjete | `encounter-services/api/v1/$process-message` | ✅ |
| TC14 | — | Zatvaranje posjete | `encounter-services/api/v1/$process-message` | ✅ |
| TC15 | — | QEDm dohvat posjeta i slučajeva | `ihe-qedm-services/api/v1/Encounter`, `Condition` | ✅ |
| TC16 | — | Kreiranje slučaja (Condition) | `health-issue-services/api/v1/$process-message` | ✅ |
| TC17 | — | Ažuriranje slučaja | `health-issue-services/api/v1/$process-message` | ✅ |
| TC18 | ITI-65 | Slanje dokumenta (MHD) | `doc-mhd-svc/api/v1/iti-65-service` | ✅ |
| TC19 | ITI-65 | Zamjena dokumenta | `doc-mhd-svc/api/v1/iti-65-service` | ✅ |
| TC20 | ITI-65 | Storniranje dokumenta | `doc-mhd-svc/api/v1/iti-65-service` | ✅ |
| TC21 | ITI-67 | Pretraga dokumenta (DocumentReference) | `doc-mhd-svc/api/v1/DocumentReference` | ✅ |
| TC22 | ITI-68 | Dohvat punog dokumenta | `doc-mhd-svc/api/v1/iti-68-service` | ✅ |

---

## 3. CEZIH servisi — bazni URL-ovi

Svi servisi su na gatewayu: `https://certws2.cezih.hr:8443/services-router/gateway/`

| Servis | Putanja | Opis |
|--------|---------|------|
| `identifier-registry-services/api/v1/` | OID generiranje | ITI-98 |
| `terminology-services/api/v1/` | CodeSystem / ValueSet | ITI-96, ITI-95 |
| `mcsd-services/api/v1/` | Organization, Practitioner, Location... | ITI-90 |
| `patient-registry-services/api/v1/` | Patient pretraga, PMIR registracija | ITI-78, ITI-93 |
| `encounter-services/api/v1/` | Encounter lifecycle | Create/Update/Close |
| `health-issue-services/api/v1/` | Condition (slučajevi) | Create/Update |
| `ihe-qedm-services/api/v1/` | QEDm upit | Encounter/Condition dohvat |
| `doc-mhd-svc/api/v1/` | MHD dokumentacija | ITI-65, ITI-67, ITI-68 |

**System auth** (port 9443): `https://certws2.cezih.hr:9443/services-router/gateway/`  
**SSO**: `https://certsso2.cezih.hr/auth/realms/CEZIH`

---

## 4. Middleware API — svi endpointi

### 4.1. Autentikacija (`/api/auth/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| GET | `/auth/status` | — | Status gateway sesije |
| GET | `/auth/health-check` | — | Keep-alive provjera |
| GET | `/auth/diagnostics` | — | Dijagnostika sesije (uptime, boot count...) |
| GET | `/auth/gateway-token` | — | Trenutni gateway token |
| GET | `/auth/initiate` | TC3 | Inicijacija SSO login flowa |
| POST | `/auth/session` | TC3 | Spremanje gateway cookies nakon SSO |
| GET | `/auth/smartcard` | TC1 | Smart card login info |
| POST | `/auth/smartcard/gateway` | TC1 | Smart card → gateway sesija |
| POST | `/auth/smartcard/interactive` | TC1 | Interaktivni SC login |
| GET | `/auth/certilia` | TC2 | Certilia login status |
| POST | `/auth/certilia/initiate` | TC2 | Inicijacija Certilia login |
| POST | `/auth/certilia/login` | TC2 | Dovršetak Certilia login |
| GET | `/auth/certilia/check` | TC2 | Provjera Certilia sesije |
| POST | `/auth/system-token` | TC4 | System token (client_credentials) |

### 4.2. OID registar (`/api/oid/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| POST | `/oid/generate` | TC6 | Generiranje batch OID-a (ITI-98) |

### 4.3. Terminologija (`/api/terminology/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| POST | `/terminology/sync` | TC7/8 | Sinkronizacija s CEZIH-om |
| GET | `/terminology/code-systems` | TC7 | Dohvat CodeSystem-a (ITI-96) |
| GET | `/terminology/value-sets` | TC8 | Dohvat ValueSet-a (ITI-95) |
| GET | `/terminology/local-code-systems` | — | Lokalni CodeSystem cache |
| GET | `/terminology/local-value-sets` | — | Lokalni ValueSet cache |
| GET | `/terminology/local-concepts` | — | Pretraga koncepata |
| GET | `/terminology/diagnoses` | — | MKB-10 pretraga dijagnoza |

### 4.4. mCSD registar (`/api/registry/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| GET | `/registry/:resourceType` | TC9 | Pretraga (Organization, Practitioner, Location, Endpoint, PractitionerRole, HealthcareService) |
| GET | `/registry/:resourceType/:id` | TC9 | Dohvat po ID-u |
| GET | `/registry/:resourceType/_history` | TC9 | Povijest promjena |
| POST | `/registry/:resourceType` | TC9 | Kreiranje resursa |

### 4.5. Pacijenti (`/api/patient/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| GET | `/patient/search?mbo=...` | TC10 | PDQm pretraga pacijenta (ITI-78) |
| GET | `/patient/registry` | TC10 | Lokalni popis pacijenata |
| GET | `/patient/:mbo/chart` | — | Pacijentov eKarton (dokumenti + slučajevi) |
| POST | `/patient/register-foreign` | TC11 | PMIR registracija stranca (ITI-93) |

### 4.6. Posjete (`/api/visit/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| POST | `/visit/create` | TC12 | Kreiranje posjete (Encounter) |
| PUT | `/visit/:id` | TC13 | Ažuriranje posjete |
| POST | `/visit/:id/close` | TC14 | Zatvaranje posjete |
| POST | `/visit/:id/cancel` | — | Storniranje posjete |
| GET | `/visit/all` | — | Sve lokalne posjete |
| GET | `/visit/remote/:mbo` | TC15 | Dohvat posjeta s CEZIH-a (QEDm) |

### 4.7. Slučajevi (`/api/case/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| GET | `/case/patient/:mbo` | TC15 | Slučajevi pacijenta (QEDm) |
| POST | `/case/create` | TC16 | Kreiranje slučaja (Condition) |
| PUT | `/case/:id` | TC17 | Ažuriranje slučaja |
| POST | `/case/:id/action` | — | Akcije na slučaju (resolve, reactivate...) |

### 4.8. Dokumentacija (`/api/document/`)

| Metoda | Endpoint | TC | Opis |
|--------|----------|-----|------|
| POST | `/document/send-full` | TC18 | Kompletno slanje (potpis + MHD ITI-65) |
| POST | `/document/send` | TC18 | Priprema dokumenta za potpis |
| POST | `/document/send/complete` | TC18 | Dovršetak nakon udaljenog potpisa |
| POST | `/document/smartcard-sign` | TC5 | Potpis smart karticom |
| POST | `/document/certilia-sign` | TC2/5 | Pokretanje Certilia potpisa |
| GET | `/document/remote-sign/status/:tCode` | — | Status udaljenog potpisa |
| POST | `/document/sign-bundle-only` | TC5 | Potpis bez slanja |
| POST | `/document/replace` | TC19 | Zamjena dokumenta |
| POST | `/document/cancel` | TC20 | Storniranje dokumenta |
| GET | `/document/search` | — | Pretraga lokalnih dokumenata |
| GET | `/document/search-remote` | TC21 | Pretraga CEZIH dokumenta (ITI-67) |
| GET | `/document/retrieve` | TC22 | Dohvat punog dokumenta (ITI-68) |
| PUT | `/document/:oid/bundle` | — | Ručna izmjena bundlea |
| POST | `/document/mhd-raw` | — | RAW MHD slanje (bypass validacije) |

---

## 5. Ključni riješeni problemi

### 5.1. Organization referenca (`ERR_FMV_SRV_1016`)

**Problem**: CEZIH odbijao sve Encounter i MHD poruke — Organization referenca se nije mogla resolvati.

**Fix**: Ispravna HZZO šifra (`999001425` umjesto `4981825`), konfigurabilna `SOURCE_ENDPOINT_OID`, ispravan MessageHeader.sender format.

### 5.2. MHD ITI-65 "Perfect Payload" (TC18)

**Problem**: Složeni slicing zahtjevi (lista, submissionSet, document profili), Organization referenca u bundleu, potpis envelopinga.

**Fix**: Hybrid Subject validacija, Anonymous Patient unutar bundlea, dinamičko izvlačenje OID-a iz CEZIH odgovora. Potpuno implementiran MHD Bundle s digitalnim potpisom (ES256, Iden + Sign tokeni).

### 5.3. TC22 — Dohvat dokumenta (ITI-68) 

**Problem**: Tri zasebna buga:
1. URL format — koristilo `?id=urn:oid:...` umjesto `?data=base64(documentUniqueId=...&position=0)`
2. Accept header — `application/fhir+json` uzrokovao HTTP 406 za contentUrl-ove
3. Mapiranje sadržaja — `mapRemoteBundle` čitao iz praznih Composition sekcija umjesto iz FHIR resursa (Observation, CarePlan, Condition)

**Fix**: Ispravna ITI-68 URL konstrukcija, content negotiation (FHIR JSON za urn:oid:, wildcard za contentUrl), resurso-bazirano mapiranje.

### 5.4. Paginacija (TC21 — pacijent 999999423, 103+ dokumenta)

**Problem**: CEZIH vraća `next` page URL s ne-enkodiranim pipe znakovima (`|`), uzrokujući HTTP 400 na stranici 2+.

**Fix**: `fixCezihNextUrl()` re-enkodira query parametre. Graceful pagination — ako sljedeća stranica padne, vraćaju se već dohvaćeni rezultati.

### 5.5. mCSD registar (TC9)

**Problem**: Endpoint `mcsd-services` nije bio poznat. `status=active` parametar vraćao 403 za neke resurse.

**Fix**: Otkrivena ispravna putanja (`mcsd-services/api/v1/`). Implementiran ITI-90 sa strogim mapiranjem parametara za svaki resurs tip.

### 5.6. PMIR registracija stranca (TC11)

**Problem**: Endpoint vraćao 404.

**Fix**: Ispravna putanja (`patient-registry-services/api/v1/iti93`), Bundle konstruiran prema `HRRegisterPatient` profilu. Implementiran `getPatientIdentifier` helper.

### 5.7. CEZIH Visit ID (TC13/TC14)

**Problem**: Update/Close operacije zahtijevaju CEZIH-ov `identifikator-posjete`, ne lokalni UUID.

**Fix**: Automatsko izvlačenje i spremanje CEZIH visit ID-a iz odgovora. Auto-resolve pri update/close.

---

## 6. Mapiranje FHIR dokumenata s CEZIH-a

Dohvaćeni CEZIH dokumenti koriste FHIR Bundle tipa `document`. Podaci se izvlače iz resursa:

| Sekcija | FHIR resurs | Polje |
|---------|-------------|-------|
| Anamneza | Observation (code=15) | `valueString` |
| Dijagnoze | Condition | `code.coding[0].code/display` |
| Preporuka | CarePlan | `description` |
| Završetak posjeta | Observation (code=24) | `valueCodeableConcept.coding[0].display` |
| Liječnik | Practitioner | `name[0].family + given` |
| Ustanova | Organization | `name` |

Podržani tipovi dokumenata: 011 (Izvješće), 012 (Specijalistički nalaz), 013 (Otpusno pismo).

---

## 7. Arhitektura sustava

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js, port 3001)                          │
│  ┌───────────────┬──────────────┬──────────────────┐    │
│  │ Radni prostor │  eKarton     │  Registar (mCSD) │    │
│  │ liječnika     │  pacijenta   │  Terminologija   │    │
│  └───────┬───────┴──────┬───────┴──────────┬───────┘    │
└──────────┼──────────────┼──────────────────┼────────────┘
           │     REST API │                  │
┌──────────┼──────────────┼──────────────────┼────────────┐
│  Backend (Node.js + Express, port 3010)                  │
│  ┌───────┴──────────────┴──────────────────┴───────┐    │
│  │  API Routes (api.routes.ts, certification.routes)│    │
│  ├─────────────────────────────────────────────────┤    │
│  │  Services                                        │    │
│  │  ├─ AuthService          (gateway, SSO, SC)      │    │
│  │  ├─ ClinicalDocumentService (MHD, ITI-65/67/68) │    │
│  │  ├─ VisitService         (Encounter lifecycle)   │    │
│  │  ├─ CaseService          (Condition lifecycle)   │    │
│  │  ├─ PatientService       (PDQm, PMIR)            │    │
│  │  ├─ RegistryService      (mCSD ITI-90)           │    │
│  │  ├─ TerminologyService   (ITI-95/96)             │    │
│  │  ├─ OidService           (ITI-98)                │    │
│  │  ├─ Pkcs11Service        (Smart Card, Sign/Iden) │    │
│  │  └─ RemoteSignService    (Certilia)              │    │
│  ├─────────────────────────────────────────────────┤    │
│  │  SQLite DB (cezih.db)                            │    │
│  │  ├─ patients, visits, cases, documents           │    │
│  │  ├─ audit_log, terminology_cache                 │    │
│  │  └─ auth_sessions                                │    │
│  └─────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (mTLS)
┌────────────────────────┴────────────────────────────────┐
│  CEZIH Gateway                                          │
│  certws2.cezih.hr:8443 (user) / :9443 (system)         │
│  certsso2.cezih.hr (SSO / Keycloak)                     │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Potpis i sigurnost

- **PKCS#11** — Certilia Gen2 pametna kartica
  - **Iden Token** — TC12 (kreiranje posjete), TC16 (slučaj), identifikacija
  - **Sign Token** — TC18 (potpis dokumenta), ES256 algoritam
- **Certilia remote potpis** — mobilna aplikacija, polling za status
- **Gateway sesija** — mod_auth_openidc, automatski keep-alive (240s interval)
- **System token** — OAuth2 client_credentials za system-auth endpointe
- **Audit log** — svaka FHIR transakcija se trajno bilježi (request + response payload)

---

## 9. Konfiguracija (.env)

| Varijabla | Opis |
|-----------|------|
| `CEZIH_GATEWAY_BASE` | `https://certws2.cezih.hr:8443/services-router/gateway/` |
| `CEZIH_SYSTEM_BASE` | `https://certws2.cezih.hr:9443/services-router/gateway/` |
| `SSO_BASE` | `https://certsso2.cezih.hr/auth/realms/CEZIH` |
| `CLIENT_ID` | `ec6256a6-4f6e-4d88-899f-e9e8492229b0` |
| `CLIENT_SECRET` | (tajno) |
| `ORGANIZATION_HZZO` | `999001425` |
| `ORGANIZATION_OIB` | `30160453873` |
| `SOURCE_ENDPOINT_OID` | `2.16.840.1.113883.2.24.30.38.1` |
| `PKCS11_LIB_PATH` | Putanja do PKCS#11 biblioteke |
| `SIGN_PIN` | PIN za Sign token |
| `IDEN_PIN` | PIN za Iden token |
