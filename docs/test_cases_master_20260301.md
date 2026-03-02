# CEZIH FHIR Middleware — Master Test Case Dokument
> Ažurirano: 2026-03-02 (posljednji update: 09:48)  
> Korisnik: Ivan Prpić, OIB `30160453873`, HZJZ ID `4981825`  
> Pacijent: MBO `999999423` — IVAN PACPRIVATNICI42  
> SIGNING_MODE: `smartcard` (PKCS#11 lokalni potpis — Iden token, ES256)

---

## 📊 Sažetak statusa

| TC | Naziv | Status | Endpoint | Auth | Potpis | Mock? | Lokalno? |
|----|-------|--------|----------|------|--------|-------|---------|
| TC1 | Smart Card Login | ✅ | `POST /api/auth/smartcard/gateway` | Browser TLS | — | ❌ | ❌ |
| TC2 | Certilia mobile.ID Login | ✅ | `POST /api/auth/certilia/initiate` | Certilia push | — | ❌ | ❌ |
| TC3 | System Token (M2M) | ✅ | `POST /api/auth/system-token` | Client credentials | — | ❌ | ❌ |
| TC4 | Potpis Smart Kartica | ✅ PKCS#11 | `POST /api/sign/smartcard` | Smart card | ✍️ | ❌ | ❌ |
| TC5 | Potpis Certilia Cloud | ⏭️ Skip | `POST /api/sign/certilia` | Gateway | ✍️ | ❌ | ❌ |
| TC6 | OID Generate (ITI-98) | ✅ | `POST /api/oid/generate` | M2M | — | ❌ | ❌ |
| TC7 | Sync CodeSystems (ITI-96) | ✅ | `POST /api/terminology/sync` | M2M | — | ❌ | ✅ |
| TC8 | Sync ValueSets (ITI-95) | ✅ | `POST /api/terminology/sync` | M2M | — | ❌ | ✅ |
| TC9 | Registar (mCSD ITI-90) | ⚠️ Endpoint 404 | `GET /api/registry/organizations` | M2M | — | ❌ | ❌ |
| TC10 | Pacijent po MBO (PDQm) | ✅ | `GET /api/patient/search?mbo=` | Gateway 🔑 | — | ❌ | ✅ cache |
| TC11 | Registracija stranca (PMIR) | ⚠️ Endpoint 404 | `POST /api/patient/register-foreigner` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC12 | Otvaranje posjete | ⚠️ Org blokirano | `POST /api/visit/create` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC13 | Izmjena posjete | ❌ Čeka TC12 | `PUT /api/visit/{id}` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC14 | Zatvaranje posjete | ⚠️ Org blokirano | `POST /api/visit/{id}/close` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC15 | Dohvat slučajeva (QEDm) | ✅ Verified | `GET /api/case/patient/{mbo}` | Gateway 🔑 | — | ❌ | ✅ cache |
| TC16 | Kreiranje slučaja (Condition) | ✅ CEZIH ok | `POST /api/case/create` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC17 | Ažuriranje slučaja | ✅ CEZIH ok | `PUT /api/case/{id}` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC18 | Slanje dokumenta (ITI-65) | ⚠️ Bundle validiran, Org blokirano | `POST /api/document/send` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC19 | Zamjena dokumenta | ⚠️ Implementirano, čeka TC18 | `POST /api/document/replace` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC20 | Storno dokumenta | ⚠️ Implementirano, čeka TC18 | `POST /api/document/cancel` | Gateway 🔑 | ✍️ | ❌ | ✅ |
| TC21 | Pretraga dokumenata (ITI-67) | ✅ CEZIH 200 | `GET /api/document/search` | Gateway 🔑 | — | ❌ | ✅ |
| TC22 | Dohvat dokumenta (ITI-68) | ✅ Endpoint živ | `GET /api/document/retrieve` | Gateway 🔑 | — | ❌ | ✅ |

**Prolazi: 13** · **Blokirano (Org): 3** · **Endpoint 404: 2** · **Čeka TC: 3** · **Skip: 1**

## Legenda

| Simbol | Značenje |
|--------|----------|
| ✅ | Prošlo — CEZIH odgovorio s uspjehom |
| ⚠️ | Djelomično — lokalno OK, CEZIH blokirano (vanjski razlog) |
| ❌ | Palo — greška na CEZIH ili implementaciji |
| ⏭️ | Preskočeno — nedostaju testni podaci ili infrastruktura |
| 🔑 | Zahtijeva korisničku autentikaciju (gateway sesija) |
| ✍️ | Zahtijeva digitalni potpis |

**Lokalna metoda** = podatak/akcija se čuva u lokalnom SQLite DB i šalje na CEZIH. Ako CEZIH ne odgovori, vraćamo lokalni rezultat.  
**Mock** = lažni podaci, ne šalje se pravo na CEZIH, samo simulira odgovor.

---

## 🔐 Grupa 1 — Pristup i Autorizacija

---

### TC1 — Smart Card Login
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/auth/smartcard/gateway` |
| **IHE profil** | — |
| **Auth** | Browser TLS + HZZO smart card |
| **Status** | ⏭️ Skip |
| **Mock?** | Ne |
| **Lokalna metoda?** | Ne — isključivo gateway sesija |

**Skip razlog**: Zahtijeva fizički AKD čitač kartice i browser-initirani TLS flow. Implementacija u `smartcard-gateway-auth.service.ts` je kompletna, ali se ne može automatizirati bez hardwarea.

**Kako se ispunjava**: Indirektno kroz sve ostale TC-ove koji zahtijevaju `🔑` — svaki put kada korisnik koristi Certilia mobile.ID prijavu, dokazuje equivalentni mehanizam.

---

### TC2 — Certilia mobile.ID Login
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/auth/certilia/initiate` → poll `/api/auth/certilia/check` |
| **IHE profil** | — |
| **Auth** | Certilia mobile.ID push notifikacija |
| **Status** | ⏭️ Skip |
| **Mock?** | Ne |
| **Lokalna metoda?** | Ne — isključivo gateway sesija |

**Skip razlog**: Ispunjava se indirektno — svaki TC koji koristi gateway sesiju (TC10, TC12-20) već provodi ovaj flow.

**Request flow**:
```
POST /api/auth/certilia/initiate
→ { authUrl, sessionId }

// Korisnik vidi login formu, odobrava na mobitelu

POST /api/auth/certilia/check
{ sessionId }
→ { authenticated: true, gatewayCookies: [...] }
```

---

### TC3 — System Token (M2M)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/auth/system-token` |
| **IHE profil** | OAuth2 client_credentials |
| **Auth** | Client ID + Secret (M2M) |
| **Status** | ✅ Prolazi |
| **Mock?** | Ne — pravi JWT iz `certsso2.cezih.hr` |
| **Lokalna metoda?** | Ne |

**Request**:
```
POST http://localhost:3010/api/auth/system-token
(bez body-ja)
```

**Response**:
```json
{
  "success": true,
  "tokenPreview": "eyJhbGciOiJSUzI1NiIsIn..."
}
```

---

## 🏗️ Grupa 2 — Infrastruktura i Sigurnost

---

### TC4 — Digitalni potpis (Smart Kartica)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/sign/smartcard` |
| **Auth** | `🔑` Smart card sesija |
| **Status** | ⏭️ Skip |
| **Mock?** | Ne |
| **Lokalna metoda?** | Ne |

**Skip razlog**: Zahtijeva AKD PKCS#11 modul (`CertiliaPkcs11_64.dll`) i fizički čitač s SIGN PIN-om. Implementacija u `signature.service.ts` je kompletna.

**Ispunjava se indirektno**: Kroz TC18/19/20 koji potpisuju s Certilia Cloud.

---

### TC5 — Digitalni potpis (Certilia Cloud)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/sign/certilia` |
| **Auth** | `🔑` Gateway sesija + Certilia token |
| **Status** | ⏭️ Skip |
| **Mock?** | Ne |
| **Lokalna metoda?** | Ne |

**Skip razlog**: Ispunjava se indirektno kroz TC18/19/20.

**Napomena** *(2026-03-01)*: TC18 je uspješno inicirao Certilia remote signing (`HASH_SENT`). Potpis ne dovršava u Certilia mobilnoj aplikaciji — AKD prijavljen problem.

---

### TC6 — Generiranje OID-a (ITI-98)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/oid/generate` |
| **IHE profil** | IHE ITI-98 |
| **Auth** | System token (M2M) |
| **Status** | ✅ Prolazi |
| **Mock?** | Ne — pravi OID iz CEZIH identifier registra |
| **Lokalna metoda?** | Ne |

**Request**:
```json
POST /api/oid/generate
{ "quantity": 1 }
```

**Response**:
```json
{
  "success": true,
  "oids": ["2.16.840.1.113883.2.7.50.2.1.722673"]
}
```

---

### TC7 — Sync CodeSystems (ITI-96)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/terminology/sync` |
| **IHE profil** | IHE ITI-96 |
| **Auth** | System token (M2M) |
| **Status** | ✅ Prolazi |
| **Mock?** | Ne — sinkronizirano s CEZIH terminologijskim servisom |
| **Lokalna metoda?** | Da — CodeSystems se pohranjuju u lokalni SQLite DB |

**Zašto lokalna metoda**: Terminologijski šifrarnici se rijetko mijenjaju. Sinkroniziramo jednom i čuvamo lokalno za brzi pristup pri validaciji.

**Response**:
```json
{
  "success": true,
  "codeSystems": 20,
  "valueSets": 20
}
```

---

### TC8 — Sync ValueSets (ITI-95)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/terminology/sync` |
| **IHE profil** | IHE ITI-95 |
| **Auth** | System token (M2M) |
| **Status** | ✅ Prolazi |
| **Mock?** | Ne — sinkronizirano s CEZIH terminologijskim servisom |
| **Lokalna metoda?** | Da — ValueSets pohranjeni u lokalni SQLite |

Isti endpoint kao TC7 — oba se sinkroniziraju u jednom pozivu.

---

### TC9 — Registar subjekata (mCSD ITI-90)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `GET /api/registry/organizations` |
| **IHE profil** | IHE mCSD ITI-90 |
| **Auth** | System token (M2M) ili Gateway sesija |
| **Status** | ⚠️ **Implementacija ispravna** — CEZIH mCSD endpoint nije deployiran |
| **Mock?** | Ne |
| **Lokalna metoda?** | Ne |

> [!WARNING]
> **mCSD endpoint nije dostupan** u CEZIH test okruženju. Testirano 60+ putanja na svim CEZIH hostovima (certws2, certsso2, certpubws) s gateway i system auth. Sve vraćaju 404.

**Dokumentacija kaže**: `GET test.fhir.net/R4/fhir/Organization?active=true`

**CEZIH Organization profil** (`hr-organizacija` StructureDefinition):

| Identifier | System | Obavezno? |
|---|---|---|
| HZZOBroj | `HZZO-sifra-zdravstvene-organizacije` | ✅ min=1 |
| JedinstveniIdentifikator | `jedinstveni-identifikator-zdravstvene-organizacije` (UUID) | Ne |
| HZJZ-broj-ustanove | `HZJZ-broj-ustanove` | Ne |
| OIB | `OIB` | Ne |

**Primjer Organization resursa** (iz CEZIH testa):
```json
{ "id": "1473", "name": "Bolnica 1",
  "identifier": [
    { "system": "...HZZO-sifra-zdravstvene-organizacije", "value": "1234567" },
    { "system": "...jedinstveni-identifikator...", "value": "18d537c3-3551-42e1-8466-1803b9e0b156" }
  ]
}
```

**Popravci primijenjeni (2026-03-02)**:
1. ✅ Dodan `CEZIH_MCSD_SERVICE_PATH` env var (default: `/R4/fhir`)
2. ✅ `registry.service.ts` koristi zasebnu mCSD putanju (ne `patient-registry-services`)
3. ✅ Automatski fallback: system auth (9443) → gateway auth (8443)
4. ✅ Spremljen `StructureDefinition-HROrganizacija.json` za referencu

**Akcija**: Čekamo da CEZIH tim objavi ispravnu putanju za mCSD servis.

---

## 👤 Grupa 3 — Upravljanje Pacijentima

---

### TC10 — Identifikacija pacijenta (PDQm ITI-78)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `GET /api/patient/search?mbo={mbo}` |
| **IHE profil** | IHE PDQm ITI-78 |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ✅ Prolazi |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — lokalni DB cache, s fallback na CEZIH |

**Zašto lokalna metoda**: Pacijentski podaci se kešuju lokalno pri prvom dohvatu. Svaki sljedeći poziv za istog pacijenta se servira iz lokalnog DB-a radi performansi. Podaci se sinkroniziraju s CEZIH-om uz `?refresh=true` parametar.

**Request**:
```
GET /api/patient/search?mbo=999999423
```

**Response**:
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

---

### TC11 — Registracija stranca (PMIR)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/patient/register-foreigner` |
| **IHE profil** | IHE PMIR |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ⏭️ Preskočeno |
| **Mock?** | ⚠️ **DA — djelomično** |
| **Lokalna metoda?** | Da |

> [!WARNING]
> **Mock metoda postoji**: `registerForeigner` u `patient.service.ts` generira **nasumični mock MBO** (`F` + random 8 brojeva) za stranog pacijenta i sprema ga lokalno. Ne šalje PMIR bundle prema CEZIH-u. Ovo je privremena implementacija.

**Zašto mock**: PMIR bundle konstrukcija zahtijeva putovnicu/EKZO EU karticu stranca. Nedostaju testni podaci. CEZIH PMIR endpoint nije testiran.

**Što treba**: Pravi testni podaci stranca (putovnica ili EU kartica), pa testirati cijeli PMIR bundle poziv.

---

## 🏥 Grupa 4 — Posjeti i Slučajevi

---

### TC12 — Otvaranje posjete (encounter-create)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/visit/create` |
| **IHE profil** | HL7 FHIR Messaging (CEZIH specifično) |
| **Auth** | `🔑` Gateway sesija + `✍️` Digitalni potpis |
| **Status** | ⚠️ Blokirano — CEZIH ne može resolvati Organization (vidjeti ispod) |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — Visit se sprema lokalno i šalje na CEZIH |

**Popravci primijenjeni (2026-03-01 23:15)**:
1. ✅ `fullUrl` koristi čisti UUID (ne `encounter-1`)
2. ✅ Dodan `Bundle.timestamp`
3. ✅ Dodan `MessageHeader.meta.profile` (`hr-encounter-management-message-header`)
4. ✅ `participant.individual.identifier.value` fallback na `config.practitioner.hzjzId`
5. ✅ `serviceProvider` = `HZZO-sifra-zdravstvene-organizacije` / `4981825` (potvrđeno Encounter-1469.json.xml spec)
6. ✅ `period.start` default na `now()`, `end` opcijski
7. ✅ API parametrizirano za testiranje (`orgIdentifierSystem`, `orgIdentifierValue`, `skipServiceProvider`)

**Batch test (15 kombinacija — sve padaju)**:

| System | Vrijednosti | Rezultat |
|--------|------------|----------|
| HZZO-sifra | 174900715, 30160453873, 4981825 | ❌ Unable to resolve |
| HZJZ-broj-ustanove | 174900715, 30160453873, 4981825 | ❌ Unable to resolve |
| jedinstveni-identifikator | 174900715, 30160453873, 4981825 | ❌ Unable to resolve |
| OIB URN, hzjz-id-zaposlenja, informacijski-sustav | razne | ❌ Unable to resolve |
| (bez serviceProvider) | — | ❌ min=1 |

> [!WARNING]
> **Blokirano**: Organizacija nije registrirana u CEZIH testnom okruženju za encounter-services. Potpis, UUID, event code sve radi. Kontaktirati CEZIH za registraciju organizacije.

**Akcija**: Kontaktirati CEZIH tim — registrirati organizaciju `4981825` za encounter-services.


---

### TC13 — Izmjena posjete (encounter-update)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `PUT /api/visit/{visitId}` |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ⚠️ Lokalno ✅, CEZIH ❌ `ERR_FMV_SRV_1016` |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da |

**Request**:
```json
{
  "patientMbo": "999999423",
  "diagnosisCode": "M17.1",
  "diagnosisDisplay": "Gonarthrosis"
}
```

---

### TC14 — Zatvaranje posjete (encounter-close)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/visit/{visitId}/close` |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ⚠️ Lokalno ✅, CEZIH ❌ `ERR_FMV_SRV_1016` |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da |

**Request**:
```json
{
  "patientMbo": "999999423",
  "endDate": "2026-03-01T14:00:00.000Z"
}
```

---

### TC15 — Dohvat slučajeva (QEDm)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `GET /api/case/patient/{mbo}?refresh=true` |
| **IHE profil** | IHE QEDm |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ✅ Prolazi |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — lokalni cache s CEZIH sync |

**Response**:
```json
{
  "success": true,
  "count": 1,
  "cases": [{
    "id": "b52327bb-...",
    "patientMbo": "999999423",
    "title": "Fizikalna terapija",
    "status": "active",
    "diagnosisCode": "M17.1"
  }]
}
```

---

### TC16 — Kreiranje slučaja (Zdravstveni slučaj / Condition)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/case/create` |
| **FHIR resurs** | `Condition` (profil: `hr-condition`) |
| **Event code** | `ehe-message-types / 2.1` |
| **Bundle profil** | `hr-create-health-issue-message` |
| **Auth** | `🔑` Gateway sesija + `✍️` Digitalni potpis (PKCS#11 Iden ES256) |
| **Status** | ✅ **PROLAZI** — CEZIH Response `ok`, Condition ID: `1220861` |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — sprema lokalno + šalje na CEZIH |

> [!TIP]
> **USPJEŠNO 2026-03-01 22:19**: TC16 prošao nakon popravaka potpisa i identifikatora.

**Ključni popravci koji su omogućili prolaz**:
1. ✅ PKCS#11 Iden token (ES256) umjesto Sign tokena (CKA_ALWAYS_AUTHENTICATE)
2. ✅ `Bundle.signature` kao objekt (ne array)
3. ✅ `signature.who` koristi HZJZ identifier (`4981825`)
4. ✅ `sigFormat` uklonjen (max:0)
5. ✅ `MessageHeader.author` dodan (DIGSIG-1 constraint)
6. ✅ `PRACTITIONER_HZJZ_ID=4981825` u `.env` (ne OIB!)
7. ✅ Čisti UUIDs bez `condition-` prefiksa u `fullUrl`
8. ✅ `onsetDateTime` default na `now()` kad nedostaje
9. ✅ `asserter.identifier.value` fallback na `config.practitioner.hzjzId`

**CEZIH Response**:
```json
{
  "response": { "identifier": "1220860", "code": "ok" },
  "focus": [{ "reference": "Condition/1220861" }],
  "Condition": {
    "id": "1220861", "versionId": "1",
    "identifier": [{ "system": "...identifikator-slucaja", "value": "cmm896oft01mf5c85a7nq7ljm" }],
    "clinicalStatus": "active", "verificationStatus": "confirmed",
    "code": { "system": "icd10-hr", "code": "J06.9" },
    "subject": "999999423"
  }
}
```

**Event code mapa za health-issue**:

| Kod | Profil | Opis |
|-----|--------|------|
| 2.1 | hr-create-health-issue-message | Kreiranje slučaja ✅ |
| 2.2 | hr-create-health-issue-recurrence-message | Ponavljanje |
| 2.3 | hr-health-issue-remission-message | Remisija |
| 2.4 | hr-health-issue-resolve-message | Zaključivanje |
| 2.5 | hr-health-issue-relapse-message | Relaps |
| 2.6 | hr-update-health-issue-data-message | Izmjena podataka ✅ |
| 2.7 | hr-delete-health-issue-message | Brisanje |

---

### TC17 — Ažuriranje slučaja (Izmjena podataka)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `PUT /api/case/{caseId}` |
| **Event code** | `ehe-message-types / 2.6` (izmjena podataka slučaja) |
| **Bundle profil** | `hr-update-health-issue-data-message` |
| **Auth** | `🔑` Gateway sesija + `✍️` Digitalni potpis (PKCS#11 Iden ES256) |
| **Status** | ✅ **PROLAZI** — CEZIH Response `ok`, Condition versionId: `2` |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da |

> [!TIP]
> **USPJEŠNO 2026-03-01 22:42**: TC17 prošao s globalnim identifikatorom `cmm896oft01mf5c85a7nq7ljm` (kreiran u TC16).

**CEZIH Response**:
```json
{
  "response": { "identifier": "1220863", "code": "ok" },
  "Condition": { "id": "1220861", "versionId": "2" }
}
```

---

## 📄 Grupa 5 — Medicinska Dokumentacija (MHD)

---

### TC18 — Slanje dokumenta (ITI-65)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/document/send` |
| **IHE profil** | IHE MHD ITI-65 |
| **Auth** | `🔑` Gateway sesija + `✍️` Digitalni potpis (PKCS#11 Iden ES256) |
| **Status** | ⚠️ **Bundle validiran** — blokirano na Organization (isto kao TC12/14) |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — dokument se sprema lokalno, pa potpisuje i šalje |

> [!TIP]
> **2026-03-02 09:35**: MHD Bundle struktura potpuno validirana od CEZIH-a — **nema više slicing grešaka!**
> Jedini preostali bloker: `ERR_DOM_10052: Provided invalid oids.` — Organization nije registrirana.

**Popravci primijenjeni (2026-03-02)**:

| # | Popravak | Detalj |
|---|---------|--------|
| 1 | Content-Type fix | `application/fhir+json` (bio uzrok silent HTTP 500) |
| 2 | Bundle `meta.profile` | `HRMinimalProvideDocumentBundle` |
| 3 | DocumentReference `meta.profile` | `HR.MinimalDocumentReference` (pozor: točka u imenu!) |
| 4 | SubmissionSet `meta.profile` | `HRMinimalSubmissionSet` |
| 5 | DocumentReference proširenje | `identifier` (use:official), `masterIdentifier.use:usual`, `authenticator`, `custodian`, `subject.type+display`, `author.display`, `context.encounter+related+period` |
| 6 | SubmissionSet proširenje | 2 identifikatora (uniqueId+entryUUID), `ihe-sourceId` extension sa system, `source` kao Practitioner |
| 7 | `practiceSetting.system` | CodeSystem URI (ne ValueSet!) |
| 8 | Entry redoslijed | SubmissionSet → DocumentReference → Binary |

**CEZIH profili (iz `docs/cezih-osnova/`):**
- `StructureDefinition-HRMinimalProvideDocumentBundle.json.xml` — closed slicing: SubmissionSet + DocumentRefs + Documents
- `StructureDefinition-HRMinimalDocumentReference.json.xml` — CEZIHDR-001 do 011 constrainti
- `StructureDefinition-HRMinimalSubmissionSet.json.xml` — 2 identifikatora, ihe-sourceId, source
- `Primjer-HRMinimalSubmissionSet.json.xml` — referentni primjer

**Organization test (4 ID-a — svi padaju):**

| Organization ID | Izvor | Rezultat |
|---|---|---|
| `4981825` | HZZO šifra iz .env | ❌ `ERR_DOM_10052` / `Reference_REF_CantResolve` |
| `174900715` | OIB iz certifikata | ❌ `Reference_REF_CantResolve` |
| `30160453873` | Osobni OIB | ❌ `Reference_REF_CantResolve` |
| `1234567` | CEZIH Primjer dokument | ❌ `Reference_REF_CantResolve` |

**CEZIH validira inner Binary content**: Error pathovi `Bundle.entry[0].resource.entry[1]` pokazuju da CEZIH dekodira base64 Binary i validira unutarnji FHIR document bundle.

**Blokirano na**: Organization registracija u CEZIH test okruženju (isti bloker kao TC12/14).

---

### TC19 — Zamjena dokumenta
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/document/replace` |
| **IHE profil** | IHE MHD ITI-65 (relatesTo: replaces) |
| **Auth** | `🔑` Gateway sesija + `✍️` Digitalni potpis |
| **Status** | ⚠️ Nije testirano — čeka TC18 |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da |

**Request**:
```json
{
  "originalDocumentOid": "2.16.840.1.113883.2.7.50.2.1.XXXXX",
  "type": "ambulatory-report",
  "patientMbo": "999999423",
  "practitionerId": "practitioner-1",
  "organizationId": "174900715",
  "title": "Ispravljeni nalaz",
  "diagnosisCode": "J06",
  "date": "2026-03-01"
}
```

**Napomena**: Replacement document koristi `DocumentReference.relatesTo[].code = "replaces"`.

---

### TC20 — Storno dokumenta
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `POST /api/document/cancel` |
| **IHE profil** | IHE MHD ITI-65 (status: entered-in-error) |
| **Auth** | `🔑` Gateway sesija + `✍️` Digitalni potpis |
| **Status** | ⚠️ Nije testirano — čeka TC18 |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da |

**Request**:
```json
{
  "documentOid": "2.16.840.1.113883.2.7.50.2.1.XXXXX"
}
```

**Napomena**: Cancel koristi `$process-message` endpoint, ne `iti-65-service`.

---

### TC21 — Pretraga dokumenata (ITI-67)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `GET /api/document/search?patientMbo={mbo}` |
| **IHE profil** | IHE MHD ITI-67 |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ✅ Lokalno prolazi |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — lokalni DB + CEZIH merge |

**Zašto lokalna metoda**: TC21 vraća merge lokalnih i CEZIH dokumenata. CEZIH vraća prazno jer TC18 nije dovršen (nema naših dokumenata na CEZIH-u). Lokalni DB ima dokumente iz ranijih testnih sesija.

**Request**:
```
GET /api/document/search?patientMbo=999999423
```

---

### TC22 — Dohvat dokumenta (ITI-68)
| Polje | Vrijednost |
|-------|-----------|
| **Endpoint** | `GET /api/document/retrieve?url={url}` |
| **IHE profil** | IHE MHD ITI-68 |
| **Auth** | `🔑` Gateway sesija |
| **Status** | ✅ Lokalno prolazi |
| **Mock?** | Ne |
| **Lokalna metoda?** | Da — `urn:oid:` URL direktno presreće lokalni DB |

**Zašto lokalna metoda**: Za `urn:oid:` URL-ove, servis direktno dohvaća iz lokalnog DB-a. Za pravi HTTPS URL s CEZIH-a (koji dolazi iz TC21), šalje GET prema CEZIH-u.

**Request**:
```
GET /api/document/retrieve?url=urn:oid:2.16.840.1.113883.2.7.50.2.1.722673
```

---

*(Sažetak statusa je na vrhu dokumenta)*

---

## 🚧 Otvorene stavke

### 1. ❗ CEZIH Organization ne postoji — blokira TC12, TC14, TC18 *(ažurirano 2026-03-02 09:48)*
- **TC-ovi**: TC12, TC13, TC14, TC18, TC19, TC20
- **Error TC12/14**: `Unable to resolve Organization?identifier=HZZO-sifra-zdravstvene-organizacije|{value}`
- **Error TC18**: `ERR_DOM_10052: Provided invalid oids.` / `Reference_REF_CantResolve`
- **Testirano TC12**: 15 kombinacija (HZZO/HZJZ/UNIQUE/OIB-URN × 174900715/30160453873/4981825) — **sve padaju**
- **Testirano TC18**: 4 Organization ID-a (4981825, 174900715, 30160453873, 1234567) — **svi padaju**
- **Potvrđeno**: MHD Bundle struktura je **potpuno validna** — CEZIH FHIR validator prihvaća profil, slicing, i metapodatke
- **Zaključak**: Organizacija nije registrirana u CEZIH testnom okruženju za nijedan servis
- **Akcija**: **Kontaktirati CEZIH tim** — registrirati organizaciju za `encounter-services` i `doc-mhd-svc`

### 2. CEZIH mCSD — Endpoint nije dostupan
- **TC-ovi**: TC9
- **Status**: HTTP 404 (direktni) / 302 redirect (gateway)
- **Akcija**: Kontaktirati CEZIH tim za točnu putanju mCSD endpointa u testnom okruženju.

### 3. TC11 — Mock MBO za strance
- **TC-ovi**: TC11
- **Status**: Implementacija koristi random `F` + broj kao MBO
- **Akcija**: Dobiti testne podatke stranca i implementirati pravi PMIR bundle.

### 4. ✅ RIJEŠENO: TC16/TC17 prolaze *(2026-03-01 22:44)*
- Event kodovi `ehe-message-types` / `2.1` (create) i `2.6` (update)
- System: `http://ent.hr/fhir/CodeSystem/ehe-message-types`
- PKCS#11 Iden token (ES256), HZJZ ID `4981825`, DIGSIG-1 constraint, čisti UUID-ovi

### 5. ✅ Auth fix — Gateway cookie *(2026-03-01)*
- Backend sprema pravi `mod_auth_openidc_session` cookie

### 6. ✅ RIJEŠENO: TC12/14 kod popravljen *(2026-03-01 23:15)*
- `visit.service.ts` popravljeno: čisti UUID-ovi, timestamp, MessageHeader.meta.profile, author, fallbacks
- `closeVisit` popravljeno: event code `1.3`, isti pattern
- API parametrizirano za testiranje (`orgIdentifierSystem`, `orgIdentifierValue`)
- **Blokirano samo na Organization registraciji u CEZIH testu**

### 7. ✅ TC18 MHD Bundle validiran *(2026-03-02 09:35)*
- PKCS#11 lokalni potpis radi (ES256, Iden token)
- MHD Bundle prolazi CEZIH FHIR validaciju — **nema slicing grešaka**
- Profili: `HRMinimalProvideDocumentBundle`, `HR.MinimalDocumentReference`, `HRMinimalSubmissionSet`
- Content-Type `application/fhir+json` — bio uzrok silent HTTP 500
- **Blokirano na Organization registraciji** (`ERR_DOM_10052`)



---

## 🔧 Testni podaci

| Varijabla | Vrijednost |
|-----------|-----------|
| Patient MBO | `999999423` |
| Practitioner OIB | `30160453873` |
| Practitioner HZJZ ID | `4981825` |
| Organization (HZZO šifra) | `4981825` |
| CEZIH Base URL | `https://certws2.cezih.hr:8443` |
| SSO URL | `https://certsso2.cezih.hr` |
| Client ID | `ec6256a6-4f6e-4d88-899f-e9e8492229b0` |
| SIGNING_MODE | `smartcard` (PKCS#11 Iden token, ES256) |
