/*
 * WHAT A QUESTION FAMILY IS.
 *
 * A question family is one piece of mathematics that can be asked many ways
 * with different numbers — "solve a two-step linear equation", "find the vertex
 * of a parabola" — written ONCE and reused by any assignment that needs it.
 *
 *   Skill / TEKS
 *     -> Question Family            (this contract)
 *     -> assignment constraints     (the slot's `questionFamily.constraints`)
 *     -> student seat + variant     (questionGenerationIdentity.mjs)
 *     -> generated instance         (questionFamilyEngine.mjs)
 *     -> validation                 (the family's own `rules`)
 *     -> persisted delivery         (the question record's `delivery` pin)
 *
 * WHY THIS IS MORE THAN "A FUNCTION THAT PICKS RANDOM NUMBERS".
 *
 * The generators this platform already had (src/problemGenerator.js) drew
 * numbers from a seeded stream and returned whatever came out. That design has
 * four gaps, each of which reached a classroom:
 *
 *   1. There was no notion of two instances being THE SAME QUESTION, so nothing
 *      could stop two students getting it. `fingerprint` is that notion: the
 *      normalized mathematics, never the presentation (answer-choice order is
 *      not a different problem).
 *   2. There was no capacity. A generator that can only produce 8 distinct
 *      questions was indistinguishable from one that can produce 8,000. The
 *      parameter domains below are FINITE and enumerable, so capacity is a
 *      number the engine can compute and Pre-Flight can report.
 *   3. Validation was implicit. A draw that produced a decimal answer, a
 *      parallel "system", or a vertex off the graph went straight to a student.
 *      `rules` names every property an instance must have and the engine
 *      refuses candidates that break one.
 *   4. It lived in the browser, so the server could never re-create what a
 *      student saw and had to trust the browser's verdict. This file and every
 *      family are in functions/shared: the browser, the Cloud Functions and the
 *      tests run the same bytes.
 *
 * THE PARTS OF A FAMILY
 *
 *   id, version        stable identity. A delivered question pins both, so a
 *                      family edit ships as a new version instead of silently
 *                      changing questions students have already seen.
 *   skill, difficulty  what is assessed (alignments, objective) and at what
 *                      rigor (band 1-5, DOK 1-4). Recovery equivalence reads
 *                      these; an instance never changes them.
 *   tools              the rendering tools this family can fill, each with a
 *                      `build` for that tool. The student still does the
 *                      mathematics: a family writes a QUESTION, never steps,
 *                      hints or a worked solution.
 *   constraints        the knobs an assignment may turn (ranges, the variable
 *                      letter), each with a default and hard limits.
 *   parameters         finite domains per parameter, given the constraints.
 *   derive             pure values computed from the parameters.
 *   rules              issue codes an instance violates; empty means valid.
 *   fingerprint        the normalized mathematical identity of an instance.
 *   answer             the canonical answer, from the same values as the
 *                      prompt, so a key can never disagree with its question.
 *   graphWindow        (optional) the window a graph needs, validated to
 *                      contain every feature the student must find.
 *   recovery           whether the family may back an automatic Recovery
 *                      question, and which families count as equivalent.
 *
 * Added for families that generate special cases (no solution, all reals)
 * and exact rational answers — every one optional, so a family written
 * before them is defined, generated and fingerprinted exactly as before:
 *
 *   constraintPolicy   'fallback' (the default above: a bad request falls
 *                      back to the default with a reported issue) or
 *                      'strict': ANY constraint issue — an unknown name, a
 *                      value that is not allowed, a range out of bounds — is
 *                      a resolution error. A slot that asked for "no
 *                      solution" and silently got "one solution" would be
 *                      assessing something its author never wrote.
 *   conceptConstraints the knobs that decide WHAT is assessed (the solution
 *                      case, distribution, the number forms). A student
 *                      support may narrow how big the numbers are; it may
 *                      never override one of these (refused at definition).
 *   strata             a function of the constraints listing the strata a
 *                      slot balances — e.g. { case: 'none' }. Each stratum
 *                      fixes those parameters, gets its own instance list,
 *                      and the engine interleaves the lists so every block
 *                      of consecutive seats covers every stratum once
 *                      (questionFamilyEngine.mjs). `parameters` then receives
 *                      the stratum as its second argument.
 *   instanceFields     fields only an instance may carry (an answer key, the
 *                      generated equation); removed from the authored slot
 *                      before the family's fields are merged in.
 *   capabilities       descriptive metadata (solution cases, number forms,
 *                      target tool and mode) that Pre-Flight, the authoring
 *                      contract and the capability report read. It never
 *                      changes generation.
 *
 * Pure by construction: no Firestore, no network, no clock.
 */

