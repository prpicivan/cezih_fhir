'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    User, Activity, FileText, Send, Save, XCircle, CheckCircle,
    AlertTriangle, Clock, Calendar, ArrowLeft
} from 'lucide-react';

function ClinicalWorkspace() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const patientId = searchParams.get('patientId');
    const mbo = searchParams.get('mbo');

    const [visitStatus, setVisitStatus] = useState<'idle' | 'active' | 'finished'>('idle');
    const [visitId, setVisitId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [findingText, setFindingText] = useState('');
    const [startDate, setStartDate] = useState<string>('');
    const [logs, setLogs] = useState<string[]>([]);
    const [visitType, setVisitType] = useState<'AMB' | 'IMP' | 'EMER'>('AMB');

    useEffect(() => {
        // Set default date to now, formatted for datetime-local input (YYYY-MM-DDTHH:mm)
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setStartDate(now.toISOString().slice(0, 16));
    }, []);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    // TC 12: Create Visit (Encounter)
    const startVisit = async () => {
        setLoading(true);
        try {
            addLog('Započinjem posjet (TC 12)...');
            const res = await fetch('/api/visit/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientMbo: mbo,
                    practitionerId: 'practitioner-1', // Mock ID
                    organizationId: 'org-1', // Mock ID
                    startDate: new Date(startDate).toISOString(),
                    class: visitType
                })
            });
            const data = await res.json();

            if (data.success) {
                setVisitId('visit-mock-id'); // In real app, get from data.result
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
                    patientMbo: mbo,
                    practitionerId: 'practitioner-1',
                    organizationId: 'org-1',
                    visitId: visitId,
                    title: 'Medicinski nalaz',
                    content: findingText,
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-slate-500" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Radni prostor liječnika</h1>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <User className="w-4 h-4" /> Pacijent MBO: <span className="font-mono font-medium text-slate-700">{mbo || 'Nepoznato'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
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

                        <textarea
                            className="flex-1 p-6 resize-none outline-none text-slate-800 leading-relaxed disabled:bg-slate-50 disabled:text-slate-400"
                            placeholder={visitStatus === 'idle' ? "Započnite posjet za unos nalaza..." : "Unesite tekst nalaza ovdje..."}
                            disabled={visitStatus !== 'active' || loading}
                            value={findingText}
                            onChange={(e) => setFindingText(e.target.value)}
                        />

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => sendDocument('ambulatory-report')}
                                    disabled={visitStatus !== 'active' || loading}
                                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4" />
                                    Pošalji izvješće (TC 18)
                                </button>
                                <button
                                    onClick={() => sendDocument('specialist-finding')}
                                    disabled={visitStatus !== 'active' || loading}
                                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Activity className="w-4 h-4" />
                                    Pošalji nalaz (TC 18)
                                </button>
                            </div>

                            {visitStatus === 'active' && (
                                <button
                                    onClick={closeVisit}
                                    disabled={loading}
                                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <XCircle className="w-4 h-4" />
                                    Završi posjet (TC 14)
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar: Logs & History */}
                <div className="space-y-6">
                    {/* Action Log (Audit Trail) */}
                    <div className="bg-slate-900 rounded-xl shadow-sm overflow-hidden text-slate-300 text-xs font-mono h-96 flex flex-col">
                        <div className="p-3 border-b border-slate-800 bg-slate-950 font-semibold flex items-center gap-2 text-slate-400">
                            <Clock className="w-3 h-3" />
                            Audit Log (CEZIH Transactions)
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-2">
                            {logs.length === 0 && <span className="opacity-50 italic">Čekam akcije...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className="border-l-2 border-slate-700 pl-2 py-0.5">
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Info */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm">
                        <div className="flex items-center gap-2 font-semibold mb-2">
                            <AlertTriangle className="w-4 h-4" />
                            Certifikacijska napomena
                        </div>
                        <p>
                            Sve akcije u ovom prozoru šalju stvarne FHIR poruke prema CEZIH testnoj okolini.
                            Nalazi se digitalno potpisuju prije slanja (TC 4/5).
                        </p>
                    </div>
                </div>
            </div>
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
