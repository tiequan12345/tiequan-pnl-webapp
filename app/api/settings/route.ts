import { NextResponse } from 'next/server';

import { AppSettings, getAppSettings, parseRefreshIntervalSetting, updateAppSetting } from '@/lib/settings';

function ensureObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  return null;
}

function normalizeInterval(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = parseRefreshIntervalSetting(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export async function GET() {
  try {
    const settings = await getAppSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to load settings', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!ensureObject(body)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const updates: Partial<AppSettings> = {};

    if ('baseCurrency' in body) {
      const normalized = normalizeString(body.baseCurrency);
      if (!normalized) {
        return NextResponse.json({ error: 'baseCurrency must be a non-empty string' }, { status: 400 });
      }
      updates.baseCurrency = normalized;
    }

    if ('timezone' in body) {
      const normalized = normalizeString(body.timezone);
      if (!normalized) {
        return NextResponse.json({ error: 'timezone must be a non-empty string' }, { status: 400 });
      }
      updates.timezone = normalized;
    }

    if ('priceAutoRefresh' in body) {
      const normalized = normalizeBoolean(body.priceAutoRefresh);
      if (normalized === null) {
        return NextResponse.json({ error: 'priceAutoRefresh must be a boolean' }, { status: 400 });
      }
      updates.priceAutoRefresh = normalized;
    }

    if ('priceAutoRefreshIntervalMinutes' in body) {
      const normalized = normalizeInterval(body.priceAutoRefreshIntervalMinutes);
      if (normalized === null) {
        return NextResponse.json(
          { error: 'priceAutoRefreshIntervalMinutes must be a positive integer' },
          { status: 400 },
        );
      }
      updates.priceAutoRefreshIntervalMinutes = normalized;
    }

    if ('priceRefreshEndpoint' in body) {
      const normalized = normalizeString(body.priceRefreshEndpoint);
      if (!normalized) {
        return NextResponse.json({ error: 'priceRefreshEndpoint must be a non-empty string' }, { status: 400 });
      }
      updates.priceRefreshEndpoint = normalized;
    }

    const entries = Object.entries(updates) as [keyof AppSettings, string | number | boolean][];
    for (const [key, value] of entries) {
      await updateAppSetting(key, value);
    }

    const settings = await getAppSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to update settings', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}