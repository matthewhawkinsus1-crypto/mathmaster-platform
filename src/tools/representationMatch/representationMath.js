import { evaluateFunctionSpec, nearlyEqual, round } from '../shared/toolMath.js';

export const buildDefaultRepresentationSets = () => ([
  { id: 'linear', equation: 'y = 2x + 1', table: '(0,1), (1,3), (2,5)', context: 'Starts at 1 and increases by 2 each step.', graphSpec: { type: 'linear', a: 2, h: 0, k: 1 } },
  { id: 'quadratic', equation: 'y = x²', table: '(-2,4), (-1,1), (0,0), (1,1)', context: 'Symmetric growth from a minimum at the origin.', graphSpec: { type: 'quadratic', a: 1, h: 0, k: 0 } },
  { id: 'exponential', equation: 'y = 2ˣ', table: '(0,1), (1,2), (2,4), (3,8)', context: 'Doubles for each increase of 1 in x.', graphSpec: { type: 'exponential', a: 1, h: 0, k: 0, base: 2 } },
]);

export const scoreRepresentationMatch = (targetId, selections = {}, kinds = ['equation', 'table', 'context']) => {
  const checks = kinds.map((kind) => selections[kind] === targetId);
  return { checks, score: checks.filter(Boolean).length / Math.max(1, checks.length), isCorrect: checks.every(Boolean) };
};

export const mismatchedRepresentationKinds = (targetId, mixed = {}, kinds = ['equation', 'table', 'context']) =>
  kinds.filter((kind) => mixed[kind + 'Id'] != null && mixed[kind + 'Id'] !== targetId);

export const tableRowsForFunction = (spec = {}, xValues = [-2, -1, 0, 1, 2]) =>
  xValues.map((x) => [Number(x), round(evaluateFunctionSpec(spec, Number(x)), 6)]).filter(([, y]) => Number.isFinite(y));

export const findTableMismatchIndexes = (spec = {}, rows = [], tolerance = 1e-6) => rows.reduce((indexes, row, index) => {
  if (!Array.isArray(row) || row.length !== 2) return [...indexes, index];
  const x = Number(row[0]);
  const y = Number(row[1]);
  const expected = evaluateFunctionSpec(spec, x);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(expected) || !nearlyEqual(y, expected, tolerance)) return [...indexes, index];
  return indexes;
}, []);

export const representationById = (sets = [], id) => sets.find((item) => item.id === id) || null;

export const mixedRepresentationCards = (sets = [], mixed = {}, kinds = ['equation', 'table', 'context']) => kinds.map((kind) => {
  const sourceId = mixed[kind + 'Id'];
  const source = representationById(sets, sourceId);
  return { kind, sourceId, value: source?.[kind] ?? '' };
});
