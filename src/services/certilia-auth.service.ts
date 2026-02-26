/**
 * CEZIH Certilia Programmatic Authentication Service
 * 
 * Handles the full Certilia mobile.ID auth flow programmatically
 * using a cookie jar. This avoids browser cookie/SameSite issues
 * and TLS client cert prompts.
 * 
 * Flow:
 * 1. Follow gateway → SSO → Certilia login form (collect cookies)
 * 2. Extract sessionDataKey from form
 * 3. Submit credentials to Certilia
 * 4. If mobile.ID → parse mobileid.jsp for checkUserAuthURL + auth
 * 5. Poll checkUserAuthURL+auth until status=success, get otpCode
 * 6. Submit otpCode to commonauth → follow redirects → gateway session
 */
import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { config } from '../config';

export interface CertiliaLoginFormData {
    formActionUrl: string;
    sessionDataKey: string;
    ready: boolean;
}

export interface CertiliaAuthResult {
    success: boolean;
    gatewayCookies: string[];
    sessionToken?: string;
    error?: string;
}

export class CertiliaAuthClient {
    private jar: CookieJar;
    private client: AxiosInstance;
    private formData: CertiliaLoginFormData | null = null;
    private certiliaBaseUrl: string = '';

    // Mobile approval fields (extracted from mobileid.jsp)
    private mobilePollingUrl: string | null = null;
    private mobileSessionDataKey: string | null = null;
    private mobileFormAction: string | null = null;
    private mobileAuthToken: string | null = null;
    private mobileCheckUrl: string | null = null;
    private mobileWillExpire: string | null = null;
    private mobileMultiOptionURI: string | null = null;

    constructor() {
        this.jar = new CookieJar();
        this.client = wrapper(axios.create({
            jar: this.jar,
            maxRedirects: 15,
            validateStatus: () => true,
            httpsAgent: undefined,
        }));
    }

    /**
     * Step 1: Follow gateway → SSO → Certilia login form.
     */
    async initiate(): Promise<CertiliaLoginFormData> {
        const gatewayUrl = `${config.cezih.baseUrl}/services-router/gateway`;
        console.log('[CertiliaAuth] Step 1: Following gateway redirect chain...');

        const response = await this.client.get(gatewayUrl);
        if (response.status !== 200) {
            throw new Error(`Unexpected response from gateway chain: ${response.status}`);
        }

        const body = typeof response.data === 'string' ? response.data : '';
        const finalUrl = response.request?.res?.responseUrl || '';
        console.log('[CertiliaAuth] Landed on:', finalUrl.substring(0, 80) + '...');

        try {
            this.certiliaBaseUrl = new URL(finalUrl).origin;
        } catch {
            this.certiliaBaseUrl = 'https://idp.test.certilia.com';
        }

        const actionMatch = body.match(/action="([^"]+)"/);
        if (!actionMatch) throw new Error('Could not find login form action URL');

        let formActionUrl = actionMatch[1];
        try {
            formActionUrl = new URL(formActionUrl, finalUrl).href;
        } catch {
            if (formActionUrl.startsWith('/')) {
                formActionUrl = `${this.certiliaBaseUrl}${formActionUrl}`;
            }
        }

        const sessionDataKeyMatch = finalUrl.match(/sessionDataKey=([^&]+)/);
        if (!sessionDataKeyMatch) throw new Error('Could not find sessionDataKey');

        this.formData = {
            formActionUrl,
            sessionDataKey: decodeURIComponent(sessionDataKeyMatch[1]),
            ready: true,
        };

        console.log('[CertiliaAuth] ✅ Login form ready');
        console.log('[CertiliaAuth] Action:', formActionUrl);
        console.log('[CertiliaAuth] SessionDataKey:', this.formData.sessionDataKey.substring(0, 20) + '...');

