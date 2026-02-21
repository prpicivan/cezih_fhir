'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, UserPlus, FileText, CheckCircle2, Clock, ChevronRight } from 'lucide-react';

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Registar pacijenata</h1>
                    <p className="text-slate-500">Centralno upravljanje identitetom i sinkronizacija s CEZIH sustavom</p>
                </div>
                <Link
                    href="/dashboard/patients/register-foreigner"
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm shadow-blue-200"
                >
                    <UserPlus className="w-4 h-4" />
                    Registracija stranca (TC 11)
                </Link>
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
                                    {patient.name.family[0]}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                        {patient.name.given.join(' ')} {patient.name.family}
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
