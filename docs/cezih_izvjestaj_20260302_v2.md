# CEZIH FHIR Integracija — Izvještaj o blokiranim testnim slučajevima
> Datum: 2026-03-02 (ažurirano)  
> Klijent ID: `ec6256a6-4f6e-4d88-899f-e9e8492229b0`  
> Organizacija: HZZO šifra `4981825`, OIB `30160453873`  
> Testni pacijent: MBO `999999423`

---

## 1. Sažetak

Od 22 testna slučaja, **13 prolazi**, a **9 je blokirano** — svi blokirani ovise o jednom zajedničkom problemu: **Organization referenca se ne može resolvati** u CEZIH encounter i document servisima.

Ovaj izvještaj dokumentira detaljno testiranje provedeno 2. ožujka 2026. s ciljem identifikacije uzroka i pružanja dokaza CEZIH timu.

---

## 2. Što radi ✅

| TC | Opis | Status |
|----|------|--------|
| TC1–4 | Autentikacija (Smart Card, Certilia, SSO, AKD) | ✅ |
| TC5 | Digitalni potpis (PKCS#11 ES384) | ✅ |
| TC6 | OID generiranje (ITI-98) | ✅ |
| TC7/8 | Terminologija (ITI-96, ITI-95) | ✅ 142 CodeSystem, 56 ValueSet |
| TC10 | Pretraga pacijenta (PDQm ITI-78) | ✅ |
| TC15 | QEDm dohvat Encounter/Condition | ✅ |
| TC16/17 | Slučaj (Condition) create/update | ✅ |
| TC21 | DocumentReference pretraga (ITI-67) | ✅ |

---

## 3. Blokirani test slučajevi ❌

### 3.1. TC12 — Kreiranje posjete (Encounter)

**Greška:** `Unable to resolve resource with reference 'Organization?identifier=http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije|4981825'`

**Endpoint:** `POST encounter-services/api/v1/$process-message`

**Što je testirano:**

Testirali smo **sve 3 šifre koje ste nam dostavili** × **6 različitih identifier sistema** = 18+ kombinacija, sve sa potpisanim bundleom i validnim pacijentom (`999999423`):

| Broj | HZZO-šifra | HZJZ-br-ustanove | OIB | HZJZ-djelatnik | Jedin. ID | Info-sustav |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| `30160453873` | ❌ | ❌ | ❌ | — | — | — |
| `4981825` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `174900715` | ❌ | ❌ | ❌ | — | — | — |

Sve kombinacije vraćaju: `Reference_REF_CantResolve`

**Potvrda ispravnosti koda:**  
Profil `hr-encounter` (dohvaćen s `/fhir/StructureDefinition`) eksplicitno navodi:
> *"Za referenciranje zdravstvene organizacije koristi se HZZO šifra zdravstvene organizacije."*  
> `identifier.system fixedUri = http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije`

Dakle naš identifier system je ispravan — problem je što **nijedan od 3 broja nije resolvabilan** u encounter-services.

**Dodatni nalaz:** Bez `serviceProvider` polja, CEZIH vraća:
> `Bundle.entry:Encounter.resource.serviceProvider: minimum required = 1, but only found 0`

To potvrđuje da je `serviceProvider` obavezan i ne može se preskočiti.

### 3.2. TC13/14 — Update/Close posjete

Blokirani jer ovise o uspješnom TC12.

### 3.3. TC18 — Slanje dokumenta (ITI-65)

Ista `Organization CantResolve` greška u `doc-mhd-svc/iti-65-service`.

### 3.4. TC9 — mCSD (Organization/Practitioner pretraga)

**Problem:** Endpoint za pretragu organizacija vraća **404** na svim putanjama.

Testirano 60+ URL varijanti uključujući:
- `patient-registry-services/api/v1/Organization`
- `identifier-registry-services/api/v1/Organization`  
- `fhir/Organization`
- sve na portovima 8443 i 9443

**Pitanje:** Na kojoj putanji je dostupan mCSD servis?

### 3.5. TC11 — PMIR registracija stranca (ITI-93)

**Problem:** `POST patient-registry-services/api/v1/iti93` vraća **404**.

Testirano 16+ putanja uključujući: `/iti93`, `/$process-message`, `/pmir`, `/register`, `/Patient` (POST), `/Bundle` — sve 404.

Napomena: GET na `/Patient` radi (ITI-78), ali POST na isti path vraća 405.

**Profili postoje:** `HRRegisterPatient` i `hr-PMIR-bundle` su dohvatljivi iz StructureDefinition registra — znači da je specifikacija definirana ali servis nije deployiran.

---

## 4. Konkretan zahtjev za CEZIH tim

### 4.1. Organization (KRITIČNO — blokira TC12, TC13, TC14, TC18)

**Molimo odgovorite na jedno od sljedećeg:**

1. **Koji Organization identifier trebamo koristiti?** Testirali smo `30160453873`, `4981825` i `174900715` sa HZZO-šifra, HZJZ-broj-ustanove i OIB sistemima — nijedan ne prolazi.

2. **Je li naša organizacija registrirana u encounter-services i doc-mhd-svc?** Profil `hr-encounter` kaže da se koristi HZZO šifra — naša je `4981825`. Možete li potvrditi da ta šifra postoji u registru encounter servisa?

3. **Postoji li endpoint za dohvat Organization resursa** (mCSD ITI-90 ili direktni FHIR `/Organization`) gdje bismo mogli provjeriti koje organizacije su registrirane?

### 4.2. PMIR (TC11)

Je li `patient-registry-services` ITI-93 endpoint aktivan? Na kojoj putanji?

### 4.3. mCSD (TC9)

Na kojoj putanji je dostupan Organization/Practitioner pretraga (ITI-90)?

---

## 5. Naš sustav — tehnički podaci

- **Software:** CezihFhir v1.0.0 (Node.js + TypeScript)
- **Potpis:** PKCS#11 smart card (ES384, Iden Token) + Certilia remote signing  
- **Autentikacija:** Gateway Session (mod_auth_openidc) + System Token (client_credentials)
- **Gateway:** `certws2.cezih.hr:8443` (user), `:9443` (system)
- **SSO:** `certsso2.cezih.hr/auth/realms/CEZIH`
- **StructureDefinition:** Dohvaćena sva 80+ profila — koristimo ih za validaciju bundleova
