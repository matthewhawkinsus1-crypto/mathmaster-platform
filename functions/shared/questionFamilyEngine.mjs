/*
 * FROM A FAMILY TO ONE STUDENT'S QUESTION.
 *
 * The contract (questionFamilyContract.mjs) says what a family IS. This file
 * turns one into questions, and it is organised around the guarantee the old
 * generators could not make:
 *
 *   Two different allocation indices always produce two different questions,
 *   for as long as the family has that many distinct valid questions to give.
 *
 * HOW. A family's parameter domains are finite, so its whole space of
 * parameter tuples can be numbered 0..N-1 (mixed radix, one digit per
 * parameter). A seeded bijective permutation of 0..N-1 then visits that space
 * in a scrambled but fixed order, and walking it while skipping invalid tuples
 * and repeated fingerprints yields THE DISTINCT INSTANCE LIST for one slot:
 *
 *   D[0], D[1], D[2], ...   every entry valid, no two with the same fingerprint
 *
 * A student's question is D[allocationIndex]. Distinct indices therefore mean
 * distinct questions by construction — nothing is left to the luck of a hash —
 * and the list is identical on every device and on the server, because it is a
 * pure function of (family, version, constraints, slot seed).
 *
 * WHY A PERMUTATION AND NOT "DRAW UNTIL NEW". Rejection sampling with a set of
 * seen fingerprints works until the space is nearly used up, then it spins; and
 * it cannot tell "this family has only 8 questions" from "I was unlucky". A
 * permutation visits each tuple exactly once, so exhaustion is a fact the
 * engine reports rather than a loop it gets stuck in.
 *
 * Pure: no Firestore, no clock, no Math.random.
 */

import { FAMILY_ISSUE, domainValues, isQuestionFamily } from './questionFamilyContract.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/* ---------------------------------------------------------------------------
 * Hashing. FNV-1a for strings (the pair the platform's seeded generators
 * already use) and a murmur3 finalizer for mixing integers inside the
 * permutation's round function.
 * ------------------------------------------------------------------------- */

export const hashString32 = (value, seed = 0x811c9dc5) => {
  let hash = seed >>> 0;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const mix32 = (value) => {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
};

/* ---------------------------------------------------------------------------
 * The parameter space.
 * ------------------------------------------------------------------------- */

/**
 * Every parameter tuple a family could draw under these constraints, as a
 * numbered space.
 *
 * Names are sorted so the numbering never depends on the order a family author
 * happened to list them in.
 */
export const buildParameterSpace = (family, constraintValues = {}) => {
  let domains = {};
  try {
    domains = family.parameters(constraintValues) || {};
  } catch {
    domains = {};
  }
  const names = Object.keys(domains).sort();
  const values = names.map((name) => domainValues(domains[name]));
  const size = values.length && values.every((entry) => entry.length > 0)
    ? values.reduce((product, entry) => product * entry.length, 1)
    : 0;
  return Object.freeze({ names, values, size });
};

/** Tuple number -> parameters. The last name is the fastest-moving digit. */
export const decodeParameterIndex = (space, index) => {
  const params = {};
  let remainder = Math.floor(Number(index));
  for (let position = space.names.length - 1; position >= 0; position -= 1) {
    const options = space.values[position];
    params[space.names[position]] = options[remainder % options.length];
    remainder = Math.floor(remainder / options.length);
  }
  return params;
};

/*
 * A SEEDED BIJECTION OF 0..size-1.
 *
 * A four-round balanced Feistel network over the smallest even bit width that
 * covers `size`, with cycle walking to stay inside the range. Feistel networks
 * are permutations by construction whatever the round function, so this is a
 * true bijection: every index maps to exactly one tuple and no two indices map
 * to the same one. Spaces wider than 2^30 are refused — no family here comes
 * within orders of magnitude of that, and 32-bit integer arithmetic stays
 * exact below it.
 */
export const MAX_PERMUTABLE_SPACE = 2 ** 30;

export const createIndexPermutation = (size, seedKey) => {
  const count = Math.floor(Number(size));
  if (!Number.isFinite(count) || count <= 0) return () => null;
  if (count === 1) return (index) => (index === 0 ? 0 : null);
  if (count > MAX_PERMUTABLE_SPACE) {
    throw new RangeError(`Parameter space of ${count} tuples is too large to permute exactly.`);
  }
  let bits = Math.max(2, Math.ceil(Math.log2(count)));
  if (bits % 2) bits += 1;
  const half = bits / 2;
  const mask = (2 ** half) - 1;
  const keys = [0, 1, 2, 3].map((round) => hashString32(`${seedKey}|feistel:${round}`));
  const encrypt = (value) => {
    let left = Math.floor(value / (2 ** half));
    let right = value & mask;
    keys.forEach((key) => {
      const next = (left ^ (mix32((right ^ key) >>> 0) & mask)) & mask;
      left = right;
      right = next;
    });
    return left * (2 ** half) + right;
  };
  return (index) => {
    const position = Math.floor(Number(index));
    if (!Number.isFinite(position) || position < 0 || position >= count) return null;
    let value = encrypt(position);
    // Cycle walking: the permutation of the covering power of two, restricted
    // to [0, count), is still a permutation. The bit width is under 4x count,
    // so this loop runs a small constant number of times on average.
    while (value >= count) value = encrypt(value);
    return value;
  };
};

/* ---------------------------------------------------------------------------
 * One candidate.
 * ------------------------------------------------------------------------- */

const everyNumberFinite = (value, depth = 0) => {
  if (depth > 4) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => everyNumberFinite(entry, depth + 1));
  if (isObject(value)) return Object.values(value).every((entry) => everyNumberFinite(entry, depth + 1));
  return true;
};

