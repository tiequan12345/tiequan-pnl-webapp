'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AssetRowActionsProps = {
  assetId: number;
};

export function AssetRowActions({ assetId }: AssetRowActionsProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this asset?',
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        window.alert(data?.error || 'Failed to delete asset.');
        return;
      }

      router.refresh();
    } catch {
      window.alert('Unexpected error while deleting asset.');
    }
  };

  return (
    <div className="flex items-center justify-end gap-3">
      <Link
        href={`/assets/${assetId}`}
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