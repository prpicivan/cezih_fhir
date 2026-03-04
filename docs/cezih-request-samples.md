# CEZIH Request/Response Primjeri

Ovo su primjeri JSON zahtjeva koje šaljemo na CEZIH testno okruženje.
Greška na svakom je: `Unable to resolve resource with reference 'Organization?identifier=...|999001425'`

---

## 1. Encounter Create (TC12) — encounter-services

**Endpoint:** `POST https://certws2.cezih.hr:8443/services-router/gateway/encounter-services/api/v1/$process-message`

**Content-Type:** `application/fhir+json`

```json
{
  "resourceType": "Bundle",
  "id": "example-tc12-bundle-id",
  "meta": {
    "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-create-encounter-message"]
  },
  "type": "message",
  "timestamp": "2026-03-03T18:00:00.000+01:00",
  "entry": [
    {
      "fullUrl": "urn:uuid:msg-header-uuid",
      "resource": {
        "resourceType": "MessageHeader",
        "id": "msg-header-uuid",
        "meta": {
          "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter-management-message-header"]
        },
        "eventCoding": {
          "system": "http://ent.hr/fhir/CodeSystem/ehe-message-types",
          "code": "1.1"
        },
        "sender": {
          "type": "Organization",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije",
            "value": "999001425"
          }
        },
        "author": {
          "type": "Practitioner",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
            "value": "4981825"
          }
        },
        "source": {
          "endpoint": "urn:oid:999001425",
          "name": "Poliklinika-Test-01",
          "software": "CezihFhir_WBS",
          "version": "1.0.0."
        },
        "focus": [
          { "reference": "urn:uuid:encounter-uuid" }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:encounter-uuid",
      "resource": {
        "resourceType": "Encounter",
        "meta": {
          "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-encounter"]
        },
        "extension": [
          {
            "url": "http://fhir.cezih.hr/specifikacije/StructureDefinition/hr-troskovi-sudjelovanje",
            "extension": [
              {
                "url": "oznaka",
                "valueCoding": {
                  "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/sudjelovanje-u-troskovima",
                  "code": "N"
                }
              },
              {
                "url": "sifra-oslobodjenja",
                "valueCoding": {
                  "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/sifra-oslobodjenja-od-sudjelovanja-u-troskovima",
                  "code": "55"
                }
              }
            ]
          }
        ],
        "status": "in-progress",
        "class": {
          "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/nacin-prijema",
          "code": "1",
          "display": "Redovni"
        },
        "type": [
          {
            "coding": [
              {
                "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/vrsta-posjete",
                "code": "1",
                "display": "Pacijent prisutan"
              }
            ]
          },
          {
            "coding": [
              {
                "system": "http://fhir.cezih.hr/specifikacije/CodeSystem/hr-tip-posjete",
                "code": "2",
                "display": "Posjeta SKZZ"
              }
            ]
          }
        ],
        "identifier": [
          {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/lokalni-identifikator-posjete",
            "value": "local-visit-uuid"
          }
        ],
        "priority": {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
              "code": "R"
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
        "participant": [
          {
            "individual": {
              "type": "Practitioner",
              "identifier": {
                "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
                "value": "4981825"
              }
            }
          }
        ],
        "serviceProvider": {
          "type": "Organization",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije",
            "value": "999001425"
          }
        },
        "period": {
          "start": "2026-03-03T18:00:00.000+01:00"
        }
      }
    }
  ],
  "signature": {
    "type": [
      {
        "system": "urn:iso-astm:E1762-95:2013",
        "code": "1.2.840.10065.1.12.1.1",
        "display": "Author's Signature"
      }
    ],
    "when": "2026-03-03T18:00:00.000+01:00",
    "who": {
      "type": "Practitioner",
      "identifier": {
        "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
        "value": "4981825"
      }
    },
    "data": "<<JWS_POTPIS_BASE64>>"
  }
}
```

**Odgovor (HTTP 400):**
```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "details": {
        "text": "Unable to resolve resource with reference 'Organization?identifier=http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije|999001425'"
      }
    }
  ]
}
```

---

## 2. Document Submit (TC18) — doc-mhd-svc (ITI-65)

**Endpoint:** `POST https://certws2.cezih.hr:8443/services-router/gateway/doc-mhd-svc/api/v1/iti-65-service`

