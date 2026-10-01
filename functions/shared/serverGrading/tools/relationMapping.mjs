/*
 * Shared grader for the `relationMapping` registry tool — run by the browser
 * tool for its feedback, by QuestionEngine for the recorded verdict, and by
 * the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from RelationMapping.jsx's Check button:
 *
 *   - the relation is `question.pairs`, each `[x, y]` or `{x, y}`, keeping only
 *     pairs with two finite coordinates (an empty relation renders "Nothing to
 *     map" with no Check, so it has no verdict);
 *   - `ask` defaults to ['mapping', 'domain', 'range'] only when it is not an
 *     array — an authored `[]` asks nothing;
 *   - one check per requested part, in this order: plot, mapping, domain,
 *     range, isFunction, then one per analysis field (deduplicated by id the
 *     way the lab's `checks` object deduplicated them);
 *   - score = checks passed / checks asked; correct = every check passed.
 *
 * The relation helpers below are the ONLY definition: the lab imports them to
 * draw its diagram and build its work, so what it draws and what is graded
 * cannot drift apart.
 */
import declaration from '../declarations/relationMapping.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { matchesFieldAnswer } from '../../answerUtils.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const entry = (value) => (value === null || value === undefined ? '' : String(value));
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// --- The relation ---------------------------------------------------------------

/** What the lab asks when the question does not say. */
export const DEFAULT_RELATION_ASK = Object.freeze(['mapping', 'domain', 'range']);

/**
 * The four "Is this relation a function?" choices, by value. The lab owns the
 * wording and the shuffled order; the grade depends only on the value chosen.
 */
export const FUNCTION_STATUS_CHOICES = Object.freeze({
  YES_DEFINITION: 'yes-definition',
  YES_OUTPUT_RULE: 'yes-output-rule',
  NO_INPUT_REPEAT: 'no-input-repeat',
  NO_OUTPUT_REPEAT: 'no-output-repeat',
});

export const uniqueSorted = (values) => [...new Set(values.map(Number))].sort((a, b) => a - b);

/** A typed comma- (or semicolon-) separated list; tokens that are not finite numbers are dropped. */
export const parseList = (input) => String(input || '')
  .split(/[,;]/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map(Number)
  .filter((value) => Number.isFinite(value));

/** Same values once each, in any order. */
export const sameSet = (left, right) => {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-9);
};

