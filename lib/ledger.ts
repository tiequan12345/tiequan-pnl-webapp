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

/**
 * Converts a validated decimal string (or number/null) into a JS number.
 * Returns null if the input is null, undefined, or invalid.
 */
export function decimalValueToNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Checks consistency between quantity, unit price, and total value.
 * Returns true if one or both valuation fields are missing, or if they match within a tolerance.
 */
export function isLedgerValuationConsistent(
  quantity: number,
  unitPrice: string | number | null | undefined,
  totalValue: string | number | null | undefined,
): boolean {
  const p = decimalValueToNumber(unitPrice);
  const v = decimalValueToNumber(totalValue);

  if (p === null || v === null) {
    return true;
  }

  const expected = quantity * p;

  // If the total value is effectively zero, just check that expected is also close to zero
  if (Math.abs(v) < 0.0000001) {
    return Math.abs(expected) < 0.0000001;
  }

  const diff = Math.abs(expected - v);
  const tolerance = 0.0025 * Math.abs(v); // 0.25% tolerance

  return diff <= tolerance;
}

type LedgerValuationDeriveInput = {
  quantity: string | number | null | undefined;
  unitPriceInBase: string | number | null | undefined;
  totalValueInBase: string | number | null | undefined;
};

type LedgerValuationDeriveOutput = {
  unit_price_in_base?: string | null;
  total_value_in_base?: string | null;
};

/**
 * Derives missing valuation fields when possible:
 * - If only total value is provided, derives unit price = total / quantity.
 * - If only unit price is provided, derives total value = quantity * unit price.
 *
 * This preserves sign conventions (e.g. negative quantity produces negative total value).
 * Returns empty object if nothing can be derived.
 */
export function deriveLedgerValuationFields(
  input: LedgerValuationDeriveInput,
): LedgerValuationDeriveOutput {
  const quantityNumber = decimalValueToNumber(input.quantity);
  if (quantityNumber === null || !Number.isFinite(quantityNumber) || quantityNumber === 0) {
    return {};
  }

  const unitPriceNumber = decimalValueToNumber(input.unitPriceInBase);
  const totalValueNumber = decimalValueToNumber(input.totalValueInBase);

  if (unitPriceNumber === null && totalValueNumber !== null) {
    const derivedUnitPrice = totalValueNumber / quantityNumber;
    if (!Number.isFinite(derivedUnitPrice)) {
      return {};
    }
    return { unit_price_in_base: derivedUnitPrice.toString() };
  }

  if (totalValueNumber === null && unitPriceNumber !== null) {
    const derivedTotalValue = quantityNumber * unitPriceNumber;
    if (!Number.isFinite(derivedTotalValue)) {
      return {};
    }
    return { total_value_in_base: derivedTotalValue.toString() };
  }

  return {};
}
