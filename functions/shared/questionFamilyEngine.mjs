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

import { FAMILY_ISSUE, choiceDomain, domainValues, isQuestionFamily } from './questionFamilyContract.mjs';

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
 *
 * For a stratified family, `stratum` (e.g. { case: 'none' }) is passed to
 * `parameters` and its entries join the space as single-value parameters, so
 * every instance records the stratum it came from. Without one the family's
 * `parameters` is called exactly as it always was.
 */
export const buildParameterSpace = (family, constraintValues = {}, stratum = undefined) => {
  let domains = {};
  try {
    domains = (stratum === undefined ? family.parameters(constraintValues) : family.parameters(constraintValues, stratum)) || {};
  } catch {
    domains = {};
  }
  if (stratum !== undefined) {
    domains = { ...domains };
    Object.entries(stratum).forEach(([name, value]) => { domains[name] = choiceDomain([value]); });
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
  if (family.strata) return createStratifiedSequence(family, constraintValues, seedKey);
  return createPlainSequence(family, constraintValues, seedKey);
};

/* ---------------------------------------------------------------------------
 * STRATIFIED SEQUENCES — A MIX THAT IS A MIX FOR EVERY CLASS.
 *
 * A slot that asks for "mixed" solution cases must actually hand a class all
 * of them. Drawing the case like any other parameter would not: the share of
 * each case would follow how many valid instances each happens to have, and a
 * class of 30 could get two identities and no contradictions. So a stratified
 * family lists its strata (one per case, say), each stratum gets its own
 * distinct instance list S_s (a plain sequence over the stratum's own
 * parameters, seeded by the slot and the stratum), and the slot's list
 * interleaves them in blocks:
 *
 *   D[k] = S_order(B)[k mod m] [B]       B = floor(k / m), m = number of strata
 *
 * where order(B) is a seeded shuffle of the strata for block B — balanced
 * by case when the family names `strata.balance` (blockOrder). So
 *
 *   - every m consecutive allocation indices starting at a multiple of m cover
 *     every stratum exactly once, and with a balance key every run of g
 *     indices starting a round covers every case once — 30 seats over 3
 *     cases are exactly 10 each, whatever else the strata vary;
 *   - a student's later variants (index + variant·stride, and the stride is
 *     the class size, often a multiple of m) do NOT keep landing on the same
 *     stratum, because the order changes from block to block;
 *   - distinct indices are distinct questions: within a stratum by its own
 *     list, across strata because no instance can belong to two of them
 *     (a family keeps its strata disjoint — a solution case is a property of
 *     the equation itself).
 *
 * D[k] must depend on k alone, never on which indices were asked for first,
 * or a pin could stop replaying. So a block exists only when EVERY stratum
 * reaches it: the list ends, cleanly, after the last whole block, and a slot
 * past the end wraps exactly as an unstratified family does.
 * ------------------------------------------------------------------------- */

/** "case=\"none\",shape=\"likeTerms\"" — a stratum's stable name. */
export const stratumKey = (stratum) => Object.keys(stratum || {}).sort()
  .map((name) => `${name}=${JSON.stringify(stratum[name])}`)
  .join(',');

const MAX_STRATA = 16;

/** The strata a slot balances, de-duplicated and validated; null when the family is not stratified. */
export const familyStrata = (family, constraintValues = {}) => {
  if (!family?.strata) return null;
  let listed;
  try {
    listed = family.strata.values(constraintValues);
  } catch {
    listed = [];
  }
  const seen = new Set();
  const strata = [];
  (Array.isArray(listed) ? listed : []).forEach((stratum) => {
    if (!isObject(stratum) || !Object.keys(stratum).length) return;
    const key = stratumKey(stratum);
    if (seen.has(key) || strata.length >= MAX_STRATA) return;
    seen.add(key);
    strata.push(Object.freeze({ ...stratum }));
  });
  return Object.freeze(strata);
};

/** The stratum an instance of a stratified family came from (its fixed parameters). */
export const instanceStratum = (family, constraintValues, instance) => (familyStrata(family, constraintValues) || [])
  .find((stratum) => Object.entries(stratum).every(([name, value]) => JSON.stringify(instance?.params?.[name]) === JSON.stringify(value))) || null;

/**
 * The order of the strata in block B.
 *
 * Plain: one seeded shuffle of the block. Balanced — the family names
 * `strata.balance` (the solution case): the strata are grouped by that key
 * and the block runs in rounds, each round one stratum of EVERY group in a
 * seeded order. So every run of g seats that starts a round (g = number of
 * cases) covers every case once, however many shapes each case has — a class
 * of 30 over three cases is exactly 10 each, with or without distribution
 * mixed in — and every whole block still covers every stratum once. Groups
 * of unequal size are not balanced (plain shuffle).
 */
const blockOrder = (family, strata, seedKey, block) => {
  const shuffled = (items, salt) => {
    const order = [...items];
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = hashString32(`${family.id}|v${family.version}|${seedKey}|block:${block}|${salt}${index}`) % (index + 1);
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order;
  };
  const plain = () => shuffled(strata.map((_, index) => index), '');
  const balance = family.strata?.balance;
  if (!balance) return plain();
  const groups = [];
  strata.forEach((stratum, index) => {
    const key = JSON.stringify(stratum[balance]);
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      group = { key, members: [] };
      groups.push(group);
    }
    group.members.push(index);
  });
  const size = groups[0]?.members.length || 0;
  if (groups.length < 2 || groups.some((group) => group.members.length !== size)) return plain();
  const members = groups.map((group, position) => shuffled(group.members, `group:${position}|`));
  const order = [];
  for (let round = 0; round < size; round += 1) {
    shuffled(groups.map((_, position) => position), `round:${round}|`).forEach((position) => order.push(members[position][round]));
  }
  return order;
};