export const normalizePair = (pair) => {
  const rawX = Array.isArray(pair) ? pair[0] : pair?.x;
  const rawY = Array.isArray(pair) ? pair[1] : pair?.y;
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

/** The authored relation as finite `[x, y]` pairs, from either storage shape. */
export const relationPairsOf = (rawPairs) => list(rawPairs).map(normalizePair).filter(Boolean);

/** The parts the question asks for. */
export const relationAskOf = (rawAsk) => (Array.isArray(rawAsk) ? rawAsk : DEFAULT_RELATION_ASK);

/** The authored analysis questions about the relation (a field without an id is not shown). */
export const relationAnalysisFieldsOf = (rawFields) => list(rawFields).filter((field) => field?.id);

// A relation is a function when no domain value is sent to two different range
// values — which is exactly what a mapping diagram makes visible.
export const relationIsFunction = (pairs) => {
  const seen = new Map();
  return pairs.every(([x, y]) => {
    if (!seen.has(x)) { seen.set(x, y); return true; }
    return Math.abs(seen.get(x) - y) < 1e-9;
  });
};

// --- Reading the student's work -----------------------------------------------
//
// The lab emits finite numbers. Anything else (a tampered or corrupted
// response) is read as an entry that matches nothing — never a crash, and never
// a coincidental match: `Number(null)` is 0, so a null coordinate must not
// quietly become the origin.
const coordinate = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

const UNREADABLE = '\u0000unreadable';

const pointKey = (point) => {
  if (!Array.isArray(point)) return UNREADABLE;
  const x = coordinate(point[0]);
  const y = coordinate(point[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? `${x.toFixed(8)}|${y.toFixed(8)}` : UNREADABLE;
};

/** The plotted points are exactly the relation's points (as sets). */
export const samePairSet = (studentPairs, expectedPairs) => {
  const student = new Set(list(studentPairs).map(pointKey));
  const expected = new Set(list(expectedPairs).map(pointKey));
  return student.size === expected.size && [...expected].every((pair) => student.has(pair));
};

const arrowKey = (arrow) => (Array.isArray(arrow) ? `${arrow[0]}->${arrow[1]}` : UNREADABLE);

/** One arrow per ordered pair of the relation, no more and no fewer. */
export const sameArrows = (arrows, pairs) => {
  const drawn = list(arrows).map(arrowKey).sort();
  const wanted = list(pairs).map(arrowKey).sort();
  return drawn.length === wanted.length && drawn.every((value, index) => value === wanted[index]);
};

const pointText = (point) => (Array.isArray(point) ? `(${entry(point[0])}, ${entry(point[1])})` : '?');
const arrowText = (arrow) => (Array.isArray(arrow) ? `${entry(arrow[0])}->${entry(arrow[1])}` : '?');

/**
 * The analysis-field answers as the lab submits them: `[{ id, value }]`, one
 * per authored field.
 *
 * An array rather than an object keyed by field id, so an author's id can
 * never collide with a key the response contract strips (a field with the id
 * `correct` or `feedback` would otherwise vanish from the work).
 */
export const relationFieldWork = (fields, answers) => {
  const seen = new Set();
  const work = [];
  list(fields).forEach((field) => {
    const id = entry(field?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    work.push({ id, value: entry(answers?.[field.id]) });
  });
  return work;
};

const filled = (value) => entry(value).trim() !== '';
// A typed box or a chosen value is a string — the lab never sends anything
// else. Anything else is unreadable, not coerced: an array would otherwise
// stringify to a comma list and be read as a typed answer.
const typedText = (value) => (typeof value === 'string' ? value : '');

const fieldValuesOf = (fields) => {
  const values = new Map();
  list(fields).forEach((field) => {
    if (!isPlainObject(field)) return;
    const id = entry(field.id);
    if (id && !values.has(id)) values.set(id, typedText(field.value));
  });
  return values;
};

// --- The grader -----------------------------------------------------------------

const gradeRelation = (question, work) => {
  const pairs = relationPairsOf(question.pairs);
  if (!pairs.length) return ungradedResult('relation-has-no-pairs');
  const ask = relationAskOf(question.ask);
  const parts = [];

  if (ask.includes('plot')) {
    const points = list(work.plottedPoints);
    parts.push({
      id: 'plot',
      label: 'Coordinate plot',
      isComplete: points.length > 0,
      isCorrect: samePairSet(points, pairs),
      response: points.map(pointText).join(', '),
    });
  }
  if (ask.includes('mapping')) {
    const arrows = list(work.arrows);
    parts.push({
      id: 'mapping',
      label: 'Mapping diagram',
      isComplete: arrows.length > 0,
      isCorrect: sameArrows(arrows, pairs),
      response: arrows.map(arrowText).join(', '),
    });
  }
  if (ask.includes('domain')) {
    const typed = typedText(work.domainText);
    parts.push({
      id: 'domain',
      label: 'Domain',
      isComplete: filled(typed),
      isCorrect: sameSet(parseList(typed), uniqueSorted(pairs.map(([x]) => x))),
      response: typed,
    });
  }
  if (ask.includes('range')) {
    const typed = typedText(work.rangeText);
    parts.push({
      id: 'range',
      label: 'Range',
      isComplete: filled(typed),
      isCorrect: sameSet(parseList(typed), uniqueSorted(pairs.map(([, y]) => y))),
      response: typed,
    });
  }
  if (ask.includes('isFunction')) {
    const chosen = typedText(work.isFunction);
    const functionChoice = relationIsFunction(pairs)
      ? FUNCTION_STATUS_CHOICES.YES_DEFINITION
      : FUNCTION_STATUS_CHOICES.NO_INPUT_REPEAT;
    parts.push({
      id: 'isFunction',
      label: 'Is it a function?',
      isComplete: filled(chosen),
      isCorrect: chosen === functionChoice,
      response: chosen,
    });
  }

  // The lab kept its checks in an object keyed `field:<id>`: a repeated id was
  // ONE check, in its first position, judged by the last field with that id.
  const answers = fieldValuesOf(work.fields);
  const fieldParts = new Map();
  relationAnalysisFieldsOf(question.answerFields).forEach((field) => {
    const id = `field:${field.id}`;
    const value = answers.get(entry(field.id)) ?? '';
    fieldParts.set(id, {
      id,
      label: entry(field.label || field.id),
      isComplete: filled(value),
      isCorrect: matchesFieldAnswer(value, field),
      response: value,
    });
  });
  parts.push(...fieldParts.values());

  // `every` of nothing is true: a question that asks for nothing is marked
  // correct by the lab's Check, and so it is here.
  return gradedResult({
    parts,
    isComplete: parts.every((part) => part.isComplete),
    isCorrect: parts.every((part) => part.isCorrect),
  });
};

export default bindToolGrader(declaration, 'relationMapping', {
  default: gradeRelation,
});
