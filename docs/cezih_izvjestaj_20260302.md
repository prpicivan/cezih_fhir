# CEZIH FHIR Integracija — Izvještaj za CEZIH tim
> Datum: 2026-03-02  
> Klijent ID: `ec6256a6-4f6e-4d88-899f-e9e8492229b0`  
> Organizacija: HZZO šifra `4981825`

---

## 1. Status integracije

**13 od 22 test slučaja uspješno prolaze.**

### ✅ Funkcionalni endpointi (13 TC-ova):

| TC | Transakcija | Endpoint | Status |
|----|------------|----------|--------|
| TC1-4 | Autentikacija + potpis | Gateway, Certilia, PKCS#11 | ✅ |
| TC6 | OID ITI-98 | `identifier-registry-services/.../oid/generateOIDBatch` | ✅ |
| TC7/8 | ITI-96/95 | `terminology-services/.../CodeSystem`, `ValueSet` | ✅ |
| TC10 | PDQm ITI-78 | `patient-registry-services/.../Patient` | ✅ |
| TC15 | QEDm | `ihe-qedm-services/.../Encounter`, `Condition` | ✅ |
| TC16/17 | Slučaj Condition | `health-issue-services/.../$process-message` | ✅ |
| TC21 | ITI-67 DocumentRef | `doc-mhd-svc/.../DocumentReference` | ✅ 200 |
| TC22 | ITI-68 Retrieve | `doc-mhd-svc/.../iti-68-service` | ✅ Endpoint živ |

---

## 2. Blokirani endpointi — pitanja

### 2.1. TC9 — mCSD ITI-90 (Organization / Practitioner)

**Problem:** Pretraga organizacija i djelatnika vraća **404** na svim putanjama.

Testirali smo 60+ URL kombinacija:
- `certws2.cezih.hr:8443/services-router/gateway/*/Organization`
- `certws2.cezih.hr:9443/...`
- `test.fhir.net/R4/fhir/Organization` (iz dokumentacije)

**Pitanje:** Na kojoj putanji je dostupan mCSD servis za Organization/Practitioner/HealthcareService u test okruženju?

### 2.2. TC11 — PMIR ITI-93 (Registracija stranca)

**Problem:** `POST patient-registry-services/api/v1/iti93` vraća **404**.

Bundle je potpuno implementiran prema `HRRegisterPatient` profilu sa Simplifier.net.

**Pitanje:** Je li PMIR ITI-93 endpoint aktivan u test okruženju?

### 2.3. TC12/14/18 — Organization referenca

**Problem:** `encounter-services/$process-message` vraća `ERR_FMV_SRV_1016`, a `doc-mhd-svc/iti-65-service` vraća `Reference_REF_CantResolve` za Organization.

Koristimo HZZO šifru `4981825` kao Organization identifier u `sender` polju.

**Pitanje:** Je li naša organizacija registrirana u CEZIH test sustavu? Treba li nam neki drugi identifikator?

---

## 3. Autorizacija

Naš OAuth2 token sadrži:
```
scope: "email profile"
roles: ["offline_access", "uma_authorization", "default-roles-cezih"]
user_type: "system"
```

**Pitanje:** Trebaju li nam dodatne role/scope za pristup svim servisima (npr. PMIR, mCSD)?

---

## 4. Naš sustav — tehnički podaci

- **Software:** CezihFhir v1.0.0 (Node.js + TypeScript)
- **Potpis:** PKCS#11 (Iden Token, ES256) ili Certilia remote signing
- **Gateway:** `certws2.cezih.hr:8443` (user auth), `:9443` (system auth)
- **SSO:** `certsso2.cezih.hr/auth/realms/CEZIH`
