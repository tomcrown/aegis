## What Aegis Is

Aegis is an autonomous on-chain risk management agent for Pacifica perpetuals. It monitors a user's margin health 24/7 and automatically places hedging counter-positions when their account approaches liquidation — without requiring any user action after setup.

**One-line summary:** If your SOL long is getting margin called, Aegis opens a SOL short before you get wiped.

It combines three data sources to make that decision intelligently:

1. **Pacifica REST API** — account margin ratio (cross_mmr), positions, equity
2. **Pacifica WebSocket** — live mark prices for every symbol
3. **Elfa AI API** — social sentiment scores, narratives, crash keyword detection

The hedge size is not fixed — it scales with how bearish sentiment is at that moment. Bearish = 75% hedge, Neutral = 50%, Bullish = 25%.

---

## The Single Most Important Concept: cross_mmr

Everything in the risk engine revolves around `cross_mmr`. Get this wrong and nothing makes sense.

**Pacifica's cross_mmr is inverted from what you'd expect:**

- `cross_mmr = 200%` → perfectly safe, well-capitalized
- `cross_mmr = 150%` → normal, healthy
- `cross_mmr = 110%` → danger zone, Aegis hedges here
- `cross_mmr = 100%` → **liquidation**. Account is wiped.

So **higher = safer, lower = more dangerous**. The liquidation floor is ~100%, not 0%.

**The frontend converts this to a 0–100 danger scale** for display:

```
dangerPct = 200 - cross_mmr_pct
```

- `cross_mmr=200` → `dangerPct=0` → green ring, PROTECTED
- `cross_mmr=110` → `dangerPct=90` → red ring, HEDGING
- `cross_mmr=100` → `dangerPct=100` → liquidated

**Known Pacifica quirk:** Testnet sometimes returns `cross_mmr="0"` even when a position is open and margin is healthy. This is a Pacifica data issue — a real cross_mmr of 0 would mean already liquidated. The orchestrator now skips any cycle where `cross_mmr=0` with positions present, rather than treating it as danger. See `orchestrator.py:_evaluate_user`.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                  │
│  Privy auth → DashboardPage → 4 pages (Overview,         │
│  Protection, Intelligence, Vault)                         │
│  WebSocket client ← live WS events from backend          │
└─────────────────┬───────────────────────────────────────┘
                  │ REST + WebSocket
