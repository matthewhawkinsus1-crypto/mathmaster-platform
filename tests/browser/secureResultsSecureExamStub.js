/*
 * The secure-exam callables, stubbed for the results harness (secureResults.mjs).
 *
 * Every review here is in the shape `secureExam.publicReview` returns — the
 * same fields, the same meanings (unanswered items worth zero, `solution`
 * null for a session graded before solutions were stored, plan weights on a
 * course Test) — so the screen is measured on data the product produces.
 * Nothing here reaches a network; the driver also blocks every non-local
 * request.
 */

const released = (examSessionId, examType, title, requiredQuestions) => ({
  examSessionId, examType, title, status: 'submitted', feedbackReleased: true, requiredQuestions,
  releasePolicy: examType === 'courseTest' ? 'teacher' : 'automatic', timed: false, timeLimitSeconds: null,
});

const field = (id = 'answer', label = 'Answer') => ({ id, label, inputProfile: 'number' });

const courseItems = [
  {
    questionInstanceId: 'ct-1', position: 0, alignmentKeys: ['texas:A.5A'], targetId: 't-eq', planWeight: 1, assessmentDomainId: null,
    unanswered: false, pathToolId: null, questionType: 'response', grading: { score: 1, isCorrect: true },
    responsePayload: { responses: { answer: '7' } },
    questionSnapshot: { prompt: 'Solve $4x - 7 = 21$ for $x$.', responseFields: [field()], choices: [] },
    solution: {
      answers: [{ fieldId: 'answer', label: 'Answer', display: '7' }],
      review: {
        headline: 'Undo the operations in reverse order.',
        reasoning: ['Add $7$ to both sides: $4x = 28$.', 'Divide both sides by $4$: $x = 7$.'],
        commonError: 'Dividing by 4 before adding 7 leaves a fraction you then have to fix.',
        connection: 'Each step keeps the two sides balanced.',
        answerSummary: '$x = 7$',
      },
    },
  },
  {
    questionInstanceId: 'ct-2', position: 1, alignmentKeys: ['texas:A.5A'], targetId: 't-eq-dok2', planWeight: 1, assessmentDomainId: null,
    unanswered: false, pathToolId: null, questionType: 'multipleChoice', grading: { score: 0, isCorrect: false },
    responsePayload: { responses: { answer: 'c_1' } },
    questionSnapshot: {
      prompt: 'Which expression is equivalent to $3(x + 2)$?',
      responseFields: [{ id: 'answer', label: 'Choose one' }],
      choices: [{ id: 'c_1', label: '$3x + 2$' }, { id: 'c_2', label: '$3x + 6$' }, { id: 'c_3', label: '$x + 6$' }],
    },
    solution: {
      answers: [{ fieldId: 'answer', label: 'Choose one', display: '$3x + 6$' }],
      review: {
        headline: 'Multiply 3 by EVERY term inside the parentheses.',
        reasoning: ['$3 \\cdot x = 3x$', '$3 \\cdot 2 = 6$', 'So $3(x + 2) = 3x + 6$.'],
        commonError: 'Multiplying only the first term gives $3x + 2$.',
        connection: null,
        answerSummary: '$3x + 6$',
      },
    },
  },
  {
    questionInstanceId: 'ct-3', position: 2, alignmentKeys: ['texas:A.3B'], targetId: 't-slope', planWeight: 1, assessmentDomainId: null,
    unanswered: true, pathToolId: null, questionType: 'response', grading: { score: 0, isCorrect: false },
    responsePayload: { responses: {} },
    questionSnapshot: { prompt: 'A table shows $(1, 2)$, $(2, 5)$ and $(3, 8)$. What is the rate of change?', responseFields: [field('answer', 'Rate of change')], choices: [] },
    solution: {
      answers: [{ fieldId: 'answer', label: 'Rate of change', display: '3' }],
      review: { headline: 'Change in y over change in x.', reasoning: ['$y$ goes up by $3$ each time $x$ goes up by $1$.', '$\\frac{3}{1} = 3$'], commonError: null, connection: null, answerSummary: '$3$' },
    },
  },
  {
    questionInstanceId: 'ct-4', position: 3, alignmentKeys: ['texas:A.3B'], targetId: 't-slope-graph', planWeight: 1, assessmentDomainId: null,
    unanswered: false, pathToolId: 'graphing2', questionType: 'graph', grading: { score: 0.5, isCorrect: false },
    responsePayload: { rawJson: JSON.stringify({ points: [[0, 1], [2, 4]] }) },
    questionSnapshot: { prompt: 'Graph the line with slope $2$ through $(0, 1)$.', pathToolId: 'graphing2' },
    solution: {
      answers: [],
      review: {
        headline: 'Start at the y-intercept, then use rise over run.',
        reasoning: ['Plot $(0, 1)$.', 'Slope $2$ means up $2$ for every $1$ to the right: $(1, 3)$.'],
        commonError: 'Running 2 and rising 1 draws slope $\\frac{1}{2}$ instead of $2$.',
        connection: null,
        answerSummary: 'A line through $(0, 1)$ and $(1, 3)$.',
      },
    },
  },
  {
    // Graded before worked solutions were stored.
    questionInstanceId: 'ct-5', position: 4, alignmentKeys: ['texas:A.2A'], targetId: 't-domain', planWeight: 1, assessmentDomainId: null,
    unanswered: false, pathToolId: null, questionType: 'response', grading: { score: 1, isCorrect: true },
    responsePayload: { responses: { answer: 'all real numbers' } },
    questionSnapshot: { prompt: 'What is the domain of $f(x) = 2x + 1$?', responseFields: [field('answer', 'Domain')], choices: [] },
    solution: null,
  },
  {
    questionInstanceId: 'ct-6', position: 5, alignmentKeys: ['texas:A.2A'], targetId: 't-domain-dok3', planWeight: 2.5, assessmentDomainId: null,
    unanswered: false, pathToolId: null, questionType: 'response', grading: { score: 1, isCorrect: true },
    responsePayload: { responses: { answer: '0 ≤ t ≤ 8' } },
    questionSnapshot: { prompt: 'A tank drains for $8$ hours. Write a reasonable domain for the time $t$.', responseFields: [field('answer', 'Domain')], choices: [] },
    solution: { answers: [{ fieldId: 'answer', label: 'Domain', display: '$0 \\le t \\le 8$' }], review: { headline: 'Time starts at 0 and stops when the tank is empty.', reasoning: ['$t$ cannot be negative.', 'After $8$ hours there is nothing left to drain.'], commonError: null, connection: null, answerSummary: '$0 \\le t \\le 8$' } },
  },
  {
    // Typed in the secure math editor (SecureMathAnswerField): what it stores
    // for 3/4 is the editor's LaTeX (tests/platform/fixtures/secureAnswerRoundTrip.json).
    questionInstanceId: 'ct-7', position: 6, alignmentKeys: ['texas:A.3B'], targetId: 't-slope-table', planWeight: 1, assessmentDomainId: null,
    unanswered: false, pathToolId: null, questionType: 'response', grading: { score: 1, isCorrect: true },
    responsePayload: { responses: { answer: '\\frac34' } },
    questionSnapshot: { prompt: 'A ramp rises $3$ feet over $4$ feet. What is its slope?', responseFields: [field('answer', 'Slope')], choices: [] },
    solution: { answers: [{ fieldId: 'answer', label: 'Slope', display: '3/4' }], review: { headline: 'Slope is rise over run.', reasoning: ['Rise $3$, run $4$: $\\frac{3}{4}$.'], commonError: null, connection: null, answerSummary: '$\\frac{3}{4}$' } },
  },
];

