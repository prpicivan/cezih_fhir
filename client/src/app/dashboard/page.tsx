'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, Calendar, FileText, UserPlus, Activity, Clock, LogOut, CheckCircle, XCircle, Database, RefreshCw } from 'lucide-react';
import { useToast, Toast } from '@/components/Toast';

export default function DashboardPage() {
    const searchParams = useSearchParams();
    const [showSuccess, setShowSuccess] = useState(false);

    const router = useRouter();

    useEffect(() => {
        // Dashboard should never be seen, redirect to patients
        router.replace('/dashboard/patients');
    }, [router]);

    useEffect(() => {
        if (searchParams.get('sessionId')) {
            setShowSuccess(true);
            // Hide after 5 seconds
            const timer = setTimeout(() => setShowSuccess(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [searchParams]);

    return (
        <div className="space-y-8">
            {showSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <span className="font-medium">Prijava uspješna! Dobrodošli u WBS_fhir sustav.</span>
                    </div>
                    <button onClick={() => setShowSuccess(false)} className="text-emerald-400 hover:text-emerald-600">
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-lg">
                <h1 className="text-3xl font-bold mb-2">Dobrodošli, Dr. Horvat 👋</h1>
                <p className="text-blue-100 opacity-90">Sustav je spreman za rad. CEZIH servisi su aktivni.</p>

                <div className="mt-6 flex flex-wrap gap-4">
                    <Link
                        href="/dashboard/patients"
                        className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-lg backdrop-blur-sm transition-all text-sm font-medium border border-white/20 flex items-center gap-2"
                    >
                        <Users className="w-4 h-4" />
                        Pretraga pacijenata
                    </Link>
                    <Link
                        href="/dashboard/calendar"
                        className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-lg backdrop-blur-sm transition-all text-sm font-medium border border-white/20 flex items-center gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        Moj kalendar
                    </Link>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-700">Današnji posjeti</h3>
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
                            <Calendar className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">8</div>
                    <p className="text-sm text-slate-500 mt-1">2 završena, 1 u tijeku</p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-700">Novi nalazi</h3>
                        <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                            <FileText className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">12</div>
                    <p className="text-sm text-slate-500 mt-1">Poslano u CEZIH danas</p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-700">Status sustava</h3>
                        <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                            <Activity className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-emerald-600 flex items-center gap-2">
                        Online
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">Svi servisi dostupni</p>
                </div>
            </div>

            {/* Certification Task Checklist (Quick Access) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-500" />
                        Ključni procesi za certifikaciju
                    </div>
                    <span className="text-xs text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                        Odabrani test cases
                    </span>
                </div>
                <div className="divide-y divide-slate-100">
                    <Link href="/dashboard/patients" className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                TC10
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-900">Pretraga pacijenta (MBO/OIB)</h4>
                                <p className="text-sm text-slate-500">Dohvat podataka iz CEZIH registra</p>
                            </div>
                        </div>
                        <div className="text-slate-400 group-hover:translate-x-1 transition-transform">→</div>
                    </Link>

                    <Link href="/dashboard/patients/register-foreigner" className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                TC11
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-900">Registracija stranog pacijenta</h4>
                                <p className="text-sm text-slate-500">IHE PMIR profil</p>
                            </div>
                        </div>
                        <div className="text-slate-400 group-hover:translate-x-1 transition-transform">→</div>
                    </Link>

                    <Link href="/dashboard/patients" className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                TC18
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-900">Slanje nalaza (IHE MHD)</h4>
                                <p className="text-sm text-slate-500">Kreiranje, potpisivanje i slanje dokumenata</p>
                            </div>
                        </div>
                        <div className="text-slate-400 group-hover:translate-x-1 transition-transform">→</div>
                    </Link>
                </div>
            </div>

            {/* Terminology & Maintenance */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                        <Database className="w-4 h-4 text-slate-500" />
                        Održavanje i sinkronizacija
                    </div>
                </div>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex-1">
                            <h4 className="font-medium text-slate-900">Nacionalni šifrarnici (MKB-10, Postupci)</h4>
                            <p className="text-sm text-slate-500">Sinkronizacija lokalne baze s CEZIH terminološkim servisima (IHE SVCM).</p>
                        </div>
                        <SyncButton />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SyncButton() {
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const { toast, showToast, hideToast } = useToast();

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/terminology/sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setLastSync(new Date().toLocaleString('hr-HR'));
                showToast('success', `Sinkronizacija uspješna! Dohvaćeno ${data.codeSystems} sustava kodova.`);
            }
        } catch (err) {
            showToast('error', 'Greška pri sinkronizaciji.');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <>
            <Toast toast={toast} onClose={hideToast} />
            <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors font-medium border border-slate-200 disabled:opacity-50"
            >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sinkronizacija...' : 'Sinkroniziraj odmah'}
            </button>
        </>
    );
}
