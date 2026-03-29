import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedEvent } from '../../config/types.js';
import { StellarScanner } from './StellarScanner.js';

const MOCK_LATEST_LEDGER = 700500;
const MOCK_EVENT_LEDGER = 500100;
const MOCK_SCAN_FROM = 500000;
const MOCK_SCAN_TO = 500200;
const MOCK_SCAN_FROM_2 = 500201;
const MOCK_SCAN_TO_2 = 500400;
const STELLAR_BATCH_SIZE = 100;

const { mockGetLatestLedger, mockGetEvents } = vi.hoisted(() => {
	const mockGetLatestLedger = vi.fn();
	const mockGetEvents = vi.fn();
	return { mockGetLatestLedger, mockGetEvents };
});

const mockDecodeStellarEvent = vi.hoisted(() => vi.fn());
const mockGetStellarEvents = vi.hoisted(() => vi.fn());

vi.mock('@stellar/stellar-sdk', () => ({
	rpc: {
		Server: vi.fn().mockImplementation(() => ({
			getLatestLedger: mockGetLatestLedger,
			getEvents: mockGetEvents,
		})),
	},
}));

vi.mock('./decodeStellarEvent.js', () => ({
	decodeStellarEvent: mockDecodeStellarEvent,
}));

vi.mock('./getStellarEvents.js', () => ({
	getStellarEvents: mockGetStellarEvents,
}));

const STELLAR_CONFIG = {
	chainId: 'stellar-testnet',
	name: 'Stellar Testnet',
	rpcUrl: 'https://soroban-testnet.stellar.org',
	contractAddress: 'CABC123',
	startBlock: 0,
	batchSize: STELLAR_BATCH_SIZE,
	confirmations: 0,
	type: 'stellar' as const,
};

function makeEvent(): NormalizedEvent {
	return {
		chainId: 'stellar-testnet',
		blockNumber: MOCK_EVENT_LEDGER,
		transactionHash: 'tx-abc',
		logIndex: 0,
		token: 'GTOKEN',
		integrator: 'GINTEGRATOR',
		integratorFee: '1000',
		lifiFee: '50',
		timestamp: new Date('2026-01-01T00:00:00Z'),
	};
}

describe('StellarScanner', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getLatestPosition', () => {
		it('returns latest ledger sequence', async () => {
			mockGetLatestLedger.mockResolvedValue({ sequence: MOCK_LATEST_LEDGER });

			const scanner = new StellarScanner(STELLAR_CONFIG);
			const result = await scanner.getLatestPosition();

			expect(result).toBe(MOCK_LATEST_LEDGER);
		});
	});

	describe('getEvents', () => {
		it('returns normalized events with nextCursor', async () => {
			const rawEvent = { ledger: MOCK_EVENT_LEDGER, id: `${MOCK_EVENT_LEDGER}-0-1` };
			const normalizedEvent = makeEvent();

			mockGetStellarEvents.mockResolvedValue({
				events: [rawEvent],
				cursor: 'cursor-abc',
			});
			mockDecodeStellarEvent.mockReturnValue(normalizedEvent);

			const scanner = new StellarScanner(STELLAR_CONFIG);
			const result = await scanner.getEvents(MOCK_SCAN_FROM, MOCK_SCAN_TO);

			expect(result).toEqual({
				events: [normalizedEvent],
				nextCursor: 'cursor-abc',
			});
			expect(mockDecodeStellarEvent).toHaveBeenCalledWith(rawEvent, 'stellar-testnet');
		});

		it('returns empty events with no cursor when no events found', async () => {
			mockGetStellarEvents.mockResolvedValue({ events: [], cursor: '' });

			const scanner = new StellarScanner(STELLAR_CONFIG);
			const result = await scanner.getEvents(MOCK_SCAN_FROM, MOCK_SCAN_TO);

			expect(result).toEqual({
				events: [],
				nextCursor: undefined,
			});
		});

		it('throws RangeError when from > to', async () => {
			const scanner = new StellarScanner(STELLAR_CONFIG);

			await expect(scanner.getEvents(200, 100)).rejects.toThrow(
				'Invalid ledger range: from (200) > to (100)',
			);
		});

		it('passes cursor to getStellarEvents when set', async () => {
			mockGetStellarEvents.mockResolvedValue({ events: [], cursor: '' });

			const scanner = new StellarScanner(STELLAR_CONFIG);
			scanner.setCursor('existing-cursor');

			await scanner.getEvents(MOCK_SCAN_FROM, MOCK_SCAN_TO);

			expect(mockGetStellarEvents).toHaveBeenCalledWith(
				expect.anything(),
				STELLAR_CONFIG,
				MOCK_SCAN_FROM,
				MOCK_SCAN_TO,
				'existing-cursor',
			);
		});

		it('uses cursor set externally via setCursor for subsequent calls', async () => {
			mockGetStellarEvents
				.mockResolvedValueOnce({ events: [], cursor: 'new-cursor' })
				.mockResolvedValueOnce({ events: [], cursor: '' });

			const scanner = new StellarScanner(STELLAR_CONFIG);
			const result = await scanner.getEvents(MOCK_SCAN_FROM, MOCK_SCAN_TO);

			// Orchestrator sets cursor after successful persistence
			scanner.setCursor(result.nextCursor);

			await scanner.getEvents(MOCK_SCAN_FROM_2, MOCK_SCAN_TO_2);

			expect(mockGetStellarEvents).toHaveBeenCalledTimes(2);
			expect(mockGetStellarEvents.mock.calls[1][2]).toBe(MOCK_SCAN_FROM_2);
			expect(mockGetStellarEvents.mock.calls[1][3]).toBe(MOCK_SCAN_TO_2);
			expect(mockGetStellarEvents.mock.calls[1][4]).toBe('new-cursor');
		});
	});
});
