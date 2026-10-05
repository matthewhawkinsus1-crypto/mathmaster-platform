/*
 * HOW A SYSTEMS WORKSPACE INEQUALITY OR LINE IS WRITTEN ON SCREEN.
 *
 * Constraint labels used to be assembled from the raw coefficients, so a
 * student read "y ≥ 1x + 1", "y ≥ 0x + 0" and "y ≤ -1x + 4" (with a hyphen for
 * a minus) next to a prompt that said "y ≥ x + 1" — the label of the thing they
 * were building did not look like the mathematics they were given. These
 * helpers write it the way the prompt does: no 1 or 0 coefficients, no "+ 0",
 * a true minus sign, ≤ and ≥.
 *
 * Display only. Grading and the canonical engine never read these strings, and
 * nothing here derives a label from a hidden expected constraint: callers pass
 * the authored (source) form or the student's own work.
 *
 * No React here, so tests/platform/systemsWorkspaceFormat.test.mjs runs it in node.
 */

export const MINUS = '−';

const numberText = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  // Authored decimals stay as authored (−0.5, not −1/2); float noise from a
  // computed value does not reach the screen.
  const tidy = Number(number.toFixed(6));
  return String(Object.is(tidy, -0) ? 0 : tidy).replace('-', MINUS);
};

/** ≥ for '>=', ≤ for '<=', and the strict symbols as they are. */
export const displayRelation = (relation) => {
  const token = String(relation || '>=').trim();
  if (token === '>=' || token === '=>' || token === '≥') return '≥';
  if (token === '<=' || token === '=<' || token === '≤') return '≤';
  return token;
};

/**
 * One term of a linear expression: "x", "−x", "2.5y"; '' for a zero
 * coefficient. `first` decides whether a positive term carries a sign.
 */
export const linearTerm = (coefficient, variable, first = false) => {
  const value = Number(coefficient);
  if (!Number.isFinite(value) || Math.abs(value) <= 1e-12) return '';
  const magnitude = Math.abs(value);
  const body = `${Math.abs(magnitude - 1) <= 1e-12 ? '' : numberText(magnitude)}${variable}`;
  if (first) return value < 0 ? `${MINUS}${body}` : body;
  return value < 0 ? ` ${MINUS} ${body}` : ` + ${body}`;
};

/** m·x + b written as a student writes it: "x + 1", "−0.5x + 6", "4", "−x". */
export const slopeInterceptExpression = (m, b) => {
  const slope = Number(m ?? 0);
  const intercept = Number(b ?? 0);
  const xTerm = linearTerm(slope, 'x', true);
  if (!Number.isFinite(intercept) || Math.abs(intercept) <= 1e-12) return xTerm || '0';
  if (!xTerm) return numberText(intercept);
  return `${xTerm} ${intercept < 0 ? MINUS : '+'} ${numberText(Math.abs(intercept))}`;
};

/** "y = 2x − 1" for a line { m, b }. */
export const formatLine = (line = {}) => `y = ${slopeInterceptExpression(line.m, line.b)}`;

/**
 * Plain-text source written with the symbols the prompt uses: "x - y >= -1"
 * becomes "x − y ≥ −1". Only the relation and minus signs change.
 */
export const prettifyInequalityText = (text) => String(text ?? '')
  .replace(/>=|=>/g, '≥')
  .replace(/<=|=</g, '≤')
  .replace(/\*/g, '·')
  .replace(/-/g, MINUS)
  .replace(/\s+/g, ' ')
  .trim();

/**
 * An authored inequality in any of the shapes the workspace accepts — a
 * string, { orientation: 'vertical', x }, { orientation: 'horizontal', y },
 * slope-intercept { m, b } or standard { A, B, C } (A·x + B·y + C rel 0) —
 * written for the screen.
 */
export const formatInequality = (ineq = {}) => {
  if (typeof ineq === 'string') return prettifyInequalityText(ineq);
  const relation = displayRelation(ineq.relation);
  if (ineq.orientation === 'vertical') return `x ${relation} ${numberText(ineq.x)}`;
  if (ineq.orientation === 'horizontal') return `y ${relation} ${numberText(ineq.y)}`;
  if (Number.isFinite(Number(ineq.m)) || Number.isFinite(Number(ineq.b))) {
    return `y ${relation} ${slopeInterceptExpression(ineq.m, ineq.b)}`;
  }
  if ([ineq.A, ineq.B, ineq.C].some((value) => Number.isFinite(Number(value)))) {
    const A = Number(ineq.A ?? 0);
    const B = Number(ineq.B ?? 0);
    const C = Number(ineq.C ?? 0);
    const left = `${linearTerm(A, 'x', true)}${linearTerm(B, 'y', !linearTerm(A, 'x', true))}`.trim() || '0';
    return `${left} ${relation} ${numberText(-C)}`;
  }
  return 'Linear inequality';
};

/**
 * The constraint a student is writing in the modeling step, as far as they
 * have written it: blanks read as "_", never as a guessed number.
 */
export const formatModelingConstraint = (entry = {}, variables = []) => {
  const [first = { symbol: 'x' }, second = { symbol: 'y' }] = variables;
  const coefficient = (raw) => {
    const text = String(raw ?? '').trim();
    if (text === '') return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  };
  const a = coefficient(entry?.coeffA);
  const b = coefficient(entry?.coeffB);
  const term = (value, symbol, isFirst) => {
    if (value == null) return `${isFirst ? '' : ' + '}_${symbol}`;
    return linearTerm(value, symbol, isFirst);
  };
  const left = `${term(a, first.symbol, true)}${term(b, second.symbol, a === 0)}`.trim() || '0';
  const relation = String(entry?.relation ?? '').trim() ? displayRelation(entry.relation) : '?';
  const constant = String(entry?.constant ?? '').trim();
  return `${left} ${relation} ${constant === '' ? '_' : numberText(constant)}`;
};

/** "(2, −3)" for a point, with the platform's minus sign. */
export const formatPoint = (x, y) => `(${numberText(x)}, ${numberText(y)})`;

/** "y = x² − 1" for a parabola { a, b, c }. */
export const formatQuadratic = (quadratic = {}) => {
  const a = Number(quadratic.a ?? 1);
  const b = Number(quadratic.b ?? 0);
  const c = Number(quadratic.c ?? 0);
  const square = linearTerm(a, 'x²', true);
  const middle = linearTerm(b, 'x', !square);
  const left = `${square}${middle}`;
  if (!left) return `y = ${numberText(c)}`;
  if (Math.abs(c) <= 1e-12) return `y = ${left}`;
  return `y = ${left} ${c < 0 ? MINUS : '+'} ${numberText(Math.abs(c))}`;
};
