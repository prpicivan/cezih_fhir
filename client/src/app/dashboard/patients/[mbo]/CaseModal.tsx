'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, AlertCircle, CheckCircle2, Loader2, ClipboardList } from 'lucide-react';

interface DiagnosisSuggestion {
    code: string;
    display: string;
}

interface CaseModalProps {
    /** null = create mode (TC16), existing case object = edit mode (TC17) */
    existingCase: any | null;
    patientMbo: string;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CaseModal({ existingCase, patientMbo, onClose, onSuccess }: CaseModalProps) {
    const isEditMode = !!existingCase;

    const [form, setForm] = useState({
        title: existingCase?.title || existingCase?.diagnosisDisplay || '',
        diagnosisCode: existingCase?.diagnosisCode || '',
        diagnosisDisplay: existingCase?.diagnosisDisplay || '',
        startDate: existingCase?.start
            ? new Date(existingCase.start).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
    });

    const [diagnosisQuery, setDiagnosisQuery] = useState(
        existingCase?.diagnosisCode
            ? `${existingCase.diagnosisCode} - ${existingCase.diagnosisDisplay || ''}`
            : ''
    );
    const [suggestions, setSuggestions] = useState<DiagnosisSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchingDiag, setSearchingDiag] = useState(false);
    const [diagnosisSelected, setDiagnosisSelected] = useState(!!existingCase?.diagnosisCode);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const diagSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const searchDiagnoses = useCallback(async (q: string) => {
        if (q.length < 2) { setSuggestions([]); return; }
        setSearchingDiag(true);
        try {
            const res = await fetch(`/api/terminology/diagnoses?q=${encodeURIComponent(q)}&limit=10`);
            const data = await res.json();
            setSuggestions(data.results || []);
            setShowSuggestions(true);
        } catch {
            setSuggestions([]);
        } finally {
            setSearchingDiag(false);
        }
    }, []);

    const handleDiagnosisInput = (value: string) => {
        setDiagnosisQuery(value);
        setDiagnosisSelected(false);
        setForm(f => ({ ...f, diagnosisCode: '', diagnosisDisplay: '' }));
        if (diagSearchRef.current) clearTimeout(diagSearchRef.current);
        diagSearchRef.current = setTimeout(() => searchDiagnoses(value), 300);
    };

    const handleSelectDiagnosis = (s: DiagnosisSuggestion) => {
        setForm(f => ({ ...f, diagnosisCode: s.code, diagnosisDisplay: s.display }));
        setDiagnosisQuery(`${s.code} - ${s.display}`);
        setDiagnosisSelected(true);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!diagnosisSelected || !form.diagnosisCode) {
            setError('Morate odabrati MKB-10 dijagnozu iz ponuđenog popisa.');
            return;
        }
        setSubmitting(true);
        setError(null);

        try {
            let res: Response;

            if (isEditMode) {
                // TC17 – Update existing case
                res = await fetch(`/api/case/${existingCase.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        patientMbo,
                        title: form.title,
                        diagnosisCode: form.diagnosisCode,
                        diagnosisDisplay: form.diagnosisDisplay,
                        startDate: new Date(form.startDate).toISOString(),
                    }),
                });
            } else {
                // TC16 – Create new case
                res = await fetch('/api/case/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        patientMbo,
                        title: form.title || form.diagnosisDisplay,
                        diagnosisCode: form.diagnosisCode,
                        diagnosisDisplay: form.diagnosisDisplay,
                        startDate: new Date(form.startDate).toISOString(),
                    }),
                });
            }

            const data = await res.json();
            if (data.success) {
                onSuccess();
            } else {
                setError(data.error || 'Nepoznata pogreška.');
            }
        } catch {
            setError('Greška u komunikaciji s poslužiteljem.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEditMode ? 'bg-amber-50' : 'bg-emerald-50'
                            }`}>
                            <ClipboardList className={`w-5 h-5 ${isEditMode ? 'text-amber-600' : 'text-emerald-600'}`} />
                        </div>
                        <div>
                            <h2 className="font-black text-slate-900 text-lg">
                                {isEditMode ? 'Uredi zdravstveni slučaj' : 'Novi zdravstveni slučaj'}
                            </h2>
                            <p className="text-xs text-slate-400 font-medium">
                                {isEditMode ? 'TC17 — ažuriranje EpisodeOfCare' : 'TC16 — nova EpisodeOfCare'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-7 py-5 space-y-5">
                    {/* Naziv slučaja */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                            Naziv slučaja <span className="text-slate-300 font-medium normal-case tracking-normal">(opcionalno)</span>
                        </label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="npr. Fizikalna terapija, Post-op praćenje..."
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                    </div>

                    {/* MKB-10 dijagnoza */}
                    <div className="relative" ref={suggestionsRef}>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                            MKB-10 dijagnoza <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            {searchingDiag && (
                                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin pointer-events-none" />
                            )}
                            {diagnosisSelected && !searchingDiag && (
                                <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                            )}
                            <input
                                type="text"
                                value={diagnosisQuery}
                                onChange={e => handleDiagnosisInput(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                placeholder="Pretraži po šifri ili nazivu (npr. M17, koljeno...)"
                                className={`w-full border rounded-xl pl-10 pr-10 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 transition-all ${diagnosisSelected
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-100'
                                        : 'border-slate-200 text-slate-800 focus:border-blue-400 focus:ring-blue-100'
                                    }`}
                            />
                        </div>
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                                {suggestions.map(s => (
                                    <button
                                        type="button"
                                        key={s.code}
                                        onMouseDown={() => handleSelectDiagnosis(s)}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                                    >
                                        <span className="font-black text-blue-700 text-xs font-mono bg-blue-50 px-2 py-0.5 rounded-lg flex-shrink-0">{s.code}</span>
                                        <span className="text-sm text-slate-700 font-medium truncate">{s.display}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Datum početka */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                            Datum početka
                        </label>
                        <input
                            type="date"
                            value={form.startDate}
                            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                    </div>

                    {error && (
                        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
                            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm font-medium text-rose-700">{error}</p>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="px-7 py-5 border-t border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-white transition-all text-sm"
                    >
                        Odustani
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !diagnosisSelected}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all ${submitting || !diagnosisSelected
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : isEditMode
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200'
                            }`}
                    >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting
                            ? 'Šaljem...'
                            : isEditMode
                                ? 'Spremi promjene (TC17)'
                                : 'Otvori slučaj (TC16)'
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
