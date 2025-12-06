import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AccountForm, AccountFormInitialValues } from '../AccountForm';

type EditAccountPageProps = {
  params: {
    id: string;
  };
};

export default async function EditAccountPage({ params }: EditAccountPageProps) {
  const id = Number(params.id);

  if (!Number.isFinite(id)) {
    notFound();
  }

  const account = await prisma.account.findUnique({
    where: { id },
  });

  if (!account) {
    notFound();
  }

  const initialValues: AccountFormInitialValues = {
    name: account.name,
    platform: account.platform,
    account_type: account.account_type,
    chain_or_market: account.chain_or_market,
    status: account.status,
    notes: account.notes,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Edit Account</h2>
      </div>
      <AccountForm mode="edit" accountId={id} initialValues={initialValues} />
    </div>
  );
}