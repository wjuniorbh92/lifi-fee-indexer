import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { decodeStellarEvent } from './decodeStellarEvent.js';

const MOCK_LEDGER = 500100;
const MOCK_DECODE_LEDGER = 600200;
const MOCK_INTEGRATOR_FEE = 1000000n;
const MOCK_LIFI_FEE = 50000n;
const MOCK_LOG_INDEX = 7;
const MOCK_NUMERIC_PAGING_TOKEN = 12345;

function makeScAddress(publicKey: string): xdr.ScVal {
	return Address.fromString(publicKey).toScVal();
}

function makeValueMap(integratorFee: bigint, lifiFee: bigint): xdr.ScVal {
	return xdr.ScVal.scvMap([
		new xdr.ScMapEntry({
			key: nativeToScVal('integrator_fee', { type: 'symbol' }),
			val: nativeToScVal(integratorFee, { type: 'i128' }),
		}),
		new xdr.ScMapEntry({
			key: nativeToScVal('lifi_fee', { type: 'symbol' }),
			val: nativeToScVal(lifiFee, { type: 'i128' }),
		}),
	]);
}

function makeMockEvent(overrides: Partial<rpc.Api.EventResponse> = {}): rpc.Api.EventResponse {
	const tokenKey = Keypair.random().publicKey();
	const integratorKey = Keypair.random().publicKey();

	return {
		id: 'test-event-id',
		type: 'contract' as const,
		ledger: MOCK_LEDGER,
		ledgerClosedAt: '2026-01-15T12:00:00Z',
		pagingToken: `${MOCK_LEDGER}-1-3`,
		inSuccessfulContractCall: true,
		txHash: 'abc123def456',
		topic: [
			nativeToScVal('FeesCollected', { type: 'symbol' }),
			makeScAddress(tokenKey),
			makeScAddress(integratorKey),
		],
		value: makeValueMap(MOCK_INTEGRATOR_FEE, MOCK_LIFI_FEE),
		...overrides,
	} as rpc.Api.EventResponse;
}

describe('decodeStellarEvent', () => {
	it('decodes a valid FeesCollected event', () => {
		const tokenKey = Keypair.random().publicKey();
		const integratorKey = Keypair.random().publicKey();

		const event = makeMockEvent({
			topic: [
				nativeToScVal('FeesCollected', { type: 'symbol' }),
				makeScAddress(tokenKey),
				makeScAddress(integratorKey),
			],
			value: makeValueMap(5000000n, 100000n),
			ledger: MOCK_DECODE_LEDGER,
			txHash: 'tx-hash-abc',
			pagingToken: `${MOCK_DECODE_LEDGER}-2-5`,
			ledgerClosedAt: '2026-03-01T10:30:00Z',
		});

		const result = decodeStellarEvent(event, 'stellar-testnet');

		expect(result).toEqual({
			chainId: 'stellar-testnet',
			blockNumber: MOCK_DECODE_LEDGER,
			transactionHash: 'tx-hash-abc',
			logIndex: 5,
			token: tokenKey,
			integrator: integratorKey,
			integratorFee: '5000000',
			lifiFee: '100000',
			timestamp: new Date('2026-03-01T10:30:00Z'),
		});
	});

	it('extracts logIndex from paging token last segment', () => {
		const event = makeMockEvent({ pagingToken: `${MOCK_LEDGER}-0-${MOCK_LOG_INDEX}` });
		const result = decodeStellarEvent(event, 'stellar-testnet');
		expect(result.logIndex).toBe(MOCK_LOG_INDEX);
	});

	it('handles numeric paging token', () => {
		const event = makeMockEvent({ pagingToken: String(MOCK_NUMERIC_PAGING_TOKEN) });
		const result = decodeStellarEvent(event, 'stellar-testnet');
		expect(result.logIndex).toBe(MOCK_NUMERIC_PAGING_TOKEN);
	});

	it('throws on events with fewer than 3 topics', () => {
		const event = makeMockEvent({
			topic: [nativeToScVal('FeesCollected', { type: 'symbol' })],
			pagingToken: `${MOCK_LEDGER}-0-1`,
		});

		expect(() => decodeStellarEvent(event, 'stellar-testnet')).toThrow('Unexpected topic length 1');
	});

	it('stores fees as decimal strings (not hex)', () => {
		const event = makeMockEvent({
			value: makeValueMap(999999999999999999n, 123456789012345678n),
		});

		const result = decodeStellarEvent(event, 'stellar-testnet');
		expect(result.integratorFee).toBe('999999999999999999');
		expect(result.lifiFee).toBe('123456789012345678');
	});
});