┌─────────────────▼───────────────────────────────────────┐
│                  Backend (FastAPI/Python)                  │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Orchestrator│  │  Risk Engine │  │ Execution Eng. │  │
│  │  (4 tasks)  │→ │  (pure logic)│→ │ (signs orders) │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│         │                                                  │
│  ┌──────▼──────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Pacifica WS │  │  Elfa AI     │  │  Vault Manager │  │
│  │  (prices)   │  │  (sentiment) │  │  (Redis ledger)│  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  Redis (sole database — all state lives here)             │
│  Pacifica REST API (account/positions every 500ms)        │
│  Pacifica WS (mark prices, persistent connection)         │
│  Elfa AI v2 API (sentiment, narratives, macro, news)      │
└─────────────────────────────────────────────────────────┘
```

---

## Backend: File-by-File

### `app/main.py`

Entry point. FastAPI app with lifespan that:

1. Connects to Redis
2. Bootstraps the Agent Key (from Redis or env on first run)
3. Creates `PacificaClient`, `VaultManager`, `Orchestrator`
4. Stores all on `app.state` so routes can access them via `request.app.state`
5. Starts the orchestrator (4 background tasks)

Routes registered:

- `/health` — liveness
- `/api/v1/onboarding` — approve-builder, bind-agent-key
- `/api/v1/account` — account info, positions, aegis activate/deactivate, status, threshold, demo-trigger
- `/api/v1/vault` — vault state, user shares
- `/api/v1/builder` — Pacifica builder trade history, leaderboard
- `/api/v1/sentiment` — per-symbol sentiment
- `/api/v1/intelligence` — all Elfa AI features
- `/ws` — WebSocket connections per wallet

### `app/core/config.py`

All settings via pydantic-settings. Reads `.env`. Key values:

- `PACIFICA_REST_URL` — default testnet, change for mainnet
- `PACIFICA_WS_URL` — default testnet WS
- `PACIFICA_API_CONFIG_KEY` — optional rate-limit key, injected as `PF-API-KEY` header
- `AGENT_KEY_PRIVATE_KEY_B58` — only needed first boot; after that it's in Redis encrypted
- `FERNET_MASTER_KEY` — **never lose this**. Encrypts agent key in Redis.
- `REDIS_URL` — must be persistent Redis
- `ELFA_API_KEY` — Elfa AI v2 key
- `builder_code` — hardcoded to `"AEGIS"` by a validator, cannot be overridden by env
- `cors_origins` — list, comma-separated in env, default `["http://localhost:5173"]`

`get_settings()` is `lru_cache`'d — one instance per process. Don't mutate it.

### `app/core/agent_key.py`

The Aegis Agent Key is an Ed25519 keypair that signs all orders on behalf of users.

**Bootstrap sequence (first run):**

1. `AGENT_KEY_PRIVATE_KEY_B58` is set in `.env`
2. On startup, decoded from base58 → 64-byte raw key
3. Encrypted with Fernet → stored in Redis at `aegis:agent_key:encrypted`
4. After this, the env var can be cleared

**Subsequent runs:** Decrypted from Redis, cached in-process as `_keypair_cache`. Never touches `.env` again.

`get_agent_keypair()` and `get_agent_pubkey()` are used by the execution engine everywhere.

### `app/core/encryption.py`

Simple Fernet symmetric encryption. `encrypt(bytes) → str`, `decrypt(str) → bytes`. Used only for the agent key.

### `app/services/orchestrator.py`

**The heartbeat of the entire system.** Manages 4 asyncio tasks:

1. **`ws_monitor`** — `PacificaWsMonitor.run()`. Persistent WebSocket to Pacifica for mark prices.

2. **`elfa_poller`** (every 60s) — fetches sentiment for all active users' symbols, detects drops ≥15 points, sends `alert` WS events, checks crash keywords.

3. **`macro_poller`** (every 30min) — calls `elfa.get_macro_context()` to refresh cached AI macro summary.

4. **`risk_loop`** (every 500ms) — the core loop:
   - Gets all active users from Redis
   - For each user: fetches account + positions from Pacifica REST
   - Caches last-good snapshot. Uses it as fallback for up to 30 consecutive Pacifica failures (~15s)
   - If `cross_mmr=0` with positions → skip (Pacifica bad data)
   - If no positions → broadcast `{cross_mmr_pct: 200, risk_tier: "safe"}`
   - Otherwise: runs risk engine → broadcasts `mmr_update` with mark prices → opens hedges → closes recovering hedges → alerts on WATCH tier

**Critical:** The `_sentiment_cache` dict is populated by the elfa poller and read by the risk loop. They share the same in-process dict. No locking needed — Python GIL + single-threaded asyncio.

### `app/services/risk/engine.py`

**Pure function, zero I/O.** Takes an `AccountSnapshot` + sentiment map, returns `RiskEngineOutput`.

**Thresholds:**

```python
_SAFE_THRESHOLD   = 150   # cross_mmr > this → SAFE
_WATCH_THRESHOLD  = 120   # cross_mmr ≤ this → WATCH
_HEDGE_THRESHOLD  = 110   # cross_mmr ≤ this → HEDGE
_RECOVER_THRESHOLD = 140  # cross_mmr > this while hedged → close hedges
```

**User threshold slider (50–95)** maps to: `effective_hedge_threshold = max(110, 200 - slider_value)`

- Slider at 75 → hedge at cross_mmr ≤ 125%
- Slider at 90 (conservative) → hedge at cross_mmr ≤ 140% (triggers much earlier)
- Slider at 50 (aggressive) → hedge at cross_mmr ≤ 150% (only hardcoded floor applies)

**Hedge multipliers by sentiment:**

- BEARISH (score < 35): 75% of position size
- NEUTRAL (35–65): 50%
- BULLISH (> 65): 25%

**Recovery:** If cross_mmr rises above `effective_recover_threshold` while hedges are open → close all hedges.

**Preemptive hedge logic exists but is partially implemented** — the code detects bearish score < 30 at cross_mmr ≤ 115%, but the override branch is empty (doesn't actually change anything yet).

### `app/services/pacifica/client.py`

Async httpx client. Single instance, connection-pooled. Key behaviors:

- 4 retries with exponential backoff on 5xx and network errors
- 429 handling: respects `Retry-After` header
- Only first retry attempt logs WARNING; subsequent retries are DEBUG (to reduce noise)
- `PacificaError` raised on 4xx
- All responses unwrapped from `{success, data, error, code}` wrapper via `_unwrap()`
- `builder_code="AEGIS"` is validated before any order call — method raises if missing

**Signing:** All order payloads are built by `signing.py` before being passed here. This client does NOT sign — it just POSTs.

### `app/services/pacifica/signing.py`

**Critical — get this wrong and all orders fail.**

Pacifica signing spec:

1. Build header: `{type, timestamp, expiry_window}`
2. Build payload dict of operation fields
3. Merge: `{...header, data: payload}` — the `data:` wrapper is required
4. Sort all keys recursively
5. `json.dumps(sorted, separators=(",",":"), ensure_ascii=True)` — compact, ASCII-safe
6. Sign UTF-8 encoded bytes with Ed25519 keypair
7. base58-encode the 64-byte signature
8. POST body = flat merge of header fields + payload fields + account + agent_wallet + signature (**no `data:` wrapper in POST body**)

The signed message has `data:{}` but the POST body does NOT. Common confusion point.

`expiry_window` is in milliseconds. Pacifica validates that `now - timestamp < expiry_window`. If the user takes longer than this to sign (e.g. Phantom popup delay), the signature is rejected. Use 30000ms (30s).

### `app/services/pacifica/ws_monitor.py`

Persistent WebSocket to Pacifica. Subscribes to `prices` channel (no auth needed). Stores mark prices in Redis with 30s TTL: `aegis:prices:{SYMBOL}`. Heartbeat ping every 30s. Reconnects with backoff on any failure.

`get_mark_price(symbol)` → reads from Redis, returns string or None.

### `app/services/execution/engine.py`

Converts `HedgeDecision` → signed Pacifica market order. Converts `RecoveryDecision` → signed cancel order.

**Always:**

- `builder_code = "AEGIS"` — hardcoded, cannot be passed differently
- `agent_wallet` = agent key pubkey
- Places a stop-loss order immediately after every hedge (3% adverse move from mark price)
- Stop-loss is non-fatal: if it fails, hedge is still open and logged

Slippage: 0.5% on all hedge market orders.

### `app/services/elfa/client.py`

Elfa AI v2 client. All endpoints Redis-cached to minimize credit usage (~460 credits/day estimated vs 20,000 available).

| Method                      | Endpoint                                    | Cache TTL |
| --------------------------- | ------------------------------------------- | --------- |
| `get_sentiment_batch`       | `/trending-tokens` (change_percent → score) | 65s       |
| `check_crash_keywords`      | `/trending-tokens` filtered                 | 10min     |
| `get_trending_narratives`   | `/trending-narratives`                      | 30min     |
| `get_trending_cas`          | `/trending-cas`                             | 30min     |
| `get_token_news`            | `/data/top-mentions`                        | 10min     |
| `get_macro_context`         | `/v2/chat` (analysisType: macro)            | 30min     |
| `get_hedge_narrative`       | `/v2/chat` (analysisType: tokenAnalysis)    | 5min      |
| `get_intelligence_snapshot` | aggregates all above                        | —         |

**Elfa API response shape gotchas:**

- `trending-narratives`: data is at `body["data"]["trending_narratives"]` — NOT `body["data"]["data"]`
- `trending-cas`: data is at `body["data"]` directly (a list) — NOT nested further
- `top-mentions`: returns engagement metadata only (no tweet text). Fields: `link, author, timestamp, like_count, repost_count, view_count`
- `/v2/chat` macro context returns raw markdown with Elfa tool reference links like `[get-macro-breakdown](url)` — these are stripped by the frontend `MarkdownBlock` component

Sentiment score derivation: Elfa doesn't return a 0–100 score directly. We derive it from `change_percent` of trending token mentions: `score = clamp(50 + change_percent / 2, 0, 100)`. Sentiment bucket: score < 35 = BEARISH, 35–65 = NEUTRAL, > 65 = BULLISH.

### `app/services/vault/manager.py`

Redis-backed ledger. **Redis is the only database — no SQL, no files.**

Redis key schema:

```
aegis:vault:tvl                      → string decimal (total USDC protected)
aegis:vault:shares:{wallet}          → JSON VaultShare
aegis:vault:hedges:{wallet}:{symbol} → order_id string
aegis:users:active                   → SET of active wallet addresses
aegis:users:config:{wallet}          → JSON {threshold, activated_at}
aegis:agent_key:encrypted            → Fernet-encrypted agent key bytes
aegis:prices:{SYMBOL}                → mark price string (30s TTL)
aegis:sparkline:{wallet}             → list of last 60 cross_mmr readings
aegis:elfa:prev_score:{symbol}       → previous sentiment score (300s TTL)
aegis:elfa:sentiment:{symbol}        → cached sentiment JSON
aegis:elfa:keywords:{symbol}         → cached crash check result
aegis:elfa:narratives                → cached narratives
aegis:elfa:macro                     → cached macro context string
aegis:elfa:cas:{platform}            → cached trending CAs
aegis:elfa:news:{symbol}             → cached token news
aegis:elfa:hist:{symbol}             → list of historical sentiment scores
```

Premium: 0.1% (10 bps) of total position notional at activation time. Stored as vault share for future yield distribution (yield tracking is `TODO: post-hackathon`).

`get_user_threshold(wallet)` → reads `aegis:users:config:{wallet}`, returns `threshold` int (default 75).
`update_user_threshold(wallet, threshold)` → updates config without resetting vault share.

---

## Frontend: File-by-File

### `src/main.tsx`

Providers stack (outermost → innermost):
`PrivyProvider` → `WalletProvider` (Solana adapter) → `ConnectionProvider` → `QueryClientProvider` → `App`

### `src/hooks/useSolanaWallet.ts`

**Always use this hook, never `useWallet()` directly.** Handles two auth paths:

1. Native wallet adapter (Phantom, Solflare) — checked first
2. Privy embedded wallet (email/Twitter login) — fallback

Returns `{ address, wallet, signMessage }`. `signMessage` is undefined on the Privy path.

### `src/stores/useAegisStore.ts`

Zustand store. All live state:

- `riskState` — `{crossMmrPct, tier, aegisActive, threshold}`. `crossMmrPct` is 0–100 danger scale (0=safe, 100=liq).
- `positions` — current open positions
- `sentimentMap` — `{symbol: SentimentData}`
- `markPrices` — `{symbol: number}` live from WS, updated every 500ms
- `activityLog` — last 50 WS events (hedge_opened, hedge_closed, alert)
- `devMode` — `{enabled, simulatedPriceDrop}`

### `src/hooks/useAegisWebSocket.ts`

WebSocket client. Connects to `${VITE_WS_URL}/{wallet}`. Handles:

- `mmr_update` → updates `riskState` and `markPrices` in store (skipped if devMode enabled)
- `hedge_opened`, `hedge_closed`, `alert` → adds to `activityLog`, dispatches `aegis:ws-event` CustomEvent
- Exponential backoff reconnect
- 25s heartbeat ping

### `src/lib/signing.ts`

Mirrors backend `canonical_json()`. Sorts keys recursively, produces compact JSON. Used by onboarding and `ApiSetupCard` in VaultPage.

### `src/services/api.ts`

All HTTP calls. Groups: `accountApi`, `vaultApi`, `builderApi`, `sentimentApi`, `intelligenceApi`, `onboardingApi`.

Key calls:

- `accountApi.getAegisStatus(wallet)` → `{active, threshold}` — called on dashboard mount to restore state
- `accountApi.activateAegis(wallet, threshold)` → adds to Redis active set
- `accountApi.updateThreshold(wallet, threshold)` → PATCH, debounced from slider
- `accountApi.demoTriggerHedge(wallet)` → dev mode only, forces a hedge order

### Page Structure

**`DashboardPage`** — shell. Loads aegis status on mount, renders one of 4 pages based on `page` state. Passes `onNavigate` to `AppNav`.

**`OverviewPage`** — SafetyScoreCard (ring meter + sparkline), AccountValueCard, AegisStatusCard, PositionSummaryCard.

**`ProtectionPage`** — HedgeControls (toggle + threshold slider with debounced PATCH save), HedgeMultiplierInfo (explains 75/50/25%), ActivityLog (real-time from `activityLog` store, shows AI narrative).

**`IntelligencePage`** — MacroContextCard (TL;DR + collapsible full markdown), NarrativesCard, CrashAlertsCard, TokenNewsCard, SentimentHistoryCard (SVG sparkline), TrendingTokensCard, OnChainSignalsCard.

**`VaultPage`** — ProtocolStats, UserPosition, OnChainActivity (builder trade history), ApiSetupCard (generates Pacifica API Config Key), HowItWorks.

### `src/components/shared/RingMeter.tsx`

Takes `pct` 0–100 (danger scale). 0 = green PROTECTED, 80+ = amber WATCH, 90+ = red DANGER. Animated SVG ring.

### `src/components/shared/MarkdownBlock.tsx`

Lightweight markdown renderer for Elfa macro context. Strips Elfa tool reference links (`[text](url)`). Renders `##` headers, `###` subheaders, `---` dividers, `- ` bullets, `**bold**`.

