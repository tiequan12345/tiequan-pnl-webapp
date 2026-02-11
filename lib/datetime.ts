export function toLocalDateTimeInput(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const offsetMs = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export function datetimeLocalToUtcIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const localDate = new Date(trimmed);
  if (Number.isNaN(localDate.getTime())) {
    return null;
  }

  return localDate.toISOString();
}

export function parseIsoInstant(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Require timezone information to avoid server-local ambiguity.
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isMissingSyncSinceColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('sync_since') && (
    message.includes('no such column') ||
    message.includes('unknown column') ||
    message.includes('does not exist')
  );
}
