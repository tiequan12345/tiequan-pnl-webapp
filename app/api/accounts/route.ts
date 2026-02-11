import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_ACCOUNT_TYPES = [
  'CEX',
  'DEX_WALLET',
  'BROKER',
  'BANK',
  'BINANCE',
  'BYBIT',
  'NFT_WALLET',
  'OFFLINE',
  'OTHER',
] as const;

const ALLOWED_ACCOUNT_STATUS = ['ACTIVE', 'INACTIVE'] as const;

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

export async function GET() {
  try {
    // Get accounts with their most recent transaction date
    const accounts = await prisma.account.findMany({
      where: {
        status: 'ACTIVE'
      },
      select: {
        id: true,
        name: true,
        platform: true,
        account_type: true,
        chain_or_market: true,
        status: true,
        notes: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            ledger_transactions: true,
          },
        },
        ledger_transactions: {
          select: {
            created_at: true,
          },
          orderBy: {
            created_at: 'desc'
          },
          take: 1,
        },
      },
    });

    // Sort accounts by most recent transaction date (accounts with no transactions go to the end)
    const sortedAccounts = accounts.sort((a, b) => {
      const aLastTransaction = a.ledger_transactions[0]?.created_at;
      const bLastTransaction = b.ledger_transactions[0]?.created_at;
      
      // If both have transactions, sort by most recent
      if (aLastTransaction && bLastTransaction) {
        return new Date(bLastTransaction).getTime() - new Date(aLastTransaction).getTime();
      }
      
      // If only one has transactions, prioritize the one with transactions
      if (aLastTransaction && !bLastTransaction) {
        return -1;
      }
      
      if (!aLastTransaction && bLastTransaction) {
        return 1;
      }
      
      // If neither has transactions, sort by name
      return a.name.localeCompare(b.name);
    });

    // Remove the ledger_transactions from the response since we only needed it for sorting
    const responseAccounts = sortedAccounts.map(({ ledger_transactions, ...account }) => account);

    return NextResponse.json(responseAccounts);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch accounts.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
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

    const created = await prisma.account.create({
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
      id: created.id,
      name: created.name,
      platform: created.platform,
      account_type: created.account_type,
      chain_or_market: created.chain_or_market,
      status: created.status,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create account.' },
      { status: 500 },
    );
  }
}