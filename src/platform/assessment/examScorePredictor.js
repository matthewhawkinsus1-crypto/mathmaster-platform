import { EXAM_BENCHMARKS, EXAM_DOMAIN_REGISTRY, EXAM_TYPES, mapTEKSToExamDomains } from './examDomainRegistry.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { finiteNumber } from '../utils/numeric.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const scaledScore = (examType, mastery) => {
  const benchmark = EXAM_BENCHMARKS[examType];
  return Math.round(benchmark.scoreMin + clamp(mastery, 0, 100) / 100 * (benchmark.scoreMax - benchmark.scoreMin));
};

const rangeBounds = (examType, score) => {
  const benchmark = EXAM_BENCHMARKS[examType];
  const margin = examType === EXAM_TYPES.DIGITAL_SAT ? 30 : examType === EXAM_TYPES.ACT ? 2 : examType === EXAM_TYPES.TSIA2 ? 15 : 7;
  return [clamp(score - margin, benchmark.scoreMin, benchmark.scoreMax), clamp(score + margin, benchmark.scoreMin, benchmark.scoreMax)];
};

const rangeFor = (examType, score) => {
  const [low, high] = rangeBounds(examType, score);
  return `${low} - ${high}`;
};

const examTitleFor = (examType) => (
  examType === EXAM_TYPES.DIGITAL_SAT ? 'Digital SAT Math'
    : examType === EXAM_TYPES.ACT ? 'ACT Mathematics'
      : examType === EXAM_TYPES.TSIA2 ? 'TSIA2 Mathematics'
        : 'ASVAB Math Preparation'
);

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
  // A missing threshold must stay null. Coerced to 0 it becomes a bar every
  // student clears, and the screen reports the whole class as exam-ready.
  const universalThreshold = finiteNumber(benchmark.readinessThreshold);
  reports[examType] = {
    examTitle: examTitleFor(examType),
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

/*
 * A PRACTICE TEST, READ ON THE REAL TEST'S SCALE — AS A RANGE, NEVER A SCORE.
 *
 * A released practice test is the most direct evidence MathMaster holds about
 * how a student might do on the real exam, and it is also thin: ten questions
 * is a fraction of a real SAT. So the estimate reads the share of points the
 * student earned on the same linear scale `predictExamScoresFromMastery` uses
 * (`scaledScore`), and reports a RANGE wide enough to be honest about how few
 * questions it rests on:
 *
 *   - the range is the Wilson score interval for that share at z = 1 — about a
 *     two-in-three chance the student's real share falls inside. Unlike
 *     "share ± one standard error", it does not shrink to a single number when
 *     a student gets every question right or every one wrong, which on a short
 *     test happens often and would be the most overconfident answer of all;
 *   - it is never narrower than the fixed margin the mastery projection uses
 *     (`rangeBounds`), so a long practice test cannot claim more precision than
 *     the predictor does anywhere else.
 *
 * The benchmark is the one EXAM_BENCHMARKS already holds (SAT Math 530, ACT
 * Math 22, TSIA2 CRC 950; the ASVAB has no single cut and gets none). Where the
 * range sits against it is reported as above, below, or `straddles` — the
 * honest answer when the benchmark falls inside the range — never as a pass.
 */
const PRACTICE_RANGE_Z = 1;

// Digital SAT section scores are reported in 10-point steps (200, 210, … 800),
// so a range edge is rounded OUTWARD to one. The other scales use whole numbers.
const SCORE_STEP = Object.freeze({ [EXAM_TYPES.DIGITAL_SAT]: 10 });

const wilsonInterval = (share, count, z = PRACTICE_RANGE_Z) => {
  const p = clamp(share, 0, 1);
  const z2 = z * z;
  const denominator = 1 + z2 / count;
  const center = (p + z2 / (2 * count)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / count + z2 / (4 * count * count))) / denominator;
  return { low: clamp(center - half, 0, 1), high: clamp(center + half, 0, 1) };
};

const PRACTICE_DISCLAIMERS = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: 'This is a MathMaster practice estimate, not an official SAT score.',
  [EXAM_TYPES.ACT]: 'This is a MathMaster practice estimate, not an official ACT score.',
  [EXAM_TYPES.TSIA2]: 'This is a MathMaster practice estimate, not an official TSIA2 score.',
  [EXAM_TYPES.ASVAB]: 'This is a MathMaster practice index, not an AFQT score or an enlistment qualification.',
});

/**
 * A practice test's result as an estimated range on the real exam's scale.
 *
 * `earnedPoints` / `possiblePoints` are the released review's own points, so
 * questions left blank count as zero exactly as they do in the score the
 * student sees. `questionCount` is the number of questions the test planned —
 * what the uncertainty rests on. Null when there is nothing to estimate from.
 */
export const predictExamScoreFromPracticeTest = ({ examType, earnedPoints, possiblePoints, questionCount } = {}) => {
  const benchmark = EXAM_BENCHMARKS[examType];
  if (!benchmark) return null;
  const earned = finiteNumber(earnedPoints);
  const possible = finiteNumber(possiblePoints);
  const count = Math.floor(finiteNumber(questionCount) ?? possible ?? 0);
  if (earned === null || possible === null || possible <= 0 || count < 1) return null;
  const share = clamp(earned / possible, 0, 1);
  const estimatedScore = scaledScore(examType, share * 100);
  const interval = wilsonInterval(share, count);
  const [fixedLow, fixedHigh] = rangeBounds(examType, estimatedScore);
  const step = SCORE_STEP[examType] || 1;
  const low = clamp(Math.floor(Math.min(scaledScore(examType, interval.low * 100), fixedLow) / step) * step, benchmark.scoreMin, benchmark.scoreMax);
  const high = clamp(Math.ceil(Math.max(scaledScore(examType, interval.high * 100), fixedHigh) / step) * step, benchmark.scoreMin, benchmark.scoreMax);
  // A missing threshold stays null (see predictExamScoresFromMastery): the
  // ASVAB has no universal cut, and a coerced 0 would read as "above it".
  const threshold = finiteNumber(benchmark.readinessThreshold);
  return {
    examType,
    examTitle: examTitleFor(examType),
    scoreMin: benchmark.scoreMin,
    scoreMax: benchmark.scoreMax,
    questionCount: count,
    shareEarned: share,
    estimatedScore,
    low,
    high,
    benchmarkTarget: threshold,
    benchmarkPosition: threshold === null ? null : low >= threshold ? 'above' : high < threshold ? 'below' : 'straddles',
    alternativeDiagnosticLevel: benchmark.alternativeDiagnosticLevel || null,
    estimateType: 'practice_test_projection',
    disclaimer: PRACTICE_DISCLAIMERS[examType],
  };
};
