import { getQuestionCredit, normalizeQuestionRecord } from './attemptPolicy.js';
import {
  getQuestionPrimaryTeksCodes,
  normalizeQuestionInstructionalMetadata,
} from './questionMetadata.js';
import { getTexasStandard, TEXAS_PERFORMANCE_LEVELS } from './texasStandards.js';
import { resolveDOLQuestionIndices } from './assignmentLifecycle.js';
import { getEffectiveActivityPolicy, resolveQuestionActivityRole } from './platform/policies/activityPolicies.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, places = 1) => Number(Number(value || 0).toFixed(places));

const DOK_WEIGHT = { 1: 0.9, 2: 1, 3: 1.1, 4: 1.15 };
const CLASSIFICATION_WEIGHT = { readiness: 1.1, supporting: 1, content: 1, process: 0.45 };

const EVIDENCE_LEVEL_WEIGHT = {
  introduced: 0.25,
  practiced: 0.6,
  assessed: 1,
  masteryEvidence: 1.1,
  prerequisite: 0.5,
};

const getRecencyWeight = (value) => {
  if (!value) return 1;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 1;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
  if (ageDays <= 45) return 1;
  if (ageDays <= 90) return 0.95;
  if (ageDays <= 180) return 0.85;
  return 0.75;
};

const usedMathematicalAssistance = (supportUsage = {}) => supportUsage.isMathematicallyIndependent === false
  || Boolean(supportUsage.hintUsed)
  || Boolean(supportUsage.teacherAssisted)
  || Boolean(supportUsage.scaffoldUsed)
  || Boolean(supportUsage.remediationUsed)
  || Boolean(supportUsage.workedExampleUsed);

const makeLevel = (key) => TEXAS_PERFORMANCE_LEVELS.find((item) => item.key === key) || null;

export const estimateInstructionalPerformanceLevel = ({
  score = 0,
  itemCount = 0,
  effectiveEvidence = 0,
  maxDok = null,
  highDokEvidenceCount = 0,
  // How many of the successes the student produced without the platform
  // supplying the mathematical idea. `null` means the caller has not measured
  // it, and the ceiling below is skipped rather than guessed at.
  independentSuccesses = null,
} = {}) => {
  if (itemCount < 2 || effectiveEvidence < 1.1) {
    return {
      key: 'insufficient',
      label: 'Insufficient Evidence',
      shortLabel: 'Insufficient',
      score: round(score),
      ceilingReason: null,
    };
  }

  let key = score >= 85 ? 'masters' : score >= 70 ? 'meets' : score >= 55 ? 'approaches' : 'didNotMeet';
  let ceilingReason = null;

  // MathMaster deliberately does not award an estimated Masters label from only
  // low-complexity evidence. This is an instructional safeguard, not a STAAR rule.
  if (key === 'masters' && (!(maxDok >= 3) || highDokEvidenceCount < 1 || itemCount < 4)) {
    key = 'meets';
    ceilingReason = 'Masters estimate requires at least one DOK 3+ item and a broader evidence set.';
  }

  // The same safeguard, on the axis that matters most. A student whose every
  // success arrived with a hint attached has shown they can follow the idea,
  // not that they can produce it — and the top label is a claim about the
  // second thing.
  if (key === 'masters' && independentSuccesses !== null && independentSuccesses < 2) {
    key = 'meets';
    ceilingReason = 'Masters estimate requires successes the student produced without mathematical assistance.';
  }

  const definition = makeLevel(key);
  return {
    ...definition,
    score: round(score),
    ceilingReason,
  };
};

export const estimateConfidence = ({ itemCount = 0, effectiveEvidence = 0, dokLevels = [] } = {}) => {
  const uniqueDok = new Set(dokLevels.filter(Boolean));
  if (itemCount >= 8 && effectiveEvidence >= 5 && uniqueDok.size >= 2) return 'High';
  if (itemCount >= 4 && effectiveEvidence >= 2.4) return 'Medium';
  return 'Low';
};

export const recommendGeneratorBand = ({ levelKey, score, confidence } = {}) => {
  if (!levelKey || levelKey === 'insufficient') return 3;
  if (levelKey === 'didNotMeet') return 1;
  if (levelKey === 'approaches') return 2;
  if (levelKey === 'meets') return 3;
  if (levelKey === 'masters') return Number(score) >= 93 && confidence === 'High' ? 5 : 4;
  return 3;
};

