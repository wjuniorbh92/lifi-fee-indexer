import { Address, type xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import type { NormalizedEvent } from '../../config/types.js';

/**
 * Decode a Stellar Soroban contract event into a NormalizedEvent.
 *
 * Expected event shape (FeesCollected-like):
 *   topic[0] = Symbol("FeesCollected")
 *   topic[1] = Address (token)
 *   topic[2] = Address (integrator)
 *   value    = Map { "integrator_fee": i128, "lifi_fee": i128 }
 *
 * This is a demo contract on Stellar testnet — not the actual LI.FI FeeCollector.
 */
export function decodeStellarEvent(event: rpc.Api.EventResponse, chainId: string): NormalizedEvent {
	const { topic, value, ledger, txHash, pagingToken, ledgerClosedAt } = event;

	if (topic.length < 3) {
		throw new Error(`Unexpected topic length ${topic.length} in event ${pagingToken}`);
	}

	const token = Address.fromScVal(topic[1]).toString();
	const integrator = Address.fromScVal(topic[2]).toString();

	const valueMap = parseValueMap(value);
	const integratorFee = valueMap.get('integrator_fee') ?? '0';
	const lifiFee = valueMap.get('lifi_fee') ?? '0';

	return {
		chainId,
		blockNumber: ledger,
		transactionHash: txHash,
		logIndex: logIndexFromPagingToken(pagingToken),
		token,
		integrator,
		integratorFee,
		lifiFee,
		timestamp: new Date(ledgerClosedAt),
	};
}

/**
 * Parse the event value as a Map of string → string(i128).
 * Handles both ScMap and ScVec encodings.
 */
function parseValueMap(scVal: xdr.ScVal): Map<string, string> {
	const result = new Map<string, string>();

	const map = scVal.map();
	if (map) {
		for (const entry of map) {
			const key = entry.key().sym().toString();
			const val = i128ToString(entry.val());
			result.set(key, val);
		}
	}

	return result;
}

/**
 * Convert an ScVal i128 to a decimal string.
 */
function i128ToString(scVal: xdr.ScVal): string {
	const i128Parts = scVal.i128();
	const lo = BigInt(i128Parts.lo().toXDR().readBigUInt64BE(0));
	const hi = BigInt(i128Parts.hi().toXDR().readBigInt64BE(0));
	const value = (hi << 64n) | lo;
	return value.toString();
}

/**
 * Extract a numeric log index from a Stellar paging token.
 * Paging tokens follow the pattern: "{ledger}-{txIndex}-{eventIndex}"
 * or are numeric. We use the last segment as the logIndex for dedup.
 */
function logIndexFromPagingToken(pagingToken: string): number {
	const parts = pagingToken.split('-');
	const lastPart = parts[parts.length - 1];
	const parsed = Number(lastPart);
	return Number.isFinite(parsed) ? parsed : 0;
}
