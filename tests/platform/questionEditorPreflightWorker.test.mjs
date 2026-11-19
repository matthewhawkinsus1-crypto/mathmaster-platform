/*
 * THE QUESTION EDITOR'S PRE-FLIGHT RUNS BESIDE THE PAGE, AND ONLY ITS NEWEST RUN IS SHOWN.
 *
 * The editor ran the whole assignment's Pre-Flight on the page's own thread
 * 500 ms after the teacher's last edit, one long task, so on a large
 * assignment a key pressed just after a pause waited for all of it. It runs in
 * a worker now (editorPreflightWorker.js, which useQuestionPreflightFindings.js
 * starts). These hold what that must not change, and what it must not let in:
 *
 *   - the worker's findings are the page's, message for message, after the
 *     copy the browser makes of the request and of the answer (postMessage
 *     copies with the structured clone node's structuredClone makes);
 *   - a stale run never wins: an answer is shown only for the newest request,
 *     never for one an edit (cancel) or a newer request replaced, and a
 *     request waiting for a busy worker gives way to a newer one unrun;
 *   - closing the editor ends the worker, and nothing is shown after;
 *   - where no worker can start, or it fails, or the questions cannot be
 *     copied to it, the run is made on the page, with the same findings.
 *
 * tests/browser/questionEditorPreflight.mjs times a key pressed just after a
 * pause on the 82-question assignment in Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { NOTED_QUESTION_ID, editorPreflightAssignment, largeEditorAssignment } from './helpers/editorPreflightFixtures.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { answerEditorPreflightRequest, editorPreflightFindings } from '../../src/platform/preflight/questionPreflightFindings.js';
import { createPreflightFindingsRunner } from '../../src/components/teacher/useQuestionPreflightFindings.js';
import { teacherQuestionValue } from '../../functions/shared/questionValue.mjs';

const STORED = editorPreflightAssignment();
const QUESTIONS = getStoredAssignmentQuestions(STORED);
const basisOf = (questions, source = STORED) => ({ source, questions, classSize: 28 });
// Question 21's grade weight typed as `weight`: a warning Pre-Flight did not have.
const weighted = (weight) => QUESTIONS.map((question) => (question.questionId === NOTED_QUESTION_ID ? teacherQuestionValue(question, weight) : question));

// A worker the test answers by hand: each request and each answer goes
// through the copy the browser makes, and the answer is the worker's own.
class FakeWorker {
  constructor() {
    this.sent = [];
    this.listeners = { message: new Set(), error: new Set(), messageerror: new Set() };
    this.terminated = false;
  }

  addEventListener(type, listener) { this.listeners[type].add(listener); }

  removeEventListener(type, listener) { this.listeners[type].delete(listener); }

  postMessage(data) {
    if (this.terminated) throw new Error('posted to a worker that was ended');
    this.sent.push(structuredClone(data));
  }

  terminate() { this.terminated = true; }

  /** The worker answers the `n`-th request it was sent. */
  answer(n) {
    const reply = structuredClone(answerEditorPreflightRequest(this.sent[n]));
    this.listeners.message.forEach((listener) => listener({ data: reply }));
  }

  /** It could not load, or broke. */
  fail() { this.listeners.error.forEach((listener) => listener({ preventDefault() {} })); }
}

const harness = (options = {}) => {
  const workers = [];
  const shown = [];
  const runner = createPreflightFindingsRunner({
    startWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    ...options,
  });
  return { runner, workers, shown, deliver: (findings, basis) => shown.push({ findings, basis }) };
};

test('the worker\'s findings are the page\'s, message for message, after the browser\'s copy both ways', () => {
  const large = largeEditorAssignment();
  const cases = [
    ['the lesson as stored', basisOf(QUESTIONS)],
    ['with a weight typed that brings a warning', basisOf(weighted(15))],
    ['the 82-question assignment', basisOf(getStoredAssignmentQuestions(large), large)],
  ];
  for (const [label, basis] of cases) {
    const reply = structuredClone(answerEditorPreflightRequest(structuredClone({ id: 7, ...basis })));
    const page = editorPreflightFindings(basis);
    assert.equal(reply.id, 7, label);
    assert.deepEqual(reply.findings, page, label);
    assert.ok(reply.findings.noteCount > 0 && reply.findings.byQuestionId.size > 0, `${label}: findings to compare`);
  }
  assert.equal(editorPreflightFindings(basisOf(weighted(15))).byQuestionId.get(NOTED_QUESTION_ID).warnings.length, 1, 'the typed weight is warned about');
  // A candidate the model cannot read at all: no findings, as the page's catch gave.
  assert.deepEqual(answerEditorPreflightRequest({ id: 3, source: { schemaVersion: 4 }, questions: [] }), { id: 3, findings: null });
});

