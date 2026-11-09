/*
 * WHAT APP STILL DID ON EVERY SUBMIT AND NEXT.
 *
 * QuestionEngine is drawn only when its props change (questionEngineStableProps
 * .test.mjs). App itself rendered seven to thirteen times on a Submit or a
 * Next, measured at 4x CPU on a production build
 * (tests/browser/teacherWorkflow/studentRuntimePerformance.mjs, counts and
 * profile modes):
 *
 *   - the save line's subject followed the status through an effect, so every
 *     change of the status cost App a render of its own after the one that
 *     showed it (three on each Submit and each Next);
 *
 * Node cannot render App.jsx; this file holds the pieces it can check: the
 * helpers, a model of the save line before and after, and where App wires them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRenderFold, FOLD_STEPS } from '../../src/platform/performance/renderStability.js';
import {
  describeRuntimeSaveLine, initialSaveSubject, nextSaveSubject, persistenceStatusAfterDrain,
  persistenceStatusOnAssignmentChange, persistenceStatusWithQueuedWork, saveLineIsAboutDrafts,
} from '../../src/platform/student/saveStatusModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = () => executableSource(read('src/App.jsx'));

/* ------------------------------------------------------------ renderFold */

test('a render fold follows each render from the value the last one worked out', () => {
  const fold = createRenderFold();
  const base = { count: 0 };
  // One step per call while the event says to move on: as an effect's renders did.
  const toward = (target) => (value) => (value.count < target ? { count: value.count + 1 } : value);
  assert.deepEqual(fold('n', base, toward(2)), { count: 2 }, 'settled in one call');
  const settled = fold('n', base, toward(2));
  assert.equal(fold('n', base, toward(2)), settled, 'nothing new: the same value, not a copy');
  assert.deepEqual(fold('n', base, toward(5)), { count: 5 }, 'from the last value, not from the base');
  // The host's state moved the base (a reset): the fold starts from it.
  const reset = { count: 0 };
  assert.deepEqual(fold('n', reset, toward(1)), { count: 1 });
  // Names are independent.
  assert.equal(fold('other', base, toward(0)), base);
});

test('a render fold settles in at most a few steps, and a handler starts from what it shows', () => {
  const fold = createRenderFold();
  let steps = 0;
  const forever = (value) => { steps += 1; return { count: value.count + 1 }; };
  assert.equal(fold('loop', { count: 0 }, forever).count, FOLD_STEPS, 'a step that never settles stops');
  assert.equal(steps, FOLD_STEPS);
  const base = { pending: false };
  const shown = fold('subject', base, (value) => (value.pending ? value : { pending: true }));
  // A handler's update made from the state the fold started from starts from
  // the value the render showed; one made from another state starts from it.
  assert.equal(fold.from('subject', base), shown);
  const other = { pending: false };
  assert.equal(fold.from('subject', other), other);
  assert.equal(fold.from('never', other), other);
});

/* ------------------------------------------------- the save line's subject */
/*
 * THE LINE SAYS WHAT IT SAID, AT THE SAME RENDERS.
 *
 * A model of App's save line, driven through the ticks App's code produces
 * (a handler's capture, its enqueue, a drain, the reconcile's queued work, a
 * refusal, a new assignment or student), before (an effect commits the
 * subject each render worked out) and after (renderFold). At every render
 * the ticks cause, the two show the same words; before, the effect's own
 * renders after them change no word, and there is at least one per change of
 * the status.
 */
const NOTHING = Object.freeze({ accepted: 0, duplicate: 0, superseded: 0, permanentlyInvalid: 0, needsReview: 0, retryable: 0, failed: 0 });
const said = ({ status, subject, depth, pgc }) => JSON.stringify([
  describeRuntimeSaveLine({ persistenceStatus: status, subject, outboxDepth: depth, pendingGradeCount: pgc }),
  saveLineIsAboutDrafts({ persistenceStatus: status, subject, pendingGradeCount: pgc }),
]);

// A seeded generator, so a failure names a sequence that can be run again.
const generator = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

// The ticks App's code produces. Each is a list of updates React batches into
// one render: status (a value or an update function), pgc, depth, the
// subject's own events (an answer sent, a reset).
const randomTick = (random) => {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const kind = pick(['capture', 'enqueue', 'enqueueAnswer', 'refused', 'drain', 'drain', 'reconcile', 'reconcileAnswers', 'assignment', 'student']);
  switch (kind) {
    case 'capture': return [{ status: 'capturing' }];
    case 'enqueue': return [{ depth: (depth) => depth + 1 }, { status: 'queued' }];
    case 'enqueueAnswer': return [{ event: 'answer-sent' }, { depth: (depth) => depth + 1 }, { status: 'queued' }];
    case 'refused': return [{ status: 'volatile' }];
    case 'reconcile': return [{ depth: () => 1 + Math.floor(random() * 3) }, { status: persistenceStatusWithQueuedWork }];
    case 'reconcileAnswers': return [{ event: 'answer-sent' }, { depth: () => 1 + Math.floor(random() * 3) }, { status: persistenceStatusWithQueuedWork }];
    case 'assignment': return [{ event: 'reset' }, { status: persistenceStatusOnAssignmentChange }];
    case 'student': return [{ event: 'reset' }, { status: () => 'idle' }];
    default: {
      // A drain: what it leaves owed, the grade-bearing part of it, its tally.
      const remaining = pick([0, 0, 0, 1, 2]);
      const remainingGrade = remaining ? Math.floor(random() * (remaining + 1)) : 0;
      const tally = { ...NOTHING, ...pick([{}, { accepted: 1 }, { duplicate: 1 }, { needsReview: remaining ? 1 : 0 }, { permanentlyInvalid: 1 }, { retryable: remaining }]) };
      const online = random() > 0.2;
      const successStatus = pick(['durable', 'submitted']);
      return [
        { depth: () => remaining },
        { pgc: () => remainingGrade },
        { status: (status) => persistenceStatusAfterDrain({ status, remaining, tally, online, successStatus }) },
      ];
    }
  }
};

