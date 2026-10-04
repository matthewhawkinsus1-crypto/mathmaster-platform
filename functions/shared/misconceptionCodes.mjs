// THE CANONICAL MISCONCEPTION-CODE REGISTRY — THE ONLY WAY AN ERROR PATTERN IS NAMED.
//
// A wrong answer is not a misconception. MathMaster names an error pattern
// only when a SERVER classifier, reading the authoritative question, the
// student's normalized raw work and the server's own grading result, can show
// the specific wrong value a specific way of thinking produces — and no other
// modeled error produces the same value. Anything less is recorded as nothing:
// "Error pattern not determinable from stored evidence." is a better answer
// than a false diagnosis. Nothing infers a code afterwards — not the case
// review, not a teacher screen, not a language model. (The Test Cycle
// corrections planner states the same rule: "When a misconception cannot be
// inferred, it is not invented.")
//
// A CODE IS EVIDENCE, NEVER A GRADE. Classification runs after grading, on a
// copy of its result, and nothing it returns is read by the attempt policy:
// correctness, score, partial credit, attempts, accommodations and what the
// student is shown are identical with and without it
// (functions/shared/misconceptionClassifiers.mjs).
//
// WHERE A CODE IS STORED, AND THE ONLY PLACE IT IS READ FROM:
//
//   grades/{sid}/evidenceEvents/{key}.performance.misconceptionEvidence
//
// written by the server (submission ingestion) with the provenance below, into
// a collection no client may write (firestore.rules: evidenceEvents
// `create, update, delete: if false`). `performance.misconceptionCodes` is kept
// beside it as the plain list of the same codes. The question record on
// grades/{sid} is student-writable, so a code there — or a code a browser put
// on a part, or a bare `misconceptionCodes` list on an event written before
// this registry existed — is never evidence: `trustedMisconceptionFindings`
// below is the one gate every reader uses, and it accepts only server
// provenance from a declared classifier for a code that classifier may emit.
//
// VERSIONS. The registry, each code and each classifier carry a version. A
// reader built before a newer registry, code or classifier version drops what
// it does not know rather than mislabel it, so an unknown future code degrades
// to "not determinable", never to a crash or a guess.

export const MISCONCEPTION_REGISTRY_VERSION = 1;

/** Where the provenance says the classification came from. Only this is trusted. */
export const MISCONCEPTION_EVIDENCE_SOURCE = 'server-grading';

/*
 * EXCLUSIVITY.
 *   exclusive — at most one exclusive code describes one graded part. If two
 *               exclusive codes would both fit the same part, the classifier
 *               records neither (the work does not tell them apart).
 *   coexists  — may be recorded with another code on the same attempt (a
 *               different part, or a different stage of the same work).
 * `supersedes` names a less specific code the same work would also satisfy;
 * the more specific code is recorded instead of it, never with it.
 */
export const MISCONCEPTION_EXCLUSIVITY = Object.freeze({ EXCLUSIVE: 'exclusive', COEXISTS: 'coexists' });
const MISCONCEPTION_EXCLUSIVITY_COEXISTS = MISCONCEPTION_EXCLUSIVITY.COEXISTS;

const code = (entry) => Object.freeze({
  version: 1,
  exclusivity: MISCONCEPTION_EXCLUSIVITY.EXCLUSIVE,
  ...entry,
  supersedes: Object.freeze([...(entry.supersedes || [])]),
  teks: Object.freeze([...(entry.teks || [])]),
});

