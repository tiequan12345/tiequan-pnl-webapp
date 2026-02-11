'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AccountRowActionsProps = {
  accountId: number;
  accountType: string;
};

export function AccountRowActions({ accountId, accountType }: AccountRowActionsProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this account?',
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        window.alert(data?.error || 'Failed to delete account.');
        return;
      }

      router.refresh();
    } catch {
      window.alert('Unexpected error while deleting account.');
    }
  };

  return (
    <div className="flex items-center justify-end gap-3">
      {accountType === 'BINANCE' || accountType === 'BYBIT' ? (
        <Link
          href={`/accounts/${accountId}/exchange`}
          className="text-xs text-emerald-400 hover:text-emerald-300"
        >
          Exchange
        </Link>
      ) : null}
      <Link
        href={`/accounts/${accountId}`}
        className="text-xs text-blue-400 hover:text-blue-300"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        className="text-xs text-rose-400 hover:text-rose-300"
      >
        Delete
      </button>
    </div>
  );
}
