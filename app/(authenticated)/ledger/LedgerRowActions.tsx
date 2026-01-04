'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LedgerRowActionsProps = {
  transactionId: number;
};

export function LedgerRowActions({ transactionId }: LedgerRowActionsProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this transaction?',
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/ledger/${transactionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        window.alert(data?.error || 'Failed to delete transaction.');
        return;
      }

      router.refresh();
    } catch {
      window.alert('Unexpected error while deleting transaction.');
    }
  };

  return (
    <div className="flex items-center justify-end gap-3">
      <Link
        href={`/ledger/${transactionId}`}
        className="text-xs text-blue-400 hover:text-blue-300"
        onClick={(e) => e.stopPropagation()}
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        className="text-xs text-rose-400 hover:text-rose-300"
      >
        Delete
      </button>
    </div>
  );
}