const createStratifiedSequence = (family, constraintValues, seedKey) => {
  const strata = familyStrata(family, constraintValues);
  const subs = strata.map((stratum) => createPlainSequence(family, constraintValues, `${seedKey}|stratum:${stratumKey(stratum)}`, stratum));
  const count = subs.length;
  const orders = new Map();
  const orderFor = (block) => {
    if (!orders.has(block)) orders.set(block, blockOrder(family, strata, seedKey, block));
    return orders.get(block);
  };
  const entryAt = (index, budget) => {
    if (!count) return null;
    const position = Math.max(0, Math.floor(Number(index) || 0));
    const block = Math.floor(position / count);
    // Ask every stratum (no short cut): each one fills as far as this block,
    // which is what lets `distinctFound` say exactly where the list ends.
    const reached = subs.map((sub) => sub.instanceAt(block, { budget }));
    if (reached.some((instance) => !instance)) return null;
    return reached[orderFor(block)[position % count]];
  };
  return Object.freeze({
    familyId: family.id,
    familyVersion: family.version,
    spaceSize: subs.reduce((sum, sub) => sum + sub.spaceSize, 0),
    strata,
    instanceAt(index, { budget = null } = {}) {
      return entryAt(index, budget);
    },
    exhaust(budget = MIN_EXAMINE_BUDGET * 10) {
      const each = count ? Math.max(1, Math.floor(budget / count)) : 0;
      const results = subs.map((sub) => sub.exhaust(each));
      const blocks = count ? Math.min(...results.map((result) => result.instances.length)) : 0;
      const instances = [];
      for (let index = 0; index < blocks * count; index += 1) instances.push(entryAt(index, null));
      return {
        instances,
        complete: results.every((result) => result.complete),
        examined: results.reduce((sum, result) => sum + result.examined, 0),
        strata: strata.map((stratum, position) => ({ stratum, distinct: results[position].instances.length, complete: results[position].complete })),
      };
    },
    get examined() { return subs.reduce((sum, sub) => sum + sub.examined, 0); },
    // Whole blocks every stratum has reached. After a failed instanceAt every
    // stratum has been filled to that block, so this is then exactly where
    // the list ends — the count a wrap is taken modulo.
    get distinctFound() { return count ? count * Math.min(...subs.map((sub) => sub.distinctFound)) : 0; },
    get complete() { return subs.every((sub) => sub.complete); },
    rejections: () => subs.reduce((all, sub) => {
      Object.entries(sub.rejections()).forEach(([issue, total]) => { all[issue] = (all[issue] || 0) + total; });
      return all;
    }, {}),
  });
};

