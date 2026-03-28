import { describe, expect, it } from 'vitest';
import { decodeEvmEvent } from './decodeEvmEvent.js';

const CHAIN_ID = 'polygon';
const TIMESTAMP = new Date('2025-12-01T12:00:00Z');

const defaultArgs = {
	_token: '0xB7866Bf99A9AC64520c43246819F2B43E532deE1' as `0x${string}`,
	_integrator: '0xe165726003c42Edde42615cE591e25665a6a40a4' as `0x${string}`,
	_integratorFee: 3616000000000000000000n,
	_lifiFee: 678000000000000000000n,
};

const defaultBlockNumber = 84797174n;
const defaultTxHash =
	'0x13f791d14a9286d2503df5112f8b5cd84f5c06eaf0183ca59342c3a2f8f08f9b' as `0x${string}`;
const defaultLogIndex = 5;

describe('decodeEvmEvent', () => {
	it('normalizes a standard ERC-20 fee event', () => {
		const result = decodeEvmEvent(
			defaultArgs,
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);

		expect(result).toEqual({
			chainId: 'polygon',
			blockNumber: 84797174,
			transactionHash: defaultTxHash,
			logIndex: 5,
			token: '0xb7866bf99a9ac64520c43246819f2b43e532dee1',
			integrator: '0xe165726003c42edde42615ce591e25665a6a40a4',
			integratorFee: '3616000000000000000000',
			lifiFee: '678000000000000000000',
			timestamp: TIMESTAMP,
		});
	});

	it('lowercases addresses', () => {
		const result = decodeEvmEvent(
			defaultArgs,
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);
		expect(result.token).toBe(result.token.toLowerCase());
		expect(result.integrator).toBe(result.integrator.toLowerCase());
	});

	it('handles native token (zero address)', () => {
		const result = decodeEvmEvent(
			{
				_token: '0x0000000000000000000000000000000000000000',
				_integrator: '0x37E945Ed26B17A631d7Df3382C2808cc1c7f07Ed',
				_integratorFee: 75000000000000000n,
				_lifiFee: 56250000000000000n,
			},
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);

		expect(result.token).toBe('0x0000000000000000000000000000000000000000');
		expect(result.integratorFee).toBe('75000000000000000');
	});

	it('handles lifiFee = 0', () => {
		const result = decodeEvmEvent(
			{
				_token: '0x0000000000000000000000000000000000000000',
				_integrator: '0x9899F62ecF16b70bFFC88677023026c47E48C218',
				_integratorFee: 35741321110863321n,
				_lifiFee: 0n,
			},
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);

		expect(result.lifiFee).toBe('0');
	});

	it('handles very small amounts (USDT 6 decimals)', () => {
		const result = decodeEvmEvent(
			{
				_token: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
				_integrator: '0x5416c013D68D29F79BAe815008f5d72c48E011FE',
				_integratorFee: 3500n,
				_lifiFee: 2500n,
			},
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);

		expect(result.integratorFee).toBe('3500');
		expect(result.lifiFee).toBe('2500');
	});

	it('converts blockNumber from bigint to number', () => {
		const result = decodeEvmEvent(
			defaultArgs,
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);
		expect(typeof result.blockNumber).toBe('number');
		expect(result.blockNumber).toBe(84797174);
	});

	it('stores BigInt fees as decimal strings', () => {
		const result = decodeEvmEvent(
			defaultArgs,
			defaultBlockNumber,
			defaultTxHash,
			defaultLogIndex,
			TIMESTAMP,
			CHAIN_ID,
		);
		expect(typeof result.integratorFee).toBe('string');
		expect(typeof result.lifiFee).toBe('string');
		expect(result.integratorFee).toBe('3616000000000000000000');
	});
});