export const MISCONCEPTION_REGISTRY = Object.freeze([
  // --- Linear: slope ---------------------------------------------------------------
  code({
    id: 'slope-run-over-rise',
    concept: 'slope',
    domain: 'linear',
    label: 'Slope computed as run over rise',
    teacherMeaning: 'The slope given is the change in x divided by the change in y — the reciprocal of the slope (an inverted rate).',
    evidenceRequired: 'The submitted slope equals Δx/Δy of the authoritative points exactly; Δy ≠ 0 and |slope| ≠ 1, so the reciprocal differs from the slope; and the value matches no other modeled error.',
    teks: ['A.3A'],
  }),
  code({
    id: 'slope-sign-reversed',
    concept: 'slope',
    domain: 'linear',
    label: 'Slope sign reversed',
    teacherMeaning: 'The slope has the right size and the wrong sign — consistent with subtracting the coordinates in opposite orders (y₂ − y₁ over x₁ − x₂).',
    evidenceRequired: 'The submitted slope equals the opposite of the authoritative slope exactly; the slope is not 0; and the value matches no other modeled error.',
    teks: ['A.3A'],
  }),
  code({
    id: 'slope-intercept-swapped',
    concept: 'slope-intercept',
    domain: 'linear',
    label: 'Slope and y-intercept exchanged',
    teacherMeaning: 'The slope was given as the y-intercept and the y-intercept as the slope — the two features of y = mx + b are not yet distinguished.',
    evidenceRequired: 'Line features: the submitted slope equals the authoritative y-intercept and the submitted y-intercept equals the authoritative slope, the two differ, and the slope box is not also explained by a slope error.',
    teks: ['A.3C'],
  }),
  // --- Linear: intercepts and coordinates -----------------------------------------------
  code({
    id: 'intercepts-swapped',
    concept: 'intercepts',
    domain: 'linear',
    label: 'x- and y-intercepts confused',
    teacherMeaning: 'Each intercept was given where the other belongs — consistent with setting the wrong variable to 0.',
    evidenceRequired: 'Both intercept answers are the other intercept (as the other point, or with the other intercept\'s value); the two intercept values differ, so the swap is visible.',
    teks: ['A.3C'],
  }),
  code({
    id: 'ordered-pair-reversed',
    concept: 'coordinates',
    domain: 'graphing',
    label: 'Ordered pair written as (y, x)',
    teacherMeaning: 'The right numbers in the wrong positions: the pair was written with the y-value first.',
    evidenceRequired: 'Every submitted pair the question asks for is the authoritative pair with its coordinates exchanged, and the two coordinates differ.',
  }),
  // --- Equation solving ---------------------------------------------------------------
  code({
    id: 'inverse-operation-sign',
    concept: 'equation-solving',
    domain: 'equations',
    label: 'Term moved across the equals sign without changing its sign',
    teacherMeaning: 'A term was undone with the same operation instead of the inverse one (for example 3x + 5 = 20 treated as 3x = 20 + 5).',
    evidenceRequired: 'Linear equation instance: the submitted solution equals the value produced by keeping the sign of a moved term (constant, variable term or both) exactly, and no other modeled error produces it.',
    teks: ['A.5A'],
  }),
  code({
    id: 'partial-division',
    concept: 'equation-solving',
    domain: 'equations',
    label: 'Divided only some terms by the coefficient',
    teacherMeaning: 'Both sides were divided by the coefficient, but the constant on the variable\'s side was not (ax + b = c treated as x + b = c ÷ a).',
    evidenceRequired: 'Two-step equation instance: the submitted solution equals c/a − b exactly, differs from the solution, and no other modeled error produces it.',
    teks: ['A.5A'],
  }),
  // --- Inequalities -------------------------------------------------------------------
  code({
    id: 'inequality-boundary-style',
    concept: 'inequality-boundary',
    domain: 'inequalities',
    label: 'Solid / dashed boundary chosen incorrectly',
    teacherMeaning: 'The boundary line is in the right place but drawn solid for a strict inequality (< or >) or dashed for an inclusive one (≤ or ≥).',
    evidenceRequired: 'Inequality construction: the boundary\'s two points are on the authoritative line (graded correct), and the chosen style is the other style.',
    exclusivity: MISCONCEPTION_EXCLUSIVITY_COEXISTS,
    teks: ['A.3H'],
  }),
  code({
    id: 'inequality-shaded-wrong-side',
    concept: 'feasible-region',
    domain: 'inequalities',
    label: 'Shaded the wrong side of the boundary',
    teacherMeaning: 'The boundary line is in the right place but the half-plane shaded is the one that does not satisfy the inequality.',
    evidenceRequired: 'Inequality construction: the boundary\'s two points are on the authoritative line (graded correct), and the side shaded is the other side.',
    exclusivity: MISCONCEPTION_EXCLUSIVITY_COEXISTS,
    teks: ['A.3H'],
  }),
  code({
    id: 'endpoint-inclusion-error',
    concept: 'inequality-endpoints',
    domain: 'inequalities',
    label: 'Endpoint included or excluded incorrectly',
    teacherMeaning: 'The solution set has the right endpoints but the wrong open/closed choice (circle or bracket) — < and ≤ (or > and ≥) are not yet distinguished.',
    evidenceRequired: 'Number line or interval notation: every submitted interval has the authoritative endpoints, and at least one finite endpoint\'s inclusion is the opposite.',
    teks: ['A.5B'],
  }),
  code({
    id: 'inequality-direction-reversed',
    concept: 'inequality-direction',
    domain: 'inequalities',
    label: 'Solution set points the opposite way',
    teacherMeaning: 'The solution set starts at the right value but extends in the opposite direction — consistent with not reversing the inequality symbol after multiplying or dividing by a negative, or with reading the symbol backwards.',
    evidenceRequired: 'Number line or interval notation: the authoritative solution is one ray; the submitted set is the opposite ray from the same endpoint with the same inclusion.',
    teks: ['A.5B'],
  }),
  // --- Systems ------------------------------------------------------------------------
  code({
    id: 'substitution-partial-distribution',
    concept: 'systems-substitution',
    domain: 'systems',
    label: 'Substituted expression multiplied only in part',
    teacherMeaning: 'When y = mx + k was substituted into ax + by = c, the coefficient b multiplied mx but not k.',
    evidenceRequired: 'Substitution system instance: the submitted x equals (c − k)/(a + bm) exactly (and differs from the solution\'s x), and the submitted y is what that x gives back in either equation.',
    supersedes: ['system-point-on-one-line-only'],
    teks: ['A.5C'],
  }),
  code({
    id: 'system-point-on-one-line-only',
    concept: 'systems',
    domain: 'systems',
    label: 'Solution satisfies only one equation',
    teacherMeaning: 'The point given lies on one of the two lines but not the other — it was not checked in both equations.',
    evidenceRequired: 'System instance: the submitted point satisfies exactly one of the two authoritative equations and is not the solution with its coordinates exchanged.',
    teks: ['A.5C'],
  }),
  // --- Functions and modeling -------------------------------------------------------------
  code({
    id: 'independent-dependent-swapped',
    concept: 'independent-dependent-quantities',
    domain: 'functions',
    label: 'Independent and dependent quantities exchanged',
    teacherMeaning: 'The quantity that depends on the other was chosen as the independent one, and the reverse.',
    evidenceRequired: 'Relationship model: the quantity chosen as independent is the authoritative dependent quantity and the quantity chosen as dependent is the authoritative independent one.',
  }),
  // --- Absolute value -----------------------------------------------------------------
  code({
    id: 'absolute-value-negated-solution',
    concept: 'absolute-value-equations',
    domain: 'nonlinear',
    label: 'Negated a solution instead of the expression inside the bars',
    teacherMeaning: 'One case was solved correctly and its answer negated for the "other" solution, instead of setting the inside expression equal to the negative value.',
    evidenceRequired: 'Absolute value instance: the two submitted solutions are s and −s for a correct solution s, and −s is not a solution (the center is not 0).',
    teks: ['A2.6E'],
  }),
  code({
    id: 'absolute-value-one-case-only',
    concept: 'absolute-value-equations',
    domain: 'nonlinear',
    label: 'Solved only one case of the absolute value',
    teacherMeaning: 'Only one of the two cases (inside = positive value, inside = negative value) was solved; the same solution was given twice.',
    evidenceRequired: 'Absolute value instance: both submitted solutions are the same correct solution.',
    teks: ['A2.6E'],
  }),
  // --- Quadratics ---------------------------------------------------------------------
  code({
    id: 'vertex-x-sign-reversed',
    concept: 'quadratic-vertex',
    domain: 'nonlinear',
    label: 'Vertex x-coordinate sign reversed',
    teacherMeaning: 'The vertex\'s x-coordinate has the wrong sign — read from (x − h) without changing sign, or computed as b/(2a) instead of −b/(2a).',
    evidenceRequired: 'Vertex instance: the submitted vertex is (−h, k) or (−h, f(−h)) for the authoritative vertex (h, k), with h ≠ 0.',
    teks: ['A.7A'],
  }),
  code({
    id: 'zeros-sign-reversed',
    concept: 'quadratic-zeros',
    domain: 'nonlinear',
    label: 'Zeros read from the factors with the wrong sign',
    teacherMeaning: 'The zeros given are the constants in the factors (x − r) rather than the values that make each factor 0.',
    evidenceRequired: 'Zeros instance: the submitted zeros are exactly the opposites of both authoritative zeros, and that set differs from the zeros themselves.',
    teks: ['A.8A'],
  }),
]);

