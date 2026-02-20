import { v4 as uuidv4 } from 'uuid';
import db from '../db/index';

export interface AuditLogEntry {
    visitId?: string;
    action: string;
    direction: 'OUTGOING' | 'INCOMING';
    status: 'SUCCESS' | 'ERROR';
    payload_req?: any;
    payload_res?: any;
    error_msg?: string;
}

export class AuditService {
    private static instance: AuditService;

    private constructor() { }

    public static getInstance(): AuditService {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    }

    public async log(entry: AuditLogEntry): Promise<void> {
        try {
            const id = uuidv4();
            const timestamp = new Date().toISOString();

            const reqStr = entry.payload_req ? JSON.stringify(entry.payload_req, null, 2) : null;
            const resStr = entry.payload_res ? JSON.stringify(entry.payload_res, null, 2) : null;

            const sql = `
                INSERT INTO audit_logs (
                    id, visitId, action, direction, status, 
                    payload_req, payload_res, error_msg, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.prepare(sql).run(
                id,
                entry.visitId || null,
                entry.action,
                entry.direction,
                entry.status,
                reqStr,
                resStr,
                entry.error_msg || null,
                timestamp
            );

            console.log(`[AuditLog] ${entry.action} - ${entry.status}`);
        } catch (error) {
            console.error('Failed to write audit log', error);
        }
    }

    public getLogsByVisit(visitId: string): any[] {
        return db.prepare('SELECT * FROM audit_logs WHERE visitId = ? ORDER BY timestamp DESC').all(visitId);
    }

    public getAllLogs(limit: number = 100): any[] {
        return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
    }
}

export const auditService = AuditService.getInstance();
