# CEZIH Test Case Matrix

Ovaj dokument služi kao tehnički pregled svih 22 testna slučaja (Test Cases - TC) za proces certifikacije, mapiranih prema sigurnosnim zahtjevima i službenoj dokumentaciji.

## 📊 Pregled Testnih Slučajeva

### 🔐 1. Autentifikacija i Autorizacija
| TC | Naziv testnog slučaja | Sigurnost (S/U/P) | Middleware Metoda | Status |
| :--- | :--- | :---: | :--- | :---: |
| **1** | Smart Card Autentikacija | ❌/✅/❌ | `initiateSmartCard` | ⚙️ |
| **2** | Certilia mobile.ID Autentikacija | ❌/✅/❌ | `initiateCertilia` | ⚙️ |
| **3** | Sustavna Autentikacija (M2M) | ✅/❌/❌ | `getSystemToken` | ✅ |
| **4** | Potpisivanje (Smart Card) | ❌/✅/✅ | `signatureService.sign` | ⚙️ |
| **5** | Potpisivanje (Certilia Cloud) | ❌/✅/✅ | `signatureService.sign` | ⚙️ |

### 🏗️ 2. Infrastruktura i Registri
| TC | Naziv testnog slučaja | Sigurnost (S/U/P) | Middleware Metoda | Status |
| :--- | :--- | :---: | :--- | :---: |
| **6** | OID Generiranje (ITI-98) | ✅/❌/❌ | `generateSingleOid` | ✅ |
| **7** | Sync CodeSystems (ITI-96) | ✅/❌/❌ | `syncCodeSystems` | ✅ |
| **8** | Sync ValueSets (ITI-95) | ✅/❌/❌ | `getValueSets` | ✅ |
| **9** | Registar subjekata (mCSD) | ✅/❌/❌ | `searchOrganizations` | ✅ |

### 👤 3. Pacijenti i Registracija
| TC | Naziv testnog slučaja | Sigurnost (S/U/P) | Middleware Metoda | Status |
| :--- | :--- | :---: | :--- | :---: |
| **10** | Pretraga pacijenta (MBO) | ❌/✅/❌ | `searchByMbo` | ✅ |
| **11** | Registracija stranca (PMIR) | ❌/✅/✅ | `registerForeigner` | ✅ |

### 🏥 4. Posjeti i Slučajevi (Encounter & Episode)
| TC | Naziv testnog slučaja | Sigurnost (S/U/P) | Middleware Metoda | Status |
| :--- | :--- | :---: | :--- | :---: |
| **12** | Kreiranje posjete (Start) | ❌/✅/✅ | `createVisit` | ✅ |
| **13** | Ažuriranje posjete | ❌/✅/✅ | `updateVisit` | ✅ |
| **14** | Zatvaranje posjete (Close) | ❌/✅/✅ | `closeVisit` | ✅ |
| **15** | Dohvat slučajeva (QEDm) | ❌/✅/❌ | `getPatientCases` | ✅ |
| **16** | Kreiranje slučaja | ❌/✅/✅ | `createCase` | ✅ |
| **17** | Ažuriranje slučaja | ❌/✅/✅ | `updateCase` | ✅ |

### 📄 5. Klinička Dokumentacija (MHD)
| TC | Naziv testnog slučaja | Sigurnost (S/U/P) | Middleware Metoda | Status |
| :--- | :--- | :---: | :--- | :---: |
| **18** | Slanje dokumenta (ITI-65) | ❌/✅/✅ | `sendDocument` | ✅ |
| **19** | Zamjena dokumenta (Replace) | ❌/✅/✅ | `replaceDocument` | ✅ |
| **20** | Storno dokumenta (Cancel) | ❌/✅/✅ | `cancelDocument` | ✅ |
| **21** | Pretraga dokumenata (ITI-67) | ❌/✅/❌ | `searchDocuments` | ✅ |
| **22** | Dohvat dokumenta (ITI-68) | ❌/✅/❌ | `retrieveDocument` | ✅ |

---

### 💡 Legenda Sigurnosti (Sigurnost S/U/P)
- **S (System)**: System Authentication (client_credentials)
- **U (User)**: End-User Authentication (OAuth2/OIDC)
- **P (Potpis)**: Digitalni potpis (JWS) obvezan za ovaj TC.

### 🏷️ Legenda Statusa
- ✅ **Spreman**: Feature je u potpunosti implementiran i testiran u middleware-u.
- ⚙️ **Infrastruktura**: Ovisi o vanjskom provideru (SmartCard reader ili Certilia Cloud API).
- 🚧 **U razvoju**: Implementacija je u tijeku ili čeka finalnu verifikaciju.

[Poveznica na tehničku specifikaciju](file:///Users/ivanprpic/Desktop/Projekti/cezih_fhir/cezih_specification_reference.md.resolved)
