'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Building2, User, BookOpen, Tag, RefreshCw, AlertCircle, CheckCircle, Clock, Hash, Copy, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';

type Tab = 'organizations' | 'practitioners' | 'locations' | 'practitionerRoles' | 'healthcareServices' | 'endpoints' | 'orgAffiliations' | 'codeSystems' | 'valueSets' | 'oid';

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
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [concepts, setConcepts] = useState<Record<string, any[]>>({});
    const [loadingConcepts, setLoadingConcepts] = useState<Record<string, boolean>>({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/terminology/local-code-systems', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setRows(data.codeSystems);
            else setError(data.error || 'Greška');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchConcepts = async (system: string) => {
        if (concepts[system]) return;
        setLoadingConcepts(prev => ({ ...prev, [system]: true }));
        try {
            const res = await fetch(`/api/terminology/local-concepts?system=${encodeURIComponent(system)}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                setConcepts(prev => ({ ...prev, [system]: data.concepts }));
            }
        } catch (e) {
            console.error('Failed to fetch concepts', e);
        } finally {
            setLoadingConcepts(prev => ({ ...prev, [system]: false }));
        }
    };

    const toggleRow = (system: string) => {
        if (expandedRow === system) {
            setExpandedRow(null);
        } else {
            setExpandedRow(system);
            fetchConcepts(system);
        }
    };

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
                                <th className="px-5 py-3 w-10"></th>
                                <th className="px-5 py-3">Šifrarnik (URL)</th>
                                <th className="px-5 py-3 text-center">Br. koncepata</th>
                                <th className="px-5 py-3">Zadnja sinkronizacija</th>
                                <th className="px-5 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((cs, i) => (
                                <React.Fragment key={i}>
                                    <tr 
                                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedRow === cs.system ? 'bg-blue-50/30' : ''}`}
                                        onClick={() => toggleRow(cs.system)}
                                    >
                                        <td className="px-5 py-3 text-slate-400">
                                            {expandedRow === cs.system ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </td>
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
                                    {expandedRow === cs.system && (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-4 bg-slate-50/50 border-y border-slate-100">
                                                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-inner">
                                                    {loadingConcepts[cs.system] ? (
                                                        <div className="p-8 text-center text-xs text-slate-400 animate-pulse flex items-center justify-center gap-2">
                                                            <RefreshCw className="w-4 h-4 animate-spin" /> Dohvaćam koncepte...
                                                        </div>
                                                    ) : !concepts[cs.system] || concepts[cs.system].length === 0 ? (
                                                        <div className="p-8 text-center text-xs text-slate-400 italic">Nema dostupnih koncepata za ovaj šifrarnik.</div>
                                                    ) : (
                                                        <table className="w-full text-left text-xs border-collapse">
                                                            <thead className="sticky top-0 bg-slate-100 text-slate-500 border-b border-slate-200">
                                                                <tr>
                                                                    <th className="px-4 py-2 font-bold uppercase tracking-wider w-1/3">Kod</th>
                                                                    <th className="px-4 py-2 font-bold uppercase tracking-wider text-center w-8"></th>
                                                                    <th className="px-4 py-2 font-bold uppercase tracking-wider">Naziv (Display)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {concepts[cs.system].map((c, idx) => (
                                                                    <tr key={idx} className="hover:bg-slate-50">
                                                                        <td className="px-4 py-2 font-mono text-blue-600 bg-blue-50/10">{c.code}</td>
                                                                        <td className="px-4 py-2 text-slate-300 text-center"><ArrowRight className="w-3 h-3 mx-auto" /></td>
                                                                        <td className="px-4 py-2 text-slate-700 font-medium">{c.display}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
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
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [concepts, setConcepts] = useState<Record<string, any[]>>({});
    const [loadingConcepts, setLoadingConcepts] = useState<Record<string, boolean>>({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/terminology/local-value-sets', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setRows(data.valueSets);
            else setError(data.error || 'Greška');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchConcepts = async (url: string) => {
        if (concepts[url]) return;
        setLoadingConcepts(prev => ({ ...prev, [url]: true }));
        try {
            // ValueSets refer to CodeSystems. For simple demo, we fetch concepts associated with this ValueSet URL
            // (In a real scenario, we might need to look up the Compose part, but here we reuse the same concepts table)
            const res = await fetch(`/api/terminology/local-concepts?system=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (data.success) {
                setConcepts(prev => ({ ...prev, [url]: data.concepts }));
            }
        } catch (e) {
            console.error('Failed to fetch concepts', e);
        } finally {
            setLoadingConcepts(prev => ({ ...prev, [url]: false }));
        }
    };

    const toggleRow = (url: string) => {
        if (expandedRow === url) {
            setExpandedRow(null);
        } else {
            setExpandedRow(url);
            fetchConcepts(url);
        }
    };

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
                                <th className="px-5 py-3 w-10"></th>
                                <th className="px-5 py-3">Naziv</th>
                                <th className="px-5 py-3">URL</th>
                                <th className="px-5 py-3">Verzija</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Zadnja sinkronizacija</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((vs, i) => (
                                <React.Fragment key={i}>
                                    <tr 
                                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedRow === vs.url ? 'bg-blue-50/30' : ''}`}
                                        onClick={() => toggleRow(vs.url)}
                                    >
                                        <td className="px-5 py-3 text-slate-400">
                                            {expandedRow === vs.url ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </td>
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
                                    {expandedRow === vs.url && (
                                        <tr>
                                            <td colSpan={6} className="px-5 py-4 bg-slate-50/50 border-y border-slate-100">
                                                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-inner">
                                                    {loadingConcepts[vs.url] ? (
                                                        <div className="p-8 text-center text-xs text-slate-400 animate-pulse flex items-center justify-center gap-2">
                                                            <RefreshCw className="w-4 h-4 animate-spin" /> Dohvaćam koncepte...
                                                        </div>
                                                    ) : !concepts[vs.url] || concepts[vs.url].length === 0 ? (
                                                        <div className="p-8 text-center text-xs text-slate-400 italic">Nema dostupnih koncepata za ovaj skup vrijednosti.</div>
                                                    ) : (
                                                        <table className="w-full text-left text-xs border-collapse">
                                                            <thead className="sticky top-0 bg-slate-100 text-slate-500 border-b border-slate-200">
                                                                <tr>
                                                                    <th className="px-4 py-2 font-bold uppercase tracking-wider w-1/3">Kod</th>
                                                                    <th className="px-4 py-2 font-bold uppercase tracking-wider text-center w-8"></th>
                                                                    <th className="px-4 py-2 font-bold uppercase tracking-wider">Naziv (Display)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {concepts[vs.url].map((c, idx) => (
                                                                    <tr key={idx} className="hover:bg-slate-50">
                                                                        <td className="px-4 py-2 font-mono text-blue-600 bg-blue-50/10">{c.code}</td>
                                                                        <td className="px-4 py-2 text-slate-300 text-center"><ArrowRight className="w-3 h-3 mx-auto" /></td>
                                                                        <td className="px-4 py-2 text-slate-700 font-medium">{c.display}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Component: ResourceDetails ──────────────────────────────
function ResourceDetails({ resource, type, isOpen, onClose }: { resource: any; type: string; isOpen: boolean; onClose: () => void }) {
    const [history, setHistory] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (isOpen && resource?.id) {
            const fetchHistory = async () => {
                setLoadingHistory(true);
                try {
                    const resType = resource.resourceType;
                    const res = await fetch(`/api/registry/${resType}/${resource.id}/_history`);
                    const data = await res.json();
                    if (data.success) setHistory(data.history);
                } catch (e) {
                    console.error('Failed to fetch history', e);
                } finally {
                    setLoadingHistory(false);
                }
            };
            fetchHistory();
        } else {
            setHistory(null);
        }
    }, [isOpen, resource]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider">
                                {resource.resourceType}
                            </span>
                            <h2 className="text-lg font-bold text-slate-800">
                                {typeof resource.name === 'string' ? resource.name : resource.id}
                            </h2>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {resource.id}</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* JSON Data */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            Sirovni podaci (FHIR JSON)
                        </h3>
                        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto text-[11px] font-mono text-blue-300 shadow-inner max-h-[400px]">
                            <pre>{JSON.stringify(resource, null, 2)}</pre>
                        </div>
                    </div>

                    {/* History */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-slate-400" />
                            Povijest mCSD resursa
                        </h3>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden min-h-[100px]">
                            {loadingHistory ? (
                                <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                    <p className="text-xs">Učitavam povijest...</p>
                                </div>
                            ) : history?.entry?.length > 0 ? (
                                <div className="divide-y divide-slate-200">
                                    {history.entry.map((e: any, i: number) => (
                                        <div key={i} className="p-4 hover:bg-white transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                                    Verzija {e.resource.meta?.versionId || history.entry.length - i}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {formatDate(e.resource.meta?.lastUpdated)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-600 font-medium">
                                                {e.request?.method || 'GET'} - {e.response?.status || '200 OK'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-12 text-center text-slate-300 italic text-xs">
                                    Povijest nije dostupna za ovaj resurs.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors"
                    >
                        Zatvori
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Tab: Organizations / Practitioners ───────────────────────
function RegistrySearchTab({ type }: { type: 'organization' | 'practitioner' | 'location' | 'practitionerRole' | 'healthcareService' | 'endpoint' | 'organizationAffiliation' }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedResource, setSelectedResource] = useState<any>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const resType = type.charAt(0).toUpperCase() + type.slice(1);
            const endpoint = `/api/registry/${resType}?active=true&name=${encodeURIComponent(searchTerm)}`;
            const res = await fetch(endpoint);
            const data = await res.json();
            if (data.success) {
                const key = type.endsWith('y') ? type.slice(0, -1) + 'ies' : type + 's';
                setResults(data[key] || []);
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
                    {type === 'organization' ? 'Pretraga Organizacija' : 
                     type === 'practitioner' ? 'Pretraga Djelatnika' :
                     type === 'location' ? 'Pretraga Lokacija' :
                     type === 'practitionerRole' ? 'Pretraga Uloga' :
                     type === 'healthcareService' ? 'Pretraga Usluga' :
                     type === 'endpoint' ? 'Pretraga Endpointova' :
                     'Pretraga Relacija'}
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
                            placeholder={
                                type === 'organization' ? 'Naziv ustanove (npr. KBC)...' : 
                                type === 'practitioner' ? 'Ime i prezime liječnika...' :
                                type === 'location' ? 'Naziv lokacije...' :
                                'Pretraga...'
                            }
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
                                <tr key={i} 
                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedResource(item)}
                                >
                                    <td className="px-5 py-3 font-medium text-slate-900">
                                        <div className="flex items-center gap-2">
                                            {typeof item.name === 'string'
                                                ? item.name
                                                : Array.isArray(item.name)
                                                    ? item.name.map((n: any) => [n.given?.join(' '), n.family].filter(Boolean).join(' ')).join(', ')
                                                    : item.name?.family
                                                        ? [item.name.given?.join(' '), item.name.family].filter(Boolean).join(' ')
                                                        : item.id}
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                        </div>
                                    </td>
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

            <ResourceDetails 
                resource={selectedResource} 
                type={type} 
                isOpen={!!selectedResource} 
                onClose={() => setSelectedResource(null)} 
            />
        </div>
    );
}

// ─── Tab: OID Generation (TC6) ────────────────────────────────
function OidTab() {
    const [quantity, setQuantity] = useState(1);
    const [oids, setOids] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<number | null>(null);

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/oid/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity }),
            });
            const data = await res.json();
            if (data.success) {
                setOids(prev => [...data.oids, ...prev]);
            } else {
                setError(data.error || 'Greška pri generiranju OID-a');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const copyOid = (oid: string, idx: number) => {
        navigator.clipboard.writeText(oid);
        setCopied(idx);
        setTimeout(() => setCopied(null), 1500);
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-slate-800">Generiranje OID-ova</h2>
                <p className="text-xs text-slate-500 mt-0.5">CEZIH OID servis · TC6 — generiranje jedinstvenih identifikatora dokumenata</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-end gap-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Količina</label>
                        <input
                            type="number"
                            min={1}
                            max={50}
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, Math.min(50, Number(e.target.value))))}
                            className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={generate}
                        disabled={loading}
                        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
                    >
                        <Hash className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Generiram...' : 'Generiraj OID (TC6)'}
                    </button>
                </div>
            </div>

            {error && <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-sm">{error}</div>}

            {oids.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-5 py-3 w-10">#</th>
                                <th className="px-5 py-3">OID</th>
                                <th className="px-5 py-3 w-20 text-center">Kopiraj</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {oids.map((oid, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3 text-xs text-slate-400">{i + 1}</td>
                                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{oid}</td>
                                    <td className="px-5 py-3 text-center">
                                        <button
                                            onClick={() => copyOid(oid, i)}
                                            className="p-1 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors"
                                            title="Kopiraj OID"
                                        >
                                            {copied === i ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : !loading && (
                <div className="text-center py-12 text-slate-400 text-sm italic">
                    Kliknite "Generiraj OID" za generiranje jedinstvenih identifikatora...
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ComponentType<any>; tc?: string; resource?: string }[] = [
    { id: 'oid', label: 'OID Generator', icon: Hash, tc: 'TC6' },
    { id: 'codeSystems', label: 'Šifrarnici', icon: BookOpen, tc: 'TC7' },
    { id: 'valueSets', label: 'Skupovi vrijednosti', icon: Tag, tc: 'TC8' },
    { id: 'organizations', label: 'Organizacije', icon: Building2, tc: 'TC9', resource: 'organization' },
    { id: 'practitioners', label: 'Djelatnici', icon: User, tc: 'TC9', resource: 'practitioner' },
    { id: 'locations', label: 'Lokacije', icon: Clock, tc: 'TC9', resource: 'location' },
    { id: 'practitionerRoles', label: 'Uloge', icon: Tag, tc: 'TC9', resource: 'practitionerRole' },
    { id: 'healthcareServices', label: 'Usluge', icon: BookOpen, tc: 'TC9', resource: 'healthcareService' },
    { id: 'endpoints', label: 'Endpointovi', icon: ArrowRight, tc: 'TC9', resource: 'endpoint' },
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
                {activeTab === 'oid' && <OidTab />}
                {activeTab === 'organizations' && <RegistrySearchTab type="organization" />}
                {activeTab === 'practitioners' && <RegistrySearchTab type="practitioner" />}
                {activeTab === 'locations' && <RegistrySearchTab type="location" />}
                {activeTab === 'practitionerRoles' && <RegistrySearchTab type="practitionerRole" />}
                {activeTab === 'healthcareServices' && <RegistrySearchTab type="healthcareService" />}
                {activeTab === 'endpoints' && <RegistrySearchTab type="endpoint" />}
                {activeTab === 'orgAffiliations' && <RegistrySearchTab type="organizationAffiliation" />}
                {activeTab === 'codeSystems' && <CodeSystemsTab />}
                {activeTab === 'valueSets' && <ValueSetsTab />}
            </div>
        </div>
    );
}
