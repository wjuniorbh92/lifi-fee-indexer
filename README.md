# LI.FI Fee Indexer

Multi-chain event indexer for the LI.FI `FeeCollector` smart contract. Scrapes `FeesCollected` events from **Polygon** and **Stellar Testnet**, stores them in MongoDB, and exposes a REST API for querying.

## Architecture

```
                        +------------------+
                        |   Entry Points   |
                        |  index / scanner |
                        |    / server      |
                        +--------+---------+
                                 |
                  +--------------+--------------+
                  |                             |
         +--------v--------+          +--------v--------+
         | ScannerOrchestrator |      |   Fastify API   |
         |  (per-chain loop)   |      | /events /health |
         +--------+---------+         +--------+--------+
                  |                             |
         +--------v--------+                   |
         |  ChainScanner   |                   |
         |  interface       |                   |
         +---+----------+--+                   |
             |          |                      |
     +-------v--+  +----v-------+              |
     |EvmScanner|  |StellarScanner|            |
     |  (viem)  |  |(@stellar/sdk)|           |
     +----------+  +-------------+             |
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

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/lifi-fee-indexer` | MongoDB connection string |
| `POLYGON_RPC_URL` | Yes | `https://polygon-rpc.com` | Polygon JSON-RPC endpoint |
| `FEE_COLLECTOR_ADDRESS` | Yes | `0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9` | FeeCollector contract address |
| `STELLAR_HORIZON_URL` | No | `https://horizon-testnet.stellar.org` | Stellar RPC URL |
| `STELLAR_INTEGRATOR_ADDRESS` | No | _(empty)_ | Stellar integrator address (enables Stellar scanner) |
| `BATCH_SIZE` | No | `2000` | Blocks per batch |
| `EVM_START_BLOCK` | No | `78600000` | Starting block for Polygon scanner |
| `POLL_INTERVAL_MS` | No | `10000` | Polling interval between scan cycles |
| `PORT` | No | `3000` | API server port |
| `HOST` | No | `0.0.0.0` | API server host |
| `LOG_LEVEL` | No | `info` | Log level (fatal/error/warn/info/debug/trace) |

### RPC Note

Block 78,600,000 is recent Polygon data (~late 2025). Free RPCs like `polygon-rpc.com` can serve it. For faster initial sync, use Alchemy, Infura, or Ankr free tier and set `POLYGON_RPC_URL` accordingly.

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

**Response:**

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
  "pagination": {
    "total": 42,
    "limit": 100,
    "offset": 0
  }
}
```

### `GET /health`

```json
{
  "status": "ok",
  "database": "connected",
  "chains": [
    {
      "chainId": "polygon",
      "lastSyncedBlock": 78650000,
      "updatedAt": "2026-03-28T14:00:00.000Z"
    }
  ]
}
```

## Testing

```bash
pnpm test          # all tests (unit + integration)
pnpm test:unit     # unit tests only
pnpm test:int      # integration tests (uses mongodb-memory-server)
pnpm check         # biome lint + format check
pnpm check:types   # tsc type check
```

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

## Stellar Testnet Caveats

- The Stellar scanner uses a **demo contract** on testnet, not the actual LI.FI FeeCollector
- Stellar testnet has a **7-day event retention limit** -- events older than 7 days are unavailable
- Testnet resets approximately quarterly, which clears all data
- To enable Stellar scanning, set `STELLAR_INTEGRATOR_ADDRESS` in `.env`

## Project Structure

```
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
    server.ts               # Fastify setup + rate limiting
    routes/                  # /events, /health endpoints
  errors/       # ScannerError, RpcError with error codes
  utils/        # Pino logger
  index.ts      # Entry point: scanner + API
  scanner.ts    # Entry point: scanner only
  server.ts     # Entry point: API only
```
