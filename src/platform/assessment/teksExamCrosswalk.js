// The canonical TEKS → exam-domain crosswalk.
//
// WHAT THIS REPLACES. `mapTEKSToExamDomains` used to be a twelve-line strand
// heuristic: read the section number out of the code, look it up in a table.
// It mapped all 49 Algebra I standards to all four frameworks and mapped
// nothing at all in grades 6-8 or Algebra II, because its pattern only matched
// `A.n`. Both failures came from the same cause — it was reasoning about the
// numbering rather than the mathematics.
//
// So this file is authored per standard, from the standard's own description,
// and the numbering is never consulted. 6.4B is `problemSolvingData` because it
// is about ratios and rates, not because it is in strand 4.
//
// THREE RULES IT FOLLOWS.
//
//   1. A standard may map to no framework, one, or several. Nothing here forces
//      four-way coverage. Personal financial literacy standards about credit
//      reports and college costs map to nothing, and that is the correct answer.
//   2. A standard may map to several domains WITHIN one framework. 7.4C (the
//      constant of proportionality) is both SAT Algebra and SAT Problem-Solving
//      and Data Analysis, because it genuinely is.
//   3. Process standards are excluded entirely. They describe how to work, not
//      what is tested, and making one a CCMR content node would put "apply
//      mathematics to problems arising in everyday life" on a student's SAT
//      skill list.
//
// STILL AUTHORED. This is a curriculum judgment, standard by standard, and a
// teacher should review it — particularly the ASVAB column, which is the one
// that most often should say nothing at all.

// This module is data, and the registry that validates it consumes it. So the
// framework ids are written as literals here rather than imported: importing
// them would make the registry and the crosswalk depend on each other, and the
// cycle breaks at load time. The constants are asserted against the registry in
// the crosswalk test instead, which catches drift without the cycle.

// Shorthand, so a 237-row table stays readable enough to audit by eye.
const SAT = 'digitalSAT';
const ACT = 'act';
const TSI = 'tsia2';
const ASV = 'asvab';

const alg = 'algebra';
const adv = 'advancedMath';
const psd = 'problemSolvingData';
const geo = 'geometryTrigonometry';
const phm = 'preparingHigherMath';
const ess = 'essentialSkills';
const qr = 'quantitativeReasoning';
const ar = 'algebraicReasoning';
const gs = 'geometricSpatial';
const ps = 'probabilisticStatistical';
const arr = 'arithmeticReasoning';
const mk = 'mathematicsKnowledge';

const map = (sat, act, tsi, asv) => ({
  ...(sat ? { [SAT]: [].concat(sat) } : {}),
  ...(act ? { [ACT]: [].concat(act) } : {}),
  ...(tsi ? { [TSI]: [].concat(tsi) } : {}),
  ...(asv ? { [ASV]: [].concat(asv) } : {}),
});

/**
 * PARTIAL COVERAGE — the distinction that makes the ASVAB column honest.
 *
 * A TEKS is frequently broader than the slice of it an assessment can reach.
 * A.7A is "graph quadratic functions and identify key attributes": the zeros,
 * intercepts, vertex and axis of symmetry are conventional high-school
 * mathematics knowledge, while the transformation analysis in the same standard
 * is not. A binary mapped/excluded decision has to be wrong about one half.
 *
 * So a framework entry may instead say which aspects are in scope. Question
 * generation for that framework is then constrained to the allowed aspects,
 * and the audit reports it as partial rather than counting it as full coverage.
 */
const partial = (domains, { allowed = [], excluded = [] } = {}) => ({
  domains: [].concat(domains),
  coverage: 'partial',
  allowedAspects: allowed,
  excludedAspects: excluded,
});

export const COVERAGE = Object.freeze({ FULL: 'full', PARTIAL: 'partial' });

const entryDomains = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : (value.domains || []);
};

const entryCoverage = (value) => {
  if (!value) return null;
  return Array.isArray(value) ? COVERAGE.FULL : (value.coverage || COVERAGE.FULL);
};

