import type { NormalizedEvent } from '../../config/types.js';

export function decodeEvmEvent(
	args: {
		_token: `0x${string}`;
		_integrator: `0x${string}`;
		_integratorFee: bigint;
		_lifiFee: bigint;
	},
	blockNumber: bigint,
	transactionHash: `0x${string}`,
	logIndex: number,
	timestamp: Date,
	chainId: string,
): NormalizedEvent {
	return {
		chainId,
		blockNumber: Number(blockNumber),
		transactionHash,
		logIndex,
		token: args._token.toLowerCase(),
		integrator: args._integrator.toLowerCase(),
		integratorFee: args._integratorFee.toString(),
		lifiFee: args._lifiFee.toString(),
		timestamp,
	};
}
