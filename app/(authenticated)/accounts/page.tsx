import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';

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
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Chain / Market</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No accounts found. Use "Add Account" to create your first account.
                </td>
              </tr>
            ) : (
              rows.map((account) => (
                <tr key={account.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-200 font-semibold">
                    {account.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {account.platform}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {account.accountType}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {account.chainOrMarket ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge type={account.status === 'ACTIVE' ? 'green' : 'default'}>
                      {account.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                    {account.notes ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}