import { teacherFlagNeedsReview } from './assignmentAuthoringState.js';
import {
  reviewContextForQuestion,
  teacherRepairConstraintsForQuestion,
} from './teacherReviewContext.js';

const clean = (value) => String(value ?? '').trim();
const normalizedSeverity = (value) => clean(value).toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);

const sectionsFrom = (assignmentV5 = {}) => (
  Array.isArray(assignmentV5?.sections) ? assignmentV5.sections : []
);

const questionRowsFrom = (assignmentV5 = {}) => {
  const rows = [];
  let questionIndex = 0;

  sectionsFrom(assignmentV5).forEach((section, sectionIndex) => {
    const sectionId = clean(section?.id || section?.sectionId) || `section-${sectionIndex + 1}`;
    const sectionRole = clean(section?.role);
    const questions = Array.isArray(section?.questions) ? section.questions : [];

    questions.forEach((question, localQuestionIndex) => {
      rows.push({
        questionIndex,
        questionNumber: questionIndex + 1,
        localQuestionIndex,
        sectionIndex,
        sectionId,
        sectionRole,
        sectionTitle: clean(section?.title),
        questionId: clean(question?.questionId) || null,
        question,
      });
      questionIndex += 1;
    });
  });

  return rows;
};

const diagnosticMatchesRow = (diagnostic, row) => {
  const diagnosticQuestionId = clean(diagnostic?.questionId);
  if (diagnosticQuestionId && row.questionId) return diagnosticQuestionId === row.questionId;

  const diagnosticIndex = Number(diagnostic?.questionIndex);
  if (Number.isInteger(diagnosticIndex) && diagnosticIndex >= 0) {
    return diagnosticIndex === row.questionIndex;
  }

  const diagnosticNumber = Number(diagnostic?.questionNumber);
  return Number.isInteger(diagnosticNumber) && diagnosticNumber === row.questionNumber;
};

const activeFlagsForRow = (teacherReviewContext, row) => (
  reviewContextForQuestion(teacherReviewContext, {
    sectionId: row.sectionId,
    questionId: row.questionId,
  }).filter(teacherFlagNeedsReview)
);

const directQuestionFlags = (flags, questionId) => (
  flags.filter((flag) => (
    clean(flag?.scope).toLowerCase() === 'question'
    && clean(flag?.targetId) === clean(questionId)
  ))
);

const hardConstraintsForRow = (teacherReviewContext, row) => (
  teacherRepairConstraintsForQuestion(teacherReviewContext, {
    sectionId: row.sectionId,
    questionId: row.questionId,
  }).map((flag) => ({
    source: 'teacher',
    flagId: clean(flag?.id) || null,
    scope: clean(flag?.scope) || 'question',
    category: clean(flag?.category) || 'general',
    severity: clean(flag?.severity) || 'needsEditing',
    note: clean(flag?.note),
    hardConstraint: true,
  }))
);

const statusFor = (automatedFindings, teacherFlags) => {
  const automatedBlocking = automatedFindings.some((finding) => (
    ['blocking', 'error'].includes(normalizedSeverity(finding?.severity))
  ));
  const teacherBlocking = teacherFlags.some((flag) => normalizedSeverity(flag?.severity) === 'blocking');

  if (automatedBlocking || teacherBlocking) return 'needsRepair';

  const automatedWarning = automatedFindings.some((finding) => normalizedSeverity(finding?.severity) === 'warning');
  if (automatedWarning || teacherFlags.length > 0) return 'warning';

  return 'passed';
};

const platformIssueDiagnostics = (teacherReviewContext = {}) => list(teacherReviewContext?.platformIssues)
  .map((issue, index) => {
    const resolved = clean(issue?.status) === 'resolvedByPlatformUpdate';
    return {
      source: 'runtimeCompatibility',
      code: resolved
        ? `platform.resolved.${clean(issue?.resolvedRepairKey) || index}`
        : `platform.reported.${clean(issue?.repairKey) || index}`,
      severity: resolved ? 'warning' : 'blocking',
      issueKind: resolved ? 'resolvedPlatformIssue' : 'platformIssue',
      questionId: clean(issue?.questionId) || null,
      componentId: clean(issue?.suspectedComponent) || null,
      repairKey: clean(issue?.repairKey) || null,
      message: resolved
        ? `Resolved by platform update${issue?.resolvedRepairKey ? ` (${issue.resolvedRepairKey})` : ''}. The authored question was not rewritten.`
        : clean(issue?.reason) || 'MathMaster has a reported platform defect for this question. Do not rewrite correct authored content to work around it.',
      persistedPlatformIssue: true,
    };
  });

/**
 * Build the single question-level view MathMaster can use for Assignment Review.
 *
 * Automated validation, durable platform reports, and teacher review are merged
 * here instead of becoming three competing repair systems. Stable questionId is
 * the primary join key; the flat index remains only as a migration fallback.
 */
export const buildAssignmentRepairCenterModel = ({
  assignmentV5 = {},
  diagnostics = [],
  teacherReviewContext = null,
} = {}) => {
  const safeDiagnostics = [
    ...(Array.isArray(diagnostics) ? diagnostics.filter(Boolean) : []),
    ...platformIssueDiagnostics(teacherReviewContext),
  ];
  const baseRows = questionRowsFrom(assignmentV5);

  const questions = baseRows.map((row) => {
    const automatedFindings = safeDiagnostics.filter((diagnostic) => diagnosticMatchesRow(diagnostic, row));
    const teacherFlags = activeFlagsForRow(teacherReviewContext, row);
    const directTeacherFlags = directQuestionFlags(teacherFlags, row.questionId);
    const teacherConstraints = hardConstraintsForRow(teacherReviewContext, row);

    return {
      ...row,
      automatedFindings,
      teacherFlags,
      directTeacherFlags,
      teacherConstraints,
      status: statusFor(automatedFindings, teacherFlags),
      isTeacherFlagged: directTeacherFlags.length > 0,
      hasTeacherContext: teacherFlags.length > 0,
    };
  });

  const matchedDiagnostics = new Set(
    questions.flatMap((row) => row.automatedFindings),
  );
  const globalFindings = safeDiagnostics.filter((diagnostic) => !matchedDiagnostics.has(diagnostic));

  return {
    summary: {
      totalQuestions: questions.length,
      passed: questions.filter((row) => row.status === 'passed').length,
      needsRepair: questions.filter((row) => row.status === 'needsRepair').length,
      warnings: questions.filter((row) => row.status === 'warning').length,
      teacherFlagged: questions.filter((row) => row.isTeacherFlagged).length,
    },
    questions,
    globalFindings,
  };
};

export default buildAssignmentRepairCenterModel;
