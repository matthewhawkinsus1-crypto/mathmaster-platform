import { nearlyEqual } from '../shared/toolMath.js';

export const parabolaFeatures = ({ h = 0, k = 0, p = 1, orientation = 'vertical' } = {}) => {
  const H = Number(h); const K = Number(k); const P = Number(p);
  if (!Number.isFinite(P) || nearlyEqual(P, 0)) throw new Error('Parabola parameter p must be nonzero.');
  const vertical = orientation !== 'horizontal';
  const focus = vertical ? [H, K + P] : [H + P, K];
  const directrix = vertical ? { kind: 'horizontal', value: K - P } : { kind: 'vertical', value: H - P };
  const axis = vertical ? { kind: 'vertical', value: H } : { kind: 'horizontal', value: K };
  const latusRectumEndpoints = vertical
    ? [[H - 2 * Math.abs(P), K + P], [H + 2 * Math.abs(P), K + P]]
    : [[H + P, K - 2 * Math.abs(P)], [H + P, K + 2 * Math.abs(P)]];
  const opens = vertical ? (P > 0 ? 'up' : 'down') : (P > 0 ? 'right' : 'left');
  return { vertex: [H, K], focus, directrix, axis, latusRectumEndpoints, latusRectumLength: 4 * Math.abs(P), opens };
};

export const parabolaFunction = ({ h = 0, k = 0, p = 1, orientation = 'vertical' } = {}) => {
  const H = Number(h); const K = Number(k); const P = Number(p);
  if (orientation === 'horizontal') return null;
  return (x) => ((Number(x) - H) ** 2) / (4 * P) + K;
};

export const horizontalParabolaX = ({ h = 0, k = 0, p = 1 } = {}, y) => ((Number(y) - Number(k)) ** 2) / (4 * Number(p)) + Number(h);

export const pointDistances = (spec = {}, point = [0, 0]) => {
  const features = parabolaFeatures(spec);
  const [x, y] = point.map(Number);
  const focusDistance = Math.hypot(x - features.focus[0], y - features.focus[1]);
  const directrixDistance = features.directrix.kind === 'horizontal'
    ? Math.abs(y - features.directrix.value)
    : Math.abs(x - features.directrix.value);
  return { focusDistance, directrixDistance, difference: focusDistance - directrixDistance, onParabola: nearlyEqual(focusDistance, directrixDistance, 1e-5) };
};

export const standardEquationParts = ({ h = 0, k = 0, p = 1, orientation = 'vertical' } = {}) => ({
  squaredVariable: orientation === 'horizontal' ? 'y' : 'x',
  linearVariable: orientation === 'horizontal' ? 'x' : 'y',
  h: Number(h), k: Number(k), coefficient: 4 * Number(p), orientation,
});

export const geometryFromFocusDirectrix = ({ focus, directrix } = {}) => {
  if (!Array.isArray(focus) || focus.length !== 2 || !directrix?.kind || !Number.isFinite(Number(directrix.value))) return null;
  const [fx, fy] = focus.map(Number);
  // MED-02: a focus of ['a', null] passes the Array/length check and produces a
  // NaN vertex that renders as an invisible parabola with no error.
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  const d = Number(directrix.value);
  if (directrix.kind === 'horizontal') {
    const k = (fy + d) / 2;
    const p = fy - k;
    if (nearlyEqual(p, 0)) return null;
    return { h: fx, k, p, orientation: 'vertical' };
  }
  if (directrix.kind === 'vertical') {
    const h = (fx + d) / 2;
    const p = fx - h;
    if (nearlyEqual(p, 0)) return null;
    return { h, k: fy, p, orientation: 'horizontal' };
  }
  return null;
};

export const sampleParabolaPoint = (spec = {}, offset = 2) => {
  const { h = 0, k = 0, p = 1, orientation = 'vertical' } = spec;
  if (orientation === 'horizontal') {
    const y = Number(k) + Number(offset);
    return [horizontalParabolaX(spec, y), y];
  }
  const x = Number(h) + Number(offset);
  const y = ((x - Number(h)) ** 2) / (4 * Number(p)) + Number(k);
  return [x, y];
};
