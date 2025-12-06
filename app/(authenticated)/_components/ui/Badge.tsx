import React from 'react';

type BadgeType = 'default' | 'green' | 'red' | 'blue' | 'orange';

export function Badge({
  children,
  type = 'default',
}: {
  children: React.ReactNode;
  type?: BadgeType;
}) {
  const styles: Record<BadgeType, string> = {
    default: 'bg-zinc-800 text-zinc-300',
    green: 'bg-emerald-500/10 text-emerald-400',
    red: 'bg-rose-500/10 text-rose-400',
    blue: 'bg-blue-500/10 text-blue-400',
    orange: 'bg-orange-500/10 text-orange-400',
  };

  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium ${styles[type]}`}>
      {children}
    </span>
  );
}