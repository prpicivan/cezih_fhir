import './globals.css';
import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: 'WBS_FHIR',
    description: 'Sustav za digitalnu razmjenu medicinske dokumentacije s CEZIH sustavom',
    icons: {
        icon: '/wbs-logo.png',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="hr">
            <body className="antialiased min-h-screen bg-slate-50 text-slate-900">
                <Suspense>{children}</Suspense>
            </body>
        </html>
    );
}
