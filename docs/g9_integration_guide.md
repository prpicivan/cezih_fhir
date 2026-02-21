# G9 Integration Guide: CEZIH FHIR Middleware

This guide provides the technical specifications for integrating G9 applications with the `cezih_fhir` middleware for national health system compliance in Croatia.

---

## 1. Authentication

The middleware handles two types of authentication:

### System Authentication (Machine-to-Machine)
Used for terminology sync, OID generation, and background tasks.
*   **Endpoint**: `POST /api/auth/system-token`
*   **Response**: `{ "success": true, "tokenPreview": "..." }` (Server caches the token internally).

### User Authentication (Doctor Context)
All clinical data operations (sending findings, searching patients) **require a User Token** obtained via smart card or mobile.ID.
*   **Endpoints**: 
    *   `GET /api/auth/smartcard`: Returns a redirect URL for card auth.
    *   `GET /api/auth/certilia`: Returns a redirect URL for mobile.ID.
*   **Usage**: Pass the resulting session token in the `Authorization: Bearer <token>` header for all subsequent API calls.

---

## 2. Cases (Slučajevi)
*FHIR Resource: EpisodeOfCare*

Cases represent a logically connected series of healthcare activities for a specific condition (e.g., "Post-operative recovery", "Chronic patient management").

### Operations
*   **Search**: `GET /api/case/patient/:mbo`
*   **Create**: `POST /api/case/create`
    *   *Payload*:
        ```json
        {
          "patientMbo": "123456789",
          "practitionerId": "1234567",
          "organizationId": "91001",
          "title": "Dijabetes kontrola",
          "status": "active",
          "startDate": "2024-03-20T10:00:00Z"
        }
        ```
*   **Update**: `PUT /api/case/:id` (e.g., to change status or set `endDate`).

---

## 3. Visits (Posjeti)
*FHIR Resource: Encounter*

Visits represent a single interaction between a patient and a doctor (an exam, a consultation).

### Lifecycle Flow
1.  **Start Visit**: `POST /api/visit/create`
    *   *Payload*:
        ```json
        {
          "patientMbo": "123456789",
          "practitionerId": "1234567",
          "organizationId": "91001",
          "class": "AMB", // AMB (Ambulantni), EMER (Hitni), IMP (Bolnički)
          "startDate": "2024-03-20T11:00:00Z",
          "caseId": "uuid-from-step-2" // Optional but recommended
        }
        ```
2.  **Update Visit**: `PUT /api/visit/:id` (Add diagnosis codes, clinical reasons during the exam).
3.  **Close Visit**: `POST /api/visit/:id/close` (Mandatory for CEZIH realization).

---

## 4. Clinical Document Exchange (Nalazi)
*FHIR Transactions: ITI-65 / IHE MHD*

The core exchange for clinical findings, discharge summaries, and reports.

### Workflow Scenarios
*   **Send (New)**: `POST /api/document/send` (Generates the JWS-signed FHIR Bundle).
*   **Replace (Correction)**: `POST /api/document/replace`
    *   *Payload requirement*: Includes `originalDocumentOid` to link the correction to the previous version.
*   **Cancel (Storno)**: `POST /api/document/cancel`
    *   *Payload requirement*: `{ "documentOid": "..." }`. Transitions the document to `entered-in-error` status in CEZIH.

---

## 5. Registries (Središnji Registri)
*FHIR Resource: IHE mCSD*

G9 applications should use these registries to fetch valid IDs for doctors, clinics, and services.

### Lookups
*   **Organizations**: `GET /api/registry/organizations?name=Bolnica`
*   **Practitioners**: `GET /api/registry/practitioners?name=Horvat`
*   **Healthcare Services**: `GET /api/registry/services?organization=91001` (Lists services provided by an org).

---

## 6. Terminology (Codebooks)

G9 apps should sync terminology to ensure valid codes are used in dropdowns.
*   **Sync all**: `POST /api/terminology/sync`
*   **Search Diagnoses**: `GET /api/terminology/diagnoses?q=puls` (Searches ICD-10 HR).

---

## 5. Audit & Compliance

The middleware automatically logs all CEZIH communication. Use the Audit API for troubleshooting or compliance reporting.
*   **View Logs**: `GET /api/audit/logs`
*   **Filter by Visit**: `GET /api/audit/logs/:visitId`

---

> [!TIP]
> **Data Validation**: The middleware performs JCS canonicalization and JWS signing automatically. G9 applications only need to provide the "Human Readable" structured data (finding, anamnesis, etc.) and valid HZZO/HZJZ identification codes.
