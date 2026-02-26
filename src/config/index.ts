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
};