const GRAPH_MARGIN = 1;

/**
 * Is every feature a student must locate inside the window, with a one-unit
 * margin so a vertex is never drawn on the border where a click can miss it?
 */
export const featuresInsideWindow = (window, features = []) => {
  if (!isObject(window)) return false;
  const { xMin, xMax, yMin, yMax } = window;
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) return false;
  return (Array.isArray(features) ? features : []).every((point) => (
    Array.isArray(point)
    && point[0] >= xMin + GRAPH_MARGIN && point[0] <= xMax - GRAPH_MARGIN
    && point[1] >= yMin + GRAPH_MARGIN && point[1] <= yMax - GRAPH_MARGIN
  ));
};

/**
 * Evaluate one parameter tuple: derive, validate, fingerprint, answer.
 *
 * A family's own functions are author code, so they are called defensively:
 * anything that throws or produces a non-finite number is a refused candidate
 * with a reason, never an exception that takes the assignment down.
 */
export const evaluateFamilyCandidate = (family, constraintValues, params) => {
  let derived;
  try {
    derived = family.derive(params, constraintValues) || {};
  } catch {
    return { valid: false, issues: [FAMILY_ISSUE.INVALID_PARAMETERS] };
  }
  const values = Object.freeze({ ...params, ...derived });
  if (!everyNumberFinite(values)) return { valid: false, issues: [FAMILY_ISSUE.DIVIDE_BY_ZERO] };

  let issues;
  try {
    issues = [...(family.rules(values, constraintValues) || [])];
  } catch {
    issues = [FAMILY_ISSUE.INVALID_PARAMETERS];
  }

  let graphWindow = null;
  if (!issues.length && family.graphWindow) {
    try {
      graphWindow = family.graphWindow(values, constraintValues) || null;
    } catch {
      graphWindow = null;
    }
    if (!graphWindow || !featuresInsideWindow(graphWindow.window, graphWindow.features)) {
      issues.push(FAMILY_ISSUE.FEATURE_OUTSIDE_WINDOW);
    }
  }
  if (issues.length) return { valid: false, issues };

  let fingerprint;
  let answer;
  try {
    fingerprint = String(family.fingerprint(values, constraintValues));
    answer = family.answer(values, constraintValues);
  } catch {
    return { valid: false, issues: [FAMILY_ISSUE.INVALID_PARAMETERS] };
  }
  if (!fingerprint || answer === undefined || answer === null) {
    return { valid: false, issues: [FAMILY_ISSUE.INVALID_PARAMETERS] };
  }

  return {
    valid: true,
    issues: [],
    instance: Object.freeze({
      familyId: family.id,
      familyVersion: family.version,
      params: Object.freeze({ ...params }),
      values,
      fingerprint,
      answer: Object.freeze(isObject(answer) ? { ...answer } : { value: answer }),
      graphWindow: graphWindow ? Object.freeze({ ...graphWindow.window }) : null,
    }),
  };
};

/* ---------------------------------------------------------------------------
 * The distinct instance list for one slot.
 * ------------------------------------------------------------------------- */

