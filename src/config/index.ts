import dotenv from 'dotenv';
dotenv.config();

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3010', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // CEZIH Base URLs
    cezih: {
        baseUrl: process.env.CEZIH_BASE_URL || 'https://test.fhir.cezih.hr',
        fhirUrl: process.env.CEZIH_FHIR_URL || 'https://test.fhir.cezih.hr/R4/fhir',
        oidRegistryUrl: process.env.CEZIH_OID_REGISTRY_URL || 'https://test.fhir.cezih.hr/oid-registry',
        // Per-service gateway URLs (each CEZIH FHIR resource has its own microservice)
        gatewayBase: (process.env.CEZIH_BASE_URL || 'https://certws2.cezih.hr:8443') + '/services-router/gateway',
        gatewaySystem: (process.env.CEZIH_BASE_URL?.replace(':8443', ':9443') || 'https://certws2.cezih.hr:9443') + '/services-router/gateway',
        services: {
            patient: '/patient-registry-services/api/v1',
            document: '/doc-mhd-svc/api/v1',
            healthIssue: '/health-issue-services/api/v1',
            visit: '/encounter-services/api/v1',
            terminology: '/terminology-services/api/v1',
            notification: '/notification-pull-service/api/v1',
            referral: '/sgp-referral-service/api/v1',
            registry: '/patient-registry-services/api/v1',
            // mCSD (ITI-90) — port 9443 only, system auth
            mcsd: process.env.CEZIH_MCSD_SERVICE_PATH || '/mcsd/api',
        },
    },

    // OAuth2 Client Credentials (System Auth)
    auth: {
        clientId: process.env.CEZIH_CLIENT_ID || '',
        clientSecret: process.env.CEZIH_CLIENT_SECRET || '',
        tokenUrl: process.env.CEZIH_TOKEN_URL || '',
        oidcAuthUrl: process.env.CEZIH_OIDC_AUTH_URL || '',
        redirectUri: process.env.CEZIH_OIDC_REDIRECT_URI || 'http://localhost:3010/auth/callback',
        ssoSessionHeader: process.env.CEZIH_SSO_SESSION_HEADER || 'mod_auth_openid_session',
    },

    // Organization Identity
    organization: {
        oib: process.env.ORGANIZATION_OIB || '',
        hzzoCode: process.env.ORGANIZATION_HZZO_CODE || '',
        hzjzCode: process.env.ORGANIZATION_HZJZ_CODE || '',
        name: process.env.ORGANIZATION_NAME || 'Privatna poliklinika',
        // OID identifikator sustava — dodjeljuje CEZIH prilikom registracije vanjskog sustava
        // Koristi se u MessageHeader.source.endpoint (mora biti validan dotted-decimal OID)
        sourceEndpointOid: process.env.SOURCE_ENDPOINT_OID || '1.2.3.4.5.6',
    },

    // Practitioner (liječnik koji koristi sustav)
    practitioner: {
        oib: process.env.PRACTITIONER_OIB || '',
        name: process.env.PRACTITIONER_NAME || '',
        // HZJZ broj radnika — šalje se kao practitionerId u FHIR resursima
        hzjzId: process.env.PRACTITIONER_HZJZ_ID || process.env.PRACTITIONER_OIB || '',
    },

    // Software Metadata (for CEZIH identification)
    software: {
        name: process.env.SOFTWARE_NAME || 'CezihFhir',
        company: process.env.ORGANIZATION_NAME || 'WBS',
        version: process.env.SOFTWARE_VERSION || '1.0.0.',
        instance: process.env.SOFTWARE_INSTANCE || 'Poliklinika-Test-01',
    },

    // Digital Signature (JWS)
    signing: {
        certPath: process.env.SIGNING_CERT_PATH || '',
        keyPath: process.env.SIGNING_KEY_PATH || '',
        bridgeUrl: process.env.SIGN_BRIDGE_URL || '',
        bridgeToken: process.env.SIGN_BRIDGE_TOKEN || 'dev-secret',
    },

    // Remote Signing (CEZIH Udaljeni potpis via Certilia mobile.ID)
    remoteSigning: {
        signerOib: process.env.SIGNER_OIB || '',
        sourceSystem: process.env.REMOTE_SIGN_SOURCE_SYSTEM || 'DEV',
        remoteSignUrl: process.env.REMOTE_SIGN_URL || 'https://certpubws.cezih.hr/services-router/gateway/extsigner/api/sign',
    },
};
