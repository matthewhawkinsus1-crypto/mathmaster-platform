import { EXAM_BENCHMARKS, EXAM_DOMAIN_REGISTRY, EXAM_TYPES, mapTEKSToExamDomains } from './examDomainRegistry.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const scaledScore = (examType, mastery) => {
  const benchmark = EXAM_BENCHMARKS[examType];
  return Math.round(benchmark.scoreMin + clamp(mastery, 0, 100) / 100 * (benchmark.scoreMax - benchmark.scoreMin));
};

const rangeFor = (examType, score) => {
  const benchmark = EXAM_BENCHMARKS[examType];
  const margin = examType === EXAM_TYPES.DIGITAL_SAT ? 30 : examType === EXAM_TYPES.ACT ? 2 : examType === EXAM_TYPES.TSIA2 ? 15 : 7;
  return `${clamp(score - margin, benchmark.scoreMin, benchmark.scoreMax)} - ${clamp(score + margin, benchmark.scoreMin, benchmark.scoreMax)}`;
};

const domainWeightedMastery = (examType, masteryProfilesByTEKS) => {
  const buckets = new Map((EXAM_DOMAIN_REGISTRY[examType] || []).map((domain) => [domain.id, { domain, values: [] }]));
  Object.entries(masteryProfilesByTEKS || {}).forEach(([rawKey, profile]) => {
    const estimate = Number(profile?.mastery?.estimate);
    if (!Number.isFinite(estimate)) return;
    const mapping = mapTEKSToExamDomains(toDisplayCode(rawKey))[examType];
    if (mapping && buckets.has(mapping.domainId)) buckets.get(mapping.domainId).values.push(clamp(estimate, 0, 100));
  });
  let weightedSum = 0;
  let observedWeight = 0;
  const domains = {};
  buckets.forEach(({ domain, values }) => {
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    domains[domain.id] = { title: domain.title, weight: domain.weight, estimate: average == null ? null : Math.round(average), evidenceCount: values.length };
    if (average != null) { weightedSum += average * domain.weight; observedWeight += domain.weight; }
  });
  return { mastery: observedWeight > 0 ? weightedSum / observedWeight : null, coverageWeight: observedWeight, domains };
};

export const predictExamScoresFromMastery = (masteryProfilesByTEKS = {}) => Object.values(EXAM_TYPES).reduce((reports, examType) => {
  const domainReport = domainWeightedMastery(examType, masteryProfilesByTEKS);
  const benchmark = EXAM_BENCHMARKS[examType];
  const hasEvidence = domainReport.mastery != null;
  const score = hasEvidence ? scaledScore(examType, domainReport.mastery) : null;
  const universalThreshold = Number.isFinite(Number(benchmark.readinessThreshold)) ? Number(benchmark.readinessThreshold) : null;
  reports[examType] = {
    examTitle: examType === EXAM_TYPES.DIGITAL_SAT ? 'Digital SAT Math' : examType === EXAM_TYPES.ACT ? 'ACT Mathematics' : examType === EXAM_TYPES.TSIA2 ? 'TSIA2 Mathematics' : 'ASVAB Math Preparation',
    estimatedScore: score,
    scoreRange: score == null ? null : rangeFor(examType, score),
    readiness: score == null
      ? 'Not Enough Evidence'
      : universalThreshold == null
        ? 'No universal enlistment threshold'
        : examType === EXAM_TYPES.TSIA2
          ? score >= universalThreshold ? 'On Track for CRC benchmark' : 'Below CRC benchmark projection; Diagnostic Level 6 may also qualify'
          : score >= universalThreshold ? 'On Track' : 'Below Benchmark',
    isReady: score == null || universalThreshold == null ? null : score >= universalThreshold,
    benchmarkTarget: universalThreshold,
    alternativeDiagnosticLevel: benchmark.alternativeDiagnosticLevel || null,
    coveragePercent: Math.round(domainReport.coverageWeight * 100),
    confidence: domainReport.coverageWeight >= 0.75 ? 'moderate' : domainReport.coverageWeight >= 0.4 ? 'limited' : 'veryLimited',
    domains: domainReport.domains,
    estimateType: 'instructional_projection',
    disclaimer: examType === EXAM_TYPES.ASVAB
      ? 'This is a MathMaster math preparation index, not an AFQT score or enlistment qualification.'
      : examType === EXAM_TYPES.TSIA2
        ? 'Instructional CRC projection only; official TSIA2 math readiness can also be met with a CRC score below 950 plus Diagnostic Level 6.'
      : 'Instructional projection from MathMaster mastery evidence; not an official exam score conversion.',
  };
  return reports;
}, {});