### `src/components/dashboard/LiquidationGuard.tsx`

Shows per-position liquidation distance. Now uses live mark price from `markPrices` store (updated every 500ms via WS) instead of static entry price. Falls back to entry price if no mark price yet. Label switches from "Entry" to "Mark Price" with a pulse dot when live data is flowing.

---

## Onboarding Flow

Two signature steps, both user-signed (NOT agent-signed):

**Step 1: Approve Builder Code**

- Type: `"approve_builder_code"`
- Payload: `{builder_code: "AEGIS", max_fee_rate: "0.0005"}`
- Message signed: `canonical_json({type, expiry_window, timestamp, data: {builder_code, max_fee_rate}})`
- POST body (flat, no data wrapper): `{account, signature, timestamp, expiry_window, builder_code, max_fee_rate}`

**Step 2: Bind Agent Key**

- Type: `"bind_agent_wallet"`
- Payload: `{agent_wallet: <agent pubkey>}`
- Message signed: `canonical_json({type, expiry_window, timestamp, data: {agent_wallet}})`
- POST body: `{account, signature, timestamp, expiry_window, agent_wallet}`

**Critical signing rules:**

- `expiry_window = 30000` (30 seconds). Phantom popup can take >5s. Under 30s causes "Verification failed".
- The signed message MUST have `data: {}` nested wrapper
- The POST body MUST NOT have `data:` wrapper — flat merge only
- Keys must be sorted alphabetically throughout the entire nested structure
- JSON must be compact (no whitespace), ASCII-safe

