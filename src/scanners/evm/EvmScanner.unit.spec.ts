import type { PublicClient } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import type { ChainConfig } from '../../config/types.js';
import { EvmScanner } from './EvmScanner.js';

const mockConfig: ChainConfig = {
	chainId: 'polygon',
	name: 'Polygon',
	rpcUrl: 'https://polygon-rpc.com',
	contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
	startBlock: 78_600_000,
	batchSize: 2000,
	confirmations: 64,
	type: 'evm',
};

const BLOCK_TIMESTAMP = 1733054400n; // 2024-12-01T12:00:00Z

function createMockClient(logs: unknown[] = [], latestBlock = 84_800_000n) {
	return {
		getBlockNumber: vi.fn().mockResolvedValue(latestBlock),
		getLogs: vi.fn().mockResolvedValue(logs),
		getBlock: vi
			.fn()
			.mockImplementation(({ blockNumber }: { blockNumber: bigint }) =>
				Promise.resolve({ number: blockNumber, timestamp: BLOCK_TIMESTAMP }),
			),
	} as unknown as PublicClient;
}

const mockLogs = [
	{
		blockNumber: 84797174n,
		transactionHash: '0x13f791d14a9286d2503df5112f8b5cd84f5c06eaf0183ca59342c3a2f8f08f9b',
		logIndex: 0,
		args: {
			_token: '0xB7866Bf99A9AC64520c43246819F2B43E532deE1',
			_integrator: '0xe165726003c42Edde42615cE591e25665a6a40a4',
			_integratorFee: 3616000000000000000000n,
			_lifiFee: 678000000000000000000n,
		},
	},
	{
		blockNumber: 84797174n,
		transactionHash: '0x6dfce7f2579281d91bba4c7fde5418da7e102ec761e5a0fd5210c23cd5480211',
		logIndex: 1,
		args: {
			_token: '0x0000000000000000000000000000000000000000',
			_integrator: '0x37E945Ed26B17A631d7Df3382C2808cc1c7f07Ed',
			_integratorFee: 75000000000000000n,
			_lifiFee: 56250000000000000n,
		},
	},
	{
		blockNumber: 84796868n,
		transactionHash: '0x003978ac0b540ee6ad6d7cd5dd5c713b7b38cb9add9d7ff6c895305870e0b3f3',
		logIndex: 0,
		args: {
			_token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
			_integrator: '0xBfC330020E3267Cea008718f1712f1dA7F0d32A9',
			_integratorFee: 56267n,
			_lifiFee: 27713n,
		},
	},
];

describe('EvmScanner', () => {
	describe('getLatestPosition', () => {
		it('returns latest block minus confirmations', async () => {
			const client = createMockClient();
			const scanner = new EvmScanner(mockConfig, client);

			const position = await scanner.getLatestPosition();
			expect(position).toBe(84_800_000 - 64);
		});

		it('clamps to zero when block number is less than confirmations', async () => {
			const client = createMockClient([], 10n);
			const scanner = new EvmScanner(mockConfig, client);

			const position = await scanner.getLatestPosition();
			expect(position).toBe(0);
		});

		it('propagates RPC errors from getBlockNumber', async () => {
			const client = createMockClient();
			(
				client as unknown as { getBlockNumber: ReturnType<typeof vi.fn> }
			).getBlockNumber.mockRejectedValue(new Error('RPC timeout'));
			const scanner = new EvmScanner(mockConfig, client);

			await expect(scanner.getLatestPosition()).rejects.toThrow('RPC timeout');
		});
	});

	describe('getEvents', () => {
		it('returns empty array when no logs found', async () => {
			const client = createMockClient([]);
			const scanner = new EvmScanner(mockConfig, client);

			const events = await scanner.getEvents(78_600_000, 78_602_000);
			expect(events).toEqual([]);
		});

		it('returns normalized events with correct fields', async () => {
			const client = createMockClient(mockLogs);
			const scanner = new EvmScanner(mockConfig, client);

			const events = await scanner.getEvents(84_796_000, 84_798_000);

			expect(events).toHaveLength(3);
			expect(events[0]).toEqual({
				chainId: 'polygon',
				blockNumber: 84797174,
				transactionHash: '0x13f791d14a9286d2503df5112f8b5cd84f5c06eaf0183ca59342c3a2f8f08f9b',
				logIndex: 0,
				token: '0xb7866bf99a9ac64520c43246819f2b43e532dee1',
				integrator: '0xe165726003c42edde42615ce591e25665a6a40a4',
				integratorFee: '3616000000000000000000',
				lifiFee: '678000000000000000000',
				timestamp: new Date(Number(BLOCK_TIMESTAMP) * 1000),
			});
		});

		it('deduplicates block timestamp fetches', async () => {
			const client = createMockClient(mockLogs);
			const scanner = new EvmScanner(mockConfig, client);

			await scanner.getEvents(84_796_000, 84_798_000);

			// 3 logs but only 2 unique block numbers → 2 getBlock calls
			const getBlockCalls = (client as unknown as { getBlock: { mock: { calls: unknown[] } } })
				.getBlock.mock.calls;
			expect(getBlockCalls).toHaveLength(2);
		});

		it('passes correct block range to getLogs', async () => {
			const client = createMockClient([]);
			const scanner = new EvmScanner(mockConfig, client);

			await scanner.getEvents(78_600_000, 78_602_000);

			expect(
				(client as unknown as { getLogs: { mock: { calls: unknown[][] } } }).getLogs.mock
					.calls[0][0],
			).toMatchObject({
				fromBlock: 78_600_000n,
				toBlock: 78_602_000n,
			});
		});

		it('throws RangeError when from > to', async () => {
			const client = createMockClient();
			const scanner = new EvmScanner(mockConfig, client);

			await expect(scanner.getEvents(100, 50)).rejects.toThrow(RangeError);
			await expect(scanner.getEvents(100, 50)).rejects.toThrow('Invalid block range');
		});

		it('propagates RPC errors from getLogs', async () => {
			const client = createMockClient();
			(client as unknown as { getLogs: ReturnType<typeof vi.fn> }).getLogs.mockRejectedValue(
				new Error('rate limited'),
			);
			const scanner = new EvmScanner(mockConfig, client);

			await expect(scanner.getEvents(78_600_000, 78_602_000)).rejects.toThrow('rate limited');
		});

		it('throws on pending logs with null logIndex', async () => {
			const pendingLog = [
				{
					blockNumber: 84797174n,
					transactionHash: '0x13f791d14a9286d2503df5112f8b5cd84f5c06eaf0183ca59342c3a2f8f08f9b',
					logIndex: null,
					args: {
						_token: '0xB7866Bf99A9AC64520c43246819F2B43E532deE1',
						_integrator: '0xe165726003c42Edde42615cE591e25665a6a40a4',
						_integratorFee: 3616000000000000000000n,
						_lifiFee: 678000000000000000000n,
					},
				},
			];
			const client = createMockClient(pendingLog);
			const scanner = new EvmScanner(mockConfig, client);

			await expect(scanner.getEvents(84_796_000, 84_798_000)).rejects.toThrow(
				'Pending log encountered',
			);
		});
	});
});
