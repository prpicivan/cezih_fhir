# CEZIH FHIR Middleware — Checklist za pripremu okruženja
> Verzija: 1.0 · Datum: 2026-03-03  
> Za: Drum developer — integracija s G9 rješenjem

---

## 📋 Što sve trebate pripremiti

Ovaj dokument sadrži popis svega što je potrebno nabaviti, instalirati i konfigurirati prije pokretanja middleware-a i početka certifikacije.

---

## 1. 🔑 Certilia račun (AKD)

Certilia je sustav za upravljanje digitalnim certifikatima koji kontrolira AKD (Agencija za komercijalnu djelatnost).

| Stavka | Detalji |
|--------|---------|
| **Što** | Korisnički račun na Certilia platformi |
| **Gdje** | Registracija preko [AKD portala](https://www.akd.hr) ili kontaktom s AKD-om |
| **Zašto** | Potreban za prijavu na CEZIH gateway (TC1, TC2) i za remote signing (TC5) |
| **Podaci koje dobijete** | Email, lozinka, pristup mobile.ID aplikaciji |

> [!TIP]
> Za testno okruženje, AKD izdaje **testne certifikate** — kontaktirajte ih za testni Certilia račun.

---

## 2. 🆔 OAuth2 Credentials (Client ID / Client Secret)

Za M2M (machine-to-machine) autentikaciju — TC3.

| Stavka | Detalji |
|--------|---------|
| **Što** | `client_id` i `client_secret` za OAuth2 Client Credentials flow |
| **Gdje** | Dodjeljuje CEZIH/HZZO pri registraciji aplikacije |
| **Zašto** | Potrebno za system authentication (TC3, TC6, TC7, TC8) |
| **Format** | UUID (client_id), random string (client_secret) |

**Primjer:**
```
CEZIH_CLIENT_ID=ec6256a6-4f6e-4d88-899f-e9e8492229b0
CEZIH_CLIENT_SECRET=16FBeUO9b5WJZfVb8Zw41Xgxqdy3JnSX
```

> [!CAUTION]
> **Nikada** ne commitajte ove podatke u git repozitorij. Koristite `.env` datoteku koja je u `.gitignore`.

---

## 3. 🏥 HZZO šifra zdravstvene organizacije

| Stavka | Detalji |
|--------|---------|
| **Što** | Jedinstvena šifra organizacije u HZZO sustavu |
| **Gdje** | Dodjeljuje HZZO pri ugovaranju |
| **Zašto** | Koristi se u svakom FHIR Bundle-u kao `Organization` identifikator |
| **Format** | Numerički string (npr. `999001425`) |
| **FHIR System** | `http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije` |

> [!IMPORTANT]
> HZZO šifra mora biti **registrirana u CEZIH testnom okruženju** za servise `encounter-services`, `doc-mhd-svc` i `health-issue-services`. Ako nije registrirana, TC12-14 i TC18-20 neće raditi. Kontaktirajte CEZIH tim za registraciju.

---

## 4. 👨‍⚕️ HZJZ broj zdravstvenog djelatnika

| Stavka | Detalji |
|--------|---------|
| **Što** | HZJZ identifikacijski broj svakog liječnika/zdravstvenog djelatnika |
| **Gdje** | Dodjeljuje HZJZ; može se pronaći u CEZIH certifikatu ili registru |
| **Zašto** | Koristi se kao `Practitioner` identifikator u svim FHIR porukama i potpisima |
| **Format** | Numerički string (npr. `4981825`) |
| **FHIR System** | `http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika` |

> [!WARNING]
> **Ne koristite OIB umjesto HZJZ ID-a!** CEZIH potpis (DIGSIG-1 constraint) eksplicitno zahtijeva HZJZ broj u `Bundle.signature.who` i `MessageHeader.author`. OIB neće proći validaciju.

---

## 5. 💳 AKD/Certilia pametna kartica

| Stavka | Detalji |
|--------|---------|
| **Što** | Fizička pametna kartica s digitalnim certifikatom |
| **Gdje** | Izdaje AKD (Agencija za komercijalnu djelatnost) |
| **Zašto** | Potrebna za Smart Card login (TC1) i lokalni potpis (TC4) |
| **Tip** | Gemalto IDPrime 940 (ili kompatibilna) |
| **Tokeni na kartici** | **IDEN** (Authentication) i **SIGN** (Non-repudiation) |

### Detalji o tokenima

| Token | PIN | Korištenje u middleware-u |
|-------|-----|--------------------------|
| **IDEN** | Poseban PIN (kraći) | ✅ **Koristi se za potpis** (ES256, ECDSA P-256) |
| **SIGN** | Poseban PIN (duži) | ❌ Ne koristi se (CKA_ALWAYS_AUTHENTICATE blokira headless flow) |

> [!IMPORTANT]
> Middleware koristi **Iden token** za digitalne potpise, ne Sign token! Sign token zahtijeva PIN na svakom potpisu što nije kompatibilno s Certilia middleware-om za automatski headless signing.

### Software na računalu

Na računalu gdje je middleware mora biti instalirano:
- **Certilia Middleware** (v2.40+): Instalira PKCS#11 modul
  - DLL putanja: `C:\Program Files\AKD\Certilia Middleware\pkcs11\CertiliaPkcs11_64.dll`
- **Certilia Desktop App** (opcijski): Za certifikat management

---

## 6. 🔌 Čitač kartica (USB)

| Stavka | Detalji |
|--------|---------|
| **Što** | USB Smart Card čitač |
| **Kompatibilnost** | PC/SC kompatibilan (većina modernih čitača) |
| **Preporučeni modeli** | Gemalto IDBridge CT30, HID Omnikey 3121, Cherry ST-2000 |
| **Gdje** | Nabavlja se zajedno s AKD karticom ili zasebno |

> [!NOTE]
> Čitač kartica mora biti spojen na **isto računalo** gdje se pokreće middleware (ili preusmjeren putem RDP Smart Card Redirection). Cloud hosting zahtijeva Certilia mobile.ID umjesto fizičke kartice.

---

## 7. 📱 Android mobitel za Certilia mobile.ID

| Stavka | Detalji |
|--------|---------|
| **Što** | Android mobitel s instaliranom Certilia aplikacijom |
| **Zašto** | Za Certilia mobile.ID login (TC2) i remote signing (TC5) |
| **OS** | **Samo Android!** (testna Certilia verzija nema iOS aplikaciju) |
| **Aplikacija** | "Certilia" — instalira se iz Google Play Store ili AKD portala |
| **Registracija** | Mobitel se registrira na Certilia račun (veže se uz certifikat) |

### Koraci za postavljanje mobile.ID:
1. Instalirajte Certilia app na Android mobitel
2. Registrirajte se s istim email/lozinkom kao na Certilia web portalu
3. Aktivirajte mobile.ID u aplikaciji
4. Testirajte: pri prijavi na CEZIH, mobitel će dobiti push notifikaciju

> [!TIP]
> Za certifikaciju, mobile.ID je preporučeni način jer ne zahtijeva fizički čitač kartica i radi s bilo kojeg lokacija.

---

## 8. 🌐 CEZIH testno okruženje — Mrežni pristup

| Stavka | Detalji |
|--------|---------|
| **Gateway URL** | `https://certws2.cezih.hr:8443` |
| **SSO URL** | `https://certsso2.cezih.hr` |
| **Remote Sign URL** | `https://certpubws.cezih.hr` |
| **System Token (port)** | `:9443` (za M2M autentikaciju — OID generiranje itd.) |
| **User Gateway (port)** | `:8443` (za korisničku autentikaciju — posjete, dokumenti itd.) |

### VPN / IP Whitelisting
- CEZIH testno okruženje zahtijeva **fiksnu IP adresu** koja je whitelistana
- Kontaktirajte CEZIH tim za registraciju vaše IP adrese
- Za lokalni development, koristi se **VPN tunel** do CEZIH mreže

---

## 9. ⚙️ Konfiguracija middleware-a (.env)

Kreirajte `.env` datoteku u korijenskom direktoriju middleware-a s ovim varijablama:

```env
# ═══════════════════════════════════════════
# Server Configuration
# ═══════════════════════════════════════════
PORT=3010
NODE_ENV=development
FRONTEND_URL=http://localhost:3011

# ═══════════════════════════════════════════
# CEZIH Environment
# ═══════════════════════════════════════════
CEZIH_BASE_URL=https://certws2.cezih.hr:8443
CEZIH_FHIR_URL=https://certws2.cezih.hr:8443/services-router/gateway

# OAuth2 Client Credentials (TC3 - System Authentication)
CEZIH_CLIENT_ID=<vaš_client_id>
CEZIH_CLIENT_SECRET=<vaš_client_secret>
CEZIH_TOKEN_URL=https://certsso2.cezih.hr/auth/realms/CEZIH/protocol/openid-connect/token

# OpenID Connect (TC1, TC2 - User Authentication)
CEZIH_OIDC_AUTH_URL=https://certsso2.cezih.hr/auth/realms/CEZIH/protocol/openid-connect/auth
CEZIH_OIDC_REDIRECT_URI=http://localhost:3010/auth/callback

# OID Registry (TC6)
CEZIH_OID_REGISTRY_URL=https://certws2.cezih.hr:9443/services-router/gateway/identifier-registry-services/api/v1/oid/generateOIDBatch

# ═══════════════════════════════════════════
# Organization Identity
# ═══════════════════════════════════════════
ORGANIZATION_OIB=<OIB_organizacije>
ORGANIZATION_HZZO_CODE=<HZZO_sifra>
ORGANIZATION_HZJZ_CODE=<HZJZ_broj_ustanove>
ORGANIZATION_NAME=<Naziv_organizacije>

# ═══════════════════════════════════════════
# Practitioner (liječnik)
# ═══════════════════════════════════════════
PRACTITIONER_OIB=<OIB_lijecnika>
PRACTITIONER_NAME=<Ime_Prezime>
PRACTITIONER_HZJZ_ID=<HZJZ_broj_djelatnika>

# ═══════════════════════════════════════════
# AKD Certilia Smart Card (PKCS#11)
# ═══════════════════════════════════════════
SIGN_PIN=<sign_pin_kartice>
IDEN_PIN=<iden_pin_kartice>
PKCS11_MODULE_PATH=C:\\Program Files\\AKD\\Certilia Middleware\\pkcs11\\CertiliaPkcs11_64.dll

# ═══════════════════════════════════════════
# Signing Mode
# ═══════════════════════════════════════════
# Opcije: "smartcard" (lokalni potpis) ili "certilia" (remote/mobile.ID)
SIGNING_MODE=smartcard

# Remote Signing (Certilia mobile.ID)
SIGNER_OIB=<OIB_potpisnika>
REMOTE_SIGN_URL=https://certws2.cezih.hr:8443/services-router/gateway/extsigner/api/sign
REMOTE_SIGN_SOURCE_SYSTEM=DEV

# Certilia User Credentials
USER_EMAIL=<certilia_email>
USER_PASSWORD=<certilia_lozinka>
```

---

## 10. 💻 Software zahtjevi

| Software | Verzija | Namjena |
|----------|---------|---------|
| **Node.js** | 18+ | Runtime za middleware |
| **npm** | 8+ | Package manager |
| **TypeScript** | 5+ | Compile middleware |
| **Certilia Middleware** | 2.40+ | PKCS#11 modul za smart card |
| **Chrome/Edge** | Latest | Za Smart Card browser login |
| **Playwright** | (opcionalno) | Automatizacija gateway cookie grabovita |

### Pokretanje middleware-a

```bash
# 1. Instalirajte dependencies
npm install

# 2. Kopirajte i konfigurirajte .env
cp .env.example .env
# Uredite .env s vašim podacima

# 3. Pokrenite middleware
npm run dev
# → Server sluša na http://localhost:3010
```

---

## 11. ✅ Checklist prije početka certifikacije

Provjerite da imate sve:

- [ ] **Certilia račun** — email i lozinka za Certilia platformu
- [ ] **Client ID / Secret** — OAuth2 credentials od CEZIH-a/HZZO-a
- [ ] **HZZO šifra** — šifra zdravstvene organizacije, **registrirana u CEZIH test okruženju**
- [ ] **HZJZ broj** — identifikator svakog liječnika koji će koristiti sustav
- [ ] **AKD kartica** — fizička pametna kartica s IDEN i SIGN certifikatima
- [ ] **PIN-ovi** — IDEN PIN i SIGN PIN za karticu
- [ ] **USB čitač** — PC/SC kompatibilan čitač kartica
- [ ] **Android mobitel** — s instaliranom Certilia aplikacijom i aktiviranim mobile.ID
- [ ] **Certilia Middleware** — instaliran na računalu (za PKCS#11 DLL)
- [ ] **VPN/IP** — mrežni pristup CEZIH testnom okruženju (IP whitelistan)
- [ ] **Node.js 18+** — instaliran na serveru/računalu
- [ ] **`.env` konfiguracija** — popunjena sa svim potrebnim varijablama
- [ ] **OIB organizacije** — za identifikaciju u sustavu
- [ ] **OIB liječnika** — za identifikaciju u sustavu

---

## 12. 📞 Korisni kontakti

| Kontakt | Za što |
|---------|--------|
| **CEZIH tim** | Registracija organizacije, mrežni pristup, endpoint putanje |
| **AKD** | Certilia račun, pametne kartice, mobile.ID registracija |
| **HZZO** | HZZO šifra organizacije, ugovaranje |
| **HZJZ** | HZJZ brojevi zdravstvenih djelatnika |
| **WBS (Ivan Prpić)** | Tehnička podrška za middleware, ivan.prpic@wbs.hr |

---

*Dokument generiran: 2026-03-03*
