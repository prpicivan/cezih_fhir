# CEZIH — Primjeri Request/Response za blokirane TC-eve (04.03.2026.)

> Klijent ID: `ec6256a6-4f6e-4d88-899f-e9e8492229b0`  
> Organizacija: HZZO šifra `999001425`, OIB `30160453873`  
> Testni pacijent: MBO `999999423`  
> Datum testiranja: 04.03.2026., 13:00h

---

## 1. TC9 — mCSD pretraga organizacija (ITI-90)

### Request

```
GET https://certws2.cezih.hr:8443/services-router/gateway/encounter-services/api/v1/Organization?active=true

Headers:
  Cookie: mod_auth_openidc_session=<session-id>
  Accept: application/fhir+json
```

Testirane putanje (sve vraćaju 404):

| # | Putanja | Port | Rezultat |
|---|---------|------|----------|
| 1 | `/encounter-services/api/v1/Organization` | 8443 | 404 |
| 2 | `/patient-registry-services/api/v1/Organization` | 8443 | 404 |
| 3 | `/identifier-registry-services/api/v1/Organization` | 8443 | 404 |
| 4 | `/encounter-services/api/v1/Organization` | 9443 | 404 |
| 5 | `/patient-registry-services/api/v1/Organization` | 9443 | 404 |
| 6 | `/identifier-registry-services/api/v1/Organization` | 9443 | 404 |

### Response (primjer — HTTP 404)

```json
{
  "timestamp": "2026-03-04T12:45:30.123+00:00",
  "status": 404,
  "error": "Not Found",
  "path": "/services-router/gateway/encounter-services/api/v1/Organization"
}
```

### Pitanje

**Na kojoj točnoj putanji je dostupan mCSD servis (ITI-90) za pretragu Organization i Practitioner resursa u testnom okruženju?**

---

## 2. TC11 — PMIR registracija stranca (ITI-93)

### Request

```
POST https://certws2.cezih.hr:8443/services-router/gateway/patient-registry-services/api/v1/iti93

Headers:
  Cookie: mod_auth_openidc_session=<session-id>
  Content-Type: application/fhir+json
```

```json
{
  "resourceType": "Bundle",
  "type": "message",
  "entry": [
    {
      "fullUrl": "urn:uuid:msg-header",
      "resource": {
        "resourceType": "MessageHeader",
        "eventUri": "urn:ihe:iti:pmir:2019:patient-feed",
        "source": {
          "endpoint": "urn:oid:1.2.3.4.5.6"
        },
        "focus": [
          { "reference": "urn:uuid:patient-entry" }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:patient-entry",
      "resource": {
        "resourceType": "Patient",
        "meta": {
          "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/HRRegisterPatient"]
        },
        "active": true,
        "name": [
          {
            "family": "TestForeigner",
            "given": ["John"]
          }
        ],
        "gender": "male",
        "birthDate": "1990-05-15",
        "identifier": [
          {
            "type": {
              "coding": [
                {
                  "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                  "code": "PPN"
                }
              ]
            },
            "value": "AB1234567"
          }
        ],
        "extension": [
          {
            "url": "http://hl7.org/fhir/StructureDefinition/patient-nationality",
            "extension": [
              {
                "url": "code",
                "valueCodeableConcept": {
                  "coding": [
                    {
                      "system": "urn:iso:std:iso:3166",
                      "code": "US"
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### Response (HTTP 404)

```json
{
  "timestamp": "2026-03-04T12:06:38.219+00:00",
  "status": 404,
  "error": "Not Found",
  "path": "/services-router/gateway/patient-registry-services/api/v1/iti93"
}
```

### Napomena

Profili `HRRegisterPatient` i `hr-PMIR-bundle` su dohvatljivi iz StructureDefinition registra — specifikacija je definirana, ali servis nije deployiran.

Testirane alternativne putanje (sve 404):
- `/patient-registry-services/api/v1/$process-message`
- `/patient-registry-services/api/v1/pmir`
- `/patient-registry-services/api/v1/register`
- `/patient-registry-services/api/v1/Patient` (POST → 405 Method Not Allowed)
- `/patient-registry-services/api/v1/Bundle`

### Pitanje

**Je li ITI-93 (PMIR) servis aktivan u testnom okruženju? Ako da, na kojoj točnoj putanji?**

---

## 3. TC18 — Slanje dokumenta (ITI-65 / MHD)

### Request

```
POST https://certws2.cezih.hr:8443/services-router/gateway/doc-mhd-svc/api/v1/iti-65-service

