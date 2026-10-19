/*
 * A RICH TOOL ANSWER, AS RELEASED REVIEW READS IT BACK TO THE STUDENT.
 *
 * A field answer reviews as "Your response: 12". A tool answer is a
 * construction — two plotted points, three intervals, a final equation — and
 * used to review as nothing at all. These rows say what the student built, in
 * their own values. Pure and verdict-free: it reads the raw work the server
 * stored (bounded, with any verdict key already stripped) and never compares it
 * with anything.
 */
import { TOOL_CATALOG } from '../../tools/toolCatalog.js';

const LABELS = Object.freeze({
  algebra: 'Algebra workspace',
  stepAlgebra: 'Step-by-step algebra workspace',
  system: 'Systems',
  multiAnswer: 'Multi-part response',
  functionInvestigation: 'Coordinate plane',
});

export const toolWorkLabel = (pathToolId) => LABELS[pathToolId] || TOOL_CATALOG[pathToolId]?.label || 'Math tool';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const num = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : String(value ?? ''));
const point = (value) => {
  if (Array.isArray(value) && value.length >= 2) return `(${num(value[0])}, ${num(value[1])})`;
  if (isObject(value) && 'x' in value && 'y' in value) return `(${num(value.x)}, ${num(value.y)})`;
  return null;
};
const points = (list) => (Array.isArray(list) ? list.map(point).filter(Boolean) : []);
const interval = (entry) => {
  if (!isObject(entry)) return null;
  const min = entry.min ?? entry.start;
  const max = entry.max ?? entry.end;
  const left = (entry.minClosed ?? entry.startClosed) ? '[' : '(';
  const right = (entry.maxClosed ?? entry.endClosed) ? ']' : ')';
  const fmt = (value, sign) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? `${sign}∞` : num(value));
  return `${left}${fmt(min, '-')}, ${fmt(max, '')}${right}`;
};

/** The raw work stored with a released response, parsed. Null when there is none. */
export const rawToolWorkOf = (responsePayload) => {
  if (!isObject(responsePayload)) return null;
  if (isObject(responsePayload.raw)) return responsePayload.raw;
  if (typeof responsePayload.rawJson === 'string') {
    try {
      const parsed = JSON.parse(responsePayload.rawJson);
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

/** `[{ id, label, value }]` describing the construction, in the student's values. */
export const describeToolWork = (pathToolId, raw) => {
  if (!isObject(raw)) return [];
  const rows = [];
  const add = (id, label, value) => {
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value ?? '').trim();
    if (text) rows.push({ id, label, value: text });
  };
  switch (pathToolId) {
    case 'algebra':
    case 'stepAlgebra':
      add('final', 'Final equation', raw.finalRelation || raw.finalEquation || raw.value);
      break;
    case 'system':
      add('solution', 'Solution', point(raw) || raw.value);
      add('classification', 'Number of solutions', raw.classification);
      break;
    case 'systemsWorkspace':
      add('classification', 'Number of solutions', raw.classification);
      add('solution', 'Solution', [raw.x, raw.y, raw.z].every((value) => value === undefined || value === null || value === '')
        ? '' : `(${[raw.x, raw.y, raw.z].filter((value) => value !== undefined && value !== null && value !== '').map(num).join(', ')})`);
      if (Array.isArray(raw.construction)) add('construction', 'Boundary lines drawn', String(raw.construction.length));
      add('candidate', 'Point you chose', point(raw.candidate));
      break;
    case 'graphing2':
      add('points', 'Points plotted', points(raw.points));
      break;
    case 'functionInvestigation':
      add('points', 'Points placed', Object.values(isObject(raw.placements) ? raw.placements : {}).map(point));
      Object.entries(isObject(raw.answers) ? raw.answers : {}).forEach(([id, value]) => add(`answer-${id}`, 'Answer', value));
      break;
    case 'intervalNumberLine':
      add('graph', 'Graph', (Array.isArray(raw.intervals) ? raw.intervals : []).map(interval));
      add('notation', 'Notation', raw.notation);
      add('inequality', 'Inequality', raw.inequality);
      break;
    case 'relationMapping':
      add('arrows', 'Arrows drawn', Array.isArray(raw.arrows) ? String(raw.arrows.length) : '');
      add('domain', 'Domain', Array.isArray(raw.domain) ? `{${raw.domain.map(num).join(', ')}}` : '');
      add('range', 'Range', Array.isArray(raw.range) ? `{${raw.range.map(num).join(', ')}}` : '');
      add('function', 'Function?', raw.isFunction);
      break;
    case 'multiAnswer':
      Object.entries(isObject(raw.responses) ? raw.responses : {}).forEach(([id, value]) => add(id, 'Response', value));
      break;
    case 'dataModelingLab':
      add('model', 'Model', [raw.m !== undefined ? `m = ${num(raw.m)}` : '', raw.b !== undefined ? `b = ${num(raw.b)}` : '', raw.a !== undefined ? `a = ${num(raw.a)}` : ''].filter(Boolean));
      add('r', 'Correlation r', raw.r);
      add('direction', 'Direction', raw.direction);
      add('strength', 'Strength', raw.strength);
      add('prediction', 'Prediction', raw.predictionY !== undefined && raw.predictionY !== '' ? `y = ${num(raw.predictionY)} at x = ${num(raw.predictionX)}` : '');
      break;
    case 'regressionCalculator':
      add('regression', 'Regression run', isObject(raw.regressionRun) ? `y = ${num(raw.regressionRun.m)}x + ${num(raw.regressionRun.b)}, r = ${num(raw.regressionRun.r)}` : '');
      add('interpretation', 'Interpretation', isObject(raw.interpretation) ? [raw.interpretation.direction, raw.interpretation.strength] : '');
      break;
    default:
      break;
  }
  return rows;
};
