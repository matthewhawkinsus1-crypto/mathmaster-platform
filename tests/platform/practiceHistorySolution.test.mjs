/*
 * PRACTICE HISTORY: "SEE THE SOLUTION" ON A MISSED PATH QUESTION (MP18).
 *
 * A My Math Path question the student finished without getting right offers
 * its worked solution, from the session's own review (getMyPathSessionRecap),
 * fetched only when asked. The review is built here by the real shared rules
 * (functions/shared/pathSessionRecap.mjs) and the screen is rendered by
 * Vite's own module loader. (The opened panel, with its loading, review,
 * unfinished-session, failed-load and "Try again" states, was driven in
 * Chromium at 1366 and 390 wide when this was built.) "Try a similar one" is
 * not offered; the reason is written beside practiceHistorySolutionSource.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  PRACTICE_SOLUTION,
  describePracticeHistorySolution,
  practiceHistorySolutionSource,
} from '../../src/platform/mastery/practiceHistoryPresentation.js';
import { buildPathRecapEntry, buildPathSessionRecap, pathRecapAccess } from '../../functions/shared/pathSessionRecap.mjs';

const SESSION = 'session-7';
// A Path answer as submitPathResponse records it (functions/index.js).
const pathAnswer = ({ questionInstanceId = 'qi-1', isCorrect = false, score = 0, status = 'finalized', sessionId = SESSION, at = 1000 } = {}) => ({
  eventKey: `${questionInstanceId}-${status}-${at}`,
  occurredAt: at,
  alignmentKeys: ['texas:A.5A'],
  questionSnapshot: { questionInstanceId, familyId: 'fam', dok: 2, difficultyBand: 3 },
  source: { kind: 'myMathPath', activityRole: 'practice', activitySessionId: sessionId, sessionKind: 'practice' },
  performance: { score, isCorrect, attemptNumber: status === 'finalized' ? 2 : 1, status, isMathematicallyIndependent: true },
  supportUsage: {},
});

test('the solution is offered only for a Path question the student finished without getting right', () => {
  assert.deepEqual(practiceHistorySolutionSource(pathAnswer()), { sessionId: SESSION, questionInstanceId: 'qi-1' });
  assert.deepEqual(practiceHistorySolutionSource(pathAnswer({ score: 0.5 })), { sessionId: SESSION, questionInstanceId: 'qi-1' }, 'partly right');
  assert.equal(practiceHistorySolutionSource(pathAnswer({ status: 'attempted' })), null, 'a miss the student could still fix');
  assert.equal(practiceHistorySolutionSource(pathAnswer({ isCorrect: true, score: 1 })), null, 'right');
  assert.equal(practiceHistorySolutionSource({ ...pathAnswer(), source: { kind: 'assignment', activitySessionId: 'a1', assignmentId: 'a1' } }), null, 'assignment work has Review My Work');
  assert.equal(practiceHistorySolutionSource(pathAnswer({ sessionId: '' })), null);
  assert.equal(practiceHistorySolutionSource({ ...pathAnswer(), questionSnapshot: {} }), null, 'no question to find (the simulator\'s answers)');
});

// The review of a finished session with two closed questions: qi-1 missed,
// qi-2 right.
const entry = (questionInstanceId, isCorrect, questionNumber) => buildPathRecapEntry({
  sessionId: SESSION,
  questionInstanceId,
  questionNumber,
  skillCode: 'A.5A',
  publicQuestion: { prompt: `Solve 2x + 3 = 11 (${questionInstanceId}).`, responseFields: [{ id: 'answer', label: 'x =', inputProfile: 'number' }] },
  privateGrading: { kind: 'fields', fields: [{ id: 'answer', expected: '4' }] },
  responsePayload: { answer: isCorrect ? '4' : '7' },
  grading: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber: 2, attemptsAllowed: 2 },
  solutionReview: { headline: 'Undo the operations.', reasoning: ['Subtract 3.', 'Divide by 2.'], answerSummary: 'x = 4' },
});
const finished = buildPathSessionRecap({
  session: { sessionId: SESSION, status: 'completed', summary: { completedQuestions: 3 } },
  entries: [entry('qi-1', false, 1), entry('qi-2', true, 2)],
});

test('the panel shows the review\'s own item for that question', () => {
  const view = describePracticeHistorySolution({ recap: finished, questionInstanceId: 'qi-1' });
  assert.equal(view.state, PRACTICE_SOLUTION.READY);
  assert.equal(view.item.questionInstanceId, 'qi-1');
  assert.match(view.item.question.prompt, /\(qi-1\)/);
  assert.equal(view.item.solutionReview.answerSummary, 'x = 4');
});

test('a question the review does not hold, an unfinished session, and a failed load each say so', () => {
  // Answered before reviews were recorded (the third question of the session).
  const missing = describePracticeHistorySolution({ recap: finished, questionInstanceId: 'qi-3' });
  assert.equal(missing.state, PRACTICE_SOLUTION.NOT_AVAILABLE);
  assert.match(missing.message, /cannot be shown here/);
  // The server refuses an unfinished session with its own code.
  const refusal = pathRecapAccess({ session: { studentId: 's1', status: 'active' }, studentId: 's1' });
  const notFinished = describePracticeHistorySolution({ error: { code: `functions/${refusal.code}` }, questionInstanceId: 'qi-1' });
  assert.equal(notFinished.state, PRACTICE_SOLUTION.NOT_FINISHED);
  assert.match(notFinished.message, /once you finish this session/);
  // The sandbox answers instead of refusing.
  const sandbox = buildPathSessionRecap({ session: { sessionId: SESSION, status: 'active' } });
  assert.equal(describePracticeHistorySolution({ recap: sandbox, questionInstanceId: 'qi-1' }).state, PRACTICE_SOLUTION.NOT_FINISHED);
  const gone = pathRecapAccess({ session: null, studentId: 's1' });
  assert.equal(describePracticeHistorySolution({ error: { code: `functions/${gone.code}` }, questionInstanceId: 'qi-1' }).state, PRACTICE_SOLUTION.NOT_AVAILABLE);
  const failed = describePracticeHistorySolution({ error: new Error('offline'), questionInstanceId: 'qi-1' });
  assert.equal(failed.state, PRACTICE_SOLUTION.ERROR);
  assert.match(failed.message, /Your work is saved/);
});

// --- The screen ------------------------------------------------------------------

let vite = null;
let screen = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
  screen = await vite.ssrLoadModule('/src/components/student/StudentPracticeHistory.jsx');
});
after(async () => { await vite?.close(); });

const answers = [
  pathAnswer({ questionInstanceId: 'qi-1', at: 4000 }),
  pathAnswer({ questionInstanceId: 'qi-2', isCorrect: true, score: 1, at: 3000 }),
  pathAnswer({ questionInstanceId: 'qi-4', status: 'attempted', at: 2000 }),
  { ...pathAnswer({ questionInstanceId: 'qi-5', at: 1000 }), source: { kind: 'assignment', assignmentId: 'a1', activityRole: 'classwork' } },
];
const render = (props) => renderToStaticMarkup(React.createElement(screen.StudentPracticeHistory, { evidenceEvents: answers, ...props }));
const articles = (markup) => markup.split('<article').slice(1);

test('Practice History offers "See the solution" on the missed Path question only, and fetches nothing to draw it', () => {
  let asked = 0;
  const markup = render({ loadSessionRecap: async () => { asked += 1; return finished; } });
  const rows = articles(markup);
  assert.equal(rows.length, answers.length, 'every answer is listed');
  // Newest first: qi-1 (missed, closed), qi-2 (right), qi-4 (still open), qi-5 (assignment).
  assert.deepEqual(rows.map((row) => row.includes('See the solution')), [true, false, false, false]);
  assert.equal(asked, 0, 'the review is fetched only when the student asks');
  assert.match(rows[0], /aria-expanded="false"/);
});

test('no solution is offered where the review cannot be asked for (a teacher\'s read-only view, the simulator)', () => {
  assert.equal(render({ loadSessionRecap: null }).includes('See the solution'), false);
  const app = readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8');
  assert.match(app, /<StudentPracticeHistory [^>]*loadSessionRecap=\{readOnly \|\| sessionProvider \? null : fetchPathSessionRecap\}/);
  assert.match(app, /^import \{[^}]*\bfetchPathSessionRecap\b[^}]*\} from '\.\.\/\.\.\/services\/pathSessionService\.js';$/m);
});
