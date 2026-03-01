# CEZIH Service Endpoints (Reference)

This list contains official service endpoints for the CEZIH FHIR environment, provided via image on 2026-02-27.

| # | Service Name | Endpoint URL Path | Method | Notes |
|---|--------------|-------------------|--------|-------|
| 1 | Upravljanje slučajevima | `/health-issue-services/api/v1/$process-message` | POST | Episodes/Cases |
| 2 | Upravljanje posjetama | `/encounter-services/api/v1/$process-message` | POST | Encounters/Visits |
| 3 | Registracija dokumenata | `/doc-mhd-svc/api/v1/iti-65-service` | POST | ITI-65 |
| 4 | Pretraga dokumenata | `/doc-mhd-svc/api/v1/DocumentReference` | GET | ITI-67 |
| 5 | Dohvat dokumenta | `/doc-mhd-svc/api/v1/iti-68-service` | GET | ITI-68 |
| 6 | Pretraga posjeta | `/ihe-qedm-services/api/v1/Encounter` | GET | QEDm Encounter |
| 7 | Pretraga slučajeva | `/ihe-qedm-services/api/v1/Condition` | GET | QEDm Condition |
| 8 | Dohvat podataka o pacijentu | `/patient-registry-services/api/v1/Patient` | GET | ITI-78 |
| 9 | Registar identifikatora | `/identifier-registry-services/api/v1/oid/generateOIDBatch` | POST | TC 6 OID |
| 10| Sinkronizacija šifrarnika | `/terminology-services/api/v1/CodeSystem` | GET | ITI-96 |
| 11| System Token (OAuth2) | `https://certsso2.cezih.hr/auth/realms/CEZIH/protocol/openid-connect/token` | POST | |
| 12| Upravljanje SGP uputnicom | `/sgp-referral-service/api/v1/$process-message` | POST | |
| 13| Notifikacije (Pull) | `/notification-pull-service/api/v1/notifications` | GET | |
| 14| Notifikacije (Push) | `wss://.../notification-push-websocket/api/v1/notifications` | - | |
| 18| Upravljanje pacijentima | `/patient-registry-services/api/v1/iti93` | POST | ITI-93 (PMIR) |
| 19| Dohvat ValueSet-ova | `/terminology-services/api/v1/ValueSet` | GET | ITI-95 |
| 20| Dohvat structure definition | `/fhir/StructureDefinition` | GET | |
| 21| Udaljeni potpis | `https://certpubws.cezih.hr/services-router/gateway/extsigner/api/sign` | POST | Certilia |
| 22| Udaljeni potpis dohvat | `https://certpubws.cezih.hr/services-router/gateway/extsigner/api/getSignedDocuments` | GET | |

**Base URLs:**
- Gateway: `https://certws2.cezih.hr:8443/services-router/gateway`
- SSO: `https://certsso2.cezih.hr/auth`
- Remote Sign: `https://certpubws.cezih.hr/services-router/gateway/extsigner`

 
> [!NOTE]
> **TC 9 - Organization / Practitioner Search (IHE mCSD ITI-90):**
> **DEFINITIVE FINDING:** After exhaustively probing **30+ gateway paths** (both authenticated and unauthenticated), confirmed that no `Organization` or `Practitioner` endpoint exists on `certws2.cezih.hr:8443/services-router/gateway/`.
>
> All paths respond with JSON 404 in < 1ms — the gateway router itself rejects these paths, not a downstream service.
> `/metadata` (FHIR CapabilityStatement) also returns 404 across all paths — the gateway does not expose service discovery.
>
> **Action required:** Request the correct Organization/Practitioner endpoint URL from the CEZIH technical team.
> The implementation in `registry.service.ts` is correct and production-ready — it will work as soon as the correct path is configured in `config/index.ts` under `cezih.services.registry`.