Headers:
  Cookie: mod_auth_openidc_session=<session-id>
  Content-Type: application/fhir+json
  Accept: application/fhir+json
```

#### Stvarni MHD Bundle (poslan 04.03.2026. u 13:06 UTC):

```json
{
  "resourceType": "Bundle",
  "id": "77557cea-b378-4531-a2fd-9ca42dcb256b",
  "meta": {
    "profile": [
      "http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle"
    ]
  },
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:fa296901-0bd9-4d26-b2f4-1ddad0d8fe28",
      "resource": {
        "resourceType": "List",
        "meta": {
          "profile": [
            "http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalSubmissionSet"
          ]
        },
        "extension": [
          {
            "url": "https://profiles.ihe.net/ITI/MHD/StructureDefinition/ihe-sourceId",
            "valueIdentifier": {
              "system": "urn:ietf:rfc:3986",
              "value": "urn:uuid:b4ef7270-4077-406b-ae6d-ed47a095cc6d"
            }
          }
        ],
        "identifier": [
          {
            "use": "official",
            "system": "urn:ietf:rfc:3986",
            "value": "urn:uuid:61b15a45-b1a1-444c-b620-168efe54ba05"
          },
          {
            "use": "usual",
            "system": "urn:ietf:rfc:3986",
            "value": "urn:uuid:aec9f76f-d43f-4571-8da7-281dd61caad1"
          }
        ],
        "status": "current",
        "mode": "working",
        "code": {
          "coding": [
            {
              "system": "https://profiles.ihe.net/ITI/MHD/CodeSystem/MHDlistTypes",
              "code": "submissionset"
            }
          ]
        },
        "subject": {
          "type": "Patient",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/MBO",
            "value": "999999423"
          }
        },
        "date": "2026-03-04T12:06:58.492Z",
        "source": {
          "type": "Practitioner",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
            "value": "4981825"
          }
        },
        "entry": [
          {
            "item": {
              "reference": "urn:uuid:5cc48db3-875f-4b28-b7b3-8b2bf0da3ae3"
            }
          }
        ]
      },
      "request": { "method": "POST", "url": "List" }
    },
    {
      "fullUrl": "urn:uuid:5cc48db3-875f-4b28-b7b3-8b2bf0da3ae3",
      "resource": {
        "resourceType": "DocumentReference",
        "meta": {
          "profile": [
            "http://fhir.cezih.hr/specifikacije/StructureDefinition/HR.MinimalDocumentReference"
          ]
        },
        "masterIdentifier": {
          "use": "usual",
          "system": "urn:ietf:rfc:3986",
          "value": "urn:oid:2.16.840.1.113883.2.7.50.2.1.729390"
        },
        "identifier": [
          {
            "use": "official",
            "system": "urn:ietf:rfc:3986",
            "value": "urn:uuid:f81c4488-fa77-4113-9003-9ee06452d9e0"
          }
        ],
        "status": "current",
        "type": {
          "coding": [
            {
              "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/document-type",
              "code": "011",
              "display": "Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove"
            }
          ]
        },
        "category": [
          {
            "coding": [
              {
                "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/document-class",
                "code": "11",
                "display": "Klinički dokument"
              }
            ]
          }
        ],
        "subject": {
          "type": "Patient",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/MBO",
            "value": "999999423"
          },
          "display": "999999423"
        },
        "date": "2026-03-04T12:06:58.493Z",
        "author": [
          {
            "type": "Practitioner",
            "identifier": {
              "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
              "value": "4981825"
            },
            "display": "Ivan Prpić"
          },
          {
            "type": "Organization",
            "identifier": {
              "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije",
              "value": "999001425"
            },
            "display": "WBS ordinacija"
          }
        ],
        "authenticator": {
          "type": "Practitioner",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
            "value": "4981825"
          },
          "display": "Ivan Prpić"
        },
        "custodian": {
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije",
            "value": "999001425"
          },
          "display": "WBS ordinacija"
        },
        "description": "Medicinski nalaz",
        "securityLabel": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/v3-Confidentiality",
                "code": "N",
                "display": "normal"
              }
            ]
          }
        ],
        "content": [
          {
            "attachment": {
              "contentType": "application/fhir+json",
              "url": "urn:uuid:7a317b77-9643-466a-be0a-04f6e9b79e2d"
            },
            "format": {
              "system": "http://ihe.net/fhir/ihe.formatcode.fhir/CodeSystem/formatcode",
              "code": "urn:ihe:iti:xds:2017:mimeTypeSufficient",
              "display": "mimeType Sufficient"
            }
          }
        ],
        "context": {
          "practiceSetting": {
            "coding": [
              {
                "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/djelatnosti-zz",
                "code": "3030000",
                "display": "Opća medicina"
              }
            ]
          },
          "period": { "start": "2026-03-04T12:06:57.050Z" }
        }
      },
      "request": { "method": "POST", "url": "DocumentReference" }
    },
    {
      "fullUrl": "urn:uuid:7a317b77-9643-466a-be0a-04f6e9b79e2d",
      "resource": {
        "resourceType": "Binary",
        "contentType": "application/fhir+json",
        "data": "<<BASE64_FHIR_DOCUMENT_BUNDLE — potpisani klinički dokument s Composition, Patient, Practitioner, Organization, Condition, Encounter, HealthcareService resursima>>"
      },
      "request": { "method": "POST", "url": "Binary" }
    }
  ]
}
```

> **Napomena o Binary resursu:** `data` sadrži base64-enkodirani FHIR Document Bundle (`type: "document"`) koji uključuje `Composition`, `Patient`, `Practitioner`, `Organization` (identifier `999001425`), `Condition`, `Encounter` i `HealthcareService` resurse, te JWS potpis (PKCS#11 smart card, ES256).

### Response (HTTP 400)

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "information",
      "code": "informational",
      "details": {
        "text": "This element does not match any known slice defined in the profile http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle and slicing is CLOSED: "
      }
    }
  ]
}
```

