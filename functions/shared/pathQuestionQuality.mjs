// Whether a Path question is a learning experience or merely a gradeable row.
//
// WHY THIS FILE GOT STRICTER. The starter bank passed every structural check
// there was: 515 documents, all with prompts, all with alignments, all with
// expected answers, all issuable by the server. The coverage screen read
// "Ready" for 97 standards. And 425 of those questions ended with the sentence
// "Type A, B, C, or D." — the options were typed into the prompt because the
// renderer had no way to show options, none of them carried a solution review,
// none used a MathMaster tool, and the five "families" for a standard were
// usually the same task with different numbers.
//
// Every one of those facts is invisible to a check that asks "are the required
// JSON keys present". So this audit asks the questions a teacher would:
//
//   * Is the interaction real, or is the student typing a letter?
//   * Is there anything to read after the question closes?
//   * Do the five families make a student think five different thoughts?
//   * Does the declared DOK match the task actually being asked?
//   * Is the mathematics rendered as mathematics?
//
// FIVE STATES, because "nothing", "broken", "thin", "unpolished" and "ready"
// need five different pieces of work from a human, and collapsing them into
// "ready / not ready" is what let a standard with five text boxes be called
// finished.

import { hintRevealsAnswer } from './pathSolutionSupport.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

export const QUESTION_QUALITY = Object.freeze({
  /** The server cannot issue this at all. */
  BLOCKED: 'blocked',
  /** Issuable and gradeable, but a placeholder: no real interaction, no review. */
  OPERATIONAL: 'operational',
  /** Most of the way there; something specific is still missing. */
  CANDIDATE: 'candidate',
  /** A question you would be happy for a student to meet. */
  PRODUCTION: 'production',
});

export const QUESTION_QUALITY_LABELS = Object.freeze({
  [QUESTION_QUALITY.BLOCKED]: 'Cannot be issued',
  [QUESTION_QUALITY.OPERATIONAL]: 'Placeholder only',
  [QUESTION_QUALITY.CANDIDATE]: 'Candidate',
  [QUESTION_QUALITY.PRODUCTION]: 'Production quality',
});

// --- Taxonomies ----------------------------------------------------------------
//
// A five-question session should not be five of the same thing. These are the
// two axes that make "different" mean something: what the student LOOKS at, and
// what they have to DO with it.

export const REPRESENTATIONS = Object.freeze([
  'symbolic', 'table', 'graph', 'numberLine', 'context', 'verbal',
  'diagram', 'orderedPairs', 'multipleRepresentation',
]);

export const TASK_TYPES = Object.freeze([
  'conceptual', 'procedural', 'application', 'interpretation', 'errorAnalysis',
  'comparison', 'modeling', 'reverseReasoning', 'representationTranslation', 'transfer',
]);

// Task types that can honestly carry DOK 3 or above. A DOK 3 label on a
// procedural item is the single most common way a bank overstates its own
// rigour — changing 8 to 36 does not make recall into reasoning.
const HIGHER_ORDER_TASKS = new Set([
  'errorAnalysis', 'comparison', 'modeling', 'reverseReasoning', 'transfer', 'interpretation',
]);

// --- Basic facts about a question ----------------------------------------------

export const declaredToolOf = (question = {}) => text(question.pathToolId || question.toolId || question.type) || null;

const hasAlignment = (question = {}) => (
  list(question.alignmentKeys).length > 0
  || Boolean(question.standard)
  || list(question.alignments).some((entry) => entry?.code)
);

// Keys that carry an answer key. The tool-specific ones matter: a number-line
// question's key is `expectedIntervals`, a relation's is its `pairs`, a linear
// system's is the system itself — and an audit that only looked for `expected`
// reported every tool-backed item as ungradeable.
const ANSWER_BEARING_KEYS = [
  'answer', 'correctAnswer', 'correctMatches', 'answerModel', 'acceptedAnswers',
  'expectedIntervals', 'intervals', 'expectedNotation', 'expectedInequality',
  'pairs', 'system', 'solution',
];

