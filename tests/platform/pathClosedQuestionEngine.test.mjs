/*
 * MY MATH PATH: A QUESTION THE SESSION CLOSED IS CLOSED IN THE ENGINE TOO
 * (student-a11y-3).
 *
 * The session closes a question when its tries are spent or it is answered, and
 * holds its review for "Next question". QuestionEngine was given the issued
 * question's stored `attemptsUsed`, which the container moves on only while the
 * question stays open, so on a closed one-try question it still counted 0 of 1
 * used: "One try on this question" over the review, Submit still offered, the
 * work still editable, and on a touch phone the number keypad (which closes when
 * the engine says the question is terminal) stayed up over "Next question" until
 * Done. The engine is now given the server's count (pathEngineQuestionRecord):
 * its attempt number, and a question it closed is closed.
 *
 * Rendered for real below (Vite's SSR, as the action bar's tests render the
 * engine): the first render a student sees for each state of the session. The
 * browser proof is tests/browser/studentShellLargeText.mjs --check=obscured,
 * scene session-hosts/path-after-submit, at 1366×768 and on a 390×844 touch
 * phone: the keypad is gone once the question closes, before any key or tap.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, submitButton } from './helpers/actionBarRender.mjs';
import { pathEngineQuestionRecord } from '../../src/platform/path/pathProgression.js';
import { getAttemptsRemaining, normalizeQuestionRecord } from '../../src/attemptPolicy.js';

// ------------------------------------------------------------ the record, as a rule

// What the engine makes of a record: the tries it has left (QuestionEngine's
// remainingAttempts), against the question's own maximum.
const triesLeftInEngine = (record, maximum) => getAttemptsRemaining(normalizeQuestionRecord(record), maximum);

test('an open question carries the count the container keeps', () => {
  assert.deepEqual(pathEngineQuestionRecord({ questionInstance: { attemptsUsed: 0 }, attemptsAllowed: 3 }), { status: 'unattempted', attemptCount: 0 });
  // After a miss that leaves tries, the container moves the stored count on itself.
  const missed = pathEngineQuestionRecord({
    questionInstance: { attemptsUsed: 1 },
    grading: { isCorrect: false, questionFinalized: false, attemptNumber: 1, attemptsRemaining: 2 },
    attemptsAllowed: 3,
  });
  assert.deepEqual(missed, { status: 'attempted', attemptCount: 1 });
  assert.equal(triesLeftInEngine(missed, 3), 2, 'the engine and the server agree: 2 left');
});

test('a question the server closed on a miss has no try left, though the stored count never moved', () => {
  // The container holds the review and leaves attemptsUsed at 0 (MyMathPathProductionContainer).
  const closed = pathEngineQuestionRecord({
    questionInstance: { attemptsUsed: 0, attemptsAllowed: 1 },
    grading: { isCorrect: false, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 0 },
    closed: true,
    attemptsAllowed: 1,
  });
  assert.deepEqual(closed, { status: 'expired', attemptCount: 1 });
  assert.equal(triesLeftInEngine(closed, 1), 0);
  // The last of three, the stored count still at 2.
  const third = pathEngineQuestionRecord({
    questionInstance: { attemptsUsed: 2 },
    grading: { isCorrect: false, questionFinalized: true, attemptNumber: 3, attemptsRemaining: 0 },
    closed: true,
    attemptsAllowed: 3,
  });
  assert.deepEqual(third, { status: 'expired', attemptCount: 3 });
  assert.equal(triesLeftInEngine(third, 3), 0);
});

test('without the hold the grading is not read: the teacher simulator\'s forced outcome shows the next question', () => {
  // MyMathPathProductionContainer forceOutcomeFromSimulator: the next question,
  // the last one's grading, and no review held.
  const next = pathEngineQuestionRecord({
    questionInstance: { attemptsUsed: 0 },
    grading: { isCorrect: true, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 2 },
    closed: false,
    attemptsAllowed: 3,
  });
  assert.deepEqual(next, { status: 'unattempted', attemptCount: 0 });
  assert.equal(triesLeftInEngine(next, 3), 3);
});

test('a question answered on its first try is complete, whatever tries it had left', () => {
  const answered = pathEngineQuestionRecord({
    questionInstance: { attemptsUsed: 0 },
    grading: { isCorrect: true, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 2 },
    closed: true,
    attemptsAllowed: 3,
  });
  assert.deepEqual(answered, { status: 'correct', attemptCount: 1 });
});

test('a review held for Next question closes it, even when only needsNextQuestion said so', () => {
  // An older server: the grading alone does not close it, the container's hold does.
  assert.deepEqual(
    pathEngineQuestionRecord({ questionInstance: { attemptsUsed: 0 }, grading: {}, closed: true, attemptsAllowed: 3 }),
    { status: 'expired', attemptCount: 3 },
  );
  // A previous release's grading, which closes it by its count alone, is held the same way.
  assert.deepEqual(
    pathEngineQuestionRecord({ questionInstance: { attemptsUsed: 2 }, grading: { isCorrect: false, attemptNumber: 3, attemptsRemaining: 0 }, closed: true, attemptsAllowed: 3 }),
    { status: 'expired', attemptCount: 3 },
  );
});

// ------------------------------------------------------------ the session, rendered

let vite = null;
let PathSessionPlayer = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  PathSessionPlayer = (await vite.ssrLoadModule('/src/components/student/PathSessionPlayer.jsx')).default;
});
after(async () => { await vite?.close(); });

const memoryStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};
const render = (element) => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage(), addEventListener() {}, removeEventListener() {} };
  try {
    return decode(renderToStaticMarkup(element));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

const LITERAL = { id: 'path-closed-literal', questionId: 'path-closed-literal', type: 'literal', prompt: 'Write 6/8 in lowest terms.', answer: '3/4' };
const SESSION = { sessionKind: 'practice', requiredQuestions: 5, summary: { completedQuestions: 1 }, target: { alignmentKey: 'texas:A.5A' } };
// The session as MyMathPathProductionContainer hands it over: the issued question
// (its stored count), the server's last grading, and onContinue while it holds the
// review for "Next question".
const session = ({ attemptsAllowed, attemptsUsed, grading = null, holding = false }) => render(React.createElement(PathSessionPlayer, {
  session: SESSION,
  questionInstance: { questionInstanceId: 'path-closed-1', prompt: LITERAL.prompt, canonicalQuestion: LITERAL, attemptsAllowed, attemptsUsed, activityRole: 'practice' },
  lastGradingResult: grading,
  solutionReview: holding ? { headline: 'Divide the top and the bottom by 2.', reasoning: ['$6/8 = 3/4$.'], answerSummary: 'The answer is $3/4$.' } : null,
  isSubmitting: false,
  studentProfile: {},
  onSubmitAnswer: async () => null,
  onContinue: holding ? () => {} : null,
}));
// The engine's tries strip, and the session's header line.
const strip = (html) => html.match(/class="mathmaster-question-attempt-strip"[^>]*><strong>([^<]*)<\/strong>/)?.[1] ?? null;
const headerLine = (html) => html.match(/<header[\s\S]*?(Question \d+ of \d+[^<]*)</)?.[1] ?? null;

test('closed by a miss on its only try: the engine says closed, offers no Submit, and holds the work read-only', () => {
  const html = session({ attemptsAllowed: 1, attemptsUsed: 0, grading: { isCorrect: false, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 0 }, holding: true });
  assert.equal(strip(html), 'This question is closed', 'not "One try on this question" over the review');
  assert.equal(submitButton(html), null, 'no "Submit — your only try" on a question the server closed');
  // Read-only is the engine's lock, the state that tells the keypad to close (QuestionLifecycleProvider terminal={locked}).
  assert.match(html, /data-work-read-only="true"/);
  assert.match(html, /Next question/, 'the session\'s way on');
  // My Math Path never replaces a question: no dead "Request New Question".
  assert.doesNotMatch(html, /Request New Question|request a new (problem|question)/i);
  assert.equal(headerLine(html), 'Question 1 of 5');
});

test('answered on the first of three tries: the engine says complete, and nothing says tries are left', () => {
  const html = session({ attemptsAllowed: 3, attemptsUsed: 0, grading: { isCorrect: true, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 2 }, holding: true });
  assert.equal(strip(html), 'Question complete', 'not "3 of 3 tries left"');
  assert.equal(submitButton(html), null);
  assert.equal(headerLine(html), 'Question 1 of 5', 'not "· 2 tries left" over its own review');
  assert.doesNotMatch(html, /tries? left/);
});

test('still open after a miss: the same tries as before, from the engine and the header', () => {
  const html = session({ attemptsAllowed: 3, attemptsUsed: 1, grading: { isCorrect: false, questionFinalized: false, attemptNumber: 1, attemptsRemaining: 2 } });
  assert.equal(strip(html), '2 of 3 tries left');
  assert.equal(submitButton(html)?.name, 'Submit — uses 1 of 2 tries left');
  assert.doesNotMatch(html, /data-work-read-only="true"/);
  assert.equal(headerLine(html), 'Question 2 of 5 · 2 tries left');
});

test('a review held on needsNextQuestion alone closes the engine too', () => {
  const html = session({ attemptsAllowed: 3, attemptsUsed: 0, grading: {}, holding: true });
  assert.equal(strip(html), 'This question is closed');
  assert.equal(submitButton(html), null);
});

test('a teacher simulator\'s forced outcome: the next question, beside the last one\'s grading, opens with all its tries', () => {
  const html = session({ attemptsAllowed: 3, attemptsUsed: 0, grading: { isCorrect: true, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 2 } });
  assert.equal(strip(html), '3 of 3 tries left');
  assert.equal(submitButton(html)?.name, 'Submit — uses 1 of 3 tries');
  assert.doesNotMatch(html, /data-work-read-only="true"/);
});
