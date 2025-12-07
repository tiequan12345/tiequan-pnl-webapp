export const ALLOWED_TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE',
  'YIELD',
  'NFT_TRADE',
  'OFFLINE_TRADE',
  'OTHER',
  'HEDGE',
] as const;

export type LedgerTxType = (typeof ALLOWED_TX_TYPES)[number];

export function isAllowedTxType(value: string | undefined): value is LedgerTxType {
  if (!value) {
    return false;
  }
  return (ALLOWED_TX_TYPES as readonly string[]).includes(value);
}

/**
 * Parses decimal-like input to string form for persistence.
 * Returns undefined when the input is empty, null when invalid, or the stringified number when valid.
 */
export function parseLedgerDecimal(
  input: string | number | null | undefined,
): string | null | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return null;
    }
    return input.toString();
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return trimmed;
}

/**
 * Safely parses a datetime string into a Date object.
 * Returns null if parsing fails.
 */
export function parseLedgerDateTime(input: string | undefined): Date | null {
  if (!input) {
    return null;
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}