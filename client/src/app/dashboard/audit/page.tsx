'use client';

import { useState, useEffect } from 'react';
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
    ClipboardList
} from 'lucide-react';

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLog, setSelectedLog] = useState<any>(null);

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

    const filteredLogs = logs.filter(log =>
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.visitId && log.visitId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.error_msg && log.error_msg.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString('hr-HR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
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
                        placeholder="Pretraži po akciji, visitID ili grešci..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Logs Table */}
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
                    <div className="overflow-y-auto flex-1">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Vrijeme</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Akcija</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Smjer</th>
                                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Akcije</th>
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
                                            className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedLog?.id === log.id ? 'bg-blue-50/50' : ''}`}
                                            onClick={() => setSelectedLog(log)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-slate-500">
                                                {formatDate(log.timestamp)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-slate-800">{log.action}</div>
                                                {log.visitId && <div className="text-[10px] text-slate-400 font-mono">Visit: {log.visitId.substring(0, 8)}...</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {getStatusBadge(log.status)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${log.direction === 'OUTGOING' ? 'text-blue-600 bg-blue-50' : 'text-purple-600 bg-purple-50'}`}>
                                                    {log.direction === 'OUTGOING' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                                                    {log.direction}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button className="text-blue-600 hover:text-blue-900">
                                                    <Eye className="w-4 h-4" />
                                                </button>
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
                            <span className="text-[10px] font-mono text-slate-400">{selectedLog.id.substring(0, 8)}</span>
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
                                    FHIR Request (MHD/Bundle)
                                    <span className="text-blue-500">JSON</span>
                                </label>
                                <pre className="bg-slate-900 text-blue-300 p-4 rounded-lg text-xs overflow-x-auto font-mono max-h-[300px]">
                                    {selectedLog.payload_req || '// Nema podataka'}
                                </pre>
                            </div>

                            {/* Response Payload */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
                                    CEZIH Response
                                    <span className="text-emerald-500">JSON</span>
                                </label>
                                <pre className="bg-slate-900 text-emerald-300 p-4 rounded-lg text-xs overflow-x-auto font-mono max-h-[300px]">
                                    {selectedLog.payload_res || '// Čekam odgovor...'}
                                </pre>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mb-4">
                                    <Clock className="w-3 h-3" />
                                    Zabilježeno: {formatDate(selectedLog.timestamp)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
