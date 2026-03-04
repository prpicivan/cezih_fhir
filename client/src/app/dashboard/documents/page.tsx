'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { FileText, RefreshCw, XCircle, Search, Eye, Filter, Save, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface DiagnosisSuggestion {
    code: string;
    display: string;
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Toast notification state
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
    };

    // Replacement State
    const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
    const [docToReplace, setDocToReplace] = useState<any>(null);
    const [replaceData, setReplaceData] = useState({
        anamnesis: '',
        status: '',
        finding: '',
        recommendation: '',
        diagnosisCode: '',
        diagnosisDisplay: '',
    });

    // Diagnosis autocomplete state
    const [diagnosisQuery, setDiagnosisQuery] = useState('');
    const [diagSuggestions, setDiagSuggestions] = useState<DiagnosisSuggestion[]>([]);
    const [showDiagSuggestions, setShowDiagSuggestions] = useState(false);
    const [searchingDiag, setSearchingDiag] = useState(false);
    const [diagnosisSelected, setDiagnosisSelected] = useState(false);
    const diagSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const diagDropdownRef = useRef<HTMLDivElement>(null);

    const searchDiagnoses = useCallback(async (q: string) => {
        if (q.length < 2) { setDiagSuggestions([]); return; }
        setSearchingDiag(true);
        try {
            const res = await fetch(`/api/terminology/diagnoses?q=${encodeURIComponent(q)}&limit=10`);
            const data = await res.json();
            setDiagSuggestions(data.results || []);
            setShowDiagSuggestions(true);
        } catch {
            setDiagSuggestions([]);
        } finally {
            setSearchingDiag(false);
        }
    }, []);

    const handleDiagnosisInput = (value: string) => {
        setDiagnosisQuery(value);
        setDiagnosisSelected(false);
        setReplaceData(d => ({ ...d, diagnosisCode: '', diagnosisDisplay: '' }));
        if (diagSearchRef.current) clearTimeout(diagSearchRef.current);
        diagSearchRef.current = setTimeout(() => searchDiagnoses(value), 300);
    };

    const handleSelectDiagnosis = (s: DiagnosisSuggestion) => {
        setReplaceData(d => ({ ...d, diagnosisCode: s.code, diagnosisDisplay: s.display }));
        setDiagnosisQuery(`${s.code} - ${s.display}`);
        setDiagnosisSelected(true);
        setShowDiagSuggestions(false);
        setDiagSuggestions([]);
    };

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (diagDropdownRef.current && !diagDropdownRef.current.contains(e.target as Node)) {
                setShowDiagSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const fetchDocuments = () => {
        setLoading(true);
        const queryParams = new URLSearchParams();

        const mbo = getMboFromSearch(searchTerm);
        const oid = getOidFromSearch(searchTerm);

        console.log('[DEBUG] Search:', { searchTerm, mbo, oid, statusFilter });

        if (mbo) queryParams.append('patientMbo', mbo);
        if (oid) queryParams.append('id', oid);
        if (statusFilter !== 'all') queryParams.append('status', statusFilter);

        const url = `/api/document/search?${queryParams.toString()}`;
        console.log('[DEBUG] URL:', url);

        fetch(url)
            .then(res => res.json())
            .then(data => {
                console.log('[DEBUG] Result:', data);
                if (data.success) {
                    setDocuments(data.documents);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('[DEBUG] Error:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchDocuments();
    }, [statusFilter]);

    const getMboFromSearch = (term: string) => {
        const clean = term.trim();
        return clean.match(/^\d{9}$/) ? clean : '';
    };

    const getOidFromSearch = (term: string) => {
        const clean = term.trim().toLowerCase();

        let oidPart = clean;
        if (oidPart.startsWith('urn:oid:')) oidPart = oidPart.substring(8);
        if (oidPart.startsWith('oru:')) oidPart = oidPart.substring(4).trim();

        const match = oidPart.match(/2\.16\.[0-9.]+/);
        if (match) return match[0];

        return '';
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchDocuments();
    };

    const handleCancel = async (oid: string) => {
        if (!confirm('Jeste li sigurni da želite stornirati ovaj dokument?')) return;

        try {
            const res = await fetch('/api/document/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentOid: oid }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Dokument uspješno storniran.');
                fetchDocuments();
            } else {
                showToast('error', 'Greška: ' + data.error);
            }
        } catch (error) {
            showToast('error', 'Greška pri komunikaciji sa serverom.');
        }
    };

    const handleReplaceClick = (doc: any) => {
        setDocToReplace(doc);
        setReplaceData({
            anamnesis: doc.anamnesis || '',
            status: doc.status_text || '',
            finding: doc.finding || '',
            recommendation: doc.recommendation || '',
            diagnosisCode: doc.diagnosisCode || '',
            diagnosisDisplay: doc.diagnosisDisplay || '',
        });
        // Pre-fill diagnosis query if existing diagnosis
        if (doc.diagnosisCode) {
            setDiagnosisQuery(`${doc.diagnosisCode} - ${doc.diagnosisDisplay || ''}`);
            setDiagnosisSelected(true);
        } else {
            setDiagnosisQuery('');
            setDiagnosisSelected(false);
        }
        setIsReplaceModalOpen(true);
    };

    const [replaceError, setReplaceError] = useState<string | null>(null);

    const submitReplacement = async () => {
        if (!docToReplace) return;
        setReplaceError(null);

        if (!diagnosisSelected || !replaceData.diagnosisCode) {
            setReplaceError('Morate odabrati MKB-10 dijagnozu iz ponuđenog popisa.');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/document/replace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalDocumentOid: docToReplace.id,
                    type: docToReplace.type,
                    patientMbo: docToReplace.patientMbo,
                    practitionerId: '1234567',
                    organizationId: '999999999',
                    visitId: docToReplace.visitId,
                    title: `Zamjenski Nalaz: ${docToReplace.type}`,
                    ...replaceData,
                    date: new Date().toISOString()
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Dokument uspješno zamijenjen novom verzijom.');
                setIsReplaceModalOpen(false);
                fetchDocuments();
            } else {
                showToast('error', 'Greška: ' + data.error);
            }
        } catch (error) {
            showToast('error', 'Greška pri komunikaciji sa serverom.');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('hr-HR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'sent': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">Poslano</span>;
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">Stornirano</span>;
            case 'replaced': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">Zamijenjeno</span>;
            case 'current': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">Aktivno</span>;
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    const [selectedDocument, setSelectedDocument] = useState<any>(null);

    const handlePreview = (doc: any) => {
        setSelectedDocument(doc);
    };

    const closePreview = () => {
        setSelectedDocument(null);
    };

    return (
        <div className="space-y-6">
            {/* Toast notification */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border transition-all animate-in slide-in-from-top-2 ${toast.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                    {toast.type === 'success'
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        : <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    }
                    <span className="text-sm font-semibold">{toast.message}</span>
                    <button onClick={() => setToast(null)} className="ml-2 text-current opacity-50 hover:opacity-100">
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Klinički Dokumenti</h1>
                    <p className="text-gray-600">Pregled svih poslanih dokumenata (e-Nalazi)</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
                <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Pretraži po MBO (9 zam.) ili OID-u (2.16...)"
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Traži</button>
                </form>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                        className="border rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">Svi statusi</option>
                        <option value="sent">Poslano</option>
                        <option value="cancelled">Stornirano</option>
                        <option value="replaced">Zamijenjeno</option>
                    </select>
                </div>
            </div>

            {/* Documents Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datum</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tip Dokumenta</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pacijent</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OID</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcije</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">Učitavanje...</td></tr>
                        ) : documents.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">Nema pronađenih dokumenata.</td></tr>
                        ) : (
                            documents.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.createdAt)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{doc.type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="font-medium">{doc.firstName} {doc.lastName}</div>
                                        <div className="text-xs">{doc.patientMbo}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(doc.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono" title={doc.id}>{doc.id.substring(0, 15)}...</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                                        {(doc.status === 'sent' || doc.status === 'current') && (
                                            <>
                                                <button onClick={() => handleReplaceClick(doc)} className="text-blue-600 hover:text-blue-900" title="Zamijeni">
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleCancel(doc.id)} className="text-red-600 hover:text-red-900" title="Storniraj">
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        <button onClick={() => handlePreview(doc)} className="text-gray-400 hover:text-gray-600" title="Pregled">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Preview Modal */}
            {selectedDocument && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                Pregled Dokumenta
                            </h3>
                            <button onClick={closePreview} className="text-gray-400 hover:text-gray-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 block">Pacijent</span>
                                    <span className="font-medium">{selectedDocument.firstName} {selectedDocument.lastName} ({selectedDocument.patientMbo})</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Datum</span>
                                    <span className="font-medium">{formatDate(selectedDocument.createdAt)}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Tip</span>
                                    <span className="font-medium bg-slate-100 px-2 py-0.5 rounded">{selectedDocument.type}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Status</span>
                                    <span className="font-medium">{getStatusBadge(selectedDocument.status)}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-gray-500 block">Dokument OID (ID)</span>
                                    <span className="font-mono text-xs bg-slate-50 p-1 rounded block">{selectedDocument.id}</span>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-4">
                                <span className="text-gray-500 block mb-2 font-medium">Sadržaj dokumenta</span>
                                <div className="bg-slate-50 p-4 rounded-lg text-sm border border-slate-200 min-h-[150px] space-y-4">
                                    {(selectedDocument.anamnesis || selectedDocument.status_text || selectedDocument.finding || selectedDocument.recommendation || selectedDocument.diagnosisCode) ? (
                                        <div className="space-y-3 font-sans">
                                            {selectedDocument.diagnosisCode && (
                                                <div className="pb-2 border-b border-slate-200">
                                                    <span className="text-xs font-bold text-slate-400 uppercase">Dijagnoza:</span>
                                                    <div className="font-semibold">{selectedDocument.diagnosisCode} - {selectedDocument.diagnosisDisplay}</div>
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Anamneza:</span>
                                                <p className="mt-1">{selectedDocument.anamnesis}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Status:</span>
                                                <p className="mt-1">{selectedDocument.status_text}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Nalaz:</span>
                                                <p className="mt-1">{selectedDocument.finding}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Preporuka:</span>
                                                <p className="mt-1">{selectedDocument.recommendation}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="whitespace-pre-wrap font-serif">
                                            {selectedDocument.content || selectedDocument.data || "Nema tekstualnog sadržaja."}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                            <button onClick={closePreview} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm">
                                Zatvori
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Replace Modal */}
            {isReplaceModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-blue-50 rounded-t-xl">
                            <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-800">
                                <RefreshCw className="w-5 h-5" />
                                Zamjena Dokumenta (Nova Verzija)
                            </h3>
                            <button onClick={() => { setIsReplaceModalOpen(false); setReplaceError(null); }} className="text-gray-400 hover:text-gray-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                                <strong>Napomena:</strong> Slanjem zamjenskog dokumenta, originalna verzija (OID: {docToReplace?.id}) će biti označena kao povučena (&apos;replaced&apos;), ali ostaje u arhivi radi povijesti.
                            </p>

                            <div className="grid grid-cols-1 gap-4">
                                {/* MKB-10 Dijagnoza */}
                                <div className="relative" ref={diagDropdownRef}>
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                                        MKB-10 Dijagnoza <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative mt-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                        {searchingDiag && (
                                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin pointer-events-none" />
                                        )}
                                        {diagnosisSelected && (
                                            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                                        )}
                                        <input
                                            type="text"
                                            value={diagnosisQuery}
                                            onChange={e => handleDiagnosisInput(e.target.value)}
                                            onFocus={() => diagSuggestions.length > 0 && setShowDiagSuggestions(true)}
                                            placeholder="Pretraži po šifri ili nazivu (npr. J00, grip...)"
                                            className={`w-full border rounded-lg pl-10 pr-10 p-3 text-sm font-medium focus:outline-none focus:ring-2 transition-all ${diagnosisSelected
                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-100'
                                                : 'border-gray-200 text-gray-800 focus:border-blue-400 focus:ring-blue-100'
                                                }`}
                                        />
                                    </div>
                                    {showDiagSuggestions && diagSuggestions.length > 0 && (
                                        <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                                            {diagSuggestions.map(s => (
                                                <button
                                                    type="button"
                                                    key={s.code}
                                                    onMouseDown={() => handleSelectDiagnosis(s)}
                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0"
                                                >
                                                    <span className="font-bold text-blue-700 text-xs font-mono bg-blue-50 px-2 py-0.5 rounded-lg flex-shrink-0">{s.code}</span>
                                                    <span className="text-sm text-gray-700 font-medium truncate">{s.display}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Anamneza</label>
                                    <textarea
                                        className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                                        rows={3}
                                        value={replaceData.anamnesis}
                                        onChange={(e) => setReplaceData({ ...replaceData, anamnesis: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                                    <textarea
                                        className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                                        rows={2}
                                        value={replaceData.status}
                                        onChange={(e) => setReplaceData({ ...replaceData, status: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Nalaz</label>
                                    <textarea
                                        className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                                        rows={4}
                                        value={replaceData.finding}
                                        onChange={(e) => setReplaceData({ ...replaceData, finding: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Preporuka i Terapija</label>
                                    <textarea
                                        className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                                        rows={3}
                                        value={replaceData.recommendation}
                                        onChange={(e) => setReplaceData({ ...replaceData, recommendation: e.target.value })}
                                    />
                                </div>
                            </div>

                            {replaceError && (
                                <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm font-medium text-rose-700">{replaceError}</p>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                            <button onClick={() => { setIsReplaceModalOpen(false); setReplaceError(null); }} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm">
                                Odustani
                            </button>
                            <button
                                onClick={submitReplacement}
                                disabled={loading || !diagnosisSelected}
                                className={`px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${loading || !diagnosisSelected
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                            >
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Pošalji Zamjensku Verziju
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
