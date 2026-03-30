const DEFAULT_HISTOGRAM_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30, 60];
const BUCKET_SUFFIX = '_bucket';
const SUM_SUFFIX = '_sum';
const COUNT_SUFFIX = '_count';
const POSITIVE_INFINITY_LABEL = '+Inf';
const LINE_SEPARATOR = '\n';

interface CounterEntry {
  value: number;
}

interface HistogramEntry {
  buckets: Map<number, number>;
  sum: number;
  count: number;
}

function labelsToKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

const counters = new Map<string, Map<string, CounterEntry>>();
const histograms = new Map<string, Map<string, HistogramEntry>>();

function increment(
  name: string,
  labels: Record<string, string>,
  amount = 1,
): void {
  if (!counters.has(name)) counters.set(name, new Map());
  const key = labelsToKey(labels);
  const map = counters.get(name) as Map<string, CounterEntry>;
  const entry = map.get(key);
  if (entry) {
    entry.value += amount;
  } else {
    map.set(key, { value: amount });
  }
}

function observe(
  name: string,
  value: number,
  labels: Record<string, string>,
): void {
  if (!histograms.has(name)) histograms.set(name, new Map());
  const key = labelsToKey(labels);
  const map = histograms.get(name) as Map<string, HistogramEntry>;
  let entry = map.get(key);
  if (!entry) {
    entry = {
      buckets: new Map(DEFAULT_HISTOGRAM_BUCKETS.map((b) => [b, 0])),
      sum: 0,
      count: 0,
    };
    map.set(key, entry);
  }
  entry.sum += value;
  entry.count += 1;
  for (const bucket of DEFAULT_HISTOGRAM_BUCKETS) {
    if (value <= bucket) {
      entry.buckets.set(bucket, (entry.buckets.get(bucket) ?? 0) + 1);
    }
  }
}

function serialize(): string {
  const lines: string[] = [];

  for (const [name, entries] of counters) {
    for (const [key, entry] of entries) {
      lines.push(`${name}{${key}} ${entry.value}`);
    }
  }

  for (const [name, entries] of histograms) {
    for (const [key, entry] of entries) {
      for (const [bucket, count] of entry.buckets) {
        lines.push(`${name}${BUCKET_SUFFIX}{${key},le="${bucket}"} ${count}`);
      }
      lines.push(
        `${name}${BUCKET_SUFFIX}{${key},le="${POSITIVE_INFINITY_LABEL}"} ${entry.count}`,
      );
      lines.push(`${name}${SUM_SUFFIX}{${key}} ${entry.sum}`);
      lines.push(`${name}${COUNT_SUFFIX}{${key}} ${entry.count}`);
    }
  }

  return lines.join(LINE_SEPARATOR);
}

function reset(): void {
  counters.clear();
  histograms.clear();
}

export const metrics = { increment, observe, serialize, reset };
