import { describe, expect, it, vi } from 'vitest';
import { STALENESS_MULTIPLIER } from './health.js';

const POLL_INTERVAL_MS = 10_000;

const { mockFind, mockIsDatabaseConnected } = vi.hoisted(() => {
  const mockLean = vi.fn();
  const mockFind = vi.fn().mockReturnValue({ lean: mockLean });
  const mockIsDatabaseConnected = vi.fn().mockReturnValue(true);
  return { mockFind, mockLean, mockIsDatabaseConnected };
});

vi.mock('../../models/SyncState.js', () => ({
  SyncStateModel: { find: mockFind },
}));

vi.mock('../../models/database.js', () => ({
  isDatabaseConnected: mockIsDatabaseConnected,
}));

async function buildApp(pollIntervalMs = POLL_INTERVAL_MS) {
  const { buildServer } = await import('../server.js');
  return buildServer({ pollIntervalMs });
}

function recentDate(): Date {
  return new Date(Date.now() - POLL_INTERVAL_MS);
}

function staleDate(): Date {
  return new Date(Date.now() - POLL_INTERVAL_MS * STALENESS_MULTIPLIER - 1000);
}

describe('GET /health', () => {
  it('returns ok when all chains are recently synced', async () => {
    mockIsDatabaseConnected.mockReturnValue(true);
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          chainId: 'polygon',
          lastSyncedBlock: 100,
          updatedAt: recentDate(),
        },
      ]),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(body.chains[0].status).toBe('syncing');
  });

  it('returns degraded when a chain is stale', async () => {
    mockIsDatabaseConnected.mockReturnValue(true);
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          chainId: 'polygon',
          lastSyncedBlock: 100,
          updatedAt: staleDate(),
        },
      ]),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.chains[0].status).toBe('stale');
  });

  it('returns error with 503 when DB is disconnected', async () => {
    mockIsDatabaseConnected.mockReturnValue(false);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(503);
    expect(body.status).toBe('error');
    expect(body.database).toBe('disconnected');
    expect(body.chains).toEqual([]);
  });

  it('returns ok when DB is connected but no chains exist', async () => {
    mockIsDatabaseConnected.mockReturnValue(true);
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.chains).toEqual([]);
  });

  it('marks chain as stale when updatedAt is undefined (fail closed)', async () => {
    mockIsDatabaseConnected.mockReturnValue(true);
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          chainId: 'stellar-testnet',
          lastSyncedBlock: 50,
        },
      ]),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.chains[0].status).toBe('stale');
  });
});
