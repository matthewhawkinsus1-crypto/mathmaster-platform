const MAX_SAMPLES = 200;
const SAFE_DIMENSIONS = new Set(['flow', 'source', 'status', 'toolId', 'cached', 'deviceClass']);
const samples = new Map();
const listeners = new Set();

const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now());

const sanitizeDimensions = (dimensions = {}) => Object.fromEntries(
  Object.entries(dimensions)
    .filter(([key, value]) => SAFE_DIMENSIONS.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 80) : value]),
);

export const recordPerformanceSample = (name, durationMs, dimensions = {}) => {
  if (!/^[a-z][a-z0-9_]*_ms$/.test(String(name)) || !Number.isFinite(durationMs) || durationMs < 0) return null;
  const sample = Object.freeze({
    name,
    durationMs: Math.round(durationMs * 10) / 10,
    at: Date.now(),
    dimensions: Object.freeze(sanitizeDimensions(dimensions)),
  });
  const bucket = samples.get(name) || [];
  bucket.push(sample);
  if (bucket.length > MAX_SAMPLES) bucket.splice(0, bucket.length - MAX_SAMPLES);
  samples.set(name, bucket);
  listeners.forEach((listener) => listener(sample));
  return sample;
};

export const startPerformanceSpan = (name, dimensions = {}) => {
  const startedAt = clock();
  let finished = false;
  return {
    finish(extraDimensions = {}) {
      if (finished) return null;
      finished = true;
      return recordPerformanceSample(name, clock() - startedAt, { ...dimensions, ...extraDimensions });
    },
  };
};

export const measurePerformanceOperation = async (name, operation, dimensions = {}) => {
  const span = startPerformanceSpan(name, dimensions);
  try {
    const result = await operation();
    span.finish({ status: 'success' });
    return result;
  } catch (error) {
    span.finish({ status: 'failed' });
    throw error;
  }
};

const percentile = (values, quantile) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
};

export const getPerformanceDiagnostics = () => Object.fromEntries(
  [...samples.entries()].map(([name, bucket]) => {
    const durations = bucket.map((sample) => sample.durationMs);
    return [name, {
      count: durations.length,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      latest: bucket.at(-1),
    }];
  }),
);

export const subscribeToPerformanceSamples = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearPerformanceDiagnostics = () => samples.clear();

// Deliberately exposes aggregates and allow-listed dimensions only. Answers,
// prompts, keys, seeds, user ids, and arbitrary caller metadata cannot enter
// this diagnostics channel.
export const installPerformanceDiagnostics = (target = globalThis) => {
  if (!target || typeof target !== 'object') return;
  Object.defineProperty(target, '__MATHMASTER_PERFORMANCE__', {
    configurable: true,
    value: Object.freeze({ snapshot: getPerformanceDiagnostics }),
  });
};
