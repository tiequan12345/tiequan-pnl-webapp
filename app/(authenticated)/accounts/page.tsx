import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { AccountsTable } from './AccountsTable';
import { AccountsFilters } from './AccountsFilters';

type AccountsPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

type AccountRow = {
  id: number;
  name: string;
  platform: string;
  accountType: string;
  chainOrMarket: string | null;
  status: string;
  notes: string | null;
};

export default async function AccountsPage(props: AccountsPageProps) {
  const searchParams = await props.searchParams;
  const params = searchParams ?? {};
  const statusFilter = params.status ?? 'ACTIVE';

  const accounts = await prisma.account.findMany({
    orderBy: { name: 'asc' },
  });

  const filteredAccounts = accounts.filter(
    (account) => account.status === statusFilter
  );

  const rows: AccountRow[] = filteredAccounts.map((account) => ({
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
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Accounts</h2>
        <Link
          href="/accounts/new"
          className="text-xs uppercase tracking-wider bg-zinc-900/50 hover:bg-zinc-900/70 text-zinc-200 px-3 py-2 rounded-full border border-white/5 transition-colors"
        >
          + Add Account
        </Link>
      </div>

      <div className="text-zinc-400 text-sm">
        Accounts are logical locations where assets are held. These can be CEX, Brokerages, DeFi Projects, or anywhere else that makes sense
      </div>

      <AccountsFilters currentStatus={statusFilter} />

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <AccountsTable rows={rows} />
      </Card>
    </div>
  );
}