/*
 * VERIFIED FACTS: WHAT A STUDENT HAS ESTABLISHED, AND HOW THEY ESTABLISHED IT.
 *
 * The tool-agnostic core of a representation tool's Process Mode. A tool —
 * today the Multiple Representations board (../toolMath/representationBridge/
 * lmrProcessModel.mjs); later quadratic key features, exponential
 * representations, systems or transformations — describes four things:
 *
 *   FACTS            the mathematical information that matters: a slope, an
 *                    intercept, a vertex, a known point. A fact is single
 *                    valued unless it is `multiple` (points collect).
 *   STRATEGIES       the processes that establish facts. Each offers one or
 *                    more SOURCES — the GIVEN representation, or facts the
 *                    student has already established — and PRODUCES facts.
 *                    A source may NEED facts first (a requirement, below).
 *   REPRESENTATIONS  what the student builds, each with an UNLOCK
 *                    requirement: enough mathematics to build it, never a
 *                    position in a sequence.
 *   TOKENS           what requirements are written in. By default one per
 *                    established fact; a model adds its own (`tokensOf`),
 *                    such as "two different points".
 *
 * and supplies one pure function that marks a piece of process evidence
 * against the authoritative question (`evaluate`). This module owns the rest,
 * identically on the device and on the server:
 *
 *   - the PROCESS LOG: the student's raw evidence — which strategy, from which
 *     source, the work itself, when, and after how many tries. Bounded,
 *     sanitized and versioned like any tool work. It is never a verdict:
 *     correctness is recomputed from it every time it is read.
 *   - RESOLUTION: which facts the log establishes, with which values, and
 *     whether each is correct. What a strategy needs must be established by
 *     ANOTHER entry, so a circular claim establishes nothing, and the latest
 *     claim of a fact is the student's answer for it.
 *   - UNLOCKS: whether a representation has the mathematics it needs, and the
 *     smallest set of facts still missing.
 *   - REACHABILITY: which tokens a question can ever establish — what
 *     Pre-Flight uses to refuse a board whose required work no pathway can
 *     unlock.
 *
 * BINDING. A log belongs to one delivered question (`bind`, a fingerprint the
 * tool computes from the question's mathematics). A log written for another
 * version — a previous Question Family instance, the DOL a Recovery replaces,
 * an edited question — establishes nothing, so a fact can never travel
 * between versions or students.
 *
 * Pure and light: no React, no DOM, no mathjs, no clock.
 */
import { NON_WORK_KEYS } from '../serverGrading/toolResponseContract.mjs';
import { FORBIDDEN_DRAFT_KEYS } from '../workspaceDraftSchema.mjs';

export const PROCESS_LOG_VERSION = 1;

