/*
 * THE END-OF-SESSION RECAP: WHAT A STUDENT MISSED, AND HOW IT WORKS.
 *
 * A Path question shows its worked solution the moment it closes, one question
 * at a time, and then the student presses Next and it is gone. By the end of a
 * five-question round nobody remembers question two. The recap is the list a
 * student can actually study from: each question they missed (or got partly
 * right), as they saw it, with their answer, the correct answer and the worked
 * solution.
 *
 * THE RULES, and each is a rule because its opposite is a real failure:
 *
 *   1. ONLY CLOSED ITEMS ARE RECORDED. The submit path writes an entry when an
 *      item's FINAL attempt is graded (correct, or out of attempts) and never
 *      before, so nothing here can describe a question that is still open.
 *
 *   2. ONLY A COMPLETED SESSION RELEASES ITS RECAP. Status "completed", the
 *      same server fact the weekly count reads. An active or paused session is
 *      refused even though its closed items' reviews were already shown one at
 *      a time: the recap is the end of the work, not a second channel into it.
 *
 *   3. ONLY THE STUDENT'S OWN SESSION. A session that belongs to someone else
 *      reads exactly like one that does not exist.
 *
 *   4. ONLY MISSED OR PARTLY CREDITED ITEMS. A question answered correctly is
 *      not something to review.
 *
 *   5. THE QUESTION AS THE STUDENT SAW IT. Entries are built from the sanitized
 *      public payload, never from the private grading definition. The answer
 *      key is read for one thing only — the "correct answer" line — and only
 *      because it is released after the item is closed and the session is over.
 *
 * Pure: no Firestore, no clock. Shared by the Cloud Function (the submit path
 * that records entries and the callable that releases them), the Teacher Path
 * Simulator's runtime, and the tests.
 */

export const PATH_RECAP_ENTRY_VERSION = 1;

// An entry is one question's display copy. Graph stimuli are the heaviest part
// (up to four curves of 129 points); the cap keeps a submission document far
// inside Firestore's 1 MB limit, and an oversize entry sheds its stimulus
// before it is ever refused.
export const PATH_RECAP_MAX_JSON = 40000;

export const PATH_RECAP_REFUSAL = Object.freeze({
  NOT_FOUND: 'not-found',
  NOT_FINISHED: 'failed-precondition',
});

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const clampText = (value, max = 400) => text(value).slice(0, max);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const wholeNumber = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : null);
const unit = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const CHOICE_PROFILES = new Set(['choice', 'multiplechoice', 'multiple-choice', 'select']);

const choiceView = (choices) => list(choices).slice(0, 12)
  .map((choice) => ({ id: clampText(choice?.id, 120), label: clampText(choice?.label, 400) }))
  .filter((choice) => choice.id && choice.label);

/**
 * The question as the student saw it, by allowlist, from the PUBLIC payload.
 * A tool question keeps its prompt and tool id; its interactive workspace is
 * not reproduced here.
 */
export const recapQuestionView = (publicQuestion = {}) => {
  const question = isObject(publicQuestion) ? publicQuestion : {};
  const tool = isObject(question.tool) ? question.tool : {};
  return {
    prompt: clampText(question.prompt || tool.prompt, 2000),
    formulaLatex: clampText(question.formulaLatex, 400) || null,
    scenario: clampText(question.context?.scenario || tool.context?.scenario, 1500) || null,
    stimulus: isObject(question.stimulus) ? question.stimulus : null,
    choices: choiceView(question.choices),
    responseFields: list(question.responseFields).slice(0, 12).map((field, index) => ({
      id: clampText(field?.id, 120) || `response-${index + 1}`,
      label: clampText(field?.label, 200) || `Response ${index + 1}`,
      inputProfile: clampText(field?.inputProfile, 40).toLowerCase() || 'text',
      unit: clampText(field?.unit, 40) || null,
      ...(Array.isArray(field?.choices) ? { choices: choiceView(field.choices) } : {}),
    })),
    pathToolId: clampText(question.pathToolId, 60) || null,
  };
};

