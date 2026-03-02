/**
 * CEZIH Remote Signing Service (Udaljeni potpis)
 * 
 * Implements the CEZIH Remote Signing flow:
 * 1. Submit documents for remote signing → POST /api/remoteSign
 * 2. Wait for user to approve on mobile (Certilia mobileID push)
 * 3. Poll notifications for FULLY_SIGNED status
 * 4. Fetch signed documents → GET /api/getSignedDocuments
 * 
 * Docs: https://simplifier.net/guide/cezih-osnova/Početna/Zajednički-slučajevi-korištenja/Udaljeni-potpis
 */
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { authService } from './auth.service';

// ============================================================
// Types
// ============================================================

export type DocumentType = 'FHIR_MESSAGE' | 'FHIR_DOCUMENT' | 'HL7_V3' | 'HL7_CDA' | 'WS_SECURITY';
export type MimeType = 'JSON' | 'XML';

export interface RemoteSignDocument {
    documentType: DocumentType;
    mimeType: MimeType;
    base64Document: string;
    messageId: string;
    referenceElementId?: string;  // Required for HL7_V3 and WS_SECURITY
}

export interface RemoteSignRequest {
    documents: RemoteSignDocument[];
    oib: string;
    sourceSystem: string;
    requestId: string;
}

export interface RemoteSignResponse {
    transactionCode: string;
    oib: string;
    documents: number;
}

export interface SignedDocument {
    messageId: string;
    mimeType: MimeType;
    documentType: DocumentType;
    base64Document: string;
}

export interface GetSignedDocumentsResponse {
    transactionCode: string;
    requestId: string;
    signatureStatus: 'FULLY_SIGNED' | 'PARTIALLY_SIGNED' | 'REJECTED' | 'EXPIRED' | 'ERROR';
    errorCode: string | null;
    signedDocuments: SignedDocument[];
}

export interface CezihNotification {
    uuid: string;
    timestamp: string;
    operation: string;
    resource: string;
    subscription?: string;
    status: 'ACTIVE' | 'CLOSED';
    recipient?: string;
    recipient_type?: string;
}

// ============================================================
// Remote Sign Service
// ============================================================

class RemoteSignService {
    private httpClient: AxiosInstance;

    // The external signer base URL
    // Confirmed working: https://certws2.cezih.hr:8443/services-router/gateway/extsigner/api/sign
    // Uses certws2 gateway + gateway session cookies (probe verified 2026-03-01)
    private get baseSignUrl(): string {
        return config.remoteSigning.remoteSignUrl;
    }

    constructor() {
        this.httpClient = axios.create({
            timeout: 30000,
        });
    }

    /**
     * Build combined headers: gateway session cookies (required for certws2 extsigner).
     */
    private buildHeaders(userToken: string): Record<string, string> {
        const gatewayHeaders = authService.hasGatewaySession()
            ? authService.getGatewayAuthHeaders()
            : {};

        return {
            'Content-Type': 'application/json',
            ...(gatewayHeaders.Cookie ? { Cookie: gatewayHeaders.Cookie } : {
                'Authorization': `Bearer ${userToken}`,
            }),
        };
    }

    /**
     * Step 1: Submit documents for remote signing.
     * CEZIH forwards to Certilia ePotpis, which sends a push notification
     * to the user's mobile device for signature approval.
     */
    async submitForRemoteSigning(
        documents: RemoteSignDocument[],
        oib: string,
        userToken: string,
        sourceSystem: string = 'DEV'
    ): Promise<RemoteSignResponse> {
        const requestId = uuidv4();

        const payload: RemoteSignRequest = {
            documents,
            oib,
            sourceSystem,
            requestId,
        };

        console.log(`[RemoteSign] Submitting ${documents.length} document(s) for remote signing...`);
        console.log(`[RemoteSign] OIB: ${oib}, RequestID: ${requestId}`);
        console.log(`[RemoteSign] Payload:`, JSON.stringify(payload, null, 2).substring(0, 800));

        const url = this.baseSignUrl;
        console.log(`[RemoteSign] POST ${url}`);

        try {
            const response = await this.httpClient.post<RemoteSignResponse>(
                url,
                payload,
                { headers: this.buildHeaders(userToken) }
            );

            console.log(`[RemoteSign] ✅ Submitted! Transaction: ${response.data.transactionCode}`);
            console.log(`[RemoteSign] 📱 Čeka se odobrenje na mobitelu...`);

            return response.data;
        } catch (error: any) {
            const responseData = error.response?.data;
            const errMsg = responseData?.error?.errorDescription
                || responseData?.message
                || responseData?.detail
                || (typeof responseData === 'string' ? responseData.substring(0, 200) : null)
                || error.message;
            console.error(`[RemoteSign] ❌ Submit failed (${error.response?.status}): ${errMsg}`);
            console.error(`[RemoteSign] URL: ${url}`);
            console.error(`[RemoteSign] Full response body:`, JSON.stringify(responseData, null, 2));
            throw new Error(`Remote signing submission failed: ${errMsg}`);
        }
    }

