# CCXT Integration Specification: Binance & Bybit

## 1. Library Overview

**CCXT** (CryptoCurrency eXchange Trading Library) is a unified API for cryptocurrency exchange integration. Current version: **4.5.37**.

- **Languages Supported**: JavaScript/TypeScript, Python, PHP, C#, Go
- **Exchange Count**: 108+ exchanges supported
- **Unified API**: Single interface for all exchanges with normalized data structures
- **WebSocket Support**: Via CCXT Pro (integrated into main library for async operations)
- **Certification**: Both Binance and Bybit are **CCXT Certified** exchanges

---

## 2. Exchange Identification

### Binance

```python
import ccxt
exchange = ccxt.binance(config)
```

- **Exchange ID**: `'binance'`
- **Display Name**: `'Binance'`
- **Entity**: **Binance International** (global exchange, NOT Binance US or Binance Japan)
- **Countries**: [] (empty - multi-jurisdictional)
- **API Version**: * (varies by endpoint)
- **Certified**: ✅ True
- **Pro Support**: ✅ True
- **Default Rate Limit**: **50ms** (0.05 seconds)
- **Default Options**:
  - `defaultType`: `'spot'` (can be: `'spot'`, `'future'`, `'margin'`, `'delivery'`, `'option'`)
  - `defaultSubType`: `None` (can be: `'linear'`, `'inverse'`)

---

### ⚠️ Important: Which Binance Class to Use

CCXT provides multiple Binance classes for different legal entities:

| Class | Exchange | Use Case |
|-------|----------|----------|
| `ccxt.binance` | **Binance International** (global) | ✅ **Use this** for unrestricted global trading |
| `ccxt.binanceus` | Binance US | US-only (restricted to US customers) |
| `ccxt.binancejp` | Binance Japan | Japan-only (restricted to JP customers) |
| `ccxt.binanceusdm` | Binance USDⓈ-M (futures only) | Legacy - use `binance` with `defaultType: 'future'` |
| `ccxt.binancecoinm` | Binance COIN-M (futures only) | Legacy - use `binance` with `defaultType: 'delivery'` |

**For your app**: Always use `ccxt.binance` to connect to Binance International. The specialized classes (`binanceusdm`, `binancecoinm`) are legacy and only needed for specific futures-only workflows.

**Do NOT use** `binanceus` or `binancejp` unless your users are specifically restricted to those jurisdictions.

### Bybit

```python
import ccxt
exchange = ccxt.bybit(config)
```

- **Exchange ID**: `'bybit'`
- **Display Name**: `'Bybit'`
- **Entity**: **Bybit Global** (registered in BVI, serves international markets)
- **Countries**: `['VG']` (British Virgin Islands - legal registration)
- **API Version**: `'v5'`
- **Certified**: ✅ True
- **Pro Support**: ✅ True
- **Default Rate Limit**: **20ms** (0.02 seconds)
- **Hostname**: `bybit.com` (alternatives: `bytick.com`, `bybit.nl`, `bybit.com.hk`)
- **Default Options**:
  - `defaultType`: `'swap'` (can be: `'swap'`, `'future'`, `'option'`, `'spot'`)
  - `defaultSubType**: `'linear'` (can be: `'linear'`, `'inverse'`)

---

### ⚠️ Important: Bybit Entity

Bybit operates primarily as a single international entity (`ccxt.bybit`) registered in the British Virgin Islands (BVI). Unlike Binance, Bybit does not have separate country-specific classes (no `bybitus`, `bybitjp`, etc.).

**For your app**: Always use `ccxt.bybit` to connect to Bybit's global platform. All users worldwide access the same API endpoint (with regional restrictions enforced at the API key level based on account KYC status).

---

## 3. Authentication & API Credentials

### Getting API Keys

#### Binance

1. Log into Binance → API Management
2. Click **Create API** → System generated
3. Label your key (e.g., "CCXT Bot")
4. Complete 2FA verification
5. **Important**: Copy the `Secret Key` immediately (only shown once)
6. Configure permissions:
   - **Spot & Margin Trading**: Enable for spot trading
   - **Futures**: Enable for derivatives
   - **IP Restriction**: Recommended for security
7. Save both **API Key** and **Secret Key**

#### Bybit

1. Log into Bybit → API Management (profile icon)
2. Click **Create New Key**
3. Select **System-generated API Keys** (HMAC encryption)
4. Configure permissions:
   - **API Key Usage**: "Connect to Third-Party Applications" → Search for **CCXT**
   - **Permissions**:
     - **Spot**: Trade (for spot trading)
     - **Contract**: Orders and Positions (for futures/derivatives)
     - **Wallet**: Account Transfer (optional, for fund transfers)
5. Complete 2FA verification
6. Save **API Key** and **Secret Key**

### Code: Authentication Setup

```python
import ccxt

# Generic setup
exchange = ccxt.binance({
    'apiKey': 'YOUR_API_KEY',
    'secret': 'YOUR_SECRET_KEY',
    'enableRateLimit': True,  # IMPORTANT: Respect rate limits
})
```

### Security Best Practices

- **Never hardcode keys**: Use environment variables or secure config files
- **IP Whitelisting**: Restrict API key to your server's IP address
- **Testnet first**: Always test with testnet/sandbox before using real funds
- **Minimal permissions**: Only enable required permissions for your use case

---

## 4. Rate Limiting

### Binance Rate Limits

- **System**: **Weight-based** (Request Weights)
- **Standard Limit**: **1,200 weight units per minute per IP**
- **Weight varies by endpoint**:
  - Simple ticker: low weight (~1)
  - Historical data: higher weight
  - `fetchTickers()` (all symbols): very high weight → call infrequently
- **Violation**: Returns `429` error; continued violations → IP ban
- **CCXT Implementation**: `rateLimit = 50ms` (default) with automatic weight calculation
- **Error Code**: `-1003` → `RateLimitExceeded`

### Bybit Rate Limits

- **System**: **Fixed request frequency**
- **Public Endpoints** (IP-based): **600 requests per 5 seconds**
- **Private Endpoints** (UID-based):
  - Trading (orders): **10-20 requests per second**
  - Account/Positions: **up to 50/s** (varies by VIP level)
- **CCXT Implementation**: `rateLimit = 20ms` (default)
- **Best Practice**: Use `enableRateLimit: True` to auto-throttle

### Configuring Rate Limiting

```python
exchange = ccxt.bybit({
    'apiKey': '...',
    'secret': '...',
    'enableRateLimit': True,  # Enable automatic throttling (default: True)
    'rateLimit': 50,  # Override default: milliseconds between requests
})
```

**Note**: When `enableRateLimit=True`, CCXT automatically spaces requests to avoid hitting rate limits.

---

## 5. Market Types & Configuration

### Binance Market Types

```python
exchange = ccxt.binance({
    'options': {
        'defaultType': 'spot',  # 'spot', 'future', 'margin', 'delivery', 'option'
        'defaultSubType': None,  # 'linear', 'inverse' (for futures)
    }
})
```

**Market Type Details**:
- **`spot`**: Regular spot trading
- **`margin`**: Margin trading (cross/isolated)
- **`future`**: USDⓈ-M (linear) futures (legacy naming)
- **`delivery`**: COIN-M (inverse) futures (legacy naming)
- **`option`**: Options trading

**Modern Usage** (recommended):
```python
# For linear futures (USDT-margined):
exchange.options['defaultType'] = 'linear'  # or 'future' (legacy)