const satItems = [
  ['algebra', 'texas:A.5A', true], ['advancedMath', 'texas:A.10E', false], ['algebra', 'texas:A.2C', false],
  ['problemSolvingData', 'texas:A.8A', true], ['advancedMath', 'texas:A2.4F', true], ['geometryTrigonometry', 'texas:G.9A', false],
  ['algebra', 'texas:A.5A', true], ['advancedMath', 'texas:A.10D', null],
].map(([domain, key, correct], position) => ({
  questionInstanceId: `sat-${position + 1}`, position, alignmentKeys: [key], assessmentDomainId: domain, targetId: null, planWeight: null,
  unanswered: correct === null, pathToolId: null, questionType: 'multipleChoice',
  grading: { score: correct ? 1 : 0, isCorrect: correct === true },
  responsePayload: correct === null ? { responses: {} } : { responses: { answer: correct ? 'c_2' : 'c_1' } },
  questionSnapshot: {
    prompt: `Practice question ${position + 1}: if $3x + ${position + 2} = ${3 * (position + 1) + position + 2}$, what is $x$?`,
    responseFields: [{ id: 'answer', label: 'Choose one' }],
    choices: [{ id: 'c_1', label: `$${position}$` }, { id: 'c_2', label: `$${position + 1}$` }, { id: 'c_3', label: `$${position + 2}$` }],
  },
  solution: {
    answers: [{ fieldId: 'answer', label: 'Choose one', display: `$${position + 1}$` }],
    review: { headline: 'Isolate $x$.', reasoning: [`Subtract $${position + 2}$ from both sides.`, 'Divide by $3$.'], commonError: null, connection: null, answerSummary: `$x = ${position + 1}$` },
  },
}));

