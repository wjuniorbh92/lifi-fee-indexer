import type pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainScanner } from '../scanners/types.js';
import { runScanner } from './ScannerOrchestrator.js';

const CHAIN_POLYGON = 'polygon';
const CHAIN_STELLAR = 'stellar-testnet';
const POLYGON_RPC = 'https://polygon-rpc.com';
const STELLAR_RPC = 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC = 'https://soroban-testnet.stellar.org';
const POLYGON_FEE_COLLECTOR = '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9';
const STELLAR_CONTRACT = 'GABC123';
const STELLAR_CONTRACT_ALT = 'CABC123';
const MOCK_BATCH_SIZE = 10;
const MOCK_HALVED_BATCH = 8;
const POLYGON_START_BLOCK = 78_600_000;
const MOCK_LATEST_POSITION = 110;
const MOCK_LATEST_ALT = 120;
const MOCK_LATEST_RESET = 100;
const MOCK_LOAD_POSITION = 100;
const MOCK_LOAD_STALE = 500_001;
const MOCK_EVENT_BLOCK = 105;
const MOCK_POLL_MS = 1000;
const DUPLICATE_KEY_CODE = 11_000;
const OTHER_ERROR_CODE = 50;
const MOCK_TIMESTAMP = '2026-01-01T00:00:00.000Z';
const MOCK_TX_HASH = '0xabc';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ONE_ADDRESS = '0x0000000000000000000000000000000000000001';
const MOCK_FEE = '10';
const MOCK_LIFI_FEE = '2';
const MOCK_CURSOR = 'cursor-2';
const EVM_CONFIRMATIONS = 64;
const STELLAR_CONFIRMATIONS = 0;

const {
  mockInsertMany,
  mockLoadOrCreate,
  mockSave,
  mockWithRetry,
  mockSleep,
  mockIsShutdownRequested,
  mockInitShutdownHandler,
} = vi.hoisted(() => {
  const mockInsertMany = vi.fn();
  const mockLoadOrCreate = vi.fn();
  const mockSave = vi.fn();
  const mockWithRetry = vi.fn();
  const mockSleep = vi.fn();
  const mockIsShutdownRequested = vi.fn();
  const mockInitShutdownHandler = vi.fn();

  return {
    mockInsertMany,
    mockLoadOrCreate,
    mockSave,
    mockWithRetry,
    mockSleep,
    mockIsShutdownRequested,
    mockInitShutdownHandler,
  };
});

vi.mock('../models/FeeEvent.js', () => ({
  FeeEventModel: {
    insertMany: mockInsertMany,
  },
}));

vi.mock('./SyncStateManager.js', () => ({
  SyncStateManager: {
    loadOrCreate: mockLoadOrCreate,
    save: mockSave,
  },
}));

vi.mock('./helpers/retry.js', () => ({
  withRetry: mockWithRetry,
}));

vi.mock('./helpers/sleep.js', () => ({
  sleep: mockSleep,
}));

vi.mock('./helpers/gracefulShutdown.js', () => ({
  initShutdownHandler: mockInitShutdownHandler,
  isShutdownRequested: mockIsShutdownRequested,
}));

function createLogger(): pino.Logger {
  const chainLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    child: vi.fn().mockReturnValue(chainLogger),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as pino.Logger;
}

