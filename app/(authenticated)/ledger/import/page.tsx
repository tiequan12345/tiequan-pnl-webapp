'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../../_components/ui/Card';
import { DataTable, type DataTableColumn } from '../../_components/table/DataTable';
import { parseCsv } from '@/lib/csv';
import {
  isAllowedTxType,
  parseLedgerDateTime,
  parseLedgerDecimal,
} from '@/lib/ledger';

type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

type Mapping = {
  date_time: string;
  account: string;
  asset: string;
  quantity: string;
  tx_type: string;
  notes?: string;
  external_reference?: string;
};

type PreviewRow = {
  index: number;
  dateTime?: Date | null;
  accountName?: string;
  assetSymbol?: string;
  quantityRaw?: string;
  quantityParsed?: string | null | undefined;
  quantityValue?: number | null;
  txType?: string;
  notes?: string | null;
  externalReference?: string | null;
  errors: string[];
  ignore: boolean;
  accountId?: number;
  assetId?: number;
};

type CommitResult = {
  created: number;
  skipped: number;
  errors: { index: number; message: string }[];
};

type Account = { id: number; name: string; _count?: { ledger_transactions: number } };
type Asset = { id: number; symbol: string; name: string; _count?: { ledger_transactions: number } };

const REQUIRED_FIELDS: (keyof Mapping)[] = [
  'date_time',
  'account',
  'asset',
  'quantity',
  'tx_type',
];

const CANONICAL_FIELDS: { key: keyof Mapping; label: string; required?: boolean }[] = [
  { key: 'date_time', label: 'Date / Time', required: true },
  { key: 'account', label: 'Account Name', required: true },
  { key: 'asset', label: 'Asset Symbol', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'tx_type', label: 'Tx Type', required: true },
  { key: 'notes', label: 'Notes' },
  { key: 'external_reference', label: 'External Reference' },
];