const reviewOf = (session, items, points) => {
  const correctQuestions = items.filter((entry) => entry.grading.isCorrect).length;
  const answeredQuestions = items.filter((entry) => !entry.unanswered).length;
  return {
    session,
    answeredQuestions,
    plannedQuestions: Math.max(session.requiredQuestions, items.length),
    correctQuestions,
    scorePercent: Math.round((points.earned / points.possible) * 100),
    earnedPoints: points.earned,
    possiblePoints: points.possible,
    weighted: points.weighted,
    scoreBasis: session.examType === 'courseTest' ? 'plannedWeighted' : 'planned',
    items,
  };
};

const REVIEWS = {
  // Course Test: weights 1,1,1,1,1,2.5,1 → earned 1+0+0+0.5+1+2.5+1 = 6 of 8.5.
  'course-test': () => reviewOf(released('course-test', 'courseTest', 'Unit 3 Test — Linear Functions', 7), courseItems, { earned: 6, possible: 8.5, weighted: true }),
  'course-retest': () => reviewOf(released('course-retest', 'courseTest', 'Unit 3 Test — Linear Functions — Retest', 4), courseItems.slice(0, 4).map((entry) => ({ ...entry, grading: { score: 1, isCorrect: true }, unanswered: false, responsePayload: entry.unanswered ? { responses: { answer: '3' } } : entry.responsePayload })), { earned: 4, possible: 4, weighted: false }),
  // SAT practice: 10 planned, 8 opened, 1 left blank; 4 correct of 10.
  'sat-practice': () => reviewOf(released('sat-practice', 'digitalSAT', 'Digital SAT Math — practice test', 10), satItems, { earned: 4, possible: 10, weighted: false }),
  // A session the server would never hand out: still being held.
  unreleased: () => ({ ...reviewOf(released('unreleased', 'digitalSAT', 'Held practice test', 10), satItems, { earned: 4, possible: 10, weighted: false }), session: { ...released('unreleased', 'digitalSAT', 'Held practice test', 10), feedbackReleased: false } }),
};

const delay = (ms = 60) => new Promise((resolve) => { setTimeout(resolve, ms); });

export const getStudentSecureExamReview = async ({ examSessionId }) => {
  await delay();
  window.__reviewsOpened = [...(window.__reviewsOpened || []), examSessionId];
  const build = REVIEWS[examSessionId];
  if (!build) throw new Error('Your teacher has not released feedback for this exam yet.');
  return { review: build() };
};

export const createSecureExamSession = async (payload) => {
  await delay();
  window.__created = [...(window.__created || []), payload];
  return { success: true, session: { examSessionId: `created-${(window.__created || []).length}`, ...payload } };
};

export const listProctorExamSessions = async () => ({ sessions: [] });
export const listStudentSecureExamSessions = async () => ({ sessions: [] });
export const proctorExamAction = async () => ({ success: true });
export const startSecureExamSession = async () => { throw new Error('The results harness never starts a secure session.'); };
export const issueSecureExamQuestion = async () => { throw new Error('The results harness never issues a secure item.'); };
export const saveSecureExamDraft = async () => ({ success: true });
export const submitSecureExamResponse = async () => { throw new Error('Not used.'); };
export const recordSecureExamIntegrityEvent = async () => ({ success: true, status: 'in_progress', violationCount: 0 });
export const finalizeSecureExam = async () => { throw new Error('Not used.'); };
