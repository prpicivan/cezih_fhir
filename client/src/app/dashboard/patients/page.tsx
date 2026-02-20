'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, UserPlus, FileText, Calendar, Filter } from 'lucide-react';

export default function PatientsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState('mbo');
    const [loading, setLoading] = useState(false);
    const [patients, setPatients] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchTerm) return;

        setLoading(true);
        setError(null);
        setPatients([]);

        try {
            const res = await fetch(`/api/patient/search?${searchType}=${searchTerm}`);
            const data = await res.json();

            if (data.success) {
                setPatients(data.patients);
            } else {
                setError(data.error || 'Pretraga nije uspjela');
            }
        } catch (err: any) {
            setError(err.message || 'Greška u komunikaciji');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Pacijenti</h1>
                    <p className="text-slate-500">Upravljanje kartotekom i registracija</p>
                </div>
                <Link
                    href="/dashboard/patients/register-foreigner"
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    <UserPlus className="w-4 h-4" />
                    Registracija stranca (TC 11)
                </Link>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <form onSubmit={handleSearch} className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Pretraga po identifikatoru (TC 10)</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={searchType === 'mbo' ? 'Unesite MBO pacijenta...' : 'Unesite OIB pacijenta...'}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>
                    <div className="w-48">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tip identifikatora</label>
                        <select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                        >
                            <option value="mbo">MBO</option>
                            <option value="oib">OIB</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !searchTerm}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Pretražujem...' : 'Pretraži'}
                    </button>
                </form>
            </div>

            {/* Results */}
            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                    <span>⚠️ {error}</span>
                </div>
            )}

            {patients.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th className="px-6 py-3">Ime i prezime</th>
                                <th className="px-6 py-3">MBO</th>
                                <th className="px-6 py-3">OIB</th>
                                <th className="px-6 py-3">Datum rođenja</th>
                                <th className="px-6 py-3 text-right">Akcije</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {patients.map((patient) => (
                                <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {patient.name.given.join(' ')} {patient.name.family}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 font-mono text-sm">{patient.mbo || '-'}</td>
                                    <td className="px-6 py-4 text-slate-600 font-mono text-sm">{patient.oib || '-'}</td>
                                    <td className="px-6 py-4 text-slate-600">{patient.birthDate}</td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <Link
                                            href={`/dashboard/visit/new?patientId=${patient.id}&mbo=${patient.mbo}`}
                                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-emerald-700 bg-emerald-100 hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                                        >
                                            <Calendar className="w-3 h-3 mr-1" />
                                            Novi posjet (TC 12)
                                        </Link>
                                        <Link
                                            href={`/dashboard/patients/${patient.mbo}`}
                                            className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                        >
                                            <FileText className="w-3 h-3 mr-1" />
                                            Povijest (TC 15)
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                !loading && !error && (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
                        <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <Search className="w-6 h-6 text-slate-400" />
                        </div>
                        <h3 className="text-sm font-medium text-slate-900">Nema rezultata</h3>
                        <p className="text-sm text-slate-500 mt-1">Unesite MBO ili OIB za pretragu pacijenata.</p>
                    </div>
                )
            )}
        </div>
    );
}
