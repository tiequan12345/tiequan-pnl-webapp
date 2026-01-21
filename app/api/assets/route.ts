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

export async function GET() {
  try {
    const assets = await prisma.asset.findMany({
      select: {
        id: true,
        symbol: true,
        name: true,
        type: true,
        volatility_bucket: true,
        chain_or_market: true,
        pricing_mode: true,
        manual_price: true,
        metadata_json: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            ledger_transactions: true,
          },
        },
      },
      orderBy: { symbol: 'asc' },
    });

    return NextResponse.json(assets);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch assets.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
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

    const existing = await prisma.asset.findFirst({
      where: {
        symbol,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An asset with this symbol already exists.' },
        { status: 400 },
      );
    }

    const created = await prisma.asset.create({
      data: {
        symbol,
        name,
        type,
        volatility_bucket: volatilityBucket as string,
        chain_or_market: chainOrMarket,
        pricing_mode: pricingMode as string,
        manual_price: manualPriceParsed === undefined ? undefined : manualPriceParsed,
        metadata_json: body.metadata_json ?? undefined,
      },
    });

    return NextResponse.json({
      id: created.id,
      symbol: created.symbol,
      name: created.name,
      type: created.type,
      volatility_bucket: created.volatility_bucket,
      chain_or_market: created.chain_or_market,
      pricing_mode: created.pricing_mode,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create asset.' },
      { status: 500 },
    );
  }
}