export const QUESTION_FAMILY_CONTRACT_VERSION = 1;

export const FAMILY_SCOPE = Object.freeze({
  // Written once in the platform library and reused across assignments.
  PLATFORM: 'platform',
  // A contextual problem that belongs to one assignment. Same contract; it is
  // simply not registered globally. See questionFamilyTemplate.mjs.
  ASSIGNMENT: 'assignment',
});

/*
 * THE REASONS AN INSTANCE IS REFUSED.
 *
 * Machine-readable, because Pre-Flight counts them ("312 of 4,000 candidates
 * were parallel systems") and tests assert on them. A family may add its own,
 * but these cover the failures the brief names.
 */
export const FAMILY_ISSUE = Object.freeze({
  DIVIDE_BY_ZERO: 'divide_by_zero',
  NON_INTEGER_ANSWER: 'non_integer_answer',
  UNINTENDED_FRACTION: 'unintended_fraction',
  UNINTENDED_DECIMAL: 'unintended_decimal',
  NO_SOLUTION: 'no_solution',
  INFINITE_SOLUTIONS: 'infinite_solutions',
  PARALLEL_SYSTEM: 'parallel_system',
  COINCIDENT_SYSTEM: 'coincident_system',
  FEATURE_OUTSIDE_WINDOW: 'feature_outside_window',
  VALUE_OUT_OF_RANGE: 'value_out_of_range',
  TRIVIAL_INSTANCE: 'trivial_instance',
  DEGENERATE_INSTANCE: 'degenerate_instance',
  DUPLICATE_ROOT: 'duplicate_root',
  INVALID_PARAMETERS: 'invalid_parameters',
  // The family's independent check of the DISPLAYED question found a
  // different solution case (or solution) from the one it set out to build.
  CASE_MISMATCH: 'case_mismatch',
  // A slot asked for a fractional answer and this candidate's is an integer.
  UNINTENDED_INTEGER: 'unintended_integer',
});

export const CONSTRAINT_POLICY = Object.freeze({
  FALLBACK: 'fallback',
  STRICT: 'strict',
});

export class QuestionFamilyDefinitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuestionFamilyDefinitionError';
  }
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const fail = (familyId, message) => {
  throw new QuestionFamilyDefinitionError(`Question family ${familyId || '(unnamed)'}: ${message}`);
};

/* ---------------------------------------------------------------------------
 * Parameter domains. Finite by design: a domain that cannot be enumerated
 * cannot report its capacity, and capacity is the whole uniqueness story.
 * ------------------------------------------------------------------------- */

const MAX_DOMAIN_VALUES = 401;

export const intDomain = (min, max, { exclude = [], step = 1 } = {}) => {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  const stride = Number.isFinite(Number(step)) && Number(step) > 0 ? Math.round(Number(step)) : 1;
  const excluded = new Set((Array.isArray(exclude) ? exclude : []).map(Number));
  const values = [];
  if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
    for (let value = low; value <= high && values.length < MAX_DOMAIN_VALUES; value += stride) {
      // `+ 0` folds -0 into 0 so a domain never holds both spellings of zero.
      if (!excluded.has(value)) values.push(value + 0);
    }
  }
  return Object.freeze({ kind: 'int', values: Object.freeze(values) });
};

export const choiceDomain = (values) => {
  const unique = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key) || unique.length >= MAX_DOMAIN_VALUES) return;
    seen.add(key);
    unique.push(value);
  });
  return Object.freeze({ kind: 'choice', values: Object.freeze(unique) });
};

export const domainValues = (domain) => (Array.isArray(domain?.values) ? domain.values : []);

