/*
 * AN ASSIGNMENT'S ANSWER KEY, SPLIT FROM WHAT A STUDENT SEES (D10 Phase 1,
 * P1-1; docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md §1.1 and §3; SI02).
 *
 * An ordinary assignment carries every answer key, accepted answer, correct
 * choice and worked solution inline, in `sections[].questions[]`, and any
 * student who can open the assignment can read them before answering. D10
 * (owner decision, 2026-10-16) moves them to a store only the server and
 * teachers read. This module is the split itself, and nothing else:
 *
 *   splitQuestion(q)                        -> { publicQuestion, privatePart }
 *   mergeQuestion(publicQuestion, part)     -> q, exactly
 *   splitAssignment(sections)               -> { publicSections, keysByQuestionId }
 *   mergeAssignment(publicSections, keys)   -> sections, exactly
 *
 * IN SHADOW (Phase 1) NOTHING IS REMOVED FROM ANY ASSIGNMENT. The Firestore
 * trigger (functions/lib/assignmentKeyShadow.js) writes the private parts to
 * `assignmentKeys/{assignmentId}`, and every reader still reads the whole
 * public document. Nothing a student or teacher sees changes. The proofs that
 * make the split safe to build on are in tests/platform/assignmentKeySplit*.
 *
 * THE DECLARED FIELD LIST (KEY_FIELDS below) decides what moves. Every rule
 * applies at every depth and inside every variant:
 *   - `anywhere`: names that are a key wherever they appear (design §1.1, the
 *     secure-mode assistance keys and the released-review denylist the
 *     platform already keeps), plus four name families;
 *   - `paths`: a key at a named place under any object
 *     (`answerFields[].answer`, `context.*.value`, `table.answers`, ...);
 *   - `atRoot`: generic names (`answer`, the feature answers) that are a key
 *     only on a question itself: the question, each of its `variants[]`, and
 *     each adaptive band profile (`differentiation.bandProfiles.*`, which is
 *     merged onto the question it belongs to). Deeper down, a field called
 *     `answer` or `behavior` can be something a screen shows.
 * These are the Phase 0 exposure report's own three kinds
 * (scripts/report-assignment-key-exposure.mjs), so what the report counts as
 * exposed is exactly what the split can move.
 * What stays: everything the device needs to draw the item. Answer options
 * stay (the correct label goes). Stimulus-derived answers stay — a graph's
 * functionSpec, a system's equations, a transformation's target {a,h,k}: the
 * student must see them, so no split can hide them (design §1.1, R9). A
 * Question Family's `questionFamily` reference and `generator.parameters` stay
 * too: the device builds the student's version from them (R10); the answer
 * templates and `generator.derived` move.
 *
 * Whether every remaining public field is safe to SERVE is Phase 2's question
 * (P2-1/P2-2), not this module's: nothing serves the public question yet.
 * Fields on this list that a screen also draws from (a sequence's `targetN`,
 * guided-notes steps, derived values a prompt prints, the Interval Number
 * Line's first view, which it frames around `intervals`) must be settled
 * there, per question type, before any section loses its keys.
 *
 * THE ROUND TRIP IS EXACT. A private part records each moved field's path from
 * the question and the position it had among its siblings, so the merge puts
 * every field back where it was: mergeQuestion(splitQuestion(q)) has the same
 * keys, in the same order, with the same values. A key order matters to
 * anything that serializes the question (a content hash, a stored snapshot).
 *
 * A MERGE FAILS CLOSED. A private part that does not fit the public question it
 * is merged into (a path that is not there, a field the public question already
 * has, an unused key) throws AssignmentKeyError: a caller then falls back to
 * the public document rather than grading against a question that is neither.
 *
 * Pure: no Firestore, no clock, no React. Shared by the Cloud Functions and,
 * from Phase 2, the teacher's screens.
 */
import { ASSISTANCE_PAYLOAD_KEYS } from './questionRuntimePolicy.mjs';

