# CEZIH FHIR Bridge – Master Design Document (MDD)
**Verzija:** 2.0 (Go-To-Market Edition)
**Datum:** Ožujak 2026.
**Tehnologija:** Node.js, TypeScript, Express, PKCS#11, FHIR HL7 STU3

---

## 1. SAŽETAK PROIZVODA I VRIJEDNOST (Value Proposition)
**CEZIH FHIR Bridge** je B2B *middleware* (posrednik) namijenjen proizvođačima zdravstvenog softvera (G9 developerima). On preuzima kompleksnost IHE MHD profila, XML C14N kanonizacije, PKI infrastrukture i CEZIH-ovih strogih pravila validacije.
* **G9 aplikacija** šalje jednostavne JSON (ili XML/HL7) zahtjeve.
* **Middleware** orkestrira "Stroj stanja" (State Machine), generira FHIR Bundle, komunicira s pametnim karticama (AKD) ili Certiliom, te šalje kriptirane podatke na CEZIH.
* **Rezultat:** Višemjesečna integracija svodi se na nekoliko dana implementacije jednostavnog REST API-ja i UI Widgeta.

---

## 2. ARHITEKTURA I MODELI ISPORUKE (Deployment)

Proizvod podržava dva potpuno različita modela rada, ovisno o potrebama G9 klijenta:

### Model A: "Localhost Agent" (Podrška za Pametne kartice)
Dizajniran za klijente čiji liječnici koriste fizičke čitače i AKD pametne kartice.
* **Arhitektura:** Aplikacija se kompilira u samostalnu izvršnu datoteku (`CezihBridge.exe`) pomoću alata `pkg`.
* **Instalacija:** Instalira se na računalo svakog liječnika kao pozadinski Windows Servis (putem NSSM alata). Sluša na `http://127.0.0.1:3010`.
* **Prednost:** Prevladava sigurnosna ograničenja web preglednika (browsera) koji ne mogu pristupati lokalnim USB portovima. G9 Cloud/Web aplikacija samo okine REST poziv prema `localhostu`, a Agent odradi čitanje kartice preko `pkcs11.service.ts`.

### Model B: "SaaS Cloud" (Isključivo Certilia mobile.ID)
Dizajniran za moderne web aplikacije koje ne žele instalacije na lokaciji.
* **Arhitektura:** Middleware se vrti na vašem zaštićenom Cloud serveru.
* **Mreža (Klijent -> Cloud):** G9 aplikacije šalju HTTPS JSON zahtjeve na vaš centralni API (mTLS / API ključevi).
* **Mreža (Cloud -> CEZIH):** Postavlja se jedan centralni Site-to-Site IPsec VPN tunel prema Ericsson NT/CEZIH Gatewayu.
* **Multi-Tenant PKI:** Vaš server u sigurnom sefu čuva sistemske `.p12` certifikate svih poliklinika. Prilikom poziva, G9 šalje OIB ustanove, a Middleware dinamički učitava odgovarajući certifikat za omotnicu, dok liječnik potpisuje nalaz preko Certilia Push notifikacije na mobitelu.

---

## 3. SIGURNOST, IP ZAŠTITA I "STATELESS" DIZAJN

### 3.1. "Protočni bojler" (Stateless arhitektura)
Kako bi se uklonila GDPR odgovornost i rizik od curenja podataka, produkcijski Middleware **nema bazu podataka**.
* Svi podaci o pacijentima, slučajevima i audit logovima prosljeđuju se G9 aplikaciji koja ih je dužna spremiti.
* Tajne (lozinke, `CLIENT_SECRET`, OIB) ne spremaju se u `.env` datotekama na disku. G9 ih šalje "u letu" kroz HTTP Headere (`X-Cezih-Client-Secret`).

