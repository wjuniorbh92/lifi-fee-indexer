import { Address, scValToNative, type xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import type { NormalizedEvent } from '../../config/types.js';

const NATIVE_TOKEN_ID = 'native';
const MIN_FEE_TOPIC_LENGTH = 2;

/**
 * Decode a Stellar Soroban contract event into a NormalizedEvent.
 *
 * Supports the real testnet oracle contract (CDLZFC3...):
 *   "fee" events:
 *     topic[0] = Symbol("fee")
 *     topic[1] = Address (account paying the fee)
 *     value    = i128 (fee amount in stroops)
 *
 *   "transfer" events (SEP-0041):
 *     topic[0] = Symbol("transfer")
 *     topic[1] = Address (from)
 *     topic[2] = Address (to)
 *     value    = i128 (amount)
 */
export function decodeStellarEvent(event: rpc.Api.EventResponse, chainId: string): NormalizedEvent {
	const { topic, value, ledger, txHash, id, ledgerClosedAt, contractId } = event;

	const eventName = scValToNative(topic[0]) as string;

	if (eventName === 'fee') {
		return decodeFeeEvent(topic, value, ledger, txHash, id, ledgerClosedAt, chainId);
	}

	if (eventName === 'transfer') {
		return decodeTransferEvent(
			topic,
			value,
			ledger,
			txHash,
			id,
			ledgerClosedAt,
			chainId,
			contractId,
		);
	}

	throw new Error(`Unknown event type "${eventName}" in event ${id}`);
}

/**
 * Decode a "fee" event from the oracle contract.
 *   topic[0] = Symbol("fee")
 *   topic[1] = Address (payer)
 *   value    = i128 (fee amount)
 */
function decodeFeeEvent(
	topic: xdr.ScVal[],
	value: xdr.ScVal,
	ledger: number,
	txHash: string,
	eventId: string,
	ledgerClosedAt: string,
	chainId: string,
): NormalizedEvent {
	if (topic.length < MIN_FEE_TOPIC_LENGTH) {
		throw new Error(`Fee event has ${topic.length} topics, expected >= ${MIN_FEE_TOPIC_LENGTH}`);
	}

	const integrator = Address.fromScVal(topic[1]).toString();
	const amount = (scValToNative(value) as bigint).toString();

	return {
		chainId,
		blockNumber: ledger,
		transactionHash: txHash,
		logIndex: logIndexFromEventId(eventId),
		token: NATIVE_TOKEN_ID,
		integrator,
		integratorFee: amount,
		lifiFee: '0',
		timestamp: new Date(ledgerClosedAt),
	};
}

const MIN_TRANSFER_TOPIC_LENGTH = 3;

/**
 * Decode a "transfer" event (SEP-0041 Token Interface).
 *   topic[0] = Symbol("transfer")
 *   topic[1] = Address (from)
 *   topic[2] = Address (to)
 *   value    = i128 (amount)
 */
function decodeTransferEvent(
	topic: xdr.ScVal[],
	value: xdr.ScVal,
	ledger: number,
	txHash: string,
	eventId: string,
	ledgerClosedAt: string,
	chainId: string,
	contractId?: { toString(): string },
): NormalizedEvent {
	if (topic.length < MIN_TRANSFER_TOPIC_LENGTH) {
		throw new Error(
			`Transfer event has ${topic.length} topics, expected >= ${MIN_TRANSFER_TOPIC_LENGTH}`,
		);
	}

	const to = Address.fromScVal(topic[2]).toString();
	const amount = (scValToNative(value) as bigint).toString();
	const token = contractId?.toString() ?? NATIVE_TOKEN_ID;

	return {
		chainId,
		blockNumber: ledger,
		transactionHash: txHash,
		logIndex: logIndexFromEventId(eventId),
		token,
		integrator: to,
		integratorFee: amount,
		lifiFee: '0',
		timestamp: new Date(ledgerClosedAt),
	};
}

/**
 * Extract a numeric log index from a Stellar paging token.
 * Paging tokens are numeric IDs like "0007508891323596800-0000000001".
 * We use the last segment as the logIndex for dedup.
 */
function logIndexFromEventId(eventId: string): number {
	const parts = eventId.split('-');
	const lastPart = parts[parts.length - 1];
	const parsed = Number(lastPart);
	return Number.isFinite(parsed) ? parsed : 0;
}
