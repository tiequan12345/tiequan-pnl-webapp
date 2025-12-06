import React from 'react';
import { AccountForm } from '../AccountForm';

export default function NewAccountPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">New Account</h2>
      </div>
      <AccountForm mode="create" />
    </div>
  );
}