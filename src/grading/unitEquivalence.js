const UNIT_ALIASES = Object.freeze({
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  ft: 'ft', foot: 'ft', feet: 'ft',
  in: 'in', inch: 'in', inches: 'in',
  yd: 'yd', yard: 'yd', yards: 'yd',
  mi: 'mi', mile: 'mi', miles: 'mi',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  dollar: 'dollars', dollars: 'dollars', usd: 'dollars', '$': 'dollars',
  cent: 'cents', cents: 'cents', '¢': 'cents',
  percent: '%', percentage: '%', '%': '%',
  degree: 'deg', degrees: 'deg', deg: 'deg', '°': 'deg',
});

const parseUnitToken = (rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token || token === '1') return null;
  const match = token.match(/^(.+?)(?:\^([+-]?\d+))?$/);
  const base = match?.[1] || token;
  const exponent = Number(match?.[2] || 1);
  const canonical = UNIT_ALIASES[base] || base;
  return Number.isFinite(exponent) && exponent !== 0 ? { base: canonical, exponent } : null;
};

const addProductToPowers = (powers, value, direction) => {
  String(value || '').split(/(?:\*|·|\s)+/).forEach((rawToken) => {
    const token = parseUnitToken(rawToken);
    if (!token) return;
    powers.set(token.base, (powers.get(token.base) || 0) + direction * token.exponent);
  });
};

const formatFactor = (base, exponent) => exponent === 1 ? base : `${base}^${exponent}`;

export const normalizeUnit = (unitStr) => {
  if (unitStr === null || unitStr === undefined) return '';
  let cleaned = String(unitStr)
    .trim()
    .toLowerCase()
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/\bsquare\s+([a-z$¢°]+)/g, '$1^2')
    .replace(/\bcubic\s+([a-z$¢°]+)/g, '$1^3')
    .replace(/\b([a-z$¢°]+)\s+squared\b/g, '$1^2')
    .replace(/\b([a-z$¢°]+)\s+cubed\b/g, '$1^3')
    .replace(/\s+per\s+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const [numerator, ...denominators] = cleaned.split('/');
  const powers = new Map();
  addProductToPowers(powers, numerator, 1);
  denominators.forEach((denominator) => addProductToPowers(powers, denominator, -1));
  const entries = [...powers.entries()].filter(([, exponent]) => exponent !== 0).sort(([left], [right]) => left.localeCompare(right));
  const top = entries.filter(([, exponent]) => exponent > 0).map(([base, exponent]) => formatFactor(base, exponent));
  const bottom = entries.filter(([, exponent]) => exponent < 0).map(([base, exponent]) => formatFactor(base, Math.abs(exponent)));
  if (!top.length && !bottom.length) return '';
  return bottom.length ? `${top.join('*') || '1'}/${bottom.join('*')}` : top.join('*');
};

const parseStrictNumber = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/[−–—]/g, '-').replace(/,/g, '');
  if (!text) return null;
  const fraction = text.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

export const gradeValueWithUnit = ({
  studentValue,
  studentUnit,
  expectedValue,
  expectedUnit,
  numericTolerance = 1e-4,
  relativeTolerance = 1e-9,
} = {}) => {
  const studentNumber = parseStrictNumber(studentValue);
  const expectedNumber = parseStrictNumber(expectedValue);
  const bothNumeric = studentNumber !== null && expectedNumber !== null;
  const allowedError = bothNumeric
    ? Math.max(Math.abs(Number(numericTolerance) || 0), Math.abs(expectedNumber) * Math.abs(Number(relativeTolerance) || 0))
    : 0;
  const isNumericCorrect = bothNumeric
    ? Math.abs(studentNumber - expectedNumber) <= allowedError
    : studentNumber === null && expectedNumber === null
      && String(studentValue ?? '').trim() !== ''
      && String(studentValue).trim() === String(expectedValue ?? '').trim();

  const normalizedExpectedUnit = normalizeUnit(expectedUnit);
  const normalizedStudentUnit = normalizeUnit(studentUnit);
  const isUnitCorrect = normalizedExpectedUnit
    ? normalizedStudentUnit === normalizedExpectedUnit
    : true;
  const isCorrect = isNumericCorrect && isUnitCorrect;

  return {
    isCorrect,
    isNumericCorrect,
    isUnitCorrect,
    normalizedStudentUnit,
    normalizedExpectedUnit,
    diagnosticMessage: isCorrect
      ? 'Correct!'
      : !isNumericCorrect && isUnitCorrect
        ? 'Calculation error: Your unit is correct, but the value is incorrect.'
        : isNumericCorrect && !isUnitCorrect
          ? 'Unit error: Your numeric calculation is correct, but check your unit.'
          : 'Incorrect value and unit.',
  };
};
