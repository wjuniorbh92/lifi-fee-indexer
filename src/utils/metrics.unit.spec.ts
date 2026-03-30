import { beforeEach, describe, expect, it } from 'vitest';
import { metrics } from './metrics.js';

const COUNTER_BATCHES = 'scanner_batches_total';
const COUNTER_ERRORS = 'scanner_errors_total';
const COUNTER_EVENTS = 'scanner_events_inserted_total';
const HISTOGRAM_DURATION = 'scanner_batch_duration_seconds';
const LABEL_POLYGON = 'polygon';
const LABEL_STELLAR = 'stellar-testnet';
const OBSERVATION_SMALL = 0.5;
const OBSERVATION_LARGE = 2.5;
const CUSTOM_INCREMENT = 42;

describe('metrics', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('increments a counter', () => {
    metrics.increment(COUNTER_BATCHES, { chainId: LABEL_POLYGON });
    metrics.increment(COUNTER_BATCHES, { chainId: LABEL_POLYGON });

    const output = metrics.serialize();
    expect(output).toContain(
      `${COUNTER_BATCHES}{chainId="${LABEL_POLYGON}"} 2`,
    );
  });

  it('tracks separate label combinations independently', () => {
    metrics.increment(COUNTER_ERRORS, {
      chainId: LABEL_POLYGON,
      type: 'rpc',
    });
    metrics.increment(COUNTER_ERRORS, {
      chainId: LABEL_STELLAR,
      type: 'decode',
    });

    const output = metrics.serialize();
    expect(output).toContain(
      `${COUNTER_ERRORS}{chainId="${LABEL_POLYGON}",type="rpc"} 1`,
    );
    expect(output).toContain(
      `${COUNTER_ERRORS}{chainId="${LABEL_STELLAR}",type="decode"} 1`,
    );
  });

  it('observes a histogram value into correct buckets', () => {
    metrics.observe(HISTOGRAM_DURATION, OBSERVATION_SMALL, {
      chainId: LABEL_POLYGON,
    });
    metrics.observe(HISTOGRAM_DURATION, OBSERVATION_LARGE, {
      chainId: LABEL_POLYGON,
    });

    const output = metrics.serialize();
    expect(output).toContain(
      `${HISTOGRAM_DURATION}_bucket{chainId="${LABEL_POLYGON}",le="1"} 1`,
    );
    expect(output).toContain(
      `${HISTOGRAM_DURATION}_bucket{chainId="${LABEL_POLYGON}",le="5"} 2`,
    );
    expect(output).toContain(
      `${HISTOGRAM_DURATION}_count{chainId="${LABEL_POLYGON}"} 2`,
    );
    expect(output).toContain(
      `${HISTOGRAM_DURATION}_sum{chainId="${LABEL_POLYGON}"} ${OBSERVATION_SMALL + OBSERVATION_LARGE}`,
    );
  });

  it('increments by a custom amount', () => {
    metrics.increment(
      COUNTER_EVENTS,
      { chainId: LABEL_POLYGON },
      CUSTOM_INCREMENT,
    );

    const output = metrics.serialize();
    expect(output).toContain(
      `${COUNTER_EVENTS}{chainId="${LABEL_POLYGON}"} ${CUSTOM_INCREMENT}`,
    );
  });

  it('resets all metrics', () => {
    metrics.increment(COUNTER_BATCHES, { chainId: LABEL_POLYGON });
    metrics.reset();

    const output = metrics.serialize();
    expect(output).toBe('');
  });
});
