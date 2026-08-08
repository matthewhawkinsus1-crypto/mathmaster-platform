import { toDisplayCode } from '../../utils/teksUtils.js';

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

const sectionNumber = (code) => Number(String(code).match(/^A\.(\d+)/)?.[1]);

const mappingFor = (examType, domainId) => {
  const domain = (EXAM_DOMAIN_REGISTRY[examType] || []).find((entry) => entry.id === domainId);
  return domain ? { domainId, weight: domain.weight } : null;
};

export const mapTEKSToExamDomains = (teksCode) => {
  const code = toDisplayCode(teksCode);
  const section = sectionNumber(code);
  if (!Number.isFinite(section)) return {};

  const satDomain = section === 4 ? 'problemSolvingData' : [2, 3, 5].includes(section) ? 'algebra' : [6, 7, 8, 9, 10, 11, 12].includes(section) ? 'advancedMath' : null;
  const actDomain = [2, 3, 5, 6, 7, 8, 9, 10, 11, 12].includes(section) ? 'preparingHigherMath' : section === 4 ? 'essentialSkills' : null;
  const tsiaDomain = section === 4 ? 'probabilisticStatistical' : [2, 3].includes(section) ? 'quantitativeReasoning' : [5, 6, 7, 8, 9, 10, 11, 12].includes(section) ? 'algebraicReasoning' : null;
  const asvabDomain = section === 4 ? 'arithmeticReasoning' : [2, 3, 5, 6, 7, 8, 9, 10, 11, 12].includes(section) ? 'mathematicsKnowledge' : null;
  return {
    ...(satDomain ? { [EXAM_TYPES.DIGITAL_SAT]: mappingFor(EXAM_TYPES.DIGITAL_SAT, satDomain) } : {}),
    ...(actDomain ? { [EXAM_TYPES.ACT]: mappingFor(EXAM_TYPES.ACT, actDomain) } : {}),
    ...(tsiaDomain ? { [EXAM_TYPES.TSIA2]: mappingFor(EXAM_TYPES.TSIA2, tsiaDomain) } : {}),
    ...(asvabDomain ? { [EXAM_TYPES.ASVAB]: mappingFor(EXAM_TYPES.ASVAB, asvabDomain) } : {}),
  };
};

export const getExamDomains = (examType) => EXAM_DOMAIN_REGISTRY[examType] || [];