/* ---------------------------------------------------------------------------
 * Constraint knobs: what an assignment may change, and how far.
 *
 * A teacher asking for "solutions between -5 and 5" is a constraint. A teacher
 * (or an AI author) asking for solutions between -5000 and 5000 is a typo, and
 * a typo must not produce questions no student can do on paper. So every knob
 * carries hard limits and an out-of-bounds request falls back to the default
 * with an issue Pre-Flight shows — it is never silently widened.
 * ------------------------------------------------------------------------- */

export const rangeKnob = (defaultRange, { limits = [-100, 100], label = '' } = {}) => Object.freeze({
  kind: 'range',
  default: Object.freeze([Number(defaultRange[0]), Number(defaultRange[1])]),
  limits: Object.freeze([Number(limits[0]), Number(limits[1])]),
  label,
});

export const choiceKnob = (defaultValue, values, { label = '' } = {}) => Object.freeze({
  kind: 'choice',
  default: defaultValue,
  values: Object.freeze([...values]),
  label,
});

export const booleanKnob = (defaultValue, { label = '' } = {}) => Object.freeze({
  kind: 'boolean',
  default: Boolean(defaultValue),
  label,
});

const resolveKnob = (knob, requested) => {
  if (requested === undefined || requested === null) return { value: knob.default, issue: null };
  if (knob.kind === 'range') {
    const pair = Array.isArray(requested) && requested.length === 2 ? requested.map(Number) : null;
    const valid = pair
      && pair.every((value) => Number.isInteger(value))
      && pair[0] <= pair[1]
      && pair[0] >= knob.limits[0]
      && pair[1] <= knob.limits[1];
    return valid ? { value: Object.freeze(pair), issue: null } : { value: knob.default, issue: 'constraint_out_of_bounds' };
  }
  if (knob.kind === 'choice') {
    return knob.values.some((value) => JSON.stringify(value) === JSON.stringify(requested))
      ? { value: requested, issue: null }
      : { value: knob.default, issue: 'constraint_not_allowed' };
  }
  if (knob.kind === 'boolean') {
    return typeof requested === 'boolean' ? { value: requested, issue: null } : { value: knob.default, issue: 'constraint_not_boolean' };
  }
  return { value: knob.default, issue: 'constraint_unknown_kind' };
};

/** What a knob accepts, for a message a teacher (or an AI author) can act on. */
export const describeKnobAllowance = (knob) => {
  if (knob?.kind === 'range') return { kind: 'range', limits: [...knob.limits], default: [...knob.default] };
  if (knob?.kind === 'choice') return { kind: 'choice', values: [...knob.values], default: knob.default };
  if (knob?.kind === 'boolean') return { kind: 'boolean', values: [true, false], default: knob.default };
  return { kind: 'unknown' };
};

/**
 * The constraint values an instance is generated under.
 *
 * Returns the resolved values plus every issue, keyed by knob, so Pre-Flight
 * can say "Question 3 asked for coefficientRange [0, 400]; the family allows
 * [-25, 25], so the default [2, 9] is being used" instead of failing silently.
 * Unknown knobs are reported too: a misspelled constraint that did nothing is
 * exactly the silent failure this contract exists to prevent.
 *
 * Each issue says what the knob allows (`allowed`), or — for an unknown name
 * — which constraints the family does have (`known`). `fatal` is true when the
 * family's policy is strict and anything was wrong: the caller must then
 * refuse to generate rather than use the defaults.
 */
export const resolveFamilyConstraints = (family, overrides = {}) => {
  const requested = isObject(overrides) ? overrides : {};
  const values = {};
  const issues = [];
  Object.entries(family?.constraints || {}).forEach(([name, knob]) => {
    const resolved = resolveKnob(knob, requested[name]);
    values[name] = resolved.value;
    if (resolved.issue) {
      issues.push({ constraint: name, code: resolved.issue, requested: requested[name], allowed: describeKnobAllowance(knob) });
    }
  });
  Object.keys(requested).forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(family?.constraints || {}, name)) {
      issues.push({ constraint: name, code: 'constraint_unknown', requested: requested[name], known: Object.keys(family?.constraints || {}) });
    }
  });
  const fatal = family?.constraintPolicy === CONSTRAINT_POLICY.STRICT && issues.length > 0;
  return { values: Object.freeze(values), issues, fatal };
};

