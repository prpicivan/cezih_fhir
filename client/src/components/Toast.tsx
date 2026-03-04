'use client';

import { useState, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error';

export function useToast() {
    const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((type: ToastType, message: string) => {
        setToast({ type, message });
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setToast(null), 5000);
    }, []);

    const hideToast = useCallback(() => setToast(null), []);

    return { toast, showToast, hideToast };
}

export function Toast({ toast, onClose }: { toast: { type: ToastType; message: string } | null; onClose: () => void }) {
    if (!toast) return null;

    return (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border transition-all ${toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
            {toast.type === 'success'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                : <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            }
            <span className="text-sm font-semibold max-w-md">{toast.message}</span>
            <button onClick={onClose} className="ml-2 text-current opacity-50 hover:opacity-100">
                <XCircle className="w-4 h-4" />
            </button>
        </div>
    );
}
