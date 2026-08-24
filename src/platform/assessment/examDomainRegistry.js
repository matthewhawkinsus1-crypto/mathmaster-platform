import { toDisplayCode } from '../../utils/teksUtils.js';
import { TEKS_EXAM_CROSSWALK, getExamDomainIds, getFrameworkAspects, getFrameworkCoverage } from './teksExamCrosswalk.js';

export const EXAM_TYPES = Object.freeze({
  DIGITAL_SAT: 'digitalSAT',
  ACT: 'act',
  TSIA2: 'tsia2',
  ASVAB: 'asvab',
});

export const EXAM_BENCHMARKS = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: Object.freeze({ readinessThreshold: 530, scoreMin: 200, scoreMax: 800, label: 'SAT Math college and career readiness benchmark' }),
  [EXAM_TYPES.ACT]: Object.freeze({ readinessThreshold: 22, scoreMin: 1, scoreMax: 36, label: 'ACT Math college readiness benchmark' }),
  [EXAM_TYPES.TSIA2]: Object.freeze({ readinessThreshold: 950, alternativeDiagnosticLevel: 6, scoreMin: 910, scoreMax: 990, label: 'TSIA2 Math CRC benchmark indicator; diagnostic level 6 is an alternate readiness pathway when CRC is below 950' }),
  [EXAM_TYPES.ASVAB]: Object.freeze({ readinessThreshold: null, scoreMin: 1, scoreMax: 99, label: 'Math preparation index; not an AFQT enlistment score' }),
});

export const EXAM_DOMAIN_REGISTRY = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: Object.freeze([
    Object.freeze({ id: 'algebra', title: 'Algebra', weight: 0.35 }),
    Object.freeze({ id: 'advancedMath', title: 'Advanced Math', weight: 0.35 }),
    Object.freeze({ id: 'problemSolvingData', title: 'Problem-Solving and Data Analysis', weight: 0.15 }),
    Object.freeze({ id: 'geometryTrigonometry', title: 'Geometry and Trigonometry', weight: 0.15 }),
  ]),
  [EXAM_TYPES.ACT]: Object.freeze([
    Object.freeze({ id: 'preparingHigherMath', title: 'Preparing for Higher Mathematics', weight: 0.8 }),
    Object.freeze({ id: 'essentialSkills', title: 'Integrating Essential Skills', weight: 0.2 }),
  ]),
  [EXAM_TYPES.TSIA2]: Object.freeze([
    Object.freeze({ id: 'quantitativeReasoning', title: 'Quantitative Reasoning', weight: 0.25 }),
    Object.freeze({ id: 'algebraicReasoning', title: 'Algebraic Reasoning', weight: 0.25 }),
    Object.freeze({ id: 'geometricSpatial', title: 'Geometric and Spatial Reasoning', weight: 0.25 }),
    Object.freeze({ id: 'probabilisticStatistical', title: 'Probabilistic and Statistical Reasoning', weight: 0.25 }),
  ]),
  [EXAM_TYPES.ASVAB]: Object.freeze([
    Object.freeze({ id: 'arithmeticReasoning', title: 'Arithmetic Reasoning', weight: 0.5 }),
    Object.freeze({ id: 'mathematicsKnowledge', title: 'Mathematics Knowledge', weight: 0.5 }),
  ]),
});

const mappingFor = (examType, domainId) => {
  const domain = (EXAM_DOMAIN_REGISTRY[examType] || []).find((entry) => entry.id === domainId);
  return domain ? { domainId, weight: domain.weight } : null;
};

// V2.1 assessment-scope corrections. The shared curriculum crosswalk is useful
// for prerequisites and instructional relationships, but direct CCMR evidence
// must match the assessment's published scope. These guards prevent a broad
// curriculum relationship from becoming a false student-facing SAT claim.
const FRAMEWORK_SCOPE_EXCLUSIONS = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: new Set([
    // College Board Table 25 does not mark these Algebra I rows for Digital SAT.
    'A.2A',
    'A.4A',
    'A.4B',
    // Three linear equations in three variables are outside the SAT taxonomy.
    'A2.3B',
    // Technology-regression row is not marked in College Board Table 26.
    'A2.8B',
  ]),
});

