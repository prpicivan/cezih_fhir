'use client';
import { useState } from 'react';
import IdenSigningModal from '@/components/IdenSigningModal';
import { Play, Info } from 'lucide-react';

export default function IdenPrototypePage() {
    const [open, setOpen] = useState(false);
    const [lastResult, setLastResult] = useState<string | null>(null);

    const handleSigning = async () => {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true };
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div className="bg-slate-900 rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Play className="w-32 h-32" />
                </div>
                
                <h1 className="text-3xl font-black text-white mb-2">IDEN Signing Prototype</h1>
                <p className="text-slate-400 mb-8 max-w-xl">
                    Testirajte interaktivni proces potpisivanja. Ovaj prototip simulira odabir certifikata 
                    i unos PIN-a za pametnu karticu, dok za Certilia mobile.ID pruža realističan flow.
                </p>

                <div className="flex gap-4">
                    <button
                        onClick={() => { setOpen(true); setLastResult(null); }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-indigo-900/40 transition-all active:scale-95 flex items-center gap-3"
                    >
                        <Play className="w-6 h-6 fill-current" />
                        Pokreni Prototip (TC 17)
                    </button>
                </div>
                
                {lastResult && (
                    <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold flex items-center gap-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Rezultat zadnje akcije: {lastResult}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-400" />
                        Pametna Kartica Flow
                    </h3>
                    <ul className="text-sm text-slate-400 space-y-2 list-disc pl-4">
                        <li>Odabir certifikata (Simulacija Windows dijaloga)</li>
                        <li>Unos PIN-a (6 znamenki)</li>
                        <li>Vizualizacija koraka potpisivanja</li>
                        <li>Slanje na CEZIH</li>
                    </ul>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-indigo-400" />
                        Certilia mobile.ID Flow
                    </h3>
                    <ul className="text-sm text-slate-400 space-y-2 list-disc pl-4">
                        <li>Inicijalizacija sesije</li>
                        <li>Push obavijest na mobitel</li>
                        <li>Odbrojavanje vremena (60s)</li>
                        <li>Automatska detekcija odobrenja</li>
                    </ul>
                </div>
            </div>

            <IdenSigningModal
                open={open}
                actionLabel="Uređivanje zdravstvenog slučaja (TC 17) - Prototype"
                signingFn={handleSigning}
                onDone={(success) => {
                    setOpen(false);
                    setLastResult(success ? 'USPJEH ✅' : 'GREŠKA ❌');
                }}
                onCancel={() => setOpen(false)}
            />
        </div>
    );
}

function Smartphone({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>
        </svg>
    );
}
