import { evaluate } from 'mathjs';
import { calculatorModeAllowsExpression } from './calculatorPolicy.js';

const SAFE_FUNCTIONS = new Set(['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs']);

const readBraceGroup = (text, openIndex) => {
  if (text[openIndex] !== '{') return null;
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return { value:text.slice(openIndex + 1, index), end:index + 1 };
    }
  }
  return null;
};

const replaceLatexFractions = (value) => {
  let text = String(value ?? '');
  for (let guard = 0; guard < 12 && text.includes('\\frac'); guard += 1) {
    const at = text.lastIndexOf('\\frac');
    const numerator = readBraceGroup(text, at + 5);
    if (!numerator) break;
    const denominator = readBraceGroup(text, numerator.end);
    if (!denominator) break;
    const next = `((${replaceLatexFractions(numerator.value)})/(${replaceLatexFractions(denominator.value)}))`;
    text = `${text.slice(0, at)}${next}${text.slice(denominator.end)}`;
  }
  return text;
};

export const evaluateCalculatorExpression = (expression, mode = null) => {
  const raw = String(expression ?? '').trim();
  if (!raw || raw.length > 180) throw new Error('Enter a shorter calculation.');
  const normalized = replaceLatexFractions(raw)
    .replace(/\\left|\\right/g, '')
    .replace(/\\div/g, '/')
    .replace(/\bdiv\b/gi, '/')
    .replace(/\\times|\\cdot/g, '*')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\\pi/g, 'pi')
    .replace(/π/g, 'pi')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt');
  if (!/^[0-9a-zA-Z+\-*/^().,\s]+$/.test(normalized) || /[=;[\]{}:_]/.test(normalized)) {
    throw new Error('Unsupported calculator input.');
  }
  if (!calculatorModeAllowsExpression(normalized, mode)) {
    throw new Error('Unsupported calculator input for this mode.');
  }
  const names = normalized.match(/[A-Za-z]+/g) || [];
  if (names.some((name) => !SAFE_FUNCTIONS.has(name) && !['pi', 'e'].includes(name))) {
    throw new Error('Unsupported calculator function.');
  }
  const result = Number(evaluate(normalized));
  if (!Number.isFinite(result)) throw new Error('The calculation did not produce a finite number.');
  return Number(result.toPrecision(12));
};
