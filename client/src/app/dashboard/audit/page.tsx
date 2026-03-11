'use client';

import React, { useState, useEffect } from 'react';
import {
    Search,
    ShieldCheck,
    ArrowUpRight,
    ArrowDownLeft,
    CheckCircle2,
    XCircle,
    Eye,
    Code,
    Clock,
    ClipboardList,
    Download,
    Copy,
    Check,
    ChevronRight,
    ChevronDown
} from 'lucide-react';

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLog, setSelectedLog] = useState<any>(null);

    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/audit/logs?limit=100');
            const data = await res.json();
            if (data.success) {
                setLogs(data.logs);
            }
        } catch (err) {
            console.error('Failed to fetch logs', err);
        } finally {
            setLoading(false);
        }
    };

    const getOidFromSearch = (term: string) => {
        const clean = term.trim().toLowerCase();
        let oidPart = clean;
        if (oidPart.startsWith('urn:oid:')) oidPart = oidPart.substring(8);
        if (oidPart.startsWith('oru:')) oidPart = oidPart.substring(4).trim();
        const match = oidPart.match(/2\.16\.[0-9.]+/);
        return match ? match[0] : '';
    };

    const filteredLogs = logs.filter(log => {
        const searchLower = searchTerm.toLowerCase().trim();
        if (!searchLower) return true;

        const oid = getOidFromSearch(searchTerm);

        // If it's an OID search, check identifiers and payloads
        if (oid) {
            return (
                (log.id && log.id.includes(oid)) ||
                (log.payload_req && log.payload_req.includes(oid)) ||
                (log.payload_res && log.payload_res.includes(oid)) ||
                (log.patientMbo && log.patientMbo.includes(oid))
            );
        }

        // Regular search
        return (
            log.action.toLowerCase().includes(searchLower) ||
            (log.visitId && log.visitId.toLowerCase().includes(searchLower)) ||
            (log.error_msg && log.error_msg.toLowerCase().includes(searchLower)) ||
            (log.firstName && log.firstName.toLowerCase().includes(searchLower)) ||
            (log.lastName && log.lastName.toLowerCase().includes(searchLower)) ||
            (log.oib && log.oib.toLowerCase().includes(searchLower)) ||
            (log.patientMbo && log.patientMbo.toLowerCase().includes(searchLower))
        );
    });

    const getStatusBadge = (status: string) => {
        if (status === 'SUCCESS') {
            return (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    USPJEŠNO
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                <XCircle className="w-3 h-3" />
                GREŠKA
            </span>
        );
    };

    const getDirectionBadge = (direction: string) => {
        // G9 → Middleware (incoming to MW from G9)
        if (direction === 'INCOMING_G9') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border text-purple-700 bg-purple-50 border-purple-200">
                    <ArrowDownLeft className="w-3 h-3" />
                    ← G9
                </span>
            );
        }
        // Middleware → CEZIH (outgoing from MW to CEZIH)
        if (direction === 'OUTGOING_CEZIH' || direction === 'OUTGOING') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border text-blue-700 bg-blue-50 border-blue-200">
                    <ArrowUpRight className="w-3 h-3" />
                    → CEZIH
                </span>
            );
        }
        // CEZIH → Middleware (incoming to MW from CEZIH) — reserved for VPN
        if (direction === 'INCOMING_CEZIH') {
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border text-emerald-700 bg-emerald-50 border-emerald-200">
                    <ArrowDownLeft className="w-3 h-3" />
                    ← CEZIH
                </span>
            );
        }
        // Legacy fallback for old generic rows
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border text-slate-600 bg-slate-50 border-slate-200">
                <ArrowDownLeft className="w-3 h-3" />
                {direction}
            </span>
        );
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const date = d.toLocaleDateString('hr-HR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const time = d.toLocaleTimeString('hr-HR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return { date, time };
    };

    const exportLog = () => {
        if (!selectedLog) return;

        const exportData = {
            id: selectedLog.id,
            timestamp: selectedLog.timestamp,
            action: selectedLog.action,
            direction: selectedLog.direction,
            status: selectedLog.status,
            request: selectedLog.payload_req ? JSON.parse(selectedLog.payload_req) : null,
            response: selectedLog.payload_res ? JSON.parse(selectedLog.payload_res) : null,
            error: selectedLog.error_msg
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_${selectedLog.action}_${selectedLog.id.substring(0, 8)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-blue-600" />
                        Praćenje statusa
                    </h1>
                    <p className="text-slate-600">Središnji pregled tehničke telemetrije i CEZIH FHIR komunikacije</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                    Osvježi
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Pretraži po pacijentu, MBO, OIB, akciji ili grešci..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Logs Table */}
                <div className="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
                    <div className="overflow-y-auto flex-1">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-12"></th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Vrijeme</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Pacijent</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Identifikatori</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Akcija</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Smjer</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Učitavanje...</td>
                                    </tr>
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Nema pronađenih zapisa.</td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr
                                            key={log.id}
                                            className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedLog?.id === log.id ? 'bg-blue-50/10 border-l-2 border-l-blue-500' : ''}`}
                                            onClick={() => setSelectedLog(log)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div 
                                                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${selectedLog?.id === log.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300 hover:border-blue-300'}`}
                                                >
                                                    {selectedLog?.id === log.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                </div>
                                            </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-bold text-slate-700">
                                                        {formatDate(log.timestamp).date}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono">
                                                        {formatDate(log.timestamp).time}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-bold text-slate-900">
                                                        {log.firstName ? `${log.firstName} ${log.lastName}` : <span className="text-slate-400 italic font-normal">Sustavna akcija</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {log.patientMbo ? (
                                                        <div className="text-[10px] font-mono text-slate-500">
                                                            MBO: {log.patientMbo} <br /> OIB: {log.oib || '---'}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300">---</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-bold text-slate-800">{log.action}</div>
                                                    {log.visitId && <div className="text-[10px] text-slate-400 font-mono">Visit: {log.visitId.substring(0, 8)}...</div>}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {getStatusBadge(log.status)}
                                                </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right flex items-center justify-end gap-3">
                                                {getDirectionBadge(log.direction)}
                                                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${selectedLog?.id === log.id ? 'rotate-90 text-blue-500' : ''}`} />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Inspector Panel */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <div className="font-bold text-slate-700 flex items-center gap-2">
                            <Code className="w-4 h-4 text-blue-500" />
                            Inspector
                        </div>
                        {selectedLog && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => copyToClipboard(JSON.stringify({
                                        request: selectedLog.payload_req ? JSON.parse(selectedLog.payload_req) : null,
                                        response: selectedLog.payload_res ? JSON.parse(selectedLog.payload_res) : null
                                    }, null, 2))}
                                    className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-500 flex items-center gap-1 text-[10px]"
                                    title="Kopiraj sve"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                    Kopiraj
                                </button>
                                <button
                                    onClick={exportLog}
                                    className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-500 flex items-center gap-1 text-[10px]"
                                    title="Preuzmi JSON"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Izvezi
                                </button>
                                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                                <span className="text-[10px] font-mono text-slate-400">{selectedLog.id.substring(0, 8)}</span>
                            </div>
                        )}
                    </div>

                    {!selectedLog ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-4">
                            <ClipboardList className="w-12 h-12 opacity-20" />
                            <p className="text-sm">Odaberite zapis u tablici za pregled detalja FHIR poruke</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Error Alert */}
                            {selectedLog.error_msg && (
                                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg flex gap-3">
                                    <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                                    <div className="text-xs text-rose-700 font-medium">
                                        <div className="font-bold mb-1 uppercase">Tehnička greška</div>
                                        {selectedLog.error_msg}
                                    </div>
                                </div>
                            )}

                            {/* Request Payload */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
                                    {selectedLog.direction === 'INCOMING_G9' ? (
                                        <span className="text-purple-600">← G9 zahtjev</span>
                                    ) : selectedLog.direction === 'INCOMING_CEZIH' ? (
                                        <span className="text-blue-600">← CEZIH dolazak</span>
                                    ) : (
                                        'FHIR Request (MHD/Bundle)'
                                    )}
                                    <span className="text-slate-400">JSON</span>
                                </label>
                                <pre className={`bg-slate-900 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-[400px] ${selectedLog.direction === 'INCOMING_G9' ? 'text-purple-300' :
                                    selectedLog.direction === 'INCOMING_CEZIH' ? 'text-blue-300' :
                                        'text-blue-300'
                                    }`}>
                                    {selectedLog.payload_req || '// Nema podataka'}
                                </pre>
                            </div>

                            {/* Response Payload */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
                                    {selectedLog.direction === 'INCOMING_G9' ? 'Odgovor prema G9' : 'CEZIH Response'}
                                    <span className="text-emerald-500">JSON</span>
                                </label>
                                <pre className="bg-slate-900 text-emerald-300 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-[400px]">
                                    {selectedLog.payload_res || '// Čekam odgovor...'}
                                </pre>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mb-4">
                                    <Clock className="w-3 h-3" />
                                    Zabilježeno: {formatDate(selectedLog.timestamp).date} {formatDate(selectedLog.timestamp).time}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
