'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type LedgerPaginationProps = {
  page: number;
  totalPages: number;
};

export function LedgerPagination({ page, totalPages }: LedgerPaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const handleChangePage = (nextPage: number) => {
    if (nextPage < 1 || (totalPages > 0 && nextPage > totalPages)) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    const search = params.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  };

  const hasPrevious = page > 1;
  const hasNext = totalPages > 0 && page < totalPages;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleChangePage(page - 1)}
        disabled={!hasPrevious}
        className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 disabled:opacity-40 disabled:cursor-default hover:bg-zinc-800"
      >
        Previous
      </button>
      <span className="text-xs text-zinc-500">
        Page {totalPages === 0 ? 0 : page} of {totalPages || 1}
      </span>
      <button
        type="button"
        onClick={() => handleChangePage(page + 1)}
        disabled={!hasNext}
        className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 disabled:opacity-40 disabled:cursor-default hover:bg-zinc-800"
      >
        Next
      </button>
    </div>
  );
}