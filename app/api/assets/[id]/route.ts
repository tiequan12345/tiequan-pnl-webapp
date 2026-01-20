import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_ASSET_TYPES = [
  'CRYPTO',
  'EQUITY',
  'STABLE',
  'NFT',
  'OFFLINE',
  'CASH',
  'OTHER',
] as const;

const ALLOWED_VOLATILITY_BUCKETS = ['CASH_LIKE', 'VOLATILE'] as const;

const ALLOWED_PRICING_MODES = ['AUTO', 'MANUAL'] as const;

const ALLOWED_ASSET_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AssetPayload = {
  symbol?: string;
  name?: string;
  type?: string;
  volatility_bucket?: string;
  chain_or_market?: string | null;
  pricing_mode?: string;
  manual_price?: string | number | null;
  metadata_json?: string | null;
  status?: string;
};

function isInAllowedList(value: string | undefined, list: readonly string[]): boolean {
  if (!value) {
    return false;
  }
  return list.includes(value);
}

function validateAssetEnums(payload: AssetPayload): string | null {
  const { type, volatility_bucket: volatilityBucket, pricing_mode: pricingMode, status } = payload;

  if (!isInAllowedList(type, ALLOWED_ASSET_TYPES)) {
    return 'Invalid asset type.';
  }

  if (!isInAllowedList(volatilityBucket, ALLOWED_VOLATILITY_BUCKETS)) {
    return 'Invalid volatility bucket.';
  }

  if (!isInAllowedList(pricingMode, ALLOWED_PRICING_MODES)) {
    return 'Invalid pricing mode.';
  }

  if (status && !isInAllowedList(status, ALLOWED_ASSET_STATUSES)) {
    return 'Invalid asset status.';
  }

  return null;
}

function parseManualPrice(input: string | number | null | undefined): string | null | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return null;
    }
    return input.toString();
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return trimmed;
}

export async function PUT(request: Request, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: 'Invalid asset id.' },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.asset.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Asset not found.' },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => null)) as AssetPayload | null;

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON payload.' },
        { status: 400 },
      );
    }

    const symbol = (body.symbol ?? '').trim();
    const name = (body.name ?? '').trim();
    const type = body.type;
    const volatilityBucket = body.volatility_bucket;
    const pricingMode = body.pricing_mode;
    const chainOrMarket = (body.chain_or_market ?? '').toString().trim();
    const status = body.status ?? existing.status;

    if (!symbol || !name || !type || !volatilityBucket || !pricingMode) {
      return NextResponse.json(
        {
          error:
            'symbol, name, type, volatility_bucket, and pricing_mode are required.',
        },
        { status: 400 },
      );
    }

    const enumError = validateAssetEnums(body);
    if (enumError) {
      return NextResponse.json(
        { error: enumError },
        { status: 400 },
      );
    }

    const manualPriceParsed = parseManualPrice(body.manual_price ?? null);
    if (manualPriceParsed === null) {
      return NextResponse.json(
        { error: 'manual_price must be a valid number if provided.' },
        { status: 400 },
      );
    }

    if (symbol !== existing.symbol) {
      const conflict = await prisma.asset.findFirst({
        where: {
          symbol,
          NOT: { id },
        },
      });

      if (conflict) {
        return NextResponse.json(
          { error: 'Another asset with this symbol already exists.' },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        symbol,
        name,
        type,
        volatility_bucket: volatilityBucket as string,
        chain_or_market: chainOrMarket,
        pricing_mode: pricingMode as string,
        manual_price: manualPriceParsed === undefined ? undefined : manualPriceParsed,
        metadata_json: body.metadata_json ?? undefined,
        status,
      },
    });

    return NextResponse.json({
      id: updated.id,
      symbol: updated.symbol,
      name: updated.name,
      type: updated.type,
      volatility_bucket: updated.volatility_bucket,
      chain_or_market: updated.chain_or_market,
      pricing_mode: updated.pricing_mode,
      status: updated.status,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update asset.' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: 'Invalid asset id.' },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.asset.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Asset not found.' },
        { status: 404 },
      );
    }

    // Check if there are any ledger transactions that reference this asset
    const transactionsCount = await prisma.ledgerTransaction.count({
      where: { asset_id: id },
    });

    if (transactionsCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete asset. It is referenced by ${transactionsCount} ledger transaction(s). Please delete the transactions first.`
        },
        { status: 400 },
      );
    }

    await prisma.asset.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete asset.' },
      { status: 500 },
    );
  }
}
