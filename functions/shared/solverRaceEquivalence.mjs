import { sameLinearEquation, splitEquationSides } from './algebraicForm.mjs';
import { sameLinearInequality } from './linearInequalityEquivalence.mjs';
import { sameSimpleInequality, sameText, asNumber } from './answerEquivalence.mjs';

const clean = (value) => String(value ?? '').trim()
  .replace(/\s+(?:or|OR)\s+/g, ' OR ')
  .replace(/\s+(?:and|AND)\s+/g, ' AND ');

const isolatedFor = (relation, variable) => {
  const sides = splitEquationSides(relation);
  if (!sides) return false;
  return sides.left.trim() === variable || sides.right.trim() === variable;
};

const equationSolutions = (value, variable) => {
  const text = clean(value);
  if (/^(?:no solution|none|empty set|∅)$/i.test(text)) return [];
  const branches = text.split(/\s+OR\s+/i);
  const values = [];
  for (const branch of branches) {
    const sides = splitEquationSides(branch);
    if (!sides) return null;
    const other = sides.left.trim() === variable ? sides.right : sides.right.trim() === variable ? sides.left : null;
    const numeric = asNumber(other);
    if (numeric === null) return null;
    values.push(numeric);
  }
  return [...new Set(values)].sort((a, b) => a - b);
};

const sameNumericSet = (a, b, tolerance = 1e-6) => a && b && a.length === b.length
  && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);

const inequalityBranches = (value) => clean(value).split(/\s+OR\s+/i).map((entry) => entry.trim());

export const gradeSolverRaceRelation = ({ family, expected, variable = 'x', actual }) => {
  if (family === 'literalEquation') {
    return isolatedFor(actual, variable) && sameLinearEquation(actual, expected);
  }
  if (family === 'linearInequality') {
    return sameSimpleInequality(actual, expected) || sameLinearInequality(actual, expected);
  }
  if (family === 'absoluteValueEquation') {
    return sameNumericSet(equationSolutions(actual, variable), equationSolutions(expected, variable));
  }
  if (family === 'absoluteValueInequality') {
    if (/^(?:all real numbers|all reals)$/i.test(expected) || /^(?:no solution|none|empty set|∅)$/i.test(expected)) {
      return sameText(actual, expected)
        || (/^all real/i.test(expected) && /^all real/i.test(actual))
        || (/^(?:no solution|none|empty set|∅)$/i.test(expected) && /^(?:no solution|none|empty set|∅)$/i.test(actual));
    }
    const left = inequalityBranches(actual);
    const right = inequalityBranches(expected);
    if (left.length !== right.length) return false;
    return left.every((branch) => right.some((candidate) => sameSimpleInequality(branch, candidate)))
      || sameSimpleInequality(actual.replace(/\s+AND\s+/i, ''), expected.replace(/\s+AND\s+/i, ''));
  }
  return false;
};