// How many candidates may be examined per instance requested before the
// engine concludes the family is (nearly) exhausted. Generous: validity
// ratios in the platform library are well above 1 in 20.
const EXAMINE_BUDGET_PER_INSTANCE = 60;
const MIN_EXAMINE_BUDGET = 2000;

/**
 * The lazily-built distinct instance list for (family, constraints, seed).
 *
 * `instanceAt(k)` walks the permutation only as far as it must, and remembers
 * what it found, so asking for D[3] and then D[70] does the work once.
 */
export const createFamilyInstanceSequence = (family, constraintValues, seedKey) => {
  if (!isQuestionFamily(family)) throw new TypeError('createFamilyInstanceSequence needs a defined question family.');
  const space = buildParameterSpace(family, constraintValues);
  const permute = createIndexPermutation(space.size, `${family.id}|v${family.version}|${seedKey}`);
  const found = [];
  const fingerprints = new Set();
  const rejections = {};
  let cursor = 0;

  const examineOne = () => {
    const tupleIndex = permute(cursor);
    cursor += 1;
    if (tupleIndex === null) return;
    const evaluated = evaluateFamilyCandidate(family, constraintValues, decodeParameterIndex(space, tupleIndex));
    if (!evaluated.valid) {
      evaluated.issues.forEach((issue) => { rejections[issue] = (rejections[issue] || 0) + 1; });
      return;
    }
    if (fingerprints.has(evaluated.instance.fingerprint)) {
      rejections.duplicate_fingerprint = (rejections.duplicate_fingerprint || 0) + 1;
      return;
    }
    fingerprints.add(evaluated.instance.fingerprint);
    found.push(evaluated.instance);
  };

  const fill = (target, budget) => {
    let examined = 0;
    while (found.length <= target && cursor < space.size && examined < budget) {
      examineOne();
      examined += 1;
    }
  };

  return Object.freeze({
    familyId: family.id,
    familyVersion: family.version,
    spaceSize: space.size,
    instanceAt(index, { budget = null } = {}) {
      const target = Math.max(0, Math.floor(Number(index) || 0));
      if (target < found.length) return found[target];
      fill(target, budget ?? Math.max(MIN_EXAMINE_BUDGET, (target + 1) * EXAMINE_BUDGET_PER_INSTANCE));
      return found[target] || null;
    },
    /** Every distinct instance, when the whole space fits in the budget. */
    exhaust(budget = MIN_EXAMINE_BUDGET * 10) {
      fill(Number.MAX_SAFE_INTEGER, budget);
      return { instances: [...found], complete: cursor >= space.size, examined: cursor };
    },
    get examined() { return cursor; },
    get distinctFound() { return found.length; },
    get complete() { return cursor >= space.size; },
    rejections: () => ({ ...rejections }),
  });
};

/*
 * A BOUNDED CACHE OF SEQUENCES.
 *
 * Building D up to index 200 is a few thousand pure evaluations; a question
 * re-renders far more often than that. The cache key is (family, version,
 * constraints, slot seed) — there is NO student in it. A sequence is the
 * class-wide list; which entry is yours is decided by your seat, outside this
 * cache, so nothing cached here can hand one student another student's
 * question.
 */
const SEQUENCE_CACHE_LIMIT = 64;
const sequenceCache = new Map();

/*
 * A platform family is immutable per (id, version). An assignment-local
 * family is NOT: its id is its slot (`local:<assignment>|<question>`), and a
 * teacher can edit the template in place without bumping a version. Its
 * content hash is therefore part of its identity here — without it, an edited
 * template in the same session (a Pre-Flight re-run after a repair, a warm
 * server instance) kept serving the instance list of the template it
 * replaced, so Pre-Flight re-checked versions that no longer existed.
 */
export const familySequenceKey = (family, constraintValues, seedKey) => (
  `${family.id}|v${family.version}${family.source?.contentHash ? `|c${family.source.contentHash}` : ''}|${JSON.stringify(constraintValues || {})}|${seedKey}`
);

