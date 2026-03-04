# Digitalni potpis — Zahtjevi po test case-ovima (TC11–TC20)

> **Status**: Dokumentacija za buduću implementaciju  
> **Datum**: 03.03.2026.  
> **Izvor**: CEZIH Simplifier specifikacija

---

## Sažetak

CEZIH specifikacija zahtijeva **digitalni potpis svih FHIR poruka** za usluge:
- Registracija stranaca (TC11)
- Upravljanje posjetama (TC12–14)
- Upravljanje slučajevima (TC15–17)
- Upravljanje dokumentima (TC18–20)

Potpis se mora obaviti **prije slanja** na CEZIH, a korisnik mora vidjeti **popup za odabir metode potpisa** (Certilia mobile.id ili Pametna kartica).

> [!IMPORTANT]
> Prototip popup-a za potpis je već izrađen: [`signature-selection-prototype.html`](file:///c:/Users/lovro/Cezih_fhir/cezih_fhir/scripts/signature-selection-prototype.html)

---

## Trenutno stanje implementacije

| TC | Naziv | Potpis u backendu? | Popup na frontendu? |
|---|---|:---:|:---:|
| TC11 | Registracija stranca (PMIR ITI-93) | ❌ | ❌ |
| TC12 | Otvaranje posjete | ✅ `visit.service.ts` | ❌ |
| TC13 | Ažuriranje posjete | ✅ `visit.service.ts` | ❌ |
| TC14 | Zatvaranje posjete | ✅ `visit.service.ts` | ❌ |
| TC15 | Dohvat slučajeva (QEDm) | ❌ | ❌ |
| TC16 | Kreiranje slučaja | ❌ | ❌ |
| TC17 | Ažuriranje slučaja | ❌ | ❌ |
| TC18 | Slanje dokumenta (ITI-65) | ❌ | ❌ |
| TC19 | Zamjena dokumenta | ❌ | ❌ |
| TC20 | Storno dokumenta | ❌ | ❌ |

---

## Frontend — Buttoni koji trebaju potpis popup

Svaki button koji pokreće akciju povezanu s TC11–TC20 mora **prije API poziva** prikazati popup za odabir metode potpisa.

### 1. Stranica za novi posjet (`visit/new/page.tsx`)

| Akcija | API poziv | TC | Linija |
|---|---|---|---|
| Otvori posjet | `POST /api/visit/create` | TC12 | L355 |
| Pošalji nalaz | `POST /api/document/send` | TC18 | L398 |
| Završi nalaz (complete) | `POST /api/document/send/complete` | TC18 | L478 |
| Zatvori posjet | `POST /api/visit/:id/close` | TC14 | L570 |
| Dohvati slučajeve | `GET /api/case/patient/:mbo` | TC15 | L303 |

### 2. Profil pacijenta (`patients/[mbo]/page.tsx`)

| Akcija | API poziv | TC | Linija |
|---|---|---|---|
| Ažuriraj slučaj | `PUT /api/case/:id` | TC17 | L92 |
| Storno dokumenta | `POST /api/document/cancel` | TC20 | L110 |

### 3. Modal za slučajeve (`patients/[mbo]/CaseModal.tsx`)

| Akcija | API poziv | TC | Linija |
|---|---|---|---|
| Ažuriraj slučaj | `PUT /api/case/:id` | TC17 | L103 |
| Kreiraj slučaj | `POST /api/case/create` | TC16 | L116 |

### 4. Modal za izmjenu dokumenta (`patients/[mbo]/ChangeDocumentModal.tsx`)

| Akcija | API poziv | TC | Linija |
|---|---|---|---|
| Zamijeni dokument | `POST /api/document/replace` | TC19 | L104 |

### 5. Stranica za dokumente (`documents/page.tsx`)

| Akcija | API poziv | TC | Linija |
|---|---|---|---|
| Storno dokumenta | `POST /api/document/cancel` | TC20 | L85 |
| Zamijeni dokument | `POST /api/document/replace` | TC19 | L118 |

### 6. Registracija stranca (`patients/register-foreigner/page.tsx`)

| Akcija | API poziv | TC | Linija |
|---|---|---|---|
| Registriraj stranca | `POST /api/patient/foreigner/register` | TC11 | L34 |

### 7. Certifikacijska stranica (`certification/page.tsx`)

Svi TC11–TC20 buttoni na certifikacijskoj stranici pozivaju odgovarajuće endpointe (L77–L98). Ovi isto trebaju potpis popup.

---

## Backend — Servisi kojima nedostaje potpis

### `patient.service.ts` — TC11
Dodati `signatureService.signBundle()` u `registerForeigner()` prije slanja na CEZIH ITI-93 endpoint.

### `case.service.ts` — TC15, TC16, TC17
Dodati `signatureService.signBundle()` u sve metode:
- `getPatientCases()` (TC15) — query sa potpisom
- `createCase()` (TC16) — potpisati FHIR Message bundle
- `updateCase()` (TC17) — potpisati FHIR Message bundle

### `clinical-document.service.ts` — TC18, TC19, TC20
Dodati potpis u `submitToCezih()` metodu koja je zajednička za:
- `sendDocument()` (TC18)
- `replaceDocument()` (TC19)
- `cancelDocument()` (TC20)

---

## Implementacijski plan (budući)

1. **Kreirati `SignaturePopup` React komponentu** — prema prototipu `signature-selection-prototype.html`
2. **Integrirati popup** u svaki od gore navedenih frontend buttona
3. **Flow**: Button klik → Popup (Certilia / Pametna kartica) → Potpis → API poziv
4. **Backend**: Dodati `signatureService.signBundle()` u servise koji ga nemaju
5. **Testiranje**: Provjeriti da svi TC11–TC20 šalju potpisane FHIR poruke

---

## Specifikacija — izvor

- **Registracija stranaca**: [Simplifier — Registracija stranaca](https://simplifier.net/guide/cezih-osnova/Po%C4%8Detna/Zajedni%C4%8Dki-slu%C4%8Dajevi-kori%C5%A1tenja/Registracija-stranaca?version=1.0)
- **Upravljanje slučajevima**: [Simplifier — Upravljanje slučajevima](https://simplifier.net/guide/upravljanje-slucajevima/Po%C4%8Detna/Upravljanje-slu%C4%8Dajevima?version=1.0.0)
