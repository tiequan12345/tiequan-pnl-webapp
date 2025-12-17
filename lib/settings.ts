import { prisma } from '@/lib/db';
import type { Setting } from '@prisma/client';

export type AppSettings = {
  baseCurrency: string;
  timezone: string;
  priceAutoRefresh: boolean;
  priceAutoRefreshIntervalMinutes: number;
  priceRefreshEndpoint: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  baseCurrency: 'USD',
  timezone: 'UTC',
  priceAutoRefresh: true,
  priceAutoRefreshIntervalMinutes: 60,
  priceRefreshEndpoint: '/api/prices/refresh',
};

const SETTING_KEY_MAP: Record<keyof AppSettings, string> = {
  baseCurrency: 'base_currency',
  timezone: 'timezone',
  priceAutoRefresh: 'price_auto_refresh',
  priceAutoRefreshIntervalMinutes: 'price_auto_refresh_interval_minutes',
  priceRefreshEndpoint: 'price_refresh_endpoint',
};

function parseBooleanSetting(value: string | null | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim().toLowerCase() === 'true';
}

function parseStringSetting(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  return value.trim();
}

function parseNumberSetting(value: string | null | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function parseRefreshIntervalSetting(value?: string | null): number {
  return parseNumberSetting(value, DEFAULT_SETTINGS.priceAutoRefreshIntervalMinutes);
}

function buildSettingsFromRows(rows: Setting[]): AppSettings {
  const rowMap: Record<string, string> = rows.reduce<Record<string, string>>(
    (acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    },
    {},
  );

  return {
    // Force baseCurrency to always be USD, regardless of stored value
    baseCurrency: 'USD',
    timezone: parseStringSetting(
      rowMap[SETTING_KEY_MAP.timezone],
      DEFAULT_SETTINGS.timezone,
    ),
    priceAutoRefresh: parseBooleanSetting(
      rowMap[SETTING_KEY_MAP.priceAutoRefresh],
      DEFAULT_SETTINGS.priceAutoRefresh,
    ),
    priceAutoRefreshIntervalMinutes: parseRefreshIntervalSetting(
      rowMap[SETTING_KEY_MAP.priceAutoRefreshIntervalMinutes],
    ),
    priceRefreshEndpoint: parseStringSetting(
      rowMap[SETTING_KEY_MAP.priceRefreshEndpoint],
      DEFAULT_SETTINGS.priceRefreshEndpoint,
    ),
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  return buildSettingsFromRows(rows);
}

export async function updateAppSetting(
  key: keyof AppSettings,
  value: string | number | boolean,
): Promise<AppSettings> {
  const settingKey = SETTING_KEY_MAP[key];

  await prisma.setting.upsert({
    where: { key: settingKey },
    create: {
      key: settingKey,
      value: String(value),
    },
    update: {
      value: String(value),
    },
  });

  return getAppSettings();
}