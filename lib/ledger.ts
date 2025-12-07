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

const WHITESPACE_REGEX = /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F]/g;
const NON_NUMERIC_REGEX = /[^\d.,]/g;

/**
 * Attempts to normalize user-provided values by stripping whitespace, common delimiters/flags
 * (commas, apostrophes, currency symbols, parentheses, spaces) and converting them to a clean
 * decimal string before validation.
 */
function normalizeLedgerDecimalString(value: string): string | null {
  let cleaned = value.trim();
  if (!cleaned) {
    return null;
  }

  let negative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    negative = true;
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (cleaned.startsWith('-')) {
    negative = true;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  cleaned = cleaned.replace(WHITESPACE_REGEX, '');
  cleaned = cleaned.replace(NON_NUMERIC_REGEX, '');
  if (!cleaned) {
    return null;
  }

  const dotMatches = cleaned.match(/\./g);
  const commaMatches = cleaned.match(/,/g);
  const dotCount = dotMatches ? dotMatches.length : 0;
  const commaCount = commaMatches ? commaMatches.length : 0;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let decimalSeparator: '.' | ',' | null = null;
  if (dotCount > 0 && commaCount > 0) {
    decimalSeparator = lastDot > lastComma ? '.' : ',';
  } else if (dotCount === 1 && commaCount === 0) {
    decimalSeparator = '.';
  } else if (commaCount === 1 && dotCount === 0) {
    const digitsAfter = cleaned.length - lastComma - 1;
    if (digitsAfter > 0 && digitsAfter <= 2) {
      decimalSeparator = ',';
    }
  }

  let normalized = cleaned;
  if (decimalSeparator) {
    const separatorIndex = decimalSeparator === '.' ? lastDot : lastComma;
    const integerPart = cleaned.slice(0, separatorIndex).replace(/[.,]/g, '');
    const fractionPart = cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart}.${fractionPart}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }

  if (!normalized) {
    return null;
  }

  if (negative) {
    normalized = `-${normalized}`;
  }

  return normalized;
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

  const normalized = normalizeLedgerDecimalString(trimmed);
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric.toString();
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