const BY_ID = new Map(MISCONCEPTION_REGISTRY.map((entry) => [entry.id, entry]));

/*
 * THE CLASSIFIERS THE REGISTRY RECOGNIZES, and the codes each may emit.
 *
 * Declared here (light) so every reader can check provenance without loading
 * the classifiers themselves; functions/shared/misconceptionClassifiers.mjs
 * implements them, and tests/platform/misconceptionEvidence.test.mjs asserts
 * the two agree. A finding from an undeclared classifier, a newer classifier
 * version, or a code its classifier may not emit is not evidence.
 */
const classifier = (id, version, codes) => Object.freeze({ id, version, codes: Object.freeze([...codes]) });
export const MISCONCEPTION_CLASSIFIERS = Object.freeze([
  classifier('family:linear.slopeFromPoints@1', 1, ['slope-run-over-rise', 'slope-sign-reversed']),
  classifier('family:functions.identifyIntercepts@1', 1, ['intercepts-swapped', 'ordered-pair-reversed']),
  classifier('family:linear.twoStepEquation@1', 1, ['inverse-operation-sign', 'partial-division']),
  classifier('family:linear.multiStepEquation@1', 1, ['inverse-operation-sign']),
  classifier('family:systems.elimination@1', 1, ['ordered-pair-reversed', 'system-point-on-one-line-only']),
  classifier('family:systems.substitution@1', 1, ['ordered-pair-reversed', 'substitution-partial-distribution', 'system-point-on-one-line-only']),
  classifier('family:absoluteValue.solveEquation@1', 1, ['absolute-value-negated-solution', 'absolute-value-one-case-only']),
  classifier('family:quadratics.identifyVertex@1', 1, ['vertex-x-sign-reversed', 'ordered-pair-reversed']),
  classifier('family:functions.identifyZeros@1', 1, ['zeros-sign-reversed']),
  classifier('tool:graphing/lineFeatures', 1, ['slope-run-over-rise', 'slope-sign-reversed', 'slope-intercept-swapped']),
  classifier('tool:systemsWorkspace/inequalities', 1, ['inequality-boundary-style', 'inequality-shaded-wrong-side']),
  classifier('tool:intervalNumberLine/numberLine', 1, ['endpoint-inclusion-error', 'inequality-direction-reversed']),
  classifier('tool:relationshipModel/standalone', 1, ['independent-dependent-swapped']),
]);
const CLASSIFIER_BY_ID = new Map(MISCONCEPTION_CLASSIFIERS.map((entry) => [entry.id, entry]));

