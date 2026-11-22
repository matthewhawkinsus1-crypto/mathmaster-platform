// TEACHER SIGNALS: THE FACTS A STUDENT'S DEVICE RECORDS ABOUT AN ATTEMPT
// (docs/platform/SHOWING_THE_PROCESS.md, section 7; build plan SP-2).
//
//   left the page, then two or more parts came back right soon after;
//   a paste into a math answer field: the fact and the part, never the text;
//   every part right on the first try, difficulty band 3 or higher, with no
//   checkpoint or tool moves.
//
// And the rules around them: nothing of a response is recorded, and a student
// whose support profile explains the pattern raises no signal.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTEMPT_SIGNAL_KIND,
  ATTEMPT_SIGNAL_ROLES,
  ATTEMPT_SIGNAL_SUPPORT_IDS,
  MAX_AWAY_MS,
  MAX_SIGNAL_SUPPORTS,
  MIN_AWAY_MS,
  PLATFORM_LINK_GRACE_MS,
  RETURN_WINDOW_MS,
  attemptHasToolWork,
  attemptSignalDocumentId,
  supportsInEffect,
  buildAttemptSignalRecord,
  createAttemptSignalTracker,
  createPageAwayClock,
  exemptAttemptSignalKinds,
  questionDifficultyBand,
} from '../../src/platform/signals/attemptSignalFacts.js';
import { CLASS_TIME_UNKNOWN, SCHOOL_TIME_ZONE, classTimeFact, scheduleHasPeriods, schoolYearCoverage } from '../../src/platform/signals/classTimeFact.js';
import { SCHOOL_YEAR_2026_27 } from '../../functions/shared/schoolYearCalendar.mjs';
import { SIGNAL_RECORDED_SECTIONS } from '../../src/platform/caseReview/workPatternSignals.js';
import { DEFAULT_CLASS_SCHEDULE } from '../../functions/shared/classSchedule.mjs';
import { INCLUSION_IMPLIED_SUPPORT_IDS } from '../../functions/shared/supportCatalog.mjs';
import { factsAfterSavedWork, pastedPartIndex } from '../../src/platform/signals/useAttemptSignals.js';
import { attemptSignalCount, recordAttemptSignal, resetAttemptSignalWriter } from '../../src/platform/signals/attemptSignalWriter.js';
import { lastPlatformLinkAt, notePlatformLinkOpened, resetSignalPageNotes } from '../../src/platform/signals/signalPageNotes.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { readFileSync } from 'node:fs';

// A clock the test moves by hand.
const world = () => {
  let time = 1_000_000;
  const now = () => time;
  const clock = createPageAwayClock({ now });
  const tracker = createAttemptSignalTracker({ clock, now });
  return { clock, tracker, advance: (ms) => { time += ms; }, now };
};

// A four-part answer-box question as MultiAnswerGrader reports it. SECRET is
// what the student typed: it must never reach a record.
const SECRET = 'y=-2x+3-secret';
const state = (answers, right) => ({
  responseKey: JSON.stringify(answers),
  parts: ['slope', 'intercept', 'equation', 'check'].map((id) => ({ id, label: id, isCorrect: right.includes(id) })),
});
const QUESTION = { type: 'multiAnswer', difficultyBand: 2, answerFields: [{ id: 'slope' }, { id: 'intercept' }, { id: 'equation' }, { id: 'check' }] };

const kinds = (facts) => facts.map((fact) => fact.kind);