const hasExpectedAnswer = (question = {}) => {
  const tool = text(question.pathToolId || question.toolId || question.type);
  const serverDerivableToolAnswer = (
    tool === 'systemsWorkspace'
      && text(question.mode) === 'inequalities'
      && list(question.inequalities).length > 0
  ) || (
    ['dataModeling', 'dataModelingLab'].includes(tool)
      && list(question.points).length >= 2
  ) || (
    tool === 'graphing2'
      && (
        (text(question.mode) === 'throughPoints' && list(question.givenPoints).length >= 2)
        || (text(question.mode) === 'pointSlope' && Array.isArray(question.point) && question.slope !== undefined)
        || (text(question.mode) === 'standardForm' && question.standard)
        || (text(question.mode) === 'verticalHorizontal' && question.value !== undefined)
        || (text(question.mode || 'slopeIntercept') === 'slopeIntercept' && question.line)
      )
  );

  return (
    list(question.responseFields).some((field) => field && Object.prototype.hasOwnProperty.call(field, 'expected'))
    || ANSWER_BEARING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(question, key))
    || list(question.answerFields).some((field) => field && field.expected !== undefined)
    || list(question.parts).some((field) => field && field.expected !== undefined)
    || list(question.pointTasks).some((task) => Array.isArray(task?.expected))
    || list(question.analysisRequests).some((part) => part?.expected !== undefined || part?.acceptedAnswers !== undefined)
    || list(question.analysisParts).some((part) => part?.expected !== undefined || part?.acceptedAnswers !== undefined)
    || serverDerivableToolAnswer
  );
};

const looksInteractive = (question = {}) => Boolean(
  declaredToolOf(question)
  || list(question.studentActions).length
  || question.graph
  || question.function
  || question.relation
  || question.candidateGraphs
  || question.items,
);

/** Does this question offer real, selectable options? */
export const hasRealChoices = (question = {}) => (
  list(question.choices).length >= 2
  || list(question.responseFields).some((field) => list(field?.choices).length >= 2)
);

/** Does it have material to look at beyond a sentence? */
export const hasStimulus = (question = {}) => {
  const stimulus = question.stimulus;
  if (!stimulus || typeof stimulus !== 'object') return false;
  return Boolean(
    stimulus.graph
    || stimulus.table?.rows?.length
    || list(stimulus.orderedPairs).length
    || list(stimulus.steps).length
    || list(stimulus.expressions).length
    || list(stimulus.items).length,
  );
};

/**
 * How the student interacts. One of these, and only one, so a session can be
 * checked for variety without guessing.
 */
export const interactionOf = (question = {}) => {
  const tool = declaredToolOf(question);
  if (tool && tool !== 'response') return `tool:${tool}`;
  if (hasRealChoices(question)) return 'choice';
  const profiles = new Set(list(question.responseFields).map((field) => text(field?.inputProfile) || 'text'));
  if (profiles.size > 1 || list(question.responseFields).length > 1) return 'multiPart';
  const [profile] = [...profiles];
  if (!profile) return 'none';
  if (['number', 'numeric', 'integer', 'decimal'].includes(profile)) return 'numeric';
  if (['expression', 'symbolic', 'math'].includes(profile)) return 'expression';
  if (['equation', 'formula'].includes(profile)) return 'equation';
  if (['interval', 'intervalNotation'].includes(profile)) return 'interval';
  if (['inequality'].includes(profile)) return 'inequality';
  if (['orderedPair', 'ordered-pair', 'point'].includes(profile)) return 'orderedPair';
  return 'text';
};

/** What the student is looking at. Authored when known, inferred otherwise. */
export const representationOf = (question = {}) => {
  const declared = text(question.representation);
  if (REPRESENTATIONS.includes(declared)) return declared;
  if (question.stimulus?.table?.rows?.length) return 'table';
  if (list(question.stimulus?.orderedPairs).length) return 'orderedPairs';
  if (list(question.stimulus?.steps).length) return 'symbolic';
  if (question.graph || question.candidateGraphs || question.functionSpec) return 'graph';
  if (declaredToolOf(question) === 'intervalNumberLine') return 'numberLine';
  if (declaredToolOf(question) === 'relationMapping') return 'orderedPairs';
  if (question.context?.scenario) return 'context';
  return 'symbolic';
};