export const ASSIGNMENT_KEYS_COLLECTION = 'assignmentKeys';
/** The shape of an assignmentKeys document. */
export const ASSIGNMENT_KEYS_SCHEMA_VERSION = 1;
/** The declared field list below. A change to the list is a new version, and every key document is recomputed. */
export const SPLIT_VERSION = 1;

/*
 * The keys a released secure-Test review never shows (functions/lib/secureExam.js,
 * stripReviewSecrets). That list is not exported, so it is repeated here, and
 * tests/platform/assignmentKeySplit.test.mjs proves by running the real
 * function that everything it strips is on this module's list.
 */
export const REVIEW_SECRET_KEYS = Object.freeze([
  'expected', 'accepted', 'answerKey', 'correctAnswer', 'privateGrading',
  'privateSupport', 'generatorParameters', 'gradingDefinition', 'solutionKey',
]);

// Design §1.1, by kind. A key at every depth: none of these names means
// anything else anywhere in a question.
const ANSWER_NAMES = [
  // typed answers
  'acceptedAnswers', 'accepted', 'answerKey', 'correctAnswer', 'expected', 'expectedAnswer', 'solution', 'solutionKey',
  'generatedAnswer', 'sampleAnswer',
  // correct choices and matches
  'correctMatches', 'correctIndependentId', 'correctDependentId', 'correctionAnswerId',
  // feature answers
  'correctDomain', 'correctRange', 'correctEquation',
  // grading specs, and the terms an explanation is marked against
  'grading', 'gradingDefinition', 'privateGrading', 'tableAnswers', 'expectedStepPoints', 'expectedModel',
  'expectedConstraints', 'validSchemes', 'requiredConcepts', 'requiredConceptGroups', 'generatorParameters',
  // authored answers a tool compares the student's choice with (found by the
  // coverage gate: relationshipModel, the function-characteristics recipes,
  // the Data Modeling Lab's causation question)
  'relationshipType', 'hasNoXIntercept', 'hasNoYIntercept', 'causationSupported',
];
const SOLUTION_AND_HELP_NAMES = [
  'solutionReview', 'workedSolution', 'solutionExplanation', 'explanation', 'solutionSteps', 'solutionRepresentations',
  'attemptFeedback', 'misconceptions', 'hints', 'supportHints', 'privateSupport',
];

export const KEY_FIELDS = Object.freeze({
  anywhere: Object.freeze([...new Set([
    ...ANSWER_NAMES, ...SOLUTION_AND_HELP_NAMES, ...ASSISTANCE_PAYLOAD_KEYS, ...REVIEW_SECRET_KEYS,
  ])].sort()),
  /*
   * Name families, so a new field named the way this codebase names keys is a
   * key from the start (design R7): every accepted-answer list (acceptedLabels,
   * acceptedXUnits, ...), every correct-* field (correctPairs, ...), every
   * *Answer / *Answers field (graphAnswer, promptAnswers, ...), and every
   * tolerance (how close counts as right).
   */
  anywherePatterns: Object.freeze([/^accepted[A-Z]/, /^correct[A-Z]/, /[a-z]Answers?$/, /(?:^t|T)olerance$/]),
  atRoot: Object.freeze([
    'answer', 'targetValue', 'targetRoot', 'targetN', 'ansNum', 'ansDen',
    'xIntercepts', 'yIntercept', 'extreme', 'axisOfSymmetry', 'asymptote', 'behavior', 'continuity',
    // the Interval Number Line's solution set (the tool never shows it), the
    // Representation Bridge's expected domain when it is not in `context`, and
    // the values a Function Operations quotient must exclude
    'intervals', 'domain', 'restrictions',
  ]),
  // A number line's `target` is its key; a transformation's target {a, h, k}
  // (an object) draws the item and stays.
  atRootWhenScalar: Object.freeze(['target']),
  paths: Object.freeze([
    'answerFields[].answer', 'answerFields[].value',
    'responseFields[].answer', 'responseFields[].value',
    'responses[].answer', 'responses[].value',
    'analysisRequests[].answer', 'analysisRequests[].value',
    'fields[].answer',
    'scaffold.correct',
    'table.answers',
    'targets[].classification',
    // Representation Bridge: each context question's answer, and the domain's bounds
    'context.*.value', 'context.*.answer', 'context.*.min', 'context.*.max',
    // Context Interpretation: the quantity, name and unit each coordinate must
    // be read as (a map { x, y }; Relationship Model's quantities LIST is what
    // the student sorts, and stays)
    'quantities.*',
    // Expression Meaning: the unit, meaning and role each expression must be given
    'expressions[].unit', 'expressions[].contextMeaning', 'expressions[].mathRole',
    'generator.derived',
    'guidedNotes.steps',
  ]),
  // Where a question nests another question it can become.
  roots: Object.freeze(['variants[]', 'differentiation.bandProfiles.*']),
});