### 3.2. Zaštita koda (Reverse Engineering prevencija)
Kompilacija u `.exe` preko `pkg` alata nije dovoljna zaštita intelektualnog vlasništva.
* **Razina 1:** Obfuscation (zamućivanje koda) pomoću `javascript-obfuscator` u build skripti.
* **Razina 2:** Za napredniju zaštitu, kompilacija u V8 Bytecode (`bytenode`).

---

## 4. DISTRIBUCIJA, LICENCIRANJE I AUTO-UPDATE (Za lokalne agente)

* **Licenciranje:** Koristi se vanjski API servis (npr. Keygen.sh). Middleware provjerava licencu pri pokretanju i periodički pinga centralni server. Implementirana je "Trial" logika (vremenska ili ograničen broj transakcija).
* **Auto-Update Mehanizam:** Windows zaključava aktivne `.exe` datoteke. Zato Middleware:
  1. Skida novu verziju kao `CezihBridge_NEW.exe.tmp`.
  2. Generira i pokreće `update.bat`.
  3. Ubija vlastiti proces.
  4. Skripta preimenuje `.tmp` u `.exe`, ponovno pali servis i briše sebe.

---

## 5. API UGOVOR (Developer Portal / Black Box za G9)

Ovo su rute koje G9 developer koristi. Sva IHE MHD i HL7 kompleksnost je skrivena.

### 5.1. Pacijenti i Registri
* **Dohvat pacijenata (TC 10 - PDQm):** `GET /api/patient/search?mbo=...` (Vraća demografiju i status osiguranja).
* **Registracija stranaca (TC 11 - PMIR):** `POST /api/patient/register-foreign` (Vraća privremeni `cezihId` za turiste bez MBO-a).
* **mCSD Registar (TC 9):** `GET /api/registry/Organization` (ili `Practitioner`). Za provjeru HZZO šifri i OIB-a liječnika na nacionalnoj razini.
* **Terminologija (TC 7, 8):** `GET /api/terminology/diagnoses` (MKB-10 autocomplete) i CodeSystem/ValueSet pretrage.
* **OID Registar (TC 6):** `POST /api/oid/generate` (ITI-98 transakcija za generiranje službenih UUID-ova).

### 5.2. Posjete (Encounters) i Slučajevi (Conditions)
*Pravilo: Svaki dokument mora biti vezan uz Posjetu (pacijent je u ordinaciji) i Slučaj (bolest koja se liječi).*
* **Posjete:** `GET /api/visit/remote` (Dohvat aktivnih), `POST /api/visit/create` (TC 12), `POST /api/visit/:id/close` (TC 14). 
  * *Zamka:* Klasa mora biti `AMB` za obične nalaze, ili `IMP` za otpusna pisma.
* **Slučajevi (State Machine):** `GET /api/case/remote` (TC 15). Ako slučaj za tu MKB-10 već postoji, NE otvara se novi! Ako ne postoji, `POST /api/case/create` (TC 16).
  * **Upravljanje statusima (TC 17):** Rješava se kroz `POST /api/case/:id/action`. Šifre: `2.4` (Zatvaranje/Izliječen), `2.3` (Remisija), `2.5` (Relaps).

### 5.3. Dokumenti (MHD Bundle)
* **Tipovi dokumenata:** `011` (Izvješće), `012` (Specijalistički nalaz), `013` (Otpusno pismo).
* **Slanje (TC 18):** `POST /api/document/send` -> Vraća `documentOid`.
* **UI Widget (Potpis):** G9 otvara iframe: `http://localhost:3010/sign-widget.html?oid=...`. Widget rješava AKD PIN ili Certilia Push, te komunicira s CEZIH-om.
* **Zamjena (TC 19):** `PUT /api/document/replace`. Novi dokument automatski nasljeđuje `visitId` i `caseId` od starog.
* **Storno (TC 20):** `POST /api/document/cancel`. CEZIH briše dokument.
* **Pretraga (TC 21):** `GET /api/document/search-remote` (Paginacija je transparentno riješena u pozadini).
* **Dohvat i Čitanje (TC 22 - ITI-68):** `GET /api/document/retrieve`. Middleware preuzima CEZIH Bundle i mapira ga u plosnati JSON:
  * *Anamneza* <- Observation (code=15)
  * *Status* <- Observation (code=16)
  * *Dijagnoza* <- Condition > code
  * *Preporuka* <- CarePlan > description