# For inverse futures (coin-margined):
exchange.options['defaultType'] = 'inverse'  # or 'delivery' (legacy)
```

### Bybit Market Types

```python
exchange = ccxt.bybit({
    'options': {
        'defaultType': 'swap',    # 'swap', 'future', 'option', 'spot'
        'defaultSubType': 'linear',  # 'linear', 'inverse' (for swaps/futures)
        'defaultSettle': None,  # 'USDC', 'USDT' (for USDC endpoints)
    }
})
```

**Market Type Details**:
- **`spot`**: Spot trading
- **`swap`**: Perpetual swaps (USDT/USDCⓈ-M or inverse)
- **`future`**: Delivery futures (expiring contracts)
- **`option`**: Options trading

**Settlement Types** (for swaps):
- **Linear** (USDT/USDC-margined): `defaultSubType = 'linear'`
- **Inverse** (coin-margined): `defaultSubType = 'inverse'`

**USDC vs USDT**:
```python
# USDC-margined swaps
exchange.options['defaultSettle'] = 'USDC'
balance = exchange.fetch_balance({'settle': 'USDC'})

# USDT-margined (default)
exchange.options['defaultSettle'] = 'USDT'
```

---

## 6. Unified API Reference

### Common Public Methods (No Auth Required)

```python
# Load markets (call once at startup)
markets = exchange.load_marks()
# Returns: dict of market objects indexed by symbol

# Fetch ticker for a symbol
ticker = exchange.fetch_ticker('BTC/USDT')
# Returns: {
#   'symbol': 'BTC/USDT',
#   'last': 50000.0,
#   'bid': 49990.0,
#   'ask': 50010.0,
#   'volume': 1234.5,
#   'quoteVolume': 61725000.0,
#   'high': 51000.0,
#   'low': 49000.0,
#   'timestamp': 1672376496682,
#   'datetime': '2023-01-01T12:00:00.000Z',
#   'info': {}  # raw exchange response
# }

# Fetch order book
order_book = exchange.fetch_order_book('BTC/USDT', limit=20)
# Returns: {
#   'symbol': 'BTC/USDT',
#   'bids': [[price, amount], ...],
#   'asks': [[price, amount], ...],
#   'timestamp': ...,
#   'nonce': ...
# }

# Fetch OHLCV candles
ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe='1h', limit=100)
# Returns: list of [timestamp, open, high, low, close, volume]
# timestamp is in milliseconds (UTC)

# Fetch recent trades
trades = exchange.fetch_trades('BTC/USDT', limit=50)
# Returns: list of {
#   'id': '12345',
#   'symbol': 'BTC/USDT',
#   'side': 'buy' | 'sell',
#   'price': 50000.0,
#   'amount': 0.1,
#   'cost': 5000.0,
#   'timestamp': ...,
#   'datetime': ...
# }

# Fetch all available symbols
markets = exchange.load_markets()
symbols = list(markets.keys())
# Returns: ['BTC/USDT', 'ETH/USDT', ...]

# Exchange status
status = exchange.fetch_status()
# Returns: {'status': 'ok', 'eta': None, 'updated': ...}
```

### Common Private Methods (Auth Required)

```python
# Fetch account balance
balance = exchange.fetch_balance()
# Returns: {
#   'BTC': {'free': 1.0, 'used': 0.5, 'total': 1.5},
#   'USDT': {'free': 10000.0, 'used': 5000.0, 'total': 15000.0},
#   'timestamp': ...,
#   'datetime': ...
# }

# Create order
order = exchange.create_order(
    symbol='BTC/USDT',
    type='limit',  # 'limit' | 'market' | 'stop_limit' | 'stop_market' | etc.
    side='buy',    # 'buy' | 'sell'
    amount=0.1,    # amount in base currency
    price=50000.0, # price in quote currency (None for market orders)
    params={}      # exchange-specific params (see sections below)
)
# Returns: {
#   'id': '123456',
#   'symbol': 'BTC/USDT',
#   'side': 'buy',
#   'type': 'limit',
#   'amount': 0.1,
#   'price': 50000.0,
#   'status': 'open' | 'closed' | 'canceled',
#   'filled': 0.0,
#   'remaining': 0.1,
#   'timestamp': ...,
#   'info': {}
# }

# Cancel order
canceled = exchange.cancel_order(order_id, symbol='BTC/USDT')
# or cancel all: exchange.cancel_all_orders(symbol='BTC/USDT')

# Fetch order by ID
order = exchange.fetch_order(order_id, symbol='BTC/USDT')

# Fetch open orders
open_orders = exchange.fetch_open_orders(symbol='BTC/USDT')

# Fetch closed orders
closed_orders = exchange.fetch_closed_orders(symbol='BTC/USDT', limit=50)

# Fetch my trade history
my_trades = exchange.fetch_my_trades(symbol='BTC/USDT', limit=50)

# Fetch positions (futures/derivatives only)
positions = exchange.fetch_positions(symbols=['BTC/USDT:USDT'])
# Returns: [{'symbol': 'BTC/USDT:USDT', 'contracts': 1.0, 'side': 'long', ...}]

# Set leverage (futures)
exchange.set_leverage(10, symbol='BTC/USDT:USDT')

# Set margin mode (futures)
exchange.set_margin_mode('isolated', symbol='BTC/USDT:USDT')

# Transfer between accounts (spot ↔ futures)
exchange.transfer(
    amount=1.0,
    currency='USDT',
    fromAccount='spot',
    toAccount='futures'
)

