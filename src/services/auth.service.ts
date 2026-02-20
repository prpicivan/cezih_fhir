/**
 * CEZIH Authentication Service
 * Handles OAuth2 Client Credentials (Test Case 3)
 * and OpenID Connect Authorization Code Flow (Test Cases 1, 2)
 */
import axios from 'axios';
import { config } from '../config';
import { CezihTokenResponse } from '../types';

class AuthService {
    private systemToken: string | null = null;
    private systemTokenExpiry: number = 0;
    private userSessions: Map<string, { token: string; expiry: number }> = new Map();

    // ============================================================
    // Test Case 3: Information System Authentication (OAuth2 Client Credentials)
    // ============================================================

    /**
     * Get system-level access token using OAuth2 Client Credentials Grant.
     * Used for: OID retrieval, terminology sync (no end-user context needed).
     */
    async getSystemToken(): Promise<string> {
        // Return cached token if still valid (with 30s buffer)
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
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                }
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

    // ============================================================
    // Test Case 1: End-User Auth via Smart Card (OpenID Connect)
    // ============================================================

    /**
     * Generate the authorization URL for Smart Card authentication.
     * The Gx application redirects the user to this URL, which triggers
     * TLS client certificate selection (smart card).
     */
    getSmartCardAuthUrl(state: string): string {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.auth.clientId,
            redirect_uri: config.auth.redirectUri,
            state,
            scope: 'openid',
            // Smart card auth: TLS mutual auth triggers certificate selection
            acr_values: 'urn:cezih:auth:smartcard',
        });

        return `${config.auth.oidcAuthUrl}?${params.toString()}`;
    }

    // ============================================================
    // Test Case 2: End-User Auth via Certilia mobile.ID (OpenID Connect + 2FA)
    // ============================================================

    /**
     * Generate the authorization URL for Certilia mobile.ID 2FA authentication.
     * No client certificate is sent during TLS handshake; instead,
     * the user is redirected to Certilia mobile.ID login form.
     */
    getCertiliaAuthUrl(state: string): string {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.auth.clientId,
            redirect_uri: config.auth.redirectUri,
            state,
            scope: 'openid',
            // Certilia mobile.ID: no TLS client cert, use 2FA instead
            acr_values: 'urn:cezih:auth:certilia',
        });

        return `${config.auth.oidcAuthUrl}?${params.toString()}`;
    }

    /**
     * Exchange authorization code for tokens (used by both Smart Card and Certilia flows).
     */
    async exchangeAuthCode(code: string): Promise<CezihTokenResponse> {
        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('client_id', config.auth.clientId);
            params.append('client_secret', config.auth.clientSecret);
            params.append('code', code);
            params.append('redirect_uri', config.auth.redirectUri);

            const response = await axios.post<CezihTokenResponse>(
                config.auth.tokenUrl,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                }
            );

            console.log('[AuthService] User token obtained via authorization code');
            return response.data;
        } catch (error: any) {
            console.error('[AuthService] Failed to exchange auth code:', error.response?.data || error.message);
            throw new Error('Failed to exchange authorization code: ' + (error.response?.data?.error_description || error.message));
        }
    }

    /**
     * Store a user session token for subsequent API calls.
     */
    storeUserSession(sessionId: string, token: string, expiresIn: number): void {
        this.userSessions.set(sessionId, {
            token,
            expiry: Date.now() + expiresIn * 1000,
        });
    }

    /**
     * Retrieve a valid user session token.
     */
    getUserToken(sessionId: string): string | null {
        const session = this.userSessions.get(sessionId);
        if (!session || Date.now() >= session.expiry) {
            this.userSessions.delete(sessionId);
            return null;
        }
        return session.token;
    }

    /**
     * Create axios headers with the appropriate authorization.
     */
    async getSystemAuthHeaders(): Promise<Record<string, string>> {
        const token = await this.getSystemToken();
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/fhir+json',
        };
    }

    getUserAuthHeaders(userToken: string): Record<string, string> {
        return {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/fhir+json',
        };
    }
}

export const authService = new AuthService();