**Onboarding completion:** `localStorage.setItem("aegis:onboarded", "true")` — checked on app load to skip the flow.

---

## WebSocket Event Schema

Backend → Frontend via `/ws/{wallet}`:

```typescript
// Every 500ms
{ type: "mmr_update", wallet, timestamp_ms, payload: {
    cross_mmr_pct: number,   // raw from Pacifica (e.g. 134.5)
    risk_tier: "safe"|"watch"|"hedge",
    cross_mmr: string,
    mark_prices?: Record<string, number>,  // live prices for all open positions
    no_positions?: boolean,
}}

// When hedge fires
{ type: "hedge_opened", wallet, timestamp_ms, payload: {
    symbol, order_id, amount, side, sentiment, cross_mmr, narrative
}}

// When account recovers
{ type: "hedge_closed", wallet, timestamp_ms, payload: {
    symbol, order_id
}}

// Alerts
{ type: "alert", wallet, timestamp_ms, payload: {
    kind: "watch_tier"|"sentiment_drop"|"crash_keywords",
    message: string,
    // + kind-specific fields
}}
```

---

## Dev Mode

Toggle in AppNav. When enabled:

- WS `mmr_update` events are ignored — store is NOT updated from real backend
- `useDevModeSimulation` hook drives the ring using a simulated price drop value
- Demo trigger button appears in ProtectionPage — calls `POST /api/v1/account/aegis/demo-trigger`
- Demo trigger forces a real hedge order on Pacifica testnet regardless of actual cross_mmr

