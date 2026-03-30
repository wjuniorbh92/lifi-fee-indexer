# LI.FI Fee Indexer

Multi-chain event indexer for the LI.FI `FeeCollector` smart contract. Scrapes `FeesCollected` events from **Polygon** and **Stellar Testnet**, stores them in MongoDB, and exposes a REST API for querying.

## Architecture

```text
                        +------------------+
                        |   Entry Points   |
                        |  index / scanner |
                        |    / server      |
                        +--------+---------+
                                 |
                  +--------------+--------------+
                  |                             |
         +--------v--------+          +--------v---------+
         | ScannerOrchestrator |      |    Fastify API    |
         |  (per-chain loop)   |      | /events  /health  |
         +--------+---------+         | /events/fetch     |
                  |                    | /docs  /metrics   |
                  |                    +--------+----------+
                  |                             |
         +--------v--------+           on-demand fetch
         |  ChainScanner   |<------------------+
         |  interface       |
         +---+----------+--+
             |          |
     +-------v--+  +----v-------+
     |EvmScanner|  |StellarScanner|
     |  (viem)  |  |(@stellar/sdk)|
     +----------+  +-------------+
                                               |
         +-------------------------------------+
         |           MongoDB (Typegoose)
         |  fee_events | sync_states
         +-------------------------------------+
```

### Scan Loop (per chain)

1. Load `SyncState` -> `fromBlock = lastSyncedBlock + 1` (or `config.startBlock`)
2. `latestSafe = getLatestPosition()` (minus confirmations for EVM)
3. If `fromBlock > latestSafe` -> sleep, goto 2
4. `toBlock = min(fromBlock + batchSize - 1, latestSafe)`
5. `events = getEvents(fromBlock, toBlock)`
6. `insertMany(events, { ordered: false })` -- E11000 duplicates silently ignored
7. Upsert `SyncState: lastSyncedBlock = toBlock` -- **ONLY after successful insert**
8. Goto 3

## Quick Start

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env if needed (defaults work for most setups)
docker-compose up -d
```

The app starts scanning from block 78,600,000 on Polygon and exposes the API on port 3000.

### Local Development

```bash
# Prerequisites: Node.js >= 20, pnpm, MongoDB running locally
pnpm install
cp .env.example .env

# Run scanner + API together
pnpm dev

# Or run them separately
pnpm scanner   # scanner only
pnpm server    # API only
```

### Live Demo Deployment (Tailscale Funnel)

> **Note:** This is not a production-grade deployment. It was chosen as the fastest path to a live, publicly accessible demo for this take-home challenge.

The app runs on a Linux VPS that doesn't have a domain name or public-facing reverse proxy. Instead of purchasing a domain + configuring nginx + provisioning TLS certificates, the project uses [Tailscale Funnel](https://tailscale.com/kb/1223/funnel/) -- a zero-config solution that exposes a local service to the internet over HTTPS with automatic TLS, no domain required.

**Why Tailscale Funnel over traditional deployment:**
- No domain purchase or DNS configuration needed
- Automatic HTTPS/TLS (Let's Encrypt under the hood)
- Single Docker container as a sidecar -- no nginx, no Caddy, no certbot
- The VPS already runs Tailscale for SSH access, so Funnel is one config file away

```bash
cp .env.prod.example .env.prod
# Edit .env.prod: set TS_AUTH_KEY, MONGO_PASSWORD, POLYGON_RPC_URL

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