// Recurring shapes, named once. Each is a claim about a kind of mathematics.
const NUMBER_SENSE = map(null, phm, qr, mk);
const APPLIED_ARITHMETIC = map(psd, ess, qr, arr);
const LINEAR_ALGEBRA = map(alg, phm, ar, mk);
const LINEAR_APPLIED = map([alg, psd], ess, ar, arr);
const GEOMETRY = map(geo, phm, gs, mk);
const STATISTICS = map(psd, phm, ps, null);
const STATISTICS_APPLIED = map(psd, ess, ps, null);
// Function-family work above the ASVAB's ceiling.
const ADVANCED = map(adv, phm, ar, null);
// Advanced work the ASVAB does reach: factoring, polynomials, radicals.
const ADVANCED_WITH_ASVAB = map(adv, phm, ar, mk);
const MODELLING_FROM_DATA = map(psd, phm, ps, null);
// Consumer/financial-literacy content no mathematics assessment tests.
const NOT_ASSESSED = {};

export const TEKS_EXAM_CROSSWALK = Object.freeze({
  // ---- Grade 6 ------------------------------------------------------------
  '6.2A': NUMBER_SENSE, '6.2B': NUMBER_SENSE, '6.2C': NUMBER_SENSE,
  '6.2D': NUMBER_SENSE, '6.2E': NUMBER_SENSE,
  '6.3A': NUMBER_SENSE, '6.3B': map(psd, ess, qr, arr), '6.3C': NUMBER_SENSE,
  '6.3D': NUMBER_SENSE, '6.3E': NUMBER_SENSE,
  '6.4A': LINEAR_ALGEBRA,
  '6.4B': APPLIED_ARITHMETIC, '6.4C': APPLIED_ARITHMETIC, '6.4D': APPLIED_ARITHMETIC,
  '6.4E': APPLIED_ARITHMETIC, '6.4F': APPLIED_ARITHMETIC, '6.4G': APPLIED_ARITHMETIC,
  '6.4H': APPLIED_ARITHMETIC,
  '6.5A': APPLIED_ARITHMETIC, '6.5B': APPLIED_ARITHMETIC, '6.5C': APPLIED_ARITHMETIC,
  '6.6A': LINEAR_ALGEBRA, '6.6B': LINEAR_ALGEBRA, '6.6C': LINEAR_ALGEBRA,
  '6.7A': NUMBER_SENSE, '6.7B': LINEAR_ALGEBRA, '6.7C': LINEAR_ALGEBRA, '6.7D': LINEAR_ALGEBRA,
  '6.8A': GEOMETRY, '6.8B': GEOMETRY, '6.8C': GEOMETRY, '6.8D': GEOMETRY,
  '6.9A': LINEAR_ALGEBRA, '6.9B': LINEAR_ALGEBRA, '6.9C': map(alg, ess, ar, arr),
  '6.10A': LINEAR_ALGEBRA, '6.10B': LINEAR_ALGEBRA,
  '6.11': GEOMETRY,
  '6.12A': STATISTICS_APPLIED, '6.12B': STATISTICS,
  // Measures of centre are genuine ASVAB Arithmetic Reasoning content; the
  // graphical displays around them are not.
  '6.12C': map(psd, phm, ps, arr),
  '6.12D': STATISTICS_APPLIED,
  '6.13A': STATISTICS_APPLIED, '6.13B': STATISTICS,
  // Personal financial literacy. Money arithmetic is ASVAB Arithmetic
  // Reasoning; consumer-credit knowledge is not mathematics content anywhere.
  '6.14A': NOT_ASSESSED, '6.14B': NOT_ASSESSED, '6.14C': map(null, ess, qr, arr),
  '6.14D': NOT_ASSESSED, '6.14E': NOT_ASSESSED, '6.14F': NOT_ASSESSED,
  '6.14G': NOT_ASSESSED, '6.14H': NOT_ASSESSED,

  // ---- Grade 7 ------------------------------------------------------------
  '7.2': NUMBER_SENSE,
  '7.3A': NUMBER_SENSE, '7.3B': APPLIED_ARITHMETIC,
  '7.4A': LINEAR_ALGEBRA, '7.4B': APPLIED_ARITHMETIC,
  // Both SAT domains, legitimately: proportionality is algebra and it is the
  // backbone of the data-analysis section.
  '7.4C': map([alg, psd], phm, qr, arr),
  '7.4D': APPLIED_ARITHMETIC, '7.4E': APPLIED_ARITHMETIC,
  '7.5A': GEOMETRY, '7.5B': GEOMETRY, '7.5C': GEOMETRY,
  '7.6A': STATISTICS, '7.6B': STATISTICS, '7.6C': STATISTICS, '7.6D': STATISTICS,
  '7.6E': STATISTICS, '7.6F': STATISTICS, '7.6G': STATISTICS_APPLIED,
  '7.6H': STATISTICS_APPLIED, '7.6I': STATISTICS,
  '7.7': LINEAR_ALGEBRA,
  '7.8A': GEOMETRY, '7.8B': GEOMETRY, '7.8C': GEOMETRY,
  '7.9A': GEOMETRY, '7.9B': GEOMETRY, '7.9C': GEOMETRY, '7.9D': GEOMETRY,
  '7.10A': LINEAR_ALGEBRA, '7.10B': LINEAR_ALGEBRA, '7.10C': map(alg, ess, ar, arr),
  '7.11A': LINEAR_ALGEBRA, '7.11B': LINEAR_ALGEBRA, '7.11C': GEOMETRY,
  '7.12A': STATISTICS, '7.12B': STATISTICS, '7.12C': STATISTICS,
  '7.13A': APPLIED_ARITHMETIC,
  '7.13B': NOT_ASSESSED, '7.13C': NOT_ASSESSED, '7.13D': NOT_ASSESSED,
  '7.13E': APPLIED_ARITHMETIC, '7.13F': APPLIED_ARITHMETIC,

  // ---- Grade 8 ------------------------------------------------------------
  '8.2A': NUMBER_SENSE,
  '8.2B': map(adv, phm, qr, mk), '8.2C': map(adv, phm, qr, mk),
  '8.2D': NUMBER_SENSE,
  '8.3A': GEOMETRY, '8.3B': GEOMETRY, '8.3C': GEOMETRY,
  '8.4A': LINEAR_ALGEBRA, '8.4B': map([alg, psd], phm, ar, mk), '8.4C': LINEAR_ALGEBRA,
  '8.5A': LINEAR_ALGEBRA, '8.5B': LINEAR_ALGEBRA,
  '8.5C': STATISTICS, '8.5D': STATISTICS,
  '8.5E': LINEAR_ALGEBRA, '8.5F': LINEAR_ALGEBRA, '8.5G': LINEAR_ALGEBRA,
  '8.5H': LINEAR_ALGEBRA, '8.5I': LINEAR_ALGEBRA,
  '8.6A': GEOMETRY, '8.6B': GEOMETRY, '8.6C': GEOMETRY,
  '8.7A': GEOMETRY, '8.7B': GEOMETRY, '8.7C': GEOMETRY, '8.7D': GEOMETRY,
  '8.8A': LINEAR_ALGEBRA, '8.8B': map(alg, ess, ar, arr), '8.8C': LINEAR_ALGEBRA,
  '8.8D': GEOMETRY,
  '8.9': LINEAR_ALGEBRA,
  // Transformations are SAT/ACT/TSIA2 geometry; the ASVAB does not test them.
  '8.10A': map(geo, phm, gs, null), '8.10B': map(geo, phm, gs, null),
  '8.10C': map(geo, phm, gs, null), '8.10D': map(geo, phm, gs, null),
  '8.11A': STATISTICS, '8.11B': STATISTICS, '8.11C': STATISTICS,
  '8.12A': APPLIED_ARITHMETIC, '8.12B': APPLIED_ARITHMETIC,
  '8.12C': map([adv, psd], ess, qr, arr), '8.12D': APPLIED_ARITHMETIC,
  '8.12E': NOT_ASSESSED, '8.12F': NOT_ASSESSED,
  '8.12G': map(null, ess, qr, arr),

  // ---- Algebra I ----------------------------------------------------------
  // Authored explicitly, replacing the strand heuristic that claimed all 49 for
  // all four frameworks.
  // Domain and range of a linear function is ordinary high-school algebra even
  // though it is not an ASVAB emphasis; the contextual discrete/continuous
  // reasoning in the same standard is not an MK item.
  'A.2A': {
    ...map(alg, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['stating the domain or range of a linear function', 'reading values a linear function can take'],
      excluded: ['reasonable-domain reasoning in context', 'discrete versus continuous classification'],
    }),
  },
  'A.2B': LINEAR_ALGEBRA, 'A.2C': LINEAR_ALGEBRA, 'A.2D': LINEAR_ALGEBRA,
  'A.2E': map([alg, geo], phm, ar, mk), 'A.2F': map([alg, geo], phm, ar, mk),
  'A.2G': LINEAR_ALGEBRA,
  'A.2H': map(alg, phm, ar, null),
  'A.2I': LINEAR_ALGEBRA,
  'A.3A': LINEAR_ALGEBRA, 'A.3B': LINEAR_APPLIED, 'A.3C': LINEAR_ALGEBRA,
  'A.3D': map(alg, phm, ar, null), 'A.3E': map(alg, phm, ar, null),
  'A.3F': LINEAR_ALGEBRA, 'A.3G': map(alg, phm, ar, null), 'A.3H': map(alg, phm, ar, null),
  'A.4A': MODELLING_FROM_DATA, 'A.4B': MODELLING_FROM_DATA, 'A.4C': MODELLING_FROM_DATA,
  'A.5A': LINEAR_ALGEBRA, 'A.5B': LINEAR_ALGEBRA, 'A.5C': LINEAR_ALGEBRA,
  // Basic quadratic domain and range is more arguable than the specialised
  // construction skills in A.6B and A.6C, which stay excluded.
  'A.6A': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['stating the domain of a quadratic', 'stating the range from a known minimum or maximum'],
      excluded: ['inequality-notation emphasis', 'contextual reasonable-range reasoning'],
    }),
  },
  'A.6B': ADVANCED, 'A.6C': ADVANCED,
  // Removed from the exclusion list on review. Zeros, intercepts, the vertex
  // and the axis of symmetry are conventional high-school mathematics
  // knowledge; the transformation analysis in the same standard is not.
  'A.7A': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['zeros', 'intercepts', 'vertex', 'axis of symmetry', 'basic quadratic graph properties'],
      excluded: ['advanced transformation analysis', 'parameter-effect comparison'],
    }),
  },
  'A.7B': ADVANCED_WITH_ASVAB, 'A.7C': ADVANCED,
  'A.8A': ADVANCED_WITH_ASVAB, 'A.8B': MODELLING_FROM_DATA,
  'A.9A': ADVANCED, 'A.9B': map([adv, psd], phm, ar, null),
  'A.9C': ADVANCED, 'A.9D': ADVANCED, 'A.9E': MODELLING_FROM_DATA,
  'A.10A': ADVANCED_WITH_ASVAB, 'A.10B': ADVANCED_WITH_ASVAB, 'A.10C': ADVANCED_WITH_ASVAB,
  'A.10D': ADVANCED_WITH_ASVAB, 'A.10E': ADVANCED_WITH_ASVAB, 'A.10F': ADVANCED_WITH_ASVAB,
  'A.11A': map(adv, phm, qr, mk), 'A.11B': ADVANCED_WITH_ASVAB,
  'A.12A': LINEAR_ALGEBRA, 'A.12B': LINEAR_ALGEBRA,
  'A.12C': ADVANCED, 'A.12D': ADVANCED,
  'A.12E': LINEAR_ALGEBRA,

  // ---- Algebra II ---------------------------------------------------------
  // RE-REVIEWED. The first pass mapped only 3 of 48 standards to the ASVAB,
  // which said in effect that Mathematics Knowledge contains almost no
  // Algebra II-level algebra. That is not a safe reading of a subtest described
  // as knowledge of high-school mathematics principles.
  //
  // The rule applied here is: can an ordinary high-school mathematics-knowledge
  // question be posed from this standard, without depending on function-family
  // analysis? Factoring, polynomial division, radical and rational-exponent
  // manipulation, ordinary quadratic and absolute-value equation solving, and
  // simple rational equations all pass. Transformations, logarithmic structure,
  // inverse-function structure, asymptotic analysis and technology-based
  // modelling do not.
  'A2.2A': ADVANCED, 'A2.2B': ADVANCED, 'A2.2C': ADVANCED, 'A2.2D': ADVANCED,
  'A2.3A': map([alg, adv], phm, ar, null), 'A2.3B': map(alg, phm, ar, null),
  'A2.3C': ADVANCED, 'A2.3D': ADVANCED,
  'A2.3E': map(alg, phm, ar, null), 'A2.3F': map(alg, phm, ar, null),
  'A2.3G': map(alg, phm, ar, null),
  'A2.4A': ADVANCED, 'A2.4B': map([adv, geo], phm, gs, null),
  'A2.4C': ADVANCED,
  'A2.4D': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['completing the square', 'rewriting a quadratic in vertex form', 'identifying the vertex algebraically'],
      excluded: ['transformation analysis', 'parameter-effect reasoning'],
    }),
  },
  'A2.4E': MODELLING_FROM_DATA,
  'A2.4F': ADVANCED_WITH_ASVAB,
  'A2.4G': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['checking solutions of a radical equation', 'identifying an extraneous root'],
      excluded: ['domain-restriction analysis of the square root family'],
    }),
  },
  'A2.4H': ADVANCED,
  'A2.5A': ADVANCED, 'A2.5B': map([adv, psd], phm, ar, null),
  'A2.5C': ADVANCED, 'A2.5D': ADVANCED, 'A2.5E': ADVANCED,
  'A2.6A': ADVANCED,
  'A2.6B': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['solving a cube root equation', 'cubing to undo a cube root'],
      excluded: ['transformation analysis of the cube root parent function'],
    }),
  },
  'A2.6C': ADVANCED, 'A2.6D': ADVANCED,
  'A2.6E': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['solving a linear absolute-value equation such as |2x - 3| = 7'],
      excluded: ['transformation analysis', 'contextual formulation'],
    }),
  },
  'A2.6F': ADVANCED, 'A2.6G': ADVANCED, 'A2.6H': ADVANCED,
  'A2.6I': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['solving a simple rational equation', 'clearing a single denominator', 'proportion-style equations'],
      excluded: ['rational-function analysis', 'asymptotic or domain-restriction reasoning'],
    }),
  },
  'A2.6J': ADVANCED, 'A2.6K': ADVANCED,
  'A2.6L': {
    ...map(adv, phm, ar, null),
    [ASV]: partial([mk, arr], {
      allowed: ['inverse variation y = k/x', 'finding a constant of variation', 'applied variation word problems'],
      excluded: ['reciprocal parent-function analysis'],
    }),
  },
  'A2.7A': ADVANCED,
  'A2.7B': ADVANCED_WITH_ASVAB,
  'A2.7C': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['dividing a polynomial by a binomial', 'polynomial long division'],
      excluded: ['synthetic division applied to root-finding theory'],
    }),
  },
  'A2.7D': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['factoring to find linear factors', 'basic factor recognition'],
      excluded: ['rational root theorem', 'degree-four factoring theory'],
    }),
  },
  'A2.7E': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['factoring by grouping', 'difference of cubes', 'sum of cubes', 'standard factoring patterns'],
      excluded: ['degree-four structural factoring'],
    }),
  },
  'A2.7F': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['simplifying a rational expression', 'multiplying or dividing rational expressions'],
      excluded: ['complex rational expressions', 'rational-function analysis'],
    }),
  },
  'A2.7G': ADVANCED_WITH_ASVAB,
  'A2.7H': {
    ...map(adv, phm, ar, null),
    [ASV]: partial(mk, {
      allowed: ['laws of exponents with rational exponents', 'converting between radical and exponent form'],
      excluded: ['equations requiring domain analysis'],
    }),
  },
  'A2.7I': ADVANCED,
  'A2.8A': MODELLING_FROM_DATA, 'A2.8B': MODELLING_FROM_DATA,
  'A2.8C': map(psd, ess, ps, null),
});