// The renderer's own fallback: a question with no response fields is answered
// in one box, which is a choice when the question has options.
const fieldsOf = (view) => (view.responseFields.length
  ? view.responseFields
  : [{ id: 'answer', label: 'Answer', inputProfile: view.choices.length ? 'choice' : 'text' }]);

/**
 * One value, ready to show: a choice id becomes its label and a typed word
 * stays a word. `format` tells the screen how to draw it: 'text' is plain,
 * 'math' is LaTeX (what the student's math editor submits), and 'rich' is
 * prose that may hold $…$ math or ASCII notation such as `x<=4` (a choice
 * label, an authored answer key).
 */
const displayValue = (field, value, view, { typedFormat = 'math' } = {}) => {
  if (value === null || value === undefined || isObject(value) || Array.isArray(value)) return null;
  const raw = clampText(value, 400);
  if (!raw) return null;
  const choices = field.choices?.length ? field.choices : view.choices;
  if (CHOICE_PROFILES.has(field.inputProfile) && choices.length) {
    const chosen = choices.find((choice) => choice.id === raw);
    return chosen ? { label: field.label, value: chosen.label, format: 'rich' } : null;
  }
  return { label: field.label, value: raw, format: field.inputProfile === 'text' ? 'text' : typedFormat };
};

const TOOL_ANSWER_KEYS = ['finalEquation', 'finalRelation', 'value', 'answer', 'equation', 'expression'];

const toolAnswer = (raw = {}) => {
  const x = Number(raw.x ?? raw.point?.[0]);
  const y = Number(raw.y ?? raw.point?.[1]);
  if ((raw.x !== undefined || Array.isArray(raw.point)) && Number.isFinite(x) && Number.isFinite(y)) return `(${x}, ${y})`;
  const key = TOOL_ANSWER_KEYS.find((candidate) => ['string', 'number'].includes(typeof raw[candidate]) && text(raw[candidate]));
  return key ? clampText(raw[key], 400) : null;
};

/**
 * What the student gave, as display strings — never the raw payload, which is
 * untrusted client input. A tool answer is summarized when it is a single
 * value or point; a construction (a graph, a mapping) is named, not redrawn.
 */
export const describeRecapResponse = (view, responsePayload) => {
  const payload = isObject(responsePayload) ? responsePayload : {};
  if (isObject(payload.responses)) {
    const entries = fieldsOf(view)
      .map((field) => displayValue(field, payload.responses[field.id], view))
      .filter(Boolean);
    return { kind: entries.length ? 'fields' : 'none', entries };
  }
  if (isObject(payload.raw)) {
    const answer = toolAnswer(payload.raw);
    return {
      kind: 'tool',
      entries: answer ? [{ label: 'Your answer', value: answer, format: 'rich' }] : [],
    };
  }
  return { kind: 'none', entries: [] };
};

/**
 * The correct answer, from the private grading definition, for a closed item.
 * Field-graded items show each field's expected value (a choice as its label);
 * a tool item shows a single expected value when it has one. Anything richer
 * — a graph, a set of arrows — is left to the authored worked solution.
 */
export const describeRecapCorrectAnswer = (view, privateGrading) => {
  if (!isObject(privateGrading)) return [];
  if (privateGrading.pathToolId) {
    const definition = isObject(privateGrading.definition) ? privateGrading.definition : {};
    const expected = ['expected', 'solution'].map((key) => definition[key])
      .find((value) => ['string', 'number'].includes(typeof value) && text(value));
    return expected === undefined ? [] : [{ label: 'Answer', value: clampText(expected, 400), format: 'rich' }];
  }
  const fields = fieldsOf(view);
  return list(privateGrading.fields).map((graded) => {
    // A grading field the public payload does not name is shown under a
    // generic label rather than borrowing another field's.
    const field = fields.find((candidate) => candidate.id === String(graded?.id))
      || { id: String(graded?.id || 'answer'), label: 'Answer', inputProfile: view.choices.length ? 'choice' : 'text' };
    // An answer key is authored notation, not editor LaTeX.
    return displayValue(field, graded?.expected ?? list(graded?.accepted)[0], view, { typedFormat: 'rich' });
  }).filter(Boolean);
};