This starts three services:
- **tailscale** -- Sidecar container with Funnel enabled, exposes `https://<hostname>.ts.net`
- **app** -- Scanner + API (shares Tailscale's network stack via `network_mode: service:tailscale`)
- **mongodb** -- Authenticated MongoDB with persistent volume

**Live demo:** [https://lifi-fee-indexer.fossa-salmon.ts.net](https://lifi-fee-indexer.fossa-salmon.ts.net)

```bash
# Health check
curl https://lifi-fee-indexer.fossa-salmon.ts.net/health

# Query events
curl "https://lifi-fee-indexer.fossa-salmon.ts.net/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce"
```

For a real production system, you'd want: a proper domain, a managed database (MongoDB Atlas), log aggregation, Prometheus metrics, and alerting.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/lifi-fee-indexer` | MongoDB connection string |
| `POLYGON_RPC_URL` | Yes | `https://polygon-bor-rpc.publicnode.com` | Polygon JSON-RPC endpoint |
| `FEE_COLLECTOR_ADDRESS` | Yes | `0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9` | FeeCollector contract address |
| `STELLAR_HORIZON_URL` | No | `https://soroban-testnet.stellar.org` | Stellar Soroban RPC URL |
| `STELLAR_INTEGRATOR_ADDRESS` | No | _(empty)_ | Stellar contract address (enables Stellar scanner) |
| `BATCH_SIZE` | No | `2000` | Blocks per batch |
| `EVM_START_BLOCK` | No | `78600000` | Starting block for Polygon scanner |
| `POLL_INTERVAL_MS` | No | `10000` | Polling interval between scan cycles |
| `PORT` | No | `3000` | API server port |
| `HOST` | No | `0.0.0.0` | API server host |
| `LOG_LEVEL` | No | `info` | Log level (fatal/error/warn/info/debug/trace) |

### RPC Note

Block 78,600,000 is recent Polygon data (~late 2025). Free RPCs like `polygon-bor-rpc.publicnode.com` can serve it. For faster initial sync, use Alchemy, Infura, or Ankr free tier and set `POLYGON_RPC_URL` accordingly.

## API

### `GET /events`

Query indexed fee collection events.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `integrator` | Yes | Integrator address |
| `chainId` | No | Filter by chain (`polygon`, `stellar-testnet`) |
| `token` | No | Filter by token address |
| `fromBlock` | No | Minimum block number (inclusive) |
| `toBlock` | No | Maximum block number (inclusive) |
| `limit` | No | Results per page (1-1000, default: 100) |
| `offset` | No | Pagination offset (default: 0) |

**Response (Polygon):**

```json
{
  "data": [
    {
      "chainId": "polygon",
      "blockNumber": 78600150,
      "transactionHash": "0x...",
      "logIndex": 0,
      "token": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      "integrator": "0xe165726007b58dab2893f85e206f20388fa2f8ce",
      "integratorFee": "1000000",
      "lifiFee": "50000",
      "timestamp": "2026-01-15T12:00:00.000Z"
    }
  ],
  "pagination": { "total": 42, "limit": 100, "offset": 0 }
}
```

**Response (Stellar):**

```json
{
  "data": [
    {
      "chainId": "stellar-testnet",
      "blockNumber": 1748872,
      "transactionHash": "1863006ef7f4e4b85da048913692248088a46e75c4e77974f9f9d8ff63255add",
      "logIndex": 0,
      "token": "native",
      "integrator": "GB5FCYPSK4ET44OVBXLJHWFW5LNG3ZLPUFSJTJBCGIM43JIU4RGYRLCH",
      "integratorFee": "100",
      "lifiFee": "0",
      "timestamp": "2026-03-29T01:10:42.000Z"
    }
  ],
  "pagination": { "total": 10, "limit": 100, "offset": 0 }
}
```

### `POST /events/fetch`

On-demand event fetching — fetch events from unsynced block ranges directly from the RPC, store them in MongoDB, and return them in a single request. Useful when you need events from a range the background scanner hasn't reached yet.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `chainId` | Yes | Chain to fetch from (`polygon`, `stellar-testnet`) |
| `fromBlock` | Yes | Start block (inclusive) |
| `toBlock` | Yes | End block (inclusive, max range: 10,000) |

**Request:**

```bash
curl -X POST http://localhost:3000/events/fetch \
  -H 'Content-Type: application/json' \
  -d '{"chainId":"polygon","fromBlock":78600000,"toBlock":78600100}'
```

**Response:**

```json
{
  "data": [
    {
      "chainId": "polygon",
      "blockNumber": 78600050,
      "transactionHash": "0x...",
      "logIndex": 0,
      "token": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      "integrator": "0xe165726007b58dab2893f85e206f20388fa2f8ce",
      "integratorFee": "1000000",
      "lifiFee": "50000",
      "timestamp": "2026-01-15T12:00:00.000Z"
    }
  ],
  "meta": { "chainId": "polygon", "fromBlock": 78600000, "toBlock": 78600100, "count": 1 }
}
```

**Notes:**
- Does **not** update `SyncState` — the background scanner owns that watermark
- Deduplication is handled by the existing unique index; when the scanner catches up, duplicates are silently skipped
- Returns `400` with `UNKNOWN_CHAIN`, `BLOCK_RANGE_INVALID`, or `BLOCK_RANGE_TOO_LARGE` error codes
- Returns `502` with `RPC_FETCH_FAILED` if the RPC is unreachable after retries
- Returns `500` with `DB_WRITE_FAILED` if events cannot be stored

### `GET /health`

Returns service health with per-chain staleness detection. A chain is marked `"stale"` if its `updatedAt` is older than `3 × POLL_INTERVAL_MS` (default: 30 seconds).

| Status | Meaning | HTTP Code |
|--------|---------|-----------|
| `ok` | DB connected, all chains syncing | 200 |
| `degraded` | DB connected, one or more chains stale | 200 |
| `error` | DB disconnected or query failed | 503 |

```json
{
  "status": "ok",
  "database": "connected",
  "chains": [
    {
      "chainId": "polygon",
      "lastSyncedBlock": 78650000,
      "updatedAt": "2026-03-28T14:00:00.000Z",
      "status": "syncing"
    },
    {
      "chainId": "stellar-testnet",
      "lastSyncedBlock": 1748900,
      "updatedAt": "2026-03-28T14:00:05.000Z",
      "status": "syncing"
    }
  ]
}
```

### `GET /docs`

Interactive Swagger UI for exploring the API. The OpenAPI 3.0 JSON spec is available at `/docs/json`.

### `GET /metrics`

Prometheus-format metrics for monitoring.

```text
scanner_batches_total{chainId="polygon"} 42
scanner_events_inserted_total{chainId="polygon"} 1500
scanner_errors_total{chainId="polygon",type="rpc"} 5
scanner_batch_duration_seconds_bucket{chainId="polygon",le="1"} 20
api_requests_total{route="/events",method="GET",status="200"} 100
```

### Error Responses

All error responses use a consistent structured format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Code | HTTP | Description |
|------|------|-------------|
| `BLOCK_RANGE_INVALID` | 400 | `fromBlock > toBlock` |
| `BLOCK_RANGE_TOO_LARGE` | 400 | Range exceeds 10,000 blocks |
| `UNKNOWN_CHAIN` | 400 | Chain not configured |
| `RPC_FETCH_FAILED` | 502 | RPC unreachable after retries |
| `DB_WRITE_FAILED` | 500 | MongoDB write failed |
| `NOT_FOUND` | 404 | Route not found |
| `VALIDATION_ERROR` | 400 | Request body fails schema validation |
| `FORBIDDEN` | 403 | IP banned (repeated 404 abuse) |

## Testing

```bash
pnpm test          # all tests (unit + integration)
pnpm test:unit     # unit tests only
pnpm test:int      # integration tests (uses mongodb-memory-server)
pnpm test:e2e      # E2E tests (hits real Polygon mainnet + Stellar testnet RPCs)
pnpm check         # biome lint + format check
pnpm check:types   # tsc type check
```

### Coverage

```bash
pnpm test:cov      # run tests with coverage report
```

Coverage thresholds are enforced at **80%** (statements, branches, functions, lines). The `test:cov` script fails if any threshold is not met.

## Design Decisions

| Choice | Why |
|--------|-----|
| **viem** (not ethers) | LI.FI standard, tree-shakeable, type-safe ABI encoding |
| **Fastify v5** (not Express) | Schema validation, async-first, plugin system |
| **Typegoose + Mongoose** | Decorator-based models, TypeScript-native |
| **Biome** (not ESLint/Prettier) | Single tool for lint + format, fast Rust-based |
| **pnpm** (not npm/yarn) | LI.FI standard, strict dependency resolution |
| **Zod** for env config | Runtime validation with type inference, fail-fast on startup |
| **BigInt as decimal strings** | MongoDB has no native uint256; strings preserve precision |
| **insertMany ordered: false** | Dedup via unique index; E11000 errors are silently ignored |
| **Cursor-first persistence** | `lastSyncedBlock` advances ONLY after successful write |
| **SWC for Vitest** | esbuild doesn't support `emitDecoratorMetadata` (required by Typegoose) |

## Stellar Testnet

The Stellar scanner connects to a real **oracle/price-feed contract** (`CDLZFC3...`) on Stellar testnet. It decodes two event types:

- **`fee` events**: `topic[0]=Symbol("fee")`, `topic[1]=Address(payer)`, `value=i128(amount)`
- **`transfer` events**: SEP-0041 Token Interface format

### Caveats

- Stellar RPC default event retention is **~7 days** (120,960 ledgers). The public testnet RPC (`soroban-testnet.stellar.org`) likely uses this default
- Testnet resets approximately quarterly, which clears all data and may change contract IDs
- For production Stellar mainnet, a paid RPC provider (QuickNode, Blockdaemon) with extended retention is needed
- Historical backfill beyond the retention window requires Galexie or Stellar Ingest SDK
- To enable Stellar scanning, set `STELLAR_INTEGRATOR_ADDRESS` in `.env`

## Next Steps

Areas for future improvement and features not fully implemented:

- **Multi-chain EVM expansion** — Add Arbitrum, Optimism, Base, etc. Each new chain only needs a `ChainConfig` entry; the `ChainScanner` interface and orchestrator work unchanged
- **Stellar mainnet** — Replace testnet RPC with a paid provider (QuickNode, Blockdaemon); the 7-day event retention limit on testnet doesn't apply to archive-enabled mainnet nodes
- **Historical backfill for Stellar** — For events older than the RPC retention window, integrate Galexie or Stellar Ingest SDK to replay historical ledgers into MongoDB
- **Alerting** — Trigger alerts when scan lag exceeds a configurable threshold or when RPC error rate spikes
- **API authentication** — Add API key or JWT authentication to the REST endpoints for production use
- **WebSocket / SSE streaming** — Real-time event feed for consumers that need instant notification of new fee collection events
- **Horizontal scaling** — Partition chains across multiple scanner instances with a distributed lock (e.g. Redis-based) to prevent duplicate scanning

## Project Structure

```text
src/
  config/       # Zod env validation, chain configs, types
  models/       # Typegoose models (FeeEvent, SyncState), database connection
  scanners/
    evm/        # EvmScanner (viem), log fetching, event decoding
    stellar/    # StellarScanner (@stellar/stellar-sdk), Soroban event decoding
    types.ts    # ChainScanner interface
  core/
    ScannerOrchestrator.ts   # Per-chain scan loop with retry + batch halving
    SyncStateManager.ts      # Cursor persistence (load/save)
    helpers/                 # retry, sleep, gracefulShutdown
  api/
    server.ts               # Fastify setup + Swagger + rate limiting
    routes/                  # /events, /health, /events/fetch endpoints
    helpers/                 # Structured error responses (sendError, ApiErrorCode)
    middleware/              # Bot ban (repeated 404 detection)
  errors/       # ErrorCode, ScannerError, RpcError, mongoErrors (barrel exports)
  utils/        # Pino logger, Prometheus metrics, address normalization
  index.ts      # Entry point: scanner + API
  scanner.ts    # Entry point: scanner only
  server.ts     # Entry point: API only
scripts/
  smoke-test.sh # 38-assertion smoke test suite for live deployments
```
