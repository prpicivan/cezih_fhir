'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Building2, User, BookOpen, Tag, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';

type Tab = 'organizations' | 'practitioners' | 'codeSystems' | 'valueSets';

// ─── helpers ──────────────────────────────────────────────────
function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('hr-HR', { dateStyle: 'short', timeStyle: 'short' });
}

function shortUrl(url: string) {
    // Strip common FHIR prefixes for readability
    return url
        .replace('http://fhir.cezih.hr/specifikacije/CodeSystem/', '')
        .replace('http://fhir.cezih.hr/specifikacije/ValueSet/', '')
        .replace('http://hl7.org/fhir/', '')
        .replace('http://terminology.hl7.org/', '');
}

function EmptyState({ synced, onSync, loading }: { synced: boolean; onSync: () => void; loading: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <AlertCircle className="w-8 h-8 opacity-40" />
            <p className="text-sm">{synced ? 'Nema podataka.' : 'Podaci još nisu sinkronizirani s CEZIH-om.'}</p>
            <button
                onClick={onSync}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
            >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Sinkronizacija...' : 'Sinkroniziraj sada (TC7 + TC8)'}
            </button>
        </div>
    );
}

// ─── Tab: CodeSystems ─────────────────────────────────────────
function CodeSystemsTab() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/terminology/local-code-systems');
            const data = await res.json();
            if (data.success) setRows(data.codeSystems);
            else setError(data.error || 'Greška');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const syncAndReload = async () => {
        setSyncing(true);
        try {
            await fetch('/api/terminology/sync', { method: 'POST' });
        } catch { /* ignore */ }
        setSyncing(false);
        await load();
    };

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold text-slate-800">Šifrarnici — CodeSystems</h2>
                    <p className="text-xs text-slate-500 mt-0.5">IHE SVCM ITI-96 · lokalno pohranjena kopija iz CEZIH-a</p>
                </div>
                <div className="flex items-center gap-2">
                    {rows.length > 0 && (
                        <span className="text-xs text-slate-400">{rows.length} šifrarnik{rows.length === 1 ? '' : rows.length < 5 ? 'a' : 'a'}</span>
                    )}
                    <button
                        onClick={syncAndReload}
                        disabled={syncing || loading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 hover:border-blue-300 hover:text-blue-600 rounded-lg transition disabled:opacity-40"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Sinkronizacija...' : 'Osvježi (TC7)'}
                    </button>
                </div>
            </div>

            {error && <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-sm">{error}</div>}

            {loading ? (
                <div className="flex justify-center py-12 text-slate-400 text-sm">Učitavanje...</div>
            ) : rows.length === 0 ? (
                <EmptyState synced={false} onSync={syncAndReload} loading={syncing} />
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-5 py-3">Šifrarnik (URL)</th>
                                <th className="px-5 py-3 text-center">Br. koncepata</th>
                                <th className="px-5 py-3">Zadnja sinkronizacija</th>
                                <th className="px-5 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((cs, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3">
                                        <span className="font-mono text-xs text-slate-700 block">{shortUrl(cs.system)}</span>
                                        <span className="text-[10px] text-slate-400 block truncate max-w-xs" title={cs.system}>{cs.system}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${cs.conceptCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {cs.conceptCount}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 opacity-50" />
                                            {formatDate(cs.lastSync)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                            <CheckCircle className="w-3 h-3" /> Sinkronizirano
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Tab: ValueSets ───────────────────────────────────────────
function ValueSetsTab() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/terminology/local-value-sets');
            const data = await res.json();
            if (data.success) setRows(data.valueSets);
            else setError(data.error || 'Greška');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const syncAndReload = async () => {
        setSyncing(true);
        try {
            await fetch('/api/terminology/sync', { method: 'POST' });
        } catch { /* ignore */ }
        setSyncing(false);
        await load();
    };

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold text-slate-800">Skupovi vrijednosti — ValueSets</h2>
                    <p className="text-xs text-slate-500 mt-0.5">IHE SVCM ITI-95 · lokalno pohranjena kopija iz CEZIH-a</p>
                </div>
                <div className="flex items-center gap-2">
                    {rows.length > 0 && (
                        <span className="text-xs text-slate-400">{rows.length} set{rows.length === 1 ? '' : 'ova'}</span>
                    )}
                    <button
                        onClick={syncAndReload}
                        disabled={syncing || loading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 hover:border-blue-300 hover:text-blue-600 rounded-lg transition disabled:opacity-40"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Sinkronizacija...' : 'Osvježi (TC8)'}
                    </button>
                </div>
            </div>

            {error && <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-sm">{error}</div>}

            {loading ? (
                <div className="flex justify-center py-12 text-slate-400 text-sm">Učitavanje...</div>
            ) : rows.length === 0 ? (
                <EmptyState synced={false} onSync={syncAndReload} loading={syncing} />
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-5 py-3">Naziv</th>
                                <th className="px-5 py-3">URL</th>
                                <th className="px-5 py-3">Verzija</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Zadnja sinkronizacija</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((vs, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3">
                                        <span className="font-medium text-slate-800 text-xs block">{vs.title || vs.name || '—'}</span>
                                        {vs.title && vs.name && vs.title !== vs.name && (
                                            <span className="text-[10px] text-slate-400">{vs.name}</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="font-mono text-[10px] text-slate-500 block truncate max-w-[220px]" title={vs.url}>
                                            {shortUrl(vs.url)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{vs.version || '—'}</td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${vs.status === 'active' ? 'bg-emerald-100 text-emerald-700' : vs.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {vs.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                            {vs.status || '—'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 opacity-50" />
                                            {formatDate(vs.lastSync)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Tab: Organizations / Practitioners ───────────────────────
function RegistrySearchTab({ type }: { type: 'organization' | 'practitioner' }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const endpoint = type === 'organization'
                ? `/api/registry/organizations?active=true&name=${encodeURIComponent(searchTerm)}`
                : `/api/registry/practitioners?name=${encodeURIComponent(searchTerm)}`;
            const res = await fetch(endpoint);
            const data = await res.json();
            if (data.success) {
                setResults(type === 'organization' ? data.organizations : data.practitioners);
            } else {
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
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-slate-800">
                    {type === 'organization' ? 'Pretraga Organizacija' : 'Pretraga Djelatnika'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">IHE mCSD ITI-90 · live pretraga CEZIH imenika (TC9)</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={type === 'organization' ? 'Naziv ustanove (npr. KBC)...' : 'Ime i prezime liječnika...'}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
                    >
                        {loading ? 'Pretražujem...' : 'Pretraži'}
                    </button>
                </form>
            </div>

            {error && <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-sm">{error}</div>}

            {results.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-5 py-3">Naziv / Ime</th>
                                <th className="px-5 py-3">Identifikator</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Tip / Specijalizacija</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3 font-medium text-slate-900">{item.name}</td>
                                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{item.identifier?.[0]?.value || '—'}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {item.active ? 'Aktivan' : 'Neaktivan'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-600">
                                        {item.resourceType === 'Organization'
                                            ? (item.type?.[0]?.text || 'Ustanova')
                                            : (item.qualification?.[0]?.code?.text || 'Liječnik')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : !loading && !error && (
                <div className="text-center py-12 text-slate-400 text-sm italic">
                    Unesite pojamove za pretragu...
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ComponentType<any>; tc?: string }[] = [
    { id: 'organizations', label: 'Organizacije', icon: Building2, tc: 'TC9' },
    { id: 'practitioners', label: 'Djelatnici', icon: User, tc: 'TC9' },
    { id: 'codeSystems', label: 'Šifrarnici', icon: BookOpen, tc: 'TC7' },
    { id: 'valueSets', label: 'Skupovi vrijednosti', icon: Tag, tc: 'TC8' },
];

export default function RegistryPage() {
    const [activeTab, setActiveTab] = useState<Tab>('organizations');

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">CEZIH Registri</h1>
                <p className="text-slate-500 text-sm mt-0.5">Pregled organizacija, djelatnika, šifrarnika i skupova vrijednosti iz CEZIH sustava</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px ${isActive
                                    ? 'border-blue-500 text-blue-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {tab.tc && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {tab.tc}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div>
                {activeTab === 'organizations' && <RegistrySearchTab type="organization" />}
                {activeTab === 'practitioners' && <RegistrySearchTab type="practitioner" />}
                {activeTab === 'codeSystems' && <CodeSystemsTab />}
                {activeTab === 'valueSets' && <ValueSetsTab />}
            </div>
        </div>
    );
}