export const cachedFamilyInstanceSequence = (family, constraintValues, seedKey) => {
  const key = familySequenceKey(family, constraintValues, seedKey);
  const existing = sequenceCache.get(key);
  if (existing) {
    // Refresh recency.
    sequenceCache.delete(key);
    sequenceCache.set(key, existing);
    return existing;
  }
  const created = createFamilyInstanceSequence(family, constraintValues, seedKey);
  sequenceCache.set(key, created);
  while (sequenceCache.size > SEQUENCE_CACHE_LIMIT) {
    sequenceCache.delete(sequenceCache.keys().next().value);
  }
  return created;
};

/** Test seam: clears the sequence cache. */
export const clearFamilySequenceCache = () => sequenceCache.clear();

/* ---------------------------------------------------------------------------
 * Capacity.
 * ------------------------------------------------------------------------- */

export const EXACT_CAPACITY_LIMIT = 250000;

/**
 * How many distinct valid questions this family can produce here.
 *
 * Exact whenever the parameter space is small enough to walk (every family in
 * the platform library is). Otherwise an estimate from a permuted sample,
 * labelled `exact: false` so nobody mistakes it for a guarantee.
 */
export const measureFamilyCapacity = (family, constraintValues = {}, { budget = EXACT_CAPACITY_LIMIT } = {}) => {
  const space = buildParameterSpace(family, constraintValues);
  if (!space.size) {
    return { capacity: 0, exact: true, spaceSize: 0, examined: 0, validRatio: 0, rejections: {} };
  }
  const sequence = createFamilyInstanceSequence(family, constraintValues, 'capacity');
  const result = sequence.exhaust(Math.min(budget, space.size));
  const examined = result.examined;
  const distinct = result.instances.length;
  if (result.complete) {
    return {
      capacity: distinct,
      exact: true,
      spaceSize: space.size,
      examined,
      validRatio: examined ? distinct / examined : 0,
      rejections: sequence.rejections(),
    };
  }
  const ratio = examined ? distinct / examined : 0;
  return {
    capacity: Math.floor(ratio * space.size),
    exact: false,
    spaceSize: space.size,
    examined,
    validRatio: ratio,
    rejections: sequence.rejections(),
  };
};

/* ---------------------------------------------------------------------------
 * Building the question a student sees.
 * ------------------------------------------------------------------------- */

// Fields a built question must never carry forward from its template: they
// would make the server treat an INSTANCE as a template again (and refuse to
// grade it), or re-enter generation.
const TEMPLATE_ONLY_FIELDS = ['generator', 'variants', 'questionFamily', 'generatorVersion'];

/**
 * The question document for one instance, rendered for one tool.
 *
 * The authored slot supplies everything the family does not own — section
 * role, standards, weight, ids, the teacher's own lead-in prompt — and the
 * family supplies the mathematics. Standards and role are never overwritten by
 * a family: adaptation's protected fields apply here too.
 */
export const buildFamilyQuestion = ({ family, instance, constraintValues = {}, authored = {}, tool = null }) => {
  const toolType = family.tools[tool] ? tool : family.defaultTool;
  const builder = family.tools[toolType];
  const base = { ...(isObject(authored) ? authored : {}) };
  TEMPLATE_ONLY_FIELDS.forEach((field) => { delete base[field]; });

  const built = builder(instance.values, {
    constraints: constraintValues,
    authored: base,
    answer: instance.answer,
    graphWindow: instance.graphWindow,
  }) || {};

  const question = {
    ...base,
    ...built,
    type: built.type || toolType,
    // The authored identity always wins: the family writes mathematics, not
    // which question this is or what it is aligned to.
    ...(base.id !== undefined ? { id: base.id } : {}),
    ...(base.questionId !== undefined ? { questionId: base.questionId } : {}),
    ...(base.activityRole !== undefined ? { activityRole: base.activityRole } : {}),
    ...(base.alignments !== undefined ? { alignments: base.alignments } : {}),
    ...(base.standard !== undefined ? { standard: base.standard } : {}),
    ...(base.teks !== undefined ? { teks: base.teks } : {}),
    // On an authored question `familyId` already names its CCMR/Path bank
    // family, which evidence and provenance read. That is kept; the Question
    // Family identity always travels in `familyInstance`.
    familyId: base.familyId !== undefined ? base.familyId : family.id,
    familyVersion: base.familyId !== undefined ? base.familyVersion : family.version,
    familyInstance: Object.freeze({
      familyId: family.id,
      familyVersion: family.version,
      fingerprint: instance.fingerprint,
    }),
  };
  TEMPLATE_ONLY_FIELDS.forEach((field) => { delete question[field]; });
  return question;
};
