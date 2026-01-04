'use client';

import { useState } from 'react';

type EnrichedLeg = {
    id: number;
    date_time: string;
    quantity: string;
    account_name: string;
    asset_symbol: string;
};

export type EnrichedDiagnostic = {
    key: string;
    assetId: number;
    dateTime: string;
    issue: 'UNMATCHED' | 'AMBIGUOUS' | 'INVALID_LEGS';
    legIds: number[];
    legs: EnrichedLeg[];
};

type Props = {
    diagnostics: EnrichedDiagnostic[];
    onResolve: (legIds: number[], action: 'MATCH' | 'SEPARATE') => Promise<void>;
};

export function UnmatchedDiagnosticsViewer({ diagnostics, onResolve }: Props) {
    const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const handleAction = async (diagKey: string, legIds: number[], action: 'MATCH' | 'SEPARATE') => {
        setResolvingIds((prev) => new Set(prev).add(diagKey));
        try {
            await onResolve(legIds, action);
        } catch (err) {
            console.error(err);
            alert('Failed to resolve');
        } finally {
            setResolvingIds((prev) => {
                const next = new Set(prev);
                next.delete(diagKey);
                return next;
            });
        }
    };

    const toggleSelect = (key: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handleMatchSelected = async () => {
        if (selectedKeys.size < 2) return;

        // Collect all leg IDs from selected diagnostics
        const selectedLegIds: number[] = [];
        const keysToResolve: string[] = [];

        // Verify all selected are same asset? (Optional safety check, maybe just warn?)
        // For now, trust the user.

        for (const diag of diagnostics) {
            if (selectedKeys.has(diag.key)) {
                selectedLegIds.push(...diag.legIds);
                keysToResolve.push(diag.key);
            }
        }

        // Mark all as resolving
        setResolvingIds((prev) => {
            const next = new Set(prev);
            keysToResolve.forEach(k => next.add(k));
            return next;
        });

        try {
            await onResolve(selectedLegIds, 'MATCH');
            setSelectedKeys(new Set());
        } catch (err) {
            console.error(err);
            alert('Failed to match selected transactions.');
        } finally {
            setResolvingIds((prev) => {
                const next = new Set(prev);
                keysToResolve.forEach(k => next.delete(k));
                return next;
            });
        }
    };

    if (!diagnostics || diagnostics.length === 0) return null;

    return (
        <div className="space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-wide text-amber-300">
                    Review Unmatched Transfers ({diagnostics.length})
                </h3>
                {selectedKeys.size >= 2 && (
                    <button
                        onClick={handleMatchSelected}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-100 bg-emerald-600 hover:bg-emerald-500 rounded shadow-sm transition-colors"
                    >
                        Match Selected ({selectedKeys.size})
                    </button>
                )}
            </div>

            <div className="space-y-4">
                {diagnostics.map((diag) => {
                    const isResolving = resolvingIds.has(diag.key);
                    const isSelected = selectedKeys.has(diag.key);
                    const legs = diag.legs || [];

                    return (
                        <div
                            key={diag.key}
                            className={`rounded-lg border p-3 text-sm transition-colors ${isSelected
                                    ? 'border-blue-500/50 bg-blue-500/10'
                                    : 'border-amber-500/20 bg-amber-950/40'
                                }`}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelect(diag.key)}
                                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/40"
                                        disabled={isResolving}
                                    />
                                    <div className="text-amber-200">
                                        <span className="font-semibold text-amber-100">{diag.issue}</span> •{' '}
                                        {new Date(diag.dateTime).toLocaleString()}
                                    </div>
                                </div>

                                {!isResolving && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAction(diag.key, diag.legIds, 'SEPARATE')}
                                            className="px-2 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-600 transition-colors"
                                        >
                                            Treat as Separate
                                        </button>
                                        {diag.legIds.length > 1 && (
                                            <button
                                                onClick={() => handleAction(diag.key, diag.legIds, 'MATCH')}
                                                className="px-2 py-1 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-900/40 hover:bg-emerald-800/60 rounded border border-emerald-700/50 transition-colors"
                                            >
                                                Match Together
                                            </button>
                                        )}
                                    </div>
                                )}
                                {isResolving && <span className="text-xs text-zinc-400 animate-pulse">Resolving...</span>}
                            </div>

                            {legs.length > 0 ? (
                                <div className="overflow-x-auto pl-7">
                                    <table className="w-full text-left text-xs text-zinc-300">
                                        <thead className="text-zinc-500 border-b border-white/5">
                                            <tr>
                                                <th className="pb-1">Date</th>
                                                <th className="pb-1">Account</th>
                                                <th className="pb-1">Asset</th>
                                                <th className="pb-1 text-right">Quantity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {legs.map((leg) => (
                                                <tr key={leg.id}>
                                                    <td className="py-1 pr-2 whitespace-nowrap">
                                                        {new Date(leg.date_time).toLocaleString()}
                                                    </td>
                                                    <td className="py-1 pr-2">{leg.account_name}</td>
                                                    <td className="py-1 pr-2">{leg.asset_symbol}</td>
                                                    <td className="py-1 text-right font-mono">
                                                        {Number(leg.quantity) > 0 ? '+' : ''}
                                                        {Number(leg.quantity).toFixed(4)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-zinc-500 italic pl-7">No leg details available.</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
