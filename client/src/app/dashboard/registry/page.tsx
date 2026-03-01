'use client';

import { useState } from 'react';
import { Search, Building2, User } from 'lucide-react';

export default function RegistrySearchPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<'organization' | 'practitioner'>('organization');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults([]);

        try {
            const endpoint = searchType === 'organization'
                ? `/api/registry/organizations?active=true&name=${encodeURIComponent(searchTerm)}`
                : `/api/registry/practitioners?name=${encodeURIComponent(searchTerm)}`;

            const res = await fetch(endpoint);
            const data = await res.json();

            if (data.success) {
                setResults(searchType === 'organization' ? data.organizations : data.practitioners);
            } else {
                // Show a friendly message for the known CEZIH 404 case
                const msg = data.error || 'Greška u komunikaciji.';
                setError(msg.includes('nije dostupna') ? msg : `Greška: ${msg}`);
            }
        } catch (err: any) {
            setError(err.message || 'Greška u komunikaciji.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Registar Subjekata (TC 9)</h1>
                <p className="text-slate-500">Pretraga organizacija i djelatnika u CEZIH imeniku (IHE mCSD)</p>
            </div>

            {/* Search Box */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <form onSubmit={handleSearch} className="space-y-4">
                    <div className="flex gap-4">
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition ${searchType === 'organization' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'hover:bg-slate-50 border-slate-200'}`}>
                            <input
                                type="radio"
                                name="type"
                                checked={searchType === 'organization'}
                                onChange={() => setSearchType('organization')}
                                className="hidden"
                            />
                            <Building2 className="w-4 h-4" />
                            Pretraga Organizacija
                        </label>
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition ${searchType === 'practitioner' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'hover:bg-slate-50 border-slate-200'}`}>
                            <input
                                type="radio"
                                name="type"
                                checked={searchType === 'practitioner'}
                                onChange={() => setSearchType('practitioner')}
                                className="hidden"
                            />
                            <User className="w-4 h-4" />
                            Pretraga Djelatnika
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={searchType === 'organization' ? 'Naziv ustanove (npr. KBC)...' : 'Ime i prezime liječnika...'}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Pretražujem...' : 'Pretraži'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Results */}
            {error && <div className="p-4 bg-rose-50 text-rose-700 rounded-lg border border-rose-200">{error}</div>}

            {results.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Naziv / Ime</th>
                                <th className="px-6 py-3">Identifikator</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Tip / Specijalizacija</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {item.name}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-slate-600">
                                        {item.identifier?.[0]?.value || '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {item.active ? 'Aktivan' : 'Neaktivan'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {item.resourceType === 'Organization'
                                            ? (item.type?.[0]?.text || 'Ustanova')
                                            : (item.qualification?.[0]?.code?.text || 'Liječnik')
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : !loading && !error && (
                <div className="text-center py-12 text-slate-400 italic">
                    Unesite pojmove za pretragu...
                </div>
            )}
        </div>
    );
}