export const PROCESS_LOG_LIMITS = Object.freeze({
  // Facts are few; a student who re-establishes one replaces its entry.
  maxEntries: 16,
  maxIdLength: 40,
  // One typed value, one point, or one side of an equation.
  maxTextLength: 240,
  // Intermediate equations kept per entry: teacher evidence of the process.
  maxSteps: 10,
  maxEvidenceKeys: 14,
  maxEvidenceDepth: 3,
  maxListLength: 24,
  // The whole log, serialized. It travels inside the board's work (24,000
  // characters in all) and inside the board's draft record (16 KB in all),
  // beside every card of the board and the work in progress — so it keeps
  // well under a third of that record. Over budget, older entries lose their
  // intermediate steps first, then the oldest entries go.
  maxJsonLength: 5000,
  // A student's attempt count on one process, for teacher evidence.
  maxTries: 999,
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '');
const list = (value) => (Array.isArray(value) ? value : []);

// Never evidence: a verdict a device could assert, or answer-key material.
// The same lists the tool-response contract and the draft schema refuse, so
// a process log can never be the reason either one rejects a whole record.
const BLOCKED_KEYS = new Set([...NON_WORK_KEYS, ...FORBIDDEN_DRAFT_KEYS, '__proto__', 'constructor', 'prototype']);

/* ---------------------------------------------------------------------------
 * Requirements: a tiny boolean language over tokens.
 *
 *   'slope'                  the token holds
 *   { all: [r, r, …] }       every requirement holds
 *   { any: [r, r, …] }       at least one holds
 * ------------------------------------------------------------------------- */

export const requirementMet = (requirement, tokens) => {
  if (requirement === null || requirement === undefined) return true;
  const has = tokens instanceof Set ? (token) => tokens.has(token) : (token) => list(tokens).includes(token);
  if (typeof requirement === 'string') return has(requirement);
  if (isObject(requirement) && Array.isArray(requirement.all)) return requirement.all.every((part) => requirementMet(part, tokens));
  if (isObject(requirement) && Array.isArray(requirement.any)) return requirement.any.some((part) => requirementMet(part, tokens));
  return false;
};

/** Every token a requirement mentions. */
export const requirementTokens = (requirement, into = new Set()) => {
  if (typeof requirement === 'string') into.add(requirement);
  else if (isObject(requirement)) [...list(requirement.all), ...list(requirement.any)].forEach((part) => requirementTokens(part, into));
  return into;
};

// The requirement as alternatives, each a set of tokens that together satisfy
// it (disjunctive normal form). Requirements are tiny; the cap only guards a
// malformed one.
const MAX_ALTERNATIVES = 64;
export const requirementAlternatives = (requirement) => {
  if (requirement === null || requirement === undefined) return [[]];
  if (typeof requirement === 'string') return [[requirement]];
  if (isObject(requirement) && Array.isArray(requirement.any)) {
    return requirement.any.flatMap(requirementAlternatives).slice(0, MAX_ALTERNATIVES);
  }
  if (isObject(requirement) && Array.isArray(requirement.all)) {
    return requirement.all.reduce((combined, part) => combined.flatMap((left) => requirementAlternatives(part)
      .map((right) => [...new Set([...left, ...right])])).slice(0, MAX_ALTERNATIVES), [[]]);
  }
  return [];
};

/**
 * What is still needed: the alternative with the fewest missing tokens, among
 * those whose tokens are all `achievable` (when given). [] when the
 * requirement already holds; null when no achievable alternative exists.
 */
export const missingTokens = (requirement, tokens, { achievable = null } = {}) => {
  const held = tokens instanceof Set ? tokens : new Set(list(tokens));
  if (requirementMet(requirement, held)) return [];
  const reachable = achievable instanceof Set ? achievable : null;
  let best = null;
  requirementAlternatives(requirement).forEach((alternative) => {
    if (reachable && !alternative.every((token) => held.has(token) || reachable.has(token))) return;
    const missing = alternative.filter((token) => !held.has(token));
    if (!best || missing.length < best.length) best = missing;
  });
  return best;
};

/* ---------------------------------------------------------------------------
 * The model.
 * ------------------------------------------------------------------------- */

const freezeDeep = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (isObject(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, typeof entry === 'function' ? entry : freezeDeep(entry)])));
  return value;
};

/**
 * Define a tool's process model. Throws on a reference error — the model is
 * platform code, and a broken one must fail its tests, not a student.
 *
 *   facts            { [id]: { label, multiple? } }
 *   strategies       { [id]: { label, method, kind: 'recognize' | 'derive',
 *                              produces: [factId], sources: [source] } }
 *     source         { id, when?(context), needs?, targets?: [factId], yields?: [token] }
 *   representations { [id]: { label, unlock: requirement } }
 *   tokens           extra token ids (besides fact ids) the model derives
 *   tokensOf(facts)  -> Set of tokens the resolved facts establish
 *   deriveTokens(set)-> Set: closure rules for reachability (optional)
 */
