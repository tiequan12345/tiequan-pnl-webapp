// Finance-friendly number formatting utilities

/**
 * Format numbers with traditional finance shorthands
 * Examples: 12.52M = 12.52 million, 342K = 342,000
 * @param value - The numeric value to format
 * @param currency - The currency code (e.g., 'USD')
 * @param minimumFractionDigits - Minimum decimal places (default: 0)
 * @param maximumFractionDigits - Maximum decimal places (default: 2)
 * @returns Formatted currency string with finance shorthands
 */
export function formatCurrencyFinance(
  value: number,
  currency: string,
  minimumFractionDigits: number = 0,
  maximumFractionDigits: number = 2
): string {
  if (value === 0) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(0);
  }

  const absValue = Math.abs(value);
  let formattedValue: string;
  let suffix = '';

  if (absValue >= 1_000_000_000) {
    // Billions
    formattedValue = (value / 1_000_000_000).toFixed(maximumFractionDigits);
    suffix = 'B';
  } else if (absValue >= 1_000_000) {
    // Millions
    formattedValue = (value / 1_000_000).toFixed(maximumFractionDigits);
    suffix = 'M';
  } else if (absValue >= 1_000) {
    // Thousands
    formattedValue = (value / 1_000).toFixed(maximumFractionDigits);
    suffix = 'K';
  } else {
    // Regular currency formatting for values under 1000
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  }

  // Remove trailing zeros after decimal point
  if (maximumFractionDigits > 0) {
    formattedValue = formattedValue.replace(/\.?0+$/, '');
  }

  return `${formattedValue}${suffix}`;
}

/**
 * Format numbers for chart axis labels (compact, no currency symbol)
 * Examples: 12.52M, 342K
 * @param value - The numeric value to format
 * @param minimumFractionDigits - Minimum decimal places (default: 0)
 * @param maximumFractionDigits - Maximum decimal places (default: 2)
 * @returns Formatted number string with finance shorthands
 */
export function formatNumberFinance(
  value: number,
  minimumFractionDigits: number = 0,
  maximumFractionDigits: number = 2
): string {
  if (value === 0) {
    return '0';
  }

  const absValue = Math.abs(value);
  let formattedValue: string;
  let suffix = '';

  if (absValue >= 1_000_000_000) {
    // Billions
    formattedValue = (value / 1_000_000_000).toFixed(maximumFractionDigits);
    suffix = 'B';
  } else if (absValue >= 1_000_000) {
    // Millions
    formattedValue = (value / 1_000_000).toFixed(maximumFractionDigits);
    suffix = 'M';
  } else if (absValue >= 1_000) {
    // Thousands
    formattedValue = (value / 1_000).toFixed(maximumFractionDigits);
    suffix = 'K';
  } else {
    // Regular number formatting for values under 1000
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  }

  // Remove trailing zeros after decimal point
  if (maximumFractionDigits > 0) {
    formattedValue = formattedValue.replace(/\.?0+$/, '');
  }

  return `${formattedValue}${suffix}`;
}