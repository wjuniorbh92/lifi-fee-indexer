import { http, type PublicClient, createPublicClient } from 'viem';
import type { ChainConfig, NormalizedEvent } from '../../config/types.js';
import type { ChainScanner } from '../types.js';
import { decodeEvmEvent } from './decodeEvmEvent.js';
import { getEvmLogs } from './getEvmLogs.js';

const RPC_RETRY_COUNT = 3;
const RPC_RETRY_DELAY_MS = 1000;
const BLOCK_FETCH_CONCURRENCY = 10;

export class EvmScanner implements ChainScanner {
	readonly config: ChainConfig;
	private readonly client: PublicClient;

	constructor(config: ChainConfig, client?: PublicClient) {
		this.config = config;
		this.client =
			client ??
			createPublicClient({
				transport: http(config.rpcUrl, {
					retryCount: RPC_RETRY_COUNT,
					retryDelay: RPC_RETRY_DELAY_MS,
				}),
			});
	}

	async getLatestPosition(): Promise<number> {
		const blockNumber = await this.client.getBlockNumber();
		return Math.max(0, Number(blockNumber) - this.config.confirmations);
	}

	async getEvents(from: number, to: number): Promise<NormalizedEvent[]> {
		if (from > to) {
			throw new RangeError(`Invalid block range: from (${from}) > to (${to})`);
		}

		const logs = await getEvmLogs(
			this.client,
			this.config.contractAddress as `0x${string}`,
			BigInt(from),
			BigInt(to),
		);

		if (logs.length === 0) return [];

		// Validate all logs are mined (not pending) — after this, blockNumber/txHash/logIndex are guaranteed non-null
		const validatedLogs = logs.map((log) => {
			if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
				throw new Error(`Pending log encountered in block range ${from}-${to}`);
			}
			return {
				args: log.args,
				blockNumber: log.blockNumber,
				transactionHash: log.transactionHash,
				logIndex: log.logIndex,
			};
		});

		const uniqueBlockNumbers = [...new Set(validatedLogs.map((l) => l.blockNumber))];
		const blockTimestamps = new Map<bigint, Date>();
		for (let i = 0; i < uniqueBlockNumbers.length; i += BLOCK_FETCH_CONCURRENCY) {
			const chunk = uniqueBlockNumbers.slice(i, i + BLOCK_FETCH_CONCURRENCY);
			const blocks = await Promise.all(
				chunk.map((bn) => this.client.getBlock({ blockNumber: bn })),
			);
			for (const b of blocks) {
				blockTimestamps.set(b.number, new Date(Number(b.timestamp) * 1000));
			}
		}

		return validatedLogs.map((log) => {
			const timestamp = blockTimestamps.get(log.blockNumber);
			if (!timestamp) {
				throw new Error(`Block timestamp not found for block ${log.blockNumber}`);
			}
			return decodeEvmEvent(
				log.args,
				log.blockNumber,
				log.transactionHash,
				log.logIndex,
				timestamp,
				this.config.chainId,
			);
		});
	}
}
