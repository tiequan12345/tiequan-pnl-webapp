'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type AssetsFiltersProps = {
  currentStatus?: string;
};

export function AssetsFilters({ currentStatus = 'ACTIVE' }: AssetsFiltersProps) {
  const pathname = usePathname();

  const buildUrl = (status: string) => {
    const params = new URLSearchParams();

    if (status !== 'ACTIVE') {
      params.set('status', status);
    }

    const queryString = params.toString();
    const targetPath = pathname ?? '/assets';
    return queryString ? `${targetPath}?${queryString}` : targetPath;
  };

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium text-zinc-400">Status:</span>
      <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
        <Link
          href={buildUrl('ACTIVE')}
          className={`px-3 py-1.5 text-sm rounded-md transition ${
            currentStatus === 'ACTIVE'
              ? 'bg-blue-600 text-white'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          Active
        </Link>
        <Link
          href={buildUrl('INACTIVE')}
          className={`px-3 py-1.5 text-sm rounded-md transition ${
            currentStatus === 'INACTIVE'
              ? 'bg-blue-600 text-white'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          Inactive
        </Link>
      </div>
    </div>
  );
}
