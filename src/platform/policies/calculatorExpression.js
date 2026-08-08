import { evaluate } from 'mathjs';

const SAFE_FUNCTIONS = new Set(['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs']);

export const evaluateCalculatorExpression = (expression) => {
  const raw = String(expression ?? '').trim();
  if (!raw || raw.length > 180) throw new Error('Enter a shorter calculation.');
  const normalized = raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt');
  if (!/^[0-9a-zA-Z+\-*/^().,\s]+$/.test(normalized) || /[=;[\]{}:_]/.test(normalized)) {
    throw new Error('Unsupported calculator input.');
  }
  const names = normalized.match(/[A-Za-z]+/g) || [];
  if (names.some((name) => !SAFE_FUNCTIONS.has(name) && !['pi', 'e'].includes(name))) {
    throw new Error('Unsupported calculator function.');
  }
  const result = Number(evaluate(normalized));
  if (!Number.isFinite(result)) throw new Error('The calculation did not produce a finite number.');
  return Number(result.toPrecision(12));
};
