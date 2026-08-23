import { normalizeQuestionInstructionalMetadata } from '../../questionMetadata.js';
import { generateStableId } from '../../utils/idUtils.js';
import { toCanonicalKey } from '../../utils/teksUtils.js';
import { describeAdaptation } from '../assignments/assignmentAdaptation.js';

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const supportTelemetryFromUsage = (supportUsage = {}) => {
  const telemetry = [];
  (supportUsage.accommodations || []).forEach((supportType) => telemetry.push({
    stage: 'presented',
    supportType: String(supportType),
    reducesMathematicalIndependence: false,
  }));
  (supportUsage.modifications || []).forEach((supportType) => telemetry.push({
    stage: 'presented',
    supportType: `modification:${supportType}`,
    reducesMathematicalIndependence: true,
  }));

  const usedFlags = [
    ['hintUsed', 'hint', true],
    ['teacherAssisted', 'teacherAssistance', true],
    ['scaffoldUsed', 'mathScaffold', true],
    ['contextScaffoldUsed', 'contextScaffold', false],
    ['remediationUsed', 'remediation', true],
    ['workedExampleUsed', 'workedExample', true],
    ['calculatorUsed', 'calculator', false],
  ];
  usedFlags.forEach(([key, supportType, reducesMathematicalIndependence]) => {
    if (!supportUsage[key]) return;
    telemetry.push({ stage: 'used', supportType, reducesMathematicalIndependence });
  });
  return telemetry;
};

export const buildAttemptEvidenceEvent = ({
  studentId,
  assignment,
  question,
  questionIndex,
  activityRole,
  attemptRecord,
  attemptResult,
  supportUsage = {},
  occurredAt = Date.now(),
  // WHAT THE STUDENT ACTUALLY RECEIVED.
  //
  // The snapshot below used to read DOK and difficulty off the question
  // TEMPLATE. That is not what the student answered: per-band content profiles
  // could already substitute a different band, and adaptive assignments move
  // the band deliberately. A student could answer the Band 2 version and have
  // Band 3 recorded — and these events are the input to every mastery profile,
  // so every DOK and difficulty conclusion downstream was drawn from what the
  // question claimed rather than from what was delivered.
  //
  // Supplied by `resolveDeliveredQuestionMetadata`. Absent means "not adapted",
  // and the template values stand.
  delivered = null,
}) => {
  const metadata = normalizeQuestionInstructionalMetadata(question || {}, assignment || {});
  const declaredEvidenceKeys = Array.isArray(question?.masteryEvidenceKeys) ? question.masteryEvidenceKeys : [];
  const standardKeys = metadata.standards.primary.map((entry) => entry.code);
  const alignmentKeys = unique([...declaredEvidenceKeys, ...standardKeys].map(toCanonicalKey));
  const attemptNumber = Math.max(1, Number(attemptRecord?.totalAttempts || attemptRecord?.attemptCount) || 1);
  const variantIndex = Math.max(0, Number(attemptRecord?.variantIndex) || 0);
  const questionId = String(question?.questionId || question?.id || `question-${Number(questionIndex) + 1}`);
  const questionInstanceId = generateStableId(
    'qi',
    studentId,
    assignment?.id || 'assignment',
    questionId,
    variantIndex,
  );
  const eventKey = generateStableId('ev', questionInstanceId, attemptNumber);
  const partialCredit = Number(attemptResult?.partialCredit ?? attemptRecord?.partialCredit ?? 0);
  const score = attemptResult?.isCorrect ? 1 : Math.max(0, Math.min(1, partialCredit / 100));

  return {
    schemaVersion: 1,
    eventKey,
    studentId: String(studentId || ''),
    occurredAt: Number(occurredAt) || Date.now(),
    alignmentKeys,
    masteryEvidenceKeys: alignmentKeys,
    questionSnapshot: {
      questionInstanceId,
      questionId,
      familyId: String(question?.familyId || question?.toolId || question?.type || 'question'),
      familyVersion: Number(question?.familyVersion) || 1,
      questionType: String(question?.questionType || question?.type || question?.toolId || 'question'),
      difficultyBand: Number.isFinite(Number(delivered?.difficultyBand))
        ? Number(delivered.difficultyBand)
        : metadata.difficulty.generatorBand,
      dok: Number.isFinite(Number(delivered?.dok)) ? Number(delivered.dok) : metadata.complexity.level,
      // Kept beside the delivered values rather than replacing them: a teacher
      // asking "was this the version I assigned?" needs both numbers.
      assignedDifficultyBand: metadata.difficulty.generatorBand,
      assignedDok: metadata.complexity.level,
      adapted: Boolean(delivered?.adapted),
      variantIndex,
    },
    // The reason, stored with the evidence, so it survives the session that
    // produced it. Null when nothing was adapted.
    adaptation: delivered?.adapted ? {
      reasonCode: delivered.reasonCode || delivered.target?.reason || null,
      // Falls back to the target's own description rather than storing null.
      // This field was silently empty for every adapted question because it
      // depended entirely on a caller populating it; it now degrades to the
      // engine's own words instead of to nothing.
      reason: delivered.reason || describeAdaptation(delivered.target) || null,
      mode: delivered.target?.policy?.mode || null,
      standardPreserved: true,
    } : null,
    source: {
      kind: 'assignment',
      assignmentId: String(assignment?.id || ''),
      assignmentTitle: String(assignment?.title || ''),
      activityRole: String(activityRole || 'practice'),
      activitySessionId: String(assignment?.id || ''),
      questionIndex: Number(questionIndex) || 0,
    },
    performance: {
      score,
      isCorrect: Boolean(attemptResult?.isCorrect),
      attemptNumber,
      status: String(attemptRecord?.status || attemptResult?.status || 'attempted'),
      partialCredit: Math.max(0, Math.min(100, partialCredit)),
      isMathematicallyIndependent: supportUsage.isMathematicallyIndependent !== false,
    },
    supportUsage: {
      modified: Boolean(supportUsage.modified),
      accommodations: Array.isArray(supportUsage.accommodations) ? supportUsage.accommodations.slice(0, 20) : [],
      modifications: Array.isArray(supportUsage.modifications) ? supportUsage.modifications.slice(0, 20) : [],
      hintUsed: Boolean(supportUsage.hintUsed),
      teacherAssisted: Boolean(supportUsage.teacherAssisted),
      scaffoldUsed: Boolean(supportUsage.scaffoldUsed),
      contextScaffoldUsed: Boolean(supportUsage.contextScaffoldUsed),
      remediationUsed: Boolean(supportUsage.remediationUsed),
      workedExampleUsed: Boolean(supportUsage.workedExampleUsed),
      calculatorUsed: Boolean(supportUsage.calculatorUsed),
      isMathematicallyIndependent: supportUsage.isMathematicallyIndependent !== false,
    },
    supportTelemetry: supportTelemetryFromUsage(supportUsage),
  };
};
