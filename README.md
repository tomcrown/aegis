# Aegis

**Autonomous liquidation protection for Pacifica perpetuals traders.**

Aegis monitors your open positions on Pacifica every 1.5 seconds, reads live social sentiment from Elfa AI, and automatically places hedge orders — signed by a delegated Ed25519 agent key — before your margin ratio ever reaches liquidation. No alerts. No manual action. Actual execution.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                          Aegis Engine                           │
│                                                                 │
│  Phantom Wallet                                                 │
│       │                                                         │
│       ▼                                                         │
│  Onboarding Flow ──► Approve Builder Code (AEGIS)               │
│       │              Bind Ed25519 Agent Key                     │
│       │                                                         │
│       ▼                                                         │
│  Orchestrator (background tasks)                                │
│  ├── WS Monitor ────► Pacifica WebSocket ──► mark prices        │
│  ├── Elfa Poller ───► Elfa AI v2 API ─────► sentiment / alerts  │
│  ├── Macro Poller ──► Elfa AI chat ────────► market climate     │
│  └── Risk Loop (1.5s)                                           │
│       ├── Fetch positions + account via Pacifica REST           │
│       ├── Compute synthetic cross_mmr from mark prices          │
│       ├── Classify tier: SAFE / WATCH / HEDGE                   │
│       ├── Sentiment-adjust hedge size (25% / 50% / 75%)         │
│       ├── Place hedge order ──► Pacifica (signed by Agent Key)  │
│       ├── Auto-recover: close hedges when margin improves       │
│       └── Push real-time updates ──► Frontend WebSocket         │
└─────────────────────────────────────────────────────────────────┘
```

### Three Steps Between You and Liquidation

| Step        | What Happens                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monitor** | The risk loop reads your Pacifica positions every 1.5 seconds and derives your real-time margin ratio from live mark prices.                                                |
| **Analyse** | Elfa AI social sentiment adjusts the hedge size — bearish signals trigger larger hedges, bullish signals lighter ones. Crash keywords on Twitter trigger preemptive alerts. |
| **Protect** | Aegis places a real opposing-side order on Pacifica, signed by your delegated Agent Key. When your margin recovers, Aegis closes the hedge automatically.                   |

---

## Features

- **Autonomous hedging** — HEDGE tier triggers real order placement with no user intervention
- **Sentiment-adjusted sizing** — bearish → 75%, neutral → 50%, bullish → 25% of position delta
- **Preemptive crash detection** — Elfa crash keyword monitoring across Twitter triggers alerts before price moves
- **Auto-recovery** — open hedges are closed automatically when margin ratio improves
- **Configurable threshold** — users set their own hedge trigger level via a slider (50–95%)
- **Real-time WebSocket feed** — risk tier, margin ratio, hedge events, and alerts streamed to the frontend
- **Sparkline history** — rolling 60-reading margin ratio chart on the dashboard
- **Intelligence page** — macro context, trending narratives, token news, sentiment history, trending contract addresses
- **Vault ledger** — on-chain-verifiable vault with TVL, per-user share fractions, and yield tracking
- **Ed25519 Agent Key** — dedicated signing keypair with zero withdrawal permissions
- **Builder Code tagging** — every hedge order is tagged `builder_code=AEGIS` on Pacifica for verifiability

---

## Security Model

| Property                  | Detail                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zero custody**          | The Agent Key can only place hedge orders. It cannot withdraw funds, transfer assets, or do anything outside hedging.                                |
| **Delegated signing**     | Your Phantom wallet signs once during onboarding. All subsequent hedge orders are signed by the Agent Key — your main wallet is never touched again. |
| **Encrypted storage**     | The Agent Key private key is encrypted with AES-128 (Fernet) and stored in Redis. Never logged, never exposed in API responses.                      |
| **Reduce-only exits**     | Hedge close orders use reduce-only mode — Aegis can only close what it opened.                                                                       |
| **On-chain verification** | Every hedge placed by Aegis carries `builder_code=AEGIS` in the Pacifica trade record. You can audit every action independently.                     |

---

## Tech Stack

### Backend

- **Python 3.11** + **FastAPI** — async REST API and WebSocket server
- **asyncio** orchestrator — four concurrent background tasks (WS monitor, Elfa poller, macro poller, risk loop)
- **Redis** (Upstash) — vault ledger, session state, Elfa response cache
- **Pydantic v2** — typed models throughout; zero `dict` abuse
- **websockets** — persistent connection to Pacifica's price feed
- **Elfa AI v2** — sentiment, narratives, crash keywords, macro context, token news

### Frontend

- **React 18** + **TypeScript** + **Vite**
- **Zustand** — global risk state store
- **TanStack Query** — server state, polling, cache
- **Tailwind CSS** — custom design system (`aegis-*` tokens)
- **Phantom wallet** — Solana wallet adapter for onboarding and signing

---

## Project Structure

```
aegis/
├── backend/
│   └── app/
│       ├── api/
│       │   ├── routes/          # account, vault, builder, sentiment, intelligence
│       │   └── websocket/       # real-time event broadcast
│       ├── core/                # config, redis, encryption, agent key bootstrap
│       ├── models/              # Pydantic models (pacifica, risk, vault)
│       ├── services/
│       │   ├── orchestrator.py  # central task coordinator
│       │   ├── elfa/            # Elfa AI client (sentiment, narratives, crash, macro)
│       │   ├── execution/       # hedge order placement
│       │   ├── pacifica/        # REST client + WebSocket price monitor
│       │   ├── risk/            # pure deterministic risk engine
│       │   └── vault/           # Redis vault ledger
│       └── main.py              # FastAPI app + lifespan
└── frontend/
    └── src/
        ├── components/
        │   ├── dashboard/       # RingMeter, Sparkline, SentimentPanel, LiquidationGuard
        │   ├── layout/          # AppNav, AppSidebar
        │   ├── onboarding/      # OnboardingFlow (2-step key setup)
        │   └── shared/          # Badge, RingMeter, Sparkline, MarkdownBlock
        ├── hooks/               # useAegisWebSocket, usePhantomConnect, useSolanaWallet
        ├── pages/               # Landing, Overview, Protection, Intelligence, Vault
        ├── services/            # api.ts — typed fetch layer
        └── stores/              # useAegisStore, useVaultStore (Zustand)