**Content-Type:** `application/fhir+json`

```json
{
  "resourceType": "Bundle",
  "meta": {
    "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle"]
  },
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:submission-set-uuid",
      "resource": {
        "resourceType": "List",
        "meta": {
          "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalSubmissionSet"]
        },
        "extension": [
          {
            "url": "https://profiles.ihe.net/ITI/MHD/StructureDefinition/ihe-sourceId",
            "valueIdentifier": {
              "system": "urn:ietf:rfc:3986",
              "value": "urn:uuid:source-id-uuid"
            }
          }
        ],
        "identifier": [
          {
            "use": "official",
            "system": "urn:ietf:rfc:3986",
            "value": "urn:uuid:unique-id"
          },
          {
            "use": "usual",
            "system": "urn:ietf:rfc:3986",
            "value": "urn:uuid:entry-uuid"
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
        "date": "2026-03-03T18:00:00.000+01:00",
        "source": {
          "type": "Practitioner",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/HZJZ-broj-zdravstvenog-djelatnika",
            "value": "4981825"
          }
        },
        "entry": [
          {
            "item": { "reference": "urn:uuid:doc-ref-uuid" }
          }
        ]
      },
      "request": { "method": "POST", "url": "List" }
    },
    {
      "fullUrl": "urn:uuid:doc-ref-uuid",
      "resource": {
        "resourceType": "DocumentReference",
        "meta": {
          "profile": ["http://fhir.cezih.hr/specifikacije/StructureDefinition/HR.MinimalDocumentReference"]
        },
        "masterIdentifier": {
          "use": "usual",
          "system": "urn:ietf:rfc:3986",
          "value": "urn:oid:2.16.840.1.113883.2.7.50.2.1.XXXXXXX"
        },
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
        "subject": {
          "type": "Patient",
          "identifier": {
            "system": "http://fhir.cezih.hr/specifikacije/identifikatori/MBO",
            "value": "999999423"
          },
          "display": "999999423"
        },
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
        "content": [
          {
            "attachment": {
              "contentType": "application/fhir+json",
              "url": "urn:uuid:binary-uuid"
            },
            "format": {
              "system": "http://ihe.net/fhir/ihe.formatcode.fhir/CodeSystem/formatcode",
              "code": "urn:ihe:iti:xds:2017:mimeTypeSufficient",
              "display": "mimeType Sufficient"
            }
          }
        ]
      },
      "request": { "method": "POST", "url": "DocumentReference" }
    },
    {
      "fullUrl": "urn:uuid:binary-uuid",
      "resource": {
        "resourceType": "Binary",
        "contentType": "application/fhir+json",
        "data": "<<BASE64_ENCODED_FHIR_DOCUMENT_BUNDLE>>"
      },
      "request": { "method": "POST", "url": "Binary" }
    }
  ]
}
```

**Odgovor (HTTP 400):**
```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "information",
      "code": "informational",
      "details": {
        "text": "This element does not match any known slice defined in the profile http://fhir.cezih.hr/specifikacije/StructureDefinition/HRMinimalProvideDocumentBundle and slicing is CLOSED @ Bundle.entry[0] / Bundle.entry[1]"
      }
    }
  ]
}
```

> **Napomena:** Slicing greška u TC18 je posljedica toga što CEZIH server dekodira Binary resurs koji sadrži FHIR Document Bundle.
> Unutar tog Document Bundle-a, `Composition.author` i `Encounter.serviceProvider` referenciraju Organization `999001425`,
> koju server ne može pronaći — pa prijavljuje slicing grešku na vanjskom MHD bundle-u.

---

## 3. Testirani identifier sustavi za Organization

Isprobali smo **sve** identifier sustave:

| Identifier System | Vrijednost | Rezultat |
|---|---|---|
| `HZZO-sifra-zdravstvene-organizacije` | `999001425` | ❌ CantResolve |
| `OIB` | `30160453873` | ❌ CantResolve |
| `HZJZ-broj-ustanove` | `4981825` | ❌ CantResolve |
| `jedinstveni-identifikator-zdravstvene-organizacije` | `18d537c3-3551-42e1-8466-1803b9e0b156` | ❌ CantResolve |

**Zaključak:** Organization `999001425` (WBS ordinacija) nije registrirana u `encounter-services` niti u `doc-mhd-svc` registrima testnog okruženja.
