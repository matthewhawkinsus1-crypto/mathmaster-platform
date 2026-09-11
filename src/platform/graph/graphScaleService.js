const DEFAULT_MAJOR_TICKS = 9;
export const MAX_MAJOR_TICKS = 12;

const finite = (value) => Number.isFinite(Number(value));
const tidy = (value) => Number(Number(value).toPrecision(12));

export function niceStep(span, targetTicks = DEFAULT_MAJOR_TICKS) {
  const safeSpan = Math.abs(Number(span));
  const target = Math.max(2, Math.min(MAX_MAJOR_TICKS, Number(targetTicks) || DEFAULT_MAJOR_TICKS));
  if (!Number.isFinite(safeSpan) || safeSpan <= Number.EPSILON) return 1;
  const rough = safeSpan / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return tidy(niceFraction * power);
}

export function majorTicks(minimum, maximum, requestedStep, options = {}) {
  const min = Number(minimum);
  const max = Number(maximum);
  const maxTicks = Math.max(2, Math.min(MAX_MAJOR_TICKS, Number(options.maxTicks) || MAX_MAJOR_TICKS));
  if (!finite(min) || !finite(max) || max <= min) return [];
  const span = max - min;
  let step = Number(requestedStep);
  if (!Number.isFinite(step) || step <= 0 || span / step > maxTicks - 1) {
    step = niceStep(span, maxTicks - 1);
  }
  // A rounded "nice" step can still put one extra endpoint on the axis.
  while (Math.floor(max / step) - Math.ceil(min / step) + 1 > maxTicks) {
    step = niceStep(step * maxTicks, maxTicks - 1);
  }
  const firstIndex = Math.ceil(min / step - 1e-10);
  const lastIndex = Math.floor(max / step + 1e-10);
  const ticks = [];
  for (let index = firstIndex; index <= lastIndex && ticks.length < maxTicks; index += 1) {
    ticks.push(tidy(index * step));
  }
  return ticks;
}

export function fitDataBounds(values, options = {}) {
  const data = values.map(Number).filter(Number.isFinite);
  const include = (options.include || []).map(Number).filter(Number.isFinite);
  const all = [...data, ...include];
  if (!all.length) return { min: -1, max: 1, step: 0.2 };
  let min = Math.min(...all);
  let max = Math.max(...all);
  const magnitude = Math.max(1, Math.abs(min), Math.abs(max));
  if (max - min <= magnitude * 1e-9) {
    min -= magnitude * 0.1;
    max += magnitude * 0.1;
  }
  const padding = (max - min) * Math.max(0, Number(options.paddingRatio ?? 0.08));
  min -= padding;
  max += padding;
  if (options.symmetricAroundZero) {
    const radius = Math.max(Math.abs(min), Math.abs(max), Number(options.minimumRadius) || 0);
    min = -radius;
    max = radius;
  }
  const step = niceStep(max - min);
  return {
    min: tidy(Math.floor(min / step) * step),
    max: tidy(Math.ceil(max / step) * step),
    step,
  };
}

export function residualScale(residuals) {
  return fitDataBounds(residuals, {
    include: [0],
    symmetricAroundZero: true,
    minimumRadius: 1,
    paddingRatio: 0.1,
  });
}

export function interactionIncrements(valueOrScale) {
  const scale = Math.max(Math.abs(Number(valueOrScale) || 0), Number.EPSILON);
  // One order below the value's magnitude: 22,000 moves by thousands while
  // 0.7 still moves by tenths. Fine/coarse modifiers then cover precision and
  // rapid keyboard/touch adjustment without dataset-specific constants.
  const exponent = Math.floor(Math.log10(scale));
  const normal = 10 ** (exponent - (scale >= 10 ? 1 : 0));
  return { fine: tidy(normal / 10), normal, coarse: tidy(normal * 10) };
}

export function graphHealth({ xMin, xMax, yMin, yMax, xTicks = [], yTicks = [], points = [], residual = false }) {
  const issues = [];
  if (![xMin, xMax, yMin, yMax].every(finite) || !(xMax > xMin) || !(yMax > yMin)) issues.push('invalid-bounds');
  if (xTicks.length > MAX_MAJOR_TICKS || yTicks.length > MAX_MAJOR_TICKS) issues.push('excessive-ticks');
  const outside = points.some((point) => {
    const x = Number(Array.isArray(point) ? point[0] : point?.x);
    const y = Number(Array.isArray(point) ? point[1] : point?.y);
    return finite(x) && finite(y) && (x < xMin || x > xMax || y < yMin || y > yMax);
  });
  if (outside) issues.push('data-outside-bounds');
  if (residual && !(yMin <= 0 && yMax >= 0)) issues.push('residual-excludes-zero');
  return issues;
}