export const defineProcessModel = (spec = {}) => {
  const facts = isObject(spec.facts) ? spec.facts : {};
  const strategies = isObject(spec.strategies) ? spec.strategies : {};
  const representations = isObject(spec.representations) ? spec.representations : {};
  const factIds = Object.keys(facts);
  const known = new Set([...factIds, ...list(spec.tokens)]);
  const problems = [];
  Object.entries(strategies).forEach(([id, strategy]) => {
    const produces = list(strategy?.produces);
    if (!produces.length) problems.push(`strategy "${id}" produces no fact`);
    produces.filter((fact) => !facts[fact]).forEach((fact) => problems.push(`strategy "${id}" produces unknown fact "${fact}"`));
    if (!list(strategy?.sources).length) problems.push(`strategy "${id}" has no source`);
    list(strategy?.sources).forEach((source) => {
      if (!text(source?.id)) problems.push(`strategy "${id}" has a source without an id`);
      [...requirementTokens(source?.needs)].filter((token) => !known.has(token)).forEach((token) => problems.push(`strategy "${id}" source "${source?.id}" needs unknown token "${token}"`));
      list(source?.targets).filter((fact) => !produces.includes(fact)).forEach((fact) => problems.push(`strategy "${id}" source "${source?.id}" targets "${fact}", which it does not produce`));
    });
  });
  Object.entries(representations).forEach(([id, representation]) => {
    [...requirementTokens(representation?.unlock)].filter((token) => !known.has(token)).forEach((token) => problems.push(`representation "${id}" needs unknown token "${token}"`));
  });
  if (problems.length) throw new Error(`Process model ${text(spec.id)}: ${problems.join('; ')}`);
  return Object.freeze({
    kind: 'processModel',
    id: text(spec.id),
    version: Math.max(1, Math.floor(Number(spec.version) || 1)),
    facts: freezeDeep(facts),
    strategies: freezeDeep(strategies),
    representations: freezeDeep(representations),
    tokens: Object.freeze([...known]),
    tokensOf: typeof spec.tokensOf === 'function'
      ? spec.tokensOf
      : (resolved) => new Set(Object.keys(resolved || {}).filter((fact) => {
        const value = resolved[fact];
        return Array.isArray(value) ? value.length > 0 : Boolean(value);
      })),
    deriveTokens: typeof spec.deriveTokens === 'function' ? spec.deriveTokens : (tokens) => tokens,
  });
};

/** The source definition an entry names, or null. */
export const strategySource = (model, strategyId, sourceId) => {
  const strategy = model?.strategies?.[text(strategyId)];
  if (!strategy) return null;
  const source = list(strategy.sources).find((entry) => entry.id === text(sourceId));
  return source ? { strategy, source } : null;
};

/**
 * Does an author's restriction (`allowed`: { [fact]: [strategyId] }) let this
 * source establish this fact? A fact the author did not restrict is open to
 * every strategy. A source that is `partOf` another strategy's pathway (read
 * m and b from the equation the student just solved for y) is allowed
 * wherever that strategy is.
 */
export const restrictionPermits = (allowed, fact, strategyId, source = {}) => {
  if (!isObject(allowed) || !Array.isArray(allowed[fact])) return true;
  return allowed[fact].includes(strategyId) || list(source.partOf).some((parent) => allowed[fact].includes(parent));
};

/**
 * Every (strategy, source) a question offers — its `when` holds for the
 * question context — optionally for one target fact, within an author's
 * restriction (`allowed`: { [fact]: [strategyId] }) and, when `tokens` are
 * given, only those whose needs are met now.
 */
