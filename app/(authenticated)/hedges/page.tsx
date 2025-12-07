import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import {
  HedgeTransactionsTable,
  type HedgeTableRow,
  NetExposureTable,
  type NetExposureRow,
} from './HedgesTables';

export default async function HedgesPage() {
  const [activeHedges, grouped] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where: { tx_type: 'HEDGE' },
      orderBy: { date_time: 'desc' },
      include: {
        account: { select: { name: true } },
        asset: { select: { symbol: true, name: true } },
      },
    }),
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id'],
      _sum: { quantity: true },
    }),
  ]);

  const assetIds = grouped.map((item) => item.asset_id);
  const assets = assetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, symbol: true, name: true },
      })
    : [];

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const netExposureRows: NetExposureRow[] = grouped
    .map((item) => {
      const asset = assetById.get(item.asset_id);
      const netQuantity = item._sum.quantity?.toString() ?? '0';
      const netQuantityValue = Number(netQuantity);
      return asset
        ? {
            assetId: asset.id,
            assetSymbol: asset.symbol,
            assetName: asset.name,
            netQuantity,
            netQuantityValue,
          }
        : null;
    })
    .filter((row): row is NetExposureRow => Boolean(row))
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  const hedgeRows: HedgeTableRow[] = activeHedges.map((tx) => ({
    id: tx.id,
    dateTime: tx.date_time.toISOString(),
    accountName: tx.account.name,
    assetSymbol: tx.asset.symbol,
    assetName: tx.asset.name,
    quantity: tx.quantity.toString(),
    quantityValue: Number(tx.quantity.toString()),
    notes: tx.notes ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Hedges</h2>
        <div className="text-xs text-zinc-500">
          {hedgeRows.length === 0
            ? 'No hedge transactions yet'
            : `${hedgeRows.length} active hedge entries`}
        </div>
      </div>

      <Card>
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Net Exposure by Asset</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Sum of signed hedge quantities grouped by asset.
          </p>
        </div>
        <NetExposureTable rows={netExposureRows} />
      </Card>

      <Card className="p-0">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Active Hedges</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Latest hedge transactions with account and notes.
          </p>
        </div>
        <HedgeTransactionsTable rows={hedgeRows} />
      </Card>
    </div>
  );
}