test('only the newest request is shown, and one waiting for the busy worker gives way to a newer one unrun', () => {
  const { runner, workers, shown, deliver } = harness();
  const first = basisOf(QUESTIONS);
  const second = basisOf(weighted(15));
  const third = basisOf(weighted(16));
  runner.request(first, deliver);
  runner.request(second, deliver);
  runner.request(third, deliver);
  assert.equal(workers.length, 1, 'one worker');
  assert.equal(workers[0].sent.length, 1, 'one request at a time is with the worker');
  workers[0].answer(0);
  assert.deepEqual(shown, [], 'the first run is stale: never shown');
  assert.equal(workers[0].sent.length, 2, 'the newest request is sent once the worker is free');
  assert.equal(workers[0].sent[1].id, 3, 'the second request, replaced while it waited, was never run');
  assert.equal(workers[0].sent[1].questions[20].questionWeight, 16);
  workers[0].answer(1);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].basis, third, 'shown with the questions it was found for');
  assert.deepEqual(shown[0].findings, editorPreflightFindings(third));
  // An answer that comes again, or for a request never made, changes nothing.
  workers[0].answer(1);
  workers[0].listeners.message.forEach((listener) => listener({ data: { id: 99, findings: null } }));
  assert.equal(shown.length, 1);
});

test('an edit while a run goes makes the run stale: its findings are never shown', () => {
  const { runner, workers, shown, deliver } = harness();
  runner.request(basisOf(QUESTIONS), deliver);
  runner.cancel();
  workers[0].answer(0);
  assert.deepEqual(shown, []);
  // The run after the pause that follows is shown.
  const after = basisOf(weighted(15));
  runner.request(after, deliver);
  workers[0].answer(1);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].basis, after);
  // An edit while a request waits for the busy worker: it is never sent.
  runner.request(basisOf(QUESTIONS), deliver);
  runner.request(basisOf(weighted(3)), deliver);
  runner.cancel();
  workers[0].answer(2);
  assert.equal(workers[0].sent.length, 3, 'nothing was waiting any more');
  assert.equal(shown.length, 1);
});

test('closing the editor ends the worker, and nothing is shown after', () => {
  const { runner, workers, shown, deliver } = harness();
  runner.request(basisOf(QUESTIONS), deliver);
  runner.request(basisOf(weighted(15)), deliver);
  runner.stop();
  assert.equal(workers[0].terminated, true, 'the worker, and the run in it, ended');
  assert.equal(workers[0].listeners.message.size, 0, 'and nothing listens to it');
  workers[0].answer(0);
  assert.deepEqual(shown, []);
  // Mounted again (React's StrictMode does it once in development): a new worker.
  runner.request(basisOf(QUESTIONS), deliver);
  assert.equal(workers.length, 2);
  workers[1].answer(0);
  assert.equal(shown.length, 1);
});

test('where no worker can start, or it fails, or the questions cannot be copied, the run is made on the page, with the same findings', () => {
  const page = editorPreflightFindings(basisOf(QUESTIONS));

  const noWorker = createPreflightFindingsRunner({ startWorker: () => { throw new ReferenceError('Worker is not defined'); } });
  const shownHere = [];
  noWorker.request(basisOf(QUESTIONS), (findings) => shownHere.push(findings));
  assert.deepEqual(shownHere, [page]);

  // The worker's file could not load (a deploy replaced it): this run, and the next, are made on the page.
  const { runner, workers, shown, deliver } = harness();
  runner.request(basisOf(QUESTIONS), deliver);
  workers[0].fail();
  assert.equal(workers[0].terminated, true);
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0].findings, page);
  runner.request(basisOf(weighted(15)), deliver);
  assert.equal(workers.length, 1, 'no second worker is tried');
  assert.equal(shown.length, 2);
  assert.deepEqual(shown[1].findings, editorPreflightFindings(basisOf(weighted(15))));

  // A value the browser cannot copy to a worker (a function, say): this run is made on the page.
  const uncopyable = harness();
  const odd = basisOf(QUESTIONS.map((question, index) => (index === 0 ? { ...question, render: () => null } : question)));
  uncopyable.runner.request(odd, uncopyable.deliver);
  assert.equal(uncopyable.workers[0].sent.length, 0);
  assert.equal(uncopyable.shown.length, 1);
  assert.deepEqual(uncopyable.shown[0].findings, editorPreflightFindings(odd));
});

test('the worker starts at the first run, never while the editor is drawn', () => {
  const { runner, workers } = harness();
  assert.equal(workers.length, 0, 'creating the runner (in the editor\'s first render) starts nothing');
  runner.cancel();
  runner.stop();
  assert.equal(workers.length, 0);
});