export const processOptions = (model, context = {}, { target = null, tokens = null, allowed = null } = {}) => {
  const options = [];
  Object.entries(model?.strategies || {}).forEach(([strategyId, strategy]) => {
    list(strategy.sources).forEach((source) => {
      let applies = true;
      let declaredTargets = source.targets;
      try {
        applies = typeof source.when === 'function' ? source.when(context) === true : true;
        // A source may offer different facts on different GIVENs (y = mx + b
        // shows its y-intercept, so substituting x = 0 there is not offered).
        if (typeof declaredTargets === 'function') declaredTargets = declaredTargets(context);
      } catch {
        applies = false;
      }
      if (!applies) return;
      const targets = (Array.isArray(declaredTargets)
        ? declaredTargets.filter((fact) => strategy.produces.includes(fact))
        : [...strategy.produces]).filter((fact) => restrictionPermits(allowed, fact, strategyId, source));
      if (!targets.length) return;
      if (target && !targets.includes(target)) return;
      const needsMet = tokens ? requirementMet(source.needs, tokens) : null;
      if (tokens && !needsMet) return;
      options.push({
        key: `${strategyId}@${source.id}`,
        strategy: strategyId,
        source: source.id,
        kind: strategy.kind || 'derive',
        label: source.label || strategy.label,
        method: source.method || strategy.method,
        targets: [...targets],
        produces: [...strategy.produces],
        needs: source.needs ?? null,
        yields: list(source.yields).length ? [...source.yields] : [...targets],
      });
    });
  });
  return options;
};

/**
 * The tokens a question can ever establish: every option whose needs are met
 * adds what it yields, closed under the model's own derivation rules, until
 * nothing changes. `baseTokens` are established before the student does
 * anything (a GIVEN pair of points).
 */
export const reachableTokens = (model, options = [], baseTokens = []) => {
  let tokens = model.deriveTokens(new Set(baseTokens));
  let changed = true;
  let rounds = 0;
  while (changed && rounds < 64) {
    rounds += 1;
    changed = false;
    options.forEach((option) => {
      if (!requirementMet(option.needs, tokens)) return;
      option.yields.forEach((token) => {
        if (!tokens.has(token)) {
          tokens.add(token);
          changed = true;
        }
      });
    });
    const derived = model.deriveTokens(new Set(tokens));
    if (derived.size !== tokens.size) changed = true;
    tokens = derived;
  }
  return tokens;
};

/**
 * Model-level integrity, beyond what defineProcessModel refuses: a fact no
 * strategy can produce from scratch — because every strategy that produces it
 * needs, directly or through others, the fact itself — is circular. `contexts`
 * are question contexts to evaluate `when` against (none: every source
 * applies).
 */
export const auditProcessModel = (model, { contexts = [null], baseTokens = [] } = {}) => {
  const problems = [];
  if (!model || model.kind !== 'processModel') return ['not a process model'];
  const everyOption = contexts.flatMap((context) => (context === null
    ? Object.entries(model.strategies).flatMap(([strategyId, strategy]) => strategy.sources.map((source) => ({
      strategy: strategyId,
      source: source.id,
      needs: source.needs ?? null,
      yields: list(source.yields).length ? [...source.yields] : [...(list(source.targets).length ? source.targets : strategy.produces)],
    })))
    : processOptions(model, context)));
  const reachable = reachableTokens(model, everyOption, baseTokens);
  Object.entries(model.strategies).forEach(([strategyId, strategy]) => {
    strategy.produces.forEach((fact) => {
      if (reachable.has(fact)) return;
      const producers = everyOption.filter((option) => option.yields.includes(fact));
      if (!producers.length) return;
      const needed = producers.flatMap((option) => [...requirementTokens(option.needs)]);
      problems.push(`fact "${fact}" (from ${strategyId}) can never be established: every way to establish it first needs ${[...new Set(needed)].join(', ') || 'itself'}, which depends on it in turn`);
    });
  });
  Object.entries(model.representations).forEach(([id, representation]) => {
    if (missingTokens(representation.unlock, new Set(), { achievable: reachable }) === null) {
      problems.push(`representation "${id}" can never be unlocked: nothing can establish ${[...requirementTokens(representation.unlock)].join(' / ')}`);
    }
  });
  return [...new Set(problems)];
};

/* ---------------------------------------------------------------------------
 * The process log.
 * ------------------------------------------------------------------------- */

