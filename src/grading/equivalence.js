import { parse, simplify } from 'mathjs';
import { compareMathAnswer, normalizeMathAnswer } from '../answerUtils.js';

const MAX_EXPRESSION_LENGTH = 300;

const safeExpression = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_EXPRESSION_LENGTH || /[;[\]{}]/.test(text)) return null;
  return text.replace(/\^/g, '^');
};

export const isAlgebraicallyEquivalent = (studentExpression, expectedExpression, tolerance = 1e-9) => {
  if (compareMathAnswer(studentExpression, expectedExpression, tolerance)) return true;
  const student = safeExpression(studentExpression);
  const expected = safeExpression(expectedExpression);
  if (!student || !expected) return false;
  if (student.includes('=') || expected.includes('=')) {
    const studentParts = student.split('=');
    const expectedParts = expected.split('=');
    if (studentParts.length !== 2 || expectedParts.length !== 2) return false;
    const forward = normalizeMathAnswer(studentParts[0]) === normalizeMathAnswer(expectedParts[0])
      && normalizeMathAnswer(studentParts[1]) === normalizeMathAnswer(expectedParts[1]);
    const reversed = normalizeMathAnswer(studentParts[0]) === normalizeMathAnswer(expectedParts[1])
      && normalizeMathAnswer(studentParts[1]) === normalizeMathAnswer(expectedParts[0]);
    return forward || reversed;
  }
  try {
    parse(student);
    parse(expected);
    const simplified = simplify(`(${student}) - (${expected})`).toString().replace(/\s+/g, '');
    return simplified === '0';
  } catch {
    return false;
  }
};