const resolveQuestionEvidenceWeight = ({ question, assignment, standardEntry, record, questionIndex }) => {
  const metadata = normalizeQuestionInstructionalMetadata(question, assignment);
  const standard = getTexasStandard(standardEntry.code);
  const dok = metadata.complexity.level;
  const modified = Boolean(record.supportUsage?.modified);
  // The support discount used to live in the WEIGHT, which put it in both the
  // numerator and the denominator of the estimate — so for a correct answer it
  // cancelled out entirely and a fully-supported student scored the same as an
  // independent one. It belongs on the CREDIT instead: a supported success is
  // still evidence (it stays in the denominator at full weight), it is just
  // worth less than doing it yourself.
  const supported = usedMathematicalAssistance(record.supportUsage);
  const classificationFactor = CLASSIFICATION_WEIGHT[standard?.classification] || 1;
  const evidenceLevelFactor = EVIDENCE_LEVEL_WEIGHT[standardEntry.level] || 1;
  const dokFactor = DOK_WEIGHT[dok] || 0.9;
  const recency = getRecencyWeight(record.lastAttemptAt || record.recordedAt);
  const base = Number(metadata.evidenceWeight) || 0;
  const dolEnabled = assignment?.dol?.enabled ?? assignment?.assignmentType === 'practice';
  const activityRole = resolveQuestionActivityRole({
    question,
    assignment,
    isDOL: Boolean(dolEnabled && resolveDOLQuestionIndices(assignment).includes(questionIndex)),
  });
  const activityPolicy = getEffectiveActivityPolicy(activityRole);
  const activityEvidenceWeight = Math.max(0, Number(activityPolicy.mastery.evidenceWeight) || 0);

  return {
    rawWeight: base,
    gradeLevelWeight: modified ? 0 : base * activityEvidenceWeight * classificationFactor * evidenceLevelFactor * dokFactor * recency,
    modifiedWeight: modified ? base * activityEvidenceWeight * classificationFactor * evidenceLevelFactor * dokFactor * recency : 0,
    // Deliberately below the Mastered threshold. No number of successes that
    // needed the platform to supply the mathematical idea adds up to a claim
    // that the student can do it.
    creditFactor: supported ? SUPPORTED_CREDIT : 1,
    supported,
    activityRole,
    activityEvidenceWeight,
    activityEvidenceType: activityPolicy.mastery.evidenceType,
    metadata,
    standard,
  };
};

export const collectStudentEvidence = ({ student, assignments = [] } = {}) => {
  const evidence = [];
  const gradesByAssignment = student?.gradesByAssignment || {};

  // A DEFAULT PARAMETER ONLY CATCHES `undefined`. A student document has a NULL
  // assignments list before the first fetch resolves, and that threw here rather
  // than degrading to "no evidence yet" — a blank teacher roster instead of a
  // roster that fills in a moment later. studentPathOptions already coerced at
  // its own boundary for exactly this reason; the coercion belongs here, where
  // the iteration is.
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    if (assignment?.evidencePolicy?.masteryEligible === false) return;
    const assignmentGrades = gradesByAssignment?.[assignment.id];
    if (!assignmentGrades || !Array.isArray(assignment.questions)) return;

    assignment.questions.forEach((question, questionIndex) => {
      if (question?.teacherExcluded === true) return;
      const record = normalizeQuestionRecord(assignmentGrades?.[questionIndex]);
      if (record.status === 'unattempted' && record.totalAttempts <= 0) return;
      const metadata = normalizeQuestionInstructionalMetadata(question, assignment);
      const primary = metadata.standards.primary;
      if (!primary.length) return;

      primary.forEach((standardEntry) => {
        const weights = resolveQuestionEvidenceWeight({ question, assignment, standardEntry, record, questionIndex });
        evidence.push({
          studentId: student?.id || '',
          assignmentId: assignment.id,
          assignmentTitle: assignment.title || '',
          questionIndex,
          questionId: question.questionId || '',
          questionType: question.type || '',
          teks: standardEntry.code,
          teksLevel: standardEntry.level,
          courseId: weights.standard?.courseId || standardEntry.courseId || null,
          course: weights.standard?.course || '',
          reportingCategory: weights.standard?.reportingCategory ?? null,
          classification: weights.standard?.classification || 'unknown',
          dok: metadata.complexity.level,
          instructionalLevel: metadata.difficulty.instructionalLevel,
          generatorBand: metadata.difficulty.generatorBand,
          purpose: metadata.purpose,
          evidenceWeight: metadata.evidenceWeight,
          activityRole: weights.activityRole,
          activityEvidenceWeight: weights.activityEvidenceWeight,
          activityEvidenceType: weights.activityEvidenceType,
          gradeLevelWeight: weights.gradeLevelWeight,
          modifiedWeight: weights.modifiedWeight,
          credit: getQuestionCredit(record) * (weights.creditFactor ?? 1),
          supported: Boolean(weights.supported),
          independentSuccess: getQuestionCredit(record) >= 1 && !weights.supported,
          percentCredit: Math.round(getQuestionCredit(record) * 100),
          totalAttempts: record.totalAttempts,
          firstAttemptCorrect: record.status === 'correct' && record.totalAttempts === 1,
          eventuallyCorrect: record.status === 'correct',
          modified: Boolean(record.supportUsage?.modified),
          scaffoldUsed: Boolean(record.supportUsage?.scaffoldUsed),
          hintUsed: Boolean(record.supportUsage?.hintUsed),
          teacherAssisted: Boolean(record.supportUsage?.teacherAssisted),
          remediationUsed: Boolean(record.supportUsage?.remediationUsed),
          workedExampleUsed: Boolean(record.supportUsage?.workedExampleUsed),
          contextScaffoldUsed: Boolean(record.supportUsage?.contextScaffoldUsed),
          calculatorUsed: Boolean(record.supportUsage?.calculatorUsed),
          isMathematicallyIndependent: !usedMathematicalAssistance(record.supportUsage),
          accommodations: record.supportUsage?.accommodations || [],
          modifications: record.supportUsage?.modifications || [],
          lastAttemptAt: record.lastAttemptAt || null,
        });
      });
    });
  });

  return evidence;
};

