import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { AccountsTable } from './AccountsTable';

type AccountRow = {
  id: number;
  name: string;
  platform: string;
  accountType: string;
  chainOrMarket: string | null;
  status: string;
  notes: string | null;
};

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    orderBy: { name: 'asc' },
  });

  const rows: AccountRow[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    platform: account.platform,
    accountType: account.account_type,
    chainOrMarket: account.chain_or_market ?? null,
    status: account.status,
    notes: account.notes ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Accounts</h2>
        <Link
          href="/accounts/new"
          className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
        >
          + Add Account
        </Link>
      </div>

      <Card className="p-0">
        <AccountsTable rows={rows} />
      </Card>
    </div>
  );
}