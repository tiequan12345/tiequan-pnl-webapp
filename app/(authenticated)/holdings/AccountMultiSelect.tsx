'use client';

import { useState, useRef, useEffect } from 'react';

type Account = {
  id: number;
  name: string;
};

type AccountMultiSelectProps = {
  accounts: Account[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
  label?: string;
};

export function AccountMultiSelect({
  accounts,
  selectedIds,
  onChange,
  isLoading = false,
  label = 'Accounts',
}: AccountMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((currentId) => currentId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    const filteredAccountIds = filteredAccounts.map(a => String(a.id));
    const newSelectedIds = Array.from(new Set([...selectedIds, ...filteredAccountIds]));
    onChange(newSelectedIds);
  };

  const handleClear = () => {
    if (searchQuery) {
      const filteredAccountIds = filteredAccounts.map(a => String(a.id));
      onChange(selectedIds.filter(id => !filteredAccountIds.includes(id)));
    } else {
      onChange([]);
    }
  };

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCount = selectedIds.length;
  const isAllSelected = accounts.length > 0 && selectedCount === accounts.length;

  return (
    <div className="flex items-center gap-4">
      {label && <span className="text-sm font-medium text-zinc-400">{label}:</span>}

      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="inline-flex items-center justify-between min-w-[200px] px-3 py-1.5 text-sm border rounded-lg bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        >
          <span className="truncate max-w-[250px]">
            {isLoading
              ? 'Loading...'
              : selectedCount === 0
                ? 'Select accounts...'
                : isAllSelected
                  ? 'All accounts selected'
                  : `${selectedCount} account${selectedCount === 1 ? '' : 's'} selected`}
          </span>
          <svg
            className={`w-4 h-4 ml-2 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-72 mt-2 origin-top-left border rounded-xl shadow-2xl bg-zinc-950 border-zinc-800 ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden left-0">
            {/* Search Input */}
            <div className="p-2 border-b border-zinc-800/50 bg-zinc-900/20">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  autoFocus
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50"
                />
              </div>
            </div>

            <div className="p-2 border-b border-zinc-800/50 flex justify-between bg-zinc-900/50">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-400/10 transition-colors"
              >
                {searchQuery ? 'Select Visible' : 'Select All'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
              >
                {searchQuery ? 'Clear Visible' : 'Clear All'}
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-1 space-y-0.5">
              {filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => {
                  const isSelected = selectedIds.includes(String(account.id));
                  return (
                    <div
                      key={account.id}
                      onClick={() => handleToggle(String(account.id))}
                      className={`flex items-center px-2 py-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-500/10' : 'hover:bg-zinc-800/50'
                        }`}
                    >
                      <div className={`flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center border rounded transition-colors mr-3 ${isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-zinc-700 bg-transparent group-hover:border-zinc-600'
                        }`}>
                        {isSelected && (
                          <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm truncate select-none ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`}>
                        {account.name}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-3 text-sm text-zinc-500 text-center italic">
                  {searchQuery ? 'No accounts match search' : 'No accounts found'}
                </div>
              )}
            </div>

            {selectedCount > 0 && (
              <div className="px-3 py-2 border-t border-zinc-800/50 bg-zinc-900/30 text-[10px] text-zinc-500 text-center">
                {selectedCount} of {accounts.length} selected
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}