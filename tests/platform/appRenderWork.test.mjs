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
 *   - updates that changed nothing drew it again: the grade document's two
 *     snapshots after each save, whose maps say what they said, as new
 *     objects; the place to resume, the same after a Submit; the device
 *     report's "nothing went wrong", the same null, twice; an empty list of
 *     answers needing review, new on every drain (every 10 seconds);
 *   - memos keyed on the tracker that nothing inside an assignment shows (the
 *     Grade Center, the Recovery summaries, My Math Path's options, the
 *     Practice Pass list) ran again on each of a Submit's tracker changes,
 *     about 60 ms of a Submit at 4x;
 *   - the navigator's section access and question lines ran on every render,
 *     8 to 13 ms of a Submit.
 *
 * Node cannot render App.jsx; this file holds the pieces it can check: the
 * helpers, a model of the save line before and after, and where App wires them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRenderFold, createRenderMemo, FOLD_STEPS, keepSame, sameData } from '../../src/platform/performance/renderStability.js';
import {
  describeRuntimeSaveLine, initialSaveSubject, nextSaveSubject, persistenceStatusAfterDrain,
  persistenceStatusOnAssignmentChange, persistenceStatusWithQueuedWork, saveLineIsAboutDrafts,
} from '../../src/platform/student/saveStatusModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { questionRecordView } from '../../src/platform/performance/questionRecordView.js';
import {
  normalizeQuestionRecord, recordQuestionAttempt, recordQuestionStep, requestReplacementQuestion,
} from '../../src/attemptPolicy.js';
import { overlayDurableActionsOnGrades } from '../../src/platform/performance/durableActionOutbox.js';
import { adoptCanonicalAdvances } from '../../src/platform/persistence/canonicalTrackerReconciliation.js';
import { mergePracticeTrackers } from '../../src/platform/student/practiceTrackerMerge.js';
import { createProfileReader } from '../browser/support/cpuProfileNames.mjs';
import {
  APP_RENDER_BUDGET, DEFERRED_BUILDERS, DEFERRED_MEMO_BUDGET_MS, appComponentLine, createAppRenderMeasures, definitionLine, timeUnder,
} from '../browser/support/appRenderMeasures.mjs';

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

/* ------------------------------------------------- what changes nothing */

test('sameData compares what a snapshot holds by content, a Timestamp by its fields and a Date by its time', () => {
  class Timestamp { constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; } }
  class Other { constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; } }
  const receipt = (overrides = {}) => ({ 'lesson-3': { grade: 90, stage: 'draft', sentAt: new Timestamp(10, 5), log: [1, { at: new Date(1000) }], ...overrides } });
  assert.ok(sameData(receipt(), receipt()), 'two snapshots of one map');
  assert.ok(sameData({ a: 1, b: 2 }, { b: 2, a: 1 }), 'key order is not content');
  assert.ok(!sameData(receipt(), receipt({ grade: 91 })));
  assert.ok(!sameData(receipt(), receipt({ sentAt: new Timestamp(10, 6) })), 'a Timestamp by its fields');
  assert.ok(!sameData(receipt(), receipt({ log: [1, { at: new Date(1001) }] })), 'a Date by its time, not as {}');
  assert.ok(!sameData(new Timestamp(1, 2), new Other(1, 2)), 'another class is another value');
  assert.ok(!sameData(new Date(5), { }), 'a Date is not an empty map');
  assert.ok(!sameData([1, 2], { 0: 1, 1: 2 }), 'a list is not a map');
  assert.ok(!sameData({ a: 1 }, { a: 1, b: undefined }), 'a key more');
  assert.ok(!sameData({ a: 1, c: undefined }, { a: 1, b: undefined }), 'another key');
  assert.ok(sameData(Number.NaN, Number.NaN));
  assert.ok(!sameData(null, {}));
  assert.ok(!sameData(0, '0'));
});

test('keepSame keeps the value a state holds while the new one says the same', () => {
  const held = { 'lesson-3': { score: 100 } };
  assert.equal(keepSame({ 'lesson-3': { score: 100 } })(held), held, 'the same identity: nothing keyed on it is worked out again');
  const changed = { 'lesson-3': { score: 90 } };
  assert.equal(keepSame(changed)(held), changed);
  const empty = [];
  assert.equal(keepSame([])(empty), empty, 'an empty list stays the list it was');
});

