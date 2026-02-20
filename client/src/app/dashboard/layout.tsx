'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Calendar, Activity, Settings, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navigation = [
        { name: 'Nadzorna ploča', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Pacijenti', href: '/dashboard/patients', icon: Users },
        { name: 'Kalendar', href: '/dashboard/calendar', icon: Calendar },
        { name: 'Klinički dokumenti', href: '/dashboard/documents', icon: Activity },
        { name: 'Registar (TC 9)', href: '/dashboard/registry', icon: Users },
        { name: 'Postavke', href: '/dashboard/settings', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* Top Navigation Bar */}
            <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">

                        {/* Logo & Desktop Nav */}
                        <div className="flex">
                            <div className="flex-shrink-0 flex items-center gap-2">
                                <div className="bg-blue-600 p-1.5 rounded-lg">
                                    <Activity className="h-6 w-6 text-white" />
                                </div>
                                <span className="font-bold text-xl text-slate-800 tracking-tight">CEZIH PIS</span>
                            </div>

                            <div className="hidden md:ml-8 md:flex md:space-x-1">
                                {navigation.map((item) => {
                                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={`inline-flex items-center px-4 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive
                                                ? 'border-blue-600 text-blue-600'
                                                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                                }`}
                                        >
                                            <item.icon className={`w-4 h-4 mr-2 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Side Actions */}
                        <div className="hidden md:flex items-center">
                            <Link
                                href="/"
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors border border-rose-100"
                            >
                                <LogOut className="w-4 h-4" />
                                Odjava
                            </Link>
                        </div>

                        {/* Mobile Menu Button */}
                        <div className="-mr-2 flex items-center md:hidden">
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                            >
                                <span className="sr-only">Open main menu</span>
                                {isMobileMenuOpen ? (
                                    <X className="block h-6 w-6" aria-hidden="true" />
                                ) : (
                                    <Menu className="block h-6 w-6" aria-hidden="true" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-white border-b border-slate-200">
                        <div className="pt-2 pb-3 space-y-1">
                            {navigation.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${isActive
                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                            : 'border-transparent text-slate-500 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700'
                                            }`}
                                    >
                                        <div className="flex items-center">
                                            <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                                            {item.name}
                                        </div>
                                    </Link>
                                );
                            })}
                            <div className="border-t border-slate-100 pt-2 mt-2">
                                <Link
                                    href="/"
                                    className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                                >
                                    <div className="flex items-center">
                                        <LogOut className="w-5 h-5 mr-3" />
                                        Odjava
                                    </div>
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
