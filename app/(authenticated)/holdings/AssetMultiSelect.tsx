'use client';

import { useState, useRef, useEffect } from 'react';

type Asset = {
    id: number;
    symbol: string;
    name: string;
};

type AssetMultiSelectProps = {
    assets: Asset[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    isLoading?: boolean;
    placeholder?: string;
};

export function AssetMultiSelect({
    assets,
    selectedIds,
    onChange,
    isLoading = false,
    placeholder = 'Filter Assets...',
}: AssetMultiSelectProps) {
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
        const filteredAssetIds = filteredAssets.map(a => String(a.id));
        const newSelectedIds = Array.from(new Set([...selectedIds, ...filteredAssetIds]));
        onChange(newSelectedIds);
    };

    const handleClear = () => {
        if (searchQuery) {
            const filteredAssetIds = filteredAssets.map(a => String(a.id));
            onChange(selectedIds.filter(id => !filteredAssetIds.includes(id)));
        } else {
            onChange([]);
        }
    };

    const filteredAssets = assets.filter(asset =>
        asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedCount = selectedIds.length;

    return (
        <div className="relative inline-block" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition border ${selectedCount > 0
                        ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-200'
                        : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>{selectedCount > 0 ? `${selectedCount} Assets` : 'More Assets...'}</span>
                <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/50">
                    <div className="p-3 border-b border-zinc-800 bg-zinc-900/50">
                        <div className="relative">
                            <input
                                autoFocus
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={placeholder}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/30 border-b border-zinc-800/50">
                        <button
                            onClick={handleSelectAll}
                            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-wider disabled:opacity-50"
                            disabled={filteredAssets.length === 0}
                        >
                            Select {searchQuery ? 'Matches' : 'All'}
                        </button>
                        <button
                            onClick={handleClear}
                            className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors uppercase tracking-wider disabled:opacity-50"
                            disabled={selectedCount === 0}
                        >
                            Clear {searchQuery ? 'Matches' : 'All'}
                        </button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                            </div>
                        ) : filteredAssets.length > 0 ? (
                            filteredAssets.map((asset) => {
                                const isSelected = selectedIds.includes(String(asset.id));
                                return (
                                    <div
                                        key={asset.id}
                                        onClick={() => handleToggle(String(asset.id))}
                                        className={`flex items-center px-2 py-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/50'
                                            }`}
                                    >
                                        <div className={`flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center border rounded transition-colors mr-3 ${isSelected
                                                ? 'bg-emerald-500 border-emerald-500'
                                                : 'border-zinc-700 bg-transparent group-hover:border-zinc-600'
                                            }`}>
                                            {isSelected && (
                                                <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <div className="flex flex-col truncate">
                                            <span className={`text-sm font-medium select-none ${isSelected ? 'text-emerald-200' : 'text-zinc-300'}`}>
                                                {asset.symbol}
                                            </span>
                                            <span className="text-[10px] text-zinc-500 select-none truncate">
                                                {asset.name}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="px-4 py-8 text-sm text-zinc-500 text-center italic">
                                {searchQuery ? 'No assets match search' : 'No assets found'}
                            </div>
                        )}
                    </div>

                    {selectedCount > 0 && (
                        <div className="px-3 py-2 border-t border-zinc-800/50 bg-zinc-900/30 text-[10px] text-zinc-500 text-center">
                            {selectedCount} of {assets.length} selected
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
