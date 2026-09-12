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


const niceStepAtOrBelow = (value) => {
  const safe = Math.abs(Number(value));
  if (!Number.isFinite(safe) || safe <= Number.EPSILON) return 0.01;
  const exponent = Math.floor(Math.log10(safe));
  const power = 10 ** exponent;
  const fraction = safe / power;
  const niceFraction = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return tidy(niceFraction * power);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function fitAdjustmentPlan({
  targetSlope,
  targetIntercept,
  xMin,
  xMax,
  yMin,
  yMax,
  slopeTolerance,
  interceptTolerance,
  slopeStep,
  interceptStep,
  challengeClicks = 8,
} = {}) {
  const m = Number(targetSlope);
  const b = Number(targetIntercept);
  const safeSlope = Number.isFinite(m) ? m : 0;
  const safeIntercept = Number.isFinite(b) ? b : 0;
  const xSpan = Math.max(Math.abs(Number(xMax) - Number(xMin)), Number.EPSILON);
  const ySpan = Math.max(Math.abs(Number(yMax) - Number(yMin)), Number.EPSILON);
  const naturalSlope = ySpan / xSpan;

  const defaultSlopeTolerance = Math.max(0.01, naturalSlope * 0.08, Math.abs(safeSlope) * 0.06);
  const defaultInterceptTolerance = Math.max(0.1, ySpan * 0.06);
  const safeSlopeTolerance = Number.isFinite(Number(slopeTolerance)) && Number(slopeTolerance) > 0
    ? Math.abs(Number(slopeTolerance))
    : tidy(defaultSlopeTolerance);
  const safeInterceptTolerance = Number.isFinite(Number(interceptTolerance)) && Number(interceptTolerance) > 0
    ? Math.abs(Number(interceptTolerance))
    : tidy(defaultInterceptTolerance);

  const resolvedSlopeStep = Number.isFinite(Number(slopeStep)) && Number(slopeStep) > 0
    ? Math.abs(Number(slopeStep))
    : niceStepAtOrBelow(safeSlopeTolerance / 2.5);
  const resolvedInterceptStep = Number.isFinite(Number(interceptStep)) && Number(interceptStep) > 0
    ? Math.abs(Number(interceptStep))
    : niceStepAtOrBelow(safeInterceptTolerance / 2.5);

  const clicks = clamp(Math.round(Number(challengeClicks) || 8), 6, 12);
  const slopeDelta = (safeSlope >= 0 ? -1 : 1) * resolvedSlopeStep * clicks;
  const centerX = (Number(xMin) + Number(xMax)) / 2;
  const lineShiftAtCenter = slopeDelta * (Number.isFinite(centerX) ? centerX : 1);
  const interceptDirection = Math.sign(lineShiftAtCenter || slopeDelta || 1);
  const interceptDelta = interceptDirection * resolvedInterceptStep * Math.max(6, clicks - 1);

  const slopeRadius = resolvedSlopeStep * (clicks + 12);
  const interceptRadius = resolvedInterceptStep * (clicks + 12);

  return {
    slope: {
      target: tidy(safeSlope),
      tolerance: tidy(safeSlopeTolerance),
      step: tidy(resolvedSlopeStep),
      start: tidy(safeSlope + slopeDelta),
      min: tidy(safeSlope - slopeRadius),
      max: tidy(safeSlope + slopeRadius),
    },
    intercept: {
      target: tidy(safeIntercept),
      tolerance: tidy(safeInterceptTolerance),
      step: tidy(resolvedInterceptStep),
      start: tidy(safeIntercept + interceptDelta),
      min: tidy(safeIntercept - interceptRadius),
      max: tidy(safeIntercept + interceptRadius),
    },
    challengeClicks: clicks,
  };
}

export function stepFitControl(value, delta, control = {}) {
  const step = Math.abs(Number(control.step));
  const current = Number(value);
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(current)) return current;
  const next = tidy(current + Number(delta) * step);
  const min = Number.isFinite(Number(control.min)) ? Number(control.min) : -Infinity;
  const max = Number.isFinite(Number(control.max)) ? Number(control.max) : Infinity;
  return tidy(clamp(next, min, max));
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