export const emptyProcessLog = (binding = '') => ({ v: PROCESS_LOG_VERSION, bind: text(binding).slice(0, 80), entries: [] });

const boundedText = (value, max = PROCESS_LOG_LIMITS.maxTextLength) => {
  if (typeof value === 'string') return value.slice(0, max);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
};

// One evidence value: text, a finite number, a boolean, or a small list or
// record of those. Anything else — a function, a verdict key, an object nested
// deeper than evidence ever is — is not evidence and is left out.
const boundEvidence = (value, depth = 0) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if (typeof value === 'string') return value.slice(0, PROCESS_LOG_LIMITS.maxTextLength);
  if (depth >= PROCESS_LOG_LIMITS.maxEvidenceDepth) return null;
  if (Array.isArray(value)) {
    return value.slice(0, PROCESS_LOG_LIMITS.maxListLength).map((entry) => boundEvidence(entry, depth + 1));
  }
  if (!isObject(value)) return null;
  const out = {};
  Object.keys(value).slice(0, PROCESS_LOG_LIMITS.maxEvidenceKeys * 2).forEach((key) => {
    if (Object.keys(out).length >= PROCESS_LOG_LIMITS.maxEvidenceKeys) return;
    if (BLOCKED_KEYS.has(key) || key.length > PROCESS_LOG_LIMITS.maxIdLength) return;
    const bounded = boundEvidence(value[key], depth + 1);
    if (bounded !== null && bounded !== undefined) out[key] = bounded;
  });
  return out;
};

const boundSteps = (steps) => list(steps)
  .filter(isObject)
  .slice(-PROCESS_LOG_LIMITS.maxSteps)
  .map((step) => ({ left: boundedText(step.left) ?? '', right: boundedText(step.right) ?? '' }))
  .filter((step) => typeof step.left === 'string' && typeof step.right === 'string' && step.left && step.right);

const normalizeEntry = (raw, index) => {
  if (!isObject(raw)) return null;
  const strategy = text(raw.strategy).trim().slice(0, PROCESS_LOG_LIMITS.maxIdLength);
  const from = text(raw.from).trim().slice(0, PROCESS_LOG_LIMITS.maxIdLength);
  if (!strategy || !from) return null;
  const ev = boundEvidence(isObject(raw.ev) ? raw.ev : {}) || {};
  if (Array.isArray(raw.ev?.steps)) ev.steps = boundSteps(raw.ev.steps);
  const at = Number(raw.at);
  const tries = Math.floor(Number(raw.tries));
  return {
    id: text(raw.id).trim().slice(0, PROCESS_LOG_LIMITS.maxIdLength) || `e${index + 1}`,
    strategy,
    from,
    ...(text(raw.target).trim() ? { target: text(raw.target).trim().slice(0, PROCESS_LOG_LIMITS.maxIdLength) } : {}),
    at: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0,
    tries: Number.isFinite(tries) && tries > 0 ? Math.min(PROCESS_LOG_LIMITS.maxTries, tries) : 1,
    ev,
  };
};

const logJsonLength = (log) => {
  try {
    return JSON.stringify(log).length;
  } catch {
    return Infinity;
  }
};

/**
 * Normalize a log from anywhere — the board's draft, a submitted response, a
 * tampered client — into the bounded shape both sides resolve. Never throws.
 * Over the size budget, intermediate steps go first (oldest entries first,
 * keeping each entry's latest step), then the oldest entries.
 */
