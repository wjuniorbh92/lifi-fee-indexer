import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { decodeStellarEvent } from './decodeStellarEvent.js';

const MOCK_LEDGER = 500100;
const MOCK_DECODE_LEDGER = 600200;
const MOCK_LOG_INDEX = 7;

function makeScAddress(publicKey: string) {
  return Address.fromString(publicKey).toScVal();
}

function makeFeeEvent(
  overrides: Partial<rpc.Api.EventResponse> = {},
): rpc.Api.EventResponse {
  const payerKey = Keypair.random().publicKey();

  return {
    id: '0007508891323596800-0000000001',
    type: 'contract' as const,
    ledger: MOCK_LEDGER,
    ledgerClosedAt: '2026-01-15T12:00:00Z',
    inSuccessfulContractCall: true,
    txHash: 'abc123def456',
    topic: [nativeToScVal('fee', { type: 'symbol' }), makeScAddress(payerKey)],
    value: nativeToScVal(200n, { type: 'i128' }),
    ...overrides,
  } as rpc.Api.EventResponse;
}

function makeTransferEvent(
  overrides: Partial<rpc.Api.EventResponse> = {},
): rpc.Api.EventResponse {
  const fromKey = Keypair.random().publicKey();
  const toKey = Keypair.random().publicKey();

  return {
    id: '0007508891323596800-0000000002',
    type: 'contract' as const,
    ledger: MOCK_LEDGER,
    ledgerClosedAt: '2026-01-15T13:00:00Z',
    inSuccessfulContractCall: true,
    txHash: 'tx-transfer-abc',
    contractId: new Contract(
      'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    ),
    topic: [
      nativeToScVal('transfer', { type: 'symbol' }),
      makeScAddress(fromKey),
      makeScAddress(toKey),
    ],
    value: nativeToScVal(5000n, { type: 'i128' }),
    ...overrides,
  } as rpc.Api.EventResponse;
}

describe('decodeStellarEvent', () => {
  describe('fee events', () => {
    it('decodes a fee event with payer address and amount', () => {
      const payerKey = Keypair.random().publicKey();
      const event = makeFeeEvent({
        topic: [
          nativeToScVal('fee', { type: 'symbol' }),
          makeScAddress(payerKey),
        ],
        value: nativeToScVal(5000n, { type: 'i128' }),
        ledger: MOCK_DECODE_LEDGER,
        txHash: 'tx-hash-abc',
        id: '0007508891323596800-0000000005',
        ledgerClosedAt: '2026-03-01T10:30:00Z',
      });

      const result = decodeStellarEvent(event, 'stellar-testnet');

      expect(result).toEqual({
        chainId: 'stellar-testnet',
        blockNumber: MOCK_DECODE_LEDGER,
        transactionHash: 'tx-hash-abc',
        logIndex: 5,
        token: 'native',
        integrator: payerKey,
        integratorFee: '5000',
        lifiFee: '0',
        timestamp: new Date('2026-03-01T10:30:00Z'),
      });
    });

    it('stores fee amount as decimal string', () => {
      const event = makeFeeEvent({
        value: nativeToScVal(999999999999999999n, { type: 'i128' }),
      });

      const result = decodeStellarEvent(event, 'stellar-testnet');
      expect(result.integratorFee).toBe('999999999999999999');
      expect(result.lifiFee).toBe('0');
    });

    it('sets token to native for fee events', () => {
      const event = makeFeeEvent();
      const result = decodeStellarEvent(event, 'stellar-testnet');
      expect(result.token).toBe('native');
    });
  });

  describe('transfer events', () => {
    it('decodes a transfer event with to address and contract token', () => {
      const toKey = Keypair.random().publicKey();
      const fromKey = Keypair.random().publicKey();
      const event = makeTransferEvent({
        topic: [
          nativeToScVal('transfer', { type: 'symbol' }),
          makeScAddress(fromKey),
          makeScAddress(toKey),
        ],
        value: nativeToScVal(10000n, { type: 'i128' }),
        contractId: new Contract(
          'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        ),
      });

      const result = decodeStellarEvent(event, 'stellar-testnet');

      expect(result.integrator).toBe(toKey);
      expect(result.integratorFee).toBe('10000');
      expect(result.token).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      );
    });
  });

  describe('error handling', () => {
    it('returns undefined for unknown event types', () => {
      const event = makeFeeEvent({
        topic: [
          nativeToScVal('unknown_event', { type: 'symbol' }),
          makeScAddress(Keypair.random().publicKey()),
        ],
      });

      expect(decodeStellarEvent(event, 'stellar-testnet')).toBeUndefined();
    });

    it('throws on fee event with too few topics', () => {
      const event = makeFeeEvent({
        topic: [nativeToScVal('fee', { type: 'symbol' })],
      });

      expect(() => decodeStellarEvent(event, 'stellar-testnet')).toThrow(
        'Fee event has 1 topics',
      );
    });

    it('extracts logIndex from paging token last segment', () => {
      const event = makeFeeEvent({
        id: `0007508891323596800-000000000${MOCK_LOG_INDEX}`,
      });
      const result = decodeStellarEvent(event, 'stellar-testnet');
      expect(result?.logIndex).toBe(MOCK_LOG_INDEX);
    });
  });
});
