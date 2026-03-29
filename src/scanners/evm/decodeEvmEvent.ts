import type { NormalizedEvent } from '../../config/types.js';
import { normalizeAddress } from '../../utils/normalizeAddress.js';

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
	const blockNum = Number(blockNumber);
	if (!Number.isSafeInteger(blockNum)) {
		throw new RangeError(`Block number ${blockNumber} exceeds safe integer range`);
	}
	return {
		chainId,
		blockNumber: blockNum,
		transactionHash,
		logIndex,
		token: args._token.toLowerCase(),
		integrator: normalizeAddress(args._integrator),
		integratorFee: args._integratorFee.toString(),
		lifiFee: args._lifiFee.toString(),
		timestamp,
	};
}
