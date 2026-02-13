import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { LedgerForm } from './LedgerForm';
import { LedgerFilters } from './LedgerFilters';
import { LedgerPagination } from './LedgerPagination';
import { LedgerTable, LedgerTableRow } from './LedgerTable';

type LedgerPageProps = {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    dateFrom?: string;
    dateTo?: string;
    accountIds?: string;
    assetIds?: string;
    txTypes?: string;
  }>;
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

export default async function LedgerPage(props: LedgerPageProps) {
  const searchParams = await props.searchParams;
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

  // Get accounts with usage counts and CCXT connection status
  const accountsWithUsage = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      _count: {
        select: {
          ledger_transactions: true,
        },
      },
      ccxt_connection: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Get assets with usage counts
  const assetsWithUsage = await prisma.asset.findMany({
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      symbol: true,
      name: true,
      _count: {
        select: {
          ledger_transactions: true,
        },
      },
    },
    orderBy: [
      { ledger_transactions: { _count: 'desc' } },
      { symbol: 'asc' },
    ],
  });

  const rows: LedgerTableRow[] = transactions.map((tx) => ({
    id: tx.id,
    dateTime: tx.date_time.toISOString(),
    accountName: tx.account.name,
    assetLabel: `${tx.asset.symbol} (${tx.asset.name})`,
    txType: tx.tx_type,
    quantity: tx.quantity.toString(),
    quantityValue: Number(tx.quantity.toString()),
    notes: tx.notes ?? null,
  }));

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  const accountsForSelect = accountsWithUsage.map((account) => ({
    id: account.id,
    name: account.name,
    status: account.status,
    usageCount: account._count.ledger_transactions,
    hasCcxtConnection: account.ccxt_connection !== null,
  }));

  const assetsForSelect = assetsWithUsage.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    usageCount: asset._count.ledger_transactions,
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
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Ledger</h2>
        <div className="text-xs text-zinc-500">
          {totalItems === 0
            ? 'No transactions yet'
            : `Showing page ${page} of ${totalPages || 1}`}
        </div>
      </div>

      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
              Add Transaction
            </h3>
          </div>
          <LedgerForm
            mode="create"
            accounts={accountsForSelect.filter((a) => a.status === 'ACTIVE')}
            assets={assetsForSelect}
          />
        </div>
      </Card>

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <Suspense fallback={null}>
            <LedgerFilters
              accounts={accountsForSelect}
              assets={assetsForSelect}
              initialFilters={initialFilters}
            />
          </Suspense>
        </div>

        <div className="overflow-x-auto">
          <LedgerTable rows={rows} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-xs text-zinc-500">
          <div>
            {totalItems === 0
              ? 'No transactions to display.'
              : `Showing ${rows.length} of ${totalItems} transactions`}
          </div>
          <Suspense fallback={null}>
            <LedgerPagination page={page} totalPages={totalPages} />
          </Suspense>
        </div>
      </Card>
    </div>
  );
}