import {
  FORMAT_CODES,
  appendLmrProcessEntry,
  cachedEvaluation,
  firstProcessFeedback,
  lmrMethodsFor,
} from '../lmrProcessMath.js';

/*
 * PROCESS MODE'S WORK IN PROGRESS, AND WHAT ONE PRESS OF CHECK DOES WITH IT.
 *
 * Pure, so node tests it the way the board runs it.
 *
 * The draft (`processDraft`, draft-backed beside the board's cards) holds what
 * a student has typed, chosen and picked inside each method they opened, so a
 * refresh or another Chromebook brings back half-finished work exactly. It is
 * work, never a verdict: no field of it says whether anything is right. The
 * process LOG (`processLog`) holds only work the student pressed Check (or
 * Save) on; the shared marking turns it into facts, on the board and on the
 * server alike.
 *
 * An embedded Step Algebra workspace keeps its own draft (its equation and
 * steps) under the question's draft key, as it does in every other tool; the
 * method reads them back from it rather than copying them here.
 */

/** The evidence each method records — and nothing else the draft holds. */
export const EVIDENCE_KEYS = Object.freeze({
  readSlopeIntercept: ['m', 'b'],
  readPointSlope: ['m', 'point'],
  readScenario: ['rate', 'start'],
  solveForY: ['eq', 'steps'],
  substituteZero: ['zero', 'eq', 'steps', 'point'],
  graphCrossing: ['pick'],
  graphPoint: ['pick', 'point'],
  riseRun: ['p1', 'p2', 'run', 'rise', 'm'],
  twoPointFormula: ['p1', 'p2', 'y2', 'y1', 'x2', 'x1', 'm'],
  tableDelta: ['r1', 'r2', 'dy', 'dx', 'm'],
  tableRead: ['row'],
  tableRow: ['row'],
  extendTable: ['rows'],
  solveForB: ['pt', 'y1', 'm', 'x1', 'b'],
  evaluateAtX: ['x', 'y'],
});

// Readings that establish two facts at once, and the field each fact is read
// from: with guided feedback a right slope is kept even when the b beside it
// is not, and the student fixes only the b.
export const CLAIM_FIELDS = Object.freeze({
  readSlopeIntercept: Object.freeze({ slope: ['m'], yIntercept: ['b'] }),
  readPointSlope: Object.freeze({ slope: ['m'], point: ['point'] }),
  readScenario: Object.freeze({ slope: ['rate'], yIntercept: ['start'] }),
});

// Methods whose work means something different for each fact: the entry
// names the fact the student was finding.
const TARGETED = new Set(['substituteZero', 'graphCrossing', 'tableRead', 'extendTable']);

export const optionKeyOf = (option) => (option ? `${option.strategy}@${option.source}` : '');
export const workKeyOf = (target, optionKey) => `${target}|${optionKey}`;

/* ---------------------------------------------------------------- the draft */

const LIMITS = Object.freeze({ text: 120, list: 12, workKeys: 8, json: 3500 });
export const PROCESS_DRAFT_LIMITS = LIMITS;
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const boundValue = (value, depth = 0) => {
  if (typeof value === 'string') return value.slice(0, LIMITS.text);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (depth >= 3) return null;
  if (Array.isArray(value)) return value.slice(0, LIMITS.list).map((entry) => boundValue(entry, depth + 1));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).slice(0, 16)
      .filter(([key]) => /^[A-Za-z][A-Za-z0-9]{0,15}$/.test(key))
      .map(([key, entry]) => [key, boundValue(entry, depth + 1)]));
  }
  return null;
};

export const EMPTY_PROCESS_DRAFT = Object.freeze({ bind: '', open: null, method: Object.freeze({}), work: Object.freeze({}), tries: Object.freeze({}) });

const shortText = (value, length = 60) => (typeof value === 'string' ? value.slice(0, length) : '');

/**
 * The draft for this question, bounded. A draft written for another question
 * (another version of a Question Family slot) is an empty one: no half-typed
 * slope crosses from one line to another.
 */
export const readProcessDraft = (raw, binding) => {
  if (!isObject(raw) || !binding || raw.bind !== binding) return { ...EMPTY_PROCESS_DRAFT, bind: binding || '' };
  const method = isObject(raw.method)
    ? Object.fromEntries(Object.entries(raw.method).slice(0, 6).filter(([, value]) => typeof value === 'string').map(([key, value]) => [shortText(key, 20), shortText(value)]))
    : {};
  const workEntries = isObject(raw.work) ? Object.entries(raw.work).filter(([, value]) => isObject(value)).slice(-LIMITS.workKeys) : [];
  const work = Object.fromEntries(workEntries.map(([key, value]) => [shortText(key, 80), boundValue(value)]));
  const tries = isObject(raw.tries)
    ? Object.fromEntries(Object.entries(raw.tries).slice(-LIMITS.workKeys).filter(([, value]) => Number.isInteger(value) && value >= 0).map(([key, value]) => [shortText(key, 80), Math.min(value, 999)]))
    : {};
  const draft = { bind: binding, open: typeof raw.open === 'string' ? shortText(raw.open, 20) : null, method, work, tries };
  // Over budget, the work the student touched longest ago goes first (the
  // newest — the method on screen — last). The budget always holds: this
  // record is synced with the board's, and one over-large field would stop
  // the server backup of the whole board.
  while (JSON.stringify(draft).length > LIMITS.json && Object.keys(draft.work).length) {
    delete draft.work[Object.keys(draft.work)[0]];
  }
  if (JSON.stringify(draft).length > LIMITS.json) {
    draft.tries = {};
    draft.method = {};
  }
  return draft;
};

