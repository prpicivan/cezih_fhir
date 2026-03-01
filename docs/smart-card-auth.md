# Prijava pametnom karticom (Smart Card) — Priručnik

> **Koristi se kada**: Certilia mobilna aplikacija ili username/password login ne rade,  
> a trebate autorizaciju za rad s CEZIH sustavom.

---

## Preduvjeti

- Smart kartica u čitaču (AKD Certilia kartica)
- Backend pokrenut: `npm run dev` (port 3010)
- Browser (Chrome ili Edge)

---

## Koraci

### 1. Otvorite gateway u browseru

Otvorite **novi incognito prozor** i idite na:

```
https://certws2.cezih.hr:8443/services-router/gateway
```

### 2. Autentificirajte se pametnom karticom

- Browser će prikazati dijalog za odabir certifikata — odaberite vaš **IDEN certifikat**
- Unesite **IDEN PIN** kada vas zatraži
- Pričekajte da se stranica učita (možete dobiti "Whitelabel Error 404" — to je **normalno**, autentifikacija je prošla)

### 3. Kopirajte session kolačić

1. Pritisnite **F12** (DevTools)
2. Idite na karticu **Application**
3. Lijevo odaberite **Cookies → `https://certws2.cezih.hr:8443`**
4. Pronađite kolačić: **`mod_auth_openidc_session`**
5. Kliknite na njega i kopirajte vrijednost iz stupca **Value**

Vrijednost izgleda otprilike ovako:
```
2706b939-b933-4ec7-8823-b963d5da9c02
```

### 4. Pokrenite injection skriptu

U terminal u mapi projekta pokrenite:

```bash
node scripts/inject-session.js
```

Skripta će vas pitati za vrijednost kolačića. Zalijepite je i pritisnite Enter.

**Ili direktno s argumentom:**

```bash
node scripts/inject-session.js 2706b939-b933-4ec7-8823-b963d5da9c02
```

### 5. Potvrdite autorizaciju

Trebali biste vidjeti:
```
✅ Sesija uspješno ubačena! Backend je autoriziran.
```

Možete i ručno provjeriti:
```
GET http://localhost:3010/api/auth/status
```
Odgovor: `{"authenticated": true, "method": "gateway"}`

---

## Napomene

| Stavka | Info |
|---|---|
| Trajanje sesije | ~4 sata |
| Kada obnoviti | Kad dobijete "No active gateway session" grešku |
| Sigurnost | Cookie vrijedi samo za lokalni razvoj, nikad ne dijelite javno |

---

## Česti problemi

**"Backend nije pokrenut"**  
→ Pokrenite backend: `npm run dev`

**Kolačić ne postoji u DevToolsu**  
→ Provjerite jeste li na domeni `certws2.cezih.hr:8443`, a ne na nekoj drugoj Certilia domeni

**"Whitelabel Error Page" — je li to u redu?**  
→ Da, 404 na `/protected` je normalno u testnom okruženju. Cookies su ipak postavljeni.

**Sesija ističe brzo**  
→ Certilia testna okruženja imaju kraće session timeoutove. Ponovite postupak kad dobijete autorizacijsku grešku.