describe('ScannerOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(
      async (fn: () => Promise<unknown>) => await fn(),
    );
    mockSleep.mockResolvedValue(undefined);
    mockInsertMany.mockResolvedValue([]);
    mockLoadOrCreate.mockResolvedValue(MOCK_LOAD_POSITION);
    mockSave.mockResolvedValue(undefined);
  });

  it('persists nextCursor returned by scanner batch', async () => {
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_STELLAR,
        name: 'Stellar Testnet',
        rpcUrl: STELLAR_RPC,
        contractAddress: STELLAR_CONTRACT,
        startBlock: 0,
        batchSize: MOCK_BATCH_SIZE,
        confirmations: STELLAR_CONFIRMATIONS,
        type: 'stellar',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_POSITION),
      getEvents: vi.fn().mockResolvedValue({
        events: [
          {
            chainId: CHAIN_STELLAR,
            blockNumber: MOCK_EVENT_BLOCK,
            transactionHash: MOCK_TX_HASH,
            logIndex: 0,
            token: ZERO_ADDRESS,
            integrator: ONE_ADDRESS,
            integratorFee: MOCK_FEE,
            lifiFee: MOCK_LIFI_FEE,
            timestamp: new Date(MOCK_TIMESTAMP),
          },
        ],
        nextCursor: MOCK_CURSOR,
      }),
    };

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    expect(mockSave).toHaveBeenCalledWith(
      CHAIN_STELLAR,
      MOCK_LATEST_POSITION - 1,
      MOCK_CURSOR,
    );
  });

  it('advances cursor when all writeErrors are duplicate key (11000)', async () => {
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const bulkError = Object.assign(new Error('BulkWriteError'), {
      writeErrors: [{ code: DUPLICATE_KEY_CODE }, { code: DUPLICATE_KEY_CODE }],
    });
    mockInsertMany.mockRejectedValueOnce(bulkError);

    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_POLYGON,
        name: 'Polygon',
        rpcUrl: POLYGON_RPC,
        contractAddress: POLYGON_FEE_COLLECTOR,
        startBlock: POLYGON_START_BLOCK,
        batchSize: MOCK_BATCH_SIZE,
        confirmations: EVM_CONFIRMATIONS,
        type: 'evm',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_POSITION),
      getEvents: vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_POLYGON,
          blockNumber: MOCK_EVENT_BLOCK,
          transactionHash: MOCK_TX_HASH,
          logIndex: 0,
          token: ZERO_ADDRESS,
          integrator: ONE_ADDRESS,
          integratorFee: MOCK_FEE,
          lifiFee: MOCK_LIFI_FEE,
          timestamp: new Date(MOCK_TIMESTAMP),
        },
      ]),
    };

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    expect(mockSave).toHaveBeenCalledWith(
      CHAIN_POLYGON,
      MOCK_LATEST_POSITION - 1,
      undefined,
    );
  });

  it('advances cursor when writeErrors use nested err.code shape (MongoDB driver v6)', async () => {
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const bulkError = Object.assign(new Error('MongoBulkWriteError'), {
      writeErrors: [
        { err: { code: DUPLICATE_KEY_CODE }, index: 0 },
        { err: { code: DUPLICATE_KEY_CODE }, index: 4 },
      ],
    });
    mockInsertMany.mockRejectedValueOnce(bulkError);

    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_POLYGON,
        name: 'Polygon',
        rpcUrl: POLYGON_RPC,
        contractAddress: POLYGON_FEE_COLLECTOR,
        startBlock: POLYGON_START_BLOCK,
        batchSize: MOCK_BATCH_SIZE,
        confirmations: EVM_CONFIRMATIONS,
        type: 'evm',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_POSITION),
      getEvents: vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_POLYGON,
          blockNumber: MOCK_EVENT_BLOCK,
          transactionHash: MOCK_TX_HASH,
          logIndex: 0,
          token: ZERO_ADDRESS,
          integrator: ONE_ADDRESS,
          integratorFee: MOCK_FEE,
          lifiFee: MOCK_LIFI_FEE,
          timestamp: new Date(MOCK_TIMESTAMP),
        },
      ]),
    };

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    expect(mockSave).toHaveBeenCalledWith(
      CHAIN_POLYGON,
      MOCK_LATEST_POSITION - 1,
      undefined,
    );
  });

  it('does not advance cursor when writeErrors contain non-duplicate codes', async () => {
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const bulkError = Object.assign(new Error('BulkWriteError'), {
      writeErrors: [{ code: DUPLICATE_KEY_CODE }, { code: OTHER_ERROR_CODE }],
    });
    mockInsertMany.mockRejectedValueOnce(bulkError);

    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_POLYGON,
        name: 'Polygon',
        rpcUrl: POLYGON_RPC,
        contractAddress: POLYGON_FEE_COLLECTOR,
        startBlock: POLYGON_START_BLOCK,
        batchSize: MOCK_BATCH_SIZE,
        confirmations: EVM_CONFIRMATIONS,
        type: 'evm',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_POSITION),
      getEvents: vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_POLYGON,
          blockNumber: MOCK_EVENT_BLOCK,
          transactionHash: MOCK_TX_HASH,
          logIndex: 0,
          token: ZERO_ADDRESS,
          integrator: ONE_ADDRESS,
          integratorFee: MOCK_FEE,
          lifiFee: MOCK_LIFI_FEE,
          timestamp: new Date(MOCK_TIMESTAMP),
        },
      ]),
    };

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSleep).toHaveBeenCalledWith(MOCK_POLL_MS);
  });

  it('retries batch when SyncStateManager.save fails after successful insert', async () => {
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    mockSave.mockRejectedValueOnce(new Error('DB connection lost'));

    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_POLYGON,
        name: 'Polygon',
        rpcUrl: POLYGON_RPC,
        contractAddress: POLYGON_FEE_COLLECTOR,
        startBlock: POLYGON_START_BLOCK,
        batchSize: MOCK_BATCH_SIZE,
        confirmations: EVM_CONFIRMATIONS,
        type: 'evm',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_POSITION),
      getEvents: vi.fn().mockResolvedValue([
        {
          chainId: CHAIN_POLYGON,
          blockNumber: MOCK_EVENT_BLOCK,
          transactionHash: MOCK_TX_HASH,
          logIndex: 0,
          token: ZERO_ADDRESS,
          integrator: ONE_ADDRESS,
          integratorFee: MOCK_FEE,
          lifiFee: MOCK_LIFI_FEE,
          timestamp: new Date(MOCK_TIMESTAMP),
        },
      ]),
    };

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSleep).toHaveBeenCalledWith(MOCK_POLL_MS);
  });

  it('resets sync state when Stellar chain position is behind cursor (testnet reset)', async () => {
    // Simulate: lastSyncedBlock = 500000 (loadOrCreate returns 500001), but latest ledger is 100
    mockLoadOrCreate.mockResolvedValueOnce(MOCK_LOAD_STALE);

    // After reset: loadOrCreate returns the reset position + 1
    mockLoadOrCreate.mockResolvedValueOnce(MOCK_LATEST_RESET + 1);

    // Stop after second iteration (no events to process, just verify reset happened)
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const mockSetCursor = vi.fn();
    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_STELLAR,
        name: 'Stellar Testnet',
        rpcUrl: SOROBAN_RPC,
        contractAddress: STELLAR_CONTRACT_ALT,
        startBlock: 0,
        batchSize: MOCK_BATCH_SIZE,
        confirmations: STELLAR_CONFIRMATIONS,
        type: 'stellar',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_RESET),
      getEvents: vi
        .fn()
        .mockResolvedValue({ events: [], nextCursor: undefined }),
      setCursor: mockSetCursor,
    } as unknown as ChainScanner;

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    // Should have reset sync state to the latest position (null clears stale cursor)
    expect(mockSave).toHaveBeenCalledWith(
      CHAIN_STELLAR,
      MOCK_LATEST_RESET,
      null,
    );
    // Should have cleared the cursor
    expect(mockSetCursor).toHaveBeenCalledWith(undefined);
  });

  it('halves batch size after block-range error and retries with smaller window', async () => {
    mockIsShutdownRequested
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const scanner: ChainScanner = {
      config: {
        chainId: CHAIN_POLYGON,
        name: 'Polygon',
        rpcUrl: POLYGON_RPC,
        contractAddress: POLYGON_FEE_COLLECTOR,
        startBlock: POLYGON_START_BLOCK,
        batchSize: MOCK_HALVED_BATCH,
        confirmations: EVM_CONFIRMATIONS,
        type: 'evm',
      },
      getLatestPosition: vi.fn().mockResolvedValue(MOCK_LATEST_ALT),
      getEvents: vi
        .fn()
        .mockRejectedValueOnce(new Error('block range too large'))
        .mockResolvedValueOnce([]),
    };

    await runScanner(scanner, MOCK_POLL_MS, createLogger());

    expect(scanner.getEvents).toHaveBeenNthCalledWith(
      1,
      MOCK_LOAD_POSITION,
      MOCK_LOAD_POSITION + MOCK_HALVED_BATCH - 1,
    );
    expect(scanner.getEvents).toHaveBeenNthCalledWith(
      2,
      MOCK_LOAD_POSITION,
      MOCK_LOAD_POSITION + Math.floor(MOCK_HALVED_BATCH / 2) - 1,
    );
    expect(mockSave).toHaveBeenCalledWith(
      CHAIN_POLYGON,
      MOCK_LOAD_POSITION + Math.floor(MOCK_HALVED_BATCH / 2) - 1,
      undefined,
    );
  });
});