# Withdraw crypto
withdraw = exchange.withdraw(
    currency='BTC',
    amount=0.1,
    address='1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    tag=None,  # memo/tag for some coins
    params={}
)
```

---

## 7. Exchange-Specific Capabilities

### Binance: Has Capabilities

From `python/ccxt/binance.py` `describe()['has']`:

**Full Support**:
- ✅ Spot, Margin, Futures (linear/inverse), Options
- ✅ Cancel all/order/orders
- ✅ Create limit/market orders, post-only, reduce-only
- ✅ Stop-loss, take-profit, trailing percent orders
- ✅ Edit orders
- ✅ Fetch balance, positions, funding rates, mark prices
- ✅ OHLCV, tickers, order books, trades
- ✅ Leverage, margin mode, position mode
- ✅ Transfers between accounts
- ✅ Borrow/repay (margin)
- ✅ Ledger, deposit/withdrawal history
- ✅ Convert trades (asset conversion)

**Not Supported**:
- ❌ `fetchOrderBooks` (batch fetch multiple order books)
- ❌ `closePosition` (requires specific binance parameter)
- ❌ `fetchClosedOrder` (single closed order)

### Bybit: Has Capabilities

From `python/ccxt/bybit.py` `describe()['has']`:

**Full Support**:
- ✅ Spot, Margin, Swaps, Futures, Options
- ✅ Cancel all/order/orders (including `cancelOrdersForSymbols`)
- ✅ Cancel all orders after timeout (`cancelAllOrdersAfter`)
- ✅ Create order with take-profit/stop-loss (single call)
- ✅ Trailing amount orders (trailing stop in currency units)
- ✅ Trigger orders (conditional orders)
- ✅ Post-only, reduce-only orders
- ✅ Fetch option chain
- ✅ Fetch positions history, positions risk
- ✅ Fetch open interest history
- ✅ Fetch volatility history
- ✅ Fetch deposit addresses by network
- ✅ Set leverage, margin mode, position mode
- ✅ Transfers, withdrawals

**Not Supported / Emulated**:
- ⚠️ `fetchBorrowInterest` (temporarily disabled)
- ⚠️ `fetchFundingRate` (emulated by exchange)
- ⚠️ `fetchBidsAsks` (emulated via tickers)
- ⚠️ `fetchOrders` (single endpoint not available)
- ❌ `fetchClosedOrder` (single closed order)
- ❌ `fetchLiquidations` (liquidation feeds)
- ❌ `fetchUnderlyingAssets` (options underlying)

---

## 8. Futures & Derivatives API

Both Binance and Bybit support futures/derivatives trading with **differentiated market types** and API shapes.

### Market Type Selection

#### Binance

```python
exchange = ccxt.binance({
    'options': {
        'defaultType': 'linear',   # USDT/M futures (perpetual & delivery)
        # OR
        'defaultType': 'inverse',  # Coin-margined futures (COIN-M)
        # OR
        'defaultType': 'future',   # Legacy alias for 'linear'
        # OR
        'defaultType': 'delivery', # Legacy alias for 'inverse'
    }
})
```

**Important**: Binance's `defaultType` determines which API endpoints are used:
- `'spot'` → `/api/v3/*`, `/sapi/v1/*`
- `'linear'`/`'future'` → `/fapi/*` (USDTⓈ-M) and `/dapi/*` (coin-margined is actually inverse)
- `'inverse'`/`'delivery'` → `/dapi/*` (COIN-M delivery/quarterly)
- `'margin'` → margin spot endpoints

#### Bybit

```python
exchange = ccxt.bybit({
    'options': {
        'defaultType': 'swap',      # Perpetual swaps (default)
        # OR
        'defaultType': 'future',    # Delivery futures
        # OR
        'defaultType': 'option',    # Options
        # OR
        'defaultType': 'spot',      # Spot trading
        
        'defaultSubType': 'linear',  # USDT/USDC-margined (default)
        # OR
        'defaultSubType': 'inverse', # Coin-margined (BTC/USD:BTC)
        
        'defaultSettle': 'USDT',      # Settlement currency (USDT or USDC)
    }
})
```

### Symbol Conventions for Futures

| Exchange | Linear (USDT/USDC) | Inverse (Coin) | Delivery |
|----------|--------------------|----------------|----------|
| **Binance** | `BTC/USDT:USDT` | `BTC/USD:BTC` | `BTC/USD:BTC-240927` |
| **Bybit** | `BTC/USDT:USDT` | `BTC/USD:BTC` | `BTC/USD:BTC-240927` |

**Notes**:
- Linear: Quote currency = settlement currency (USDT or USDC)
- Inverse: Quote currency = base currency (BTC), settlement is in base coin
- Delivery: Includes expiry date in symbol

### API Endpoint Mapping

Understanding the underlying REST endpoints helps when debugging or using raw API calls.

#### Binance REST Endpoints

| Purpose | Spot | Linear (USDTⓈ-M) | Inverse (COIN-M) |
|---------|------|-------------------|------------------|
| **Market Data** | `/api/v3/*` | `/fapi/v1/*` | `/dapi/v1/*` |
| **Account/Trading** | `/sapi/v1/*` | `/fapi/v1/*` | `/dapi/v1/*` |
| **WebSocket** | `wss://stream.binance.com:9443` | `wss://fstream.binance.com` | `wss://dstream.binance.com` |

**Examples**:
```python
# Public endpoints
public GET /fapi/v1/ticker/24hr           # ticker (linear)
public GET /dapi/v1/ticker/24hr           # ticker (inverse)
public GET /fapi/v1/klines                # OHLCV (linear)

# Private endpoints
private GET /fapi/v1/account              # balance (linear)
private GET /dapi/v1/account              # balance (inverse)
private POST /fapi/v1/order               # create order (linear)
```

#### Bybit REST Endpoints

| Purpose | Spot | Linear (USDT/USDC) | Inverse | Options |
|---------|------|--------------------|---------|---------|
| **Public** | `/spot/v3/*` | `/v5/market/*` | `/v5/market/*` | `/v5/market/*` |
| **Private** | `/spot/v3/*` | `/v5/account/*` | `/v5/account/*` | `/v5/account/*` |
| **WebSocket** | `wss://stream.bybit.com/v5` (all) | | | |

**CCXT routes to endpoints automatically** based on `defaultType` and symbol:
```python
# Under the hood:
# 'BTC/USDT:USDT' + defaultType='swap' → private/v5/order/create (category=linear)
# 'BTC/USD:BTC' + defaultType='swap' → private/v5/order/create (category=inverse)
```

### Response Format Differences

#### Binance

```python
# Typical response structure
{
  "code": 0,           # or negative for error (legacy)
  "msg": "success",
  "timestamp": 1672376496682,
  "result": { ... }    # actual data
}
```

**Weight-based rate limits**:
```python
# Each endpoint has a weight cost (declared in api docs)
# CCXT tracks cumulative weight and enforces 1200/min limit
response = exchange.fetch_ticker('BTC/USDT')  # weight = 1
markets = exchange.load_markets()            # weight varies (50-500+)
```

#### Bybit

```python
# Typical response structure (V5)
{
  "retCode": 0,        # 0 = success
  "retMsg": "OK",
  "result": { ... },   # actual data
  "time": "1672376496682",
  "ratelimit": "20"    # rate limit remaining
}
```

**Rate limit headers**:
- `X-Bapi-Limit-Status`: remaining requests
- `X-Bapi-Limit-Reset`: reset timestamp

### Implicit API (Low-Level Access)

CCXT exposes exchange-specific raw methods if needed:

```python
# Binance: Call endpoint directly
# These map to: publicGetV3TickerPrice or privatePostV3Order
ticker = exchange.publicGetV3TickerPrice({'symbol': 'BTCUSDT'})
order = exchange.privatePostV3Order({
    'symbol': 'BTCUSDT',
    'side': 'BUY',
    'type': 'LIMIT',
    'timeInForce': 'GTC',
    'quantity': '0.001',
    'price': '50000',
    'newClientOrderId': 'myorder1',
})

# Bybit: V5 endpoints
ticker = exchange.publicGetV5MarketTickers({
    'category': 'linear',
    'symbol': 'BTCUSDT'
})
balance = exchange.privateGetV5AccountWalletBalance({
    'accountType': 'CONTRACT',
    'coin': 'USDT'
})
```

**Common pattern**:
```python
# Implicit method naming: <access><version><endpoint>
# access: public | private
# version: V2 | V3 | V5 (exchange-specific)
# endpoint: e.g. MarketTickers, AccountWalletBalance

# Automatically generated from ImplicitAPI in abstract/<exchange>.py
```

---

### Futures Implementation Examples

**Example symbols**:
```python
# Binance Linear Perpetual
'BTC/USDT:USDT'
'ETH/USDT:USDT'

# Binance Inverse Perpetual
'BTC/USD:BTC'
'ETH/USD:ETH'

# Bybit USDC Perpetual
'BTC/USD:USDC'
'ETH/USD:USDC'

# Bybit Inverse Perpetual
'BTC/USD:BTC'
'ETH/USD:ETH'

# Delivery Future (expiring)
'BTC/USD:BTC-240927'  # Sept 27, 2024
```

### Futures Balance

Returns **multi-currency wallet balances** across spot, futures, margin accounts.

```python
# Fetch total balance (all currencies, all accounts)
balance = exchange.fetch_balance()
# Structure:
# {
#   'BTC': {'free': 1.0, 'used': 0.5, 'total': 1.5},
#   'USDT': {'free': 10000.0, 'used': 5000.0, 'total': 15000.0},
#   'info': {
#     'totalWalletBalance': '15000.5',  # total across all sub-accounts
#     'totalCrossWalletBalance': '10000.0',
#     'totalIsolatedWalletBalance': '5000.5',
#   },
#   'timestamp': ...,
#   'datetime': ...
# }
```

**Fetching specific account type**:

```python
# Bybit: fetch USDC balance specifically
balance = exchange.fetch_balance({'settle': 'USDC'})

# Binance: Use options to target futures wallet
exchange.options['defaultType'] = 'linear'
balance = exchange.fetch_balance()
# Will return futures wallet balances
```

### Positions

```python
# Fetch all open positions
positions = exchange.fetch_positions(
    symbols=['BTC/USDT:USDT', 'ETH/USDT:USDT'],  # optional filter
    params={}
)
# Returns: [
#   {
#     'symbol': 'BTC/USDT:USDT',
#     'contracts': 1.0,           # position size in contracts
#     'contractSize': 0.001,      # BTC per contract (usually 0.001 for BTCUSDT)
#     'side': 'long',             # 'long' or 'short'
#     'notional': 50000.0,        # position value in quote currency
#     'leverage': 10.0,           # current leverage
#     'entryPrice': 49000.0,      # average entry price
#     'markPrice': 50000.0,       # current mark price
#     'liquidationPrice': 45000.0,# liquidation price
#     'marginType': 'isolated',   # 'isolated' or 'cross'
#     'positionId': '123456',
#     'unrealizedPnl': 1000.0,
#     'percentage': 2.04,         # unrealized PnL %
#     'timestamp': ...,
#     'info': {}
#   }
# ]
```

**Position-specific operations**:

```python
# Fetch single position
position = exchange.fetch_position('BTC/USDT:USDT')

# Set leverage
exchange.set_leverage(10, 'BTC/USDT:USDT')

# Set margin mode
exchange.set_margin_mode('isolated', 'BTC/USDT:USDT')  # or 'cross'

# Close position (reduce-only order)
order = exchange.create_market_sell_order(
    'BTC/USDT:USDT',
    amount=position['contracts'],
    params={'reduce_only': True}
)
```

### Funding Rates (Perpetual Swaps)

```python
# Current funding rate
funding = exchange.fetch_funding_rate('BTC/USDT:USDT')
# Returns:
# {
#   'symbol': 'BTC/USDT:USDT',
#   'fundingRate': 0.0001,       # 0.01% per 8 hours
#   'fundingTimestamp': 1672376400000,
#   'nextFundingTime': 1672401600000,
#   'timestamp': ...,
#   'info': {}
# }

# Historical funding rates
funding_history = exchange.fetch_funding_rate_history(
    'BTC/USDT:USDT',
    since=1672376400000,
    limit=100
)
# [[timestamp, rate], ...]
```

**Note**: Bybit marks `fetch_funding_rate` as "emulated" - for precise values use `fetch_funding_rates()`.

### OHLCV for Futures

Same API as spot, but on futures symbols:

```python
# Fetch perpetual swap candles
ohlcv = exchange.fetch_ohlcv(
    'BTC/USDT:USDT',
    timeframe='1h',
    limit=200
)

# Fetch mark price candles (Bybit)
ohlcv = exchange.fetch_ohlcv(
    'BTC/USDT:USDT',
    '1h',
    params={'price': 'mark'}  # 'mark', 'index', or 'premiumIndex'
)

# Fetch index price (Binance)
ohlcv = exchange.fetch_index_ohlcv('BTC/USDT:USDT', '1h', limit=100)
```

### Order Placement on Futures

```python
# Linear perpetual (USDT-margined)
order = exchange.create_order(
    symbol='BTC/USDT:USDT',
    type='market',  # or 'limit'
    side='buy',      # or 'sell'
    amount=1.0,      # in contracts (or base currency for limit)
    price=None,      # None for market orders
    params={
        'positionIdx': 0,          # 0=one-way, 1=buy-hedge, 2=sell-hedge
        'reduce_only': False,      # True to reduce position only
        'stopPrice': 50000.0,      # for stop orders
        'basePrice': 51000.0,      # for trigger orders (Bybit)
    }
)

# Inverse perpetual (BTC-margined)
order = exchange.create_order(
    symbol='BTC/USD:BTC',
    type='limit',
    side='sell',
    amount=100.0,    # in USD value (not BTC!) for inverse
    price=50000.0,   # price in USD
    params={}
)
```

**Key differences**:
- **Inverse contracts**: `amount` is in **USD value** (not coin amount)
- **Linear contracts**: `amount` is in **base currency** (BTC, ETH, etc.)
- Use `market['contractSize']` to convert between contracts and base currency

### Leverage

```python
# Set leverage (cross margin)
exchange.set_leverage(10, 'BTC/USDT:USDT')

# Set isolated leverage (tier-based)
exchange.set_leverage(
    {'long': 10, 'short': 10},  # separate long/short leverage
    'BTC/USDT:USDT'
)
```

### Common Futures Parameters

#### Binance-Specific

```python
params = {
    'positionSide': 'LONG',    # 'LONG' or 'SHORT' (for hedge mode)
    'reduceOnly': True,        # reduce-only order
    'stopLossPrice': 45000.0,  # attach stop-loss
    'takeProfitPrice': 55000.0,# attach take-profit
    'workingType': 'MARK_PRICE',  # 'MARK_PRICE' or 'CONTRACT_PRICE'
}
```

#### Bybit-Specific

```python
params = {
    'positionIdx': 0,          # 0=one-way, 1=buy-hedge, 2=sell-hedge
    'reduceOnly': True,
    'stopLoss': 45000.0,
    'takeProfit': 55000.0,
    'tpTriggerBy': 'LastPrice',   # 'LastPrice', 'IndexPrice', 'MarkPrice'
    'slTriggerBy': 'MarkPrice',
    'basePrice': 50000.0,     # for trigger orders (reference price)
    'tpslMode': 'Full',       # 'Full' (TP/SL for whole position) or 'Partial'
    'tpOrderType': 'Market',  # 'Market' or 'Limit'
    'slOrderType': 'Market',
}
```

### Futures-Specific Endpoints

#### Binance Additional Methods

```python
# Fetch mark price
mark = exchange.fetch_mark_price('BTC/USDT:USDT')

# Fetch funding rate
funding = exchange.fetch_funding_rate('BTC/USDT:USDT')

# Fetch open interest
oi = exchange.fetch_open_interest('BTC/USDT:USDT')

# Fetch liquidation price
liquidations = exchange.fetch_liquidations('BTC/USDT:USDT')  # not supported directly
# Use fetch_my_liquidations() for your own liquidations
```

#### Bybit Additional Methods

```python
# Fetch option chain (if trading options)
chain = exchange.fetch_option_chain('BTC/USD:USDC')

# Fetch volatility history
vol = exchange.fetch_volatility_history('BTC/USDT:USDT', limit=100)

# Fetch long/short ratio
ratio = exchange.fetch_long_short_ratio('BTC/USDT:USDT', limit=100)
```

---

## 9. How to Discover CCXT Features from Scratch

CCXT is a large library with many exchange-specific nuances. Here's a systematic approach to discovering what's available for any exchange.

### 1. Start with `describe()` - The Exchange Blueprint

Every exchange class has a `describe()` method that returns all metadata:

```python
import ccxt

exchange = ccxt.binance()
info = exchange.describe()

# Key metadata:
print('ID:', info['id'])
print('Name:', info['name'])
print('Version:', info.get('version'))
print('Rate limit (ms):', info['rateLimit'])
print('Certified:', info['certified'])
print('Pro support:', info['pro'])

# Capability matrix - what methods are available?
has = info['has']
print('Can fetch balance?', has['fetchBalance'])
print('Can create orders?', has['createOrder'])
print('Supports futures?', has['swap'] or has['future'])
```

**Output example** (truncated):
```python
{
  'id': 'bybit',
  'name': 'Bybit',
  'countries': ['VG'],
  'version': 'v5',
  'rateLimit': 20,
  'pro': True,
  'certified': True,
  'has': {
    'spot': True,
    'swap': True,
    'future': True,
    'option': True,
    'fetchBalance': True,
    'fetchOrder': True,
    'createOrder': True,
    'setLeverage': True,
    'fetchFundingRate': 'emulated',  # 'emulated' means CCXT calculates it
    # ...
  },
  'timeframes': {'1m': '1', '5m': '5', ...},
  'urls': {...},
}
```

### 2. Inspect Available Methods Programmatically

```python
# List all public methods
methods = [m for m in dir(exchange) if not m.startswith('_') and callable(getattr(exchange, m))]
print(sorted(methods))

# Filter for fetch methods
fetch_methods = [m for m in methods if m.startswith('fetch')]
print('Fetch methods:', fetch_methods)

# Create methods
create_methods = [m for m in methods if m.startswith('create')]
print('Create methods:', create_methods)
```

**Common patterns**:
- `fetch_*` - read operations (market data, balances, orders)
- `create_*` - create something (order, deposit address)
- `cancel_*` - cancel operations
- `set_*` - configuration (leverage, margin mode)
- `public*`, `private*` - low-level raw API access

### 3. Read Source: `abstract/<exchange>.py`

The abstract class defines all **exchange-specific endpoints**. This is where you find:

- Exact endpoint paths (`Entry('spot/v3/public/symbols', 'public', 'GET', {'cost': 1})`)
- Cost (rate limit weight) per endpoint
- Which HTTP method (GET/POST/DELETE)
- Which authentication level (public vs private)

**Location**: `/python/ccxt/abstract/<exchange>.py`

Example snippet from `abstract/bybit.py`:
```python
class ImplicitAPI:
    public_get_spot_v3_public_symbols = Entry('spot/v3/public/symbols', 'public', 'GET', {'cost': 1})
    public_get_v5_market_tickers = Entry('v5/market/tickers', 'public', 'GET', {'cost': 5})
    private_get_v5_account_wallet_balance = Entry('v5/account/wallet-balance', 'private', 'GET', {'cost': 1})
    private_post_v5_order_create = Entry('v5/order/create', 'private', 'POST', {'cost': 1})
```

This tells you:
- Method name: `public_get_spot_v3_public_symbols`
- REST path: `spot/v3/public/symbols`
- Access: `public` (no auth) or `private` (needs API key)
- HTTP method: `GET` or `POST`
- Cost: `1` (rate limit weight)

These Python methods are **automatically mapped** to the exchange's HTTP endpoints.

### 4. Check the Generated `describe()['has']` for Support

The `has` dictionary tells you which **unified methods** are available and whether they're fully implemented, emulated, or not available:

```python
exchange = ccxt.bybit()
info = exchange.describe()

has = info['has']
print('Support levels:')
for method, supported in has.items():
    if supported is True:
        print(f"  ✅ {method}")
    elif supported == 'emulated':
        print(f"  ⚠️  {method} (emulated)")
    elif supported in (False, None):
        print(f"  ❌ {method}")
```

**Interpretation**:
- `True` → Fully implemented, use it
- `'emulated'` → Not directly available, CCXT simulates it using other endpoints (may have limitations)
- `False` or `None` → Not supported

### 5. Use `help()` and `__doc__`

```python
# Get method signature
help(exchange.fetch_balance)

# Or inspect directly
print(exchange.fetch_balance.__doc__)
```

**Example output**:
```
Help on method fetch_balance in module ccxt.bybit:

fetch_balance(params={}) method of ccxt.bybit.bybit instance
    Fetch balance for all currencies

    :param dict [params]: extra parameters specific to the exchange API endpoint
    :param str [params.type]: *spot only* 'spot', 'funding'
    :param str [params.settle]: *contract only* 'USDT', 'USDC'
    :returns dict: a `balance structure <https://docs.ccxt.com/?id=balance-structure>`
```

The docstring tells you:
- Which parameters are accepted (`params.type`, `params.settle`)
- What the return structure is
- Any special notes (e.g., "*spot only*")

### 6. Examine Unified API Response Structures

Response formats are standardized across all exchanges. Key structures:

**Balance**: https://docs.ccxt.com/?id=balance-structure
```python
{
  'BTC': {'free': 1.0, 'used': 0.5, 'total': 1.5},
  'USDT': {'free': 10000.0, 'used': 5000.0, 'total': 15000.0},
  'timestamp': 1672376496682,
  'datetime': '2023-01-01T12:00:00.000Z',
  'info': {}  # raw exchange response
}
```

**Order**: https://docs.ccxt.com/?id=order-structure
```python
{
  'id': '123456',
  'symbol': 'BTC/USDT:USDT',
  'side': 'buy',
  'type': 'limit',
  'amount': 1.0,
  'price': 50000.0,
  'status': 'open',
  'filled': 0.0,
  'remaining': 1.0,
  'timestamp': ...,
  'datetime': ...,
  'info': {}
}
```

**Ticker**: https://docs.ccxt.com/#ticker-structure
```python
{
  'symbol': 'BTC/USDT',
  'last': 50000.0,
  'high': 51000.0,
  'low': 49000.0,
  'bid': 49990.0,
  'ask': 50010.0,
  'volume': 1234.5,
  'quoteVolume': 61725000.0,
  'timestamp': ...,
  'datetime': ...,
}
```

**Order Book**: https://docs.ccxt.com/#order-book-structure
```python
{
  'symbol': 'BTC/USDT',
  'bids': [[50000.0, 1.0], [49990.0, 2.0], ...],
  'asks': [[50010.0, 1.5], [50020.0, 1.0], ...],
  'timestamp': ...,
  'nonce': ...
}
```

Documentation: https://docs.ccxt.com (official unified API reference)

### 7. Search the Codebase

When you have the CCXT repo cloned (as we do in `/tmp/pi-github-repos/ccxt/ccxt`):

```bash
# Find all methods containing "order" in bybit implementation
grep -n "def.*order" python/ccxt/bybit.py | head -20

# Search for specific parameter handling
grep -rn "positionIdx" python/ccxt/bybit.py

# Find all fetch methods
grep -n "def fetch" python/ccxt/binance.py | head -20

# Look at error code mappings
grep -n "'-1003'" python/ccxt/binance.py
```

### 8. Check Examples Directory

CCXT has extensive examples in `/examples/py/`:

```bash
ls examples/py/ | grep bybit
# Output:
# bybit-updated.md
# bybit-USDC-create-option-order.md
# bybit-conditional-orders.md
# bybit-positions.md
# bybit-trailling.md
# async-bybit-transfer.md
```

These are **real working examples** showing specific use cases. Always check here first for exchange-specific patterns.

### 9. Read the Implied `sign()` Method

The `sign()` method constructs the actual HTTP request. It reveals:

- Which endpoints are called for each unified method
- How parameters are mapped
- Authentication signature generation

```python
# In exchange class (e.g., python/ccxt/bybit.py)
def sign(self, path, api='public', method='GET', params={}, headers=None, body=None):
    # Look at how path is constructed
    # How params are formatted
    # Which headers are added (signature, timestamp)
```

### 10. Understand the Method Resolution Order

When you call `exchange.fetch_balance()`:

1. **Base Exchange** (`base/exchange.py`) provides the default unified implementation
2. **Exchange-specific override** may replace it (check `python/ccxt/binance.py` for `def fetch_balance(self, params={})`)
3. **Abstract class** (`abstract/<exchange>.py`) defines low-level endpoints (`privateGetV5AccountWalletBalance`, etc.)
4. **`sign()`** maps the method to actual REST call

If a method isn't working as expected, trace through these layers.

### 11. Check `errors.py` for Exchange-Specific Error Codes

Each exchange may override error mapping:

```python
# In binance.py, look for:
exact = {
    '-1003': RateLimitExceeded,
    '-1021': InvalidNonce,
    # ...
}

# In bybit.py:
exact = {
    '-1': OperationFailed,
    '-4000': InvalidOrder,
    # ...
}
```

Understanding these helps you catch specific error conditions.

### 12. Use Interactive Python REPL

```python
$ python
>>> import ccxt
>>> binance = ccxt.binance()
>>> binance.load_markets()
>>> help(binance.fetch_balance)  # See docstring
>>> binance.fetch_balance.__doc__
>>> binance.markets['BTC/USDT']  # Inspect market structure
```

### 13. Read the Official Manual

The CCXT manual in the repo (`wiki/Manual.md`) covers:

- Unified API concepts
- Rate limiting
- Authentication
- Proxy configuration
- Error handling
- Troubleshooting

**Online version**: https://github.com/ccxt/ccxt/wiki/Manual

### 14. Quick Reference Cheat Sheet

**Goal** → **How to discover**:

| "How do I..." | Search/Lookup |
|---------------|---------------|
| Check if exchange supports futures? | `info['has']['swap']` or `info['has']['future']` |
| Find available timeframes? | `exchange.timeframes` |
| See all market symbols? | `exchange.markets.keys()` |
| Get market precision/limits? | `exchange.markets['BTC/USDT:USDT']['precision']`, `['limits']` |
| Discover endpoint cost/rate limits? | Check `abstract/<exchange>.py` → `Entry(..., {'cost': N})` |
| Find exchange-specific params? | Read method docstring or check examples/ |
| Understand error codes? | `grep` in `<exchange>.py` for error mappings |
| See raw API response? | Check `info['info']` field in any return value |
| Find which endpoint is called? | Search `def fetch_<method>` in `<exchange>.py` for `self.public` or `self.private` calls |

### 15. When Documentation is Missing

1. **Check the unified method exists**: `has['methodName']`
2. **Try calling it** with minimal params (testnet!)
3. **Inspect `.info` field** in response for raw exchange data
4. **Search the file** for similar implementations in other exchanges
5. **Open an issue** on GitHub if truly missing

### Example Discovery Session

```python
# "Can Bybit fetch option chains?"
exchange = ccxt.bybit()
info = exchange.describe()
print(info['has']['fetchOptionChain'])  # Output: True

# "What parameters does it take?"
help(exchange.fetch_option_chain)
# Docstring says: symbol, params={}, returns option chain

# "What does it return?"
# → Fetch option chain on testnet, inspect structure

# "Which REST endpoint is used?"
# Grep: grep -n "fetchOptionChain" python/ccxt/bybit.py
# Find: return self.publicGetV5MarketOptionChain(params)
```

---



## 10. Timeframes

### Binance Timeframes

```python
timeframes = exchange.timeframes
# Available:
{
    '1s': '1s',   # spot only
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '6h': '6h',
    '8h': '8h',
    '12h': '12h',
    '1d': '1d',
    '3d': '3d',
    '1w': '1w',
    '1M': '1M',
}
```

### Bybit Timeframes

```python
timeframes = exchange.timeframes
# Available:
{
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
    '1M': 'M',
}
# Note: Bybit uses numeric codes internally; CCXT maps them automatically
```

---

## 11. Error Handling

### Error Hierarchy

From `python/ccxt/base/errors.py`:

```
BaseError
 └── ExchangeError
      ├── AuthenticationError
      │    ├── PermissionDenied
      │    │    └── AccountNotEnabled
      │    └── AccountSuspended
      ├── ArgumentsRequired
      ├── BadRequest
      │    └── BadSymbol
      ├── OperationRejected
      │    ├── NoChange
      │    │    └── MarginModeAlreadySet
      │    ├── MarketClosed
      │    ├── ManualInteractionNeeded
      │    └── RestrictedLocation
      ├── InsufficientFunds
      ├── InvalidAddress
      │    └── AddressPending
      ├── InvalidOrder
      │    ├── OrderNotFound
      │    ├── OrderNotCached
      │    ├── OrderImmediatelyFillable
      │    ├── OrderNotFillable
      │    ├── DuplicateOrderId
      │    └── ContractUnavailable
      ├── NotSupported
      ├── InvalidProxySettings
      └── ExchangeClosedByUser
      └── OperationFailed
           ├── NetworkError
           │    ├── DDoSProtection
           │    ├── RateLimitExceeded
           │    ├── ExchangeNotAvailable
           │    │    └── OnMaintenance
           │    ├── InvalidNonce
           │    │    └── ChecksumError
           │    └── RequestTimeout
           ├── BadResponse
           │    └── NullResponse
           └── CancelPending
      └── UnsubscribeError
```

### Common Error Codes

#### Binance-Specific Errors

```python
# From binance.py error mapping:
'-1000': OperationFailed
'-1001': OperationFailed
'-1002': AuthenticationError  # Not authorized
'-1003': RateLimitExceeded    # Weight limit exceeded
'-1004': OperationRejected    # Duplicate IP whitelist
'-1010': OperationFailed      # Unsupported order combo
'-1014': InvalidOrder         # Unsupported order combination
'-1015': RateLimitExceeded    # Too many new orders
'-1021': InvalidNonce         # Time sync issue
'-1022': AuthenticationError  # Invalid signature
'-1108': BadSymbol            # Invalid asset
'-2010': InvalidOrder         # Generic order rejection
'-2011': OrderNotFound        # Unknown order
'-2013': OrderNotFound        # Order does not exist
'-2014': AuthenticationError  # API-key format invalid
'-2015': AuthenticationError  # Invalid API-key, IP, or permissions
```

#### Bybit-Specific Errors

```python
# From bybit.py error mapping:
# Common numeric codes:
'-1': OperationFailed
# 4xxx series - Order/position errors
'-4000': InvalidOrder
'-4016': BadRequest  # Price higher than max price
'-4022': BadRequest  # Wrong market status
'-4023': BadRequest  # Qty not increased by step size
'-4027': BadRequest  # Invalid account type
'-4028': BadRequest  # Invalid leverage
'-4045': InsufficientFunds  # Cross balance insufficient
'-4050': InsufficientFunds  # Isolated balance insufficient
'-4138': BadRequest  # Reduce-only must be True with closePosition
'-4142': OrderImmediatelyFillable  # Stop order triggers immediately

# String messages:
'System is under maintenance.': OnMaintenance
'Too many requests. Please try again later.': RateLimitExceeded
'Account has insufficient balance': InsufficientFunds
'Order would trigger immediately.': OrderImmediatelyFillable
'Rest API trading is not enabled.': PermissionDenied
'This action is disabled on this account.': AccountSuspended
```

### Try-Except Pattern

```python
import ccxt

try:
    exchange = ccxt.binance({
        'apiKey': '...',
        'secret': '...',
    })
    balance = exchange.fetch_balance()
except ccxt.AuthenticationError as e:
    print(f"Authentication failed: {e}")
    # Check API keys, IP whitelist, permissions
except ccxt.RateLimitExceeded as e:
    print(f"Rate limit exceeded: {e}")
    # Reduce request frequency, implement backoff
except ccxt.InsufficientFunds as e:
    print(f"Insufficient balance: {e}")
    # Check account balance
except ccxt.InvalidOrder as e:
    print(f"Invalid order parameters: {e}")
    # Check symbol, amount, price, precision
except ccxt.ExchangeNotAvailable as e:
    print(f"Exchange unavailable: {e}")
    # Check connectivity, maintenance status
except ccxt.NetworkError as e:
    print(f"Network error: {e}")
    # Check internet connection, proxy settings
except ccxt.ExchangeError as e:
    print(f"Exchange error: {e}")
    # Generic exchange error
except Exception as e:
    print(f"Unexpected error: {e}")
```

---

## 12. Proxy Configuration

### Setting Proxies

```python
import ccxt

# Method 1: Constructor
exchange = ccxt.binance({
    'apiKey': '...',
    'secret': '...',
    'proxies': {
        'http': 'http://user:password@host:port',
        'https': 'http://user:password@host:port',
    }
})

# Method 2: Direct attributes
exchange.httpProxy = 'http://127.0.0.1:7890'
exchange.httpsProxy = 'http://127.0.0.1:7890'

# SOCKS proxy (for Shadowsocks, V2Ray, etc.)
exchange.socksProxy = 'socks5://127.0.0.1:1080'

# For WebSocket connections (CCXT Pro), SOCKS often more reliable
```

### Important Notes

- **Regional Restrictions**: Binance/Bybit block certain jurisdictions (e.g., US). Use proxy in allowed region.
- **Latency**: Choose proxy geographically close to exchange servers (Tokyo, Singapore, Hong Kong).
- **SSL Verification**: `verify=True` by default. Set `verify=False` to disable (not recommended).

---

## 13. WebSocket Streaming (Real-Time Data)

CCXT Pro provides WebSocket support via `asyncio` in Python.

```python
import asyncio
import ccxt.pro as ccxt  # Note: use 'ccxt.pro' namespace

async def stream_data():
    exchange = ccxt.binance({
        'apiKey': '...',
        'secret': '...',
        'enableRateLimit': True,
    })
    
    # Public streams (no auth)
    while True:
        try:
            ticker = await exchange.watch_ticker('BTC/USDT')
            print(f"Price: {ticker['last']}")
            
            order_book = await exchange.watch_order_book('BTC/USDT')
            print(f"Best bid: {order_book['bids'][0]}")
            
            trades = await exchange.watch_trades('BTC/USDT')
            print(f"Latest trade: {trades[-1]['price']}")
            
            ohlcv = await exchange.watch_ohlcv('BTC/USDT', timeframe='1m')
            print(f"Candle: {ohlcv[-1]}")
            
        except ccxt.BaseError as e:
            print(f"Error: {e}")
            await asyncio.sleep(1)
    
    await exchange.close()

async def main():
    # Stream multiple exchanges concurrently
    await asyncio.gather(
        stream_binance(),
        stream_bybit(),
    )

asyncio.run(main())
```

**Private Streams** (account updates):
```python
# Requires authentication
while True:
    balance = await exchange.watch_balance()
    orders = await exchange.watch_orders('BTC/USDT')
    positions = await exchange.watch_positions(['BTC/USDT:USDT'])
```

**Multi-symbol optimization**:
```python
# Subscribe to multiple symbols efficiently
tickers = await exchange.watch_tickers(['BTC/USDT', 'ETH/USDT', 'XRP/USDT'])
```

---

## 14. Testnet / Sandbox Mode

### Binance Testnet

```python
exchange = ccxt.binance({
    'apiKey': 'YOUR_TESTNET_API_KEY',
    'secret': 'YOUR_TESTNET_SECRET',
})
exchange.set_sandbox_mode(True)  # Enables testnet endpoints

# URLs used:
# - Spot: https://testnet.binance.vision/api/v3
# - Futures (USDT): https://testnet.binancefuture.com/fapi/v1
# - Futures (Coin): https://testnet.binancefuture.com/dapi/v1
```

### Bybit Testnet

```python
exchange = ccxt.bybit({
    'apiKey': 'YOUR_TESTNET_API_KEY',
    'secret': 'YOUR_TESTNET_SECRET',
})
exchange.set_sandbox_mode(True)  # or: config['sandbox'] = True

# URLs used:
# - Spot: https://api-testnet.bybit.com
# - Futures: https://api-testnet.bybit.com
```

**Note**: Testnet credentials are separate from mainnet. Get testnet API keys from exchange testnet signup pages.

---

## 15. Key Implementation Notes

### 1. Market Loading

Always load markets before trading:
```python
exchange = ccxt.binance()
markets = exchange.load_markets()  # Synchronous
# or for async: await exchange.load_markets()
```

### 2. Symbol Validation

```python
# Check if symbol exists
if 'BTC/USDT' in exchange.markets:
    market = exchange.markets['BTC/USDT']
    print(f"Min amount: {market['limits']['amount']['min']}")
    print(f"Price precision: {market['precision']['price']}")
```

### 3. Amount/Price Precision

CCXT automatically normalizes amounts to exchange precision:
```python
# Use `amount_to_precision()` to format correctly
amount = exchange.amount_to_precision('BTC/USDT', 0.123456789)
# Returns: '0.12345679' (8 decimal places for BTC)

price = exchange.price_to_precision('BTC/USDT', 50000.123)
# Returns: '50000.12' (2 decimal places for USDT pairs)
```

### 4. Fetching With Pagination

Some endpoints support automatic pagination:
```python
# Fetch all closed orders (auto-paginate)
all_orders = exchange.fetch_closed_orders(
    symbol='BTC/USDT',
    limit=None,
    params={'paginate': True}
)
```

### 5. Implicit vs Explicit Methods

CCXT generates methods dynamically based on exchange API:
```python
# These are generated from the ImplicitAPI definitions:
exchange.publicGetV5MarketTickers()  # Bybit public ticker endpoint
exchange.privateGetV5AccountWalletBalance()  # Bybit balance endpoint
```

**Use unified methods** (`fetch_ticker`, `fetch_balance`) for cross-exchange compatibility.

---

## 16. Important Limitations & Gotchas

### Binance-Specific

1. **Leverage Brackets**: Different symbols have different max leverage tiers. Use `fetch_market_leverage_tiers()` or `fetch_leverage_tiers()` to query.
2. **Position Mode**: Binance requires setting position mode (`one-way` vs `hedge`) before placing orders. Use `set_position_mode()`.
3. **Timestamp Offset**: If you get `InvalidNonce (-1021)`, sync system clock or adjust `options['adjustForTimeDifference']`.
4. **Weight Management**: Heavy endpoints like `fetchTickers()` should be called sparingly (≤ once per 10-15 seconds).
5. **ClosePosition**: Binance's `closePosition` is not fully unified; use `create_order()` with `reduceOnly=True` instead.

### Bybit-Specific

1. **Default Swap**: Bybit defaults to `swap` mode. For spot, explicitly set `options['defaultType'] = 'spot'`.
2. **Position Index**: For hedge mode, must pass `positionIdx` in params:
   - `0` = one-way mode (default)
   - `1` = buy-side hedge
   - `2` = sell-side hedge
3. **USDC Perpetuals**: Different symbols (e.g., `BTC/USD:USDC`). Set `defaultSettle='USDC'`.
4. **Stop Orders**: Require additional params:
   ```python
   exchange.create_order('BTC/USDT:USDT', 'limit', 'buy', 1, 50000, {
       'stopPrice': 48000,  # trigger price
       'basePrice': 50000,   # current market price
       'positionIdx': 0,
   })
   ```
5. **Funding Rate**: Bybit marks `fetch_funding_rate` as emulated. For precise funding, use `fetch_funding_rates()`.
6. **Order Fetches**: `fetch_orders()` is not supported; use `fetch_open_orders()` or `fetch_closed_orders()` individually.

---

## 17. Example: Complete Trading Bot Setup

```python
import ccxt
import time
import os

class ExchangeManager:
    def __init__(self, exchange_id, api_key, secret, testnet=False):
        self.exchange_id = exchange_id
        self.api_key = api_key
        self.secret = secret
        self.testnet = testnet
        
        # Initialize
        exchange_class = getattr(ccxt, exchange_id)
        self.exchange = exchange_class({
            'apiKey': api_key,
            'secret': secret,
            'enableRateLimit': True,
            'verbose': False,  # Set True for debugging
        })
        
        if testnet:
            self.exchange.set_sandbox_mode(True)
        
        # Exchange-specific config
        if exchange_id == 'binance':
            self.exchange.options['defaultType'] = 'spot'
        elif exchange_id == 'bybit':
            self.exchange.options['defaultType'] = 'swap'
            self.exchange.options['defaultSubType'] = 'linear'
        
        # Load markets
        self.exchange.load_markets()
    
    def get_balance(self, currency=None):
        try:
            balance = self.exchange.fetch_balance()
            if currency:
                return balance[currency]
            return balance
        except Exception as e:
            print(f"Error fetching balance: {e}")
            return None
    
    def get_ticker(self, symbol):
        try:
            return self.exchange.fetch_ticker(symbol)
        except Exception as e:
            print(f"Error fetching ticker: {e}")
            return None
    
    def place_order(self, symbol, side, order_type, amount, price=None, params=None):
        try:
            order = self.exchange.create_order(
                symbol=symbol,
                type=order_type,
                side=side,
                amount=amount,
                price=price,
                params=params or {}
            )
            return order
        except ccxt.InsufficientFunds:
            print("Insufficient funds")
        except ccxt.InvalidOrder as e:
            print(f"Invalid order: {e}")
        except Exception as e:
            print(f"Error placing order: {e}")
        return None
    
    def cancel_order(self, order_id, symbol):
        try:
            return self.exchange.cancel_order(order_id, symbol)
        except Exception as e:
            print(f"Error canceling order: {e}")
            return None
    
    def get_open_orders(self, symbol=None):
        try:
            return self.exchange.fetch_open_orders(symbol)
        except Exception as e:
            print(f"Error fetching open orders: {e}")
            return []
    
    def get_position(self, symbol=None):
        """Fetch current position (futures only)"""
        if self.exchange_id == 'bybit':
            self.exchange.options['defaultType'] = 'swap'
        try:
            positions = self.exchange.fetch_positions([symbol] if symbol else None)
            return positions
        except Exception as e:
            print(f"Error fetching positions: {e}")
            return []
    
    def set_leverage(self, leverage, symbol):
        try:
            return self.exchange.set_leverage(leverage, symbol)
        except Exception as e:
            print(f"Error setting leverage: {e}")
            return None

# Usage
if __name__ == '__main__':
    # Binance Spot
    binance = ExchangeManager(
        exchange_id='binance',
        api_key=os.getenv('BINANCE_API_KEY'),
        secret=os.getenv('BINANCE_SECRET'),
        testnet=True
    )
    
    balance = binance.get_balance('USDT')
    print(f"USDT Balance: {balance}")
    
    ticker = binance.get_ticker('BTC/USDT')
    print(f"BTC Price: {ticker['last']}")
    
    # Bybit Swap
    bybit = ExchangeManager(
        exchange_id='bybit',
        api_key=os.getenv('BYBIT_API_KEY'),
        secret=os.getenv('BYBIT_SECRET'),
        testnet=True
    )
    
    position = bybit.get_position('BTC/USDT:USDT')
    print(f"Current position: {position}")
```

---

## 18. File References (CCXT Repository)

### Core Implementation Files

- **Base Exchange Class**: `/python/ccxt/base/exchange.py`
- **Error Definitions**: `/python/ccxt/base/errors.py`
- **Binance Impl**: `/python/ccxt/binance.py` (generated from TS)
- **Bybit Impl**: `/python/ccxt/bybit.py` (generated from TS)
- **Binance Abstract**: `/python/ccxt/abstract/binance.py` (source)
- **Bybit Abstract**: `/python/ccxt/abstract/bybit.py` (source)

### Documentation

- **Main Manual**: `/wiki/Manual.md`
- **Examples**: `/wiki/examples/` and `/examples/py/`
- **Bybit Examples**: `/wiki/examples/py/bybit-updated.md`
- **Contributing**: `/CONTRIBUTING.md`

### Async Support

- **Python Async**: `/python/ccxt/async_support/`
- **CCXT Pro Manual**: `/wiki/ccxt.pro.manual.md`

---

## 19. Summary Checklist for Integration

- [ ] **Install**: `pip install ccxt` (or language equivalent)
- [ ] **Credentials**: Obtain API key + secret from exchange (testnet first)
- [ ] **Initialize**: `exchange = ccxt.<exchange_id>(config)`
- [ ] **Configure**: Set `defaultType` appropriately per exchange
- [ ] **Load Markets**: `exchange.load_markets()` at startup
- [ ] **Rate Limits**: Ensure `enableRateLimit=True`
- [ ] **Error Handling**: Wrap calls in try-except for key errors
- [ ] **Precision**: Use `amount_to_precision()` and `price_to_precision()`
- [ ] **Test**: Verify with simple balance/ticker fetch before trading
- [ ] **Sandbox**: Test with testnet/sandbox mode first

---

**Document Version**: Based on CCXT v4.5.37  
**Sources**: Official CCXT GitHub repository (`/tmp/pi-github-repos/ccxt/ccxt`)  
**Generated**: 2026-02-10
