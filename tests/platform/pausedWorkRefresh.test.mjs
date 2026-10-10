/*
 * A QUESTION CLOSED FROM ANOTHER TAB SHOWS THE ANSWER THAT WAS RECORDED.
 *
 * QA round 2 (R2-m3): a paused second tab held its own unsubmitted "7"; the
 * other tab answered 5 and submitted; the record that arrived closed the
 * question and the paused tab drew "✓ CORRECT / Question complete" over its 7
 * (a reload showed 5). A new attempt on the record while a tab is paused now
 * makes that tab drop the work it holds — without saving it — and re-read the
 * saved work (src/platform/persistence/pausedWorkRefresh.js, wired in
 * src/QuestionEngine.jsx). Browser proof: tests/browser/staleTabRecord.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { pausedWorkNeedsRefresh, recordAttemptRevision } from '../../src/platform/persistence/pausedWorkRefresh.js';
import { normalizeQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';

const open = normalizeQuestionRecord(null);
const answered = recordQuestionAttempt({ record: open, isCorrect: true, responseKey: 'x=5', maximumAttempts: 1 }).record;
const missed = recordQuestionAttempt({ record: open, isCorrect: false, responseKey: 'x=7', maximumAttempts: 3 }).record;

test('an attempt recorded by another tab moves the revision a paused tab watches', () => {
  // The R2-m3 record: unattempted -> correct with the other tab's response.
  assert.notEqual(recordAttemptRevision(open), recordAttemptRevision(answered));
  // An incorrect attempt with attempts left moves it too.
  assert.notEqual(recordAttemptRevision(open), recordAttemptRevision(missed));
  // A second attempt that only changes the recorded response still moves it.
  assert.notEqual(
    recordAttemptRevision({ ...missed, lastResponseKey: 'x=6' }),
    recordAttemptRevision(missed),
  );
  // A teacher's reopen (status back to attempted, same attempts) moves it.
  assert.notEqual(recordAttemptRevision({ ...answered, status: 'attempted' }), recordAttemptRevision(answered));
  // No record at all is a stable value, not a crash.
  assert.equal(recordAttemptRevision(null), recordAttemptRevision(undefined));
});

test('what the tab itself changes while working never moves the revision', () => {
  // Time spent and help used are written by the working tab; refreshing on
  // them would throw away work on every save.
  const working = { ...missed, timeSpent: 400, supportUsage: { ...missed.supportUsage, hintUsed: true }, partialCredit: 40 };
  assert.equal(recordAttemptRevision(working), recordAttemptRevision(missed));
  // A normalised copy of the same record is the same revision.
  assert.equal(recordAttemptRevision(normalizeQuestionRecord(answered)), recordAttemptRevision(answered));
});

test('only a PAUSED tab, on the SAME question, whose record moved, refreshes', () => {
  const before = { scope: 'draft:q6', revision: recordAttemptRevision(open) };
  const after = { scope: 'draft:q6', revision: recordAttemptRevision(answered) };
  assert.equal(pausedWorkNeedsRefresh({ paused: true, previous: before, next: after }), true);
  // The tab in charge: its own Submit moves the record; its work IS the record.
  assert.equal(pausedWorkNeedsRefresh({ paused: false, previous: before, next: after }), false);
  // Nothing new on the record: a paused tab keeps what it shows.
  assert.equal(pausedWorkNeedsRefresh({ paused: true, previous: before, next: { ...before } }), false);
  // Moving to another question is not a new attempt on this one.
  assert.equal(pausedWorkNeedsRefresh({ paused: true, previous: before, next: { ...after, scope: 'draft:q7' } }), false);
  // First sight of a record is not a change.
  assert.equal(pausedWorkNeedsRefresh({ paused: true, previous: null, next: after }), false);
});

const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));

// The effect that consults pausedWorkNeedsRefresh, from its useEffect( to the
// end of its dependency list.
const refreshEffect = () => {
  const call = engine.indexOf('pausedWorkNeedsRefresh(');
  assert.notEqual(call, -1, 'QuestionEngine must consult pausedWorkNeedsRefresh');
  const start = engine.lastIndexOf('useEffect(', call);
  const depsStart = engine.indexOf('}, [', call);
  const depsEnd = engine.indexOf(']', depsStart);
  assert.ok(start !== -1 && depsStart !== -1 && depsEnd !== -1, 'the refresh must run in an effect with a dependency list');
  return { body: engine.slice(start, depsStart), deps: engine.slice(depsStart + 4, depsEnd) };
};

test('QuestionEngine refreshes a paused tab from the saved work when its record moves', () => {
  const { body, deps } = refreshEffect();
  // The revision is the record the engine RECEIVES, through the shared helper.
  const revision = engine.match(/const\s+(\w+)\s*=\s*recordAttemptRevision\(\s*record\s*\)/);
  assert.ok(revision, 'the watched revision must be recordAttemptRevision(record)');
  // ...gated by THIS tab being paused by another, on this question's draft key.
  assert.match(body, /paused:\s*pausedByAnotherTab\b/, 'only a tab paused by another tab refreshes');
  assert.match(body, new RegExp(`revision:\\s*${revision[1]}\\b`), 'the effect compares the watched revision');
  assert.match(body, /scope:\s*draftKey\b/, 'the revision is tied to the question\'s draft key');
  for (const dependency of [revision[1], 'pausedByAnotherTab', 'draftKey']) {
    assert.match(deps, new RegExp(`\\b${dependency}\\b`), `the effect must re-run when ${dependency} changes`);
  }
  // The refresh is the "Continue here" reload: the module remounts and reads
  // the saved work, and the answer this tab held is dropped.
  const guard = body.indexOf('pausedWorkNeedsRefresh(');
  const afterGuard = body.slice(guard);
  assert.match(afterGuard, /setQuestionResetVersion\(/, 'the response module must remount to re-read the saved work');
  assert.match(afterGuard, /setAnswerState\(\s*EMPTY_ANSWER_STATE\s*\)/, 'the answer this tab held must be dropped');
  assert.match(engine, /<QuestionModuleBoundary[\s\S]{0,200}?key=\{`[^`]*\$\{questionResetVersion\}/, 'the reset version must be part of the module key, or the bump remounts nothing');
});

test('the refresh never saves, submits, checkpoints or takes back the question', () => {
  const { body } = refreshEffect();
  for (const forbidden of [/writeQuestionDraft/, /localStorage/, /onResponseCheckpoint/, /flushResponseCheckpoint/, /onGrade/, /handleSubmit/, /continueHere/, /claimActiveWork/, /stampToolDraftSubmission/]) {
    assert.doesNotMatch(body, forbidden, `a paused tab's refresh must not ${forbidden.source}`);
  }
});
