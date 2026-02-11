import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ExchangeConnectionClient } from './ExchangeConnectionClient';

type ExchangePageProps = {
  params: Promise<{ id: string }>;
};

export default async function AccountExchangePage({ params }: ExchangePageProps) {
  const { id: idParam } = await params;
  const accountId = Number(idParam);

  if (!Number.isFinite(accountId) || accountId <= 0) {
    notFound();
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      account_type: true,
    },
  });

  if (!account) {
    notFound();
  }

  const exchangeId =
    account.account_type === 'BINANCE'
      ? 'binance'
      : account.account_type === 'BYBIT'
        ? 'bybit'
        : null;

  if (!exchangeId) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white tracking-tight">Exchange Integration</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Account: <span className="text-zinc-200">{account.name}</span> ({account.account_type})
        </p>
      </div>

      <ExchangeConnectionClient accountId={account.id} exchangeId={exchangeId} />
    </div>
  );
}
