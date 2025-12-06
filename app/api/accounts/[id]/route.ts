import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_ACCOUNT_TYPES = [
  'CEX',
  'DEX_WALLET',
  'BROKER',
  'BANK',
  'NFT_WALLET',
  'OFFLINE',
  'OTHER',
] as const;

const ALLOWED_ACCOUNT_STATUS = ['ACTIVE', 'INACTIVE'] as const;

type RouteContext = {
  params: {
    id: string;
  };
};

type AccountPayload = {
  name?: string;
  platform?: string;
  account_type?: string;
  chain_or_market?: string | null;
  status?: string;
  notes?: string | null;
};

function isInAllowedList(value: string | undefined, list: readonly string[]): boolean {
  if (!value) {
    return false;
  }
  return list.includes(value);
}

function validateAccountEnums(payload: AccountPayload): string | null {
  const { account_type: accountType, status } = payload;

  if (!isInAllowedList(accountType, ALLOWED_ACCOUNT_TYPES)) {
    return 'Invalid account type.';
  }

  if (!isInAllowedList(status, ALLOWED_ACCOUNT_STATUS)) {
    return 'Invalid account status.';
  }

  return null;
}

export async function PUT(request: Request, context: RouteContext) {
  const id = Number(context.params.id);

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: 'Invalid account id.' },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.account.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Account not found.' },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => null)) as AccountPayload | null;

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON payload.' },
        { status: 400 },
      );
    }

    const name = (body.name ?? '').trim();
    const platform = (body.platform ?? '').trim();
    const accountType = body.account_type;
    const status = body.status;
    const chainOrMarketRaw = body.chain_or_market ?? null;
    const chainOrMarket =
      chainOrMarketRaw === null ? null : chainOrMarketRaw.toString().trim() || null;
    const notesRaw = body.notes ?? null;
    const notes = notesRaw === null ? null : notesRaw.toString();

    if (!name || !platform || !accountType || !status) {
      return NextResponse.json(
        {
          error:
            'name, platform, account_type, and status are required.',
        },
        { status: 400 },
      );
    }

    const enumError = validateAccountEnums(body);
    if (enumError) {
      return NextResponse.json(
        { error: enumError },
        { status: 400 },
      );
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        name,
        platform,
        account_type: accountType as string,
        status: status as string,
        chain_or_market: chainOrMarket,
        notes,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      platform: updated.platform,
      account_type: updated.account_type,
      chain_or_market: updated.chain_or_market,
      status: updated.status,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update account.' },
      { status: 500 },
    );
  }
}