// Some broad TEKS contain mathematics from more than one SAT domain. Excluding
// only an unsupported domain preserves the legitimate portion.
const FRAMEWORK_DOMAIN_EXCLUSIONS = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: Object.freeze({
    // Linear+quadratic systems belong to Advanced Math, not SAT Algebra.
    'A2.3A': new Set(['algebra']),
    // College Board Table 25 aligns these line-equation standards to Algebra,
    // not Geometry and Trigonometry.
    'A.2E': new Set(['geometryTrigonometry']),
    'A.2F': new Set(['geometryTrigonometry']),
    // College Board Table 26 places focus/directrix parabola work in Advanced
    // Math rather than Geometry and Trigonometry.
    'A2.4B': new Set(['geometryTrigonometry']),
  }),
});

// Where the legacy curriculum crosswalk has the right mathematical relationship
// but the wrong Digital SAT domain, V2.1 supplies the assessment-specific route.
const FRAMEWORK_DOMAIN_OVERRIDES = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: Object.freeze({
    // Table 26 maps inverse variation to PSDA ratios/rates rather than Advanced Math.
    'A2.6L': Object.freeze(['problemSolvingData']),
  }),
});

const isFrameworkScopeExcluded = (code, examType) => {
  // College Board's Texas report aligns middle-school TEKS to PSAT 8/9, not
  // directly to the SAT. Grade 6-8 skills remain available to MathMaster as
  // prerequisite/remediation nodes, but they are not direct SAT evidence.
  if (examType === EXAM_TYPES.DIGITAL_SAT && /^(6|7|8)\./.test(code)) return true;
  return FRAMEWORK_SCOPE_EXCLUSIONS[examType]?.has(code) === true;
};

const resolveFrameworkDomains = (code, examType, rawDomainIds) => {
  const override = FRAMEWORK_DOMAIN_OVERRIDES[examType]?.[code];
  const starting = override ? [...override] : rawDomainIds;
  const excluded = FRAMEWORK_DOMAIN_EXCLUSIONS[examType]?.[code];
  if (!excluded) return starting;
  return starting.filter((domainId) => !excluded.has(domainId));
};

/**
 * Exam domains for a TEKS code, from the authored crosswalk plus V2.1
 * assessment-scope corrections.
 *
 * The return shape remains `{ [framework]: { domainId, weight, domainIds } }`.
 * Lower-grade prerequisite relationships may still exist in the curriculum
 * graph even when this function correctly declines to call them direct SAT
 * evidence.
 */
export const mapTEKSToExamDomains = (teksCode) => {
  const code = toDisplayCode(teksCode);
  const authored = TEKS_EXAM_CROSSWALK[code];
  if (!authored) return {};

  const result = {};
  Object.values(EXAM_TYPES).forEach((examType) => {
    if (isFrameworkScopeExcluded(code, examType)) return;
    const known = new Set((EXAM_DOMAIN_REGISTRY[examType] || []).map((domain) => domain.id));
    const authoredDomainIds = getExamDomainIds(code, examType).filter((id) => known.has(id));
    const domainIds = resolveFrameworkDomains(code, examType, authoredDomainIds).filter((id) => known.has(id));
    if (!domainIds.length) return;
    const primary = mappingFor(examType, domainIds[0]);
    if (!primary) return;
    result[examType] = {
      ...primary,
      domainIds,
      coverage: getFrameworkCoverage(code, examType),
      ...getFrameworkAspects(code, examType),
    };
  });
  return result;
};

export const getExamDomains = (examType) => EXAM_DOMAIN_REGISTRY[examType] || [];
