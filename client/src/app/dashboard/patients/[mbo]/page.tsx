'use client';

import { useState, useEffect } from 'react';
import { useToast, Toast } from '@/components/Toast';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    FileText, User, Calendar,
    RefreshCw, CheckCircle2, AlertCircle,
    Stethoscope, ClipboardList, Activity,
    History, ChevronRight, ChevronDown, ChevronUp, Edit2, Trash2, Plus,
    Globe, FolderOpen, Printer, X
} from 'lucide-react';
import ChangeDocumentModal from './ChangeDocumentModal';
import CaseModal from './CaseModal';

export default function PatientChartPage() {
    const params = useParams();
    const router = useRouter();
    const mbo = params.mbo as string;
    const { toast, showToast, hideToast } = useToast();

    const [chartData, setChartData] = useState<any>(null);
    const [viewingDocument, setViewingDocument] = useState<any>(null);
    const [editingDocument, setEditingDocument] = useState<any>(null);
    // null = closed, undefined = create mode, object = edit mode
    const [caseModal, setCaseModal] = useState<any | null | undefined>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncingCases, setSyncingCases] = useState(false);
    const [retrieving, setRetrieving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [docsCollapsed, setDocsCollapsed] = useState(false);
    const [docTab, setDocTab] = useState<'local' | 'cezih'>('local');
    const [cezihDocs, setCezihDocs] = useState<any[]>([]);
    const [cezihLoading, setCezihLoading] = useState(false);
    const [cezihLoaded, setCezihLoaded] = useState(false);
    const [casesCollapsed, setCasesCollapsed] = useState(false);

    const fetchChartData = async (refresh: boolean = false) => {
        setLoading(!refresh); // Only show full loading if not a background refresh
        try {
            const res = await fetch(`/api/patient/${mbo}/chart${refresh ? '?refresh=true' : ''}`);
            const data = await res.json();
            if (data.success) {
                setChartData(data.chart);
                setViewingDocument(data.chart.lastDocument);
            } else {
                setError(data.error || 'Greška pri dohvaćanju kartona.');
            }
        } catch (err: any) {
            setError('Greška u komunikaciji s poslužiteljem.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (mbo) fetchChartData();
    }, [mbo]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            // Global Deep Sync
            await fetchChartData(true);
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncCases = async () => {
        setSyncingCases(true);
        try {
            // Force refresh cases only (via chart route with refresh=true)
            await fetchChartData(true);
        } finally {
            setSyncingCases(false);
        }
    };

    const handleStartVisit = (caseId?: string) => {
        const query = new URLSearchParams({
            patientMbo: mbo,
            patientId: patient?.id || '', // Include FHIR technical ID
            ...(caseId && { caseId })
        });
        router.push(`/dashboard/visit/new?${query.toString()}`);
    };

    const handleCloseCase = async (caseId: string) => {
        if (!confirm('Jeste li sigurni da želite zatvoriti ovaj slučaj?')) return;
        try {
            await fetch(`/api/case/${caseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'finished',
                    endDate: new Date().toISOString(),
                    patientMbo: mbo,
                }),
            });
            fetchChartData(); // Refresh to reflect the change
        } catch (err) {
            console.error('Failed to close case', err);
        }
    };

    const handleCancelDocument = async (doc: any) => {
        if (!confirm(`Jeste li sigurni da želite stornirati dokument ${doc.id}?\nOva radnja se ne može poništiti.`)) return;
        try {
            const res = await fetch('/api/document/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentOid: doc.id }),
            });
            const data = await res.json();
            if (data.success) {
                fetchChartData();
            } else {
                showToast('error', 'Greška pri storniranju: ' + (data.error || 'Nepoznata pogreška'));
            }
        } catch {
            showToast('error', 'Greška u komunikaciji s poslužiteljem.');
        }
    };

    const handleRetrieve = async (doc: any) => {
        if (!doc.isRemote || (doc.anamnesis && doc.finding)) {
            setViewingDocument(doc);
            return;
        }

        setRetrieving(true);
        try {
            const url = doc.contentUrl || `urn:oid:${doc.id}`;
            const res = await fetch(`/api/document/retrieve?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (data.success) {
                setViewingDocument({ ...doc, ...data.document });
            }
        } catch (err) {
            console.error("Failed to retrieve", err);
        } finally {
            setRetrieving(false);
        }
    };

    const fetchCezihDocs = async () => {
        setCezihLoading(true);
        try {
            const res = await fetch(`/api/document/search-remote?patientMbo=${mbo}`);
            const data = await res.json();
            if (data.success) {
                setCezihDocs(data.documents || []);
            }
        } catch (err) {
            console.error('Failed to fetch CEZIH docs', err);
        } finally {
            setCezihLoading(false);
            setCezihLoaded(true);
        }
    };

    const handleSwitchDocTab = (tab: 'local' | 'cezih') => {
        setDocTab(tab);
        if (tab === 'cezih' && !cezihLoaded) {
            fetchCezihDocs();
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
                <p className="text-slate-500 font-medium animate-pulse">Otvaram klinički karton...</p>
            </div>
        );
    }

    if (error || !chartData) {
        return (
            <div className="max-w-2xl mx-auto mt-20 p-8 bg-white rounded-3xl border border-slate-200 text-center">
                <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900">Pristup nije uspio</h2>
                <p className="text-slate-500 mt-2">{error || 'Pacijent s navedenim MBO-om ne postoji u lokalnom registru.'}</p>
                <Link href="/dashboard/patients" className="mt-6 inline-flex items-center text-blue-600 font-bold hover:gap-2 transition-all">
                    Povratak u registar <ChevronRight className="w-4 h-4" />
                </Link>
            </div>
        );
    }

    const { patient, activeCases, allCases = [], recentVisits, allDocuments } = chartData;

    return (
        <div className="space-y-6">
            <Toast toast={toast} onClose={hideToast} />
            {/* HERRO SECTION: Patient Identity & Freshness */}
            <header className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full -mr-32 -mt-32 transition-transform group-hover:scale-110 duration-700"></div>

                <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <User className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-black text-slate-900 leading-tight">
                                    {patient.name.given.join(' ')} {patient.name.family}
                                </h1>
                                {patient.lastSyncAt && (
                                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border border-emerald-100">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Provjereno (CEZIH)
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 mt-2 text-slate-500 font-medium">
                                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {patient.birthDate}</span>
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">MBO: {patient.mbo}</span>
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">OIB: {patient.oib || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all ${syncing ? 'bg-slate-100 text-slate-400' : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600'
                                }`}
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                            Sinkroniziraj
                        </button>
                        <button
                            onClick={() => setCaseModal(undefined)}
                            className="bg-white border border-emerald-200 text-emerald-700 px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-50 hover:border-emerald-400 transition-all flex items-center gap-2"
                        >
                            <ClipboardList className="w-4 h-4" />
                            Otvori novi slučaj
                        </button>
                        <button
                            onClick={() => handleStartVisit()}
                            className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
                        >
                            <Stethoscope className="w-4 h-4" />
                            Otvori novi posjet
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT: PRIMARY FOCUS - LAST MEDICAL REPORT */}
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="font-black text-slate-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                {viewingDocument?.isRemote ? 'Udaljeni klinički dokument (CEZIH)' : 'Medicinski nalaz'}
                            </h2>
                            {viewingDocument?.isRemote && (
                                <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter border border-blue-100">
                                    Dohvaćeno putem ITI-68
                                </span>
                            )}
                        </div>

                        {/* Metadata Bar */}
                        {viewingDocument && !retrieving && (
                            <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-start flex-wrap gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Vrsta</p>
                                        <p className="font-bold text-slate-900 text-sm">{viewingDocument.type || viewingDocument.title || 'Nalaz'}</p>
                                    </div>
                                    {viewingDocument.id && (
                                        <p className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                                            {viewingDocument.id}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase font-bold text-slate-400">Datum</p>
                                        <p className="font-bold text-slate-900 text-sm">{new Date(viewingDocument.createdAt).toLocaleDateString('hr-HR')}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${viewingDocument.status === 'cancelled' ? 'bg-rose-50 text-rose-500 border border-rose-100'
                                        : viewingDocument.status === 'replaced' ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        }`}>
                                        {viewingDocument.status === 'cancelled' ? 'storniran' : viewingDocument.status === 'replaced' ? 'zamijenjen' : 'aktivan'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${viewingDocument.isRemote ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                                        }`}>
                                        {viewingDocument.isRemote ? 'CEZIH' : 'Lokalni'}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 p-8">
                            {retrieving ? (
                                <div className="h-full flex flex-col items-center justify-center py-20 gap-4">
                                    <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
                                    <p className="font-bold text-slate-400">Dohvaćam puni sadržaj dokumenta...</p>
                                    <p className="text-[10px] text-slate-300 font-semibold">ITI-68 Retrieve Document</p>
                                </div>
                            ) : viewingDocument ? (
                                <div className="space-y-5 max-w-2xl mx-auto">
                                    {/* Anamneza */}
                                    <div className="group border-l-[3px] border-blue-500 pl-4 hover:pl-5 transition-all">
                                        <h3 className="text-[10px] uppercase font-black text-blue-600 tracking-[2px] mb-1.5 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                            Anamneza i anamnestički podaci
                                        </h3>
                                        <p className="text-slate-700 leading-relaxed text-sm font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                            {viewingDocument.anamnesis || 'Nema podataka.'}
                                        </p>
                                    </div>

                                    {/* Klinički nalaz */}
                                    <div className="group border-l-[3px] border-emerald-500 pl-4 hover:pl-5 transition-all">
                                        <h3 className="text-[10px] uppercase font-black text-emerald-600 tracking-[2px] mb-1.5 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></div>
                                            Klinički nalaz i status
                                        </h3>
                                        <p className="text-slate-700 leading-relaxed text-sm font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                            {viewingDocument.finding || 'Nema podataka.'}
                                        </p>
                                    </div>

                                    {/* Terapija */}
                                    <div className="group border-l-[3px] border-purple-500 pl-4 hover:pl-5 transition-all">
                                        <h3 className="text-[10px] uppercase font-black text-purple-600 tracking-[2px] mb-1.5 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-purple-600 rounded-full"></div>
                                            Terapija
                                        </h3>
                                        <p className="text-slate-700 leading-relaxed text-sm font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                            {viewingDocument.therapy || viewingDocument.status_text || 'Nema podataka.'}
                                        </p>
                                    </div>

                                    {/* Preporuka */}
                                    <div className="group border-l-[3px] border-amber-500 pl-4 hover:pl-5 transition-all">
                                        <h3 className="text-[10px] uppercase font-black text-amber-600 tracking-[2px] mb-1.5 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-amber-600 rounded-full"></div>
                                            Preporuka
                                        </h3>
                                        <p className="text-slate-700 leading-relaxed text-sm font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                            {viewingDocument.recommendation || 'Nema podataka.'}
                                        </p>
                                    </div>

                                    {/* Diagnosis Card */}
                                    <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200">
                                        <div>
                                            <p className="text-[9px] uppercase font-bold text-slate-400 leading-none mb-1 tracking-wider">Dijagnoza (MKB-10)</p>
                                            <p className="text-lg font-black tracking-tight">
                                                {viewingDocument.diagnosisCode ? `${viewingDocument.diagnosisCode} — ` : ''}
                                                {viewingDocument.diagnosisDisplay || (viewingDocument.diagnosisCode ? '' : 'Nije navedena')}
                                            </p>
                                        </div>
                                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                                            <Activity className="w-6 h-6 text-emerald-400" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 border-dashed">
                                        <History className="w-10 h-10 text-slate-300" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-400">Odaberite dokument</h3>
                                    <p className="text-slate-400 max-w-xs mt-2 italic text-sm">
                                        Kliknite na dokument u popisu desno za prikaz sadržaja.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Action bar */}
                        {viewingDocument && !retrieving && (
                            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 transition-all"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                    Ispiši PDF
                                </button>
                                <button
                                    onClick={() => setViewingDocument(null)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Zatvori
                                </button>
                            </div>
                        )}
                    </section>
                </div>

                {/* RIGHT: SECONDARY FOCUS - ACTIVE PROBLEMS & RECENT ACTIVITY */}
                <aside className="space-y-6">
                    {/* Dokumenti — Lokalni / CEZIH tabovi */}
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                            <h3 className="font-black text-slate-800 flex items-center gap-2">
                                <History className="w-5 h-5 text-blue-500" />
                                Dokumenti
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setDocsCollapsed(prev => !prev)}
                                    className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                                    title={docsCollapsed ? 'Proširi' : 'Smanji'}
                                >
                                    {docsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </button>
                                <span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded-full">TC 18-22</span>
                            </div>
                        </div>

                        {/* Tabs */}
                        {!docsCollapsed && (
                            <>
                                <div className="flex border-b border-slate-100">
                                    <button
                                        onClick={() => handleSwitchDocTab('local')}
                                        className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${docTab === 'local'
                                            ? 'text-blue-700 border-blue-600 bg-blue-50/50'
                                            : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                        Lokalni
                                        <span className={`text-[10px] font-black px-1.5 py-0 rounded-full ${docTab === 'local' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {allDocuments?.length || 0}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => handleSwitchDocTab('cezih')}
                                        className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${docTab === 'cezih'
                                            ? 'text-blue-700 border-blue-600 bg-blue-50/50'
                                            : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        <Globe className="w-3.5 h-3.5" />
                                        CEZIH
                                        <span className={`text-[10px] font-black px-1.5 py-0 rounded-full ${docTab === 'cezih' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {cezihLoaded ? cezihDocs.length : '—'}
                                        </span>
                                    </button>
                                </div>

                                {/* CEZIH toolbar */}
                                {docTab === 'cezih' && (
                                    <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-100">
                                        <span className="text-[10px] font-semibold text-blue-600">Dokumenti s nacionalnog sustava</span>
                                        <button
                                            onClick={fetchCezihDocs}
                                            disabled={cezihLoading}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-blue-200 text-blue-600 hover:bg-blue-100 transition-all disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${cezihLoading ? 'animate-spin' : ''}`} />
                                            Osvježi
                                        </button>
                                    </div>
                                )}

                                {/* Document list */}
                                <div className="p-2 space-y-1">
                                    {docTab === 'local' ? (
                                        /* LOCAL TAB */
                                        allDocuments && allDocuments.length > 0 ? (
                                            allDocuments.map((doc: any) => {
                                                const isDeprecated = doc.status === 'replaced' || doc.status === 'cancelled';
                                                const isViewing = viewingDocument?.id === doc.id;
                                                return (
                                                    <div key={doc.id} className={`rounded-2xl transition-all group ${isDeprecated ? 'ml-4 border-l-2 border-slate-200 pl-2' : ''}`}>
                                                        <div className={`w-full p-2.5 rounded-xl transition-all ${isViewing ? 'bg-blue-50 border border-blue-100'
                                                            : isDeprecated ? 'hover:bg-slate-50/50 border border-transparent opacity-60'
                                                                : 'hover:bg-slate-50 border border-transparent'
                                                            }`}>
                                                            <button onClick={() => handleRetrieve(doc)} className="w-full text-left flex items-center gap-3">
                                                                <div className={`rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isDeprecated ? 'w-8 h-8 bg-slate-100 text-slate-300'
                                                                    : isViewing ? 'w-10 h-10 bg-blue-600 text-white'
                                                                        : 'w-10 h-10 bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-blue-600'
                                                                    }`}>
                                                                    <FileText className={isDeprecated ? 'w-4 h-4' : 'w-5 h-5'} />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <p className={`font-bold text-xs truncate ${isViewing ? 'text-blue-900' : isDeprecated ? 'text-slate-400' : 'text-slate-700'}`}>
                                                                            {doc.type || 'Nalaz'}
                                                                        </p>
                                                                        {isDeprecated && (
                                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${doc.status === 'cancelled' ? 'bg-rose-50 text-rose-400' : 'bg-slate-100 text-slate-400'
                                                                                }`}>
                                                                                {doc.status === 'cancelled' ? 'storniran' : 'zamijenjen'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className={`text-[10px] font-bold uppercase ${isDeprecated ? 'text-slate-300' : 'text-slate-400'}`}>
                                                                        {new Date(doc.createdAt).toLocaleDateString('hr-HR')}
                                                                    </p>
                                                                    {doc.diagnosisCode && (
                                                                        <p className={`text-[10px] mt-0.5 ${isDeprecated ? 'text-slate-300' : 'text-slate-500'}`}>
                                                                            <span className="font-mono font-bold">{doc.diagnosisCode}</span>
                                                                            {doc.diagnosisDisplay && <span className="font-medium"> — {doc.diagnosisDisplay}</span>}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </button>
                                                            {!doc.isRemote && !isDeprecated && (
                                                                <div className="flex gap-1.5 mt-2 pl-13">
                                                                    <button onClick={() => setEditingDocument(doc)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all">
                                                                        <Edit2 className="w-3 h-3" /> Izmijeni
                                                                    </button>
                                                                    <button onClick={() => handleCancelDocument(doc)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all">
                                                                        <Trash2 className="w-3 h-3" /> Storniraj
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-center py-6 text-xs text-slate-400 italic">Nema lokalnih dokumenata.</p>
                                        )
                                    ) : (
                                        /* CEZIH TAB */
                                        cezihLoading ? (
                                            <div className="flex flex-col items-center py-8 gap-3">
                                                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                                                <p className="text-xs font-semibold text-slate-400">Pretražujem CEZIH (ITI-67)...</p>
                                            </div>
                                        ) : cezihDocs.length > 0 ? (
                                            cezihDocs.map((doc: any) => {
                                                const isViewing = viewingDocument?.id === doc.id;
                                                return (
                                                    <div key={doc.id} className="rounded-2xl transition-all group">
                                                        <div className={`w-full p-2.5 rounded-xl transition-all ${isViewing ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'
                                                            }`}>
                                                            <button onClick={() => handleRetrieve(doc)} className="w-full text-left flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isViewing ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-blue-600'
                                                                    }`}>
                                                                    <FileText className="w-5 h-5" />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className={`font-bold text-xs truncate ${isViewing ? 'text-blue-900' : 'text-slate-700'}`}>
                                                                        {doc.type || doc.title || 'Dokument'}
                                                                    </p>
                                                                    <p className="text-[10px] font-bold uppercase text-slate-400">
                                                                        {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('hr-HR') : ''}
                                                                    </p>
                                                                    {doc.diagnosisCode && (
                                                                        <p className="text-[10px] mt-0.5 text-slate-500">
                                                                            <span className="font-mono font-bold">{doc.diagnosisCode}</span>
                                                                            {doc.diagnosisDisplay && <span className="font-medium"> — {doc.diagnosisDisplay}</span>}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" title="CEZIH"></div>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : cezihLoaded ? (
                                            <p className="text-center py-6 text-xs text-slate-400 italic">Nema dokumenata na CEZIH-u za ovog pacijenta.</p>
                                        ) : null
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                    {/* Zdravstveni slučajevi (TC 15-17) */}
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-amber-500" />
                                <h3 className="font-black text-slate-800">Zdravstveni slučajevi</h3>
                                <button
                                    onClick={handleSyncCases}
                                    disabled={syncingCases}
                                    className={`p-1 hover:bg-slate-200 rounded-md transition-colors ${syncingCases ? 'animate-spin text-amber-500' : 'text-slate-400'}`}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCasesCollapsed(prev => !prev)}
                                    className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                                    title={casesCollapsed ? 'Proširi' : 'Smanji'}
                                >
                                    {casesCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </button>
                                <span className="bg-amber-50 text-amber-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-100">
                                    TC 15-17
                                </span>
                            </div>
                        </div>
                        {!casesCollapsed && (
                            <div className="p-3 space-y-2">
                                {allCases.length > 0 ? (
                                    allCases.map((c: any) => {
                                        const isActive = c.status === 'active';
                                        const isFinished = c.status === 'finished';
                                        return (
                                            <div
                                                key={c.id}
                                                className={`p-4 rounded-2xl border transition-all group ${isActive
                                                    ? 'border-emerald-100 bg-emerald-50/30 hover:border-emerald-300 hover:shadow-sm'
                                                    : 'border-slate-100 bg-slate-50/30 hover:border-slate-200'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {c.diagnosisCode && (
                                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                                                                    }`}>
                                                                    {c.diagnosisCode}
                                                                </span>
                                                            )}
                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive
                                                                ? 'bg-emerald-500 text-white'
                                                                : 'bg-slate-300 text-white'
                                                                }`}>
                                                                {isActive ? 'aktivan' : isFinished ? 'završen' : c.status}
                                                            </span>
                                                        </div>
                                                        <p className={`font-bold text-sm tracking-tight ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                                                            {c.title || c.diagnosisDisplay || 'Neimenovan slučaj'}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                                                                Od: {new Date(c.start).toLocaleDateString('hr-HR')}
                                                                {c.end && ` — Do: ${new Date(c.end).toLocaleDateString('hr-HR')}`}
                                                            </p>
                                                        </div>
                                                        {c.practitionerName && (
                                                            <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                                                                {c.practitionerName}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {isActive && (
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse flex-shrink-0 mt-2"></div>
                                                    )}
                                                </div>
                                                {isActive && (
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); handleStartVisit(c.id); }}
                                                            className="flex-1 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
                                                        >
                                                            Nastavi liječenje
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); setCaseModal(c); }}
                                                            className="py-1.5 px-3 bg-white border border-amber-200 rounded-lg text-xs font-black text-amber-600 hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all"
                                                        >
                                                            <Edit2 className="w-3 h-3 inline mr-1" />
                                                            Uredi
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); handleCloseCase(c.id); }}
                                                            className="py-1.5 px-3 bg-white border border-rose-200 rounded-lg text-xs font-black text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all"
                                                        >
                                                            Zatvori
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-center py-4 text-xs text-slate-400 italic">Nema zdravstvenih slučajeva.</p>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Recent Activity (Visits) */}
                    <section className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-200">
                        <h3 className="font-black flex items-center gap-2 mb-4 text-slate-300">
                            <Activity className="w-5 h-5 text-emerald-400" />
                            Recentni posjeti
                        </h3>
                        <div className="space-y-4">
                            {recentVisits.map((v: any, idx: number) => (
                                <div key={v.id} className={`flex gap-3 pb-4 ${idx !== recentVisits.length - 1 ? 'border-b border-white/5' : ''}`}>
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm tracking-tight">{new Date(v.startDateTime).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{v.doctorName || 'Dr. Ivan Horvat'}</p>
                                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                                            {v.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {recentVisits.length === 0 && (
                                <p className="text-slate-500 text-xs italic">Nema zabilježenih posjeta.</p>
                            )}
                        </div>
                    </section>
                </aside>
            </div>

            {/* Change Document Modal */}
            {editingDocument && (
                <ChangeDocumentModal
                    doc={editingDocument}
                    patientMbo={mbo}
                    onClose={() => setEditingDocument(null)}
                    onSuccess={() => {
                        setEditingDocument(null);
                        fetchChartData();
                    }}
                />
            )}

            {/* Case Modal: Novi slučaj (TC16) or Uredi slučaj (TC17) */}
            {caseModal !== null && (
                <CaseModal
                    existingCase={caseModal === undefined ? null : caseModal}
                    patientMbo={mbo}
                    onClose={() => setCaseModal(null)}
                    onSuccess={() => {
                        setCaseModal(null);
                        fetchChartData();
                    }}
                />
            )}
        </div>
    );
}
