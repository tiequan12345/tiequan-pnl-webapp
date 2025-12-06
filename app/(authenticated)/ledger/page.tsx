import React from 'react';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { LedgerForm } from './LedgerForm';
import { LedgerFilters } from './LedgerFilters';
import { LedgerPagination } from './LedgerPagination';
import { LedgerRowActions } from './LedgerRowActions';

type LedgerPageProps = {
  searchParams?: {
    page?: string;
    pageSize?: string;
    dateFrom?: string;
    dateTo?: string;
    accountIds?: string;
    assetIds?: string;
    txTypes?: string;
  };
};

type LedgerRow = {
  id: number;
  dateTime: string;
  accountName: string;
  assetLabel: string;
  txType: string;
  quantity: string;
  notes: string | null;
};

function parseDateTime(input: string | undefined): Date | null {
  if (!input) {
    return null;
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const params = searchParams ?? {};

  const pageParam = params.page;
  const pageSizeParam = params.pageSize;

  let page = Number(pageParam);
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  let pageSize = Number(pageSizeParam);
  if (!Number.isFinite(pageSize) || pageSize < 1) {
    pageSize = 50;
  }
  if (pageSize > 100) {
    pageSize = 100;
  }

  const dateFromRaw = params.dateFrom;
  const dateToRaw = params.dateTo;

  const dateFrom = parseDateTime(dateFromRaw);
  const dateTo = parseDateTime(dateToRaw);

  const accountIdsParam = params.accountIds ?? '';
  const assetIdsParam = params.assetIds ?? '';
  const txTypesParam = params.txTypes ?? '';

  const accountIds = accountIdsParam
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const assetIds = assetIdsParam
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const txTypes = txTypesParam
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => Boolean(value));

  const where: Record<string, unknown> = {};

  if (dateFrom || dateTo) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      dateFilter.gte = dateFrom;
    }
    if (dateTo) {
      dateFilter.lte = dateTo;
    }
    where.date_time = dateFilter;
  }

  if (accountIds.length > 0) {
    where.account_id = { in: accountIds };
  }

  if (assetIds.length > 0) {
    where.asset_id = { in: assetIds };
  }

  if (txTypes.length > 0) {
    where.tx_type = { in: txTypes };
  }

  const totalItems = await prisma.ledgerTransaction.count({
    where,
  });

  const transactions = await prisma.ledgerTransaction.findMany({
    where,
    orderBy: { date_time: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      account: {
        select: {
          id: true,
          name: true,
        },
      },
      asset: {
        select: {
          id: true,
          symbol: true,
          name: true,
        },
      },
    },
  });

  const accounts = await prisma.account.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
    },
  });

  const assets = await prisma.asset.findMany({
    orderBy: { symbol: 'asc' },
    select: {
      id: true,
      symbol: true,
      name: true,
    },
  });

  const rows: LedgerRow[] = transactions.map((tx) => ({
    id: tx.id,
    dateTime: tx.date_time.toISOString(),
    accountName: tx.account.name,
    assetLabel: `${tx.asset.symbol} (${tx.asset.name})`,
    txType: tx.tx_type,
    quantity: tx.quantity.toString(),
    notes: tx.notes ?? null,
  }));

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  const accountsForSelect = accounts.map((account) => ({
    id: account.id,
    name: account.name,
  }));

  const assetsForSelect = assets.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
  }));

  const initialFilters = {
    dateFrom: dateFrom && dateFromRaw ? dateFromRaw.slice(0, 10) : undefined,
    dateTo: dateTo && dateToRaw ? dateToRaw.slice(0, 10) : undefined,
    accountId: accountIds.length > 0 ? accountIds[0] : null,
    assetId: assetIds.length > 0 ? assetIds[0] : null,
    txType: txTypes.length > 0 ? txTypes[0] : null,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Ledger</h2>
        <div className="text-xs text-zinc-500">
          {totalItems === 0
            ? 'No transactions yet'
            : `Showing page ${page} of ${totalPages || 1}`}
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              Add Transaction
            </h3>
          </div>
          <LedgerForm
            mode="create"
            accounts={accountsForSelect}
            assets={assetsForSelect}
          />
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-zinc-800 px-4 py-3">
          <LedgerFilters
            accounts={accountsForSelect}
            assets={assetsForSelect}
            initialFilters={initialFilters}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Date / Time</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Tx Type</th>
                <th className="px-4 py-3 font-medium text-right">Quantity</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No ledger transactions found. Once you add transactions, they
                    will appear here.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-300">{row.dateTime}</td>
                    <td className="px-4 py-3 text-zinc-200 font-semibold">
                      {row.accountName}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{row.assetLabel}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.txType}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {row.quantity.startsWith('-')
                        ? row.quantity
                        : `+${row.quantity}`}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                      {row.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <LedgerRowActions transactionId={row.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-xs text-zinc-500">
          <div>
            {totalItems === 0
              ? 'No transactions to display.'
              : `Showing ${rows.length} of ${totalItems} transactions`}
          </div>
          <LedgerPagination page={page} totalPages={totalPages} />
        </div>
      </Card>
    </div>
  );
}