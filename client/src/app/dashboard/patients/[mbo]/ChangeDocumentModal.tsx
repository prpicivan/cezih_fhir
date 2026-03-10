'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, AlertCircle, CheckCircle2, Loader2, FileText } from 'lucide-react';

interface DiagnosisSuggestion {
    code: string;
    display: string;
}

interface ChangeDocumentModalProps {
    doc: any;
    patientMbo: string;
    onClose: () => void;
    onSuccess: () => void;
}

const DOCUMENT_TYPES = [
    { value: '011', label: 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove' },
    { value: '012', label: 'Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove' },
    { value: '013', label: 'Otpusno pismo iz privatne zdravstvene ustanove' },
];

export default function ChangeDocumentModal({ doc, patientMbo, onClose, onSuccess }: ChangeDocumentModalProps) {
    const [form, setForm] = useState({
        type: doc.type || '011',
        anamnesis: doc.anamnesis || '',
        finding: doc.finding || '',
        status_text: doc.status_text || '',
        recommendation: doc.recommendation || '',
        diagnosisCode: doc.diagnosisCode || '',
        diagnosisDisplay: doc.diagnosisDisplay || '',
    });

    const [diagnosisQuery, setDiagnosisQuery] = useState(
        doc.diagnosisCode ? `${doc.diagnosisCode} - ${doc.diagnosisDisplay || ''}` : ''
    );
    const [suggestions, setSuggestions] = useState<DiagnosisSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchingDiag, setSearchingDiag] = useState(false);
    const [diagnosisSelected, setDiagnosisSelected] = useState(!!doc.diagnosisCode);

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
        if (!form.anamnesis.trim()) {
            setError('Anamneza je obavezno polje.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/document/replace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalDocumentOid: doc.id,
                    type: form.type,
                    patientMbo,
                    visitId: doc.visitId,
                    anamnesis: form.anamnesis,
                    status: form.status_text,
                    finding: form.finding,
                    recommendation: form.recommendation,
                    diagnosisCode: form.diagnosisCode,
                    closeVisit: false,
                }),
            });
            const data = await res.json();
            if (data.success) {
                onSuccess();
            } else {
                setError(data.error || 'Nepoznata pogreška pri zamjeni dokumenta.');
            }
        } catch (err: any) {
            setError('Greška u komunikaciji s poslužiteljem.');
        } finally {
            setSubmitting(false);
        }
    };

    const charCount = (val: string) => val.length;
    const MAX = 4000;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                            <FileText className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h2 className="font-black text-slate-900 text-lg">Izmjena dokumenta</h2>
                            <p className="text-xs text-slate-400 font-medium">TC19 — zamjena kliničkog dokumenta (ITI-65)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Original doc info */}
                <div className="px-7 pt-4 flex-shrink-0">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-500 font-medium">
                        <span className="uppercase font-black text-slate-400 tracking-wider">Izvorni OID: </span>
                        <span className="font-mono">{doc.id}</span>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-5 space-y-5">
                    {/* Vrsta dokumenta */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Vrsta dokumenta</label>
                        <select
                            value={form.type}
                            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white transition-all"
                        >
                            {DOCUMENT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
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
                            {diagnosisSelected && (
                                <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                            )}
                            <input
                                type="text"
                                value={diagnosisQuery}
                                onChange={e => handleDiagnosisInput(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                placeholder="Pretraži po šifri ili nazivu (npr. J00, grip...)"
                                className={`w-full border rounded-xl pl-10 pr-10 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 transition-all ${diagnosisSelected
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-100'
                                    : 'border-slate-200 text-slate-800 focus:border-blue-400 focus:ring-blue-100'
                                    }`}
                            />
                        </div>
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
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

                    {/* Anamneza */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Anamneza <span className="text-rose-500">*</span></label>
                        <textarea
                            value={form.anamnesis}
                            onChange={e => setForm(f => ({ ...f, anamnesis: e.target.value }))}
                            rows={3}
                            maxLength={MAX}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all"
                        />
                        <p className={`text-right text-[10px] mt-1 font-bold ${charCount(form.anamnesis) > MAX * 0.9 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {charCount(form.anamnesis)} / {MAX}
                        </p>
                    </div>

                    {/* Klinički nalaz */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Klinički nalaz</label>
                        <textarea
                            value={form.finding}
                            onChange={e => setForm(f => ({ ...f, finding: e.target.value }))}
                            rows={3}
                            maxLength={MAX}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all"
                        />
                        <p className={`text-right text-[10px] mt-1 font-bold ${charCount(form.finding) > MAX * 0.9 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {charCount(form.finding)} / {MAX}
                        </p>
                    </div>

                    {/* Status */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Status pacijenta</label>
                        <textarea
                            value={form.status_text}
                            onChange={e => setForm(f => ({ ...f, status_text: e.target.value }))}
                            rows={2}
                            maxLength={MAX}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all"
                        />
                    </div>

                    {/* Preporuka */}
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Preporuka</label>
                        <textarea
                            value={form.recommendation}
                            onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))}
                            rows={2}
                            maxLength={MAX}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all"
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
                <div className="px-7 py-5 border-t border-slate-100 flex items-center justify-between gap-4 flex-shrink-0 bg-slate-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-white transition-all text-sm"
                    >
                        Odustani
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !diagnosisSelected || !form.anamnesis.trim()}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all ${submitting || !diagnosisSelected
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                            }`}
                    >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting ? 'Šaljem...' : 'Zamijeni dokument (TC19)'}
                    </button>
                </div>
            </div>
        </div>
    );
}
