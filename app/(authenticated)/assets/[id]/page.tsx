import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AssetForm, AssetFormInitialValues } from '../AssetForm';

type EditAssetPageProps = {
  params: {
    id: string;
  };
};

export default async function EditAssetPage({ params }: EditAssetPageProps) {
  const id = Number(params.id);

  if (!Number.isFinite(id)) {
    notFound();
  }

  const asset = await prisma.asset.findUnique({
    where: { id },
  });

  if (!asset) {
    notFound();
  }

  const initialValues: AssetFormInitialValues = {
    symbol: asset.symbol,
    name: asset.name,
    type: asset.type,
    volatility_bucket: asset.volatility_bucket,
    pricing_mode: asset.pricing_mode,
    chain_or_market: asset.chain_or_market,
    manual_price: asset.manual_price ? asset.manual_price.toString() : null,
    metadata_json: asset.metadata_json,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Edit Asset</h2>
      </div>
      <AssetForm mode="edit" assetId={id} initialValues={initialValues} />
    </div>
  );
}