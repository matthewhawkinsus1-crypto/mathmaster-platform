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

/**
 * Exam domains for a TEKS code, from the authored crosswalk.
 *
 * This used to derive the answer from the code's section number, which is why
 * it returned nothing for grades 6-8 and Algebra II (the pattern only matched
 * `A.n`) and returned all four frameworks for every Algebra I standard. It now
 * reads a table authored per standard from that standard's own description.
 *
 * The return shape is unchanged — `{ [framework]: { domainId, weight } }` — so
 * existing callers keep working. `domainIds` is added alongside for the cases
 * where a standard genuinely belongs to more than one domain of the same exam.
 */
export const mapTEKSToExamDomains = (teksCode) => {
  const code = toDisplayCode(teksCode);
  const authored = TEKS_EXAM_CROSSWALK[code];
  if (!authored) return {};

  const result = {};
  Object.values(EXAM_TYPES).forEach((examType) => {
    // Validated here, not in the crosswalk: the registry owns which domain ids
    // exist, so an authored typo is dropped rather than propagated.
    const known = new Set((EXAM_DOMAIN_REGISTRY[examType] || []).map((domain) => domain.id));
    const domainIds = getExamDomainIds(code, examType).filter((id) => known.has(id));
    if (!domainIds.length) return;
    const primary = mappingFor(examType, domainIds[0]);
    if (!primary) return;
    // Coverage travels with the mapping: a partial entry means the standard is
    // broader than the slice this exam can reach, and question generation must
    // stay inside `allowedAspects`.
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
