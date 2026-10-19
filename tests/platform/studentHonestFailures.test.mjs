/*
 * HONEST FAILURES (student pass 3, wave 7, W7-3).
 *
 * 1. A Step Algebra step, or a new problem, the device could not queue used to
 *    get a toast under Work View while the solver applied the step as if it
 *    were saved (the host handed it `null`), and the new-problem request had
 *    already thrown the old work away. Now the host answers STEP_NOT_QUEUED /
 *    REPLACEMENT_NOT_QUEUED, the solver keeps the step on the board unapplied
 *    with one alert and "Apply the step again", and the question keeps its work.
 * 2. Raw error text (a Firestore "Missing or insufficient permissions.", a
 *    program error) reached the Live Challenge student screens and the
 *    account-load screen. They go through studentErrorText.js's words now
 *    (studentErrorWords.js).
 * 3. Copy that was no longer true: an expired extension still listed as "more
 *    time"; no "extra time" on the timer pill or Home; an arrival notice kept
 *    queued after a workspace that never opened.
 *
 * Real code where node can run it; source contracts (SOURCE_CONTRACT_PLAYBOOK)
 * bound to the region that does the work where it is a .jsx screen. The real
 * engine and solver run in tests/browser/submitNotQueued.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REPLACEMENT_NOT_QUEUED,
  REPLACEMENT_NOT_QUEUED_MESSAGE,
  STEP_NOT_QUEUED,
  STEP_NOT_QUEUED_MESSAGE,
  SUBMISSION_NOT_QUEUED,
  isReplacementNotQueued,
  isStepNotQueued,
} from '../../src/platform/student/submissionNotQueued.js';
import { STUDENT_ERROR_TEXT, describeStudentError, studentErrorSentence } from '../../src/platform/student/studentErrorText.js';
import { buildWhatChanged, WHAT_CHANGED_KIND } from '../../src/platform/student/whatChangedModel.js';
import { EXTRA_TIME_WORDS, describeDolClose } from '../../src/platform/assessment/dolCloseCopy.js';
import { extraTimeFrom, saysExtraTime } from '../../src/platform/assessment/extraTimeWords.js';
import { resolveNextAction } from '../../src/studentDashboardModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const app = read('src/App.jsx');
const engine = read('src/QuestionEngine.jsx');
const solver = read('src/StepByStepAlgebraCore.jsx');
const relation = read('src/MultiRelationAlgebraCore.jsx');

/* ---- 1. a step or a new problem the device could not queue --------------- */

test('the two results say "not saved": no verdict, no credit, no attempt, and each is told from the other', () => {
  for (const result of [STEP_NOT_QUEUED, REPLACEMENT_NOT_QUEUED]) {
    assert.ok(Object.isFrozen(result));
    assert.equal(result.blocked, true);
    assert.equal(result.notQueued, true);
    for (const field of ['isCorrect', 'status', 'expired', 'attemptCount', 'remainingAttempts', 'partialCredit', 'credit', 'accepted']) {
      assert.equal(field in result, false, `${field}: a verdict, credit or attempt would read as done`);
    }
  }
  assert.match(STEP_NOT_QUEUED_MESSAGE, /^Step not saved\./);
  assert.match(STEP_NOT_QUEUED_MESSAGE, /no try was used/);
  assert.match(STEP_NOT_QUEUED_MESSAGE, /apply it again/);
  assert.match(REPLACEMENT_NOT_QUEUED_MESSAGE, /^No new problem yet\./);
  assert.match(REPLACEMENT_NOT_QUEUED_MESSAGE, /no try was used/);
  for (const message of [STEP_NOT_QUEUED_MESSAGE, REPLACEMENT_NOT_QUEUED_MESSAGE]) {
    assert.doesNotMatch(message, /\battempt/i, 'tries, not attempts (D9)');
    assert.doesNotMatch(message, /(?<!not )\bsaved\b/i, 'never says it was saved');
  }
  assert.equal(isStepNotQueued(STEP_NOT_QUEUED), true);
  assert.equal(isStepNotQueued(REPLACEMENT_NOT_QUEUED), false);
  assert.equal(isStepNotQueued(SUBMISSION_NOT_QUEUED), false, 'an ordinary submission is not a step');
  assert.equal(isStepNotQueued(null), false);
  assert.equal(isStepNotQueued({ accepted: true, credit: 2 }), false, 'a recorded step is applied');
  assert.equal(isReplacementNotQueued(REPLACEMENT_NOT_QUEUED), true);
  assert.equal(isReplacementNotQueued(STEP_NOT_QUEUED), false);
  assert.equal(isReplacementNotQueued(undefined), false, 'a host that answers nothing replaced the question');
});