```

---

## Getting Started

### Prerequisites

- Python 3.11
- Node.js 18+
- A running Redis instance (or [Upstash](https://upstash.com) free tier)
- [Phantom](https://phantom.app) wallet browser extension
- Elfa AI API key — [elfa.ai](https://elfa.ai)

### 1. Clone and install

```bash
git clone https://github.com/tomcrown/aegis.git
cd aegis
make install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Redis
REDIS_URL=redis://localhost:6379/0          # or your Upstash URL

# Elfa AI
ELFA_API_KEY=your_elfa_key
ELFA_BASE_URL=https://api.elfa.ai/v2

# Encryption (generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
FERNET_MASTER_KEY=your_fernet_key

# Pacifica (testnet defaults — no changes needed for dev)
PACIFICA_REST_URL=https://test-api.pacifica.fi/api/v1
PACIFICA_WS_URL=wss://test-ws.pacifica.fi/ws

# Optional — filled automatically after onboarding
PACIFICA_API_CONFIG_KEY=
AGENT_KEY_PUBLIC_KEY=
```

Create `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### 3. Run locally

```bash
# Backend (port 8000)
make backend

# Frontend (port 5173) — in a separate terminal
make frontend
```

Or both in parallel:

```bash
make dev
```

### 4. Onboarding

1. Open `https://aegis-hub.vercel.app/` and click **Launch App**
2. Connect your Phantom wallet
3. **Step 1** — approve the Aegis builder code signature (one-time)
4. **Step 2** — bind the Ed25519 Agent Key to your account
5. Set your hedge threshold and activate protection

---

## Risk Engine Logic

The risk engine is a pure function with no I/O. It classifies the account into one of three tiers based on the synthetic `cross_mmr` derived from live mark prices:

| cross_mmr             | Tier         | Action                          |
| --------------------- | ------------ | ------------------------------- |
| > 140%                | **SAFE**     | Do nothing                      |
| 120–140%              | **WATCH**    | Alert only, no execution        |
| ≤ 110%                | **HEDGE**    | Place opposing-side hedge order |
| > 140% (while hedged) | **Recovery** | Close all open hedges           |

Thresholds are overridden by the user's slider value (`50–95%`). A user who sets threshold to `80` triggers hedges at `cross_mmr ≤ 120%`.

Hedge size is adjusted by Elfa sentiment score:

| Sentiment | Score | Hedge Size            |
| --------- | ----- | --------------------- |
| Bearish   | < 35  | 75% of position delta |
| Neutral   | 35–65 | 50% of position delta |
| Bullish   | > 65  | 25% of position delta |

---

## Available Scripts

```bash
make install          # install all backend and frontend dependencies
make backend          # start FastAPI dev server (port 8000, hot reload)
make frontend         # start Vite dev server (port 5173)
make dev              # start both in parallel
make test             # run all tests (backend pytest + frontend vitest)
make test-unit        # backend unit tests only
make test-integration # backend integration tests only
make lint             # ruff (backend) + eslint (frontend)
```

---

## API Overview

| Method  | Endpoint                           | Description                     |
| ------- | ---------------------------------- | ------------------------------- |
| `GET`   | `/api/v1/account/info`             | Pacifica account snapshot       |
| `GET`   | `/api/v1/account/positions`        | Open positions                  |
| `POST`  | `/api/v1/account/aegis/activate`   | Activate Aegis protection       |
| `POST`  | `/api/v1/account/aegis/deactivate` | Deactivate protection           |
| `PATCH` | `/api/v1/account/aegis/threshold`  | Update hedge threshold          |
| `GET`   | `/api/v1/account/aegis/sparkline`  | Last 60 margin ratio readings   |
| `GET`   | `/api/v1/vault/state`              | Vault TVL + active protections  |
| `GET`   | `/api/v1/vault/share/:wallet`      | User vault share                |
| `GET`   | `/api/v1/intelligence/snapshot`    | Elfa full intelligence snapshot |
| `GET`   | `/api/v1/sentiment/:symbol`        | Per-symbol sentiment score      |
| `WS`    | `/ws/events/:wallet`               | Real-time risk events stream    |