### Analiza

Dokazano A/B testiranjem da je **struktura bundlea ispravna**:

| OID prefix u `masterIdentifier` | Ponašanje | Rezultat |
|---|---|---|
| `2.16.840.1.113883.2.7.50.2.1` (pravi) | CEZIH dekodira Binary, pokušava resolve Organization | ❌ SLICING ERROR |
| `2.16.840.1.113883.2.7.50.2.1.999999` (lažni) | CEZIH preskače deep validation | ✅ Prolazi |

**Zaključak:** Greška nije u strukturi MHD bundlea. CEZIH dekodira Binary resurs, pokušava resolve-ati Organization `999001425` unutar Document Bundle, ne uspijeva, i prijavljuje slicing error na vanjskom MHD bundleu.

> **Napomena:** TC12 (kreiranje posjete) s istim Organization identifierom `999001425` **sada radi** od danas — to sugerira da je Organization registrirana u `encounter-services`, ali još nije u `doc-mhd-svc`.

### Pitanje

**Može li se Organization `999001425` registrirati i u `doc-mhd-svc` servisu, kao što je to učinjeno za `encounter-services`?**

---

## 4. Sažetak pitanja za CEZIH tim

| # | TC | Pitanje |
|---|---|---------|
| 1 | TC9 | Na kojoj putanji je mCSD servis (ITI-90) za `Organization/Practitioner` pretragu? |
| 2 | TC11 | Je li ITI-93 (PMIR) endpoint aktivan? Na kojoj putanji? |
| 3 | TC18 | Može li se Organization `999001425` registrirati u `doc-mhd-svc` (kao što je registrirana u `encounter-services`)? |