const allowanceText = (allowance = {}) => {
  if (allowance.kind === 'range') return `a whole-number range inside [${allowance.limits.join(', ')}]`;
  if (allowance.kind === 'choice' || allowance.kind === 'boolean') return `one of ${allowance.values.map((value) => JSON.stringify(value)).join(', ')}`;
  return 'a value the family declares';
};

/**
 * One sentence per issue: what was asked, why it cannot be honoured, and what
 * would be accepted. Pre-Flight, the resolution error and the authoring
 * report all use this wording.
 */
export const describeConstraintIssue = (issue = {}, familyLabel = 'this family') => {
  const name = clean(issue.constraint);
  const asked = JSON.stringify(issue.requested);
  if (issue.code === 'constraint_unknown') {
    const known = Array.isArray(issue.known) && issue.known.length ? issue.known.join(', ') : 'none';
    return `"${name}" is not a constraint of ${familyLabel} (its constraints are: ${known})`;
  }
  return `"${name}": ${asked} is not allowed by ${familyLabel}; use ${allowanceText(issue.allowed)}`;
};

/* ---------------------------------------------------------------------------
 * Fingerprints.
 * ------------------------------------------------------------------------- */

/**
 * A number written the one way two equal numbers are always written.
 *
 * Used inside fingerprints so 0.5 and 1/2 — or -0 and 0 — cannot make one
 * question look like two.
 */
export const canonicalNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'NaN';
  const rounded = Math.round(numeric * 1e9) / 1e9;
  return String(rounded + 0);
};

export const fingerprintOf = (familyId, parts) => (
  `${familyId}:${(Array.isArray(parts) ? parts : [parts]).map((part) => (
    typeof part === 'number' ? canonicalNumber(part) : clean(part)
  )).join('|')}`
);

/* ---------------------------------------------------------------------------
 * The family definition gate.
 * ------------------------------------------------------------------------- */

const PLATFORM_ID = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;
const LOCAL_ID = /^local:[A-Za-z0-9_.:-]{1,160}$/;

const requireFunction = (familyId, spec, name) => {
  if (typeof spec[name] !== 'function') fail(familyId, `\`${name}\` must be a function.`);
};

/**
 * Validate and freeze a family.
 *
 * Throws at DEFINITION time — when the platform loads, when a test imports the
 * registry, when Pre-Flight adapts an assignment template — rather than at the
 * moment a student asks for a question. A family that cannot describe itself
 * completely is not allowed to exist.
 */
