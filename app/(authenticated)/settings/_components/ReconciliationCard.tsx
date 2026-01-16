'use client';

import { useState, useEffect } from 'react';
import { Card } from '../../_components/ui/Card';

type Account = { id: number; name: string };
type Asset = { id: number; symbol: string; name: string };

type ReconcilePreviewRow = {
    account_id: number;
    asset_id: number;
    current_quantity: string;
    target_quantity: string;
    delta_quantity: string;
    will_create: boolean;
};

type ReconcilePreview = {
    as_of: string;
    external_reference?: string;
    rows: ReconcilePreviewRow[];
};

type TargetRow = {
    id: string;
    accountId: string;
    assetId: string;
    targetQuantity: string;
    notes?: string;
};

export function ReconciliationCard() {
    const [asOf, setAsOf] = useState<string>('');
    const [targets, setTargets] = useState<TargetRow[]>([]);
    const [preview, setPreview] = useState<ReconcilePreview | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [externalRef, setExternalRef] = useState<string>('');
    const [batchNotes, setBatchNotes] = useState<string>('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Data for potential dropdowns
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);

    useEffect(() => {
        // Fetch accounts and assets for dropdowns
        const fetchData = async () => {
            try {
                const [accRes, assRes] = await Promise.all([
                    fetch('/api/accounts'),
                    fetch('/api/assets')
                ]);
                if (accRes.ok) setAccounts(await accRes.json());
                if (assRes.ok) setAssets(await assRes.json());
            } catch (e) {
                console.error("Failed to load dropdown data", e);
            }
        };
        fetchData();

        // Set default as_of to local time
        setAsOf(toLocalISOString(new Date()).slice(0, 16));
    }, []);

    const toLocalISOString = (date: Date) => {
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString();
    };

    const addTargetRow = () => {
        setTargets([
            ...targets,
            {
                id: crypto.randomUUID(),
                accountId: accounts.length > 0 ? String(accounts[0].id) : '',
                assetId: assets.length > 0 ? String(assets[0].id) : '',
                targetQuantity: '',
            },
        ]);
    };

    const removeTargetRow = (id: string) => {
        setTargets(targets.filter((t) => t.id !== id));
    };

    const updateTargetRow = (id: string, field: keyof TargetRow, value: string) => {
        setTargets(targets.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
    };

    const handlePreview = async () => {
        setMessage(null);
        setIsPreviewing(true);
        try {
            const payload = {
                as_of: new Date(asOf).toISOString(),
                targets: targets.map((t) => ({
                    account_id: t.accountId,
                    asset_id: t.assetId,
                    target_quantity: t.targetQuantity,
                    notes: t.notes,
                })),
                external_reference: externalRef || null,
                notes: batchNotes || null,
                mode: 'PREVIEW',
            };

            const res = await fetch('/api/ledger/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const body = await res.json();
                throw new Error(body.error || 'Preview failed');
            }

            const data = await res.json();
            setPreview(data);
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
            setPreview(null);
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleCommit = async () => {
        if (!preview) return;
        setMessage(null);
        setIsCommitting(true);
        try {
            const payload = {
                as_of: preview.as_of, // Use the timestamp returned from preview for consistency
                targets: targets.map((t) => ({
                    account_id: t.accountId,
                    asset_id: t.assetId,
                    target_quantity: t.targetQuantity, // Re-send target quantities
                    notes: t.notes
                })),
                external_reference: externalRef || null,
                notes: batchNotes || null,
                mode: 'COMMIT',
                replace_existing: true,
            };

            const res = await fetch('/api/ledger/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const body = await res.json();
                throw new Error(body.error || 'Commit failed');
            }

            const data = await res.json();
            setMessage({ type: 'success', text: `Successfully created ${data.created} reconciliation entries.` });
            setPreview(null);
            // Optional: clear targets or keep them? Keeping them allows iterative adjustment.
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setIsCommitting(false);
        }
    };

    return (
        <Card className="space-y-4">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">Reconciliation</h2>
                <p className="text-sm text-zinc-400">
                    True-up quantities to match actual balances (e.g. for impermanent loss or closing positions).
                    This creates RECONCILIATION entries that adjust quantity without affecting cost basis.
                </p>
            </div>

            {message && (
                <div
                    className={`text-xs border rounded-lg px-3 py-2 ${message.type === 'error'
                            ? 'text-rose-400 bg-rose-500/10 border-rose-500/40'
                            : 'text-green-400 bg-green-500/10 border-green-500/40'
                        }`}
                >
                    {message.text}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                        As Of Date/Time
                    </span>
                    <input
                        type="datetime-local"
                        value={asOf}
                        onChange={(e) => setAsOf(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                </label>
                <label className="space-y-2">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                        External Reference (Optional)
                    </span>
                    <input
                        type="text"
                        value={externalRef}
                        onChange={(e) => setExternalRef(e.target.value)}
                        placeholder="e.g. LP_EXIT_2025"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                </label>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                        Target Balances
                    </span>
                    <button
                        type="button"
                        onClick={addTargetRow}
                        className="text-xs text-blue-400 hover:text-blue-300"
                    >
                        + Add Target
                    </button>
                </div>

                {targets.length === 0 && (
                    <div className="text-sm text-zinc-500 italic p-2 border border-zinc-800/50 rounded bg-zinc-900/50">
                        No targets added. Click "+ Add Target" to begin.
                    </div>
                )}

                <div className="space-y-2">
                    {targets.map((row) => (
                        <div key={row.id} className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-zinc-900/30 p-2 rounded border border-zinc-800">
                            <select
                                value={row.accountId}
                                onChange={(e) => updateTargetRow(row.id, 'accountId', e.target.value)}
                                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-full md:w-auto flex-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="" disabled>Select Account</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <select
                                value={row.assetId}
                                onChange={(e) => updateTargetRow(row.id, 'assetId', e.target.value)}
                                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-full md:w-auto flex-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="" disabled>Select Asset</option>
                                {assets.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                            </select>
                            <input
                                type="text"
                                value={row.targetQuantity}
                                onChange={(e) => updateTargetRow(row.id, 'targetQuantity', e.target.value)}
                                placeholder="Target Qty (e.g. 1.5)"
                                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-full md:w-32 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <input
                                type="text"
                                value={row.notes || ''}
                                onChange={(e) => updateTargetRow(row.id, 'notes', e.target.value)}
                                placeholder="Notes (optional)"
                                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-full md:w-48 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onClick={() => removeTargetRow(row.id)}
                                className="text-rose-500 hover:text-rose-400 px-2"
                                title="Remove row"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex gap-2 pt-2">
                <button
                    type="button"
                    onClick={handlePreview}
                    disabled={isPreviewing || targets.length === 0}
                    className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium transition-colors"
                >
                    {isPreviewing ? 'Previewing...' : 'Preview'}
                </button>
            </div>

            {preview && (
                <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
                    <h3 className="text-sm font-semibold text-zinc-300">Preview Results</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50">
                                <tr>
                                    <th className="px-3 py-2">Account</th>
                                    <th className="px-3 py-2">Asset</th>
                                    <th className="px-3 py-2 text-right">Current</th>
                                    <th className="px-3 py-2 text-right">Target</th>
                                    <th className="px-3 py-2 text-right">Delta</th>
                                    <th className="px-3 py-2 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {preview.rows.map((row, idx) => {
                                    const accName = accounts.find(a => a.id === row.account_id)?.name || row.account_id;
                                    const assetSymbol = assets.find(a => a.id === row.asset_id)?.symbol || row.asset_id;
                                    const isNegative = row.delta_quantity.startsWith('-');
                                    return (
                                        <tr key={idx} className="hover:bg-zinc-900/30">
                                            <td className="px-3 py-2">{accName}</td>
                                            <td className="px-3 py-2 font-mono">{assetSymbol}</td>
                                            <td className="px-3 py-2 text-right text-zinc-400">{row.current_quantity}</td>
                                            <td className="px-3 py-2 text-right text-zinc-300">{row.target_quantity}</td>
                                            <td className={`px-3 py-2 text-right font-mono ${isNegative ? 'text-rose-400' : 'text-green-400'}`}>
                                                {Number(row.delta_quantity) > 0 ? '+' : ''}{row.delta_quantity}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {row.will_create ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-400">
                                                        Create
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-600 text-xs">No Change</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={handleCommit}
                            disabled={isCommitting}
                            className="text-sm px-4 py-2 rounded-lg border border-blue-500/40 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/60 text-white font-medium transition-colors"
                        >
                            {isCommitting ? 'Committing...' : 'Apply Changes'}
                        </button>
                    </div>
                </div>
            )}

        </Card>
    );
}
