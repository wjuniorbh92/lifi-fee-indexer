# LI.FI Fee Indexer

## Project
FeeCollector event indexer for Polygon (EVM) + Stellar Testnet.
Senior Backend Engineer take-home assignment.

## Stack
- **Runtime**: Node.js 20+, TypeScript ESM (NodeNext)
- **EVM**: viem v2 (not ethers — LI.FI standard)
- **DB**: Typegoose v12 + Mongoose v8, BigInt as decimal strings
- **API**: Fastify v5 + @fastify/rate-limit
- **Stellar**: @stellar/stellar-sdk v13
- **Validation**: Zod v3 for env config
- **Test**: Vitest, co-located `*.unit.spec.ts` / `*.int.spec.ts`, mongodb-memory-server
- **Lint/Format**: Biome (not ESLint/Prettier)
- **Package manager**: pnpm

## Conventions
- All imports use `.js` extension (ESM NodeNext)
- `reflect-metadata` is the FIRST import in all 3 entry points (index.ts, scanner.ts, server.ts)
- **No magic numbers** — extract numeric/string literals into named constants at module top (e.g. `DEFAULT_MAX_RETRIES`, `BLOCK_FETCH_CONCURRENCY`)
- **No non-null assertions** (`!`) — Biome enforces `noNonNullAssertion`. Use type narrowing or fallback values instead
- Dedup via unique MongoDB index on `(chainId, transactionHash, logIndex)` + `insertMany({ ordered: false })`
- Cursor safety: advance `lastSyncedBlock` ONLY after successful insertMany
- Resume: `lastSyncedBlock + 1` (no re-scan)
- Tests: unit tests mock dependencies (`vi.hoisted` + `vi.mock`), integration tests use mongodb-memory-server

## Commands
- `pnpm test` — run all tests
- `pnpm test:unit` — unit tests only
- `pnpm test:int` — integration tests only
- `pnpm check` — biome lint + format check
- `pnpm check:write` — biome auto-fix
- `pnpm check:types` — tsc type check
- `pnpm build` — compile to dist/
- `pnpm dev` — dev mode (tsx watch)