export const defineQuestionFamily = (spec = {}) => {
  if (!isObject(spec)) fail('', 'a family must be an object.');
  const id = clean(spec.id);
  const scope = spec.scope === FAMILY_SCOPE.ASSIGNMENT ? FAMILY_SCOPE.ASSIGNMENT : FAMILY_SCOPE.PLATFORM;
  if (scope === FAMILY_SCOPE.PLATFORM && !PLATFORM_ID.test(id)) {
    fail(id, 'platform family ids are dotted camelCase, e.g. "linear.twoStepEquation".');
  }
  if (scope === FAMILY_SCOPE.ASSIGNMENT && !LOCAL_ID.test(id)) {
    fail(id, 'assignment-local family ids start with "local:".');
  }
  const version = Number(spec.version);
  if (!Number.isInteger(version) || version < 1) fail(id, '`version` must be a positive integer.');
  if (!clean(spec.title)) fail(id, '`title` is required; teachers read it in Pre-Flight.');

  const skill = isObject(spec.skill) ? spec.skill : {};
  if (!clean(skill.objective)) fail(id, '`skill.objective` is required.');
  const alignments = (Array.isArray(skill.alignments) ? skill.alignments : []).map(clean).filter(Boolean);

  const difficulty = isObject(spec.difficulty) ? spec.difficulty : {};
  const band = Number(difficulty.band);
  const dok = Number(difficulty.dok);
  if (!Number.isInteger(band) || band < 1 || band > 5) fail(id, '`difficulty.band` must be an integer 1-5.');
  if (!Number.isInteger(dok) || dok < 1 || dok > 4) fail(id, '`difficulty.dok` must be an integer 1-4.');

  const tools = isObject(spec.tools) ? spec.tools : null;
  if (!tools || !Object.keys(tools).length) fail(id, '`tools` must map at least one question type to a builder.');
  Object.entries(tools).forEach(([toolType, builder]) => {
    if (typeof builder !== 'function') fail(id, `tools.${toolType} must be a builder function.`);
  });
  const defaultTool = clean(spec.defaultTool) || Object.keys(tools)[0];
  if (!tools[defaultTool]) fail(id, `\`defaultTool\` "${defaultTool}" is not one of its tools.`);

  ['parameters', 'derive', 'rules', 'fingerprint', 'answer'].forEach((name) => requireFunction(id, spec, name));
  if (spec.graphWindow !== undefined) requireFunction(id, spec, 'graphWindow');

  const constraints = isObject(spec.constraints) ? spec.constraints : {};
  Object.entries(constraints).forEach(([name, knob]) => {
    if (!isObject(knob) || !['range', 'choice', 'boolean'].includes(knob.kind)) {
      fail(id, `constraint "${name}" must be built with rangeKnob, choiceKnob or booleanKnob.`);
    }
  });

  const recovery = isObject(spec.recovery) ? spec.recovery : {};

  // Overrides applied for a student support modification (e.g. an IEP's
  // "reduce-complexity"). Validated like any assignment constraint, so a
  // support profile can only narrow a family within its own limits.
  const supportConstraints = isObject(spec.supportConstraints) ? spec.supportConstraints : {};
  Object.entries(supportConstraints).forEach(([modification, overrides]) => {
    if (!isObject(overrides)) fail(id, `supportConstraints.${modification} must be an object of constraint overrides.`);
    Object.keys(overrides).forEach((name) => {
      if (!Object.prototype.hasOwnProperty.call(constraints, name)) {
        fail(id, `supportConstraints.${modification}.${name} is not one of the family's constraints.`);
      }
    });
  });

  const constraintPolicy = spec.constraintPolicy === undefined ? CONSTRAINT_POLICY.FALLBACK : clean(spec.constraintPolicy);
  if (!Object.values(CONSTRAINT_POLICY).includes(constraintPolicy)) {
    fail(id, '`constraintPolicy` must be "fallback" or "strict".');
  }

  // A support may make the numbers smaller; it may not change what is
  // assessed. "No solution" stays "no solution" for a student with a
  // reduced-complexity modification, and so does a distributive step or a
  // fractional answer the lesson is about.
  const conceptConstraints = (Array.isArray(spec.conceptConstraints) ? spec.conceptConstraints : []).map(clean);
  conceptConstraints.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(constraints, name)) fail(id, `conceptConstraints names "${name}", which is not one of its constraints.`);
  });
  Object.entries(supportConstraints).forEach(([modification, overrides]) => {
    Object.keys(overrides).forEach((name) => {
      if (conceptConstraints.includes(name)) {
        fail(id, `supportConstraints.${modification}.${name} would change what is assessed; a support may narrow the numbers, never a concept constraint.`);
      }
    });
  });

  if (spec.strata !== undefined && (!isObject(spec.strata) || typeof spec.strata.values !== 'function')) {
    fail(id, '`strata.values` must be a function of the constraints.');
  }

  const family = Object.freeze({
    contractVersion: QUESTION_FAMILY_CONTRACT_VERSION,
    id,
    version,
    scope,
    title: clean(spec.title),
    skill: Object.freeze({
      objective: clean(skill.objective),
      alignments: Object.freeze(alignments),
      strand: clean(skill.strand) || null,
    }),
    difficulty: Object.freeze({ band, dok }),
    tools: Object.freeze({ ...tools }),
    defaultTool,
    constraints: Object.freeze({ ...constraints }),
    parameters: spec.parameters,
    derive: spec.derive,
    rules: spec.rules,
    fingerprint: spec.fingerprint,
    answer: spec.answer,
    graphWindow: spec.graphWindow || null,
    recovery: Object.freeze({
      eligible: recovery.eligible !== false,
      // Families that share an equivalence group may stand in for each other
      // in a Recovery assessment. Default: only the family itself.
      equivalenceGroup: clean(recovery.equivalenceGroup) || id,
    }),
    supportConstraints: Object.freeze(Object.fromEntries(Object.entries(supportConstraints).map(
      ([modification, overrides]) => [modification, Object.freeze({ ...overrides })],
    ))),
    display: Object.freeze(isObject(spec.display) ? { ...spec.display } : {}),
    // Assignment-local families carry the template they were adapted from so
    // Pre-Flight can point at the authored question.
    source: spec.source || null,
    constraintPolicy,
    conceptConstraints: Object.freeze([...conceptConstraints]),
    // Fields the family's builders write that an authored slot must never
    // pre-fill: they are removed from the template before the merge, so a
    // stale answer key copied into a slot cannot reach an instance.
    instanceFields: Object.freeze((Array.isArray(spec.instanceFields) ? spec.instanceFields : []).map(clean).filter(Boolean)),
    strata: spec.strata ? Object.freeze({ values: spec.strata.values }) : null,
    capabilities: deepFreeze(isObject(spec.capabilities) ? JSON.parse(JSON.stringify(spec.capabilities)) : {}),
  });

  // A strict family resolves every support's overrides exactly as it resolves
  // an assignment's, so a support that asks for something the family does not
  // allow would make every supported student's question fail to generate.
  // That is caught here, when the platform loads, not in front of a student.
  if (constraintPolicy === CONSTRAINT_POLICY.STRICT) {
    Object.entries(supportConstraints).forEach(([modification, overrides]) => {
      const resolved = resolveFamilyConstraints(family, overrides);
      if (resolved.issues.length) {
        fail(id, `supportConstraints.${modification} is not valid: ${resolved.issues.map((issue) => describeConstraintIssue(issue, id)).join('; ')}.`);
      }
    });
  }
  return family;
};

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const isQuestionFamily = (value) => (
  isObject(value)
  && value.contractVersion === QUESTION_FAMILY_CONTRACT_VERSION
  && typeof value.rules === 'function'
  && typeof value.fingerprint === 'function'
);

