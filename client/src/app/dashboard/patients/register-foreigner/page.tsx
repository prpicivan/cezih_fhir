'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, ArrowLeft, Save, AlertCircle, Search, ChevronDown, CheckCircle2, Globe, ExternalLink, XCircle } from 'lucide-react';
import { useToast, Toast } from '@/components/Toast';
import IdenSigningModal from '@/components/IdenSigningModal';
import { COUNTRY_GROUPS, findCountry, isEuEea, PASSPORT_REGEX, EKZO_REGEX, Country } from '@/lib/countries';

export default function RegisterForeignerPage() {
    const router = useRouter();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [idenOpen, setIdenOpen] = useState(false);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [registeredMbo, setRegisteredMbo] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        birthDate: '',
        gender: 'male',
        nationality: 'DEU', // Default Germany
        idType: 'passport',
        idNumber: ''
    });

    // Country Search State
    const [countrySearch, setCountrySearch] = useState('');
    const [isCountryOpen, setIsCountryOpen] = useState(false);
    const countryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (countryRef.current && !countryRef.current.contains(event.target as Node)) {
                setIsCountryOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedCountry = findCountry(formData.nationality);
    const filteredGroups = COUNTRY_GROUPS.map(group => ({
        ...group,
        countries: group.countries.filter(c => 
            c.label.toLowerCase().includes(countrySearch.toLowerCase()) || 
            c.value.toLowerCase().includes(countrySearch.toLowerCase())
        )
    })).filter(group => group.countries.length > 0);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCountrySelect = (country: Country) => {
        setFormData(prev => ({ 
            ...prev, 
            nationality: country.value,
            // Fallback: if switching to non-EU country while EKZO is selected, switch to passport
            idType: !country.isEuEea && prev.idType === 'eu-card' ? 'passport' : prev.idType
        }));
        setIsCountryOpen(false);
        setCountrySearch('');
    };

    const validateId = () => {
        if (formData.idType === 'passport') return PASSPORT_REGEX.test(formData.idNumber);
        if (formData.idType === 'eu-card') return EKZO_REGEX.test(formData.idNumber);
        return true;
    };

    const submitForeigner = async (): Promise<{ success: boolean; error?: string }> => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/patient/foreigner/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                const mbo = data.result?.mbo || data.result?.id;
                setRegisteredMbo(mbo);
                return { success: true };
            }
            const msg = data.error || 'Registracija nije uspjela.';
            setError(msg);
            return { success: false, error: msg };
        } catch (err: any) {
            const msg = err.message || 'Greška u komunikaciji.';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateId()) {
            setError(`Neispravan format ${formData.idType === 'passport' ? 'putovnice' : 'EKZO kartice'}.`);
            return;
        }
        setIdenOpen(true);
    };

    return (
        <>
        <div className="max-w-2xl mx-auto space-y-6">
            <Toast toast={toast} onClose={hideToast} />
            
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/patients" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5 text-slate-500" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Registracija Stranca (TC 11)</h1>
                    <p className="text-slate-500">Unos podataka za pacijente bez MBO-a (IHE PMIR)</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
                {error && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">Greška pri registraciji</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Ime</label>
                        <input
                            required
                            type="text"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="npr. John"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Prezime</label>
                        <input
                            required
                            type="text"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="npr. Doe"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Datum rođenja</label>
                        <input
                            required
                            type="date"
                            name="birthDate"
                            value={formData.birthDate}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Spol</label>
                        <select
                            name="gender"
                            value={formData.gender}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-serif"
                        >
                            <option value="male">Muški (male)</option>
                            <option value="female">Ženski (female)</option>
                            <option value="other">Drugo (other)</option>
                            <option value="unknown">Nepoznato (unknown)</option>
                        </select>
                    </div>
                </div>

                {/* Searchable Country Picker */}
                <div className="relative" ref={countryRef}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Država osiguranja</label>
                    <button
                        type="button"
                        onClick={() => setIsCountryOpen(!isCountryOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 border border-slate-300 rounded-lg bg-white hover:border-slate-400 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            {selectedCountry ? (
                                <>
                                    <span className="text-xl">{selectedCountry.flag}</span>
                                    <span className="text-slate-700">{selectedCountry.label}</span>
                                    <span className="text-xs font-mono text-slate-400 bg-slate-50 px-1 rounded">{selectedCountry.value}</span>
                                </>
                            ) : (
                                <span className="text-slate-400">Odaberite državu...</span>
                            )}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isCountryOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isCountryOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Pretraži države..."
                                        value={countrySearch}
                                        onChange={(e) => setCountrySearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto p-1">
                                {filteredGroups.map((group) => (
                                    <div key={group.label}>
                                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 bg-slate-50/30">
                                            <span>{group.emoji}</span>
                                            {group.label}
                                        </div>
                                        {group.countries.map((c) => (
                                            <button
                                                key={c.value}
                                                type="button"
                                                onClick={() => handleCountrySelect(c)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                                                    formData.nationality === c.value 
                                                        ? 'bg-blue-50 text-blue-700 font-medium' 
                                                        : 'hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className="text-xl">{c.flag}</span>
                                                <span className="flex-1">{c.label}</span>
                                                <span className="text-[10px] font-mono text-slate-400">{c.value}</span>
                                            </button>
                                        ))}
                                    </div>
                                ))}
                                {filteredGroups.length === 0 && (
                                    <div className="p-8 text-center text-slate-500">
                                        Nema pronađenih država.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4 pt-2 border-t border-slate-100">
                    <div className="flex gap-4">
                        <label className={`flex-1 flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                            formData.idType === 'passport' 
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20' 
                                : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                        }`}>
                            <input
                                type="radio"
                                name="idType"
                                value="passport"
                                checked={formData.idType === 'passport'}
                                onChange={handleChange}
                                className="hidden"
                            />
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                🛂
                            </div>
                            <div>
                                <p className="font-bold text-slate-700">Putovnica</p>
                                <p className="text-[10px] text-zinc-500 uppercase font-mono">Passport</p>
                            </div>
                        </label>

                        <label className={`flex-1 flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                            !selectedCountry?.isEuEea && formData.idType !== 'eu-card' ? 'opacity-50 cursor-not-allowed text-slate-400' : ''
                        } ${
                            formData.idType === 'eu-card' 
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20' 
                                : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                        }`}>
                            <input
                                type="radio"
                                name="idType"
                                value="eu-card"
                                disabled={!selectedCountry?.isEuEea}
                                checked={formData.idType === 'eu-card'}
                                onChange={handleChange}
                                className="hidden"
                            />
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                                💳
                            </div>
                            <div>
                                <p className="font-bold text-slate-700">EKZO</p>
                                <p className="text-[10px] text-zinc-500 uppercase font-mono">EU Card</p>
                            </div>
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Broj {formData.idType === 'passport' ? 'putovnice' : 'EKZO kartice'}
                        </label>
                        <input
                            required
                            type="text"
                            name="idNumber"
                            value={formData.idNumber}
                            onChange={handleChange}
                            className={`w-full px-3 py-3 border rounded-lg outline-none transition-all font-mono tracking-wider ${
                                formData.idNumber && !validateId() 
                                    ? 'border-rose-300 bg-rose-50 text-rose-700 focus:ring-rose-200' 
                                    : 'border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500'
                            }`}
                            placeholder={formData.idType === 'passport' ? 'npr. A12345678' : 'npr. 80191234567890'}
                        />
                        {formData.idNumber && !validateId() && (
                            <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Neispravan format za odabranu vrstu dokumenta.
                            </p>
                        )}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2 mt-8"
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Save className="w-5 h-5" />
                    )}
                    Potpiši i Registriraj
                </button>
            </form>
        </div>

        <IdenSigningModal
            open={idenOpen}
            onCancel={() => setIdenOpen(false)}
            signingFn={submitForeigner}
            onDone={(success) => {
                setIdenOpen(false);
                if (success) {
                    setSuccessModalOpen(true);
                }
            }}
            actionLabel="Registracija pacijenta"
        />

        {/* Success Modal */}
        {successModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center space-y-6 animate-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50">
                        <CheckCircle2 className="w-10 h-10" />
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-slate-800">Uspješna registracija!</h2>
                        <p className="text-slate-500">
                            Pacijent <span className="font-semibold text-slate-700">{formData.firstName} {formData.lastName}</span> je uspješno registriran u CEZIH sustavu.
                        </p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dodijeljeni identifikator</p>
                        <p className="text-xl font-mono font-bold text-blue-600 tracking-tight">{registeredMbo}</p>
                    </div>

                    <button
                        onClick={() => router.push('/dashboard/patients')}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 group"
                    >
                        Zatvori
                        <XCircle className="w-4 h-4 opacity-70 group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
        )}
        </>
    );
}
