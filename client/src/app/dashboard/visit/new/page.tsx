'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    User, Activity, FileText, Send, Save, XCircle, CheckCircle,
    AlertTriangle, Clock, Calendar, ArrowLeft, Info, Eye, Code,
    ChevronRight, CheckCircle2, ShieldCheck, Database,
    ArrowUpRight, ArrowDownLeft
} from 'lucide-react';

function ClinicalWorkspace() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const patientId = searchParams.get('patientId');
    const mbo = searchParams.get('mbo');
    const patientMbo = searchParams.get('patientMbo');
    const caseIdParam = searchParams.get('caseId');

    // Final effective identifiers
    const effectiveMbo = patientMbo || mbo;

    const [visitStatus, setVisitStatus] = useState<'idle' | 'active' | 'finished'>('idle');
    const [visitId, setVisitId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Structured Findings State
    const [anamnesis, setAnamnesis] = useState('');
    const [physicalStatus, setPhysicalStatus] = useState('');
    const [findingText, setFindingText] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [diagnosisCode, setDiagnosisCode] = useState('');
    const [diagnosisDisplay, setDiagnosisDisplay] = useState('');
    const [diagSuggestions, setDiagSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [startDate, setStartDate] = useState<string>('');
    const [logs, setLogs] = useState<any[]>([]);
    const [visitType, setVisitType] = useState<'AMB' | 'IMP' | 'EMER'>('AMB');

    // Audit Inspection
    const [inspectionLog, setInspectionLog] = useState<any>(null);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);

    useEffect(() => {
        // Fetch initial suggestions (top 10)
        fetch('/api/terminology/diagnoses?q=')
            .then(res => res.json())
            .then(data => { if (data.success) setDiagSuggestions(data.results); });

        // Set default date to now, formatted for datetime-local input (YYYY-MM-DDTHH:mm)
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setStartDate(now.toISOString().slice(0, 16));
    }, []);

    // Poll for audit logs when visit is active
    useEffect(() => {
        if (!visitId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/audit/logs/${visitId}`);
                const data = await res.json();
                if (data.success) {
                    setLogs(data.logs);
                }
            } catch (err) {
                console.error('Audit poll failed', err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [visitId]);

    const searchDiagnoses = async (q: string) => {
        try {
            const res = await fetch(`/api/terminology/diagnoses?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (data.success) setDiagSuggestions(data.results);
        } catch (err) {
            console.error('Search failed', err);
        }
    };

    const handleDiagnosisSelect = (diag: any) => {
        setDiagnosisCode(diag.code);
        setDiagnosisDisplay(diag.display);
        setShowSuggestions(false);
    };

    const addLog = (msg: string) => { }; // Legacy no-op, we use database-backed Audit Logs

    // TC 12: Create Visit (Encounter)
    const startVisit = async () => {
        setLoading(true);
        try {
            addLog('Započinjem posjet (TC 12)...');
            const res = await fetch('/api/visit/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientMbo: effectiveMbo,
                    practitionerId: 'practitioner-1', // Mock ID
                    organizationId: 'org-1', // Mock ID
                    startDate: new Date(startDate).toISOString(),
                    class: visitType,
                    caseId: caseIdParam || undefined
                })
            });
            const data = await res.json();

            if (data.success) {
                setVisitId(data.result?.localVisitId || 'fallback-id');
                setVisitStatus('active');
                addLog('Posjet uspješno kreiran (Encounter resource).');
            } else {
                addLog(`Greška: ${data.error}`);
            }
        } catch (err: any) {
            addLog(`Greška komunikacije: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // TC 18: Send Clinical Document (MHD)
    const sendDocument = async (type: 'ambulatory-report' | 'specialist-finding' | 'discharge-letter') => {
        if (!findingText) {
            alert('Molimo unesite tekst nalaza.');
            return;
        }

        setLoading(true);
        try {
            addLog(`Šaljem dokument: ${type} (TC 18)...`);
            const res = await fetch('/api/document/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    patientMbo: effectiveMbo,
                    practitionerId: 'practitioner-1',
                    organizationId: 'org-1',
                    visitId: visitId,
                    caseId: caseIdParam || undefined,
                    title: 'Medicinski nalaz',
                    anamnesis,
                    status: physicalStatus,
                    finding: findingText,
                    recommendation,
                    diagnosisCode,
                    diagnosisDisplay,
                    date: new Date().toISOString(),
                })
            });
            const data = await res.json();

            if (data.success) {
                addLog(`Dokument uspješno poslan! OID: ${data.result.documentOid}`);
                addLog('Potpisano i arhivirano u CEZIH (MHD ITI-65).');
            } else {
                addLog(`Greška slanja: ${data.error}`);
            }
        } catch (err: any) {
            addLog(`Greška komunikacije: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // TC 14: Close Visit
    const closeVisit = async () => {
        if (!confirm('Jeste li sigurni da želite završiti posjet?')) return;

        setLoading(true);
        try {
            addLog('Zatvaram posjet (TC 14)...');
            const res = await fetch(`/api/visit/${visitId}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endDate: new Date().toISOString(),
                })
            });
            const data = await res.json();

            if (data.success) {
                setVisitStatus('finished');
                addLog('Posjet uspješno zatvoren.');
            } else {
                addLog(`Greška: ${data.error}`);
            }
        } catch (err: any) {
            addLog(`Greška komunikacije: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const updateVisit = async () => {
        if (!visitId) return;
        setLoading(true);
        try {
            addLog('Ažuriram posjet (TC 13)...');
            const res = await fetch(`/api/visit/${visitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diagnosisCode: 'Z00.0',
                    diagnosisDisplay: 'Opći medicinski pregled',
                })
            });
            const data = await res.json();

            if (data.success) {
                addLog('Posjet uspješno ažuriran (dodana dijagnoza).');
            } else {
                addLog(`Greška: ${data.error}`);
            }
        } catch (err: any) {
            addLog(`Greška komunikacije: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-slate-500" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Radni prostor liječnika</h1>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <User className="w-4 h-4" /> Pacijent MBO: <span className="font-mono font-medium text-slate-700">{effectiveMbo || 'Nepoznato'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    {visitStatus === 'idle' && (
                        <>
                            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                <input
                                    type="datetime-local"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="text-sm text-slate-700 outline-none bg-transparent font-medium"
                                />
                            </div>
                            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                                <Activity className="w-4 h-4 text-slate-400" />
                                <select
                                    value={visitType}
                                    onChange={(e) => setVisitType(e.target.value as any)}
                                    className="text-sm text-slate-700 outline-none bg-transparent font-medium"
                                >
                                    <option value="AMB">Ambulantno (AMB)</option>
                                    <option value="IMP">Bolničko (IMP)</option>
                                    <option value="EMER">Hitna (EMER)</option>
                                </select>
                            </div>
                            <button
                                onClick={startVisit}
                                disabled={loading}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
                            >
                                <Activity className="w-4 h-4" />
                                {new Date(startDate) > new Date(Date.now() + 3600000) ? 'Planiraj posjet' : 'Započni posjet (TC 12)'}
                            </button>
                        </>
                    )}

                    {visitStatus === 'active' && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-medium">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Posjet u tijeku
                        </div>
                    )}

                    {visitStatus === 'finished' && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-lg font-medium">
                            <CheckCircle className="w-4 h-4" />
                            Posjet završen
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Editor */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div className="font-semibold text-slate-700 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Klinički nalaz
                            </div>
                            <div className="text-xs text-slate-400">Autosave: Enabled</div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-white">
                            {/* Diagnosis Picker Section */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Primarna Dijagnoza (MKB-10)</label>
                                <div className="flex gap-2">
                                    <div className="relative w-32">
                                        <input
                                            type="text"
                                            placeholder="Kod"
                                            className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                                            value={diagnosisCode}
                                            onChange={(e) => {
                                                const val = e.target.value.toUpperCase();
                                                setDiagnosisCode(val);
                                                searchDiagnoses(val);
                                                setShowSuggestions(true);
                                            }}
                                            onFocus={() => setShowSuggestions(true)}
                                            disabled={visitStatus !== 'active' || loading}
                                        />
                                    </div>
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            placeholder="Pretraži po nazivu..."
                                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={diagnosisDisplay}
                                            onChange={(e) => {
                                                setDiagnosisDisplay(e.target.value);
                                                searchDiagnoses(e.target.value);
                                                setShowSuggestions(true);
                                            }}
                                            onFocus={() => setShowSuggestions(true)}
                                            disabled={visitStatus !== 'active' || loading}
                                        />

                                        {showSuggestions && diagSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                                {diagSuggestions.map((d) => (
                                                    <button
                                                        key={d.code}
                                                        className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                                                        onClick={() => handleDiagnosisSelect(d)}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-mono text-blue-600 font-bold text-xs">{d.code}</span>
                                                            <span className="text-xs text-slate-400">MKB-10</span>
                                                        </div>
                                                        <div className="text-sm text-slate-700 truncate">{d.display}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showSuggestions && diagSuggestions.length === 0 && diagnosisCode.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-4 text-center text-xs text-slate-500 italic">
                                                Nema pronađenih dijagnoza.
                                            </div>
                                        )}
                                    </div>
                                    {showSuggestions && (
                                        <button
                                            onClick={() => setShowSuggestions(false)}
                                            className="p-2 text-slate-400 hover:text-slate-600"
                                        >
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Narrative Sections */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">1. Anamneza</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Povijest bolesti i sadašnje tegobe..."
                                        value={anamnesis}
                                        onChange={(e) => setAnamnesis(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">2. Status</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Fizikalni nalaz..."
                                        value={physicalStatus}
                                        onChange={(e) => setPhysicalStatus(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">3. Nalaz i Mišljenje</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                                        placeholder="Klinički zaključak..."
                                        value={findingText}
                                        onChange={(e) => setFindingText(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">4. Preporuka i Terapija</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Plan liječenja i prepisana terapija..."
                                        value={recommendation}
                                        onChange={(e) => setRecommendation(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => sendDocument('MEDICINSKI_NALAZ' as any)}
                                    disabled={visitStatus !== 'active' || loading}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4" />
                                    Pošalji Medicinski Nalaz (TC 18)
                                </button>
                            </div>

                            {visitStatus === 'active' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={updateVisit}
                                        disabled={loading}
                                        className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Activity className="w-4 h-4" />
                                        Ažuriraj posjet (TC 13)
                                    </button>
                                    <button
                                        onClick={closeVisit}
                                        disabled={loading}
                                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Završi posjet (TC 14)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar: Lifecycle & Logs */}
                <div className="space-y-6">
                    {/* Visit Lifecycle (Visual Timeline) */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-blue-600" />
                                Životni ciklus posjeta
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">#{visitId?.substring(0, 8) || '---'}</span>
                        </div>

                        <div className="p-6">
                            <div className="space-y-8 relative">
                                {/* Vertical Line Connection */}
                                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100" />

                                {/* Stage 1: Encounter Start */}
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${visitStatus !== 'idle' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white border-slate-200 text-slate-300'}`}>
                                        <Clock className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-bold ${visitStatus !== 'idle' ? 'text-slate-900' : 'text-slate-400'}`}>U Obradi</p>
                                            {logs.find(l => l.action === 'ENCOUNTER_START') && (
                                                <button
                                                    onClick={() => { setInspectionLog(logs.find(l => l.action === 'ENCOUNTER_START')); setIsInspectorOpen(true); }}
                                                    className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                                >
                                                    <Info className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500">Započet postupak na CEZIH-u</p>
                                    </div>
                                </div>

                                {/* Stage 2: Findings Sent */}
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${logs.some(l => l.action === 'SEND_FINDING') ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-200 text-slate-300'}`}>
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-bold ${logs.some(l => l.action === 'SEND_FINDING') ? 'text-slate-900' : 'text-slate-400'}`}>Nalazi Poslani</p>
                                            {logs.filter(l => l.action === 'SEND_FINDING').length > 0 && (
                                                <div className="flex gap-1">
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                                                        {logs.filter(l => l.action === 'SEND_FINDING').length}
                                                    </span>
                                                    <button
                                                        onClick={() => { setInspectionLog(logs.find(l => l.action === 'SEND_FINDING')); setIsInspectorOpen(true); }}
                                                        className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                                    >
                                                        <Info className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500">MHD ITI-65 arhivirano u repozitorij</p>
                                    </div>
                                </div>

                                {/* Stage 3: Realization (Close) */}
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${visitStatus === 'finished' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-slate-200 text-slate-300'}`}>
                                        <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-bold ${visitStatus === 'finished' ? 'text-slate-900' : 'text-slate-400'}`}>Realizirana</p>
                                            {logs.find(l => l.action === 'REALIZATION') && (
                                                <button
                                                    onClick={() => { setInspectionLog(logs.find(l => l.action === 'REALIZATION')); setIsInspectorOpen(true); }}
                                                    className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                                >
                                                    <Info className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500">Posjet zatvoren i konačno proknjižen</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Historical Logs List */}
                    <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden flex flex-col h-64">
                        <div className="p-3 border-b border-slate-800 bg-slate-950 font-semibold flex items-center justify-between text-slate-400 text-[10px] uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                                <Database className="w-3 h-3 text-blue-400" />
                                Tehnički zapisnik
                            </div>
                            <span>{logs.length} događaja</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {logs.length === 0 && <p className="text-slate-600 italic text-[10px] text-center mt-8">Čekam događaje...</p>}
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    onClick={() => { setInspectionLog(log); setIsInspectorOpen(true); }}
                                    className="p-2 rounded bg-slate-800/50 border border-slate-800 hover:border-blue-500/50 transition-colors cursor-pointer group"
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${log.status === 'SUCCESS' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                                            {log.action}
                                        </span>
                                        <span className="text-[8px] text-slate-500 font-mono italic">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-slate-400 truncate">Status: {log.status}</span>
                                        <Eye className="w-3 h-3 text-slate-600 group-hover:text-blue-400" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Info */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm">
                        <div className="flex items-center gap-2 font-semibold mb-2">
                            <ShieldCheck className="w-4 h-4" />
                            Status Sljedivosti
                        </div>
                        <p className="text-[11px] leading-relaxed">
                            Sve FHIR transakcije su digitalno potpisane i trajno arhivirane u lokalnom audit logu za potrebe certifikacije i kontrole kvalitete.
                        </p>
                    </div>
                </div>
            </div>

            {/* JSON Inspector Modal */}
            {isInspectorOpen && inspectionLog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                                    <Code className="w-5 h-5 text-blue-600" />
                                    FHIR Inspector: {inspectionLog.action}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-mono">{inspectionLog.id}</p>
                            </div>
                            <button
                                onClick={() => setIsInspectorOpen(false)}
                                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                            >
                                <XCircle className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50">
                            {/* Request */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <ArrowUpRight className="w-3 h-3" />
                                    FHIR Request (Outgoing)
                                </label>
                                <div className="bg-slate-900 rounded-xl p-4 h-[500px] overflow-auto shadow-inner">
                                    <pre className="text-[10px] font-mono text-blue-300">
                                        {inspectionLog.payload_req ? JSON.stringify(JSON.parse(inspectionLog.payload_req), null, 2) : '// Nema podataka'}
                                    </pre>
                                </div>
                            </div>

                            {/* Response */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <ArrowDownLeft className="w-3 h-3" />
                                    CEZIH Response (Incoming)
                                </label>
                                <div className={`bg-slate-900 rounded-xl p-4 h-[500px] overflow-auto shadow-inner ${inspectionLog.status === 'ERROR' ? 'border-2 border-rose-500/30' : ''}`}>
                                    <pre className={`text-[10px] font-mono ${inspectionLog.status === 'ERROR' ? 'text-rose-300' : 'text-emerald-300'}`}>
                                        {inspectionLog.payload_res ? JSON.stringify(JSON.parse(inspectionLog.payload_res), null, 2) : '// Čekam odgovor...'}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        {inspectionLog.error_msg && (
                            <div className="p-4 bg-rose-600 text-white flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                <div className="text-sm">
                                    <span className="font-bold">Greška prijenosa: </span>
                                    {inspectionLog.error_msg}
                                </div>
                            </div>
                        )}

                        <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setIsInspectorOpen(false)}
                                className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors"
                            >
                                Zatvori
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ClinicalWorkspacePage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Učitavanje radnog prostora...</div>}>
            <ClinicalWorkspace />
        </Suspense>
    );
}