test('App.jsx: a step or a new problem it could not queue is answered with the result, never null and never a toast', () => {
  assert.match(app, /^import \{ REPLACEMENT_NOT_QUEUED, STEP_NOT_QUEUED, SUBMISSION_NOT_QUEUED \} from '\.\/platform\/student\/submissionNotQueued\.js';$/m, 'imported next to its use');
  const step = region(app, 'const handleStepGrade = async (', 'const handleRequestNewQuestion = async (');
  const stepQueue = step.indexOf("kind: 'stepSubmission'");
  const stepFailure = step.slice(step.indexOf('} catch (error) {', stepQueue), step.indexOf('setTracker(updatedTracker);', stepQueue));
  assert.match(stepFailure, /setStudentPersistenceStatus\('volatile'\);\s*return STEP_NOT_QUEUED;/);
  assert.doesNotMatch(stepFailure, /return null;/);
  assert.doesNotMatch(stepFailure, /toast(?:Warning|Error|Info|Success)\(/, 'one announcement: the solver\'s');
  const replace = region(app, 'const handleRequestNewQuestion = async (', 'const V5_COMPILER_PLUMBING_ERROR');
  const replaceQueue = replace.indexOf("kind: 'questionReplacement'");
  const replaceFailure = replace.slice(replace.indexOf('} catch (error) {', replaceQueue), replace.indexOf('setTracker(updatedTracker);', replaceQueue));
  assert.match(replaceFailure, /setStudentPersistenceStatus\('volatile'\);\s*return REPLACEMENT_NOT_QUEUED;/);
  assert.doesNotMatch(replaceFailure, /toast(?:Warning|Error|Info|Success)\(/);
});

test('the solver applies no step it could not save: every commit stops between the save and the new equation', () => {
  assert.match(solver, /^import \{ isStepNotQueued \} from '\.\/platform\/student\/submissionNotQueued\.js';$/m);
  const helper = region(solver, 'const holdUnsavedStep = (result, retry) => {', '\n  };');
  assert.match(helper, /if \(!isStepNotQueued\(result\)\) return false;/);
  assert.match(helper, /setMessage\(\{ tone: 'error', text: result\.message, notQueued: true, retry, stagingKey: stagingKeyRef\.current, heldAt: Date\.now\(\) \}\);\s*return true;/);
  const sites = [
    ['commitMove', 'const commitMove = async (', 'const hasPartialCancellationSelection', /const saved = await saveStep\(\{ move, action: STEP_ACTIONS\.BALANCED_MOVE/, /if \(holdUnsavedStep\(saved, \(\) => commitMove\(move, \{ resolution, crossedSidesOverride \}\)\)\) \{/],
    ['Simplify', 'const commitSimplifyResult = async (', 'const distributable = useMemo(', /const saved = await persistStudentRewrite\(/, /if \(holdUnsavedStep\(saved, \(\) => commitSimplifyResult\(result\)\)\) return false;/],
    ['Distribute', 'const commitDistributionStep = async () => {', 'const cancellationActiveSides = useMemo(', /const saved = await onStepGrade\(rewriteStepPayload\(/, /if \(holdUnsavedStep\(saved, \(\) => commitDistributionStep\(\)\)\) return;/],
    ['Rewrite tools', 'const commitStructureToolStep = async (', 'const resetQuestionWork = ', /const saved = await persistStudentRewrite\(/, /if \(holdUnsavedStep\(saved, \(\) => commitStructureToolStep\(tool\)\)\) return;/],
    ['Cancellation', 'const commitStandaloneCancellation = async (', 'const registerCancellationHits = ', /const saved = await onStepGrade\(rewriteStepPayload\(/, /if \(holdUnsavedStep\(saved, \(\) => commitStandaloneCancellation\(side, model\)\)\)/],
  ];
  for (const [name, start, end, save, hold] of sites) {
    const body = region(solver, start, end);
    const saveAt = body.search(save);
    const holdAt = body.search(hold);
    const applyAt = body.search(/pushCommittedEquation\(|setEquation\(nextEquation\)/);
    assert.notEqual(saveAt, -1, `${name}: the save's answer is kept`);
    assert.notEqual(holdAt, -1, `${name}: an unsaved step stops the commit`);
    assert.ok(saveAt < holdAt && holdAt < applyAt, `${name}: save, then the stop, then the new equation`);
  }
});

test('the solver says it once, in an alert of its own, and offers the same step again only on the same board', () => {
  const render = region(solver, 'if (message.notQueued) {', '\n        }\n');
  assert.match(render, /<div key=\{message\.heldAt\} role="alert" data-step-not-queued=""[^>]*>\{message\.text\}<\/div>/);
  assert.match(render, /const retryable = typeof message\.retry === 'function' && message\.stagingKey === stagingKey;/);
  assert.match(render, /\{retryable && \(\s*<button type="button"[^>]*disabled=\{disabled \|\| savingStep \|\| cancelAnimating\} onClick=\{\(\) => message\.retry\(\)\}[^>]*>\s*Apply the step again\s*<\/button>/);
  // An alert is not a correctness verdict: it stays red where verdicts are withheld.
  assert.match(solver, /const tone = !verdictsShown && message\.tone !== 'error' \? 'neutral' : message\.tone;/);
});

test('a held step belongs to its staging: any change of staging retires the alert and the button (review S1)', () => {
  const staging = region(solver, 'const stagingKey = useMemo(() => {', 'const holdUnsavedStep = (result, retry) => {');
  // Everything a student can stage is in the key.
  for (const piece of ['equation?.left', 'equation?.right', 'pendingMove', 'armedTile', 'operand', 'placedOperationSides', 'placedOperationPositions',
    'tapPlacementArmed', 'simplifyTool', 'structureTool', 'rewriteMenuOpen', 'distributionState', 'simplificationAnswers', 'crossedSides',
    'cancelledPairIds', 'selectedCancellationIndices']) {
    assert.ok(staging.slice(0, staging.indexOf(']);')).includes(piece), `${piece} is part of the staging`);
  }
  assert.match(staging, /stagingKeyRef\.current = stagingKey;/);
  assert.match(staging, /useEffect\(\(\) => \{\s*setMessage\(\(current\) => \(current\?\.notQueued && current\.stagingKey !== stagingKey \? null : current\)\);\s*\}, \[stagingKey\]\);/);
});

test('the relation solver saves before it applies, and an unsaved step changes nothing', () => {
  assert.match(relation, /^import \{ isStepNotQueued \} from '\.\/platform\/student\/submissionNotQueued\.js';$/m);
  const persist = region(relation, 'const persistStep = async (', '\n  };');
  assert.match(persist, /return onStepGrade\(\{/, 'the host\'s answer reaches the commit');
  const commit = region(relation, 'const commitState = async (', '\n  };');
  const saveAt = commit.indexOf('saved = await persistStep(before, next, label, kind, validationContext);');
  const stopAt = commit.search(/if \(isStepNotQueued\(saved\)\) \{\s*setMessage\(\{ tone: 'error', text: saved\.message, notQueued: true, heldAt: Date\.now\(\) \}\);\s*return false;\s*\}/);
  assert.ok(saveAt > 0 && stopAt > saveAt, 'saved, then stopped');
  for (const apply of ['setHistory(', 'setRelationState(next);', 'setCancellationSelection({});', 'setPlacementByKey({});']) {
    assert.ok(commit.indexOf(apply) > stopAt, `${apply} only after the step is saved`);
  }
  assert.match(commit, /if \(persistingStepRef\.current\) return false;/, 'one step at a time while it is saved');
  assert.match(relation, /role=\{message\.notQueued \? 'alert' : 'status'\}/);
});

test('a relation-symbol flip is saved before it is taken; unsaved, the flip stays pending and the symbol unchosen (review B2)', () => {
  const choose = region(relation, 'const chooseRelationSymbol = async (', 'const applyAbsoluteSplitChoice = async (');
  const saveAt = choose.search(/saved = await persistStep\(\s*pending\.before,\s*next,/);
  const stopAt = choose.search(/if \(isStepNotQueued\(saved\)\) \{\s*setRelationState\(relationState\);\s*setMessage\(\{ tone: 'error', text: saved\.message, notQueued: true, heldAt: Date\.now\(\) \}\);\s*return;\s*\}/);
  assert.ok(saveAt > 0 && stopAt > saveAt, 'saved, then stopped, back to the pending relation');
  // The complete flip's history entry and "accepted" come only after it is saved.
  const complete = choose.slice(choose.indexOf('if (complete) {'));
  assert.ok(complete.indexOf('setHistory(') > complete.search(/if \(isStepNotQueued\(saved\)\)/), 'history after the save');
  assert.ok(complete.search(/setPendingRelationFlip\(null\);\s*setMessage\(\{\s*tone: 'success'/) > complete.indexOf('setHistory('), 'the flip ends, accepted, after that');
  // Every solver path that saves a step reads its answer: commitState and the flip are persistStep's only callers.
  assert.equal([...relation.matchAll(/await persistStep\(/g)].length, 2);
});

test('a new problem the device could not queue keeps the question and its work, and says so under its button', () => {
  assert.match(engine, /^import \{ isReplacementNotQueued, isSubmissionNotQueued \} from '\.\/platform\/student\/submissionNotQueued\.js';$/m);
  const request = region(engine, 'const handleRequestNewQuestion = async () => {', '\n  };');
  const askAt = request.indexOf('const result = await onRequestNewQuestion(');
  const stopAt = request.search(/if \(isReplacementNotQueued\(result\)\) \{\s*setReplacementNotice\(result\.message\);\s*return;\s*\}/);
  assert.ok(askAt > 0 && stopAt > askAt, 'asked first, stopped on the answer');
  for (const clear of ['removeQuestionDraftFamily(draftKey);', 'forgetToolDrafts(draftKey);', 'setAnswerState(EMPTY_ANSWER_STATE);', 'setFeedback(null);']) {
    assert.ok(request.indexOf(clear) > stopAt, `${clear} only once the new problem was queued`);
  }
  assert.match(engine, /\{replacementNotice && <p role="alert" data-replacement-not-queued=""[^>]*>\{replacementNotice\}<\/p>\}/);
});

/* ---- 2. raw error text ---------------------------------------------------- */

const sdkError = (code, message) => Object.assign(new Error(message), { name: 'FirebaseError', code });

test('words no person wrote for a student are never shown; the screen\'s own sentence is', () => {
  const denied = sdkError('permission-denied', 'Missing or insufficient permissions.');
  assert.equal(studentErrorSentence(denied, 'Could not load the Live Challenge.'), 'Could not load the Live Challenge.');
  assert.equal(describeStudentError(denied).text, STUDENT_ERROR_TEXT.generic, 'no fallback: the generic sentence');
  assert.equal(studentErrorSentence(new TypeError('room.players.map is not a function'), 'Could not join the Live Challenge.'), 'Could not join the Live Challenge.');
  assert.equal(studentErrorSentence(new RangeError('Invalid time value'), 'Could not load your place.'), 'Could not load your place.');
  // A sentence MathMaster's server wrote for the student is kept.
  const refused = sdkError('functions/failed-precondition', 'This Live Challenge has ended. Ask your teacher for the new code.');
  assert.equal(studentErrorSentence(refused, 'Could not join.'), 'This Live Challenge has ended. Ask your teacher for the new code.');
  assert.equal(studentErrorSentence(new Error('Your student record is not available. Ask your teacher to add you to the roster.'), 'x y'), 'Your student record is not available. Ask your teacher to add you to the roster.');
  // An unanswered request still reads as one, and a bare code never shows.
  assert.equal(studentErrorSentence(sdkError('unavailable', 'Failed to get document because the client is offline.'), 'Could not load.'), STUDENT_ERROR_TEXT.offline);
  assert.equal(studentErrorSentence({ code: 'functions/not-found', message: 'not-found' }, 'This round could not be opened.'), 'This round could not be opened.');
});

test('a callable refusal with our sentence keeps it, whatever its code; the SDK\'s own words never pass for ours (review B1)', () => {
  const late = sdkError('functions/deadline-exceeded', 'Time was up before your answer arrived, so it was not counted.');
  assert.equal(studentErrorSentence(late, 'Your answer could not be submitted.'), 'Time was up before your answer arrived, so it was not counted.');
  assert.equal(describeStudentError(late).retry, false, 'the server answered: asking again will not change it');
  assert.equal(studentErrorSentence(sdkError('functions/deadline-exceeded', 'Time is up for this round.'), 'x y'), 'Time is up for this round.');
  // The SDK's own timeout, and a bare code: no answer came, so it is the connection.
  assert.equal(studentErrorSentence(sdkError('functions/deadline-exceeded', 'deadline-exceeded'), 'Could not submit.'), STUDENT_ERROR_TEXT.offline);
  assert.equal(studentErrorSentence(sdkError('functions/internal', 'internal'), 'Could not submit.'), STUDENT_ERROR_TEXT.offline);
  assert.equal(studentErrorSentence(sdkError('functions/internal', 'INTERNAL'), 'Could not submit.'), STUDENT_ERROR_TEXT.offline);
  // Sentences the Functions SDK writes itself (@firebase/functions): never ours, never "Wi-Fi".
  for (const [code, message] of [
    ['functions/internal', 'Response is not valid JSON object.'],
    ['functions/internal', 'Response is missing data field.'],
    ['functions/cancelled', 'Request was cancelled.'],
    ['functions/cancelled', 'Request was cancelled'],
    ['functions/cancelled', 'Firebase Functions instance was deleted.'],
  ]) {
    assert.equal(studentErrorSentence(sdkError(code, message), 'Your answer could not be submitted.'), 'Your answer could not be submitted.', message);
  }
  // A dropped connection still reads as one, whatever the error says.
  assert.equal(studentErrorSentence(new TypeError('Failed to fetch'), 'Could not submit.'), STUDENT_ERROR_TEXT.offline);
});

test('the words half imports nothing, so the sign-in path can say it; the full translator says the same words', () => {
  assert.doesNotMatch(read('src/platform/student/studentErrorWords.js'), /^import /m, 'no navigation model on the sign-in path');
  const denied = sdkError('permission-denied', 'Missing or insufficient permissions.');
  assert.equal(describeStudentError(denied, { fallback: 'Could not load the Live Challenge.' }).text, studentErrorSentence(denied, 'Could not load the Live Challenge.'));
});

test('the Live Challenge student screens show no raw error text, and log it for support', () => {
  const screens = {
    'src/components/liveChallenge/LiveChallengeStudent.jsx': 7,
    'src/components/liveChallenge/GraphFeatureRushRound.jsx': 2,
    'src/components/liveChallenge/LineGraphRound.jsx': 2,
    'src/components/liveChallenge/GraphFeatureRushPractice.jsx': 1,
    'src/components/liveChallenge/LineGraphPractice.jsx': 1,
  };
  for (const [path, uses] of Object.entries(screens)) {
    const source = read(path);
    assert.match(source, /^import \{ studentErrorSentence \} from '\.\.\/\.\.\/platform\/student\/studentErrorWords\.js';$/m, `${path}: imported next to its use`);
    assert.doesNotMatch(source, /set(?:Error|Alert|SubmitError)\([^;]*\.message\b/, `${path}: an error's own message is never set as the student's text`);
    const calls = [...source.matchAll(/set(?:Error|Alert|SubmitError)\(studentErrorSentence\((\w+), '[^']+'\)\)/g)];
    assert.equal(calls.length, uses, `${path}: every error the screen shows goes through the translator`);
    for (const [, name] of calls) assert.match(source, new RegExp(`console\\.(?:error|warn)\\('[^']+', ${name}\\)`), `${path}: ${name} is kept in the console`);
  }
});

test('the account-load screen never prints the error as it is', () => {
  const gate = read('src/app/shell/SessionGate.jsx');
  assert.match(gate, /^import \{ studentErrorSentence \} from '\.\.\/\.\.\/platform\/student\/studentErrorWords\.js';$/m);
  assert.match(gate, /<p style=\{\{ color: 'var\(--mm-text-muted\)' \}\}>\{studentErrorSentence\(hydrationError, ACCOUNT_LOAD_FALLBACK\)\}<\/p>/);
  assert.doesNotMatch(gate, /\{hydrationError\}/);
  const failure = region(app, '} catch (error) {\n        if (!cancelled) {\n          setUser(null);', 'setSessionHydrationError(');
  assert.match(failure, /console\.error\('Could not load the signed-in account:', error\);/);
  assert.match(app, /setSessionHydrationError\(error \|\| new Error\('MathMaster could not load your account\.'\)\);/, 'the error itself, not its message');
});

/* ---- 3. copy that is no longer true --------------------------------------- */

const NOW = Date.parse('2026-10-07T15:00:00Z');
const HOUR = 60 * 60 * 1000;
const lesson = (id) => ({ id, title: `Lesson ${id}`, assignedClassIds: ['class-a'], dueAt: '2026-10-01', lateDueAt: '2026-10-02', createdAt: new Date(NOW - 40 * 24 * HOUR).toISOString() });
const changes = (control) => buildWhatChanged({
  studentId: 'stu-1', classId: 'class-a', classPeriod: '3', nowValue: NOW, assignments: [lesson('a1')], controlsByAssignmentId: { a1: control },
});

test('an extension whose date has passed is no longer listed as more time', () => {
  const past = changes({ lateDueAt: '2026-10-06T17:00:00Z', extension: { grantedAt: NOW - 48 * HOUR } });
  assert.equal(past.some((item) => item.kind === WHAT_CHANGED_KIND.EXTENDED), false, JSON.stringify(past));
  const live = changes({ lateDueAt: '2026-10-09T17:00:00Z', extension: { grantedAt: NOW - HOUR } });
  assert.match(live.find((item) => item.kind === WHAT_CHANGED_KIND.EXTENDED)?.text || '', /^You have more time on Lesson a1 — now due \w{3}, Oct 9,/);
});

test('a student\'s own later close says "extra time" only once the class\'s own window has ended (review N7)', () => {
  assert.equal(EXTRA_TIME_WORDS, 'extra time');
  const classEndsAt = new Date(NOW + 10 * 60 * 1000);
  const endsAt = new Date(NOW + 25 * 60 * 1000);
  assert.match(describeDolClose({ status: 'active', extendedTime: true, endsAt }).openNotice, /— extra time\./);
  // The moment, from the student's own DOL state: only with extra time.
  assert.equal(extraTimeFrom({ extendedTime: true, classEndsAt }), classEndsAt.getTime());
  assert.equal(extraTimeFrom({ extendedTime: false, classEndsAt }), null, 'a classmate never reads it');
  assert.equal(extraTimeFrom({ extendedTime: true, classEndsAt: null }), null);
  // Both sides of the class's close: before it a neighbour reads nothing about an accommodation.
  assert.equal(saysExtraTime(classEndsAt.getTime(), NOW), false, 'while the class still has time');
  assert.equal(saysExtraTime(classEndsAt.getTime(), classEndsAt.getTime() - 1), false);
  assert.equal(saysExtraTime(classEndsAt.getTime(), classEndsAt.getTime()), true, 'from the class\'s close');
  assert.equal(saysExtraTime(classEndsAt.getTime(), classEndsAt.getTime() + 60_000), true);
  assert.equal(saysExtraTime(null, NOW), false);
  const dashboard = (extendedTime) => ({ activeDols: [{ assignment: { id: 'a1', title: 'Lesson a1' }, questionIndices: [3], openQuestionIndices: [3], state: { status: 'active', endsAt, classEndsAt, extendedTime } }] });
  assert.equal(resolveNextAction({ dashboard: dashboard(true) }).extraTimeFrom, classEndsAt.getTime());
  assert.equal(resolveNextAction({ dashboard: dashboard(false) }).extraTimeFrom, null);
  const home = read('src/components/student/WhatShouldIDoNow.jsx');
  const closes = region(home, '<div data-next-action-closes', '</div>');
  assert.match(closes, /\{describeClosesAt\(nextAction\.closesAt\)\}\s*(?:\{\s*\}\s*)?\{saysExtraTime\(nextAction\.extraTimeFrom\) \? ` — \$\{EXTRA_TIME_WORDS\}` : ''\}/);
  const pill = read('src/components/student/SectionTimeLeft.jsx');
  assert.match(pill, /const extraTime = saysExtraTime\(extraTimeFrom, nowMs\);/, 'the pill decides on its own one-second clock');
  assert.match(pill, /\{compact \? null : `\$\{label\} open\$\{extraTime \? ` · \$\{EXTRA_TIME_WORDS\}` : ''\}`\}/);
  assert.match(pill, /`\$\{label\} is open\$\{extraTime \? ` \(\$\{EXTRA_TIME_WORDS\}\)` : ''\}/, 'and in the words a screen reader is given');
  assert.match(app, /<SectionTimeLeft label=\{EXIT_TICKET\}[^>]*extraTimeFrom=\{extraTimeFrom\(dolState\)\} \/>/);
  assert.match(app, /^import \{ extraTimeFrom \} from '\.\/platform\/assessment\/extraTimeWords\.js';$/m);
});

/* ---- 4. "not being saved" across a reload of the tab ---------------------- */

test('a backup problem is kept across a reload while the draft is still on the device, and clears the moment it saves', async () => {
  const fakeStorage = (entries = {}) => {
    const map = new Map(Object.entries(entries));
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: (key) => { map.delete(key); },
      get length() { return map.size; },
      key: (index) => [...map.keys()][index] ?? null,
    };
  };
  const draft = (question) => `mathmaster:draft:v2::stu-1:a1:${question}`;
  const previousWindow = globalThis.window;
  globalThis.window = { sessionStorage: fakeStorage(), localStorage: fakeStorage({ [draft(0)]: '{}', [draft(1)]: '{}' }) };
  let load = 0;
  // A fresh module instance is what a reload of the tab gives.
  const reload = () => import(`../../src/platform/persistence/draftSaveHealth.js?reload=${load += 1}`);
  try {
    const first = await reload();
    first.reportDraftSaveProblem(first.DRAFT_SAVE_PROBLEM.BACKUP_REFUSED, draft(0));
    first.reportDraftSaveProblem(first.DRAFT_SAVE_PROBLEM.BACKUP_FULL, draft(1));
    first.reportDraftSaveProblem(first.DRAFT_SAVE_PROBLEM.DEVICE_FULL, draft(0));

    // Question 1's draft is retired before the reload: no longer unsaved work.
    window.localStorage.removeItem(draft(1));
    const second = await reload();
    assert.deepEqual(second.currentDraftSaveProblems(), { 'device-full': 0, 'backup-refused': 1, 'backup-full': 0 },
      'the refused backup is still true; storage-full is found again by the next write; a retired draft is dropped');
    assert.equal(second.describeDraftSaveProblems(second.draftSaveProblemsForStudent('stu-1'))?.kind, 'backup-refused', 'Home says it after the reload');

    // Backed up at last: the notice goes, and does not come back on the next reload.
    second.clearDraftSaveProblem(second.DRAFT_SAVE_PROBLEM.BACKUP_REFUSED, draft(0));
    const third = await reload();
    assert.deepEqual(third.currentDraftSaveProblems(), { 'device-full': 0, 'backup-refused': 0, 'backup-full': 0 });

    // Sign-out clears everything, kept copy included.
    third.reportDraftSaveProblem(third.DRAFT_SAVE_PROBLEM.BACKUP_REFUSED, draft(0));
    third.clearDraftSaveProblems();
    assert.equal(window.sessionStorage.getItem('mathmaster:draft-save-health:v1'), null);

    // A kept copy that cannot be read starts clear, as before.
    window.sessionStorage.setItem('mathmaster:draft-save-health:v1', '{not json');
    assert.deepEqual((await reload()).currentDraftSaveProblems(), { 'device-full': 0, 'backup-refused': 0, 'backup-full': 0 });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('App clears the kept problems when an account gives way, never when one arrives (a reload)', () => {
  const effect = region(app, 'const draftHealthAccountRef = useRef(null);', '}, [user?.id]);');
  assert.match(effect, /const account = user\?\.id \|\| null;\s*if \(accountChangeClearsDraftProblems\(draftHealthAccountRef\.current, account\)\) clearDraftSaveProblems\(\);\s*draftHealthAccountRef\.current = account;/);
  // The old cleanup ran on every change of user?.id, null → student included,
  // which wiped what was kept for the reload as the account loaded.
  assert.doesNotMatch(app, /useEffect\(\(\) => \(\) => \{ clearDraftSaveProblems\(\); \}, \[user\?\.id\]\);/);
});