export const taskTypeOf = (question = {}) => {
  const declared = text(question.taskType);
  return TASK_TYPES.includes(declared) ? declared : null;
};

/**
 * The shape of a prompt with its numbers removed.
 *
 * Two items with the same shape inside one standard are the "five families"
 * that were really one family with five sets of numbers.
 */
export const promptShape = (question = {}) => text(question.prompt)
  .toLowerCase()
  .replace(/-?\d+(\.\d+)?/g, '#')
  .replace(/[^a-z#\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Options typed into the prompt. The tell that a bank was written against a
// renderer with no choice control.
const CHOICES_IN_PROMPT = /(^|\n)\s*[A-D]\s*[).]\s+\S/m;
const TYPE_A_LETTER = /type\s+(a|the letter)[\s,]/i;

// --- The audit ------------------------------------------------------------------

const addIssue = (issues, severity, code, message, deduction) => {
  issues.push({ severity, code, message, deduction });
};

const studentFacingStrings = (question = {}) => [
  question.prompt,
  question.scenario,
  question.context?.scenario,
  ...list(question.choices).map((choice) => (typeof choice === 'object' ? choice?.label : choice)),
  ...list(question.responseFields).flatMap((field) => [field?.label, field?.unit, field?.responseHint]),
].filter(Boolean).map(String);

const expectedValues = (question = {}) => [
  ...list(question.responseFields).map((field) => {
    if (text(field?.inputProfile) !== 'choice') return field?.expected;
    const choices = list(field?.choices).length ? list(field.choices) : list(question.choices);
    const expectedId = text(field?.expected);
    const choice = choices.find((entry) => text(
      typeof entry === 'object' ? (entry?.id ?? entry?.value) : entry,
    ) === expectedId);
    // Choice ids are internal routing keys, not student-facing answers. A hint
    // that happens to contain "no", "a" or "scale" must not be treated as an
    // answer leak unless it actually states the visible correct option.
    return choice && typeof choice === 'object' ? choice.label : choice;
  }),
  question.answer,
  question.correctAnswer,
].filter((value) => value !== undefined && value !== null).map((value) => String(value));

export const auditPathQuestionQuality = (question = {}) => {
  const issues = [];
  const prompt = text(question.prompt);
  const fields = list(question.responseFields);
  const tool = declaredToolOf(question);
  const usesTool = Boolean(tool && tool !== 'response');
  const choices = hasRealChoices(question);
  const interaction = interactionOf(question);
  const representation = representationOf(question);
  const taskType = taskTypeOf(question);
  // A PLACEHOLDER, precisely. Not "has response fields" — a numeric answer to a
  // well-posed question is real mathematics, and an interval or an expression a
  // student has to compose is more demanding than any click. What makes an item
  // a placeholder is that it is a bare `text` box with nothing to look at, no
  // options and no tool: the shape the whole starter bank had.
  const plainTextOnly = fields.length > 0
    && fields.every((field) => !text(field?.inputProfile) || text(field.inputProfile) === 'text');
  const fieldOnly = plainTextOnly && !looksInteractive(question) && !choices && !hasStimulus(question);

  // --- Blockers: this cannot go in front of a student -------------------------
  if (!prompt) addIssue(issues, 'blocker', 'missing-prompt', 'No student-facing prompt is present.', 40);
  else if (prompt.length < 18) addIssue(issues, 'warning', 'thin-prompt', 'The prompt is too short to be reliably clear without more context.', 12);

  if (!hasAlignment(question)) addIssue(issues, 'blocker', 'missing-alignment', 'No course/TEKS alignment is present.', 35);
  if (!hasExpectedAnswer(question)) addIssue(issues, 'blocker', 'missing-grading', 'No secure expected answer or grading definition is present.', 40);

  // The signature failure of the starter bank: the options live in the prompt
  // and the student is asked to type a letter. That is not multiple choice, it
  // is a spelling test about multiple choice.
  if (CHOICES_IN_PROMPT.test(prompt) && !choices) {
    addIssue(issues, 'blocker', 'choices-typed-into-prompt',
      'Answer options are written into the prompt instead of being real selectable choices.', 45);
  }
  if (TYPE_A_LETTER.test(prompt)) {
    addIssue(issues, 'blocker', 'asks-for-a-typed-letter',
      'The question asks the student to type a letter. Multiple choice must be a real interaction.', 45);
  }

  // Only fires when the prompt points AT a graph the student is supposed to be
  // looking at. A question that merely talks about graphs in general — "what is
  // true of the graph of every y = kx?" — is a legitimate conceptual item and
  // needs no picture; the earlier rule rejected those too, which pushed authors
  // towards avoiding the word rather than supplying the graph.
  const POINTS_AT_A_GRAPH = /\b(?:use|using|read|from|on|in)\s+the\s+(?:displayed\s+|shown\s+|given\s+|following\s+)?graph\b|\bthe\s+(?:displayed|shown|given|following)\s+graph\b|\bgraph\s+(?:below|above|shown)\b|\bcoordinate plane below\b/i;
  if (POINTS_AT_A_GRAPH.test(prompt)
      && !(question.graph || question.function || question.functionSpec || question.candidateGraphs || usesTool)) {
    addIssue(issues, 'blocker', 'missing-graph-representation',
      'The prompt points the student at a graph, but no graph representation is supplied.', 35);
  }

  // --- Warnings: real, but not finished ---------------------------------------
  if (fieldOnly) {
    addIssue(issues, 'warning', 'legacy-field-only',
      'This is a plain response box with nothing to look at and no choices. It provides coverage, not a MathMaster interaction.', 18);
  }

  if (/\b(table|tabular)\b/i.test(prompt) && !question.stimulus?.table && !usesTool && !question.tableData) {
    addIssue(issues, 'warning', 'missing-table-representation',
      'The prompt references a table but no table data travels with the question.', 14);
  }

  const facing = studentFacingStrings(question).join(' ');
  if (/\^[A-Za-z0-9({]/.test(facing) && !/\$[^$]*\^[^$]*\$/.test(facing)) {
    addIssue(issues, 'warning', 'ascii-exponent',
      'Student-facing math uses caret notation such as x^2 outside a math span, so it will render as code rather than mathematics.', 10);
  }

  if (fields.some((field) => !text(field?.label))) {
    addIssue(issues, 'warning', 'unlabeled-response', 'At least one response field has no meaningful student-facing label.', 8);
  }
  if (fields.length > 4) {
    addIssue(issues, 'warning', 'form-heavy', 'This item has many independent response boxes and may feel like a form rather than a mathematical interaction.', 8);
  }

  const solutionReview = question.solutionReview && typeof question.solutionReview === 'object' ? question.solutionReview : null;
  const reasoningLines = list(solutionReview?.reasoning).filter((line) => text(line)).length;
  if (!reasoningLines) {
    addIssue(issues, 'warning', 'missing-solution-support',
      'There is nothing to show the student once the question closes. A finalized question with no review teaches nothing.', 20);
  } else if (reasoningLines < 2) {
    addIssue(issues, 'warning', 'thin-solution-support',
      'The solution review is a single line. A review should carry the reasoning, not just the answer.', 8);
  }

  const answers = expectedValues(question);
  list(question.supportHints).forEach((hint) => {
    if (hintRevealsAnswer(hint, answers)) {
      addIssue(issues, 'blocker', 'hint-reveals-answer',
        'A hint contains the expected answer. That is an answer button wearing a hint label.', 40);
    }
  });

  if (!taskType) {
    addIssue(issues, 'warning', 'missing-task-type',
      'The item does not declare what kind of thinking it asks for, so session variety cannot be checked.', 10);
  }

  const dok = Number(question.dok) || 1;
  if (dok >= 3 && taskType && !HIGHER_ORDER_TASKS.has(taskType)) {
    addIssue(issues, 'warning', 'dok-overstated',
      `This is labelled DOK ${dok} but asks for a ${taskType} task. Changing the numbers does not raise the depth of knowledge.`, 15);
  }

  const boilerplate = /^(solve|simplify|evaluate|answer|find)\s+(the\s+)?(problem|question|expression)\.?$/i;
  if (boilerplate.test(prompt)) {
    addIssue(issues, 'warning', 'generic-prompt', 'The prompt is generic and does not communicate the mathematical task.', 15);
  }

  const deduction = issues.reduce((sum, issue) => sum + issue.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - deduction));
  const hasBlocker = issues.some((issue) => issue.severity === 'blocker');

  let level = QUESTION_QUALITY.CANDIDATE;
  if (hasBlocker) level = QUESTION_QUALITY.BLOCKED;
  else if (fieldOnly && !reasoningLines) level = QUESTION_QUALITY.OPERATIONAL;
  else if (reasoningLines >= 2 && taskType && (usesTool || choices || hasStimulus(question) || interaction !== 'text') && score >= 80) {
    level = QUESTION_QUALITY.PRODUCTION;
  }

  return {
    level,
    score,
    fieldOnly,
    usesTool,
    toolId: usesTool ? tool : null,
    interaction,
    representation,
    taskType,
    dok,
    difficultyBand: Number(question.difficultyBand) || 3,
    hasChoices: choices,
    hasSolutionReview: reasoningLines > 0,
    solutionReasoningLines: reasoningLines,
    issues,
    blockers: issues.filter((issue) => issue.severity === 'blocker'),
    warnings: issues.filter((issue) => issue.severity !== 'blocker'),
    // Kept so the older three-state callers keep working.
    legacyLevel: hasBlocker ? 'blocked' : (level === QUESTION_QUALITY.PRODUCTION ? 'ready' : 'candidate'),
  };
};

/**
 * Families inside one standard that are really the same question.
 *
 * Same prompt shape AND same interaction AND same representation is the
 * definition used, deliberately conservative: two genuinely different tasks can
 * share a sentence pattern, but three matching axes is a rewrite with new
 * numbers.
 */
export const detectDuplicateFamilies = (questions = []) => {
  const buckets = new Map();
  list(questions).forEach((question) => {
    const audit = auditPathQuestionQuality(question);
    const key = [promptShape(question), audit.interaction, audit.representation].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(question.id || question.familyId || '(unidentified)');
  });
  return [...buckets.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ shape: key.split('|')[0], ids, count: ids.length }));
};

