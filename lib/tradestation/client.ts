const OAUTH_BASE_URL = 'https://signin.tradestation.com';
const DEFAULT_API_BASE_URL = 'https://api.tradestation.com';

export type TradeStationToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
  scopes?: string[];
};

export type TsBrokerageAccount = {
  AccountID: string;
  Name?: string;
  Type?: string;
  Status?: string;
  Currency?: string;
  [key: string]: unknown;
};

export type TsPosition = {
  Symbol?: string;
  Quantity?: string | number;
  AveragePrice?: string | number;
  Bid?: string | number;
  Ask?: string | number;
  Last?: string | number;
  MarkToMarketPrice?: string | number;
  [key: string]: unknown;
};

export type TsOrder = Record<string, unknown>;

function getApiBaseUrl(): string {
  const raw = process.env.TRADESTATION_BASE_URL?.trim();
  if (!raw) {
    return DEFAULT_API_BASE_URL;
  }
  return raw.replace(/\/+$/g, '');
}

function getRequestedScope(): string {
  return (
    process.env.TRADESTATION_SCOPE?.trim() ||
    'openid offline_access profile MarketData ReadAccount Trade'
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
  prompt?: 'login';
}): string {
  const url = new URL(`${OAUTH_BASE_URL}/authorize`);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('audience', DEFAULT_API_BASE_URL);
  url.searchParams.set('state', params.state);
  url.searchParams.set('scope', params.scope ?? getRequestedScope());
  if (params.prompt) {
    url.searchParams.set('prompt', params.prompt);
  }

  return url.toString();
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`TradeStation request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export async function exchangeAuthCode(code: string): Promise<TradeStationToken> {
  const clientId = requireEnv('TRADESTATION_CLIENT_ID');
  const clientSecret = requireEnv('TRADESTATION_CLIENT_SECRET');
  const redirectUri = requireEnv('TRADESTATION_REDIRECT_URI');

  const json = await postForm<{
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    scope?: string;
  }>(`${OAUTH_BASE_URL}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000)
    : undefined;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    scopes: json.scope ? json.scope.split(' ').filter(Boolean) : undefined,
  };
}

export async function refreshToken(refreshTokenValue: string): Promise<TradeStationToken> {
  const clientId = requireEnv('TRADESTATION_CLIENT_ID');
  const clientSecret = requireEnv('TRADESTATION_CLIENT_SECRET');

  const json = await postForm<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>(`${OAUTH_BASE_URL}/oauth/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
  });

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000)
    : undefined;

  return {
    accessToken: json.access_token,
    // Some configurations rotate refresh tokens; if it's not provided, keep the old one.
    refreshToken: json.refresh_token ?? refreshTokenValue,
    expiresAt,
    scopes: json.scope ? json.scope.split(' ').filter(Boolean) : undefined,
  };
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`TradeStation API GET failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

function formatMMDDYYYY(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return `${mm}-${dd}-${yyyy}`;
}

function extractOrdersFromResponse(json: unknown): { orders: TsOrder[]; nextToken?: string } {
  if (Array.isArray(json)) {
    return { orders: json as TsOrder[] };
  }

  if (!json || typeof json !== 'object') {
    return { orders: [] };
  }

  const record = json as Record<string, unknown>;

  const ordersCandidate =
    (record.Orders as unknown) ??
    (record.orders as unknown) ??
    (record.HistoricalOrders as unknown) ??
    (record.historicalOrders as unknown);

  const orders = Array.isArray(ordersCandidate) ? (ordersCandidate as TsOrder[]) : [];

  const nextTokenRaw =
    (record.NextToken as unknown) ??
    (record.nextToken as unknown) ??
    (record.next_token as unknown);

  const nextToken = typeof nextTokenRaw === 'string' && nextTokenRaw.trim() ? nextTokenRaw : undefined;

  return { orders, nextToken };
}

export async function fetchBrokerageAccounts(accessToken: string): Promise<TsBrokerageAccount[]> {
  const json = await apiGet<{ Accounts?: TsBrokerageAccount[] }>(
    '/v3/brokerage/accounts',
    accessToken,
  );

  return json.Accounts ?? [];
}

export async function fetchPositions(params: {
  accountId: string;
  accessToken: string;
}): Promise<TsPosition[]> {
  const json = await apiGet<{ Positions?: TsPosition[] }>(
    `/v3/brokerage/accounts/${encodeURIComponent(params.accountId)}/positions`,
    params.accessToken,
  );

  return json.Positions ?? [];
}

function formatYYYYMMDD(date: Date): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function buildHistoricalOrderCandidatePaths(params: {
  accountId: string;
  since?: string;
  pageSize?: number;
  nextToken?: string;
}): string[] {
  const sinceDate = params.since ? new Date(params.since) : null;
  const now = new Date();

  // HistoricalOrders requires a since date and is limited to 90 days lookback.
  const effectiveSince =
    sinceDate && !Number.isNaN(sinceDate.getTime())
      ? sinceDate
      : subtractDays(now, 90);

  // Prefer YYYY-MM-DD (matches docs examples).
  const sinceYmd = formatYYYYMMDD(effectiveSince);

  const candidates: string[] = [];

  // Candidate A (preferred): v3 historicalorders.
  {
    const query = new URLSearchParams();
    query.set('since', sinceYmd);
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.nextToken) query.set('nextToken', params.nextToken);
    const suffix = query.toString();
    candidates.push(
      `/v3/brokerage/accounts/${encodeURIComponent(params.accountId)}/historicalorders?${suffix}`,
    );
  }

  return candidates;
}

export async function fetchOrdersTodayRaw(params: {
  accountId: string;
  accessToken: string;
  pageSize?: number;
  nextToken?: string;
}): Promise<{ path: string; json: unknown }> {
  const query = new URLSearchParams();
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.nextToken) query.set('nextToken', params.nextToken);
  const suffix = query.toString();
  const path = `/v3/brokerage/accounts/${encodeURIComponent(params.accountId)}/orders${suffix ? `?${suffix}` : ''}`;

  const json = await apiGet<unknown>(path, params.accessToken);
  return { path, json };
}

