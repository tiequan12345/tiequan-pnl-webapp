import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { recalcCostBasis, type RecalcTransaction } from '@/lib/costBasisRecalc';

type TransferIssueLeg = {
  id: number;
  date_time: string;
  quantity: string;
  account_id: number;
  account_name: string;
  asset_id: number;
  asset_symbol: string;
  asset_name: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const assetIdsParam = searchParams.get('assetIds') || '';
    const accountIdsParam = searchParams.get('accountIds') || '';

    const assetIds = assetIdsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    const accountIds = accountIdsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    const where: Record<string, unknown> = {
      tx_type: 'TRANSFER',
    };

    if (assetIds.length > 0) {
      where.asset_id = { in: assetIds };
    }

    const transfers = await prisma.ledgerTransaction.findMany({
      where,
      orderBy: [{ date_time: 'asc' }, { id: 'asc' }],
      include: {
        account: {
          select: { id: true, name: true },
        },
        asset: {
          select: { id: true, symbol: true, name: true, type: true, volatility_bucket: true },
        },
      },
    });

    const recalcTransactions: RecalcTransaction[] = transfers.map((tx) => ({
      id: tx.id,
      date_time: tx.date_time,
      account_id: tx.account_id,
      asset_id: tx.asset_id,
      quantity: tx.quantity,
      tx_type: tx.tx_type,
      external_reference: tx.external_reference,
      total_value_in_base: tx.total_value_in_base,
      unit_price_in_base: tx.unit_price_in_base,
      asset: {
        type: tx.asset.type,
        volatility_bucket: tx.asset.volatility_bucket,
        symbol: tx.asset.symbol,
      },
    }));

    const { diagnostics } = recalcCostBasis(recalcTransactions, { mode: 'PURE' });

    const txMap = new Map(transfers.map((tx) => [tx.id, tx]));
    const enriched = diagnostics.map((diagnostic) => {
      const legs: TransferIssueLeg[] = (diagnostic.legIds || [])
        .map((id) => {
          const tx = txMap.get(id);
          if (!tx) {
            return null;
          }
          return {
            id,
            date_time: tx.date_time.toISOString(),
            quantity: tx.quantity.toString(),
            account_id: tx.account.id,
            account_name: tx.account.name,
            asset_id: tx.asset_id,
            asset_symbol: tx.asset.symbol,
            asset_name: tx.asset.name,
          };
        })
        .filter((leg): leg is TransferIssueLeg => Boolean(leg));

      return {
        ...diagnostic,
        legs,
      };
    });

    const filtered = accountIds.length > 0
      ? enriched.filter((diagnostic) =>
          diagnostic.legs.some((leg) => accountIds.includes(leg.account_id)),
        )
      : enriched;

    return NextResponse.json({
      diagnostics: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch transfer issues.' }, { status: 500 });
  }
}