// How much a success is worth when the platform supplied the mathematical
// idea. Shared with the server aggregator in functions/index.js, which applies
// the same figure the same way.
export const SUPPORTED_CREDIT = 0.75;

const summarizeEvidenceRows = (rows, { includeModified = false } = {}) => {
  const applicable = rows.filter((row) => includeModified ? row.modifiedWeight > 0 : row.gradeLevelWeight > 0);
  const weightKey = includeModified ? 'modifiedWeight' : 'gradeLevelWeight';
  const totalWeight = applicable.reduce((sum, row) => sum + Number(row[weightKey] || 0), 0);
  const weightedScore = totalWeight > 0
    ? applicable.reduce((sum, row) => sum + row.credit * Number(row[weightKey] || 0), 0) / totalWeight * 100
    : 0;
  const firstAttemptRows = applicable.filter((row) => row.totalAttempts > 0);
  const firstAttemptRate = firstAttemptRows.length
    ? firstAttemptRows.filter((row) => row.firstAttemptCorrect).length / firstAttemptRows.length * 100
    : 0;
  const eventualRate = firstAttemptRows.length
    ? firstAttemptRows.filter((row) => row.eventuallyCorrect).length / firstAttemptRows.length * 100
    : 0;
  // Counted so a downstream label can require that the student did some of
  // this unaided, rather than inferring it from an average.
  const independentSuccesses = applicable.filter((row) => row.independentSuccess).length;
  const supportedEvidenceCount = applicable.filter((row) => row.supported).length;
  const maxDok = applicable.reduce((max, row) => Math.max(max, Number(row.dok) || 0), 0) || null;
  const highDokEvidenceCount = applicable.filter((row) => Number(row.dok) >= 3).length;
  const dokLevels = applicable.map((row) => row.dok).filter(Boolean);
  const confidence = estimateConfidence({ itemCount: applicable.length, effectiveEvidence: totalWeight, dokLevels });
  const performance = estimateInstructionalPerformanceLevel({
    score: weightedScore,
    itemCount: applicable.length,
    effectiveEvidence: totalWeight,
    maxDok,
    highDokEvidenceCount,
    independentSuccesses,
  });

  return {
    itemCount: applicable.length,
    effectiveEvidence: round(totalWeight, 2),
    score: round(weightedScore),
    independentSuccesses,
    supportedEvidenceCount,
    firstAttemptCorrectRate: round(firstAttemptRate),
    eventualCorrectRate: round(eventualRate),
    averageAttempts: applicable.length
      ? round(applicable.reduce((sum, row) => sum + Number(row.totalAttempts || 0), 0) / applicable.length, 2)
      : 0,
    maxDok,
    dokLevels: [...new Set(dokLevels)].sort(),
    highDokEvidenceCount,
    confidence,
    performance,
    recommendedGeneratorBand: recommendGeneratorBand({
      levelKey: performance.key,
      score: weightedScore,
      confidence,
    }),
  };
};