    /**
     * Step 2: Poll notifications to check if documents have been signed.
     * Uses the CEZIH Pull Notification API.
     */
    async pollForSignatureNotification(
        transactionCode: string,
        userToken: string,
        _recipientHzzoCode: string
    ): Promise<boolean> {
        try {
            // Notification endpoint is not available on this gateway.
            // Instead, poll getSignedDocuments directly — it returns signatureStatus.
            const result = await this.getSignedDocuments(transactionCode, userToken);
            if (result.signatureStatus === 'FULLY_SIGNED') {
                console.log(`[RemoteSign] ✅ Potpis detektiran via getSignedDocuments!`);
                return true;
            }
            console.log(`[RemoteSign] ⏳ Signature status: ${result.signatureStatus}`);
            return false;
        } catch (error: any) {
            // 404 or 4XX = document not yet signed, keep polling
            if (error.response?.status === 404 || error.response?.status === 400) {
                return false;
            }
            console.warn(`[RemoteSign] Poll error: ${error.message}`);
            return false;
        }
    }


    /**
     * Step 3: Fetch the signed documents after receiving FULLY_SIGNED notification.
     */
    async getSignedDocuments(
        transactionCode: string,
        userToken: string
    ): Promise<GetSignedDocumentsResponse> {
        console.log(`[RemoteSign] Dohvaćanje potpisanih dokumenata (tx: ${transactionCode})...`);

        const url = this.baseSignUrl.replace('/api/sign', '/api/getSignedDocuments');
        console.log(`[RemoteSign] GET ${url}`);


        try {
            const response = await this.httpClient.get<GetSignedDocumentsResponse>(
                url,
                {
                    params: { transactionId: transactionCode },
                    headers: this.buildHeaders(userToken),
                }
            );

            const result = response.data;

            if (result.signatureStatus === 'FULLY_SIGNED') {
                console.log(`[RemoteSign] ✅ ${result.signedDocuments.length} dokument(a) potpisano!`);
            } else {
                console.log(`[RemoteSign] ⚠️ Status potpisa: ${result.signatureStatus}`);
            }

            return result;
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.errorDescription || error.message;
            console.error(`[RemoteSign] ❌ Failed to fetch signed documents: ${errMsg}`);
            throw new Error(`Failed to fetch signed documents: ${errMsg}`);
        }
    }

    /**
     * Full flow: Submit → Wait → Fetch signed documents.
     * This is the main method Gx apps would call.
     * 
     * @param timeoutMs - How long to wait for mobile approval (default: 2 minutes)
     * @param pollIntervalMs - How often to check for notifications (default: 3 seconds)
     */
    async signAndWait(
        documents: RemoteSignDocument[],
        oib: string,
        userToken: string,
        options: {
            sourceSystem?: string;
            timeoutMs?: number;
            pollIntervalMs?: number;
            recipientHzzoCode?: string;
        } = {}
    ): Promise<GetSignedDocumentsResponse> {
        const {
            sourceSystem = 'DEV',
            timeoutMs = 120_000,      // 2 minutes
            pollIntervalMs = 3_000,   // 3 seconds
            recipientHzzoCode = config.organization.hzzoCode,
        } = options;

        // Step 1: Submit
        const submitResult = await this.submitForRemoteSigning(
            documents, oib, userToken, sourceSystem
        );

        // Step 2: Wait for approval (polling)
        const startTime = Date.now();
        let signed = false;

        console.log(`[RemoteSign] ⏳ Čekanje odobrenja (timeout: ${timeoutMs / 1000}s)...`);
        console.log(`[RemoteSign] 📱 Otvorite Certilia mobileID aplikaciju na telefonu i odobrite potpis.`);

        while (Date.now() - startTime < timeoutMs) {
            await this.sleep(pollIntervalMs);

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            process.stdout.write(`\r[RemoteSign] ⏳ Čekanje... ${elapsed}s`);

            signed = await this.pollForSignatureNotification(
                submitResult.transactionCode, userToken, recipientHzzoCode
            );

            if (signed) break;
        }

        console.log(''); // New line after progress

        if (!signed) {
            // Even if polling didn't find the notification, try fetching directly
            // (the notification might have been missed)
            console.log('[RemoteSign] ⚠️ Timeout dosegnut, pokušavam direktan dohvat...');
        }

        // Step 3: Fetch signed documents
        const result = await this.getSignedDocuments(
            submitResult.transactionCode, userToken
        );

        if (result.signatureStatus !== 'FULLY_SIGNED') {
            throw new Error(
                `Potpis nije uspješan. Status: ${result.signatureStatus}` +
                (result.errorCode ? `, Error: ${result.errorCode}` : '')
            );
        }

        return result;
    }

    /**
     * Helper: Prepare a FHIR Message Bundle for remote signing.
     */
    prepareFhirMessageDocument(bundle: any, messageId?: string): RemoteSignDocument {
        const base64Document = Buffer.from(
            JSON.stringify(bundle), 'utf-8'
        ).toString('base64');

        return {
            documentType: 'FHIR_MESSAGE',
            mimeType: 'JSON',
            base64Document,
            messageId: messageId || uuidv4(),
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const remoteSignService = new RemoteSignService();
