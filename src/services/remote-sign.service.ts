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

    constructor() {
        this.httpClient = axios.create({
            baseURL: config.cezih.baseUrl,
            timeout: 30000,
        });
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

        try {
            const response = await this.httpClient.post<RemoteSignResponse>(
                '/api/remoteSign',
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json',
                        'mod_auth_openid_session': userToken,
                    },
                }
            );

            console.log(`[RemoteSign] ✅ Submitted! Transaction: ${response.data.transactionCode}`);
            console.log(`[RemoteSign] 📱 Čeka se odobrenje na mobitelu...`);

            return response.data;
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.errorDescription
                || error.response?.data?.message
                || error.message;
            console.error(`[RemoteSign] ❌ Submit failed: ${errMsg}`);
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
        recipientHzzoCode: string
    ): Promise<boolean> {
        try {
            const now = new Date();
            const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

            const params = new URLSearchParams({
                recipient: `http://fhir.cezih.hr/specifikacije/identifikatori/HZZO-sifra-zdravstvene-organizacije|${recipientHzzoCode}`,
                recipient_type: 'organization',
                date_from: fiveMinAgo.toISOString(),
            });

            const response = await this.httpClient.get<CezihNotification[]>(
                `/API/notificationService/getNotifications?${params.toString()}`,
                {
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const notifications = response.data || [];

            // Look for FULLY_SIGNED notification matching our transaction
            for (const notif of notifications) {
                if (notif.operation === 'FULLY_SIGNED') {
                    try {
                        const resource = typeof notif.resource === 'string'
                            ? JSON.parse(notif.resource)
                            : notif.resource;
                        if (resource.transactionCode === transactionCode) {
                            console.log(`[RemoteSign] ✅ Potpis odobren! (notification: ${notif.uuid})`);
                            return true;
                        }
                    } catch (e) {
                        // resource might not be parseable, skip
                    }
                }
            }

            return false;
        } catch (error: any) {
            console.warn(`[RemoteSign] Notification poll error: ${error.message}`);
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

        try {
            const response = await this.httpClient.get<GetSignedDocumentsResponse>(
                `/api/getSignedDocuments`,
                {
                    params: { transactionId: transactionCode },
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json',
                        'mod_auth_openid_session': userToken,
                    },
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