test('App renders nothing for a snapshot, a resume, a report or a drain that changes nothing', () => {
  const code = app();
  // The grade document's listener: every map it sets is kept while it says the same.
  const listener = region(code, "doc(db, 'grades', user.id),\n      (snapshot) => {", 'const liveProfile = ', 'the grade document listener');
  const maps = ['classroomSyncStatusByAssignment', 'testCycleGrades', 'teacherGradeOverridesByAssignment', 'sectionRecoveryByAssignment', 'warmupChallengeByAssignment', 'dolGradesByAssignment', 'classworkGradesByAssignment'];
  for (const map of maps) {
    const setter = `set${map[0].toUpperCase()}${map.slice(1)}(`;
    const calls = listener.split(setter).slice(1);
    assert.equal(calls.length, 1, `${map}: set once`);
    assert.match(calls[0], /^keepSame\(/, `${map}: kept while it says the same`);
  }
  assert.match(listener, /setClassroomSyncStatusByAssignment\(keepSame\(next\)\);/);
  // What else it sets is already kept while it says the same.
  assert.match(listener, /setTracker\(\(current\) => \{[\s\S]*adoptCanonicalAdvances\(current, serverGrades\)[\s\S]*return grades;/);
  // The place to resume: set only when it is another place.
  const resume = region(code, 'const action = {\n      assignmentId: activeAssignmentId,', '}, [user, activeView, activeAssignmentId, currentQuestionIndex, assignments, activeQuestionRole, tracker]);', 'the resume effect');
  assert.match(resume, /if \(!sameData\(resumeAction, action\)\) setResumeAction\(action\);\s*$/);
  assert.equal((resume.match(/setResumeAction\(/g) || []).length, 1);
  // The device report's error: set only when it says something new, and only through that.
  assert.match(code, /const showStudentReportingError = \(reason\) => \{\s*if \(studentReportingErrorRef\.current === reason\) return;\s*studentReportingErrorRef\.current = reason;\s*setStudentReportingError\(reason\);\s*\};/);
  assert.equal((code.match(/setStudentReportingError\(/g) || []).length, 1, 'set nowhere else');
  assert.equal((code.match(/studentReportingErrorRef\.current = /g) || []).length, 1, 'the ref is the value last set');
  const settled = region(code, 'onSettled: ({ ok, error }) => {', "console.warn('Device queue report unavailable:'", 'the report settled');
  assert.match(settled, /if \(ok\) \{\s*showStudentReportingError\(null\);\s*return;\s*\}/);
  assert.match(settled, /showStudentReportingError\(diagnostic\.safeReason\);/);
  // The answers needing review: the same list while it names the same assignments.
  const drain = region(code, 'const drainStudentOutbox = async', 'return result;', 'the drain');
  assert.match(drain, /setStudentNeedsReviewAssignmentIds\(keepSame\(\[\.\.\.new Set\(/);
});

/* ------------------------------------- worked out when a screen shows them */

test('a value a screen asks for is worked out when it asks, from the inputs as they are then', () => {
  const renderMemo = createRenderMemo();
  const built = [];
  let tracker = { version: 0 };
  const gradeCenterNow = () => renderMemo('gradeCenter', [tracker], () => { built.push(tracker.version); return { builtFrom: tracker.version }; });
  // Home shows it: worked out.
  assert.deepEqual(gradeCenterNow(), { builtFrom: 0 });
  // Inside the assignment: four Submits change the tracker; nothing asks.
  for (let version = 1; version <= 4; version += 1) tracker = { version };
  assert.deepEqual(built, [0], 'nothing worked out while no screen shows it');
  // Back on Home: worked out once, from the tracker as it is now.
  assert.deepEqual(gradeCenterNow(), { builtFrom: 4 });
  // Home and its count ask again in the same render: the same value.
  assert.equal(gradeCenterNow(), gradeCenterNow());
  assert.deepEqual(built, [0, 4]);
});

// The four, each with the inputs its memo had (a change to any of them is a
// change to what the screens show, and must work it out again).
const DEFERRED = {
  studentRecoverySummariesNow: ['recoverySummaries', 'studentRecoveryKit, user?.role, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, classSchedule, studentRecoveryMinute', 'studentRecoveryKit.buildRecoverySummariesByAssignment('],
  studentGradeCenterNow: ['gradeCenter', 'user, assignments, now, gradeDisplayTracker, testCycleGrades, classworkGradesByAssignment, gradingPeriodSettings, classroomSyncStatusByAssignment, studentClassPoints.redemptionsByAssignment, sectionRecoveryByAssignment, teacherGradeOverridesByAssignment', 'buildStudentGradeCenter('],
  studentPracticePassEligibleNow: ['practicePassEligible', 'user, assignments, gradeDisplayTracker, studentClassPoints.redemptionsByAssignment, now', 'practicePassEligibleAssignments('],
  studentPathOptionsNow: ['pathOptions', 'studentRecord, studentPathAssignments, studentCourseId, studentStoredPacing, studentOverrides, studentServerMasteryProfiles', 'buildStudentPathOptions('],
};

test('App works out the Grade Center, the Recovery summaries, the Path options and the Practice Pass list only for the screens that show them', () => {
  const code = app();
  const screens = code.indexOf('function buildStudentDashboardNow() {');
  const assignmentBranch = code.lastIndexOf('if (isStudentAssignment) {');
  assert.ok(screens > 0 && assignmentBranch > screens, 'the student screens, then the assignment');
  const workspace = region(code, 'const renderAssignmentWorkspace = (preview = false) => {', 'const renderWhatChangedPanel = ', 'the assignment workspace');
  for (const [name, [slot, inputs, builder]] of Object.entries(DEFERRED)) {
    // Made once, through renderMemo, on the inputs the memo had.
    const definition = new RegExp(`const ${name} = \\(\\) => renderMemo\\('${slot}', \\[\\s*([^\\]]*?)\\s*\\], \\(\\) =>`);
    const found = definition.exec(code);
    assert.ok(found, `${name} is a renderMemo`);
    assert.equal(found[1].replace(/\s+/g, ' ').replace(/,\s*$/, ''), inputs, `${name}: its inputs`);
    const builds = code.indexOf(builder, found.index);
    assert.ok(builds > found.index && builds - found.index < 900, `${name} builds with ${builder}`);
    // (The teacher's views build other students' Path options with the same builder.)
    if (name !== 'studentPathOptionsNow') assert.equal(code.split(builder).length - 1, 1, `${builder} is called only there`);
    assert.doesNotMatch(workspace, new RegExp(builder.replace(/[.()]/g, '\\$&')), `${builder}: not inside the assignment`);
    // Asked for only by the screens outside an assignment.
    const calls = [...code.matchAll(new RegExp(`\\b${name}\\(\\)`, 'g'))].map((match) => match.index);
    assert.ok(calls.length >= 2, `${name}: asked for`);
    for (const at of calls) {
      const where = code.slice(Math.max(0, code.lastIndexOf('\n', at)), at).trim();
      const insideTheScreens = at > screens && at < assignmentBranch;
      const pacing = name === 'studentPathOptionsNow' && /^const studentPacingNow = \(\) =>$/.test(where);
      assert.ok(insideTheScreens || pacing, `${name}() asked for outside the student screens: ${where}`);
    }
    assert.doesNotMatch(workspace, new RegExp(`\\b${name}\\(`), `${name}: nothing inside the assignment asks`);
  }
  // No memo of the old kind is left, and nothing reads a value by its old name.
  for (const old of ['studentGradeCenter', 'studentRecoverySummariesByAssignment', 'studentPathOptions', 'studentPacing', 'studentPracticePassEligibleAssignments']) {
    // (A module's path is not a read: platform/path/studentPathOptions.js.)
    assert.doesNotMatch(code, new RegExp(`(?<![/.\\w])${old}\\b(?!Now|\\.js)`), `${old} is read through its accessor`);
  }
  // Pacing follows the options it is read from.
  assert.match(code, /const studentPacingNow = \(\) => studentPathOptionsNow\(\)\?\.pacing \|\| studentStoredPacing;/);
});

/* ------------------------------------------------------- the navigator */

// The names an expression reads (not property names, object keys, or the
// words inside its strings): what a memo of it must be keyed on.
const freeNames = (text) => {
  const code = text
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|\$\{([^{}]*)\}|[^`\\])*`/g, (literal) => [...literal.matchAll(/\$\{([^{}]*)\}/g)].map((match) => ` (${match[1]}) `).join(''));
  const names = new Set();
  for (const match of code.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const before = code.slice(0, match.index).trimEnd();
    const after = code.slice(match.index + match[0].length).trimStart();
    if (/(\?\.|\.)$/.test(before)) continue; // a property
    if (/(^|[{,])$/.test(before) && after.startsWith(':')) continue; // an object key
    names.add(match[0]);
  }
  return names;
};
const only = (text, allowed, label) => {
  const extra = [...freeNames(text)].filter((name) => !allowed.has(name));
  assert.deepEqual(extra, [], `${label} reads what its memo is not keyed on`);
};
const JS = new Set(['const', 'return', 'undefined', 'null', 'true', 'false', 'Boolean']);

test('the navigator works out a section\'s access once per change of what it reads', () => {
  const code = app();
  const access = region(code, 'const sectionAccessFor = (entry) => {', 'sectionAccessCache.set(', 'sectionAccessFor');
  const memo = /renderMemo\(`navigatorSection\|\$\{cacheKey\}`, \[([^\]]*)\], \(\) => describeSectionAccess\(\{([\s\S]*)\}\)\);\s*$/.exec(access);
  assert.ok(memo, 'describeSectionAccess, through renderMemo, per role and timing');
  const inputs = memo[1].split(',').map((input) => input.trim());
  assert.deepEqual(inputs, ['preview', 'lifecycle', 'warmupState', 'dolState', 'getSectionAccessState', 'assignment', 'user?.classId', 'user?.classPeriod', 'user?.role', 'user?.id', 'now', 'hasWork']);
  // The slot's name carries the rest: the entry's role and whether it is the timed exit ticket.
  assert.match(access, /const cacheKey = `\$\{entry\?\.role\}\|\$\{entry\?\.isTimedDOLQuestion \? 'timed' : ''\}`;/);
  assert.match(access, /const hasWork = sectionHasWork\(entry\?\.role\);/);
  // What it reads: those inputs, the entry's role and timing, and constants.
  only(memo[2], new Set([...JS, 'entry', 'preview', 'lifecycle', 'warmupState', 'dolState', 'getSectionAccessState', 'assignment', 'user', 'now', 'hasWork', 'exitTicketInSentence', 'activitySectionMeta']), 'the section access');
  const users = [...memo[2].matchAll(/\buser(?:\?\.|\.)(\w+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(users)].sort(), ['classId', 'classPeriod', 'id', 'role']);
  const entries = [...memo[2].matchAll(/\bentry\?\.(\w+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(entries)].sort(), ['isTimedDOLQuestion', 'role']);
  // activitySectionMeta is made in the render, of constant labels.
  assert.match(code, /const activitySectionMeta = \{\n\s*warmup: \{ label: 'Warm-Up', /);
});

test('the navigator works out a question\'s line once per change of what it reads, but a family slot\'s every time', () => {
  const code = app();
  const question = region(code, 'const navigatorQuestionFor = (entry) => {', '\n    };', 'navigatorQuestionFor');
  const describe = region(question, 'const describe = () => describeNavigatorQuestion({', '\n      });', 'the description');
  const memo = /\n\s*if \(isFamilyBackedQuestion\(questions\[entry\.index\]\)\) return describe\(\);\n\s*return renderMemo\(`navigatorQuestion\|\$\{entry\.index\}`, \[([\s\S]*?)\], describe\);\s*$/.exec(question);
  assert.ok(memo, 'a family slot every time; any other through renderMemo, per question');
  const inputs = memo[1].split(',').map((input) => input.trim());
  assert.deepEqual(inputs, ['entry.role', 'workingTracker?.[entry.index]', 'questions[entry.index]', 'assignment', 'preview', 'lifecycle.isPracticeOnly', 'access', 'user?.classId', 'user?.role', 'user?.id', 'familyDelivery']);
  // What the line and the helpers it calls read, all of it among those inputs.
  const helpers = {
    entryMaximumAttempts: region(code, 'const entryMaximumAttempts = (entry) => {', '\n    };', 'entryMaximumAttempts'),
    entryRuntimePolicy: region(code, 'const entryRuntimePolicy = (entry) => ', ';\n', 'entryRuntimePolicy'),
    entryFeedbackHeld: region(code, 'const entryFeedbackHeld = (entry) => ', '});\n', 'entryFeedbackHeld'),
  };
  const PURE = ['describeNavigatorQuestion', 'getEffectiveActivityPolicy', 'resolveQuestionMaximumAttempts', 'resolveTeacherGrantedExtraAttempts', 'outcomeWithheld', 'assignmentFeedbackWasReleased', 'resolveQuestionReplacementAllowed', 'SECTION_ACCESS',
    // On a stored slot that is not a family slot these hand back the stored
    // question and `true` without reading what the page was shown
    // (shownFamilyQuestion.js); isPersonalizedBlueprint asks familyDelivery.
    'countedQuestionFor', 'countedQuestionKnownFor', 'isPersonalizedBlueprint'];
  const allowed = new Set([...JS, ...PURE, ...Object.keys(helpers), 'entry', 'access', 'policy', 'workingTracker', 'questions', 'assignment', 'preview', 'lifecycle', 'user', 'familyDelivery']);
  only(describe.slice(describe.indexOf('=>') + 2), allowed, 'the question line');
  for (const [name, body] of Object.entries(helpers)) only(body.slice(body.indexOf('=>') + 2), allowed, name);
  // The record and the question only of this entry; the lifecycle only for post-deadline practice.
  const all = [describe, ...Object.values(helpers)].join('\n');
  for (const match of all.matchAll(/\bworkingTracker\b(.{0,15})/g)) assert.match(match[1], /^\?\.\[entry\.index\]/, `workingTracker${match[1]}`);
  for (const match of all.matchAll(/\bquestions\b(.{0,13})/g)) assert.match(match[1], /^\[entry\.index\]/, `questions${match[1]}`);
  for (const match of all.matchAll(/\blifecycle\.(\w+)/g)) assert.equal(match[1], 'isPracticeOnly');
  for (const match of all.matchAll(/\buser(?:\?\.|\.)(\w+)/g)) assert.ok(['classId', 'role', 'id'].includes(match[1]), `user.${match[1]}`);
  for (const match of all.matchAll(/\bentry\.(\w+)/g)) assert.ok(['index', 'role'].includes(match[1]), `entry.${match[1]}`);
  assert.match(code, /const isPersonalizedBlueprint = \(question\) => Boolean\(familyDelivery\?\.canGenerateDistinctVariants\(question\)\);/);
  // What the page was shown is read only for a family slot.
  const counting = region(read('src/platform/generation/shownFamilyQuestion.js'), 'export const countedQuestion = ({', 'export const countedQuestionKnown', 'countedQuestion');
  assert.match(counting, /if \(!assignmentId \|\| !isFamilyBackedQuestion\(storedQuestion\)\) return fallback;/);
  const known = region(read('src/platform/generation/shownFamilyQuestion.js'), 'export const countedQuestionKnown = ({', null, 'countedQuestionKnown');
  assert.match(known, /if \(!assignmentId \|\| !isFamilyBackedQuestion\(storedQuestion\) \|\| preview \|\| typeof deal === 'function'\) return true;/);
});

/* ------------------------------------- shared code, once per change (3rd pass) */
/*
 * WHAT A RENDER READS OF THE BELL SCHEDULE, THE LIFECYCLE AND THE RECORDS.
 *
 * After the second pass App still asked shared Functions code the same
 * questions on every one of its renders (five to seven a Submit, counting the
 * ones React makes for an update that changes nothing): the pack-up line's
 * bell window, the lobby invite's rule, the workspace's section access, held
 * feedback, current content and due dates, each lesson's Warm-Up window on
 * every tracker change, and the normalised records of the open assignment.
 * Each is now kept until something it reads changes: renderMemo on exactly
 * its inputs, or for a record, a view kept with the record
 * (questionRecordView). What each memo reads is checked against what it is
 * keyed on, as the navigator's are above.
 */

test('a stored record is normalised once, and its view is what the attempt policy reads', () => {
  const record = { status: 'incorrect', attemptCount: '2', variantIndex: 1, timeSpent: 40, supportUsage: { hintUsed: true }, stepGrades: [{ variantIndex: 1, equationBefore: 'x+1=2', equationAfter: 'x=1', earned: 1, possible: 2, expectedTotalPoints: 2 }] };
  const view = questionRecordView(record);
  assert.deepEqual(view, normalizeQuestionRecord(record));
  assert.equal(questionRecordView(record), view, 'the same record: the same view, not worked out again');
  const saved = { ...record, attemptCount: 3 };
  assert.notEqual(questionRecordView(saved), view, 'a save makes a new record, and it gets its own view');
  assert.equal(questionRecordView(saved).attemptCount, 3);
  assert.equal(questionRecordView(undefined), questionRecordView(null), 'no record: the one empty view');
  assert.deepEqual(questionRecordView(undefined), normalizeQuestionRecord(undefined));
  assert.deepEqual(questionRecordView('incorrect'), normalizeQuestionRecord('incorrect'), 'a legacy status string');
});

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

test('nothing that makes or merges records writes into a record it was given, so a record\'s view stays its view', () => {
  // A view is kept by the record object, so it is right only while no code
  // changes a record in place. These are the ways a tracker's records are
  // made on a student's device: a Submit, a step, a new version, an answer
  // still queued on this device, a record the server holds ahead, practice
  // after the deadline. Modules run in strict mode: a write into a frozen
  // record throws.
  const record = () => deepFreeze({ status: 'attempted', attemptCount: 1, totalAttempts: 1, variantIndex: 0, timeSpent: 12, stepGrades: [], partGrades: [], supportUsage: { hintUsed: false, accommodations: [] } });
  const expired = () => deepFreeze({ status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0 });
  const attempt = recordQuestionAttempt({ record: record(), isCorrect: true, questionDetails: 'x = 4', timeSpent: 30, parts: [] });
  assert.equal(attempt.record.status, 'correct');
  const step = recordQuestionStep({ record: record(), stepGrade: { variantIndex: 0, accepted: true, earned: 1, possible: 1, equationBefore: '3x=12', equationAfter: 'x=4' } });
  assert.ok(step.record || step);
  assert.equal(requestReplacementQuestion(expired()).variantIndex, 1);
  const tracker = deepFreeze({ 'a-1': { 0: record(), 1: expired() } });
  const overlaid = overlayDurableActionsOnGrades(tracker, [{ kind: 'questionProgress', assignmentId: 'a-1', questionIndex: 0, payload: { timeSpent: 99 }, capturedAt: 1 }]);
  assert.equal(overlaid['a-1'][0].timeSpent, 99);
  assert.equal(tracker['a-1'][0].timeSpent, 12, 'the record it was given is as it was');
  const server = deepFreeze({ 'a-1': { 0: { ...record(), attemptCount: 2, totalAttempts: 2 } } });
  const { grades } = adoptCanonicalAdvances(tracker, server);
  assert.equal(grades['a-1'][0], server['a-1'][0], 'the server record is adopted as it is');
  assert.equal(adoptCanonicalAdvances(grades, server).grades, grades, 'nothing ahead: the same tracker');
  assert.equal(mergePracticeTrackers(deepFreeze({ 0: record() }), deepFreeze({ 0: expired() }))[0].totalAttempts, 3);
});

const KEYWORDS = new Set([...JS, 'if', 'else', 'new', 'typeof']);
// A renderMemo slot's inputs and the text of what it works out.
const memoSlot = (code, name) => {
  const start = code.indexOf(`renderMemo('${name}', [`);
  assert.ok(start >= 0, `renderMemo('${name}', ...)`);
  let depth = 0;
  let at = start + `renderMemo('${name}', `.length;
  const inputsStart = at;
  for (; at < code.length; at += 1) {
    const char = code[at];
    if (char === '[' || char === '(' || char === '{') depth += 1;
    if (char === ']' || char === ')' || char === '}') depth -= 1;
    if (depth === 0) break;
  }
  const inputs = code.slice(inputsStart + 1, at).split(',').map((input) => input.trim()).filter(Boolean);
  // What follows the inputs, up to the call's own closing parenthesis.
  depth = 1;
  const bodyStart = at + 1;
  for (at = bodyStart; at < code.length && depth > 0; at += 1) {
    const char = code[at];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
  }
  return { inputs, body: code.slice(bodyStart, at - 1).replace(/^,\s*/, '') };
};
// What `user` (or another object) a text reads: the properties after it.
const propertiesOf = (text, name) => [...new Set([...text.matchAll(new RegExp(`\\b${name}(?:\\?\\.|\\.)(\\w+)`, 'g'))].map((match) => match[1]))].sort();

test('App works out the pack-up line, the lobby rule and the workspace\'s lifecycle reads once per change of what each reads', () => {
  const code = app();
  const PURE = ['getClassPackUpState', 'studentExtraTimeDolOpen', 'projectCurrentAssignmentContent', 'assignmentHasHeldTeacherFeedback', 'studentDueDateLines', 'getAssignmentLifecycle', 'sectionHoldsLobbyInvite', 'getEffectiveActivityPolicy', 'assignmentFeedbackWasReleased'];
  const cases = {
    packUp: { inputs: ['classSchedule', 'user.classPeriod', 'now'], user: ['classPeriod'] },
    packUpExtraTime: { inputs: ['assignments', 'classSchedule', 'user.classId', 'user.classPeriod', 'now'], user: ['classId', 'classPeriod'] },
    currentContent: { inputs: ['assignment'] },
    currentManualSectionState: { inputs: ['getSectionAccessState', 'assignment', 'activeQuestionRole', 'user?.classId', 'user?.classPeriod', 'now', 'preview', 'user?.role', 'user?.id'], user: ['classId', 'classPeriod', 'id', 'role'] },
    heldTeacherFeedback: { inputs: ['assignment'] },
    dueDateLines: { inputs: ['assignment', 'lifecycle'] },
  };
  for (const [name, expected] of Object.entries(cases)) {
    const { inputs, body } = memoSlot(code, name);
    assert.deepEqual(inputs, expected.inputs, `${name}: its inputs`);
    const roots = new Set(inputs.map((input) => input.split(/\?\.|\./)[0]));
    only(body.slice(body.indexOf('=>') + 2), new Set([...KEYWORDS, ...PURE, ...roots]), name);
    if (expected.user) assert.deepEqual(propertiesOf(body, 'user'), expected.user, `${name}: what it reads of the student`);
  }
  // The lobby rule: its function, keyed on the student, the screen, the
  // open assignment and question, the lessons, the clock and that
  // assignment's records (and only those of its records).
  const lobby = /const lobbyInviteHeldHere = renderMemo\('lobbyInviteHeld', \[([^\]]*\[activeAssignmentId\])\], studentWorkspaceHoldsOutcome\);/.exec(code);
  assert.ok(lobby, 'the lobby rule through renderMemo');
  assert.deepEqual(lobby[1].split(',').map((input) => input.trim()), ['user?.role', 'user?.id', 'activeView', 'activeAssignmentId', 'assignments', 'now', 'currentQuestionIndex', 'tracker?.[activeAssignmentId]']);
  const rule = region(code, 'const studentWorkspaceHoldsOutcome = () => {', '\n  };', 'the lobby rule');
  only(rule.slice(rule.indexOf('=>') + 2), new Set([...KEYWORDS, ...PURE, 'user', 'activeView', 'activeAssignmentId', 'assignments', 'item', 'assignment', 'now', 'entries', 'entry', 'role', 'currentQuestionIndex', 'storageIndex', 'tracker']), 'the lobby rule');
  assert.deepEqual(propertiesOf(rule, 'user'), ['id', 'role']);
  for (const match of rule.matchAll(/\btracker\b(.{0,24})/g)) assert.match(match[1], /^\?\.\[activeAssignmentId\]/, `tracker${match[1]}`);
  // Nothing in a render asks them outside their memos (the precise clock's
  // effect asks for the bell window at the real time, after a render).
  const packUpLine = region(code, 'const renderStudentPackUpNotice = () => {', 'const renderStudentWarmupBanner = () => {', 'the pack-up line');
  assert.equal(packUpLine.split('getClassPackUpState(').length - 1, 1);
  assert.equal(packUpLine.split('studentExtraTimeDolOpen(').length - 1, 1);
  assert.equal(code.split('studentWorkspaceHoldsOutcome').length - 1, 2, 'defined, and handed to its memo');
  const workspace = region(code, 'const renderAssignmentWorkspace = (preview = false) => {', 'const renderWhatChangedPanel = ', 'the assignment workspace');
  const callsIn = (text, call) => text.split(call).length - 1;
  assert.equal(callsIn(workspace, 'projectCurrentAssignmentContent('), 1);
  assert.match(workspace, /renderMemo\('currentContent', \[assignment\], \(\) => projectCurrentAssignmentContent\(assignment\)\)/);
  assert.equal(callsIn(workspace, 'assignmentHasHeldTeacherFeedback('), 1);
  assert.match(workspace, /renderMemo\('heldTeacherFeedback', \[assignment\], \(\) => assignmentHasHeldTeacherFeedback\(assignment\)\)/);
  // The section access: the open question's, and the navigator's per section.
  assert.equal(callsIn(workspace, 'getSectionAccessState({'), 2);
  assert.match(workspace, /renderMemo\('currentManualSectionState', \[[^\]]*\], \(\) => getSectionAccessState\(\{/);
  assert.match(workspace, /renderMemo\(`navigatorSection\|\$\{cacheKey\}`, \[[^\]]*\], \(\) => describeSectionAccess\(\{[\s\S]*manualState: getSectionAccessState\(\{/);
  // The due dates: the header's through its memo; the others only while the
  // work is late (its banner and status chip).
  const dueDates = [...workspace.matchAll(/studentDueDateLines\(assignment, lifecycle\)/g)].map((match) => match.index);
  assert.ok(dueDates.length >= 2);
  for (const at of dueDates) {
    const before = workspace.slice(Math.max(0, at - 700), at);
    assert.ok(before.endsWith("renderMemo('dueDateLines', [assignment, lifecycle], () => ") || /lifecycle\.isLate && /.test(before), `studentDueDateLines at ${at}: in its memo or a late-only branch`);
  }
});

test('each lesson\'s Warm-Up window is worked out from the bell schedule, not again on each tracker change', () => {
  const code = app();
  const warmup = region(code, 'const studentActiveWarmup = () => {', 'const renderStudentWarmupBanner = () => {', 'the active Warm-Up');
  const windows = memoSlot(warmup, 'openWarmups');
  assert.deepEqual(windows.inputs, ['user', 'secureExamActive', 'assignments', 'classSchedule', 'now']);
  only(windows.body.slice(windows.body.indexOf('=>') + 2), new Set([...KEYWORDS, 'user', 'secureExamActive', 'assignments', 'classSchedule', 'now', 'classContext', 'assignment', 'state', 'assignmentIsForStudent', 'getWarmupState', 'assignmentIsExcusedForStudent', 'getAssignmentLifecycle']), 'the open Warm-Ups');
  // The questions left: on the open Warm-Ups (so on everything they read)
  // and on the records of their lessons, nothing else of the tracker.
  const left = memoSlot(warmup, 'activeWarmup');
  assert.deepEqual(left.inputs, ['open', '...open.map(({ assignment }) => tracker?.[assignment.id])']);
  only(left.body.slice(left.body.indexOf('=>') + 2), new Set([...KEYWORDS, 'open', 'assignment', 'state', 'questions', 'bannerOmitted', 'questionIndices', 'indices', 'question', 'index', 'warmupFinished', 'tracker', 'a', 'b', 'Set', 'Number', 'getStoredAssignmentQuestions', 'studentRequiredFor', 'questionIsIncluded', 'resolveQuestionActivityRole', 'normalizeQuestionRecord', 'questionRecordView']), 'the Warm-Up questions left');
  for (const match of left.body.matchAll(/\btracker\b(.{0,18})/g)) assert.match(match[1], /^\?\.\[assignment\.id\]/, `tracker${match[1]}`);
  // studentRequiredFor reads the lessons, the student and that lesson's
  // records: the first two are the open Warm-Ups' own inputs.
  const required = region(code, 'const studentRequiredFor = (assignmentData,', '\n  );\n', 'studentRequiredFor');
  only(required.slice(required.indexOf('=>') + 2), new Set([...KEYWORDS, 'studentRequiredQuestions', 'assignments', 'entry', 'assignmentData', 'hasPracticePass', 'forStudent', 'user', 'assignmentTracker', 'tracker']), 'studentRequiredFor');
});

test('App reads a record through its kept view only to read it, and normalises a fresh one where it builds a record', () => {
  const code = app();
  const sites = [...code.matchAll(/questionRecordView\(([^()]*(?:\([^()]*\))?[^()]*)\)(.{0,20})/g)];
  assert.ok(sites.length >= 9, `${sites.length} reads through the view`);
  for (const [, , after] of sites) {
    // A field read, or a name whose every use is a field read.
    assert.match(after, /^\.(status|totalAttempts|attemptCount|variantIndex|timeSpent)\b|^;|^\)?\s*$|^,?$/, `questionRecordView(...)${after}`);
  }
  for (const name of ['currentRecord', 'record']) {
    const at = code.indexOf(`const ${name} = questionRecordView(`);
    if (at < 0) continue;
    const scope = code.slice(at, at + 9000);
    assert.doesNotMatch(scope, new RegExp(`\\b${name}(?:\\.\\w+)+\\s*=[^=>]|\\.\\.\\.${name}\\b|Object\\.assign\\(${name}\\b`), `${name} is only read`);
  }
  assert.match(code, /const getModuleRecord = \(assignmentTracker, index\) =>\s*questionRecordView\(assignmentTracker\?\.\[index\]\);/);
  for (const helper of ['getModuleStatus', 'getModuleTime']) assert.match(code, new RegExp(`const ${helper} = \\(assignmentTracker, index\\) =>\\s*getModuleRecord\\(assignmentTracker, index\\)\\.\\w+;`));
  // A record App builds from another starts from a fresh object.
  assert.match(code, /\.\.\.normalizeQuestionRecord\(currentAssignmentGrades\[currentQuestionIndex\]\),/);
  assert.doesNotMatch(code, /\.\.\.questionRecordView\(/);
});

/* ------------------------------------------- what the runtime driver counts */
/*
 * studentRuntimePerformance.mjs hands each interaction to appRenderMeasures.mjs,
 * which fails a counts run when a Submit renders App more than 4 times or a
 * Next more than 5, and a profile when App's render spends any time on a
 * Submit or a Next in the deferred memos' builders. App and the builders are
 * told apart by the line their function starts on, read from the build's
 * source maps; the time is the samples with App on the stack and, for a
 * group, one of its frames below App.
 */
const withMaps = (run) => {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'runtime-driver-maps-'));
  try {
    mkdirSync(path.join(dist, 'assets'));
    writeFileSync(path.join(dist, 'assets', 'App-abc.js.map'), JSON.stringify({
      version: 3,
      sources: ['../../src/App.jsx', '../../src/platform/student/studentGradeCenterModel.js'],
      sourcesContent: ['import x from "y";\n\nfunction AppShell() {}\nfunction App() {\n  return null;\n}\n', 'const a = 1;\nexport const buildStudentGradeCenter = ({\n'],
      mappings: '',
      names: [],
    }));
    return run(dist);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
};

test('the measures find where App and the builders start, from the build\'s source maps', () => withMaps((dist) => {
  assert.equal(appComponentLine(dist), 4, 'the line App\'s function starts on, not another component\'s');
  assert.equal(definitionLine(dist, 'src/platform/student/studentGradeCenterModel.js', /^export const buildStudentGradeCenter = /), 2);
  assert.equal(definitionLine(dist, 'src/platform/path/studentPathOptions.js', /^export const buildStudentPathOptions = /), null, 'a file the build does not hold');
  assert.equal(appComponentLine(null), null, 'without PERF_DIST: not counted');
}));

test('App\'s render time, and the part of it in a group, from the stacks a profile sampled', () => {
  // No maps: a frame is named "function · file", as the driver names it.
  const frame = (id, functionName, file, children = []) => ({ id, callFrame: { functionName, url: `http://127.0.0.1/assets/${file}`, lineNumber: 0, columnNumber: 0 }, children });
  const profile = {
    nodes: [
      frame(1, '(root)', '', [2, 6]),
      frame(2, 'renderWithHooks', 'react-dom.js', [3]),
      frame(3, 'App', 'App.js', [4, 5]),
      frame(4, 'buildStudentGradeCenter', 'studentGradeCenterModel.js', [7]),
      frame(5, 'assignmentIsExcusedForStudent', 'studentGradeCenterModel.js'),
      frame(6, 'buildStudentGradeCenter', 'studentGradeCenterModel.js'),
      frame(7, 'resolveGradeStatus', 'studentGradeCenterModel.js'),
    ],
    // 1 ms at App itself, 2 under the builder (one deeper), 1 in another
    // export of its module, 3 in the builder outside App.
    samples: [3, 4, 7, 5, 6, 6, 6],
    // timeDeltas[i + 1] is sample i's time, as cpuProfileNames reads every profile.
    timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
  };
  const reader = createProfileReader(null);
  const builder = { test: (name) => name === 'buildStudentGradeCenter · studentGradeCenterModel.js' };
  const module = /studentGradeCenterModel\.js/;
  const timed = timeUnder(reader, profile, (name) => name === 'App · App.js', { deferredMemos: builder, wholeModule: module });
  assert.deepEqual(timed, { total: 4, deferredMemos: 2, wholeModule: 3 }, 'only under App; the builder, and what it calls, not the module\'s other exports');
  assert.deepEqual(timeUnder(reader, profile, () => false, { deferredMemos: builder }), { total: 0, deferredMemos: 0 });
});

test('the middle Submit or Next over App\'s budgets is a finding, and nothing else is', () => withMaps((dist) => {
  assert.deepEqual({ ...APP_RENDER_BUDGET }, { submit: 4, next: 5 }, 'one to spare (3 and 4 now)');
  assert.equal(DEFERRED_MEMO_BUDGET_MS, 0);
  const measures = createAppRenderMeasures(dist);
  assert.equal(measures.appLine, 4);
  const counts = (name, appRenders) => ({ name, appRenders });
  const profiled = (name, deferredMemos) => ({ name, appTime: { total: 30, deferredMemos, navigator: 0 } });
  const check = (runs) => {
    const findings = [];
    const app = measures.check(runs, findings, { log: () => {} });
    return { findings, app };
  };
  // A Submit that a timer of the app's own lands in (the key's checkpoint
  // saved in its window) does not count; two Nexts over the budget do.
  const { findings, app } = check([
    { device: 'chromebook', mode: 'counts', interactions: [counts('basic-submit', 3), counts('choice-submit', 3), counts('expression-submit', 6), counts('next-to-choice', 4), counts('next-to-expression', 6), counts('next-to-tool', 6), counts('open-assignment', 9), { name: 'hint', skipped: 'no hint' }] },
    { device: 'phone', mode: 'profile', interactions: [profiled('expression-submit', 0.2), profiled('next-to-expression', 0), profiled('clock-tick', 5)] },
  ]);
  assert.deepEqual(findings, [
    'chromebook: the middle Next rendered App 6 times (next-to-choice 4, next-to-expression 6, next-to-tool 6; budget 5)',
    'phone: expression-submit spent 0.2 ms of App\'s render in the memos no screen inside an assignment shows (budget 0 ms)',
  ]);
  assert.equal(app.rows.length, 10, 'every counted or profiled interaction is reported');
  // The code before: App rendered 7 times on every Submit and Next.
  const before = check([{ device: 'phone', mode: 'counts', interactions: ['basic-submit', 'choice-submit', 'expression-submit', 'next-to-choice', 'next-to-expression', 'next-to-tool'].map((name) => counts(name, 7)) }]);
  assert.deepEqual(before.findings.map((finding) => finding.split(' (')[0]), ['phone: the middle Submit rendered App 7 times', 'phone: the middle Next rendered App 7 times']);
  // Without the build's maps nothing is counted, and nothing fails.
  const none = [];
  assert.equal(createAppRenderMeasures(null).check([{ device: 'phone', mode: 'counts', interactions: [counts('basic-submit', 9)] }], none, { log: () => {} }), null);
  assert.deepEqual(none, []);
}));

test('the driver hands every interaction to the measures, which time exactly the builders App\'s deferred accessors call', () => {
  const driver = executableSource(read('tests/browser/teacherWorkflow/studentRuntimePerformance.mjs'));
  assert.match(driver, /^import \{ createAppRenderMeasures \} from '\.\.\/support\/appRenderMeasures\.mjs';$/m);
  assert.match(driver, /\nconst appMeasures = createAppRenderMeasures\(DIST\);\n/);
  const profiled = region(driver, "if (mode === 'profile') {\n      const { profile } = await cdp.send('Profiler.stop');", '\n    }', 'the profile of a window');
  assert.match(profiled, /\n\s*record\.appTime = appMeasures\.appTime\(profile\);$/);
  assert.match(driver, /\n\s*if \(mode === 'counts'\) record\.appRenders = await appMeasures\.appRenders\(page\);\n\s*interactions\.push\(record\);/);
  // Its findings join the driver's before they are written and reported.
  const end = region(driver, 'results.medians = table;', 'if (findings.length) {', 'the end of the run');
  assert.match(end, /\nresults\.app = appMeasures\.check\(results\.runs, findings\);\nif \(process\.env\.OUT\) writeFileSync\(/);
  // The four builders App's accessors build with (DEFERRED, above), each defined where the measures look.
  const called = Object.values(DEFERRED).map(([, , builder]) => builder.replace(/^studentRecoveryKit\./, '').replace(/\($/, '')).sort();
  const timed = DEFERRED_BUILDERS.map(([, pattern]) => /export const (\w+) = /.exec(pattern.source)[1]).sort();
  assert.deepEqual(timed, called);
  for (const [file, pattern] of DEFERRED_BUILDERS) assert.match(read(file), new RegExp(pattern.source, 'm'), `${pattern.source} in ${file}`);
});