/** Why a split or a merge refused. `code` is machine-readable. */
export class AssignmentKeyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AssignmentKeyError';
    this.code = code;
  }
}

const MAX_DEPTH = 64;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ARRAY_ELEMENT = Symbol('array element');

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const isContainer = (value) => Array.isArray(value) || isPlainObject(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
// Never an assignment: `out[key] = value` with key "__proto__" would set the
// prototype instead of adding the field JSON.parse gave the source.
const defineField = (object, key, value) => {
  Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
};

/** A deep copy of plain objects and arrays. Anything else (a Timestamp, a number) is kept as it is. */
const cloneValue = (value, depth = 0) => {
  if (depth > MAX_DEPTH) throw new AssignmentKeyError('too-deep', `A question nests more than ${MAX_DEPTH} levels.`);
  if (Array.isArray(value)) return value.map((child) => cloneValue(child, depth + 1));
  if (!isPlainObject(value)) return value;
  const out = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
  Object.keys(value).forEach((key) => defineField(out, key, cloneValue(value[key], depth + 1)));
  return out;
};

// 'answerFields[].answer' -> ['answerFields', ARRAY_ELEMENT, 'answer']; '*' is any field name.
const parsePattern = (pattern) => pattern.split('.').flatMap((segment) => (
  segment.endsWith('[]') ? [segment.slice(0, -2), ARRAY_ELEMENT] : [segment]
));
const ANYWHERE = new Set(KEY_FIELDS.anywhere);
const AT_ROOT = new Set(KEY_FIELDS.atRoot);
const AT_ROOT_WHEN_SCALAR = new Set(KEY_FIELDS.atRootWhenScalar);
const PATHS = KEY_FIELDS.paths.map(parsePattern);
const ROOT_CONTAINERS = KEY_FIELDS.roots.map(parsePattern);

const segmentMatches = (segment, step) => (segment === '*' ? typeof step === 'string' : segment === step);
const matches = (pattern, path) => pattern.length === path.length && pattern.every((segment, index) => segmentMatches(segment, path[index]));
// Does the path END with this pattern? `answerFields[].answer` under any object.
const endsWith = (pattern, path) => pattern.length <= path.length
  && pattern.every((segment, index) => segmentMatches(segment, path[path.length - pattern.length + index]));

/** Is this field a key, here? `trail` is its path, with array indices as ARRAY_ELEMENT. */
const movesField = (key, value, trail, atRoot) => {
  if (ANYWHERE.has(key) || KEY_FIELDS.anywherePatterns.some((pattern) => pattern.test(key))) return true;
  if (atRoot && AT_ROOT.has(key)) return true;
  if (atRoot && AT_ROOT_WHEN_SCALAR.has(key) && (value === null || typeof value !== 'object')) return true;
  return PATHS.some((pattern) => endsWith(pattern, trail));
};

const splitValue = (value, absolute, trail, relative, fields, depth) => {
  if (depth > MAX_DEPTH) throw new AssignmentKeyError('too-deep', `A question nests more than ${MAX_DEPTH} levels.`);
  if (!isContainer(value)) return value;
  // A variant or a band profile is a question of its own.
  const root = relative.length > 0 && ROOT_CONTAINERS.some((pattern) => matches(pattern, relative));
  const here = root ? [] : relative;
  if (Array.isArray(value)) {
    return value.map((child, index) => splitValue(child, [...absolute, index], [...trail, ARRAY_ELEMENT], [...here, ARRAY_ELEMENT], fields, depth + 1));
  }
  const atRoot = root || absolute.length === 0;
  const out = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
  Object.keys(value).forEach((key, at) => {
    const child = value[key];
    if (movesField(key, child, [...trail, key], atRoot)) {
      fields.push({ path: [...absolute, key], at, value: cloneValue(child, depth + 1) });
      return;
    }
    defineField(out, key, splitValue(child, [...absolute, key], [...trail, key], [...here, key], fields, depth + 1));
  });
  return out;
};

/**
 * One question, split. `privatePart` is null when nothing moved, else
 * `{ fields: [{ path, at, value }] }`: `path` runs from the question to the
 * moved field (field names and array indices), `at` is the field's position
 * among its siblings. The input is not changed, and neither result shares a
 * plain object or array with it.
 */
export const splitQuestion = (question) => {
  if (!isPlainObject(question)) return { publicQuestion: cloneValue(question), privatePart: null };
  const fields = [];
  const publicQuestion = splitValue(question, [], [], [], fields, 0);
  return { publicQuestion, privatePart: fields.length ? { fields } : null };
};

const fail = (code, message) => { throw new AssignmentKeyError(code, message); };

const readFields = (privatePart) => {
  if (privatePart === null || privatePart === undefined) return [];
  if (!isPlainObject(privatePart) || !Array.isArray(privatePart.fields)) fail('malformed-private-part', 'A private part is { fields: [...] }.');
  return privatePart.fields.map((field, index) => {
    if (!isPlainObject(field) || !hasOwn(field, 'value')) fail('malformed-private-part', `Private field ${index} has no value.`);
    const { path, at } = field;
    if (!Array.isArray(path) || !path.length || typeof path[path.length - 1] !== 'string') {
      fail('malformed-private-part', `Private field ${index} has no path to a field.`);
    }
    path.forEach((segment) => {
      const valid = (typeof segment === 'string' && !UNSAFE_KEYS.has(segment))
        || (Number.isInteger(segment) && segment >= 0);
      if (!valid) fail('malformed-private-part', `Private field ${index} has an unusable path.`);
    });
    if (!Number.isInteger(at) || at < 0) fail('malformed-private-part', `Private field ${index} has no position.`);
    return { parent: path.slice(0, -1), key: path[path.length - 1], at, value: field.value };
  });
};

/**
 * The question a public question and its private part were split from. Throws
 * AssignmentKeyError when the part does not belong to this public question.
 * The inputs are not changed.
 */
export const mergeQuestion = (publicQuestion, privatePart) => {
  const fields = readFields(privatePart);
  const merged = cloneValue(publicQuestion);
  if (!fields.length) return merged;
  if (!isPlainObject(merged)) fail('private-part-without-question', 'A private part cannot be merged into something that is not a question.');
  // Every moved field's parent is part of the public question: the split never
  // looks inside a field it moves.
  const byParent = new Map();
  fields.forEach((field) => {
    const id = JSON.stringify(field.parent);
    if (!byParent.has(id)) byParent.set(id, { path: field.parent, fields: [] });
    byParent.get(id).fields.push(field);
  });
  byParent.forEach(({ path, fields: entries }) => {
    let parent = merged;
    path.forEach((segment) => {
      const next = typeof segment === 'number'
        ? (Array.isArray(parent) && segment < parent.length ? parent[segment] : undefined)
        : (isPlainObject(parent) && hasOwn(parent, segment) ? parent[segment] : undefined);
      if (!isContainer(next)) fail('private-part-does-not-fit', `No ${JSON.stringify(path)} in the public question.`);
      parent = next;
    });
    if (!isPlainObject(parent)) fail('private-part-does-not-fit', `${JSON.stringify(path)} is not an object in the public question.`);
    const kept = Object.keys(parent);
    const total = kept.length + entries.length;
    const inserts = [...entries].sort((left, right) => left.at - right.at);
    inserts.forEach((entry, index) => {
      if (hasOwn(parent, entry.key)) fail('private-part-does-not-fit', `The public question already has ${JSON.stringify([...path, entry.key])}.`);
      if (entry.at >= total || (index > 0 && inserts[index - 1].at === entry.at)) {
        fail('private-part-does-not-fit', `A private field's position does not fit ${JSON.stringify(path)}.`);
      }
    });
    // Rebuild the object in the order its fields had before the split.
    const ordered = [];
    let next = 0;
    let insert = 0;
    for (let position = 0; position < total; position += 1) {
      if (insert < inserts.length && inserts[insert].at === position) {
        ordered.push([inserts[insert].key, cloneValue(inserts[insert].value)]);
        insert += 1;
      } else {
        ordered.push([kept[next], parent[kept[next]]]);
        next += 1;
      }
    }
    kept.forEach((key) => { delete parent[key]; });
    ordered.forEach(([key, value]) => defineField(parent, key, value));
  });
  return merged;
};

/*
 * The id a question's private part is filed under. A key document must hold
 * exactly one part per question, so a question that carries keys needs an id
 * of its own (the content-upgrade plan refuses the same two cases:
 * functions/lib/assignmentContentVersion.js). Firestore cannot name a map
 * field "__x__" or one longer than 1,500 bytes.
 */
const questionKeyId = (question) => {
  const raw = isPlainObject(question) ? question.questionId : undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return raw;
};
const storableId = (id) => !/^__.*__$/.test(id) && new TextEncoder().encode(id).length <= 1500;

const sectionsWith = (sections, eachQuestion) => (Array.isArray(sections) ? sections : []).map((section) => {
  if (!isPlainObject(section) || !Array.isArray(section.questions)) return cloneValue(section);
  const out = Object.getPrototypeOf(section) === null ? Object.create(null) : {};
  Object.keys(section).forEach((key) => {
    defineField(out, key, key === 'questions' ? section.questions.map(eachQuestion) : cloneValue(section[key]));
  });
  return out;
});

const idCounts = (sections) => {
  const counts = new Map();
  (Array.isArray(sections) ? sections : []).forEach((section) => {
    (isPlainObject(section) && Array.isArray(section.questions) ? section.questions : []).forEach((question) => {
      const id = questionKeyId(question);
      if (id !== null) counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  return counts;
};

/**
 * An assignment's V5 sections, split question by question. Sections keep every
 * field of their own (none is a key). Throws AssignmentKeyError when a question
 * that carries keys has no usable id, or shares its id with another question.
 */
export const splitAssignment = (sections) => {
  const counts = idCounts(sections);
  const keysByQuestionId = {};
  const publicSections = sectionsWith(sections, (question) => {
    const { publicQuestion, privatePart } = splitQuestion(question);
    if (!privatePart) return publicQuestion;
    const id = questionKeyId(question);
    if (id === null) fail('question-without-id', 'A question that carries keys has no questionId.');
    if (!storableId(id)) fail('question-id-not-storable', 'A questionId cannot name a Firestore field.');
    if (counts.get(id) > 1) fail('duplicate-question-id', 'Two questions share a questionId, and one of them carries keys.');
    defineField(keysByQuestionId, id, privatePart);
    return publicQuestion;
  });
  return { publicSections, keysByQuestionId };
};

/**
 * The sections a split came from. Every private part must be used exactly
 * once: a part with no question, or a question id two questions share, means
 * the keys belong to other sections, and the merge refuses.
 */
export const mergeAssignment = (publicSections, keysByQuestionId) => {
  const keys = keysByQuestionId ?? {};
  if (!isPlainObject(keys)) fail('malformed-keys', 'keysByQuestionId is an object.');
  const counts = idCounts(publicSections);
  const used = new Set();
  const sections = sectionsWith(publicSections, (question) => {
    const id = questionKeyId(question);
    if (id === null || !hasOwn(keys, id)) return mergeQuestion(question, null);
    if (counts.get(id) > 1) fail('duplicate-question-id', 'Two questions share a questionId that has keys.');
    used.add(id);
    return mergeQuestion(question, keys[id]);
  });
  const unused = Object.keys(keys).filter((id) => !used.has(id));
  if (unused.length) fail('unused-keys', `${unused.length} private part(s) match no question.`);
  return sections;
};