---

## Environment Variables

### Backend (`.env`)

```
PACIFICA_REST_URL=https://test-api.pacifica.fi/api/v1
PACIFICA_WS_URL=wss://test-ws.pacifica.fi/ws
PACIFICA_API_CONFIG_KEY=           # optional, generated via Vault tab
AGENT_KEY_PRIVATE_KEY_B58=         # base58 64-byte Ed25519 key, bootstrap only
FERNET_MASTER_KEY=                 # NEVER LOSE THIS
REDIS_URL=redis://localhost:6379/0
ELFA_API_KEY=elfak_...
FUUL_API_KEY=                      # optional referral tracking
FUUL_TRIGGER_KEY=                  # backend-only Fuul key
CORS_ORIGINS=http://localhost:5173  # comma-separated for multiple
LOG_LEVEL=INFO
```

### Frontend (`.env` / Vite)

```
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_PRIVY_APP_ID=...
```

---

## Known Issues / Gotchas

1. **`cross_mmr=0` on testnet** — Pacifica testnet returns zero cross_mmr even with open positions. The orchestrator skips these cycles. Not a bug in Aegis.

2. **Privy path has no `signMessage`** — If user logs in via email/Twitter (Privy embedded wallet), `signMessage` is undefined. The onboarding signing falls back to `wallet?.signMessage?.bind(wallet)`. API Config Key generation button is disabled on this path.

