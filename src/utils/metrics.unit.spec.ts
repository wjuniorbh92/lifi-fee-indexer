import { beforeEach, describe, expect, it } from 'vitest';
import { metrics } from './metrics.js';

describe('metrics', () => {
	beforeEach(() => {
		metrics.reset();
	});

	it('increments a counter', () => {
		metrics.increment('scanner_batches_total', { chainId: 'polygon' });
		metrics.increment('scanner_batches_total', { chainId: 'polygon' });

		const output = metrics.serialize();
		expect(output).toContain('scanner_batches_total{chainId="polygon"} 2');
	});

	it('tracks separate label combinations independently', () => {
		metrics.increment('scanner_errors_total', { chainId: 'polygon', type: 'rpc' });
		metrics.increment('scanner_errors_total', { chainId: 'stellar-testnet', type: 'decode' });

		const output = metrics.serialize();
		expect(output).toContain('scanner_errors_total{chainId="polygon",type="rpc"} 1');
		expect(output).toContain('scanner_errors_total{chainId="stellar-testnet",type="decode"} 1');
	});

	it('observes a histogram value into correct buckets', () => {
		metrics.observe('scanner_batch_duration_seconds', 0.5, { chainId: 'polygon' });
		metrics.observe('scanner_batch_duration_seconds', 2.5, { chainId: 'polygon' });

		const output = metrics.serialize();
		expect(output).toContain('scanner_batch_duration_seconds_bucket{chainId="polygon",le="1"} 1');
		expect(output).toContain('scanner_batch_duration_seconds_bucket{chainId="polygon",le="5"} 2');
		expect(output).toContain('scanner_batch_duration_seconds_count{chainId="polygon"} 2');
		expect(output).toContain('scanner_batch_duration_seconds_sum{chainId="polygon"} 3');
	});

	it('increments by a custom amount', () => {
		metrics.increment('scanner_events_inserted_total', { chainId: 'polygon' }, 42);

		const output = metrics.serialize();
		expect(output).toContain('scanner_events_inserted_total{chainId="polygon"} 42');
	});

	it('resets all metrics', () => {
		metrics.increment('scanner_batches_total', { chainId: 'polygon' });
		metrics.reset();

		const output = metrics.serialize();
		expect(output).toBe('');
	});
});