export const buildStudentMasteryProfile = ({ student, assignments = [] } = {}) => {
  const evidence = collectStudentEvidence({ student, assignments });
  const byTeksRows = new Map();
  evidence.forEach((row) => {
    if (!byTeksRows.has(row.teks)) byTeksRows.set(row.teks, []);
    byTeksRows.get(row.teks).push(row);
  });

  const teks = {};
  [...byTeksRows.entries()].forEach(([code, rows]) => {
    const gradeLevel = summarizeEvidenceRows(rows);
    const modified = summarizeEvidenceRows(rows, { includeModified: true });
    const standard = getTexasStandard(code);
    teks[code] = {
      code,
      description: standard?.description || '',
      courseId: standard?.courseId || rows[0]?.courseId || null,
      course: standard?.course || rows[0]?.course || '',
      classification: standard?.classification || rows[0]?.classification || 'unknown',
      reportingCategory: standard?.reportingCategory ?? rows[0]?.reportingCategory ?? null,
      ...gradeLevel,
      modifiedEvidence: modified,
    };
  });

  const overall = summarizeEvidenceRows(evidence);
  const modifiedOverall = summarizeEvidenceRows(evidence, { includeModified: true });
  const primaryCodes = Object.keys(teks);
  const readinessCodes = primaryCodes.filter((code) => getTexasStandard(code)?.classification === 'readiness');
  const supportingCodes = primaryCodes.filter((code) => getTexasStandard(code)?.classification === 'supporting');

  // Preserve a course-specific view so a student can move between Algebra I and
  // Algebra II evidence without blending the two into a misleading single score.
  const courseIds = [...new Set(evidence.map((row) => row.courseId).filter(Boolean))];
  const courses = Object.fromEntries(courseIds.map((courseId) => {
    const courseEvidence = evidence.filter((row) => row.courseId === courseId);
    const courseTeks = Object.fromEntries(Object.entries(teks).filter(([, summary]) => summary.courseId === courseId));
    const codes = Object.keys(courseTeks);
    return [courseId, {
      courseId,
      course: courseEvidence[0]?.course || '',
      evidenceCount: courseEvidence.length,
      overall: summarizeEvidenceRows(courseEvidence),
      modifiedOverall: summarizeEvidenceRows(courseEvidence, { includeModified: true }),
      teks: courseTeks,
      readinessCodes: codes.filter((code) => getTexasStandard(code)?.classification === 'readiness'),
      supportingCodes: codes.filter((code) => getTexasStandard(code)?.classification === 'supporting'),
      contentCodes: codes.filter((code) => getTexasStandard(code)?.classification === 'content'),
      processCodes: codes.filter((code) => getTexasStandard(code)?.classification === 'process'),
    }];
  }));

  return {
    studentId: student?.id || '',
    classPeriod: student?.classPeriod || 'Unassigned',
    evidenceCount: evidence.length,
    metadataCoveragePercent: (() => {
      let attemptedQuestions = 0;
      let taggedQuestions = 0;
      (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
        if (assignment?.evidencePolicy?.masteryEligible === false) return;
        const assignmentGrades = student?.gradesByAssignment?.[assignment.id];
        if (!assignmentGrades) return;
        assignment.questions?.forEach((question, index) => {
          const record = normalizeQuestionRecord(assignmentGrades[index]);
          if (record.status === 'unattempted' && record.totalAttempts <= 0) return;
          attemptedQuestions += 1;
          if (getQuestionPrimaryTeksCodes(question).length) taggedQuestions += 1;
        });
      });
      return attemptedQuestions ? Math.round(taggedQuestions / attemptedQuestions * 100) : 0;
    })(),
    overall,
    modifiedOverall,
    teks,
    readinessCodes,
    supportingCodes,
    courses,
    adaptiveInstruction: {
      generatorBand: overall.recommendedGeneratorBand || 3,
      performanceLevel: overall.performance?.key || 'insufficient',
      confidence: overall.confidence,
      byTeks: Object.fromEntries(Object.entries(teks).map(([code, summary]) => [code, {
        courseId: summary.courseId,
        generatorBand: summary.recommendedGeneratorBand,
        performanceLevel: summary.performance.key,
        score: summary.score,
        confidence: summary.confidence,
      }])),
    },
  };
};