test('left the page, then two parts came back right soon after returning: one fact, with the away time and the count', () => {
  const { clock, tracker, advance } = world();
  tracker.noteAnswerState(state({}, []));
  advance(5000);
  clock.pageHidden();
  advance(45_000);
  clock.pageVisible();
  advance(4000);
  tracker.noteAnswerState(state({ slope: '-2' }, ['slope']));
  advance(6000);
  tracker.noteAnswerState(state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']));
  const facts = tracker.attemptSubmitted({ question: QUESTION, answerState: state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']), isCorrect: false, attemptNumber: 1 });
  assert.deepEqual(facts, [{ kind: ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT, partCount: 2, awaySeconds: 45, attemptNumber: 1 }]);
});

test('no fact for: one part, a short absence, parts answered long after returning, or parts that came back wrong', () => {
  // One part only.
  let w = world();
  w.tracker.noteAnswerState(state({}, []));
  w.clock.pageHidden(); w.advance(30_000); w.clock.pageVisible(); w.advance(1000);
  w.tracker.noteAnswerState(state({ slope: '-2' }, ['slope']));
  assert.deepEqual(w.tracker.attemptSubmitted({ question: QUESTION, answerState: state({ slope: '-2' }, ['slope']), attemptNumber: 1 }), []);

  // Hidden for less than the floor: a notification, a tap, a support tool.
  w = world();
  w.tracker.noteAnswerState(state({}, []));
  w.clock.pageHidden(); w.advance(MIN_AWAY_MS - 1); w.clock.pageVisible(); w.advance(1000);
  w.tracker.noteAnswerState(state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']));
  assert.deepEqual(w.tracker.attemptSubmitted({ question: QUESTION, answerState: state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']), attemptNumber: 1 }), []);

  // Back for longer than "soon" before answering.
  w = world();
  w.tracker.noteAnswerState(state({}, []));
  w.clock.pageHidden(); w.advance(30_000); w.clock.pageVisible(); w.advance(RETURN_WINDOW_MS + 1);
  w.tracker.noteAnswerState(state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']));
  assert.deepEqual(w.tracker.attemptSubmitted({ question: QUESTION, answerState: state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']), attemptNumber: 1 }), []);

  // Answered soon after returning, and wrong.
  w = world();
  w.tracker.noteAnswerState(state({}, []));
  w.clock.pageHidden(); w.advance(30_000); w.clock.pageVisible(); w.advance(1000);
  w.tracker.noteAnswerState(state({ slope: '9', intercept: '9' }, []));
  assert.deepEqual(w.tracker.attemptSubmitted({ question: QUESTION, answerState: state({ slope: '9', intercept: '9' }, []), attemptNumber: 1 }), []);
});

test('work already on screen when the question opens (a restored draft) is not a burst', () => {
  const { clock, tracker, advance } = world();
  clock.pageHidden(); advance(30_000); clock.pageVisible(); advance(1000);
  // The first report is the draft the question opened with.
  const restored = state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']);
  tracker.noteAnswerState(restored);
  assert.deepEqual(tracker.attemptSubmitted({ question: QUESTION, answerState: restored, attemptNumber: 1 }), []);
});

test('a burst is spent by its attempt: the next attempt on the same parts raises nothing new', () => {
  const { clock, tracker, advance } = world();
  tracker.noteAnswerState(state({}, []));
  clock.pageHidden(); advance(20_000); clock.pageVisible(); advance(2000);
  const answered = state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']);
  tracker.noteAnswerState(answered);
  assert.equal(tracker.attemptSubmitted({ question: QUESTION, answerState: answered, attemptNumber: 1 }).length, 1);
  advance(3000);
  assert.deepEqual(tracker.attemptSubmitted({ question: QUESTION, answerState: answered, attemptNumber: 2 }), []);
});

test('the part marks the grader returned decide "right", not the device', () => {
  const { clock, tracker, advance } = world();
  // A device that cannot mark (no key on it): every part reads false.
  tracker.noteAnswerState(state({}, []));
  clock.pageHidden(); advance(20_000); clock.pageVisible(); advance(2000);
  const answered = state({ slope: '-2', intercept: '3', equation: SECRET }, []);
  tracker.noteAnswerState(answered);
  const gradedParts = [{ id: 'slope', isCorrect: true }, { id: 'intercept', isCorrect: true }, { id: 'equation', isCorrect: true }, { id: 'check', isCorrect: false }];
  const facts = tracker.attemptSubmitted({ question: QUESTION, answerState: answered, gradedParts, attemptNumber: 1 });
  assert.deepEqual(kinds(facts), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  assert.equal(facts[0].partCount, 3);
});

test('every part right on the first try, band 3 or higher, no tool work: one fact', () => {
  const { tracker } = world();
  const hard = { ...QUESTION, difficultyBand: 3 };
  const all = state({ slope: '-2', intercept: '3', equation: SECRET, check: 'yes' }, ['slope', 'intercept', 'equation', 'check']);
  tracker.noteAnswerState(all);
  assert.deepEqual(
    tracker.attemptSubmitted({ question: hard, answerState: all, isCorrect: true, attemptNumber: 1, drawnInAnswerBoxes: true }),
    [{ kind: ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY, difficultyBand: 3, partCount: 4, attemptNumber: 1 }],
  );
});

test('no "right first time" fact below band 3, on a later try, with a part wrong, or with work to look at', () => {
  const all = state({ slope: '-2', intercept: '3', equation: 'y', check: 'yes' }, ['slope', 'intercept', 'equation', 'check']);
  const hard = { ...QUESTION, difficultyBand: 4 };
  const submit = (overrides, prepare = () => {}) => {
    const { tracker } = world();
    prepare(tracker);
    return kinds(tracker.attemptSubmitted({ question: hard, answerState: all, isCorrect: true, attemptNumber: 1, drawnInAnswerBoxes: true, ...overrides }));
  };
  assert.deepEqual(submit({}), [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY], 'the control case raises it');
  assert.deepEqual(submit({ question: { ...QUESTION, difficultyBand: 2 } }), []);
  assert.deepEqual(submit({ question: { ...QUESTION, difficultyBand: undefined } }), []);
  assert.deepEqual(submit({ attemptNumber: 2 }), []);
  assert.deepEqual(submit({ isCorrect: false }), []);
  assert.deepEqual(submit({ answerState: state({}, ['slope', 'intercept', 'equation']) }), []);
  // A checkpoint on a part, a tool's structured response, a composed
  // question, a saved scratchpad: all work to look at.
  assert.deepEqual(submit({ question: { ...hard, answerFields: [{ id: 'slope', checkpoint: { kind: 'pickPoints', count: 2 } }] } }), []);
  assert.deepEqual(submit({ answerState: { ...all, toolResponse: { value: '{}' } } }), []);
  assert.deepEqual(submit({ question: { ...hard, workflow: { stages: [{ id: 'a' }] } } }), []);
  // And a question the engine did not draw as answer boxes: the legacy
  // `algebra` type and a `literal` on the balance workspace are Step Algebra,
  // whatever their type says. Unless the engine vouches, nothing is raised.
  assert.deepEqual(submit({ drawnInAnswerBoxes: false }), []);
  assert.deepEqual(submit({ drawnInAnswerBoxes: undefined, question: { ...hard, type: 'algebra' } }), []);
  assert.deepEqual(submit({}, (tracker) => tracker.noteToolWork()), []);
});

test('difficulty band and tool work are read from the question as authored', () => {
  assert.equal(questionDifficultyBand({ difficultyBand: 4 }), 4);
  assert.equal(questionDifficultyBand({ cognitiveDemand: { difficultyBand: 3 } }), 3);
  assert.equal(questionDifficultyBand({}), 0);
  assert.equal(attemptHasToolWork({ question: { type: 'multiAnswer' }, answerState: {} }), false);
  assert.equal(attemptHasToolWork({ question: { type: 'multiAnswer' }, answerState: {}, toolWorkNoted: true }), true);
});

test('a paste records the part it landed in and the attempt, and nothing else', () => {
  const { tracker } = world();
  assert.deepEqual(tracker.pasteFact({ partIndex: 2, attemptNumber: 1 }), { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 2, attemptNumber: 1 });
});

test('where a paste landed: a marked answer box by its part, a lone math box on an answer-box question, and nowhere else', () => {
  // A stand-in for an element: closest() by selector, as the DOM answers it.
  const element = (matches) => ({
    closest: (selector) => selector.split(',').map((entry) => entry.trim()).map((entry) => matches[entry]).find(Boolean) || null,
  });
  const box = (index, kind = null) => ({ getAttribute: (name) => (name === 'data-answer-box-index' ? String(index) : name === 'data-answer-box-kind' ? kind : null) });
  const BOX = '[data-answer-box-index]';
  // A part's box (MultiAnswerGrader), a table's cell (TableGrader): its own index.
  assert.equal(pastedPartIndex(element({ 'math-field': {}, [BOX]: box(2) })), 2);
  assert.equal(pastedPartIndex(element({ [BOX]: box(7) })), 7, 'a table cell is a plain input in a marked cell');
  // A box that takes words is not a math box.
  assert.equal(pastedPartIndex(element({ [BOX]: box(1, 'text') })), null);
  // A math field outside any marked box: part 1 on a question that is answer
  // boxes and nothing else; on a tool (Step Algebra's move boxes) it is one of
  // the tool's own checked moves, not an answer.
  assert.equal(pastedPartIndex(element({ 'math-field': {} }), { answerBoxesOnly: true }), 0);
  assert.equal(pastedPartIndex(element({ 'math-field': {} }), { answerBoxesOnly: false }), null);
  assert.equal(pastedPartIndex(element({ 'math-field': {} })), null);
  // A note, a scratchpad text box, anything else.
  assert.equal(pastedPartIndex(element({ textarea: {} }), { answerBoxesOnly: true }), null);
  assert.equal(pastedPartIndex(element({}), { answerBoxesOnly: true }), null);
  assert.equal(pastedPartIndex(null), null);
  // The boxes say so in the markup: a part's box names its index and its
  // kind, a table's blank cell its position.
  const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
  assert.match(read('src/MultiAnswerGrader.jsx'), /data-answer-box-index=\{safeFields\.indexOf\(field\)\} data-answer-box-kind=\{shouldUsePlainTextInput\(field\) \? 'text' : undefined\}/);
  assert.match(read('src/TableGrader.jsx'), /<td key=\{answerKey\} data-answer-box-index=\{isBlank \? blankOrder\.indexOf\(answerKey\) : undefined\}/);
});

test('the stored record is positions and counts: no response, no pasted text, no unknown key', () => {
  const { clock, tracker, advance } = world();
  tracker.noteAnswerState(state({}, []));
  clock.pageHidden(); advance(20_000); clock.pageVisible(); advance(2000);
  const all = state({ slope: '-2', intercept: '3', equation: SECRET, check: 'yes' }, ['slope', 'intercept', 'equation', 'check']);
  tracker.noteAnswerState(all);
  const facts = [
    ...tracker.attemptSubmitted({ question: { ...QUESTION, difficultyBand: 5 }, answerState: all, isCorrect: true, attemptNumber: 1, drawnInAnswerBoxes: true }),
    // A fact that tries to carry content in is stripped to its known fields.
    { ...tracker.pasteFact({ partIndex: 1, attemptNumber: 1 }), text: SECRET, clipboard: SECRET, response: SECRET },
  ];
  assert.deepEqual(kinds(facts).sort(), [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY, ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT, ATTEMPT_SIGNAL_KIND.PASTED].sort());
  const allowed = new Set(['schemaVersion', 'studentId', 'assignmentId', 'questionIndex', 'kind', 'attemptNumber', 'activityRole', 'partIndex', 'partCount', 'awaySeconds', 'difficultyBand']);
  // (No class time or supports were given here: neither key appears.)
  facts.forEach((fact) => {
    const record = buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 3, activityRole: 'classwork', fact });
    assert.ok(record, `${fact.kind} builds a record`);
    Object.entries(record).forEach(([key, value]) => {
      assert.ok(allowed.has(key), `${key} is not a field a signal may carry`);
      if (!['studentId', 'assignmentId', 'kind', 'activityRole'].includes(key)) assert.equal(typeof value, 'number', `${key} is a number`);
    });
    assert.doesNotMatch(JSON.stringify(record), /secret|-2x/, 'nothing the student typed or pasted is in the record');
  });
});

test('a record needs a known kind, a student and an assignment; numbers are clamped', () => {
  const fact = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 4000, attemptNumber: -3 };
  assert.equal(buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 0, activityRole: 'dol', fact: { kind: 'keystrokes' } }), null);
  assert.equal(buildAttemptSignalRecord({ studentId: '', assignmentId: 'a-1', questionIndex: 0, activityRole: 'dol', fact }), null);
  assert.equal(buildAttemptSignalRecord({ studentId: 'S1', assignmentId: '', questionIndex: 0, activityRole: 'dol', fact }), null);
  const record = buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 5000, activityRole: ' DOL ', fact });
  assert.deepEqual(record, { schemaVersion: 1, studentId: 'S1', assignmentId: 'a-1', questionIndex: 999, kind: 'pasted', attemptNumber: 1, activityRole: 'dol', partIndex: 49 });
});

test('a signal is recorded on the four sections the case review counts, and nowhere else', async () => {
  assert.deepEqual([...ATTEMPT_SIGNAL_ROLES], ['warmup', 'classwork', 'practice', 'dol']);
  // One list: the case review's denominator is the recorder's own sections.
  assert.equal(SIGNAL_RECORDED_SECTIONS, ATTEMPT_SIGNAL_ROLES);
  const fact = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 };
  const place = { studentId: 'S1', assignmentId: 'a-1', questionIndex: 0, fact };
  for (const activityRole of ATTEMPT_SIGNAL_ROLES) assert.equal(buildAttemptSignalRecord({ ...place, activityRole }).activityRole, activityRole);
  // A Quiz, a Test, Review, Corrections, anything else, or no section at all: no record.
  for (const activityRole of ['quiz', 'test', 'review', 'corrections', 'free text here', '', null, undefined]) {
    assert.equal(buildAttemptSignalRecord({ ...place, activityRole }), null, `no record on ${activityRole}`);
  }
  // So nothing is written, and the Live count does not move.
  const writes = [];
  const store = { doc: (_db, ...segments) => segments.join('/'), serverTimestamp: () => 'T', setDoc: async (path, data) => { writes.push(data); } };
  resetAttemptSignalWriter();
  assert.equal(await recordAttemptSignal({ db: {}, studentId: 'S_Q', assignmentId: 'a-q', questionIndex: 0, activityRole: 'corrections', fact, store }), false);
  assert.equal(await recordAttemptSignal({ db: {}, studentId: 'S_Q', assignmentId: 'a-q', questionIndex: 1, fact, store }), false);
  assert.equal(await recordAttemptSignal({ db: {}, studentId: 'S_Q', assignmentId: 'a-q', questionIndex: 2, activityRole: 'classwork', fact, store }), true);
  assert.deepEqual(writes.map((write) => write.activityRole), ['classwork']);
  resetAttemptSignalWriter();
  // The create rule names the same four, and requires one.
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const context = region(rules, 'function attemptSignalContextValid(d) {', '\n    }\n', 'attemptSignalContextValid');
  assert.match(context, /return d\.keys\(\)\.hasAny\(\['activityRole'\]\)\s*&& d\.activityRole in \['warmup', 'classwork', 'practice', 'dol'\]/);
  assert.doesNotMatch(context, /'quiz'|'test'|'review'|'corrections'/);
});

test('one document per fact: a question holds each kind once, a paste once per part', () => {
  assert.equal(attemptSignalDocumentId({ assignmentId: 'a-1', questionIndex: 3, kind: 'leftThenRight' }), 'a-1__3__leftThenRight');
  assert.equal(attemptSignalDocumentId({ assignmentId: 'a-1', questionIndex: 3, kind: 'hardFirstTry' }), 'a-1__3__hardFirstTry');
  assert.equal(attemptSignalDocumentId({ assignmentId: 'a-1', questionIndex: 3, kind: 'pasted', partIndex: 2 }), 'a-1__3__pasted__2');
});

test('a support profile that explains the pattern raises no signal', () => {
  const exempt = (accommodations, extra = {}) => [...exemptAttemptSignalKinds({ accommodations, ...extra })].sort();
  assert.deepEqual(exempt([]), [], 'no supports: nothing is exempt');
  assert.deepEqual(exempt(['large-text', 'extra-time']), [], 'a support that does not explain a pattern exempts nothing');
  // A read-aloud or translation tool can move focus off the page.
  assert.deepEqual(exempt(['text-to-speech']), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  assert.deepEqual(exempt(['translation']), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  assert.deepEqual(exempt([], { translationLanguage: 'es' }), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  // English is not a translation, however it is written (translationLanguageOf).
  for (const english of ['en', 'en-US', 'English', 'EN']) assert.deepEqual(exempt([], { translationLanguage: english }), [], `${english} is not a translation`);
  // See every part at once: several parts are answered together.
  assert.deepEqual(exempt(['every-part-at-once']), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  // A response written in a word processor is pasted in.
  assert.deepEqual(exempt(['word-processor-response']), [ATTEMPT_SIGNAL_KIND.PASTED]);
  // Nothing explains a first-try right answer.
  assert.ok(!exempt(['text-to-speech', 'translation', 'every-part-at-once', 'word-processor-response']).includes(ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY));
});

// ---- the lead's review of #591 --------------------------------------------

const burstAfter = (prepare, awayMs) => {
  const w = world();
  w.tracker.noteAnswerState(state({}, []));
  prepare(w);
  w.clock.pageHidden(); w.advance(awayMs); w.clock.pageVisible(); w.advance(2000);
  const answered = state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']);
  w.tracker.noteAnswerState(answered);
  return kinds(w.tracker.attemptSubmitted({ question: QUESTION, answerState: answered, attemptNumber: 1 }));
};

test("the platform's own new-tab link (a study sheet, a reteach resource) is not the student leaving the page", () => {
  assert.deepEqual(burstAfter(() => {}, 30_000), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT], 'the control case raises it');
  // The link is pressed, the new tab hides the page at once.
  assert.deepEqual(burstAfter((w) => { w.clock.platformLinkOpened(); w.advance(300); }, 30_000), []);
  // A link pressed long before the page was hidden does not excuse it.
  assert.deepEqual(burstAfter((w) => { w.clock.platformLinkOpened(); w.advance(PLATFORM_LINK_GRACE_MS + 1); }, 30_000), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  // And it excuses one absence, not the next.
  const w = world();
  w.tracker.noteAnswerState(state({}, []));
  w.clock.platformLinkOpened(); w.clock.pageHidden(); w.advance(20_000); w.clock.pageVisible(); w.advance(90_000);
  w.clock.pageHidden(); w.advance(20_000); w.clock.pageVisible(); w.advance(2000);
  const answered = state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']);
  w.tracker.noteAnswerState(answered);
  assert.deepEqual(kinds(w.tracker.attemptSubmitted({ question: QUESTION, answerState: answered, attemptNumber: 1 })), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  // The page notes a link pressed before the recorder's code has loaded, and
  // the page's clock reads that note (createPageAwayClock's `linkAt`).
  resetSignalPageNotes();
  assert.equal(lastPlatformLinkAt(), 0);
  let time = 5_000_000;
  const noted = createPageAwayClock({ now: () => time, linkAt: lastPlatformLinkAt });
  const quiet = createAttemptSignalTracker({ clock: noted, now: () => time });
  quiet.noteAnswerState(state({}, []));
  notePlatformLinkOpened(time);
  time += 200; noted.pageHidden(); time += 30_000; noted.pageVisible(); time += 2000;
  quiet.noteAnswerState(state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']));
  assert.deepEqual(kinds(quiet.attemptSubmitted({ question: QUESTION, answerState: state({ slope: '-2', intercept: '3' }, ['slope', 'intercept']), attemptNumber: 1 })), []);
  assert.match(executableSource(readFileSync(new URL('../../src/platform/signals/attemptSignalFacts.js', import.meta.url), 'utf8')), /sharedClock = createPageAwayClock\(\{ linkAt: lastPlatformLinkAt \}\);/);
  resetSignalPageNotes();
  // The assignment screen notes it when a resource link is pressed.
  const view = executableSource(readFileSync(new URL('../../src/app/student/assignmentWorkspaceView.jsx', import.meta.url), 'utf8'));
  const count = (needle) => view.split(needle).length - 1;
  assert.equal(count('onResourceOpened='), 2, 'both places the support tools are drawn');
  assert.equal(count('onResourceOpened={(supportId) => { notePlatformLinkOpened(); recordStudentSupportEvidence('), 2);
});

test('a locked screen or a tab left open is not the pattern: an absence over five minutes raises nothing', () => {
  assert.deepEqual(burstAfter(() => {}, MAX_AWAY_MS), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT], 'five minutes still counts');
  assert.deepEqual(burstAfter(() => {}, MAX_AWAY_MS + 1), []);
  assert.deepEqual(burstAfter(() => {}, 15 * 3600_000), [], 'overnight');
  // No record can say more than five minutes.
  const record = buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 0, activityRole: 'classwork', fact: { kind: ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT, partCount: 2, awaySeconds: 54_000, attemptNumber: 1 } });
  assert.equal(record.awaySeconds, 300);
});

test("a paste of the page's own text (the prompt's expression, part (a)'s answer) is not \"pasted\"", () => {
  const w = world();
  assert.ok(w.tracker.pasteFact({ partIndex: 1 }), 'the control case: a paste with no copy on this page');
  w.clock.pageCopied();
  assert.equal(w.tracker.pasteFact({ partIndex: 1 }), null, 'copied here, pasted here');
  assert.equal(w.tracker.pasteFact({ partIndex: 0 }), null, 'and pasted again');
  // After time in another tab or app, the clipboard is no longer known to be the page's.
  w.clock.pageHidden(); w.advance(1000); w.clock.pageVisible();
  assert.ok(w.tracker.pasteFact({ partIndex: 1 }));
  w.clock.pageCopied(); w.clock.pageBlurred();
  assert.ok(w.tracker.pasteFact({ partIndex: 1 }), 'the window lost focus after the copy');
  // The page listens for copy and cut, and reads nothing from either.
  const facts = executableSource(readFileSync(new URL('../../src/platform/signals/attemptSignalFacts.js', import.meta.url), 'utf8'));
  const listeners = region(facts, 'export const sharedPageAwayClock', 'return sharedClock;\n};', 'the page clock');
  assert.match(listeners, /addEventListener\('copy', \(\) => sharedClock\.pageCopied\(\), true\)/);
  assert.match(listeners, /addEventListener\('cut', \(\) => sharedClock\.pageCopied\(\), true\)/);
  assert.doesNotMatch(facts, /clipboardData|getData\(|navigator\.clipboard/);
});

test('saved work the engine was not told of (a scratchpad from before a reload) withholds "no tool work"', async () => {
  const hard = { kind: ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY, difficultyBand: 3, partCount: 2, attemptNumber: 1 };
  const left = { kind: ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT, partCount: 2, awaySeconds: 20, attemptNumber: 1 };
  assert.deepEqual(await factsAfterSavedWork([left, hard], async () => false), [left, hard], 'no saved work: both stand');
  assert.deepEqual(await factsAfterSavedWork([left, hard], async () => true), [left], 'a saved scratchpad is work to look at');
  assert.deepEqual(await factsAfterSavedWork([left, hard], async () => { throw new Error('offline'); }), [left], 'not known is not "none"');
  assert.deepEqual(await factsAfterSavedWork([left, hard], null), [left, hard], 'a host with no scratchpad');
  // It is asked only when the claim is about to be made.
  let asked = 0;
  await factsAfterSavedWork([left], async () => { asked += 1; return true; });
  assert.equal(asked, 0);
  // The engine asks its host's scratchpad at submit, and says which module it drew.
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  const call = region(engine, 'attemptSignals.attemptSubmitted({', 'const nextFeedback = result ||', 'the submit');
  assert.match(call, /\{ savedWork: onLoadScratchpad \? async \(\) => Boolean\(await onLoadScratchpad\(\)\) : null \}/);
  assert.match(call, /^\s*drawnInAnswerBoxes,$/m);
  assert.match(engine, /const drawnInAnswerBoxes = drawnKind\?\.route === DRAWN_QUESTION_ROUTE\.QUESTION_TYPE\s+&& ANSWER_BOX_TYPES\.includes\(drawnKind\.type\)\s+&& !\(drawnKind\.type === 'literal' && literalWorkspace\?\.question\);/);
  // The same answer decides where a paste counts.
  assert.match(region(engine, 'const attemptSignals = useAttemptSignals({', '});', 'the hook'), /answerBoxesOnly: drawnInAnswerBoxes,/);
  const boxes = engine.match(/const ANSWER_BOX_TYPES = \[([^\]]*)\]/)[1];
  assert.doesNotMatch(boxes, /'algebra'|stepAlgebra|graph|numberLine|modelingLab|relationshipModel/i, 'no tool-built type is called answer boxes');
});

test('the writer counts a fact when its write lands, sends it once, and tries again after a failure that was not a refusal', async () => {
  const FACT = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 };
  const args = (questionIndex, store) => ({ db: {}, studentId: 'S_W', assignmentId: 'a-w', questionIndex, activityRole: 'classwork', fact: FACT, store });
  const writes = [];
  const storeThat = (outcome) => ({
    doc: (_db, ...segments) => segments.join('/'),
    serverTimestamp: () => 'SERVER_TIME',
    setDoc: async (path, data) => { writes.push({ path, data }); await outcome(); },
  });
  const ok = storeThat(async () => {});
  resetAttemptSignalWriter();
  try { globalThis.sessionStorage?.clear?.(); } catch { /* no storage in node */ }
  assert.equal(attemptSignalCount('S_W', 'a-w'), 0);

  // Lands: written once, at the fact's own path, counted after the write.
  let resolveWrite;
  const slow = storeThat(() => new Promise((resolve) => { resolveWrite = resolve; }));
  const pending = recordAttemptSignal(args(0, slow));
  await Promise.resolve();
  assert.equal(attemptSignalCount('S_W', 'a-w'), 0, 'not counted before the write lands');
  resolveWrite();
  assert.equal(await pending, true);
  assert.equal(attemptSignalCount('S_W', 'a-w'), 1);
  assert.equal(writes[0].path, 'grades/S_W/attemptSignals/a-w__0__pasted__0');
  assert.deepEqual(writes[0].data, { schemaVersion: 1, studentId: 'S_W', assignmentId: 'a-w', questionIndex: 0, kind: 'pasted', attemptNumber: 1, activityRole: 'classwork', partIndex: 0, recordedAt: 'SERVER_TIME' });
  // The same fact again: not sent, not counted.
  assert.equal(await recordAttemptSignal(args(0, ok)), false);
  assert.equal(writes.length, 1);

  // A failure that is not a refusal (offline, a timeout): not counted, and sent again next time.
  const failing = storeThat(async () => { throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); });
  assert.equal(await recordAttemptSignal(args(1, failing)), false);
  assert.equal(attemptSignalCount('S_W', 'a-w'), 1);
  assert.equal(await recordAttemptSignal(args(1, ok)), true, 'retried');
  assert.equal(attemptSignalCount('S_W', 'a-w'), 2);

  // A refusal is the fact already on file (the first stands): not counted, not sent again.
  const refused = storeThat(async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); });
  const before = writes.length;
  assert.equal(await recordAttemptSignal(args(2, refused)), false);
  assert.equal(await recordAttemptSignal(args(2, ok)), false);
  assert.equal(writes.length, before + 1);
  assert.equal(attemptSignalCount('S_W', 'a-w'), 2);
  resetAttemptSignalWriter();
});

// ---- signals as evidence (SP-2b) -------------------------------------------

test('beside each fact: in the class\'s scheduled time or not, and the supports in effect, and nothing else about the student', () => {
  const fact = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 };
  const base = { studentId: 'S1', assignmentId: 'a-1', questionIndex: 0, activityRole: 'classwork', fact };
  assert.equal(buildAttemptSignalRecord({ ...base, duringClass: true }).duringClass, true);
  assert.equal(buildAttemptSignalRecord({ ...base, duringClass: false }).duringClass, false);
  // The schedule could not say: the key is left out, never guessed.
  for (const unknown of [null, undefined, 'at home', 1]) assert.ok(!('duringClass' in buildAttemptSignalRecord({ ...base, duringClass: unknown })));
  // Supports: catalog ids only, sorted, no repeats; a label or a note is dropped.
  assert.deepEqual(
    buildAttemptSignalRecord({ ...base, supports: ['text-to-speech', 'extra-time', 'extra-time', 'has an IEP for reading', '', null] }).supports,
    ['extra-time', 'text-to-speech'],
  );
  assert.deepEqual(buildAttemptSignalRecord({ ...base, supports: [] }).supports, [], 'none in effect is recorded as none');
  assert.ok(!('supports' in buildAttemptSignalRecord(base)), 'not given is not recorded');
  // From the profile in effect today.
  assert.deepEqual(supportsInEffect({ accommodations: ['large-text', 'calculator'], modifications: ['reduce-complexity'] }), ['calculator', 'large-text', 'reduce-complexity']);
  assert.deepEqual(supportsInEffect({ accommodations: [], translationLanguage: 'es' }), ['translation']);
  assert.deepEqual(supportsInEffect({ accommodations: [], translationLanguage: 'en-US' }), []);
  assert.deepEqual(supportsInEffect(null), []);
});

test('the supports in effect are the plan\'s own answer: for this activity, with what inclusion brings, and never cut short', () => {
  const plan = (revision) => ({ supportPlan: { schemaVersion: 1, windows: [{ revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-01', effectiveEnd: null, inclusionStatus: false, accommodations: [], modifications: [], translationLanguage: null, ...revision }] } });
  const nowValue = Date.parse('2026-11-18T16:00:00Z');
  // A support limited to some activities is named only on those.
  const dolOnly = plan({ accommodations: [{ id: 'extra-time', params: {}, appliesTo: ['dol'] }, { id: 'calculator', params: {}, appliesTo: [] }] });
  assert.deepEqual(supportsInEffect(dolOnly, { nowValue, activityRole: 'dol' }), ['calculator', 'extra-time']);
  assert.deepEqual(supportsInEffect(dolOnly, { nowValue, activityRole: 'classwork' }), ['calculator'], 'extra time on the DOL alone is not in effect on Classwork');
  assert.deepEqual(supportsInEffect(dolOnly, { nowValue }), ['calculator', 'extra-time'], 'with no activity named, every support on the plan');
  // Inclusion brings its own supports, though no entry names them.
  const inclusion = plan({ inclusionStatus: true, accommodations: [{ id: 'calculator', params: {}, appliesTo: [] }] });
  assert.deepEqual(supportsInEffect(inclusion, { nowValue, activityRole: 'classwork' }), [...INCLUSION_IMPLIED_SUPPORT_IDS, 'calculator'].sort());
  assert.deepEqual(supportsInEffect({ inclusionStatus: true, accommodations: [] }, { nowValue }), [...INCLUSION_IMPLIED_SUPPORT_IDS].sort(), 'and on a profile from before support plans');
  // A plan not in effect today names nothing.
  assert.deepEqual(supportsInEffect(plan({ status: 'inactive', accommodations: [{ id: 'calculator', params: {}, appliesTo: [] }] }), { nowValue }), []);
  // Never cut short: a student with every support in the catalog has every one named, and the rules allow as many.
  const everything = { accommodations: [...ATTEMPT_SIGNAL_SUPPORT_IDS] };
  assert.equal(supportsInEffect(everything, { nowValue }).length, ATTEMPT_SIGNAL_SUPPORT_IDS.length);
  assert.equal(MAX_SIGNAL_SUPPORTS, ATTEMPT_SIGNAL_SUPPORT_IDS.length);
  const record = buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 0, activityRole: 'classwork', fact: { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 }, supports: supportsInEffect(everything, { nowValue }) });
  assert.equal(record.supports.length, ATTEMPT_SIGNAL_SUPPORT_IDS.length);
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const cap = Number(/d\.supports is list && d\.supports\.size\(\) <= (\d+)/.exec(rules)?.[1]);
  assert.ok(cap >= ATTEMPT_SIGNAL_SUPPORT_IDS.length, `firestore.rules allows ${cap} supports beside a signal; the catalog has ${ATTEMPT_SIGNAL_SUPPORT_IDS.length}`);
});

test('the writer names the supports for the activity the fact was on', async () => {
  const writes = [];
  const store = { doc: (_db, ...segments) => segments.join('/'), serverTimestamp: () => 'T', setDoc: async (path, data) => { writes.push(data); } };
  resetAttemptSignalWriter();
  const fact = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 };
  const profile = { supportPlan: { schemaVersion: 1, windows: [{ revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2020-01-01', effectiveEnd: null, inclusionStatus: false, accommodations: [{ id: 'extra-time', params: {}, appliesTo: ['dol'] }], modifications: [], translationLanguage: null }] } };
  await recordAttemptSignal({ db: {}, studentId: 'S_R', assignmentId: 'a-r', questionIndex: 0, activityRole: 'classwork', fact, profile, store });
  await recordAttemptSignal({ db: {}, studentId: 'S_R', assignmentId: 'a-r', questionIndex: 1, activityRole: 'dol', fact, profile, store });
  assert.deepEqual(writes.map((write) => write.supports), [[], ['extra-time']]);
  resetAttemptSignalWriter();
});

// The bell schedule answers in class or outside it, or cannot say. Each case
// below was stored as "outside class time" before.
const PERIODS_ON = (periods) => Object.fromEntries(Object.entries(periods).map(([period, [start, end]]) => [period, { enabled: true, start, end }]));
const SAVED_SCHEDULE = {
  version: 2,
  daySchedules: { A: { periods: PERIODS_ON({ 'Period 3': ['10:00', '10:50'] }) }, B: { periods: PERIODS_ON({ 'Period 3': ['13:00', '13:50'], 'Period 4': ['14:00', '14:50'] }) } },
};
// School time (America/Chicago, CST = UTC-6): Wed 18 Nov 2026 is an A day, Thu 19 a B day, Fri 20 not chosen.
const chicago = (date, time) => Date.parse(`${date}T${time}:00-06:00`);
const NO_CLOSED_DAYS = new Set();
const inClass = (overrides) => classTimeFact({ schedule: SAVED_SCHEDULE, classPeriod: 'Period 3', nonInstructionalKeys: NO_CLOSED_DAYS, ...overrides });

test('class time, where the schedule answers: inside the period, outside it, a weekend, a closed day', () => {
  assert.deepEqual(inClass({ nowValue: chicago('2026-11-18', '10:20') }), { duringClass: true, reason: '' });
  assert.deepEqual(inClass({ nowValue: chicago('2026-11-18', '19:30') }), { duringClass: false, reason: '' });
  assert.deepEqual(inClass({ nowValue: chicago('2026-11-19', '13:10') }), { duringClass: true, reason: '' }, 'the B day\'s own times');
  assert.deepEqual(inClass({ nowValue: chicago('2026-11-21', '10:20') }), { duringClass: false, reason: '' }, 'a Saturday: no class meets');
  assert.deepEqual(inClass({ nowValue: chicago('2026-11-18', '10:20'), nonInstructionalKeys: new Set(['2026-11-18']) }), { duringClass: false, reason: '' }, 'a day the calendar marks closed');
});

test('outside the school year no class meets; a date no calendar covers is not known', () => {
  // The real calendar: school runs 10 Aug 2026 to 21 May 2027. The weekly
  // pattern alone would call each of these Mondays to Thursdays a school day.
  const real = (nowValue) => classTimeFact({ schedule: SAVED_SCHEDULE, classPeriod: 'Period 3', nowValue });
  const cdt = (date, time) => Date.parse(`${date}T${time}:00-05:00`);
  assert.deepEqual([SCHOOL_YEAR_2026_27.startDate, SCHOOL_YEAR_2026_27.endDate], ['2026-08-10', '2027-05-21']);
  // In the year, in the period: in class (the calendar is consulted, and says school).
  assert.deepEqual(real(chicago('2026-11-18', '10:20')), { duringClass: true, reason: '' });
  // A summer Monday at the period's own time: no class meets.
  assert.deepEqual(real(cdt('2027-06-07', '10:20')), { duringClass: false, reason: '' });
  // Pre-service week, before the first day; and the first and last days themselves.
  assert.deepEqual(real(cdt('2026-08-05', '10:20')), { duringClass: false, reason: '' });
  assert.deepEqual(real(cdt('2026-07-01', '10:20')), { duringClass: false, reason: '' });
  assert.equal(real(cdt('2026-08-10', '10:20')).duringClass, true, 'the first day of school');
  assert.equal(real(cdt('2027-05-19', '10:20')).duringClass, true, 'the last Wednesday of school');
  assert.deepEqual(real(cdt('2027-05-24', '10:20')), { duringClass: false, reason: '' }, 'the Monday after the last day');
  // No calendar covers the date at all: a later school year, or an earlier one.
  assert.deepEqual(schoolYearCoverage(SCHOOL_YEAR_2026_27), { from: '2026-07-01', to: '2027-06-30', firstDay: '2026-08-10', lastDay: '2027-05-21' });
  for (const nowValue of [cdt('2027-09-15', '10:20'), cdt('2027-07-01', '10:20'), cdt('2026-06-30', '10:20'), chicago('2028-01-12', '10:20')]) {
    assert.deepEqual(real(nowValue), { duringClass: null, reason: CLASS_TIME_UNKNOWN.NO_CALENDAR });
  }
  assert.deepEqual(classTimeFact({ schedule: SAVED_SCHEDULE, classPeriod: 'Period 3', nowValue: chicago('2026-11-18', '10:20'), schoolYear: null }), { duringClass: null, reason: CLASS_TIME_UNKNOWN.NO_CALENDAR });
  // A date given its own bell schedule is school, wherever it falls: the more specific word.
  const summerSchool = { ...SAVED_SCHEDULE, modifiedSchedules: { '2027-06-07': { periods: PERIODS_ON({ 'Period 3': ['10:00', '10:50'] }) } } };
  assert.equal(classTimeFact({ schedule: summerSchool, classPeriod: 'Period 3', nowValue: cdt('2027-06-07', '10:20') }).duringClass, true);
});

test('class time not known (a): no schedule has been loaded or saved', () => {
  // The app starts on DEFAULT_CLASS_SCHEDULE, every period off, until settings/classSchedule arrives.
  for (const schedule of [DEFAULT_CLASS_SCHEDULE, null, undefined, {}]) {
    assert.deepEqual(classTimeFact({ schedule, classPeriod: 'Period 3', nowValue: chicago('2026-11-18', '19:30'), nonInstructionalKeys: NO_CLOSED_DAYS }), { duringClass: null, reason: CLASS_TIME_UNKNOWN.NO_SCHEDULE });
  }
  assert.equal(scheduleHasPeriods(DEFAULT_CLASS_SCHEDULE), false);
  assert.equal(scheduleHasPeriods(SAVED_SCHEDULE), true);
});

test('class time not known (b): a Friday whose A/B day has not been chosen', () => {
  assert.deepEqual(inClass({ nowValue: chicago('2026-11-20', '10:20') }), { duringClass: null, reason: CLASS_TIME_UNKNOWN.DAY_TYPE_NOT_SET });
  // Once the teacher chooses the day, or the date has its own bell schedule, the schedule answers.
  assert.equal(inClass({ schedule: { ...SAVED_SCHEDULE, dayTypeOverrides: { '2026-11-20': 'A' } }, nowValue: chicago('2026-11-20', '10:20') }).duringClass, true);
  assert.equal(inClass({ schedule: { ...SAVED_SCHEDULE, modifiedSchedules: { '2026-11-20': { periods: PERIODS_ON({ 'Period 3': ['09:00', '09:30'] }) } } }, nowValue: chicago('2026-11-20', '10:20') }).duringClass, false);
});

test('class time not known (c): the school\'s clock decides, whatever time zone the device is set to', () => {
  // 10:20 at school is 16:20 UTC. A device set to another zone hands over the
  // same instant, and the answer is the same: the fact reads no device clock.
  const now = chicago('2026-11-18', '10:20');
  assert.equal(SCHOOL_TIME_ZONE, 'America/Chicago');
  assert.equal(inClass({ nowValue: now }).duringClass, true);
  for (const deviceZone of ['Asia/Tokyo', 'UTC', 'America/Los_Angeles']) {
    const before = process.env.TZ;
    process.env.TZ = deviceZone;
    try {
      assert.equal(inClass({ nowValue: now }).duringClass, true, `in class at school, on a device set to ${deviceZone}`);
      // 23:30 at school on Wednesday is already Thursday in Tokyo: still Wednesday's schedule.
      assert.deepEqual(inClass({ nowValue: chicago('2026-11-18', '23:30') }), { duringClass: false, reason: '' });
    } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  }
  const source = executableSource(readFileSync(new URL('../../src/platform/signals/classTimeFact.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /getPeriodWindow|localDateKey|getHours\(|getDay\(\)/, 'no device-clock reading of the schedule');
});

test('class time not known (d): the student\'s period is missing, or is not on that day\'s schedule', () => {
  // Period 4 meets on B days only: on an A day the schedule has no time for it.
  assert.deepEqual(inClass({ classPeriod: 'Period 4', nowValue: chicago('2026-11-18', '14:10') }), { duringClass: null, reason: CLASS_TIME_UNKNOWN.PERIOD_NOT_ON_SCHEDULE });
  assert.equal(inClass({ classPeriod: 'Period 4', nowValue: chicago('2026-11-19', '14:10') }).duringClass, true);
  // A period switched off, or with no times.
  const off = { ...SAVED_SCHEDULE, daySchedules: { ...SAVED_SCHEDULE.daySchedules, A: { periods: { 'Period 3': { enabled: false, start: '10:00', end: '10:50' }, 'Period 5': { enabled: true, start: '11:00', end: '11:50' } } } } };
  assert.deepEqual(inClass({ schedule: off, nowValue: chicago('2026-11-18', '10:20') }), { duringClass: null, reason: CLASS_TIME_UNKNOWN.PERIOD_NOT_ON_SCHEDULE });
  // No period on the student's row at all.
  for (const classPeriod of [null, '', '  ']) assert.deepEqual(inClass({ classPeriod, nowValue: chicago('2026-11-18', '10:20') }), { duringClass: null, reason: CLASS_TIME_UNKNOWN.NO_PERIOD });
});

test('the writer stores in class or outside it only when the schedule answers; otherwise nothing', async () => {
  const writes = [];
  const store = { doc: (_db, ...segments) => segments.join('/'), serverTimestamp: () => 'T', setDoc: async (path, data) => { writes.push(data); } };
  resetAttemptSignalWriter();
  const fact = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 };
  const send = (questionIndex, classTime) => recordAttemptSignal({ db: {}, studentId: 'S_T', assignmentId: 'a-t', questionIndex, activityRole: 'classwork', fact, classTime, profile: null, store });
  await send(0, { schedule: SAVED_SCHEDULE, classPeriod: 'Period 3', at: chicago('2026-11-18', '10:20') });
  await send(1, { schedule: SAVED_SCHEDULE, classPeriod: 'Period 3', at: chicago('2026-11-18', '19:30') });
  await send(2, { schedule: DEFAULT_CLASS_SCHEDULE, classPeriod: 'Period 3', at: chicago('2026-11-18', '19:30') });
  await send(3, { schedule: SAVED_SCHEDULE, classPeriod: 'Period 3', at: chicago('2026-11-20', '19:30') });
  await send(4, { schedule: SAVED_SCHEDULE, classPeriod: 'Period 4', at: chicago('2026-11-18', '19:30') });
  await send(5, { schedule: SAVED_SCHEDULE, classPeriod: null, at: chicago('2026-11-18', '19:30') });
  assert.deepEqual(writes.map((write) => ('duringClass' in write ? write.duringClass : 'not stored')), [true, false, 'not stored', 'not stored', 'not stored', 'not stored']);
  resetAttemptSignalWriter();
});

test('a paste is filed under the part it landed in, or not at all', () => {
  const tracker = createAttemptSignalTracker({ clock: createPageAwayClock({ now: () => 0 }) });
  assert.equal(tracker.pasteFact({ partIndex: 49 }).partIndex, 49);
  // Past the last part a record can name: no fact, rather than part 50's
  // document standing for parts 51 and 60 as well.
  for (const partIndex of [50, 60, 999]) assert.equal(tracker.pasteFact({ partIndex }), null);
  // A table's boxes are numbered among the boxes the student fills, in reading order.
  const table = executableSource(readFileSync(new URL('../../src/TableGrader.jsx', import.meta.url), 'utf8'));
  assert.match(table, /const blankOrder = rows\.flatMap\(\(row, rowIndex\) => columns\.map\(\(column\) => `\$\{rowIndex\}:\$\{column\.key\}`\)\)\s*\.filter\(\(answerKey\) => Object\.prototype\.hasOwnProperty\.call\(answers, answerKey\) \|\| blanks\.includes\(answerKey\)\);/);
  assert.match(table, /<td key=\{answerKey\} data-answer-box-index=\{isBlank \? blankOrder\.indexOf\(answerKey\) : undefined\}/);
  assert.doesNotMatch(table, /rowIndex \* columns\.length/);
});

test('the rules list the same support ids as the catalog', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const listed = region(rules, 'function attemptSignalSupportIds() {', '];', 'the rules\' support ids').match(/'([a-z0-9-]+)'/g).map((id) => id.slice(1, -1));
  assert.deepEqual([...listed].sort(), [...ATTEMPT_SIGNAL_SUPPORT_IDS].sort(), 'a support added to the catalog must be added to firestore.rules attemptSignalSupportIds, or a signal naming it is refused');
  assert.ok(ATTEMPT_SIGNAL_SUPPORT_IDS.length <= 60);
});

test('a fact belongs to the question its engine was showing, not the one the student has since opened', () => {
  // The hook takes the host's note of where it is when the fact happens, before any wait.
  const hook = executableSource(readFileSync(new URL('../../src/platform/signals/useAttemptSignals.js', import.meta.url), 'utf8'));
  const submitted = region(hook, 'const attemptSubmitted = useCallback(', '}, [raise]);', 'attemptSubmitted');
  assert.ok(submitted.indexOf('const at = contextRef.current;') !== -1 && submitted.indexOf('const at = contextRef.current;') < submitted.indexOf('factsAfterSavedWork('), 'the place is read before the scratchpad is asked');
  assert.match(submitted, /\.then\(\(facts\) => raise\(facts, at\)\)/);
  assert.match(hook, /hostRef\.current\?\.\(fact, at\);/);
  // The assignment screen fixes the place, the class time and the profile as
  // of the fact, and only then fetches the recorder's code.
  const view = executableSource(readFileSync(new URL('../../src/app/student/assignmentWorkspaceView.jsx', import.meta.url), 'utf8'));
  const record = region(view, ': (fact, at) => {', "void import('../../platform/signals/attemptSignalWriter.js')", 'the recorder');
  assert.match(record, /questionIndex: Number\.isInteger\(at\?\.questionIndex\) \? at\.questionIndex : currentQuestionIndex,/, 'question 1 (index 0) is a place, not a missing one');
  assert.match(record, /activityRole: at\?\.activityRole \?\? runtimeActivityRole,/);
  // The schedule, the period and the moment, as of the fact: the recorder
  // answers in class, outside it, or not known (classTimeFact.js). The screen
  // itself says neither, so a schedule that cannot say is never "outside".
  assert.match(record, /classTime: \{ schedule: classSchedule, classPeriod: user\.classPeriod \|\| null, at: Date\.now\(\) \},/);
  assert.doesNotMatch(record, /duringClass|studentClassInSession/);
  assert.match(record, /profile: user\.profile \|\| null,/);
  assert.match(view, /attemptSignalContext=\{renderMemo\('attemptSignalContext', \[currentQuestionIndex, runtimeActivityRole\], \(\) => \(\{ questionIndex: currentQuestionIndex, activityRole: runtimeActivityRole \}\)\)\}/);
});

test('the writer records the supports in effect from the profile it is handed', async () => {
  const writes = [];
  const store = { doc: (_db, ...segments) => segments.join('/'), serverTimestamp: () => 'T', setDoc: async (path, data) => { writes.push(data); } };
  resetAttemptSignalWriter();
  const fact = { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 0, attemptNumber: 1 };
  await recordAttemptSignal({ db: {}, studentId: 'S_P', assignmentId: 'a-p', questionIndex: 0, activityRole: 'classwork', fact, duringClass: false, profile: { accommodations: ['extra-time', 'large-text'] }, store });
  assert.deepEqual([writes[0].supports, writes[0].duringClass], [['extra-time', 'large-text'], false]);
  await recordAttemptSignal({ db: {}, studentId: 'S_P', assignmentId: 'a-p', questionIndex: 1, activityRole: 'classwork', fact, profile: null, store });
  assert.deepEqual(writes[1].supports, [], 'a student with no profile has none in effect');
  await recordAttemptSignal({ db: {}, studentId: 'S_P', assignmentId: 'a-p', questionIndex: 2, activityRole: 'classwork', fact, store });
  assert.ok(!('supports' in writes[2]) && !('duringClass' in writes[2]), 'not handed either: neither is recorded');
  resetAttemptSignalWriter();
});
