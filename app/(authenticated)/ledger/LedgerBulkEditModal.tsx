'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ALLOWED_TX_TYPES, type LedgerTxType } from '@/lib/ledger';

type LedgerBulkEditModalProps = {
    isOpen: boolean;
    onClose: () => void;
    selectedCount: number;
    accounts: { id: number; name: string }[];
    onConfirm: (updates: {
        date_time?: string;
        account_id?: number;
        tx_type?: LedgerTxType;
        notes?: string;
    }) => Promise<void>;
};

export function LedgerBulkEditModal({
    isOpen,
    onClose,
    selectedCount,
    accounts,
    onConfirm,
}: LedgerBulkEditModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [updates, setUpdates] = useState<{
        date_time?: string;
        account_id?: string;
        tx_type?: string;
        notes?: string;
    }>({});

    const [enabledFields, setEnabledFields] = useState<{
        date_time: boolean;
        account_id: boolean;
        tx_type: boolean;
        notes: boolean;
    }>({
        date_time: false,
        account_id: false,
        tx_type: false,
        notes: false,
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const finalUpdates: any = {};
        if (enabledFields.date_time && updates.date_time) {
            finalUpdates.date_time = new Date(updates.date_time).toISOString();
        }
        if (enabledFields.account_id && updates.account_id) finalUpdates.account_id = Number(updates.account_id);
        if (enabledFields.tx_type && updates.tx_type) finalUpdates.tx_type = updates.tx_type;
        if (enabledFields.notes && updates.notes !== undefined) finalUpdates.notes = updates.notes;

        try {
            await onConfirm(finalUpdates);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-zinc-800">
                    <h2 className="text-xl font-semibold text-zinc-100">Bulk Edit {selectedCount} Transactions</h2>
                    <p className="text-sm text-zinc-500 mt-1">Select fields to update. Unselected fields will remain unchanged.</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                    {/* Date Field */}
                    <div className="flex gap-4 items-start">
                        <div className="pt-2">
                            <input
                                type="checkbox"
                                className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0"
                                checked={enabledFields.date_time}
                                onChange={e => setEnabledFields(p => ({ ...p, date_time: e.target.checked }))}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Date & Time</label>
                            <input
                                type="datetime-local"
                                disabled={!enabledFields.date_time}
                                className="w-full bg-zinc-800 border-zinc-700 rounded-md text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:ring-blue-500/20 p-2"
                                onChange={e => setUpdates(p => ({ ...p, date_time: e.target.value }))}
                            />
                        </div>
                    </div>

                    {/* Account Field */}
                    <div className="flex gap-4 items-start">
                        <div className="pt-2">
                            <input
                                type="checkbox"
                                className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0"
                                checked={enabledFields.account_id}
                                onChange={e => setEnabledFields(p => ({ ...p, account_id: e.target.checked }))}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Account</label>
                            <select
                                disabled={!enabledFields.account_id}
                                className="w-full bg-zinc-800 border-zinc-700 rounded-md text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:ring-blue-500/20 p-2"
                                onChange={e => setUpdates(p => ({ ...p, account_id: e.target.value }))}
                                defaultValue=""
                            >
                                <option value="" disabled>Select Account</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Tx Type Field */}
                    <div className="flex gap-4 items-start">
                        <div className="pt-2">
                            <input
                                type="checkbox"
                                className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0"
                                checked={enabledFields.tx_type}
                                onChange={e => setEnabledFields(p => ({ ...p, tx_type: e.target.checked }))}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Transaction Type</label>
                            <select
                                disabled={!enabledFields.tx_type}
                                className="w-full bg-zinc-800 border-zinc-700 rounded-md text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:ring-blue-500/20 p-2"
                                onChange={e => setUpdates(p => ({ ...p, tx_type: e.target.value }))}
                                defaultValue=""
                            >
                                <option value="" disabled>Select Type</option>
                                {ALLOWED_TX_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Notes Field */}
                    <div className="flex gap-4 items-start">
                        <div className="pt-2">
                            <input
                                type="checkbox"
                                className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0"
                                checked={enabledFields.notes}
                                onChange={e => setEnabledFields(p => ({ ...p, notes: e.target.checked }))}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Notes</label>
                            <textarea
                                disabled={!enabledFields.notes}
                                className="w-full bg-zinc-800 border-zinc-700 rounded-md text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:ring-blue-500/20 p-2"
                                rows={3}
                                onChange={e => setUpdates(p => ({ ...p, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                </form>

                <div className="p-6 border-t border-zinc-800 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition"
                        type="button"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={(e) => handleSubmit(e as any)}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md transition disabled:opacity-50"
                    >
                        {isSubmitting ? 'Updating...' : 'Apply Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}