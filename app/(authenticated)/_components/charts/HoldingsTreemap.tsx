'use client';

import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { Card } from '../ui/Card';
import type { HoldingRow } from '@/lib/holdings';
import { usePrivacy } from '../../_contexts/PrivacyContext';

/* --------------------------------------------------------------------------------
 * Types & Props
 * -------------------------------------------------------------------------------- */
type HoldingsTreemapProps = {
    rows: HoldingRow[];
    baseCurrency: string;
};

type TreemapData = {
    name: string;
    size: number; // Market Value
    pnl: number;  // PnL Amount
    pnlPct: number; // PnL Percent
    children?: TreemapData[];
};

/* --------------------------------------------------------------------------------
 * Content Renderer
 * - Custom SVG implementation for the Treemap cells
 * -------------------------------------------------------------------------------- */
const CustomContent = (props: any) => {
    const { root, depth, x, y, width, height, index, name, pnlPct, size } = props;
    const safePnlPct = Number.isFinite(pnlPct) ? pnlPct : 0;

    // Simple color scale based on P&L %
    let fillColor = '#52525b'; // Neutral (Zinc 600)
    if (safePnlPct > 10) fillColor = '#10b981'; // Emerald 500
    else if (safePnlPct > 0) fillColor = '#059669'; // Emerald 600
    else if (safePnlPct < -10) fillColor = '#be123c'; // Rose 700
    else if (safePnlPct < 0) fillColor = '#e11d48'; // Rose 600

    // Text contrast
    const textColor = '#ffffff';

    // Only show text if box is big enough
    const showText = width > 40 && height > 20;
    const showSubText = width > 60 && height > 40;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: fillColor,
                    stroke: '#18181b', // Zinc 950 (Background match for borders)
                    strokeWidth: 2,
                    strokeOpacity: 1,
                }}
            />
            {showText && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 - (showSubText ? 6 : 0)}
                    textAnchor="middle"
                    fill={textColor}
                    fontSize={Math.min(width / 4, 14)}
                    fontWeight="700"
                    pointerEvents="none"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                >
                    {name}
                </text>
            )}
            {showSubText && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 8}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.9)"
                    fontSize={11}
                    fontWeight="500"
                    pointerEvents="none"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                >
                    {safePnlPct > 0 ? '+' : ''}{safePnlPct.toFixed(1)}%
                </text>
            )}
        </g>
    );
};

/* --------------------------------------------------------------------------------
 * Tooltip
 * -------------------------------------------------------------------------------- */
const CustomTooltip = ({ active, payload, label, baseCurrency, isPrivacyMode }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const safePnlPct = Number.isFinite(data.pnlPct) ? data.pnlPct : 0;
        return (
            <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-xl z-50">
                <p className="font-bold text-white mb-1">{data.name}</p>
                <div className="flex flex-col gap-0.5 text-xs text-zinc-400">
                    <div className="flex justify-between gap-4">
                        <span>Value:</span>
                        <span className="text-white font-mono">
                            {isPrivacyMode ? '****' : new Intl.NumberFormat('en-US', { style: 'currency', currency: baseCurrency }).format(data.size)}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>PnL:</span>
                        <span className={`font-mono ${data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPrivacyMode ? '****' : (data.pnl >= 0 ? '+' : '') + new Intl.NumberFormat('en-US', { style: 'currency', currency: baseCurrency }).format(data.pnl)}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>Return:</span>
                        <span className={`font-mono ${data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {safePnlPct >= 0 ? '+' : ''}{safePnlPct.toFixed(2)}%
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

/* --------------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------------- */
export function HoldingsTreemap({ rows, baseCurrency }: HoldingsTreemapProps) {
    const { isPrivacyMode } = usePrivacy();

    const data = useMemo(() => {
        // Filter out items with no value, zero value, or CASH_LIKE assets
        const validRows = rows.filter(r =>
            r.marketValue &&
            r.marketValue > 1 &&
            r.volatilityBucket !== 'CASH_LIKE'
        );

        // Transform for Recharts
        // Structure: [ { name: 'Holdings', children: [ ...items ] } ]
        const children = validRows.map((row, index) => ({
            // Use a combination of symbol and index/account to ensure uniqueness if needed,
            // but for display "name" should be the symbol.
            // Recharts might use name as key, so duplicate names cause issues.
            // We can pass a separate 'displayName' and use unique 'name' for the key?
            // Or just let it be for now and focus on visual fix.
            // Let's stick to symbol for the name as that's what shows in the box.
            // Duplicate keys warning is secondary to the visual bug.
            name: row.assetSymbol,
            size: row.marketValue || 0,
            pnl: row.unrealizedPnl || 0,
            pnlPct: row.unrealizedPnlPct || 0,
        })).sort((a, b) => b.size - a.size); // Sort by size to help layout

        return [{ name: 'Portfolio', children }];
    }, [rows]);

    if (!data[0].children || data[0].children.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-zinc-500">
                No performance data available (Active assets only)
            </div>
        );
    }

    return (
        <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
                <Treemap
                    data={data}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    stroke="#18181b"
                    content={<CustomContent />}
                    animationDuration={500}
                >
                    <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} isPrivacyMode={isPrivacyMode} />} />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
}
