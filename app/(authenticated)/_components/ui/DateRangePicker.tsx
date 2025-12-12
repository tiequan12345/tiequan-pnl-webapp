'use client';

import React, { useEffect, useState } from 'react';
import { Card } from './Card';

export type DateRange = {
  from?: Date;
  to?: Date;
};

export type DateRangePreset = '24h' | '3d' | '7d' | '30d' | 'all' | 'custom';

interface DateRangePickerProps {
  from?: Date;
  to?: Date;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className = '',
}: DateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset>('custom');
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  // Sync internal state with props to highlight correct preset
  useEffect(() => {
    if (!from) {
      if (to === undefined && selectedPreset !== 'all') {
        // Technically "All Time" corresponds to from=Epoch, but if props come in empty
        // it might be initial state. We'll let the parent control "All" via the Epoch date.
      }
      return;
    }

    const start = from.getTime();
    const end = to ? to.getTime() : new Date().getTime();

    // Check for "All Time" (Epoch start)
    if (start === 0) {
      setSelectedPreset('all');
      setIsCustomOpen(false);
      return;
    }

    const diff = end - start;
    const hour = 3600000;
    const day = 24 * hour;

    // Determine preset with some tolerance
    if (Math.abs(diff - day) < hour) {
      setSelectedPreset('24h');
      setIsCustomOpen(false);
    } else if (Math.abs(diff - 3 * day) < hour) {
      setSelectedPreset('3d');
      setIsCustomOpen(false);
    } else if (Math.abs(diff - 7 * day) < hour) {
      setSelectedPreset('7d');
      setIsCustomOpen(false);
    } else if (Math.abs(diff - 30 * day) < 2 * hour) {
      setSelectedPreset('30d');
      setIsCustomOpen(false);
    } else {
      setSelectedPreset('custom');
      setIsCustomOpen(true);
    }
  }, [from, to]);

  // Helper to format date for date input
  const formatDateForInput = (date?: Date) => {
    if (!date || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handlePresetClick = (preset: DateRangePreset) => {
    setSelectedPreset(preset);
    const now = new Date();
    let newFrom: Date | undefined;
    let newTo: Date | undefined = now;

    switch (preset) {
      case '24h':
        newFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '3d':
        newFrom = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
        newFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        newFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        newFrom = new Date(0); // Epoch
        newTo = undefined; // Up to now
        break;
      case 'custom':
        newFrom = from;
        newTo = to;
        setIsCustomOpen(true);
        return; // Don't trigger onChange yet, let user pick dates
    }

    setIsCustomOpen(false);
    onChange({ from: newFrom, to: newTo });
  };

  const handleCustomDateChange = (type: 'from' | 'to', value: string) => {
    let date: Date | undefined;

    if (value) {
      const [y, m, d] = value.split('-').map(Number);
      date = new Date(y, m - 1, d);

      if (type === 'to') {
        // Set to end of the day for the "to" date
        date.setHours(23, 59, 59, 999);
      }
    }

    const newRange = { from, to, [type]: date };

    if (selectedPreset !== 'custom') {
      setSelectedPreset('custom');
    }

    onChange(newRange as DateRange);
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap gap-2">
        {(['24h', '3d', '7d', '30d', 'all', 'custom'] as const).map((preset) => {
          const labels: Record<string, string> = {
            '24h': 'Last 24 Hours',
            '3d': 'Last 3 Days',
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days',
            'all': 'All Time',
            'custom': 'Custom',
          };

          const isActive = selectedPreset === preset;

          return (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isActive
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
            >
              {labels[preset]}
            </button>
          );
        })}
      </div>

      {(selectedPreset === 'custom' || isCustomOpen) && (
        <Card className="p-4 border border-zinc-800 bg-zinc-900/50 mt-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={formatDateForInput(from)}
                onChange={(e) => handleCustomDateChange('from', e.target.value)}
                onClick={(e) => {
                  try {
                    (e.target as any).showPicker();
                  } catch (err) {
                    // fall back to default behavior
                  }
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">End Date</label>
              <input
                type="date"
                value={formatDateForInput(to)}
                onChange={(e) => handleCustomDateChange('to', e.target.value)}
                onClick={(e) => {
                  try {
                    (e.target as any).showPicker();
                  } catch (err) {
                    // fall back to default behavior
                  }
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}