// ---------------------------------------------------------------------------
// Why a standard is excluded from the ASVAB.
// ---------------------------------------------------------------------------
//
// The exclusion list is derived from the table, so it cannot drift. The reasons
// are authored per category and attached per code, so the audit can say why
// each "no" was a "no" rather than presenting 80 bare codes for review.

export const ASVAB_EXCLUSION_REASON = Object.freeze({
  probability: 'Probability and sample-space reasoning. Neither Arithmetic Reasoning nor Mathematics Knowledge is a probability subtest.',
  dataDisplays: 'Requires a specific statistical display or measure of spread rather than applied arithmetic.',
  transformations: 'Coordinate or parent-function transformation analysis, which is not an AR or MK topic.',
  technology: 'Requires regression or graphing technology. The ASVAB permits no calculator.',
  functionAnalysis: 'Function-family analysis — inverses, asymptotes, parameter effects — above the Mathematics Knowledge ceiling.',
  logarithms: 'Logarithmic structure, which does not appear in Mathematics Knowledge.',
  specialisedConstruction: 'Constructing a function from specialised given information (vertex and point, focus and directrix, three points).',
  inequalityRegions: 'Graphing solution regions or systems of inequalities in two variables.',
  advancedSystems: 'Systems beyond two linear equations, or systems mixing linear and quadratic equations.',
  contextualModelling: 'Formulating a model from context in a way that depends on the function family rather than on arithmetic.',
  notationEmphasis: 'The standard is about interval or set notation rather than about computing an answer.',
  consumerFinance: 'Consumer-finance knowledge rather than mathematics content.',
});