export const normalizeProcessLog = (raw) => {
  const source = isObject(raw) ? raw : {};
  const entries = list(source.entries).slice(-PROCESS_LOG_LIMITS.maxEntries).map(normalizeEntry).filter(Boolean);
  const seen = new Set();
  const unique = entries.map((entry) => {
    let { id } = entry;
    while (seen.has(id)) id = `${id}_`.slice(-PROCESS_LOG_LIMITS.maxIdLength);
    seen.add(id);
    return { ...entry, id };
  });
  const log = {
    v: PROCESS_LOG_VERSION,
    bind: text(source.bind).slice(0, 80),
    entries: unique,
  };
  for (let index = 0; index < log.entries.length && logJsonLength(log) > PROCESS_LOG_LIMITS.maxJsonLength; index += 1) {
    const steps = list(log.entries[index].ev?.steps);
    if (steps.length > 1) log.entries[index] = { ...log.entries[index], ev: { ...log.entries[index].ev, steps: steps.slice(-1) } };
  }
  while (log.entries.length && logJsonLength(log) > PROCESS_LOG_LIMITS.maxJsonLength) log.entries.shift();
  return log;
};

/** Is this log for the question being shown? An empty log belongs anywhere. */
export const processLogMatches = (log, binding) => {
  const normalized = isObject(log) ? log : {};
  return !list(normalized.entries).length || text(normalized.bind) === text(binding);
};

/* ---------------------------------------------------------------------------
 * Resolution.
 * ------------------------------------------------------------------------- */

const claimKey = (claim) => text(claim?.key ?? claim?.fact);

/**
 * Which facts a log establishes.
 *
 *   evaluate(entry, { facts, source, strategy })
 *     -> { usable, claims: [{ fact, value, key?, correct, display? }], problems? }
 *
 * `usable` is structural: the entry is a complete, well-formed piece of work
 * of its strategy from a valid source, whether or not its answer is right.
 * Correctness is per claim. An entry whose source needs facts is evaluated
 * only once those facts are established — by OTHER entries, in rounds, until
 * nothing changes — so the order a student worked in never matters, and a
 * claim can never support itself. The latest entry (in log order) to claim a
 * fact is the student's answer for it; a `multiple` fact keeps one claim per
 * distinct value.
 *
 * `baseFacts` are established before the student does anything: { [fact]:
 * claim | [claim] } (a GIVEN pair of points), with `source: 'given'`.
 *
 * Returns {
 *   stale       the log belongs to another question and was ignored
 *   facts       { [fact]: record | [record] }  record = claim + { entryId,
 *               strategy, source, at, tries, position, base? }
 *   tokens      Set, from the model's tokensOf
 *   entries     [{ id, strategy, source, usable, evaluated, claims, problems }]
 * }
 */
