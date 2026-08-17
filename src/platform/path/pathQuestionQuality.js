const list = (value) => (Array.isArray(value) ? value : []);

const studentFacingStrings = (question = {}) => [
  question.prompt,
  question.scenario,
  question.context?.scenario,
  ...list(question.responseFields).flatMap((field) => [field?.label, field?.unit]),
].filter(Boolean).map(String);

const hasAlignment = (question = {}) => (
  list(question.alignmentKeys).length > 0
  || Boolean(question.standard)
  || list(question.alignments).some((entry) => entry?.code)
);

const hasExpectedAnswer = (question = {}) => (
  list(question.responseFields).some((field) => field && Object.prototype.hasOwnProperty.call(field, 'expected'))
  || Object.prototype.hasOwnProperty.call(question, 'answer')
  || Object.prototype.hasOwnProperty.call(question, 'correctAnswer')
  || Object.prototype.hasOwnProperty.call(question, 'correctMatches')
  || Object.prototype.hasOwnProperty.call(question, 'answerModel')
);

const looksInteractive = (question = {}) => Boolean(
  question.pathToolId
  || question.toolId
  || question.tool
  || list(question.studentActions).length
  || question.graph
  || question.function
  || question.relation
  || question.candidateGraphs
  || question.items
);

const addIssue = (issues, severity, code, message, deduction) => {
  issues.push({ severity, code, message, deduction });
};

export const auditPathQuestionQuality = (question = {}) => {
  const issues = [];
  const prompt = String(question.prompt || '').trim();
  const fields = list(question.responseFields);
  const fieldOnly = fields.length > 0 && !looksInteractive(question);

  if (!prompt) addIssue(issues, 'blocker', 'missing-prompt', 'No student-facing prompt is present.', 40);
  else if (prompt.length < 18) addIssue(issues, 'warning', 'thin-prompt', 'The prompt is too short to be reliably clear without more context.', 12);

  if (!hasAlignment(question)) addIssue(issues, 'blocker', 'missing-alignment', 'No course/TEKS alignment is present.', 35);
  if (!hasExpectedAnswer(question)) addIssue(issues, 'blocker', 'missing-grading', 'No secure expected answer or grading definition is present.', 40);

  if (fieldOnly) {
    addIssue(
      issues,
      'warning',
      'legacy-field-only',
      'This is a legacy field-only starter item. It provides coverage, but it is not yet a rich MathMaster interaction.',
      18,
    );
  }

  const facing = studentFacingStrings(question).join(' ');
  if (/\^[A-Za-z0-9({]/.test(facing)) {
    addIssue(issues, 'warning', 'ascii-exponent', 'Student-facing math uses caret notation such as x^2 instead of rendered/Unicode math.', 8);
  }
  if (/\b(graph|graphed|coordinate plane)\b/i.test(prompt)
      && !(question.graph || question.function || question.candidateGraphs || question.tool || question.pathToolId)) {
    addIssue(issues, 'blocker', 'missing-graph-representation', 'The prompt asks the student to use a graph but no graph/function representation is supplied.', 35);
  }
  if (/\b(table|tabular)\b/i.test(prompt)
      && !(question.table || question.tableData || question.answerModel?.tableXValues || question.tool || question.pathToolId)) {
    addIssue(issues, 'warning', 'missing-table-representation', 'The prompt references a table but no explicit table data/tool payload is visible in the bank record.', 14);
  }

  if (fields.some((field) => !String(field?.label || '').trim())) {
    addIssue(issues, 'warning', 'unlabeled-response', 'At least one response field has no meaningful student-facing label.', 8);
  }
  if (fields.length > 4) {
    addIssue(issues, 'warning', 'form-heavy', 'This item has many independent response boxes and may feel like a form rather than a mathematical interaction.', 8);
  }

  const hasSolutionSupport = Boolean(
    question.solution
    || question.solutionReview
    || question.explanation
    || list(question.solutionSteps).length
    || list(question.hints).length
  );
  if (!hasSolutionSupport) {
    addIssue(issues, 'warning', 'missing-solution-support', 'No solution explanation, worked review, or meaningful hint content is stored with this item.', 12);
  }

  const boilerplate = /^(solve|simplify|evaluate|answer|find)\s+(the\s+)?(problem|question|expression)\.?$/i;
  if (boilerplate.test(prompt)) {
    addIssue(issues, 'warning', 'generic-prompt', 'The prompt is generic and does not communicate the mathematical task clearly enough.', 15);
  }

  const deduction = issues.reduce((sum, issue) => sum + issue.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - deduction));
  const hasBlocker = issues.some((issue) => issue.severity === 'blocker');
  const level = hasBlocker ? 'blocked' : (!fieldOnly && hasSolutionSupport && score >= 80 ? 'ready' : 'candidate');

  return {
    level,
    score,
    fieldOnly,
    issues,
    blockers: issues.filter((issue) => issue.severity === 'blocker'),
    warnings: issues.filter((issue) => issue.severity !== 'blocker'),
  };
};

export const summarizePathBankQuality = (questions = []) => {
  const audits = list(questions).map((question) => ({ question, audit: auditPathQuestionQuality(question) }));
  const counts = audits.reduce((acc, entry) => {
    acc[entry.audit.level] += 1;
    return acc;
  }, { ready: 0, candidate: 0, blocked: 0 });
  return {
    total: audits.length,
    ...counts,
    averageScore: audits.length
      ? Math.round(audits.reduce((sum, entry) => sum + entry.audit.score, 0) / audits.length)
      : 0,
    audits,
  };
};

export const buildPathQuestionRevisionBrief = (question = {}, audit = auditPathQuestionQuality(question)) => {
  const expected = list(question.responseFields)
    .filter((field) => Object.prototype.hasOwnProperty.call(field || {}, 'expected'))
    .map((field) => `${field.label || field.id || 'Answer'}: ${String(field.expected)}`);

  return [
    '# MathMaster Path Question Revision Brief',
    '',
    `Bank ID: ${question.id || 'unknown'}`,
    `Family: ${question.familyId || question.questionType || 'unknown'}`,
    `Quality status: ${audit.level}`,
    `Quality score: ${audit.score}/100`,
    '',
    '## Current prompt',
    String(question.prompt || '(missing)'),
    '',
    '## Secure expected answer(s)',
    ...(expected.length ? expected : ['No responseField expectations were found.']),
    '',
    '## Required revisions',
    ...(audit.issues.length
      ? audit.issues.map((issue) => `- [${issue.severity}] ${issue.message}`)
      : ['- No automatic quality issues were detected.']),
    '',
    '## Current secure bank JSON',
    '```json',
    JSON.stringify(question, null, 2),
    '```',
    '',
    'Revise this into a polished MathMaster Path question without changing the intended standard or mathematical skill. Prefer an authentic interactive MathMaster tool when the mathematics benefits from one. Preserve secure grading and add a useful solution review.',
  ].join('\n');
};

export default auditPathQuestionQuality;
