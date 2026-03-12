'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, UserPlus, FileText, CheckCircle2, Clock, ChevronRight, XCircle, RefreshCw, Save } from 'lucide-react';

export default function PatientsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [patients, setPatients] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Initial load and fuzzy search
    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/patient/registry?q=${encodeURIComponent(searchTerm)}`);
                const data = await res.json();
                if (data.success) {
                    setPatients(data.patients);
                }
            } catch (err: any) {
                console.error('Failed to fetch registry:', err);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchPatients, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [isRegModalOpen, setIsRegModalOpen] = useState(false);
    const [regMbo, setRegMbo] = useState('');
    const [regSearchType, setRegSearchType] = useState<'mbo' | 'passport' | 'eu-card'>('mbo');
    const [remotePatient, setRemotePatient] = useState<any>(null);
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState<string | null>(null);

    const handleRemoteLookup = async () => {
        if (!regMbo) {
            setRegError('Molim unesite identifikator');
            return;
        }
        setRegLoading(true);
        setRegError(null);
        try {
            // If MBO, use search-remote (standard PDQm). If passport/EKZO, use identifier search.
            const url = regSearchType === 'mbo' 
                ? `/api/patient/search-remote?mbo=${regMbo}` 
                : `/api/patient/search?identifier=${encodeURIComponent(regMbo)}`;

            const res = await fetch(url);
            const data = await res.json();
            
            // Fixed response parsing: accept both single patient and patients array
            const found = data.patients ? data.patients : (data.patient ? [data.patient] : []);
            
            if (data.success && found.length > 0) {
                setRemotePatient(found[0]);
            } else {
                setRegError('Pacijent nije pronađen na CEZIH-u niti u lokalnoj bazi.');
            }
        } catch (err) {
            setRegError('Greška pri dohvaćanju podataka.');
        } finally {
            setRegLoading(false);
        }
    };

    const handleSync = async () => {
        if (!remotePatient) return;
        setRegLoading(true);
        setRegError(null);
        try {
            const mboToSync = remotePatient.mbo || remotePatient.id;
            const res = await fetch('/api/patient/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mbo: mboToSync })
            });
            const data = await res.json();
            if (data.success) {
                setIsRegModalOpen(false);
                setRegMbo('');
                setRemotePatient(null);
                // Refresh list
                const resList = await fetch(`/api/patient/registry?q=${encodeURIComponent(searchTerm)}`);
                const dataList = await resList.json();
                if (dataList.success) setPatients(dataList.patients);
            } else {
                setRegError(data.error || 'Greška pri spremanju.');
            }
        } catch (err) {
            setRegError('Greška pri spremanju.');
        } finally {
            setRegLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Registar pacijenata</h1>
                    <p className="text-slate-500">Centralno upravljanje identitetom i sinkronizacija s CEZIH sustavom</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setIsRegModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                    >
                        <Search className="w-4 h-4" />
                        Dohvat pacijenata (TC 10)
                    </button>
                    <Link
                        href="/dashboard/patients/register-foreigner"
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm shadow-blue-200"
                    >
                        <UserPlus className="w-4 h-4" />
                        Registracija stranca (TC 11)
                    </Link>
                </div>
            </div>

            {/* Global Search Bar */}
            <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                <div className="pl-3">
                    <Search className="w-5 h-5 text-slate-400" />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pretraži po imenu, prezimenu, MBO-u ili OIB-u..."
                    className="flex-1 py-3 px-2 outline-none text-slate-700 bg-transparent placeholder:text-slate-400"
                />
                {loading && (
                    <div className="pr-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                    </div>
                )}
            </div>

            {/* Registration Modal (TC 10) */}
            {isRegModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                <Search className="w-5 h-5" />
                                Registracija s CEZIH-a (TC 10)
                            </h3>
                            <button onClick={() => { setIsRegModalOpen(false); setRemotePatient(null); setRegMbo(''); setRegError(null); }} className="text-slate-400 hover:text-slate-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {!remotePatient ? (
                                <>
                                    <div className="space-y-4">
                                        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                                            {(['mbo', 'passport', 'eu-card'] as const).map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => setRegSearchType(type)}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                                        regSearchType === type 
                                                        ? 'bg-white text-blue-600 shadow-sm' 
                                                        : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {type === 'mbo' ? 'MBO' : type === 'passport' ? 'PUTOVNICA' : 'EKZO'}
                                                </button>
                                            ))}
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">
                                                {regSearchType === 'mbo' ? 'MBO (9 znamenki)' : regSearchType === 'passport' ? 'Broj putovnice' : 'Broj EKZO kartice'}
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="flex-1 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                                    placeholder={regSearchType === 'mbo' ? 'npr. 123456789' : 'Unesite broj...'}
                                                    value={regMbo}
                                                    onChange={(e) => setRegMbo(regSearchType === 'mbo' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                                                />
                                                <button
                                                    onClick={handleRemoteLookup}
                                                    disabled={regLoading || !regMbo}
                                                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {regLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                    Dohvati
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {regError && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">{regError}</div>}
                                </>
                            ) : (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
                                        <div className="text-xs font-bold text-emerald-600 uppercase mb-3">Pronađen pacijent</div>
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold text-xl uppercase">
                                                {remotePatient.name?.family?.[0] || '?'}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 text-lg">
                                                    {remotePatient.name?.given?.join(' ') || ''} {remotePatient.name?.family || ''}
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                                                    <div><span className="text-slate-400">MBO:</span> <span className="font-mono">{remotePatient.mbo}</span></div>
                                                    <div><span className="text-slate-400">OIB:</span> <span className="font-mono">{remotePatient.oib || 'N/A'}</span></div>
                                                    <div><span className="text-slate-400">Datum rođ:</span> <span>{new Date(remotePatient.birthDate).toLocaleDateString('hr-HR')}</span></div>
                                                    <div><span className="text-slate-400">Spol:</span> <span>{remotePatient.gender}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => setRemotePatient(null)}
                                            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 text-slate-600"
                                        >
                                            Natrag
                                        </button>
                                        <button
                                            onClick={handleSync}
                                            disabled={regLoading}
                                            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                                        >
                                            {regLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            Spremi u registar
                                        </button>
                                    </div>
                                    {regError && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">{regError}</div>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Results Grid */}
            {patients.length > 0 ? (
                <div className="grid gap-4">
                    {patients.map((patient) => (
                        <Link
                            key={patient.id}
                            href={`/dashboard/patients/${patient.mbo}`}
                            className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-bold text-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors uppercase">
                                    {patient.name?.family?.[0] || '?'}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                        {patient.name?.given?.join(' ') || ''} {patient.name?.family || 'Nepoznato'}
                                    </h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">MBO: {patient.mbo}</span>
                                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">OIB: {patient.oib || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="hidden lg:flex flex-col items-end">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Zadnja sinkronizacija</span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {patient.lastSyncAt ? (
                                            <>
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                <span className="text-xs text-slate-600 font-medium">
                                                    {new Date(patient.lastSyncAt).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                <span className="text-xs text-slate-400 italic">Nije sinkronizirano</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all text-slate-400">
                                    <ChevronRight className="w-5 h-5" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                !loading && (
                    <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-50 rounded-2xl mb-4">
                            <Search className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">Nema pacijenata</h3>
                        <p className="text-slate-500 max-w-xs mx-auto mt-2">
                            Pokušajte pretražiti po drugom kriteriju ili provjerite bazu podataka.
                        </p>
                    </div>
                )
            )}
        </div>
    );
}

