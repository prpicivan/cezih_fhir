/**
 * Smart Card Gateway Auth Service — TC1
 *
 * CEZIH gateway auth flow:
 *   - Without client cert → gateway sends 302 redirect to Certilia OIDC
 *   - With test client cert (OU=IdentificationTest) → gateway sends 401 (cert not in CEZIH trust list)
 *
 * Current test environment situation:
 *   - CEZIH test cert (`OU=IdentificationTest`) is NOT in the CEZIH gateway CA trust list
 *   - The cert IS in Windows store (HasPrivateKey=True), TLS handshake succeeds but HTTP 401 returned
 *   - Production environment: real AKD/NIAS qualified identity certs would be accepted
 *
 * TC1 implementation strategy:
 *   1. TRY with client cert (Windows cert store) → if 302 or 200 with session → success
 *   2. If 401 → fallback to Certilia OIDC flow (the same gateway redirects to Certilia for password auth)
 *   3. Return auth status and cookies
 *
 * The backend uses PowerShell .NET HttpClient for TLS client cert auth (PKCS#11 DLL is
 * locked by VPN, Windows KSP is accessible in parallel via Schannel).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { authService } from './auth.service';
import { CertiliaAuthClient } from './certilia-auth.service';

const execFileAsync = promisify(execFile);

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────

export interface SmartCardAuthResult {
    success: boolean;
    cookies?: string[];
    sessionToken?: string;
    method?: 'tls-cert' | 'oidc';
    error?: string;
}

// ──────────────────────────────────────────────────────
// Attempt TLS client cert auth via Windows cert store
// ──────────────────────────────────────────────────────

interface PsAuthResult {
    success: boolean;
    statusCode?: number;
    cookies?: string[];
    location?: string;
    certSubject?: string;
    certThumbprint?: string;
    error?: string;
}

async function tryTlsCertAuth(): Promise<{ psResult: PsAuthResult; thumbprint: string | null }> {
    console.log('[SmartCardAuth] Attempting TLS client cert auth via Windows cert store...');

    // Auto-detect IDEN thumbprint
    const thumbprint = process.env.IDEN_THUMBPRINT || null;
    const psScriptPath = path.join(process.cwd(), 'scripts', 'smartcard-auth.ps1');

    const psArgs = [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', psScriptPath,
    ];
    if (thumbprint) {
        psArgs.push('-Thumbprint', thumbprint);
    }

    try {
        const { stdout, stderr } = await execFileAsync('powershell', psArgs, {
            timeout: 30000,
            maxBuffer: 1024 * 256,
            windowsHide: true,
        });

        if (stderr) console.log('[SmartCardAuth] PS stderr:', stderr.substring(0, 200));

        const jsonLine = stdout.split('\n').find(l => l.trim().startsWith('{'));
        if (!jsonLine) {
            return { psResult: { success: false, error: 'No JSON from PS script' }, thumbprint };
        }

        const psResult: PsAuthResult = JSON.parse(jsonLine.trim());
        console.log(`[SmartCardAuth] TLS result: status=${psResult.statusCode}, cookies=${psResult.cookies?.length || 0}, cert=${psResult.certThumbprint?.substring(0, 8)}...`);
        return { psResult, thumbprint: psResult.certThumbprint || thumbprint };
    } catch (err: any) {
        console.error('[SmartCardAuth] PS script error:', err.message);
        return {
            psResult: { success: false, error: err.message },
            thumbprint,
        };
    }
}

// ──────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────

class SmartCardGatewayAuthService {
    async authenticate(): Promise<SmartCardAuthResult> {
        console.log('[SmartCardAuth] TC1: Starting smart card authentication...');

        // Step 1: Try TLS client cert auth
        const { psResult, thumbprint } = await tryTlsCertAuth();

        if (psResult.statusCode === 302 || psResult.statusCode === 200) {
            // TLS cert auth worked — gateway accepted the cert and gave us a session
            const cookies = psResult.cookies || [];
            const sessionToken = cookies.find(c => c.includes('mod_auth_openidc'))?.split('=').slice(1).join('=');
            authService.storeGatewaySession(cookies, sessionToken);
            console.log('[SmartCardAuth] ✅ TLS cert auth SUCCESS! Cookies:', cookies.length);
            return { success: true, cookies, sessionToken, method: 'tls-cert' };
        }

        if (psResult.statusCode === 401) {
            // Cert found but not in CEZIH trust store — test env limitation
            // Log informative message
            console.warn('[SmartCardAuth] TLS cert auth returned 401 — cert not in CEZIH CA trust list.');
            console.warn('[SmartCardAuth] Cert:', psResult.certSubject);
            console.warn('[SmartCardAuth] In test environment, Certilia test certs (OU=*Test) require OIDC flow.');

            return {
                success: false,
                error: `Certifikat pronađen (${psResult.certSubject?.split(',')[0]}) ali CEZIH gateway ga je odbio (HTTP 401). ` +
                    'U testnom okruženju, TLS autentifikacija s Certilia test certifikatom nije podržana. ' +
                    'Molimo koristite Certilia prijavu za testiranje.'
            };
        }

        if (!psResult.certSubject) {
            return {
                success: false,
                error: 'Certifikat pametne kartice nije pronađen u Windows cert storeu. ' +
                    'Provjerite je li kartica u čitaču i jesu li certifikati instalirani.'
            };
        }

        return {
            success: false,
            error: psResult.error || `Neuspješna autentifikacija (status: ${psResult.statusCode})`
        };
    }
}

export const smartCardGatewayAuthService = new SmartCardGatewayAuthService();