/** The draft with one method's work replaced (and moved to the newest place). */
export const withWork = (draft, key, ev) => {
  const work = { ...draft.work };
  delete work[key];
  work[key] = boundValue(isObject(ev) ? ev : {});
  return readProcessDraft({ ...draft, work }, draft.bind);
};

/* ---------------------------------------------------------- the methods */

/**
 * The method a student is using for `target`: the one they chose (still
 * offered), the one they were sent to (`preferred`), or — when there is only
 * one way here — that one. null means "choose a method".
 */
export const selectedOption = (question, process, target, chosenKey, preferred = null) => {
  const options = lmrMethodsFor(question, process, target).flatMap((group) => group.sources);
  return options.find((option) => optionKeyOf(option) === chosenKey)
    || (preferred ? options.find((option) => option.strategy === preferred) : null)
    || (options.length === 1 ? options[0] : null);
};

/* ------------------------------------------------------ one press of Check */

const pick = (ev, keys) => Object.fromEntries(keys
  .filter((key) => ev?.[key] !== undefined && ev?.[key] !== null && ev?.[key] !== '')
  .map((key) => [key, ev[key]]));

/** The log entry a method's work becomes. */
export const processEntryFor = ({ option, target, ev = {}, live = {}, tries = 1, at = Date.now() }) => {
  const keys = EVIDENCE_KEYS[option.strategy] || [];
  const evidence = pick({ ...ev, ...live }, keys);
  const entryTarget = TARGETED.has(option.strategy)
    ? target
    : option.bridgeTo ? 'siEquation' : (option.targets.includes(target) ? target : null);
  return {
    id: `${option.strategy}-${Number(at).toString(36)}`.slice(0, 40),
    strategy: option.strategy,
    from: option.source,
    ...(entryTarget ? { target: entryTarget } : {}),
    at,
    tries: Math.max(1, Math.min(999, tries)),
    ev: evidence,
  };
};

const NOTHING_YET = 'Fill in your work first.';

/**
 * What pressing Check (guided) or Save (outcomes withheld) does.
 *
 *   reveal true   (guided, immediate feedback) only RIGHT work is recorded.
 *                 A reading that gets one fact right and one wrong keeps the
 *                 right one; the message names the mistake, never the value.
 *   reveal false  (a DOL, quiz or test) any complete work is recorded as the
 *                 student's answer — the server decides what it is worth —
 *                 and only the form of the work is ever commented on.
 *
 * Returns { record, message, tone, done } — `record` is the entry to append
 * (or null), `done` that the fact being found is now established.
 */
export const decideProcessCheck = ({ process, option, target, ev, live, reveal, tries = 0, at = Date.now() }) => {
  const entry = processEntryFor({ option, target, ev, live, tries: tries + 1, at });
  const evaluated = cachedEvaluation(entry, { facts: process?.facts || {} }, process?.env);
  const said = firstProcessFeedback(evaluated, { reveal });
  if (!evaluated.usable) {
    return { evaluated, record: null, done: false, tone: 'error', message: said || (reveal && evaluated.problems?.length ? 'Not yet. Check your work.' : NOTHING_YET) };
  }
  if (!reveal) {
    // Saved as written. A problem with its FORM still blocks it, so a
    // half-typed fraction is not saved by accident.
    const formatProblem = [...Object.values(evaluated.fields || {}).map((field) => field?.code), ...(evaluated.problems || [])]
      .find((code) => code && FORMAT_CODES.has(code));
    if (formatProblem) return { evaluated, record: null, done: false, tone: 'error', message: said };
    return { evaluated, record: entry, done: true, tone: 'neutral', message: '' };
  }
  const right = evaluated.claims.filter((claim) => claim.correct);
  const wrong = evaluated.claims.filter((claim) => !claim.correct);
  // A field that could not be read makes no claim, but it is still work the
  // student typed and meant: it is named, not silently dropped.
  const troubled = Object.entries(evaluated.fields || {}).filter(([, status]) => status && !status.ok).map(([field]) => field);
  if (!right.length) return { evaluated, record: null, done: false, tone: 'error', message: said || 'Not yet. Check your work.' };
  if (!wrong.length && !troubled.length) return { evaluated, record: entry, done: true, tone: 'success', message: '' };
  const fields = CLAIM_FIELDS[option.strategy];
  if (!fields) return { evaluated, record: null, done: false, tone: 'error', message: said || 'Not yet. Check your work.' };
  const kept = { ...entry.ev };
  [...wrong.flatMap((claim) => fields[claim.fact] || []), ...troubled].forEach((field) => { delete kept[field]; });
  const pruned = { ...entry, ev: kept };
  const again = cachedEvaluation(pruned, { facts: process?.facts || {} }, process?.env);
  if (!again.usable || again.claims.some((claim) => !claim.correct)) {
    return { evaluated, record: null, done: false, tone: 'error', message: said || 'Not yet. Check your work.' };
  }
  const found = again.claims.some((claim) => claim.fact === target || (target === 'point' && claim.fact === 'point'));
  return { evaluated, record: pruned, done: found, partial: true, tone: 'error', message: said };
};

/** The log after recording an entry (the board's one way of adding work). */
export const recordProcessEntry = (question, log, entry, process) => appendLmrProcessEntry(question, log, entry, process);

/**
 * How one field of a method looks after the last Check of THIS work: green
 * where it was right, red where it was not (or, where outcomes are withheld,
 * red only where its form is unreadable).
 */
export const fieldStatusFrom = (evaluated, field, reveal) => {
  const status = evaluated?.fields?.[field];
  if (!status) return 'neutral';
  if (status.ok) return reveal ? 'correct' : 'neutral';
  if (!reveal) return status.code && FORMAT_CODES.has(status.code) ? 'incorrect' : 'neutral';
  return 'incorrect';
};
