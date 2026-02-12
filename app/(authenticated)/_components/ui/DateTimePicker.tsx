'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Clock, ChevronDown, Sparkles } from 'lucide-react';
import { Card } from './Card';

interface DateTimePickerProps {
    label: string;
    value: string; // Format: YYYY-MM-DDTHH:mm
    onChange: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
    className?: string;
}

export function DateTimePicker({
    label,
    value,
    onChange,
    required = false,
    disabled = false,
    className = '',
}: DateTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatDisplay = (val: string) => {
        if (!val) return 'Select date & time';
        try {
            const date = new Date(val);
            if (isNaN(date.getTime())) return val;
            return new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }).format(date);
        } catch {
            return val;
        }
    };

    const handlePreset = (preset: 'now' | 'today-start' | 'today-end' | 'yesterday') => {
        const d = new Date();
        if (preset === 'today-start') {
            d.setHours(0, 0, 0, 0);
        } else if (preset === 'today-end') {
            d.setHours(23, 59, 0, 0);
        } else if (preset === 'yesterday') {
            d.setDate(d.getDate() - 1);
        }

        // Format to YYYY-MM-DDTHH:mm
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');

        onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 ml-1">
                {label}{required && <span className="text-rose-500 ml-1">*</span>}
            </label>

            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`group flex items-center justify-between w-full rounded-xl border px-4 py-2.5 text-sm transition-all duration-200
          ${disabled
                        ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/80 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500/20'}
        `}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-300'}`}>
                        <Calendar className="w-4 h-4" />
                    </div>
                    <span className={!value ? 'text-zinc-500' : 'font-medium tracking-tight'}>
                        {formatDisplay(value)}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-600 transition-transform duration-300 ${isOpen ? 'rotate-180 text-zinc-300' : ''}`} />
            </button>

            {isOpen && (
                <Card className="absolute left-0 right-0 z-50 mt-2 p-4 shadow-2xl border-zinc-700/50 bg-zinc-900/95 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 min-w-[280px]">
                    <div className="space-y-4">
                        <div className="relative">
                            <input
                                type="datetime-local"
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                onClick={(e) => (e.target as any).showPicker?.()}
                                autoFocus
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 focus:outline-none [color-scheme:dark] transition-all
                                [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                            />
                            <Clock className="absolute right-3 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none group-focus-within:text-blue-400 transition-colors" />
                        </div>

                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3" /> Quick Presets
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handlePreset('now')}
                                    className="flex items-center justify-center px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 hover:bg-zinc-700 hover:text-white hover:border-zinc-600 transition-all"
                                >
                                    Now
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('yesterday')}
                                    className="flex items-center justify-center px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 hover:bg-zinc-700 hover:text-white hover:border-zinc-600 transition-all"
                                >
                                    Yesterday
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('today-start')}
                                    className="flex items-center justify-center px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 hover:bg-zinc-700 hover:text-white hover:border-zinc-600 transition-all"
                                >
                                    Start of Day
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('today-end')}
                                    className="flex items-center justify-center px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 hover:bg-zinc-700 hover:text-white hover:border-zinc-600 transition-all"
                                >
                                    End of Day
                                </button>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="w-full py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors uppercase tracking-widest"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
