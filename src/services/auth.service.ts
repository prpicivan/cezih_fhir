/**
 * CEZIH Authentication Service
 * 
 * Two auth mechanisms:
 * 1. System Auth (OAuth2 Client Credentials) — for OID, terminology, etc.
 * 2. Gateway Auth (OpenID Agent proxy) — for user-level FHIR services.
 *    The CEZIH gateway handles OIDC internally via its own proxy (services_proxy).
 *    Our app follows the redirect chain to get the auth URL, opens it in the browser,
 *    and captures the session cookies after user authenticates.
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { CezihTokenResponse } from '../types';

// ============================================================
// Types
// ============================================================

export interface GatewayAuthInitResult {
    /** The final URL to open in the browser for user authentication */
    authUrl: string;
    /** The method detected (smartcard or certilia) */
    method: 'smartcard' | 'certilia';
    /** All cookies gathered along the redirect chain (send back to POST /auth/session) */
    chainCookies: string[];
    /** The original gateway URL that was probed */
    gatewayUrl: string;
}

export interface GatewaySession {
    /** All cookies needed to make authenticated requests to the gateway */
    cookies: string[];
    /** When this session was established */
    createdAt: number;
    /** mod_auth_openid_session value if extracted */
    sessionToken?: string;
}

// ============================================================
// Auth Service
// ============================================================

class AuthService {
    // --- System Auth ---
    private systemToken: string | null = null;
    private systemTokenExpiry: number = 0;

    // --- Gateway Auth ---
    private gatewaySession: GatewaySession | null = null;
    private pendingAuthState: Map<string, { chainCookies: string[]; gatewayUrl: string }> = new Map();

    // ============================================================
    // System Auth (OAuth2 Client Credentials — unchanged)
    // ============================================================

    async getSystemToken(): Promise<string> {
        if (this.systemToken && Date.now() < this.systemTokenExpiry - 30000) {
            return this.systemToken;
        }

        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', config.auth.clientId);
            params.append('client_secret', config.auth.clientSecret);

            const response = await axios.post<CezihTokenResponse>(
                config.auth.tokenUrl,
                params.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            this.systemToken = response.data.access_token;
            this.systemTokenExpiry = Date.now() + response.data.expires_in * 1000;
            console.log('[AuthService] System token obtained, expires in', response.data.expires_in, 'seconds');
            return this.systemToken;
        } catch (error: any) {
            console.error('[AuthService] Failed to get system token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with CEZIH: ' + (error.response?.data?.error_description || error.message));
        }
    }

    async getSystemAuthHeaders(): Promise<Record<string, string>> {
        const token = await this.getSystemToken();
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/fhir+json',
        };
    }

    // ============================================================
    // Gateway Auth — Initiate (probe gateway → follow redirects → return auth URL)
    // ============================================================

    /**
     * Initiate gateway-based user authentication.
     * 
     * The browser must open the gateway URL directly so it follows all redirects
     * and accumulates cookies at each domain (gateway, SSO, Certilia).
     * 
     * For smart card: gateway → SSO (TLS cert handshake) → session
     * For certilia: gateway → SSO → broker → Certilia IDP → login form → session
     */
    async initiateGatewayAuth(method: 'smartcard' | 'certilia' = 'certilia'): Promise<GatewayAuthInitResult> {
        const gatewayUrl = `${config.cezih.baseUrl}/services-router/gateway`;
        console.log(`[AuthService] Initiating gateway auth (${method})...`);

        // Verify gateway is reachable
        try {
            const probe = await axios.get(gatewayUrl, {
                maxRedirects: 0,
                validateStatus: () => true,
            });
            console.log('[AuthService] Gateway probe:', probe.status);

            if (probe.status !== 302) {
                // If 200, gateway might already have a session
                if (probe.status === 200) {
                    console.log('[AuthService] Gateway returned 200 — may already be authenticated');
                } else {
                    console.log('[AuthService] Warning: unexpected gateway status:', probe.status);
                }
            }
        } catch (error: any) {
            throw new Error(`Cannot reach CEZIH gateway: ${error.message}`);
        }

        // Return the gateway URL for the browser to open directly.
        // The browser will follow all redirects and accumulate cookies naturally.
        console.log(`[AuthService] ✅ Returning gateway URL for browser-based ${method} auth`);

        return {
            authUrl: gatewayUrl,
            method,
            chainCookies: [], // Browser handles cookies directly
            gatewayUrl,
        };
    }

    // ============================================================
    // Gateway Auth — Store Session
    // ============================================================

    /**
     * Store gateway session cookies after successful browser authentication.
     * The frontend sends back the cookies it captured from the auth flow.
     */
    storeGatewaySession(cookies: string[], sessionToken?: string): void {
        this.gatewaySession = {
            cookies,
            createdAt: Date.now(),
            sessionToken,
        };
        console.log('[AuthService] ✅ Gateway session stored');
        console.log('[AuthService] Cookies:', cookies.length);
        if (sessionToken) {
            console.log('[AuthService] Session token:', sessionToken.substring(0, 20) + '...');
        }
    }

    /**
     * Check if we have a valid gateway session.
     */
    hasGatewaySession(): boolean {
        if (!this.gatewaySession) return false;
        // Sessions are typically valid for a few hours
        const maxAge = 4 * 60 * 60 * 1000; // 4 hours
        return Date.now() - this.gatewaySession.createdAt < maxAge;
    }

    /**
     * Get headers for authenticated gateway FHIR requests.
     * Uses the mod_auth_openid_session header + cookies.
     */
    getGatewayAuthHeaders(): Record<string, string> {
        if (!this.gatewaySession) {
            throw new Error('No active gateway session. Please authenticate first.');
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/fhir+json',
            Cookie: this.gatewaySession.cookies.join('; '),
        };

        if (this.gatewaySession.sessionToken) {
            headers[config.auth.ssoSessionHeader] = this.gatewaySession.sessionToken;
        }

        return headers;
    }

    /**
     * Get current session status.
     */
    getSessionStatus(): { authenticated: boolean; method?: string; createdAt?: number } {
        if (!this.hasGatewaySession()) {
            return { authenticated: false };
        }
        return {
            authenticated: true,
            method: 'gateway',
            createdAt: this.gatewaySession!.createdAt,
        };
    }

    // ============================================================
    // Legacy support: User sessions via tokens (for backward compat)
    // ============================================================

    private userSessions: Map<string, { token: string; expiry: number }> = new Map();

    storeUserSession(sessionId: string, token: string, expiresIn: number): void {
        this.userSessions.set(sessionId, {
            token,
            expiry: Date.now() + expiresIn * 1000,
        });
    }

    getUserToken(sessionId: string): string | null {
        const session = this.userSessions.get(sessionId);
        if (!session || Date.now() >= session.expiry) {
            this.userSessions.delete(sessionId);
            return null;
        }
        return session.token;
    }

    getUserAuthHeaders(userToken: string): Record<string, string> {
        // If we have a gateway session (from Certilia or Smart Card),
        // use gateway cookies — not Bearer token
        if (this.hasGatewaySession()) {
            return this.getGatewayAuthHeaders();
        }

        // Legacy fallback: Bearer token
        return {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/fhir+json',
        };
    }
}

export const authService = new AuthService();
