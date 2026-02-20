'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, ArrowLeft, Save, AlertCircle } from 'lucide-react';

export default function RegisterForeignerPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        birthDate: '',
        gender: 'male',
        country: 'DE', // Default Germany
        idType: 'passport',
        idNumber: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                alert('Stranac uspješno registriran u CEZIH sustav (PMIR).');
                router.push('/dashboard/patients');
            } else {
                setError(data.error || 'Registracija nije uspjela.');
            }
        } catch (err: any) {
            setError(err.message || 'Greška u komunikaciji.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option value="male">Muški</option>
                            <option value="female">Ženski</option>
                            <option value="other">Drugo</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Država osiguranja</label>
                    <select
                        name="country"
                        value={formData.country}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                        <option value="DE">Njemačka (DE)</option>
                        <option value="AT">Austrija (AT)</option>
                        <option value="IT">Italija (IT)</option>
                        <option value="SI">Slovenija (SI)</option>
                        <option value="HU">Mađarska (HU)</option>
                        <option value="GB">Ujedinjeno Kraljevstvo (GB)</option>
                        <option value="US">SAD (US)</option>
                    </select>
                </div>

                <div className="pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Identifikacijski dokument</h3>
                    <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tip dokumenta</label>
                            <select
                                name="idType"
                                value={formData.idType}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                <option value="passport">Putovnica</option>
                                <option value="eu_card">EU Kartica</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Broj dokumenta</label>
                            <input
                                required
                                type="text"
                                name="idNumber"
                                value={formData.idNumber}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                placeholder="Unesite broj..."
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-6 flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Registracija...</>
                        ) : (
                            <>
                                <UserPlus className="w-4 h-4" />
                                Registriraj stranca
                            </>
                        )}
                    </button>
                </div>
            </form>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 flex gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                    <p className="font-semibold mb-1">Certifikacijska napomena (TC 11)</p>
                    <p>
                        Ova akcija šalje FHIR PMIR poruku (Patient Master Identity Registry) na CEZIH.
                        Zahtijeva digitalni potpis liječnika. U Demo okruženju, potpis se simulira.
                    </p>
                </div>
            </div>
        </div>
    );
}
