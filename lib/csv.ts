const DELIMITERS = [',', ';', '\t', '|'] as const;

export type CsvParseOptions = {
  delimiter?: string;
  maxRows?: number;
  trimFields?: boolean;
};

/**
 * Infer the delimiter by counting occurrences on the first few non-empty lines.
 * Falls back to comma when no clear winner is found.
 */
export function inferDelimiter(input: string): string {
  const lines = input.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const sample = lines.slice(0, 5);

  let bestDelimiter: string = ',';
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    let score = 0;
    for (const line of sample) {
      const count = line.split(delimiter).length - 1;
      score += count;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function parseLine(line: string, delimiter: string, trimFields: boolean): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push(trimFields ? current.trim() : current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(trimFields ? current.trim() : current);
  return fields;
}

/**
 * Parse CSV text into headers and rows. Supports quoted fields and basic delimiter inference.
 */
export function parseCsv(
  input: string,
  options: CsvParseOptions = {},
): { headers: string[]; rows: string[][]; delimiter: string } {
  const normalized = input.replace(/^\uFEFF/, ''); // strip BOM if present
  const lines = normalized.split(/\r?\n/);
  const delimiter = options.delimiter || inferDelimiter(normalized);
  const trimFields = options.trimFields ?? true;
  const maxRows = options.maxRows && options.maxRows > 0 ? options.maxRows : undefined;

  const nonEmptyLines = lines.filter((line) => line.length > 0);
  if (nonEmptyLines.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const [headerLine, ...rest] = nonEmptyLines;
  const headers = parseLine(headerLine, delimiter, trimFields);

  const rows: string[][] = [];
  for (const line of rest) {
    if (line.trim().length === 0) {
      continue;
    }
    const parsed = parseLine(line, delimiter, trimFields);
    rows.push(parsed);
    if (maxRows && rows.length >= maxRows) {
      break;
    }
  }

  return { headers, rows, delimiter };
}

function escapeCsvValue(value: string, delimiter: string) {
  const normalized = value ?? '';
  const containsDelimiter = normalized.includes(delimiter);
  const containsQuote = normalized.includes('"');
  const containsNewLine = /\r|\n/.test(normalized);
  let escaped = normalized;
  if (containsQuote) {
    escaped = escaped.replace(/"/g, '""');
  }

  if (containsDelimiter || containsQuote || containsNewLine) {
    return `"${escaped}"`;
  }

  return escaped;
}

export function serializeCsv(rows: string[][], delimiter = ',') {
  return rows
    .map((row) =>
      row
        .map((value) => escapeCsvValue(value ?? '', delimiter))
        .join(delimiter),
    )
    .join('\n');
}
