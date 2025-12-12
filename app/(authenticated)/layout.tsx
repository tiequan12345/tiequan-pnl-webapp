import React from 'react';
import { AppShell } from './_components/AppShell';
import { PrivacyProvider } from './_contexts/PrivacyContext';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivacyProvider>
      <AppShell>{children}</AppShell>
    </PrivacyProvider>
  );
}