export const MAX_CODES_PER_RECORD = 5;
const MAX_FINDINGS = MAX_CODES_PER_RECORD;
const MAX_PARTS_PER_FINDING = 8;

const clean = (value) => String(value ?? '').trim();
const positiveInteger = (value) => (Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : null);

export const getMisconceptionCode = (id) => BY_ID.get(clean(id)) || null;
export const isMisconceptionCode = (id) => BY_ID.has(clean(id));
export const misconceptionLabel = (id) => BY_ID.get(clean(id))?.label || null;
export const misconceptionClassifier = (id) => CLASSIFIER_BY_ID.get(clean(id)) || null;

/** Registry ids only, de-duplicated, capped. Anything else is dropped, never guessed into a code. */
export const normalizeMisconceptionCodes = (codes) => {
  const values = Array.isArray(codes) ? codes : (codes ? [codes] : []);
  return [...new Set(values.map((value) => clean(value)).filter(isMisconceptionCode))].slice(0, MAX_CODES_PER_RECORD);
};

/**
 * The provenance block a server classifier writes on an attempt's evidence
 * event. Bounded and free of student work: codes, the part ids they concern,
 * and who classified them — never a response, never an answer.
 */
export const buildMisconceptionEvidence = ({ classifierId, findings = [] } = {}) => {
  const declared = misconceptionClassifier(classifierId);
  if (!declared) return null;
  const seen = new Set();
  const kept = (Array.isArray(findings) ? findings : []).flatMap((finding) => {
    const entry = getMisconceptionCode(finding?.code);
    if (!entry || !declared.codes.includes(entry.id) || seen.has(entry.id)) return [];
    seen.add(entry.id);
    const parts = [...new Set((Array.isArray(finding?.parts) ? finding.parts : []).map(clean).filter((id) => id && id.length <= 80))]
      .slice(0, MAX_PARTS_PER_FINDING);
    return [{ code: entry.id, codeVersion: entry.version, parts }];
  }).slice(0, MAX_FINDINGS);
  if (!kept.length) return null;
  return {
    registryVersion: MISCONCEPTION_REGISTRY_VERSION,
    source: MISCONCEPTION_EVIDENCE_SOURCE,
    classifier: declared.id,
    classifierVersion: declared.version,
    findings: kept,
  };
};