export const summarizePathBankQuality = (questions = []) => {
  const audits = list(questions).map((question) => ({ question, audit: auditPathQuestionQuality(question) }));
  const counts = audits.reduce((acc, entry) => {
    acc[entry.audit.level] = (acc[entry.audit.level] || 0) + 1;
    return acc;
  }, {
    [QUESTION_QUALITY.PRODUCTION]: 0,
    [QUESTION_QUALITY.CANDIDATE]: 0,
    [QUESTION_QUALITY.OPERATIONAL]: 0,
    [QUESTION_QUALITY.BLOCKED]: 0,
  });
  return {
    total: audits.length,
    production: counts[QUESTION_QUALITY.PRODUCTION],
    candidate: counts[QUESTION_QUALITY.CANDIDATE],
    operational: counts[QUESTION_QUALITY.OPERATIONAL],
    blocked: counts[QUESTION_QUALITY.BLOCKED],
    // The old field names, so existing dashboards keep rendering.
    ready: counts[QUESTION_QUALITY.PRODUCTION],
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
    `Quality status: ${QUESTION_QUALITY_LABELS[audit.level] || audit.level}`,
    `Quality score: ${audit.score}/100`,
    `Interaction: ${audit.interaction} · Representation: ${audit.representation} · Task: ${audit.taskType || 'undeclared'}`,
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
