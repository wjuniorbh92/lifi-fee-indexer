import type { PublicClient } from 'viem';
import { feesCollectedEvent } from './abi.js';

export type FeesCollectedLog = Awaited<ReturnType<typeof getEvmLogs>>[number];

export async function getEvmLogs(
	client: PublicClient,
	contractAddress: `0x${string}`,
	fromBlock: bigint,
	toBlock: bigint,
) {
	return client.getLogs({
		address: contractAddress,
		event: feesCollectedEvent,
		fromBlock,
		toBlock,
		strict: true,
	});
}