/**
 * THE ONE TRUST GATE. The findings on an evidence event's `performance` that
 * count as evidence — `[{ code, codeVersion, parts, classifier, classifierVersion }]`
 * — or `[]`.
 *
 * Accepted only with server provenance, from a declared classifier at a
 * version this build knows, for a registered code at a version this build
 * knows that the classifier may emit. Everything else — a bare
 * `misconceptionCodes` list, a forged or future code, a malformed block — is
 * silently not evidence.
 */
export const trustedMisconceptionFindings = (performance) => {
  const evidence = performance?.misconceptionEvidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [];
  if (clean(evidence.source) !== MISCONCEPTION_EVIDENCE_SOURCE) return [];
  const registryVersion = positiveInteger(evidence.registryVersion);
  if (registryVersion === null || registryVersion > MISCONCEPTION_REGISTRY_VERSION) return [];
  const declared = misconceptionClassifier(evidence.classifier);
  const classifierVersion = positiveInteger(evidence.classifierVersion);
  if (!declared || classifierVersion === null || classifierVersion > declared.version) return [];
  const seen = new Set();
  return (Array.isArray(evidence.findings) ? evidence.findings : []).flatMap((finding) => {
    const entry = getMisconceptionCode(finding?.code);
    const codeVersion = positiveInteger(finding?.codeVersion);
    if (!entry || codeVersion === null || codeVersion > entry.version) return [];
    if (!declared.codes.includes(entry.id) || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{
      code: entry.id,
      codeVersion,
      parts: [...new Set((Array.isArray(finding?.parts) ? finding.parts : []).map(clean).filter((id) => id && id.length <= 80))].slice(0, MAX_PARTS_PER_FINDING),
      classifier: declared.id,
      classifierVersion,
    }];
  }).slice(0, MAX_FINDINGS);
};

/** The trusted codes on an evidence event's `performance`. */
export const trustedMisconceptionCodes = (performance) => trustedMisconceptionFindings(performance).map((finding) => finding.code);

// Earlier name for the registry, kept for existing importers.
export const MISCONCEPTION_CODE_CATALOG = MISCONCEPTION_REGISTRY;

export default MISCONCEPTION_REGISTRY;