        return this.formData;
    }

    /**
     * Step 2: Submit credentials → detect mobile flow → return PENDING.
     */
    async submitCredentials(username: string, password: string): Promise<CertiliaAuthResult> {
        if (!this.formData) throw new Error('Must call initiate() first');

        console.log('[CertiliaAuth] Step 2: Submitting credentials...');

        try {
            const formParams = new URLSearchParams();
            formParams.append('usernameUserInput', username);
            formParams.append('username', username);
            formParams.append('password', password);
            formParams.append('sessionDataKey', this.formData.sessionDataKey);

            const response = await this.client.post(
                this.formData.formActionUrl,
                formParams.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    maxRedirects: 0,
                }
            );

            console.log('[CertiliaAuth] commonauth response:', response.status);

            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                const redirectUrl = response.headers.location;
                console.log('[CertiliaAuth] Redirect to:', redirectUrl.substring(0, 80));

                if (redirectUrl.includes('mobileid')) {
                    // Follow to mobileid.jsp and extract polling fields
                    const mobileResponse = await this.client.get(redirectUrl, {
                        maxRedirects: 5,
                        validateStatus: () => true,
                    });
                    const mobileBody = typeof mobileResponse.data === 'string' ? mobileResponse.data : '';
                    const mobileUrl = mobileResponse.request?.res?.responseUrl || redirectUrl;

                    // Extract ALL hidden fields from mobileid.jsp
                    const checkUrlMatch = mobileBody.match(/id="checkUserAuthURL"[^>]*value='([^']*)'/);
                    const authMatch = mobileBody.match(/id="auth"[^>]*value='([^']*)'/);
                    const sessionKeyMatch = mobileBody.match(/id="sessionDataKey"[^>]*value='([^']*)'/);
                    const willExpireMatch = mobileBody.match(/id="willExpire"[^>]*value='([^']*)'/);
                    const multiOptionMatch = mobileBody.match(/id="multiOptionURI"[^>]*value='([^']*)'/);

                    const checkUrl = checkUrlMatch?.[1];
                    const authToken = authMatch?.[1];
                    this.mobileSessionDataKey = sessionKeyMatch?.[1] || '';
                    this.mobileAuthToken = authToken || null;
                    this.mobileCheckUrl = checkUrl || null;
                    this.mobileWillExpire = willExpireMatch?.[1] || null;
                    this.mobileMultiOptionURI = multiOptionMatch?.[1] || null;

                    console.log('[CertiliaAuth] checkUserAuthURL:', checkUrl || 'NOT FOUND');
                    console.log('[CertiliaAuth] auth:', authToken?.substring(0, 30) || 'NOT FOUND');
                    console.log('[CertiliaAuth] sessionDataKey:', this.mobileSessionDataKey.substring(0, 15));

                    if (checkUrl && checkUrl !== 'null' && authToken && authToken !== 'null') {
                        this.mobilePollingUrl = checkUrl + authToken;

                        // Extract form action for final submission
                        const formActionMatch = mobileBody.match(/id="mobileIdForm"[^>]*action="([^"]*)"/);
                        this.mobileFormAction = formActionMatch
                            ? new URL(formActionMatch[1], mobileUrl).href
                            : `${this.certiliaBaseUrl}/commonauth`;

                        console.log('[CertiliaAuth] ⏳ Mobile push sent');
                        console.log('[CertiliaAuth] Polling URL:', this.mobilePollingUrl.substring(0, 60));
                        console.log('[CertiliaAuth] Form action:', this.mobileFormAction);

                        return { success: false, gatewayCookies: [], error: 'PENDING_MOBILE_APPROVAL' };
                    }

                    return { success: false, gatewayCookies: [], error: 'Mobile page missing polling data' };
                }

                // Not mobile — follow redirect chain
                return await this.followRedirectChain(redirectUrl);
            }

            // 200 = wrong credentials (returned to login page)
            if (response.status === 200) {
                const body = typeof response.data === 'string' ? response.data : '';
                if (body.includes('login.do') || body.includes('authFailure')) {
                    return { success: false, gatewayCookies: [], error: 'Neispravno korisničko ime ili lozinka.' };
                }
            }

            return { success: false, gatewayCookies: [], error: `Unexpected: ${response.status}` };
        } catch (error: any) {
            return { success: false, gatewayCookies: [], error: error.message };
        }
    }

    /**
     * Step 3: Poll checkUserAuthURL for mobile approval status.
     * Replicates the exact polling from Certilia's scripts.js:
     * - GET checkUserAuthURL+auth every 3s
     * - status "pending" (code 03/04) → still waiting
     * - status "success" → extract otpCode, submit to commonauth
     * - status "rejected" / "invalid" → fail
     */
    async checkMobileApproval(): Promise<CertiliaAuthResult> {
        if (!this.mobilePollingUrl) {
            return { success: false, gatewayCookies: [], error: 'No polling URL' };
        }

        try {
            const response = await this.client.get(this.mobilePollingUrl, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000,
                validateStatus: () => true,
            });

            // Parse JSON response
            let data: any = null;
            if (typeof response.data === 'object') {
                data = response.data;
            } else if (typeof response.data === 'string') {
                try { data = JSON.parse(response.data); } catch { }
            }

            if (!data) {
                console.log('[CertiliaAuth] Poll: non-JSON response:', String(response.data).substring(0, 100));
                return { success: false, gatewayCookies: [], error: 'PENDING_MOBILE_APPROVAL' };
            }

            console.log('[CertiliaAuth] Poll status:', data.status, data.code ? `(code: ${data.code})` : '');

            switch (data.status) {
                case 'pending':
                    return { success: false, gatewayCookies: [], error: 'PENDING_MOBILE_APPROVAL' };

                case 'success':
                    console.log('[CertiliaAuth] ✅ User approved! otpCode:', !!data.authData?.otpCode);
                    return await this.completeMobileAuth(data.authData?.otpCode || '');

                case 'rejected':
                    return { success: false, gatewayCookies: [], error: 'Zahtjev je odbijen na mobilnom uređaju.' };

                case 'invalid':
                    return { success: false, gatewayCookies: [], error: 'Zahtjev je istekao. Pokušajte ponovo.' };

                default:
                    console.log('[CertiliaAuth] Unknown status:', data.status);
                    return { success: false, gatewayCookies: [], error: 'PENDING_MOBILE_APPROVAL' };
            }
        } catch (error: any) {
            console.log('[CertiliaAuth] Poll error:', error.message);
            return { success: false, gatewayCookies: [], error: 'PENDING_MOBILE_APPROVAL' };
        }
    }

    /**
     * Complete auth after mobile approval.
     * Submits otpCode to commonauth → follows redirects → gateway.
     */
    private async completeMobileAuth(otpCode: string): Promise<CertiliaAuthResult> {
        const formAction = this.mobileFormAction || `${this.certiliaBaseUrl}/commonauth`;
        const sessionKey = this.mobileSessionDataKey || '';

        console.log('[CertiliaAuth] Completing: POST to', formAction.substring(0, 60));

        try {
            // Include ALL form fields from mobileid.jsp (same as scripts.js form submit)
            const params = new URLSearchParams();
            params.append('sessionDataKey', sessionKey);
            params.append('otpCode', otpCode);
            if (this.mobileAuthToken) params.append('auth', this.mobileAuthToken);
            if (this.mobileCheckUrl) params.append('checkUserAuthURL', this.mobileCheckUrl);
            if (this.mobileWillExpire) params.append('willExpire', this.mobileWillExpire);
            if (this.mobileMultiOptionURI && this.mobileMultiOptionURI !== 'null') {
                params.append('multiOptionURI', this.mobileMultiOptionURI);
            }
            params.append('retry', 'false');

            console.log('[CertiliaAuth] Form fields:', [...params.keys()].join(', '));

            const response = await this.client.post(formAction, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 20,
            });

            const finalUrl = response.request?.res?.responseUrl || '';
            const finalBody = typeof response.data === 'string' ? response.data : '';
            console.log('[CertiliaAuth] Final URL:', finalUrl.substring(0, 80));

            if (finalUrl.includes('certws2.cezih.hr')) {
                return this.extractGatewaySession('Authentication complete!');
            }

            if (finalBody.includes('Prijava na sustav') || finalBody.includes('kc-form-login')) {
                return await this.handleSSOConfirmation(finalBody);
            }

            return { success: false, gatewayCookies: [], error: `Auth ended at: ${finalUrl.substring(0, 100)}` };
        } catch (error: any) {
            return { success: false, gatewayCookies: [], error: error.message };
        }
    }

    /**
     * Follow redirect chain through SSO back to gateway.
     */
    private async followRedirectChain(startUrl: string): Promise<CertiliaAuthResult> {
        console.log('[CertiliaAuth] Following redirects from:', startUrl.substring(0, 80));

        try {
            const response = await this.client.get(startUrl, { maxRedirects: 20 });
            const finalUrl = response.request?.res?.responseUrl || '';
            const body = typeof response.data === 'string' ? response.data : '';

            if (finalUrl.includes('certws2.cezih.hr')) {
                return this.extractGatewaySession('Reached gateway!');
            }

            if (body.includes('Prijava na sustav') || body.includes('kc-form-login')) {
                return await this.handleSSOConfirmation(body);
            }

            return { success: false, gatewayCookies: [], error: `Chain ended at: ${finalUrl.substring(0, 100)}` };
        } catch (error: any) {
            return { success: false, gatewayCookies: [], error: error.message };
        }
    }

    private async extractGatewaySession(msg: string): Promise<CertiliaAuthResult> {
        console.log(`[CertiliaAuth] ✅ ${msg}`);
        const cookies = await this.jar.getCookies(`${config.cezih.baseUrl}`);
        const cookieStrings = cookies.map(c => `${c.key}=${c.value}`);
        const session = cookies.find(c => c.key.includes('mod_auth_openidc_session'));
        return { success: true, gatewayCookies: cookieStrings, sessionToken: session?.value };
    }

    private async handleSSOConfirmation(body: string): Promise<CertiliaAuthResult> {
        console.log('[CertiliaAuth] ⏳ SSO confirmation page...');
        const action = body.match(/action="([^"]+)"/);
        if (action) {
            const r = await this.client.post(action[1].replace(/&amp;/g, '&'), '', {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 20,
            });
            const url = r.request?.res?.responseUrl || '';
            if (url.includes('certws2.cezih.hr')) {
                return this.extractGatewaySession('Gateway after SSO confirmation!');
            }
        }
        return { success: false, gatewayCookies: [], error: 'SSO confirmation failed.' };
    }

    getCookieJar(): CookieJar { return this.jar; }
}