export const resolveProcessFacts = ({ model, log, binding = null, evaluate, baseFacts = {} } = {}) => {
  const normalized = normalizeProcessLog(log);
  const stale = binding !== null && normalized.entries.length > 0 && normalized.bind !== text(binding);
  const entries = stale ? [] : normalized.entries;
  const facts = {};
  Object.entries(isObject(baseFacts) ? baseFacts : {}).forEach(([fact, claims]) => {
    const definition = model.facts[fact];
    if (!definition) return;
    const records = list(Array.isArray(claims) ? claims : [claims]).filter(isObject).map((claim) => ({
      ...claim,
      fact,
      key: claimKey({ ...claim, fact }),
      entryId: null,
      strategy: null,
      source: 'given',
      at: 0,
      tries: 0,
      position: -1,
      base: true,
    }));
    if (!records.length) return;
    facts[fact] = definition.multiple ? records : records[records.length - 1];
  });

  const apply = (claim, entry, position, sourceId) => {
    const definition = model.facts[claim?.fact];
    if (!definition) return;
    const record = {
      ...claim,
      key: claimKey(claim),
      correct: claim.correct === true,
      entryId: entry.id,
      strategy: entry.strategy,
      source: sourceId,
      at: entry.at,
      tries: entry.tries,
      position,
    };
    if (definition.multiple) {
      const current = list(facts[claim.fact]);
      const existing = current.findIndex((held) => held.key === record.key);
      if (existing === -1) facts[claim.fact] = [...current, record];
      else if (current[existing].position < position) facts[claim.fact] = current.map((held, index) => (index === existing ? record : held));
      return;
    }
    const held = facts[claim.fact];
    if (!held || held.position < position) facts[claim.fact] = record;
  };

  const results = entries.map(() => null);
  let progress = true;
  let rounds = 0;
  while (progress && rounds <= entries.length + 1) {
    rounds += 1;
    progress = false;
    const tokens = model.tokensOf(facts);
    entries.forEach((entry, position) => {
      if (results[position]) return;
      const found = strategySource(model, entry.strategy, entry.from);
      if (!found) {
        results[position] = { usable: false, evaluated: true, claims: [], problems: ['unknown-strategy'] };
        return;
      }
      if (!requirementMet(found.source.needs, tokens)) return;
      let evaluated;
      try {
        evaluated = typeof evaluate === 'function' ? evaluate(entry, { facts, source: found.source, strategy: found.strategy }) : null;
      } catch {
        evaluated = null;
      }
      const usable = evaluated?.usable === true;
      const claims = usable ? list(evaluated.claims).filter((claim) => isObject(claim) && found.strategy.produces.includes(claim.fact)) : [];
      results[position] = { usable, evaluated: true, claims, problems: list(evaluated?.problems).map(text) };
      claims.forEach((claim) => apply(claim, entry, position, found.source.id));
      progress = true;
    });
  }

  return {
    stale,
    binding: normalized.bind,
    facts,
    tokens: model.tokensOf(facts),
    entries: entries.map((entry, position) => ({
      id: entry.id,
      strategy: entry.strategy,
      source: entry.from,
      target: entry.target || null,
      at: entry.at,
      tries: entry.tries,
      ...(results[position] || { usable: false, evaluated: false, claims: [], problems: ['needs-unmet'] }),
    })),
  };
};

/** The single record of a fact, or the list of a `multiple` one. */
export const factRecords = (resolution, fact) => {
  const value = resolution?.facts?.[fact];
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

/**
 * Representation unlocks for the resolved facts: { [id]: { unlocked, missing } }.
 * `missing` is the smallest set of tokens still needed among those the
 * question can reach (`achievable`), or null when none can be reached.
 */
export const representationUnlocks = (model, tokens, { achievable = null } = {}) => Object.fromEntries(
  Object.entries(model.representations).map(([id, representation]) => {
    const unlocked = requirementMet(representation.unlock, tokens);
    return [id, { unlocked, missing: unlocked ? [] : missingTokens(representation.unlock, tokens, { achievable }) }];
  }),
);

/**
 * Append one finished process to a log, as the device does when a student
 * completes it. `claimsOf(entry)` names the facts (or, for a `multiple` fact,
 * the distinct values) an entry claims; an older entry is dropped only when
 * everything it claimed is claimed again by the new one — re-establishing a
 * slope another way leaves one answer, and an entry that still holds a fact
 * is kept. A log for another question is replaced, never mixed.
 */
export const appendProcessEntry = (log, entry, { binding = null, claimsOf = null } = {}) => {
  const current = normalizeProcessLog(log);
  const base = binding !== null && current.bind !== text(binding) ? emptyProcessLog(binding) : current;
  const claimed = (candidate) => {
    try {
      return list(typeof claimsOf === 'function' ? claimsOf(candidate) : []).map(text);
    } catch {
      return [];
    }
  };
  const replaced = new Set(claimed(entry));
  const kept = base.entries.filter((existing) => {
    const owned = claimed(existing);
    return !(owned.length && owned.every((key) => replaced.has(key)));
  });
  const ids = new Set(kept.map((existing) => existing.id));
  let id = text(entry?.id).trim() || `e${base.entries.length + 1}`;
  for (let suffix = 2; ids.has(id); suffix += 1) id = `${text(entry?.id).trim() || 'e'}-${suffix}`;
  return normalizeProcessLog({ ...base, bind: binding !== null ? text(binding) : base.bind, entries: [...kept, { ...entry, id }] });
};
