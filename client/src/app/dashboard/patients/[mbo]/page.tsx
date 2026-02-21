'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    FileText, Plus, User, Calendar,
    RefreshCw, CheckCircle2, AlertCircle,
    Stethoscope, ClipboardList, Activity,
    History, ChevronRight, Download
} from 'lucide-react';

export default function PatientChartPage() {
    const params = useParams();
    const router = useRouter();
    const mbo = params.mbo as string;

    const [chartData, setChartData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchChartData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/patient/${mbo}/chart`);
            const data = await res.json();
            if (data.success) {
                setChartData(data.chart);
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
            // Re-fetch from remote (this updates local DB via PatientService and increments lastSyncAt)
            await fetch(`/api/patient/search?mbo=${mbo}`);
            await fetchChartData();
        } finally {
            setSyncing(false);
        }
    };

    const handleStartVisit = (caseId?: string) => {
        const query = new URLSearchParams({
            patientMbo: mbo,
            ...(caseId && { caseId })
        });
        router.push(`/dashboard/visit/new?${query.toString()}`);
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

    const { patient, lastDocument, activeCases, recentVisits } = chartData;

    return (
        <div className="space-y-6">
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
                                Zadnji medicinski nalaz
                            </h2>
                            {lastDocument && (
                                <button className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center gap-1">
                                    <Download className="w-4 h-4" /> Preuzmi PDF
                                </button>
                            )}
                        </div>

                        <div className="flex-1 p-8">
                            {lastDocument ? (
                                <div className="space-y-8 max-w-2xl mx-auto">
                                    <div className="flex justify-between items-end border-b pb-4 border-slate-100">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Vrsta dokumenta</p>
                                            <p className="font-bold text-slate-900">{lastDocument.type}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Datum izdavanja</p>
                                            <p className="font-bold text-slate-900">{new Date(lastDocument.createdAt).toLocaleDateString('hr-HR')}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="group">
                                            <h3 className="text-xs uppercase font-black text-blue-600 tracking-widest mb-2 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                                Anamneza i anamnestički podaci
                                            </h3>
                                            <p className="text-slate-700 leading-relaxed font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                                {lastDocument.anamnesis || 'Pacijent se javlja na redovitu kontrolu. Subjektivno bez tegoba.'}
                                            </p>
                                        </div>

                                        <div className="group">
                                            <h3 className="text-xs uppercase font-black text-emerald-600 tracking-widest mb-2 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></div>
                                                Klinički nalaz i status
                                            </h3>
                                            <p className="text-slate-700 leading-relaxed font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                                                {lastDocument.finding || 'Uredan nalaz organskih sustava.'}
                                            </p>
                                        </div>

                                        <div className="pt-4 flex items-center justify-between p-4 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200">
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">Dijagnoza (MKB-10)</p>
                                                <p className="text-lg font-black tracking-tight">{lastDocument.diagnosisCode} - {lastDocument.diagnosisName || 'Nešpecifični simptomi'}</p>
                                            </div>
                                            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                                                <Activity className="w-6 h-6 text-emerald-400" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 border-dashed">
                                        <History className="w-10 h-10 text-slate-300" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-400">Nema povijesti nalaza</h3>
                                    <p className="text-slate-400 max-w-xs mt-2 italic text-sm">
                                        Za ovog pacijenta u lokalnom sustavu još nema pohranjenih medicinskih izvještaja.
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* RIGHT: SECONDARY FOCUS - ACTIVE PROBLEMS & RECENT ACTIVITY */}
                <aside className="space-y-6">
                    {/* Active Problems (Episodes of Care) */}
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                            <h3 className="font-black text-slate-800 flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-amber-500" />
                                Aktivni problemi
                            </h3>
                            <button className="text-[10px] font-black uppercase text-blue-600 hover:underline">Novo</button>
                        </div>
                        <div className="p-4 space-y-3">
                            {activeCases.length > 0 ? (
                                activeCases.map((c: any) => (
                                    <div key={c.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-amber-200 hover:shadow-sm transition-all cursor-pointer group">
                                        <div className="flex justify-between items-start">
                                            <p className="font-bold text-slate-900 group-hover:text-amber-700 transition-colors uppercase text-sm tracking-tight">{c.title}</p>
                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Otvoreno: {new Date(c.start).toLocaleDateString('hr-HR')}</p>
                                        <button
                                            onClick={(e) => { e.preventDefault(); handleStartVisit(c.id); }}
                                            className="mt-3 w-full py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
                                        >
                                            Nastavi liječenje
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center py-4 text-xs text-slate-400 italic">Nema aktivnih epizoda liječenja.</p>
                            )}
                        </div>
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
        </div>
    );
}
