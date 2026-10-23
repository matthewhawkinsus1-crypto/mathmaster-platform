/*
 * How the radical-solve view WRITES its equation: a·ⁿ√(mx + b) + c = px + q
 * as a student reads it on paper — "√(y − 2) − 1 = 5", "7·⁶√(5m + 4) − 4 = 10",
 * "(3y + 1)^(1/3) + 5 = 0" — with the true minus sign and no "1y" or "+ −4".
 * Display only: the grader reads the authored numbers, never this text.
 */
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const ROOT_SIGNS = Object.freeze({ 2: '√', 3: '∛', 4: '∜' });

const tidy = (value) => (Object.is(value, -0) ? 0 : value);
const magnitude = (value) => String(Number(Math.abs(value).toFixed(4)));
const number = (value) => (tidy(value) < 0 ? `−${magnitude(value)}` : magnitude(value));

/** mx + b in the variable: "y − 2", "−3x − 5", "5m + 4", "x", "6". */
export const linearReadout = (m, b, variable = 'x') => {
  const slope = tidy(Number(m) || 0);
  const intercept = tidy(Number(b) || 0);
  if (slope === 0) return number(intercept);
  const lead = slope === 1 ? variable : slope === -1 ? `−${variable}` : `${number(slope)}${variable}`;
  if (intercept === 0) return lead;
  return `${lead} ${intercept < 0 ? '−' : '+'} ${magnitude(intercept)}`;
};

/** The radical alone: "√(y − 2)", "∛(3h + 3)", "⁶√(5m + 4)", or "(3y + 1)^(1/3)". */
export const radicalReadout = ({ index, radicand, variable }, notation = 'radical') => {
  const inside = linearReadout(radicand.m, radicand.b, variable);
  if (notation === 'exponent') return `(${inside})^(1/${index})`;
  const sign = ROOT_SIGNS[index] || `${String(index).split('').map((digit) => SUPERSCRIPT_DIGITS[Number(digit)]).join('')}√`;
  return `${sign}(${inside})`;
};

/** The whole equation as authored. */
export const radicalEquationReadout = (equation, notation = 'radical') => {
  const radical = radicalReadout(equation, notation);
  const { coefficient, outside, rhs, variable } = equation;
  // A superscript index right after a number reads as an exponent (7⁶√…), so
  // a coefficient there is joined with a dot; √, ∛ and ∜ need none.
  const joiner = notation === 'radical' && !ROOT_SIGNS[equation.index] ? '·' : '';
  const scaled = coefficient === 1 ? radical : coefficient === -1 ? `−${radical}` : `${number(coefficient)}${joiner}${radical}`;
  const left = outside === 0 ? scaled : `${scaled} ${outside < 0 ? '−' : '+'} ${magnitude(outside)}`;
  return `${left} = ${linearReadout(rhs.m, rhs.b, variable)}`;
};

/** "Square both sides", "Cube both sides", "Raise both sides to the 6th power". */
export const raiseBothSidesText = (index) => {
  if (index === 2) return 'Square both sides';
  if (index === 3) return 'Cube both sides';
  const suffix = index % 100 >= 11 && index % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[index % 10] || 'th');
  return `Raise both sides to the ${index}${suffix} power`;
};
