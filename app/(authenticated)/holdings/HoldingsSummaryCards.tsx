'use client';

import React from 'react';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import { usePrivacy } from '../_contexts/PrivacyContext';
import type { HoldingsSummary } from '@/lib/holdings';

type HoldingsSummaryCardsProps = {
    summary: HoldingsSummary;
    baseCurrency: string;
    priceAutoRefreshIntervalMinutes: number;
};

function baseFormatCurrency(value: number | null | undefined, currency: string) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(value);
}

export function HoldingsSummaryCards({
    summary,
    baseCurrency,
    priceAutoRefreshIntervalMinutes,
}: HoldingsSummaryCardsProps) {
    const { isPrivacyMode } = usePrivacy();

    const formatCurrency = (value: number | null | undefined, currency: string) => {
        if (isPrivacyMode) return '****';
        return baseFormatCurrency(value, currency);
    };

    const totalValue = summary.totalValue;
    const lastUpdated = summary.updatedAt;
    const totalCostBasis = summary.totalCostBasis;
    const totalUnrealizedPnl = summary.totalUnrealizedPnl;
    const valuationReady = totalCostBasis !== null && totalUnrealizedPnl !== null;
    const pnlPercent =
        valuationReady && totalCostBasis !== 0
            ? (totalUnrealizedPnl / totalCostBasis) * 100
            : null;

    const pnlClass = valuationReady
        ? totalUnrealizedPnl > 0
            ? 'text-emerald-400'
            : totalUnrealizedPnl < 0
                ? 'text-rose-400'
                : 'text-zinc-200'
        : 'text-zinc-500';

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
                <div className="text-sm text-zinc-400">Total Portfolio Value</div>
                <div className="mt-2 text-3xl font-bold text-white">
                    {formatCurrency(totalValue, baseCurrency)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">{baseCurrency}</div>
            </Card>

            <Card>
                <div className="text-sm text-zinc-400">Last Price Update</div>
                {lastUpdated ? (
                    <div className="mt-2 text-lg text-white">
                        {new Date(lastUpdated).toLocaleString()}
                    </div>
                ) : (
                    <div className="mt-2 flex items-center gap-2 text-zinc-300">
                        <span>No prices</span>
                        <Badge type="orange">Needs update</Badge>
                    </div>
                )}
                <div className="mt-1 text-xs text-zinc-500">
                    Refresh Interval: {priceAutoRefreshIntervalMinutes} min
                </div>
            </Card>

            <Card>
                <div className="text-sm text-zinc-400">Valuation</div>
                {valuationReady ? (
                    <>
                        <div className={`mt-2 text-2xl font-bold ${pnlClass}`}>
                            {totalUnrealizedPnl > 0 ? '+' : ''}
                            {formatCurrency(totalUnrealizedPnl, baseCurrency)}
                            {pnlPercent !== null ? (
                                <span className="text-xs ml-2 text-zinc-400">
                                    ({isPrivacyMode ? '****' : (pnlPercent > 0 ? '+' : '') + pnlPercent.toFixed(2) + '%'})
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                            Cost basis: {formatCurrency(totalCostBasis!, baseCurrency)}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="mt-2 text-lg text-zinc-500 font-medium">
                            Valuation data pending
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                            Unknown cost basis
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}