export async function fetchOrdersToday(params: {
  accountId: string;
  accessToken: string;
  pageSize?: number;
  nextToken?: string;
}): Promise<{ orders: TsOrder[]; nextToken?: string }> {
  const raw = await fetchOrdersTodayRaw(params);
  return extractOrdersFromResponse(raw.json);
}

function responseHasErrors(json: unknown): boolean {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return false;
  }
  const record = json as Record<string, unknown>;
  const errors = record.Errors as unknown;
  return Array.isArray(errors) && errors.length > 0;
}

function extractErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }
  const record = json as Record<string, unknown>;
  const error = record.Error;
  const message = record.Message;
  if (typeof error === 'string' || typeof message === 'string') {
    return `${typeof error === 'string' ? error : 'Error'}: ${typeof message === 'string' ? message : ''}`.trim();
  }
  return null;
}

export async function fetchHistoricalOrdersRaw(params: {
  accountId: string;
  accessToken: string;
  since?: string;
  pageSize?: number;
  nextToken?: string;
}): Promise<{ path: string; json: unknown }> {
  const errors: string[] = [];
  const candidates = buildHistoricalOrderCandidatePaths(params);

  for (const path of candidates) {
    try {
      const json = await apiGet<unknown>(path, params.accessToken);

      // Some endpoints return 200 with Errors populated.
      if (responseHasErrors(json)) {
        errors.push(`${path}: response contained Errors`);
        continue;
      }

      // Some endpoints return { Error, Message } with 200/400 depending on proxy.
      const errorMessage = extractErrorMessage(json);
      if (errorMessage) {
        errors.push(`${path}: ${errorMessage}`);
        continue;
      }

      return { path, json };
    } catch (err) {
      errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `Failed to fetch TradeStation historical orders. Tried:\n${errors.map((e) => `- ${e}`).join('\n')}`,
  );
}

export async function fetchHistoricalOrders(params: {
  accountId: string;
  accessToken: string;
  since?: string;
  pageSize?: number;
  nextToken?: string;
}): Promise<{ orders: TsOrder[]; nextToken?: string }> {
  const raw = await fetchHistoricalOrdersRaw(params);
  return extractOrdersFromResponse(raw.json);
}