const apply = (state, tick, subjectEvent) => {
  const next = { ...state };
  for (const update of tick) {
    if (update.status) next.status = typeof update.status === 'function' ? update.status(next.status) : update.status;
    if (update.depth) next.depth = update.depth(next.depth);
    if (update.pgc) next.pgc = update.pgc(next.pgc);
    if (update.event) next.subjectState = subjectEvent(next, update.event);
  }
  return next;
};

// Before: the render derives the subject from the state, and an effect
// commits it, a render of its own, until it holds.
const before = (ticks) => {
  let state = { status: 'idle', depth: 0, pgc: 0, subjectState: initialSaveSubject() };
  const renders = [];
  let effectRenders = 0;
  for (const tick of ticks) {
    state = apply(state, tick, (current, event) => (event === 'reset' ? initialSaveSubject() : nextSaveSubject(current.subjectState, { type: 'answer-sent' })));
    let subject = nextSaveSubject(state.subjectState, { type: 'status', status: state.status, pendingGradeCount: state.pgc });
    const words = said({ ...state, subject });
    renders.push(words);
    while (subject !== state.subjectState) {
      state = { ...state, subjectState: subject };
      subject = nextSaveSubject(state.subjectState, { type: 'status', status: state.status, pendingGradeCount: state.pgc });
      effectRenders += 1;
      assert.equal(said({ ...state, subject }), words, 'an effect\'s render changed no word');
    }
  }
  return { renders, effectRenders };
};

// After: App's code, with renderFold.
const after = (ticks) => {
  const fold = createRenderFold();
  let state = { status: 'idle', depth: 0, pgc: 0, subjectState: initialSaveSubject() };
  const renders = [];
  for (const tick of ticks) {
    state = apply(state, tick, (current, event) => (event === 'reset'
      ? initialSaveSubject()
      : nextSaveSubject(fold.from('saveSubject', current.subjectState), { type: 'answer-sent' })));
    const subject = fold('saveSubject', state.subjectState, (value) => nextSaveSubject(value, { type: 'status', status: state.status, pendingGradeCount: state.pgc }));
    renders.push(said({ ...state, subject }));
  }
  return renders;
};

test('the save line says what it said at every render, with no render of its own for the subject', () => {
  let effectRenders = 0;
  let statusChanges = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const random = generator(seed);
    const ticks = Array.from({ length: 30 }, () => randomTick(random));
    const was = before(ticks);
    assert.deepEqual(after(ticks), was.renders, `seed ${seed}`);
    effectRenders += was.effectRenders;
    let status = 'idle';
    for (const tick of ticks) {
      const next = apply({ status, depth: 0, pgc: 0, subjectState: initialSaveSubject() }, tick, () => initialSaveSubject()).status;
      if (next !== status) statusChanges += 1;
      status = next;
    }
  }
  // The premise: the effect took a render of its own on every change of the status.
  assert.ok(effectRenders >= statusChanges, `${effectRenders} effect renders for ${statusChanges} changes of the status`);
});

test('a Submit, step by step: the same words at its three renders, and none after them', () => {
  const submit = [
    [{ status: 'capturing' }],
    [{ event: 'answer-sent' }, { depth: (depth) => depth + 1 }, { status: 'queued' }],
    [{ depth: () => 0 }, { pgc: () => 0 }, { status: (status) => persistenceStatusAfterDrain({ status, remaining: 0, tally: { ...NOTHING, accepted: 1 }, successStatus: 'submitted' }) }],
  ];
  const was = before(submit);
  assert.deepEqual(after(submit), was.renders);
  assert.deepEqual(was.renders.map((entry) => JSON.parse(entry)[0]), ['Saving…', 'Answer saved on this device · sending it to MathMaster. You may keep working.', 'Answer recorded by MathMaster.']);
  assert.equal(was.effectRenders, 3, 'before: one render more for each of them');
});

test('App folds the save line\'s subject in render, and no effect commits it', () => {
  const code = app();
  assert.match(code, /\n {2}const \[stableCallbacks, renderMemo, renderFold\] = useRenderStability\(\);\n/);
  const subject = region(code, 'const [studentSaveSubjectState, setStudentSaveSubject] = useState(initialSaveSubject);', 'const studentSaveLine = ', 'the subject');
  assert.match(subject, /const studentSaveSubject = renderFold\('saveSubject', studentSaveSubjectState, \(subject\) => nextSaveSubject\(subject, \{ type: 'status', status: studentPersistenceStatus, pendingGradeCount: studentPendingGradeCount \}\)\);/);
  // The state is set only by a handler's answer and the resets, never from what a render worked out.
  assert.equal((code.match(/setStudentSaveSubject\(/g) || []).length, 2, 'the answer sent, and the reset');
  assert.match(code, /const markAnswerSent = \(\) => setStudentSaveSubject\(\(current\) => nextSaveSubject\(renderFold\.from\('saveSubject', current\), \{ type: 'answer-sent' \}\)\);/);
  assert.match(code, /useEffect\(\(\) => \{\s*setStudentSaveSubject\(initialSaveSubject\(\)\);\s*\}, \[activeAssignmentId, user\?\.id\]\);/);
  assert.doesNotMatch(code, /studentSaveSubject !== studentSaveSubjectState/);
});