export const buildClassMasteryProfiles = ({ students = [], assignments = [] } = {}) => (
  (Array.isArray(students) ? students : []).map((student) => buildStudentMasteryProfile({ student, assignments }))
);

export const getObservedDifficultyLabel = (firstAttemptCorrectRate, responseCount) => {
  if (responseCount < 5) return 'Not enough data';
  const rate = Number(firstAttemptCorrectRate) || 0;
  if (rate >= 80) return 'Low observed difficulty';
  if (rate >= 60) return 'Moderate observed difficulty';
  if (rate >= 40) return 'High observed difficulty';
  return 'Very high observed difficulty';
};

export const buildItemAnalytics = ({ students = [], assignments = [] } = {}) => {
  // Null, not just undefined — see collectStudentEvidence.
  const safeStudents = Array.isArray(students) ? students : [];
  const rows = [];
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    if (assignment?.evidencePolicy?.analyticsEligible === false) return;
    assignment.questions?.forEach((question, questionIndex) => {
      if (question?.teacherExcluded === true) return;
      const metadata = normalizeQuestionInstructionalMetadata(question, assignment);
      const records = safeStudents.map((student) => ({
        student,
        record: normalizeQuestionRecord(student?.gradesByAssignment?.[assignment.id]?.[questionIndex]),
      })).filter(({ record }) => record.status !== 'unattempted' || record.totalAttempts > 0);
      const responseCount = records.length;
      const firstCorrect = records.filter(({ record }) => record.status === 'correct' && record.totalAttempts === 1).length;
      const eventualCorrect = records.filter(({ record }) => record.status === 'correct').length;
      const firstAttemptCorrectRate = responseCount ? firstCorrect / responseCount * 100 : 0;
      const eventualCorrectRate = responseCount ? eventualCorrect / responseCount * 100 : 0;
      const averageAttempts = responseCount
        ? records.reduce((sum, { record }) => sum + Number(record.totalAttempts || 0), 0) / responseCount
        : 0;
      const averageCredit = responseCount
        ? records.reduce((sum, { record }) => sum + getQuestionCredit(record), 0) / responseCount * 100
        : 0;
      const modifiedResponses = records.filter(({ record }) => record.supportUsage?.modified).length;

      rows.push({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title || '',
        questionIndex,
        questionNumber: questionIndex + 1,
        questionId: question.questionId || '',
        type: question.type || '',
        primaryTeks: metadata.standards.primary.map((entry) => entry.code),
        courseIds: [...new Set(metadata.standards.primary.map((entry) => getTexasStandard(entry.code)?.courseId || entry.courseId).filter(Boolean))],
        primaryCourse: (() => {
          const first = metadata.standards.primary[0];
          const standard = first ? getTexasStandard(first.code) : null;
          return standard?.course || '';
        })(),
        dok: metadata.complexity.level,
        intendedDifficulty: metadata.difficulty.instructionalLevel,
        generatorBand: metadata.difficulty.generatorBand,
        purpose: metadata.purpose,
        responseCount,
        modifiedResponses,
        firstAttemptCorrectRate: round(firstAttemptCorrectRate),
        eventualCorrectRate: round(eventualCorrectRate),
        averageAttempts: round(averageAttempts, 2),
        averageCredit: round(averageCredit),
        observedDifficultyIndex: responseCount ? round(100 - firstAttemptCorrectRate) : null,
        observedDifficultyLabel: getObservedDifficultyLabel(firstAttemptCorrectRate, responseCount),
      });
    });
  });
  return rows;
};

export const buildStandardsExportPayload = ({ students = [], assignments = [] } = {}) => ({
  generatedAt: new Date().toISOString(),
  framework: 'Texas TEKS + MathMaster instructional mastery estimate',
  disclaimer: 'Estimated performance levels are local instructional estimates and are not official STAAR classifications or scale scores.',
  students: (Array.isArray(students) ? students : []).map((student) => ({
    ...buildStudentMasteryProfile({ student, assignments }),
    evidence: collectStudentEvidence({ student, assignments }),
  })),
  itemAnalytics: buildItemAnalytics({ students, assignments }),
});
