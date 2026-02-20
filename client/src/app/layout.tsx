import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: 'CEZIH PIS - Certifikacija',
    description: 'Sustav za upravljanje poliklinikom',
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
                {children}
            </body>
        </html>
    );
}
