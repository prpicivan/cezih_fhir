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
import db from '../db';

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
    /** Decoded JWT claims (includes realm_access.roles) — populated if a JWT cookie is detected */
    userClaims?: Record<string, any>;
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

    // --- Keep-Alive ---
    private keepAliveInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Obnovi sesiju iz SQLite ako postoji (preživljava tsx watch restart)
        this.restoreSessionFromDb();
    }

    private restoreSessionFromDb(): void {
        try {
            const row = db.prepare("SELECT value FROM settings WHERE key = 'gateway_session'").get() as any;
            if (row?.value) {
                const saved = JSON.parse(row.value) as GatewaySession;
                const maxAge = 4 * 60 * 60 * 1000; // 4h
                if (Date.now() - saved.createdAt < maxAge) {
                    this.gatewaySession = saved;
                    console.log('[AuthService] ✅ Gateway sesija obnovljena iz DB (stara', Math.round((Date.now() - saved.createdAt) / 60000), 'min)');
                    this.startKeepAlive();
                } else {
                    console.log('[AuthService] DB sesija je istekla, ignoriramo.');
                    db.prepare("DELETE FROM settings WHERE key = 'gateway_session'").run();
                }
            }
        } catch (e: any) {
            console.warn('[AuthService] Ne mogu obnoviti sesiju iz DB:', e.message);
        }
    }

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

        if (method === 'smartcard') {
            const protectedUrl = `${config.cezih.baseUrl}/protected`;
            console.log(`[AuthService] ✅ Smart card: vraćamo /protected URL (mod_auth_openidc endpoint)`);
            return {
                authUrl: protectedUrl,
                method,
                chainCookies: [],
                gatewayUrl,
            };
        }

        // For Certilia (mobile.ID): follow redirects server-side to get the Certilia URL
        try {
            const { default: axios } = await import('axios');
            const response = await axios.get(gatewayUrl, {
                maxRedirects: 15,
                validateStatus: () => true,
                httpsAgent: undefined,
            });

            const finalUrl: string = (response.request as any)?.res?.responseUrl || gatewayUrl;
            console.log(`[AuthService] ✅ Certilia login URL ready`);

            return {
                authUrl: finalUrl,
                method,
                chainCookies: [],
                gatewayUrl,
            };
        } catch (error: any) {
            throw new Error(`Cannot reach CEZIH gateway: ${error.message}`);
        }
    }

    // ============================================================
    // Gateway Auth — Store Session
    // ============================================================

    /**
     * Store gateway session cookies after successful browser authentication.
     * Also tries to detect any JWT embedded in cookie values and extract user claims.
     */
    storeGatewaySession(cookies: string[], sessionToken?: string): void {
        // Try to decode JWT claims from any cookie that contains a 3-part JWT value
        let detectedClaims: Record<string, any> | undefined;

        for (const cookie of cookies) {
            const val = cookie.split('=').slice(1).join('=');
            const parts = val.split('.');
            if (parts.length === 3 && parts[1].length > 10) {
                try {
                    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
                    if (payload.sub && (payload.realm_access || payload.authorities || payload.user_type)) {
                        detectedClaims = payload;
                        console.log('[AuthService] 🎯 JWT claims detected in cookie:', cookie.split('=')[0]);
                        console.log('[AuthService] User:', payload.preferred_username || payload.sub);
                        console.log('[AuthService] UserType:', payload.user_type);
                        console.log('[AuthService] Roles:', JSON.stringify(
                            payload.realm_access?.roles || payload.authorities?.roles || []
                        ));
                        break;
                    }
                } catch { /* not a valid JWT, skip */ }
            }
        }

        if (!detectedClaims) {
            console.log('[AuthService] No JWT found in cookies — user claims not available via cookie decode');
        }

        this.gatewaySession = {
            cookies,
            createdAt: Date.now(),
            sessionToken,
            userClaims: detectedClaims,
        };
        console.log('[AuthService] ✅ Gateway session stored');
        console.log('[AuthService] Cookies:', cookies.length);
        if (sessionToken) {
            console.log('[AuthService] Session token:', sessionToken.substring(0, 20) + '...');
        }

        // Persist u SQLite da preživi restart
        try {
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gateway_session', ?)").run(
                JSON.stringify(this.gatewaySession)
            );
            console.log('[AuthService] ✅ Sesija zapisana u DB.');
        } catch (e: any) {
            console.warn('[AuthService] Ne mogu zapisati sesiju u DB:', e.message);
        }

        // Pokreni keep-alive ping
        this.startKeepAlive();
    }

    /**
     * Check if we have a valid gateway session.
     */
    hasGatewaySession(): boolean {
        if (!this.gatewaySession) return false;
        const maxAge = 4 * 60 * 60 * 1000; // 4 hours
        return Date.now() - this.gatewaySession.createdAt < maxAge;
    }

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
    getSessionStatus(): { authenticated: boolean; method?: string; createdAt?: number; hasUserClaims?: boolean } {
        if (!this.hasGatewaySession()) {
            return { authenticated: false };
        }
        return {
            authenticated: true,
            method: 'gateway',
            createdAt: this.gatewaySession!.createdAt,
            hasUserClaims: !!this.gatewaySession!.userClaims,
        };
    }

    /**
     * Get system token (M2M) status without triggering a refresh.
     */
    getSystemTokenStatus(): { active: boolean; expiresInMinutes?: number } {
        if (!this.systemToken || Date.now() >= this.systemTokenExpiry - 30000) {
            return { active: false };
        }
        return {
            active: true,
            expiresInMinutes: Math.round((this.systemTokenExpiry - Date.now()) / 60000),
        };
    }

    /**
     * Clear the current gateway session (used before re-authentication).
     */
    clearGatewaySession(): void {
        this.stopKeepAlive();
        this.gatewaySession = null;
        try {
            db.prepare("DELETE FROM settings WHERE key = 'gateway_session'").run();
        } catch (_) { }
        console.log('[AuthService] Gateway session cleared');
    }

    /**
     * Get decoded user claims from the active session (if available).
     */
    getUserClaims(): Record<string, any> | null {
        return this.gatewaySession?.userClaims || null;
    }

    // ============================================================
    // Session Keep-Alive (Heartbeat)
    // ============================================================

    public startKeepAlive() {
        // Ako već postoji aktivan ping, očisti ga da nemamo duplikate
        this.stopKeepAlive();

        console.log('[AuthService] 🕒 Pokrećem automatsko održavanje sesije (ping svakih 5 min)...');

        // Postavljamo interval na 5 minuta (300,000 milisekundi)
        this.keepAliveInterval = setInterval(async () => {
            if (!this.hasGatewaySession()) {
                this.stopKeepAlive();
                return;
            }

            try {
                const headers = this.getGatewayAuthHeaders();
                // Gađamo bezazlen endpoint (/metadata vraća FHIR CapabilityStatement i ne radi audit log)
                const url = `${config.cezih.gatewayBase}${config.cezih.services.patient}/metadata`;

                await axios.get(url, { headers, timeout: 10000 });
                console.log(`[AuthService] 🟢 Keep-alive ping uspješan (${new Date().toLocaleTimeString()}). Sesija produžena.`);
            } catch (error: any) {
                console.warn('[AuthService] 🔴 Keep-alive ping pao! Sesija je vjerojatno istekla na CEZIH strani.');

                // Očisti lokalnu sesiju da sustav zna da smo odlogirani
                this.clearSession();
                this.stopKeepAlive();
            }
        }, 5 * 60 * 1000); // 5 minuta
    }

    public stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            console.log('[AuthService] 🛑 Keep-alive ping zaustavljen.');
        }
    }

    public clearSession() {
        this.gatewaySession = null;
        try {
            db.prepare("DELETE FROM settings WHERE key = 'gateway_session'").run();
        } catch (_) { }
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