const EXCLUSION_GROUPS = {
  probability: ['7.6A', '7.6B', '7.6C', '7.6D', '7.6E', '7.6F', '7.6G', '7.6H', '7.6I'],
  dataDisplays: ['6.12A', '6.12B', '6.12D', '6.13A', '6.13B', '7.12A', '7.12B', '7.12C',
    '8.5C', '8.5D', '8.11A', '8.11B', '8.11C'],
  transformations: ['8.10A', '8.10B', '8.10C', '8.10D', 'A.3E', 'A.7C',
    'A2.2A', 'A2.4C', 'A2.5A', 'A2.6A', 'A2.6C', 'A2.6G'],
  technology: ['A.4A', 'A.4C', 'A.8B', 'A.9E', 'A2.4E', 'A2.8A', 'A2.8B', 'A2.8C'],
  functionAnalysis: ['A.9A', 'A.9B', 'A.9C', 'A.9D', 'A.12C', 'A.12D',
    'A2.2B', 'A2.2C', 'A2.2D', 'A2.6K', 'A2.7A', 'A2.4H', 'A2.6F'],
  logarithms: ['A2.5C', 'A2.5D', 'A2.5E'],
  specialisedConstruction: ['A.6B', 'A.6C', 'A2.4A', 'A2.4B'],
  inequalityRegions: ['A.2H', 'A.3D', 'A.3G', 'A.3H', 'A2.3E', 'A2.3F', 'A2.3G'],
  advancedSystems: ['A2.3A', 'A2.3B', 'A2.3C', 'A2.3D'],
  contextualModelling: ['A.4B', 'A2.5B', 'A2.6D', 'A2.6H', 'A2.6J'],
  notationEmphasis: ['A2.7I'],
};