/** One unstratified list, or one stratum's list: the original engine, unchanged. */
const createPlainSequence = (family, constraintValues, seedKey, stratum = undefined) => {
  const space = buildParameterSpace(family, constraintValues, stratum);
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
  if (family?.strata) return measureStratifiedCapacity(family, constraintValues, { budget });
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

/**
 * Capacity of a stratified family: each stratum measured on its own list, and
 * the slot's capacity is the balanced part — m whole blocks' worth of the
 * smallest stratum — because that is where its interleaved list ends.
 * `strata` reports every stratum, so Pre-Flight can say which case runs out.
 */
const measureStratifiedCapacity = (family, constraintValues, { budget }) => {
  const strata = familyStrata(family, constraintValues) || [];
  const measured = strata.map((stratum) => {
    const space = buildParameterSpace(family, constraintValues, stratum);
    if (!space.size) return { stratum, capacity: 0, exact: true, spaceSize: 0, examined: 0, found: 0, rejections: {} };
    const sequence = createPlainSequence(family, constraintValues, `capacity|stratum:${stratumKey(stratum)}`, stratum);
    const result = sequence.exhaust(Math.min(budget, space.size));
    const ratio = result.examined ? result.instances.length / result.examined : 0;
    return {
      stratum,
      capacity: result.complete ? result.instances.length : Math.floor(ratio * space.size),
      exact: result.complete,
      spaceSize: space.size,
      examined: result.examined,
      found: result.instances.length,
      rejections: sequence.rejections(),
    };
  });
  const examined = measured.reduce((sum, entry) => sum + entry.examined, 0);
  const distinct = measured.reduce((sum, entry) => sum + entry.capacity, 0);
  return {
    capacity: measured.length ? measured.length * Math.min(...measured.map((entry) => entry.capacity)) : 0,
    exact: measured.every((entry) => entry.exact),
    spaceSize: measured.reduce((sum, entry) => sum + entry.spaceSize, 0),
    examined,
    validRatio: examined ? measured.reduce((sum, entry) => sum + entry.found, 0) / examined : 0,
    rejections: measured.reduce((all, entry) => {
      Object.entries(entry.rejections).forEach(([issue, total]) => { all[issue] = (all[issue] || 0) + total; });
      return all;
    }, {}),
    distinctTotal: distinct,
    strata: measured.map(({ stratum, capacity, exact, spaceSize }) => ({ stratum, capacity, exact, spaceSize })),
  };
};

/* ---------------------------------------------------------------------------
 * Building the question a student sees.
 * ------------------------------------------------------------------------- */

// Fields a built question must never carry forward from its template: they
// would make the server treat an INSTANCE as a template again (and refuse to
// grade it), or re-enter generation.
const TEMPLATE_ONLY_FIELDS = ['generator', 'variants', 'questionFamily', 'generatorVersion'];
const SLOT_GRADE_VALUE_FIELDS = ['questionWeight', 'questionWeightBasis'];

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
  (family.instanceFields || []).forEach((field) => { delete base[field]; });

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
  // THE GRADE VALUE IS THE SLOT'S. Every student's version of one slot counts
  // the same in the grade, whatever numbers it drew — so neither a family
  // builder nor a templated field may give an instance a value of its own.
  // Grading reads the stored slot (weightedQuestionTotals, Recovery's
  // recoveryQuestionWeight); the instance carries the same value so that what
  // a student is told ("Grade weight ×3") is what is counted.
  SLOT_GRADE_VALUE_FIELDS.forEach((field) => {
    if (base[field] !== undefined) question[field] = base[field];
    else delete question[field];
  });
  return question;
};