function toLowerKey(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function guessMapping(headers: string[]): Mapping {
  const lower = headers.map((h) => h.toLowerCase());
  const pick = (targets: string[]): string => {
    const idx = lower.findIndex((h) => targets.includes(h));
    return idx >= 0 ? headers[idx] : '';
  };

  return {
    date_time: pick(['date', 'datetime', 'date_time', 'timestamp']),
    account: pick(['account', 'account_name', 'account name']),
    asset: pick(['asset', 'asset_symbol', 'symbol', 'ticker']),
    quantity: pick(['quantity', 'qty', 'amount']),
    tx_type: pick(['tx_type', 'type', 'tx type', 'transaction_type']),
    notes: pick(['notes', 'note', 'memo', 'description']),
    external_reference: pick(['external_reference', 'external ref', 'reference', 'ref']),
  };
}

export default function LedgerImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  const [fileName, setFileName] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [committing, setCommitting] = useState(false);

  const [creatingMissing, setCreatingMissing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const accountLookup = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((acc) => map.set(toLowerKey(acc.name), acc));
    return map;
  }, [accounts]);

  const assetLookup = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((asset) => map.set(toLowerKey(asset.symbol), asset));
    return map;
  }, [assets]);

  const unknownAccounts = useMemo(() => {
    const set = new Set<string>();
    previewRows.forEach((row) => {
      if (row.accountName && !row.accountId) {
        set.add(row.accountName);
      }
    });
    return Array.from(set);
  }, [previewRows]);

  const unknownAssets = useMemo(() => {
    const set = new Set<string>();
    previewRows.forEach((row) => {
      if (row.assetSymbol && !row.assetId) {
        set.add(row.assetSymbol);
      }
    });
    return Array.from(set);
  }, [previewRows]);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/accounts');
      if (response.ok) {
        const data = (await response.json()) as Account[];
        setAccounts(data);
      }
    } catch {
      // ignore fetch errors; UI will show missing accounts in preview
    }
  }, []);

  const loadAssets = useCallback(async () => {
    try {
      const response = await fetch('/api/assets');
      if (response.ok) {
        const data = (await response.json()) as Asset[];
        setAssets(data);
      }
    } catch {
      // ignore fetch errors; UI will show missing assets in preview
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadAssets();
  }, [loadAccounts, loadAssets]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setParsed(null);
    setMapping(null);
    setPreviewRows([]);
    setCommitResult(null);
    setSuccessMessage(null);

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    const text = await file.text();

    try {
      const result = parseCsv(text, { maxRows: 500 });
      if (!result.headers.length) {
        setParseError('No headers found in the CSV.');
        return;
      }
      setParsed({ headers: result.headers, rows: result.rows });
      setMapping(guessMapping(result.headers));
    } catch (err) {
      console.error(err);
      setParseError('Failed to parse CSV. Please verify the file format.');
    }
  };

  const handleMappingChange = (field: keyof Mapping, header: string) => {
    setMapping((prev) => ({
      ...(prev ?? guessMapping(parsed?.headers ?? [])),
      [field]: header,
    }));
    setCommitResult(null);
    setSuccessMessage(null);
  };

  const rebuildPreview = useCallback(() => {
    if (!parsed || !mapping) {
      setPreviewRows([]);
      return;
    }

    const requiredMissing = REQUIRED_FIELDS.filter((field) => !mapping[field]);
    if (requiredMissing.length > 0) {
      setPreviewError(
        `Required fields not mapped: ${requiredMissing
          .map((f) => f.replace('_', ' '))
          .join(', ')}`,
      );
      setPreviewRows([]);
      return;
    }

    setPreviewError(null);
    const headerIndex: Record<string, number> = {};
    parsed.headers.forEach((h, idx) => {
      headerIndex[h] = idx;
    });

    const rows: PreviewRow[] = parsed.rows.map((row, index) => {
      const getValue = (header: string | undefined) => {
        if (!header || !(header in headerIndex)) return '';
        const colIndex = headerIndex[header];
        return row[colIndex] ?? '';
      };

      const dateStr = getValue(mapping.date_time);
      const accountName = getValue(mapping.account);
      const assetSymbol = getValue(mapping.asset);
      const quantityRaw = getValue(mapping.quantity);
      const txTypeRaw = getValue(mapping.tx_type).toUpperCase();
      const notes = mapping.notes ? getValue(mapping.notes) : '';
      const externalReference = mapping.external_reference
        ? getValue(mapping.external_reference)
        : '';

      const errors: string[] = [];

      const dateTime = parseLedgerDateTime(dateStr);
      if (!dateTime) {
        errors.push('Invalid date_time');
      }

      const quantityParsed = parseLedgerDecimal(quantityRaw);
      if (quantityParsed === null || quantityParsed === undefined) {
        errors.push('Invalid quantity');
      }
      const quantityValue = quantityParsed ? Number(quantityParsed) : null;

      if (!isAllowedTxType(txTypeRaw)) {
        errors.push('Invalid tx_type');
      }

      const accountId = accountLookup.get(toLowerKey(accountName))?.id;
      if (!accountId) {
        errors.push('Unknown account');
      }

      const assetId = assetLookup.get(toLowerKey(assetSymbol))?.id;
      if (!assetId) {
        errors.push('Unknown asset');
      }

      return {
        index,
        dateTime,
        accountName,
        assetSymbol,
        quantityRaw,
        quantityParsed,
        quantityValue,
        txType: txTypeRaw,
        notes: notes || null,
        externalReference: externalReference || null,
        errors,
        ignore: false,
        accountId,
        assetId,
      };
    });

    setPreviewRows(rows);
    setCommitResult(null);
  }, [parsed, mapping, accountLookup, assetLookup]);

  useEffect(() => {
    rebuildPreview();
  }, [rebuildPreview]);

  const toggleIgnore = (index: number) => {
    setPreviewRows((prev) =>
      prev.map((row) => (row.index === index ? { ...row, ignore: !row.ignore } : row)),
    );
    setCommitResult(null);
  };

  const previewColumns: DataTableColumn<PreviewRow>[] = [
    {
      id: 'index',
      header: '#',
      accessor: (row) => row.index,
      cell: (row) => <span className="text-zinc-500">{row.index + 1}</span>,
      sortable: true,
    },
    {
      id: 'dateTime',
      header: 'Date',
      accessor: (row) => (row.dateTime ? row.dateTime.getTime() : -Infinity),
      cell: (row) => (
        <span className="text-zinc-300">
          {row.dateTime ? row.dateTime.toISOString() : 'Invalid'}
        </span>
      ),
      sortable: true,
    },
    {
      id: 'accountName',
      header: 'Account',
      accessor: (row) => row.accountName ?? '—',
      cell: (row) => (
        <span className="text-zinc-200">
          {row.accountName || '—'}
          {row.accountId ? '' : ' (new)'}
        </span>
      ),
      sortable: true,
    },
    {
      id: 'assetSymbol',
      header: 'Asset',
      accessor: (row) => row.assetSymbol ?? '—',
      cell: (row) => (
        <span className="text-zinc-200">
          {row.assetSymbol || '—'}
          {row.assetId ? '' : ' (new)'}
        </span>
      ),
      sortable: true,
    },
    {
      id: 'quantityValue',
      header: 'Quantity',
      accessor: (row) => row.quantityValue ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-200">{row.quantityRaw ?? '—'}</span>
      ),
      sortable: true,
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'txType',
      header: 'Tx Type',
      accessor: (row) => row.txType ?? '—',
      cell: (row) => <span className="text-zinc-300">{row.txType || '—'}</span>,
      sortable: true,
    },
    {
      id: 'notes',
      header: 'Notes',
      accessor: (row) => row.notes ?? '—',
      cell: (row) => (
        <span className="text-zinc-500 max-w-xs truncate">{row.notes ?? '—'}</span>
      ),
      sortable: true,
    },
    {
      id: 'errors',
      header: 'Errors',
      accessor: (row) => (row.errors.length === 0 ? 'OK' : row.errors.join(' ')),
      cell: (row) =>
        row.errors.length === 0 ? (
          <span className="text-emerald-300 text-xs">OK</span>
        ) : (
          <div className="text-rose-300 text-xs space-y-1">
            {row.errors.map((err, idx) => (
              <div key={`${row.index}-err-${idx}`}>{err}</div>
            ))}
          </div>
        ),
      sortable: true,
    },
    {
      id: 'ignore',
      header: 'Ignore',
      accessor: (row) => row.ignore,
      cell: (row) => (
        <input
          type="checkbox"
          checked={row.ignore}
          onChange={() => toggleIgnore(row.index)}
          className="h-4 w-4 accent-blue-500"
        />
      ),
      sortable: false,
      align: 'right',
      className: 'text-right',
    },
  ];

  const createMissingEntities = async () => {
    if (unknownAccounts.length === 0 && unknownAssets.length === 0) {
      return;
    }

    setCreatingMissing(true);
    setSuccessMessage(null);

    try {
      for (const name of unknownAccounts) {
        await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            platform: 'Imported',
            account_type: 'OTHER',
            status: 'ACTIVE',
            chain_or_market: null,
            notes: 'Created via CSV import',
          }),
        });
      }

      for (const symbol of unknownAssets) {
        await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            name: symbol,
            type: 'OTHER',
            volatility_bucket: 'VOLATILE',
            chain_or_market: '',
            pricing_mode: 'MANUAL',
            manual_price: null,
            metadata_json: null,
          }),
        });
      }

      await loadAccounts();
      await loadAssets();
      setSuccessMessage('Created missing accounts/assets. Preview updated.');
    } catch (err) {
      console.error(err);
      setPreviewError('Failed to create some missing accounts or assets.');
    } finally {
      setCreatingMissing(false);
    }
  };

  const handleCommit = async () => {
    setCommitting(true);
    setCommitResult(null);
    setSuccessMessage(null);

    const validRows = previewRows.filter(
      (row) =>
        !row.ignore &&
        row.errors.length === 0 &&
        row.dateTime &&
        row.accountId &&
        row.assetId &&
        row.quantityParsed !== null &&
        row.quantityParsed !== undefined &&
        row.txType,
    );

    if (validRows.length === 0) {
      setPreviewError('No valid rows to import. Fix errors or un-ignore rows.');
      setCommitting(false);
      return;
    }

    try {
      const payload = {
        rows: validRows.map((row) => ({
          date_time: row.dateTime?.toISOString(),
          account_id: row.accountId,
          asset_id: row.assetId,
          quantity: row.quantityParsed,
          tx_type: row.txType,
          external_reference: row.externalReference,
          notes: row.notes,
        })),
      };

      const response = await fetch('/api/ledger/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; errors?: { index: number; message: string }[] }
          | null;
        setPreviewError(data?.error || 'Import failed.');
        if (data?.errors) {
          // mark row-level errors from server
          setPreviewRows((prev) =>
            prev.map((row) => {
              const serverErrors = data.errors?.filter((err) => err.index === row.index);
              if (serverErrors && serverErrors.length > 0) {
                return { ...row, errors: [...row.errors, ...serverErrors.map((e) => e.message)] };
              }
              return row;
            }),
          );
        }
        setCommitting(false);
        return;
      }

      const result = (await response.json()) as CommitResult;
      setCommitResult(result);
      setSuccessMessage('Import completed.');
    } catch (err) {
      console.error(err);
      setPreviewError('Unexpected error during import.');
    } finally {
      setCommitting(false);
    }
  };

  const mappedCount = previewRows.filter((row) => !row.ignore).length;
  const validCount = previewRows.filter((row) => !row.ignore && row.errors.length === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Import Ledger CSV</h2>
        {fileName ? (
          <span className="text-xs text-zinc-500">Loaded: {fileName}</span>
        ) : null}
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">1) Upload CSV</h3>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="text-xs text-zinc-300"
            />
          </div>
          {parseError ? (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
              {parseError}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Upload a CSV with headers. Required columns: date/time, account, asset, quantity, tx
              type.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">2) Map Columns</h3>
          {parsed ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {CANONICAL_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                    {field.label}
                    {field.required ? (
                      <span className="text-[10px] text-rose-300 font-semibold">Required</span>
                    ) : null}
                  </label>
                  <select
                    value={(mapping as Mapping | null)?.[field.key] ?? ''}
                    onChange={(event) => handleMappingChange(field.key, event.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Unmapped</option>
                    {parsed.headers.map((header) => (
                      <option key={`${field.key}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Upload a CSV to map columns.</div>
          )}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">3) Preview & Validate</h3>
          <div className="text-xs text-zinc-500">
            {mappedCount} rows mapped · {validCount} valid
          </div>
        </div>

        <div className="p-4 space-y-3">
          {previewError ? (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
              {previewError}
            </div>
          ) : null}

          {unknownAccounts.length > 0 || unknownAssets.length > 0 ? (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  Missing entities detected:
                  {unknownAccounts.length > 0 && (
                    <span className="mr-2">
                      Accounts: {unknownAccounts.join(', ')}
                    </span>
                  )}
                  {unknownAssets.length > 0 && (
                    <span>Assets: {unknownAssets.join(', ')}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={createMissingEntities}
                  disabled={creatingMissing}
                  className="px-3 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-100 hover:border-blue-500 disabled:opacity-50"
                >
                  {creatingMissing ? 'Creating…' : 'Create Missing'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                Missing accounts/assets will be auto-created with default settings and the preview
                will refresh.
              </p>
            </div>
          ) : null}

          {successMessage ? (
            <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-lg px-3 py-2">
              {successMessage}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <DataTable
            columns={previewColumns}
            rows={previewRows}
            keyFn={(row) => row.index}
            emptyMessage="Upload and map a CSV to see a preview."
            globalSearch={{ placeholder: 'Search preview' }}
            rowClassName={() => 'hover:bg-zinc-800/30'}
          />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-xs text-zinc-500">
          <div>
            {committing
              ? 'Importing...'
              : `Rows ready: ${validCount} · Ignored: ${
                  previewRows.filter((r) => r.ignore).length
                }`}
          </div>
          <div className="flex items-center gap-2">
            {commitResult ? (
              <span className="text-emerald-300">
                Created {commitResult.created}, Skipped {commitResult.skipped}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing || validCount === 0}
              className="px-3 py-2 rounded-md border border-blue-500/40 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/60 text-white text-sm font-medium transition-colors"
            >
              {committing ? 'Importing…' : 'Import Rows'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}