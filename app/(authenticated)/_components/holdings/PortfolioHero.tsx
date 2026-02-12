'use client';

import React, { useEffect, useState } from 'react';
import { usePrivacy } from '../../_contexts/PrivacyContext';
import { ArrowUpRight, ArrowDownRight, RefreshCw, Clock } from 'lucide-react';
import type { HoldingsSummary } from '@/lib/holdings';

type PortfolioHeroProps = {
    summary: HoldingsSummary;
    baseCurrency: string;
    priceAutoRefreshIntervalMinutes: number;
    className?: string;
};

// Helper for large value formatting
function formatLargeCurrency(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function PnLBadge({ value, percent }: { value: number; percent: number | null }) {
    const isPositive = value >= 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const colorClass = isPositive ? 'text-emerald-400' : 'text-rose-400';
    const bgClass = isPositive ? 'bg-emerald-500/10' : 'bg-rose-500/10';
    const borderClass = isPositive ? 'border-emerald-500/20' : 'border-rose-500/20';

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bgClass} ${borderClass}`}>
            <Icon className={`w-4 h-4 ${colorClass}`} />
            <span className={`font-mono font-medium ${colorClass}`}>
                {isPositive ? '+' : ''}{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {percent !== null && (
                <span className={`font-mono text-sm opacity-80 ${colorClass}`}>
                    ({isPositive ? '+' : ''}{percent.toFixed(2)}%)
                </span>
            )}
        </div>
    );
}

export function PortfolioHero({
    summary,
    baseCurrency,
    priceAutoRefreshIntervalMinutes,
    className,
}: PortfolioHeroProps) {
    const { isPrivacyMode } = usePrivacy();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const totalValue = summary.totalValue;
    const totalCostBasis = summary.totalCostBasis;
    const totalUnrealizedPnl = summary.totalUnrealizedPnl;
    const valuationReady = totalCostBasis !== null && totalUnrealizedPnl !== null;

    const pnlPercent =
        valuationReady && totalCostBasis !== 0
            ? (totalUnrealizedPnl / totalCostBasis) * 100
            : null;

    if (!mounted) return null;

    return (
        <div className={`relative w-full p-8 overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl ${className ?? ''}`}>
            {/* Background Decor Elements - Subtle Gradients */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">

                {/* Main Value Section */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-zinc-400 text-sm font-medium tracking-wide uppercase">
                        <span>Net Portfolio Value</span>
                    </div>

                    <div className="flex items-baseline gap-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <span className="text-6xl md:text-7xl font-bold text-white tracking-tighter font-mono">
                            {isPrivacyMode ? '****' : formatLargeCurrency(totalValue, baseCurrency)}
                        </span>
                    </div>

                    {/* P&L Section */}
                    <div className="mt-2 flex items-center gap-4">
                        {valuationReady && totalUnrealizedPnl !== null ? (
                            isPrivacyMode ? (
                                <span className="text-zinc-500 font-mono text-lg">****</span>
                            ) : (
                                <PnLBadge value={totalUnrealizedPnl} percent={pnlPercent} />
                            )
                        ) : (
                            <span className="text-zinc-500 text-sm">Valuation pending...</span>
                        )}

                        {valuationReady && (
                            <span className="text-zinc-500 text-sm font-mono">
                                Basis: {isPrivacyMode ? '****' : formatLargeCurrency(totalCostBasis!, baseCurrency)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Metadata / Status Section (Right Aligned) */}
                <div className="flex flex-col items-start md:items-end gap-2 text-right">
                    <div className="flex items-center gap-2 text-zinc-500 text-xs bg-zinc-800/50 px-3 py-1.5 rounded-full border border-white/5">
                        <Clock className="w-3 h-3" />
                        <span>Updated {summary.updatedAt ? new Date(summary.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500 text-xs px-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>Auto-refresh: {priceAutoRefreshIntervalMinutes}m</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