/* ---------------------------------------------------------------------------
 * Small exact-arithmetic helpers families share.
 * ------------------------------------------------------------------------- */

export const gcd = (left, right) => {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b) [a, b] = [b, a % b];
  return a;
};

/** A reduced fraction, sign on the numerator; `den === 0` means undefined. */
export const reducedFraction = (numerator, denominator) => {
  const num = Math.round(numerator);
  const den = Math.round(denominator);
  if (den === 0) return { num, den: 0 };
  const divisor = gcd(num, den) || 1;
  const sign = den < 0 ? -1 : 1;
  return { num: (sign * num) / divisor + 0, den: Math.abs(den) / divisor };
};

export const fractionText = ({ num, den }) => (den === 1 ? String(num) : `${num}/${den}`);

/* ---------------------------------------------------------------------------
 * Prompts.
 *
 * A platform family writes the mathematics; the assignment may still want its
 * own words around it ("Maria's phone plan..."). Three cases, in order:
 *
 *   authored prompt with {{tokens}}  -> the family's tokens are substituted in
 *   authored prompt, no tokens       -> used as the lead-in; the family appends
 *                                       the math sentence when the tool does not
 *                                       show the math on its own
 *   no authored prompt               -> the family's default prompt
 * ------------------------------------------------------------------------- */

const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export const substituteFamilyTokens = (template, tokens = {}) => String(template ?? '').replace(
  TOKEN,
  (whole, name) => (Object.prototype.hasOwnProperty.call(tokens, name) ? String(tokens[name]) : whole),
);

export const hasFamilyTokens = (template) => {
  TOKEN.lastIndex = 0;
  const found = TOKEN.test(String(template ?? ''));
  TOKEN.lastIndex = 0;
  return found;
};

export const composeFamilyPrompt = ({ authored = '', tokens = {}, fallback = '', mathSentence = '' } = {}) => {
  const lead = clean(authored);
  if (lead && hasFamilyTokens(lead)) return substituteFamilyTokens(lead, tokens);
  if (lead) return mathSentence ? `${lead} ${mathSentence}` : lead;
  return fallback;
};

/** "3x", "-x", "x" — a coefficient written the way a textbook writes it. */
export const coefficientTerm = (coefficient, variable = 'x') => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${coefficient}${variable}`;
};

/** " + 4", " - 4", "" — a trailing constant, never "+ -4". */
export const signedConstant = (value) => {
  if (value === 0) return '';
  return value > 0 ? ` + ${value}` : ` - ${Math.abs(value)}`;
};