3. **Preemptive hedge is incomplete** — The code in `risk/engine.py` detects bearish sentiment at 115% cross_mmr but the override block is empty. This feature is partially stubbed.

4. **Yield tracking is not implemented** — `VaultManager.credit_yield()` exists but is never called. The vault share shows `yield_earned: "0"` always. Marked `TODO: post-hackathon`.

5. **`liquidation_price` not on Position type in TS** — Some older components (PositionsTable, LiquidationGuard) reference `pos.liquidation_price` which causes TypeScript errors. The Pydantic model does have this field; the TS type just hasn't been updated to include it. Cast or add it to `types/index.ts`.

6. **Render/hosting:** Free-tier hosting that spins down is incompatible with Aegis. The risk loop MUST run continuously. Use Railway, Fly.io, or a local machine with ngrok.

7. **Redis MUST be persistent.** All user data (vault shares, active users, agent key) lives in Redis. If Redis is ephemeral and restarts, all users are de-registered and the agent key is gone.

8. **`get_settings()` is cached** — Modifying settings at runtime (like the API Config Key endpoint does) modifies the cached instance. This is intentional but means you can't reload settings by calling `get_settings()` again. The live client headers are patched directly: `pacifica._client.headers.update({"PF-API-KEY": api_key})`.

---

## Running Locally

```bash
# Backend
cd backend
/opt/homebrew/bin/python3.11 -m uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm run dev
```

Redis must be running: `redis-server` (or use Upstash URL in `.env`).

Backend auto-reloads on file changes via WatchFiles.

---

## Deployment Checklist

- [ ] Change `PACIFICA_REST_URL` to mainnet
- [ ] Change `PACIFICA_WS_URL` to mainnet
- [ ] Change `VITE_WS_URL` to `wss://` (not `ws://`)
- [ ] Set `CORS_ORIGINS` to production frontend domain
- [ ] Use persistent Redis (Upstash free tier works)
- [ ] Back up `FERNET_MASTER_KEY` — losing it = losing agent key
- [ ] Set `AGENT_KEY_PRIVATE_KEY_B58` on first deploy, clear after first boot
- [ ] Generate Pacifica API Config Key post-deploy (Vault tab → Rate Limit Key)
- [ ] Test full onboarding flow on mainnet before announcing