const reviewView = (review) => {
  if (!isObject(review)) return null;
  const view = {
    headline: clampText(review.headline, 160) || null,
    reasoning: list(review.reasoning).map((line) => clampText(line, 400)).filter(Boolean).slice(0, 8),
    answerSummary: clampText(review.answerSummary, 240) || null,
    commonError: clampText(review.commonError, 400) || null,
    connection: clampText(review.connection, 400) || null,
  };
  return view.headline || view.reasoning.length || view.answerSummary || view.commonError || view.connection
    ? view
    : null;
};

/**
 * One closed question's recap entry. Called when its final attempt has been
 * graded; `grading` is that attempt's verdict.
 *
 * `publicQuestion` is the payload the student was handed, and their answer is
 * read against it. `answerKeyQuestion` is the item in the grading definition's
 * own id space — on the server, the stored item, whose choice ids are the ones
 * `privateGrading` names — and the correct answer is read against it. They are
 * the same object wherever the two id spaces agree (the simulator).
 */
export const buildPathRecapEntry = ({
  sessionId = '',
  questionInstanceId = '',
  questionNumber = null,
  skillCode = null,
  closedAt = null,
  publicQuestion = {},
  answerKeyQuestion = null,
  privateGrading = null,
  responsePayload = null,
  grading = {},
  solutionReview = null,
} = {}) => {
  const question = recapQuestionView(publicQuestion);
  const answerKeyView = answerKeyQuestion ? recapQuestionView(answerKeyQuestion) : question;
  const isCorrect = grading?.isCorrect === true;
  return {
    v: PATH_RECAP_ENTRY_VERSION,
    sessionId: clampText(sessionId, 180),
    questionInstanceId: clampText(questionInstanceId, 180),
    questionNumber: wholeNumber(questionNumber),
    skillCode: clampText(skillCode, 40) || null,
    closedAt: Number.isFinite(Number(closedAt)) ? Number(closedAt) : null,
    question,
    response: describeRecapResponse(question, responsePayload),
    correctAnswer: describeRecapCorrectAnswer(answerKeyView, privateGrading),
    grading: {
      isCorrect,
      score: isCorrect ? 1 : unit(grading?.score),
      attemptNumber: wholeNumber(grading?.attemptNumber),
      attemptsAllowed: wholeNumber(grading?.attemptsAllowed),
    },
    solutionReview: reviewView(solutionReview),
  };
};

/**
 * The entry as ONE JSON string, which is how it is stored: a stimulus can
 * nest arrays, which Firestore refuses, and a string cannot. Sheds the
 * stimulus, then the scenario and options, before giving up. Never throws — a
 * recap must never be what fails a student's graded answer.
 */
export const serializePathRecapEntry = (entry, { maxLength = PATH_RECAP_MAX_JSON } = {}) => {
  try {
    if (!isObject(entry)) return null;
    const attempts = [
      entry,
      { ...entry, question: { ...entry.question, stimulus: null, stimulusOmitted: Boolean(entry.question?.stimulus) } },
      { ...entry, question: { ...entry.question, stimulus: null, stimulusOmitted: Boolean(entry.question?.stimulus), scenario: null, choices: [], responseFields: [] } },
    ];
    for (const candidate of attempts) {
      const json = JSON.stringify(candidate);
      if (json.length <= maxLength) return json;
    }
    return null;
  } catch {
    return null;
  }
};

/** A stored entry, or null for anything that is not one. */
export const parsePathRecapEntry = (json) => {
  if (typeof json !== 'string' || !json) return null;
  try {
    const entry = JSON.parse(json);
    return isObject(entry) && entry.v === PATH_RECAP_ENTRY_VERSION && text(entry.questionInstanceId) ? entry : null;
  } catch {
    return null;
  }
};

