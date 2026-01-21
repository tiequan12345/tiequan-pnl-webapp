'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Wallet,
  PieChart,
  ArrowRightLeft,
  Settings,
  ShieldCheck,
  LineChart,
  Eye,
  EyeOff,
  Wrench,
} from 'lucide-react';
import { usePrivacy } from '../_contexts/PrivacyContext';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/holdings', label: 'Holdings', icon: PieChart },
  { href: '/pnl', label: 'PNL Over Time', icon: LineChart },
  { href: '/ledger', label: 'Ledger', icon: ArrowRightLeft },
  { href: '/reconcile', label: 'Reconcile', icon: Wrench },
  { href: '/hedges', label: 'Hedges', icon: ShieldCheck },
  { href: '/assets', label: 'Assets', icon: Wallet },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  const activeItem = NAV_ITEMS.find((item) => item.href === pathname);
  const activeLabel = activeItem?.label ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-950 hidden md:flex flex-col">
          <div className="p-6">
            <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <img
                src="/tiequan-logo.png"
                alt="Tiequan"
                className="w-8 h-8 rounded-lg object-contain"
              />
              Tiequan Portfolio
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === pathname;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
              <div>
                <div className="text-sm font-medium text-white">Admin User</div>
                <div className="text-xs text-zinc-500">Local Session</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-sm z-10">
            <div className="text-sm text-zinc-400 flex items-center gap-2">
              <span className="text-zinc-600">App</span>
              <span className="text-zinc-700">/</span>
              <span className="capitalize text-zinc-200">
                {activeLabel}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {(pathname === '/' || pathname.startsWith('/holdings')) && (
                <button
                  onClick={togglePrivacyMode}
                  className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
                  title={isPrivacyMode ? 'Disable Privacy Mode' : 'Enable Privacy Mode'}
                >
                  {isPrivacyMode ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              )}

              <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                System Operational
              </div>
            </div>
          </header>

          {/* Scrollable Page Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth">
            <div className="max-w-6xl mx-auto">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}