# CEZIH FHIR Integracija — Izvještaj o statusu testnih slučajeva
> Datum: 2026-03-04  
> Klijent ID: `ec6256a6-4f6e-4d88-899f-e9e8492229b0`  
> Organizacija: HZZO šifra `999001425`, OIB `30160453873`  
> Testni pacijent: MBO `999999423`

---

## 1. Sažetak

Od 22 testna slučaja, **16 prolazi**, a **6 je blokirano** zbog nedostupnih endpointova u testnom okruženju.

Ključni napredak u odnosu na izvještaj od 02.03.2026.:
- ✅ **TC12, TC13, TC14** — Encounter (posjeta) create/update/close sada radi
- 🔧 Popravljen `source.endpoint` OID format — CEZIH sada prihvaća poruke
- 🔧 Automatsko spremanje i korištenje CEZIH `identifikator-posjete` za TC13/TC14

---

## 2. Što radi ✅

| TC | Opis | Status | Napomena |
|----|------|--------|----------|
| TC1–4 | Autentikacija (Smart Card, Certilia, SSO, AKD) | ✅ | |
| TC5 | Digitalni potpis (PKCS#11 ES384) | ✅ | |
| TC6 | OID generiranje (ITI-98) | ✅ | |
| TC7/8 | Terminologija (ITI-96, ITI-95) | ✅ | 142 CodeSystem, 56 ValueSet |
| TC10 | Pretraga pacijenta (PDQm ITI-78) | ✅ | |
| TC12 | Kreiranje posjete (Encounter) | ✅ | **NOVO** — prethodno blokirano |
| TC13 | Ažuriranje posjete | ✅ | **NOVO** — prethodno blokirano |
| TC14 | Zatvaranje posjete | ✅ | **NOVO** — prethodno blokirano |
| TC15 | QEDm dohvat Encounter/Condition | ✅ | |
| TC16/17 | Slučaj (Condition) create/update | ✅ | |
| TC21 | DocumentReference pretraga (ITI-67) | ✅ | |
| TC22 | DocumentReference dohvat (ITI-68) | ✅ | |

---

## 3. Riješeni problemi (od 02.03.)

### 3.1. TC12 — OID validacija (`OIDs must be valid`)

**Problem:** CEZIH je odbijao poruke s greškom `OIDs must be valid (999001425)`.

**Uzrok:** `MessageHeader.source.endpoint` koristio je `urn:oid:999001425` — HZZO šifra nije validan OID (mora biti dotted-decimal format poput `1.2.3.4.5.6`).

**Fix:** Dodan konfigurabilan `SOURCE_ENDPOINT_OID` parametar u `.env`. Prema CEZIH primjerima i specifikaciji (`StructureDefinition-hr-message-header`), ovaj identifikator se dodjeljuje sustavu prilikom registracije u CEZIH-u.

Popravljeno u 6 mjesta: `visit.service.ts` (3×), `case.service.ts` (2×), `clinical-document.service.ts` (1×).

### 3.2. TC13/TC14 — CEZIH visit ID

**Problem:** TC13 (update) i TC14 (close) vraćali `Not allowed to perform requested transition with current roles.`

**Uzrok:** Za update/close operacije, CEZIH zahtijeva **svoj dodijeljeni `identifikator-posjete`**, a ne naš lokalni UUID.

**Fix:**
- `createVisit` sada iz CEZIH odgovora izvlači `identifikator-posjete` i sprema ga u novu `cezihVisitId` kolonu u bazi
- `updateVisit` i `closeVisit` automatski resolvaju CEZIH visit ID iz baze

### 3.3. TC13 — Nedostajući `participant` i `sender`

**Problem:** `participant: minimum required = 1, but only found 0`

**Fix:** Dodano obavezno `participant` polje (Practitioner) u Encounter resurs za update i close, te `sender` u MessageHeader za update.

### 3.4. Audit log — ENCOUNTER_UPDATE bez pacijenta

**Problem:** ENCOUNTER_UPDATE audit zapis prikazivao "Sustavna akcija" umjesto imena pacijenta.

**Fix:** `updateVisit` sada resolvira `patientMbo` iz lokalne baze ako nije proslijeđen u requestu.

---

## 4. Blokirani test slučajevi ❌

### 4.1. TC9 — mCSD (Organization/Practitioner pretraga)

**Status:** Endpoint vraća **404** na svim testiranim putanjama (60+ varijanti).

**Pitanje za CEZIH:** Na kojoj putanji je dostupan mCSD servis (ITI-90)?

### 4.2. TC11 — PMIR registracija stranca (ITI-93)

**Status:** `POST patient-registry-services/api/v1/iti93` vraća **404**.

Profili `HRRegisterPatient` i `hr-PMIR-bundle` postoje u StructureDefinition registru — specifikacija je definirana, ali servis nije deployiran.

**Pitanje za CEZIH:** Je li ITI-93 endpoint aktivan? Na kojoj putanji?

### 4.3. TC18 — Slanje dokumenta (ITI-65)

**Status:** Blokirano — MHD slicing error vezan uz Organization referencu u `doc-mhd-svc`.

> Napomena: S obzirom da su TC12–14 sada riješeni (Organization identifier prihvaćen za Encounter), moguće je da je i ovaj problem riješiv s istim fixom. Potrebno dodatno testiranje.

### 4.4. TC19/TC20 — Zamjena/Storniranje dokumenta

**Status:** Ovisi o uspješnom TC18.

---

## 5. Tehničke izmjene (commit `ee07c4f`)

| Datoteka | Promjena |
|----------|----------|
| `.env` | Dodan `SOURCE_ENDPOINT_OID=1.2.3.4.5.6` |
| `config/index.ts` | Dodan `sourceEndpointOid` parametar |
| `db/index.ts` | Migracija: `cezihVisitId` kolona u `visits` tablici |
| `visit.service.ts` | OID fix (3×), CEZIH ID save/resolve, sender/participant dodani |
| `case.service.ts` | OID fix (2×) |
| `clinical-document.service.ts` | OID fix (1×) |
| Dashboard stranice | Alert → Toast notifikacije |

---

## 6. Naš sustav — tehnički podaci

- **Software:** CezihFhir v1.0.0 (Node.js + TypeScript)
- **Potpis:** PKCS#11 smart card (ES384, Iden Token) + Certilia remote signing  
- **Autentikacija:** Gateway Session (mod_auth_openidc) + System Token (client_credentials)
- **Gateway:** `certws2.cezih.hr:8443` (user), `:9443` (system)
- **SSO:** `certsso2.cezih.hr/auth/realms/CEZIH`
- **StructureDefinition:** Dohvaćena sva 80+ profila — koristimo ih za validaciju bundleova
- **Source Endpoint OID:** `1.2.3.4.5.6` (placeholder — zamijeniti pravim nakon registracije)