/** Missed, or only partly credited. */
export const isMissedRecapEntry = (entry) => isObject(entry) && entry.grading?.isCorrect !== true;

/**
 * Who may read a session's recap, and when. The callable throws the refusal as
 * an HttpsError with this code; a foreign session and a missing one are the
 * same answer, so the refusal reveals nothing about someone else's work.
 */
export const pathRecapAccess = ({ session = null, studentId = null } = {}) => {
  if (!isObject(session) || !text(studentId) || text(session.studentId) !== text(studentId)) {
    return { allowed: false, code: PATH_RECAP_REFUSAL.NOT_FOUND, message: 'That My Math Path session is not available.' };
  }
  if (session.status !== 'completed') {
    return {
      allowed: false,
      code: PATH_RECAP_REFUSAL.NOT_FINISHED,
      message: 'The review of this session opens once the session is finished.',
    };
  }
  return { allowed: true, code: null, message: null };
};

const recapItem = (entry) => ({
  questionInstanceId: entry.questionInstanceId,
  questionNumber: entry.questionNumber ?? null,
  skillCode: entry.skillCode || null,
  outcome: Number(entry.grading?.score) > 0 ? 'partial' : 'missed',
  score: unit(entry.grading?.score),
  attemptsUsed: entry.grading?.attemptNumber ?? null,
  attemptsAllowed: entry.grading?.attemptsAllowed ?? null,
  question: {
    prompt: entry.question?.prompt || '',
    formulaLatex: entry.question?.formulaLatex || null,
    scenario: entry.question?.scenario || null,
    stimulus: isObject(entry.question?.stimulus) ? entry.question.stimulus : null,
    stimulusOmitted: entry.question?.stimulusOmitted === true,
    pathToolId: entry.question?.pathToolId || null,
  },
  response: {
    kind: entry.response?.kind || 'none',
    entries: list(entry.response?.entries),
  },
  correctAnswer: list(entry.correctAnswer),
  solutionReview: reviewView(entry.solutionReview),
});

/**
 * The recap of one session: its missed and partly credited questions, in the
 * order they were asked. Refuses (available: false) unless the session is
 * completed, whatever the caller already checked.
 */
export const buildPathSessionRecap = ({ session = null, entries = [] } = {}) => {
  if (!isObject(session) || session.status !== 'completed') {
    return { available: false, reason: 'session-not-finished', items: [] };
  }
  const sessionId = text(session.sessionId);
  // One entry per question — the closing attempt — even if a stored duplicate
  // ever exists.
  const byQuestion = new Map();
  list(entries).forEach((entry) => {
    if (!isObject(entry) || entry.v !== PATH_RECAP_ENTRY_VERSION || !text(entry.questionInstanceId)) return;
    if (sessionId && text(entry.sessionId) && text(entry.sessionId) !== sessionId) return;
    const prior = byQuestion.get(entry.questionInstanceId);
    if (!prior || Number(entry.grading?.attemptNumber || 0) >= Number(prior.grading?.attemptNumber || 0)) {
      byQuestion.set(entry.questionInstanceId, entry);
    }
  });
  const closed = [...byQuestion.values()].sort((a, b) => (
    (Number(a.questionNumber) || Infinity) - (Number(b.questionNumber) || Infinity)
    || (Number(a.closedAt) || 0) - (Number(b.closedAt) || 0)
  ));
  const items = closed.filter(isMissedRecapEntry).map(recapItem);
  const completedQuestions = Number(session.summary?.completedQuestions || 0);
  return {
    available: true,
    completedQuestions,
    reviewedQuestions: closed.length,
    // Questions finished before entries were recorded (a session that spans a
    // deploy) have nothing to show; the screen says so instead of implying
    // they were right.
    missingQuestions: Math.max(0, completedQuestions - closed.length),
    allCorrect: closed.length > 0 && items.length === 0 && closed.length >= completedQuestions,
    items,
  };
};

export default buildPathSessionRecap;
