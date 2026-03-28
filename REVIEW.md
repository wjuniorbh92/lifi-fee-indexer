# Code Review Guidelines

## Project context
FeeCollector event indexer for Polygon (EVM) + Stellar Testnet.
Senior Backend Engineer take-home for LI.FI. Code must be production-ready,
well-structured, and simple (no NestJS or big frameworks).

## Always check

### Architecture & patterns
- `ChainScanner` interface abstraction — EVM and Stellar scanners must implement `getLatestPosition()` and `getEvents(from, to)`, returning `NormalizedEvent[]`
- Scanner orchestrator runs chains concurrently, not sequentially
- Cursor safety: `lastSyncedBlock` advances ONLY after successful `insertMany`
- Resume: scanner starts at `lastSyncedBlock + 1` (no re-scan of already processed blocks)
- Dedup via unique MongoDB index on `(transactionHash, logIndex)` + `insertMany({ ordered: false })`
- Duplicate key errors (E11000) are expected and must be caught gracefully — not treated as failures
- Graceful shutdown: SIGTERM/SIGINT sets a flag, lets current batch COMPLETE (including cursor update), then disconnects DB and exits — never leave a batch half-done
- Memory safety: events are processed batch-by-batch (2000 blocks), never accumulated across batches

### Code conventions (LI.FI codebase patterns)
- All imports use `.js` extension (ESM NodeNext requirement)
- `reflect-metadata` is the FIRST import in all 3 entry points (`index.ts`, `scanner.ts`, `server.ts`)
- **PascalCase** for class files (`EvmScanner.ts`), **camelCase** for function files (`getEvmLogs.ts`)
- Tests co-located with source: `EvmScanner.unit.spec.ts` next to `EvmScanner.ts` (no separate `tests/` directory)
- `import type` syntax for type-only imports
- No default exports — use named exports with barrel `index.ts`
- BigInt values stored as decimal strings in MongoDB, never raw BigInt
- EVM uses **viem v2** (not ethers.js — LI.FI internal standard)
- Zod v3 for all environment config validation
- Fastify v5 for REST API (not Express, not NestJS)
- Typegoose v12 + Mongoose v8 for MongoDB models
- Pino for structured logging (pino-pretty in dev only, undefined transport in prod)
- pnpm as package manager (not npm/yarn)
- Biome for linting and formatting (not ESLint/Prettier)

### Data integrity
- Block confirmations: 64 for Polygon (configurable per chain)
- Batch size default 2000 blocks (configurable, max 10000)
- EVM addresses must be lowercased before storage
- `getLogs` must use `strict: true` for typed event decoding with viem
- Block timestamps fetched via `getBlock` and deduplicated (only fetch unique block numbers)
- Pending logs (null logIndex/blockNumber/transactionHash) must be rejected

### Error handling & retry
- Transient RPC errors (429, 502-504, ETIMEDOUT, ECONNRESET) must be retried with exponential backoff
- Block range too large errors → halve batch size and retry
- MongoDB connection loss → pause scanner, mongoose auto-reconnects
- ScVal decode errors (Stellar) → log and skip the event, don't crash
- Stellar 7-day retention limit → if `startLedger` too old, reset to oldest available ledger
- Invalid Stellar cursor → clear cursor from SyncState, restart from startLedger
- All errors must be classified as retryable or non-retryable

### Stellar-specific
- `lastCursor` (pagingToken) persisted in `SyncState` for pagination resume
- Manual `toLedger` enforcement since `getEvents` has no native `toBlock`
- ScVal/XDR decoding via `@stellar/stellar-sdk` (`xdr.ScVal.fromXDR`, `scValToNative`)
- Testnet resets: detect when `latestLedger < lastSyncedBlock` and reset state
- Soroban RPC `getEvents` uses cursor-based pagination (100 events per page)

### Testing
- Unit tests mock dependencies, integration tests use `mongodb-memory-server`
- Tests co-located: `*.unit.spec.ts` / `*.int.spec.ts` next to source files
- Test fixtures use real data from PolygonScan and Stellar Testnet
- Integration tests must verify: dedup (insert same events twice → no duplicates), cursor resume (save, restart, verify no re-scan)

### API
- `GET /events?integrator=` requires valid EVM address format (`0x` + 40 hex)
- `GET /health` must show per-chain sync status (lastSyncedBlock, updatedAt) and DB connection state
- Rate limiting via `@fastify/rate-limit`
- Empty results return 200 with empty data array (NOT 404)
- Fastify JSON Schema validation for all query params
- All read queries should use `.lean()` for performance

## Skip
- Generated files under `dist/`
- `node_modules/`
- Lock file changes (`pnpm-lock.yaml`)
- Formatting-only changes (Biome handles this in CI)
- Files under `lifi-fee-indexer-research/` (research docs, not source code)
- Files under `docs/superpowers/` (planning docs)

## Context for reviewers
- Contract: `0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9` on Polygon
- Event: `FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)`
- Start block: `78600000`
- Stellar uses Soroban Testnet RPC (`https://soroban-testnet.stellar.org`) with 7-day event retention limit
- Protocol 23/Whisk (CAP-0067) unified events — classic and Soroban operations emit the same SEP-0041 format
- The project is designed multi-chain from day one — adding a new chain means implementing `ChainScanner` interface only
