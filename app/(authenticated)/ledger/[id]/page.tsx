import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import {
  LedgerForm,
  LedgerFormInitialValues,
} from '../LedgerForm';

type EditLedgerPageProps = {
  params: {
    id: string;
  };
};

export default async function EditLedgerPage({ params }: EditLedgerPageProps) {
  const id = Number(params.id);

  if (!Number.isFinite(id)) {
    notFound();
  }

  const transaction = await prisma.ledgerTransaction.findUnique({
    where: { id },
  });

  if (!transaction) {
    notFound();
  }

  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          ledger_transactions: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const assets = await prisma.asset.findMany({
    select: {
      id: true,
      symbol: true,
      name: true,
      _count: {
        select: {
          ledger_transactions: true,
        },
      },
    },
    orderBy: { symbol: 'asc' },
  });

  const initialValues: LedgerFormInitialValues = {
    date_time: transaction.date_time.toISOString(),
    account_id: transaction.account_id,
    asset_id: transaction.asset_id,
    quantity: transaction.quantity.toString(),
    tx_type: transaction.tx_type,
    external_reference: transaction.external_reference ?? null,
    notes: transaction.notes ?? null,
  };

  const accountsForSelect = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    usageCount: account._count.ledger_transactions,
  }));

  const assetsForSelect = assets.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    usageCount: asset._count.ledger_transactions,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Edit Transaction</h2>
      </div>
      <LedgerForm
        mode="edit"
        transactionId={id}
        initialValues={initialValues}
        accounts={accountsForSelect}
        assets={assetsForSelect}
      />
    </div>
  );
}