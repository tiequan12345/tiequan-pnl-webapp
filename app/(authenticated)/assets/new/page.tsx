import React from 'react';
import { AssetForm } from '../AssetForm';

export default function NewAssetPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">New Asset</h2>
      </div>
      <AssetForm mode="create" />
    </div>
  );
}