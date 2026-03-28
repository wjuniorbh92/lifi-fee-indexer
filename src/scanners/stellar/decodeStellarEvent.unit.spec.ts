import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { decodeStellarEvent } from './decodeStellarEvent.js';

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
		ledger: 500100,
		ledgerClosedAt: '2026-01-15T12:00:00Z',
		pagingToken: '500100-1-3',
		inSuccessfulContractCall: true,
		txHash: 'abc123def456',
		topic: [
			nativeToScVal('FeesCollected', { type: 'symbol' }),
			makeScAddress(tokenKey),
			makeScAddress(integratorKey),
		],
		value: makeValueMap(1000000n, 50000n),
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
			ledger: 600200,
			txHash: 'tx-hash-abc',
			pagingToken: '600200-2-5',
			ledgerClosedAt: '2026-03-01T10:30:00Z',
		});

		const result = decodeStellarEvent(event, 'stellar-testnet');

		expect(result).toEqual({
			chainId: 'stellar-testnet',
			blockNumber: 600200,
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
		const event = makeMockEvent({ pagingToken: '500100-0-7' });
		const result = decodeStellarEvent(event, 'stellar-testnet');
		expect(result.logIndex).toBe(7);
	});

	it('handles numeric paging token', () => {
		const event = makeMockEvent({ pagingToken: '12345' });
		const result = decodeStellarEvent(event, 'stellar-testnet');
		expect(result.logIndex).toBe(12345);
	});

	it('throws on events with fewer than 3 topics', () => {
		const event = makeMockEvent({
			topic: [nativeToScVal('FeesCollected', { type: 'symbol' })],
			pagingToken: '500100-0-1',
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