const REASON_BY_CODE = (() => {
  const index = {};
  Object.entries(EXCLUSION_GROUPS).forEach(([key, codes]) => {
    codes.forEach((code) => { index[code] = key; });
  });
  return index;
})();

/**
 * Standards deliberately given no ASVAB mapping.
 *
 * The MECHANISM is approved; the specific codes are under review, which is why
 * they are surfaced with reasons rather than buried in the table. Derived from
 * the table so the two can never disagree — editing a row edits this list.
 */
export const ASVAB_EXCLUDED_TEKS_CODES = Object.freeze(
  Object.entries(TEKS_EXAM_CROSSWALK)
    .filter(([, entry]) => Object.keys(entry).length > 0 && !entry[ASV])
    .map(([code]) => code),
);

export const asvabExclusionReason = (code) => {
  const key = REASON_BY_CODE[code];
  if (key) return { key, reason: ASVAB_EXCLUSION_REASON[key] };
  // A standard mapped to nothing at all is not an ASVAB scope decision.
  if (TEKS_EXAM_CROSSWALK[code] && Object.keys(TEKS_EXAM_CROSSWALK[code]).length === 0) {
    return { key: 'consumerFinance', reason: ASVAB_EXCLUSION_REASON.consumerFinance };
  }
  return { key: null, reason: 'No reason recorded — this exclusion needs a note before it can be reviewed.' };
};

export const CROSSWALK_FRAMEWORK_IDS = Object.freeze([SAT, ACT, TSI, ASV]);

export const getExamDomainIds = (code, framework) => entryDomains(TEKS_EXAM_CROSSWALK[code]?.[framework]);

export const getFrameworkCoverage = (code, framework) => entryCoverage(TEKS_EXAM_CROSSWALK[code]?.[framework]);

export const getFrameworkAspects = (code, framework) => {
  const value = TEKS_EXAM_CROSSWALK[code]?.[framework];
  if (!value || Array.isArray(value)) return { allowedAspects: [], excludedAspects: [] };
  return {
    allowedAspects: value.allowedAspects || [],
    excludedAspects: value.excludedAspects || [],
  };
};

export const hasAuthoredCrosswalk = (code) => Boolean(TEKS_EXAM_CROSSWALK[code]);

export const isAsvabExcluded = (code) => (
  hasAuthoredCrosswalk(code)
  && Object.keys(TEKS_EXAM_CROSSWALK[code]).length > 0
  && !TEKS_EXAM_CROSSWALK[code][ASV]
);