---

## 6. INTERNI PRIRUČNIK (White Box / Znanje Maintainera)

Ovo znanje je zaštićeno i služi isključivo internom timu koji održava Middleware.

### 6.1. Riješeni kritični bugovi i CEZIH specifičnosti
* **Organization referenca (`ERR_FMV_SRV_1016`):** CEZIH ruši pakete ako se koristi kriva HZZO šifra ili neispravan `SOURCE_ENDPOINT_OID`.
* **C14N Kanonizacija:** XML unutar FHIR Bundlea (`Composition` i `DocumentReference`) mora proći C14N kanonizaciju prije ES256 PKCS#11 potpisa. Dodavanje i najmanjeg razmaka nakon potpisa rezultira greškom "Potpis nije validan".
* **Storno Bug (Reference_REF_CantResolve):** Kod TC 20, ako se u `context.related` pošalje lokalni UUID slučaja umjesto `cmm...` identifikatora s CEZIH-a, sustav pada. Rješenje: RegEx filter izbacuje lokalne UUID-ove iz Storno paketa prije slanja.
* **Paginacija (TC 21):** CEZIH-ov URL za sljedeću stranicu sadrži ne-enkodirane `|` znakove koji ruše HTTP klijent na 2. stranici. Riješeno kroz `fixCezihNextUrl()` funkciju.
* **ITI-68 Bugovi:** Za dohvat dokumenta (TC 22), Accept header mora proći strogi content negotiation, a URL format se mora rekonstruirati iz `contentUrl` u `?data=base64(documentUniqueId=...)`.

### 6.2. Certilia Polling Mehanizam
Asinkroni potpis: `initiateRemoteSigning()` šalje hashirani Base64 na CEZIH Gateway -> dobiva `transactionCode` -> UI Widget vrši polling na `/status/:tCode` svake 3 sekunde -> pacijent odobrava na mobitelu -> CEZIH vraća `FULLY_SIGNED` -> Middleware pokreće `completeRemoteSigning()` i pakira vanjski ITI-65 Bundle.

---

## 7. PREMIUM ZNAČAJKE: XML & HL7 v2 Adapter

Kako bismo pridobili stare (legacy) G9 sustave i bolničke informacijske sustave (BIS) koji ne mogu slati JSON, Middleware implementira "Adapter Uzorak".
* Klijent šalje svoj postojeći **XML** ili staromodnu **HL7 v2** poruku (npr. `ORU^R01`).
* Rute (poput `/api/document/send-hl7`) koriste parser (`xml2js` ili `hl7-parser`) za prevođenje strukture.
* `PID` segment se čita kao demografija, `OBX` segmenti kao anamneza i nalaz.
* Sustav tu strukturu interno prebacuje u JSON, šalje FHIR Builderu, te G9 tvrtka ne mora mijenjati liniju svog legacy koda ("Zero-Code-Change Integration").

---

## 8. HARDVERSKI ZAHTJEVI

Sustav je optimiziran asinkronim Node.js I/O modelom, ali kriptografija troši CPU cikluse.
* **Ordinacije (do 3 liječnika):** Intel Celeron / i3, 2-4 GB RAM, 50 GB SSD (Dovoljan NUC računalo na pultu).
* **Srednje poliklinike (do 20 liječnika):** 4 CPU Cores, 8 GB RAM. Potrebno pokretanje više instanci Node.js procesa (Cluster mod preko PM2) zbog paralelnih potpisivanja.
* **Bolnice (do 100 liječnika):** 8+ CPU Cores, 16 GB RAM.