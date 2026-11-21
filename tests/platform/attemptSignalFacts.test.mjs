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
  MIN_AWAY_MS,
  RETURN_WINDOW_MS,
  attemptHasToolWork,
  attemptSignalDocumentId,
  buildAttemptSignalRecord,
  createAttemptSignalTracker,
  createPageAwayClock,
  exemptAttemptSignalKinds,
  questionDifficultyBand,
} from '../../src/platform/signals/attemptSignalFacts.js';
import { pastedPartIndex } from '../../src/platform/signals/useAttemptSignals.js';

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
    tracker.attemptSubmitted({ question: hard, answerState: all, isCorrect: true, attemptNumber: 1 }),
    [{ kind: ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY, difficultyBand: 3, partCount: 4, attemptNumber: 1 }],
  );
});

test('no "right first time" fact below band 3, on a later try, with a part wrong, or with work to look at', () => {
  const all = state({ slope: '-2', intercept: '3', equation: 'y', check: 'yes' }, ['slope', 'intercept', 'equation', 'check']);
  const hard = { ...QUESTION, difficultyBand: 4 };
  const submit = (overrides, prepare = () => {}) => {
    const { tracker } = world();
    prepare(tracker);
    return kinds(tracker.attemptSubmitted({ question: hard, answerState: all, isCorrect: true, attemptNumber: 1, ...overrides }));
  };
  assert.deepEqual(submit({}), [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY], 'the control case raises it');
  assert.deepEqual(submit({ question: { ...QUESTION, difficultyBand: 2 } }), []);
  assert.deepEqual(submit({ question: { ...QUESTION, difficultyBand: undefined } }), []);
  assert.deepEqual(submit({ attemptNumber: 2 }), []);
  assert.deepEqual(submit({ isCorrect: false }), []);
  assert.deepEqual(submit({ answerState: state({}, ['slope', 'intercept', 'equation']) }), []);
  // A checkpoint on a part, a tool's structured response, a tool-built
  // question, a composed question, a saved scratchpad: all work to look at.
  assert.deepEqual(submit({ question: { ...hard, answerFields: [{ id: 'slope', checkpoint: { kind: 'pickPoints', count: 2 } }] } }), []);
  assert.deepEqual(submit({ answerState: { ...all, toolResponse: { value: '{}' } } }), []);
  assert.deepEqual(submit({ question: { ...hard, type: 'stepAlgebra2' } }), []);
  assert.deepEqual(submit({ question: { ...hard, workflow: { stages: [{ id: 'a' }] } } }), []);
  assert.deepEqual(submit({}, (tracker) => tracker.noteToolWork()), []);
});

test('difficulty band and tool work are read from the question as authored', () => {
  assert.equal(questionDifficultyBand({ difficultyBand: 4 }), 4);
  assert.equal(questionDifficultyBand({ cognitiveDemand: { difficultyBand: 3 } }), 3);
  assert.equal(questionDifficultyBand({}), 0);
  assert.equal(attemptHasToolWork({ question: { type: 'multiAnswer' }, answerState: {} }), false);
  assert.equal(attemptHasToolWork({ question: { type: 'functionGraph' }, answerState: {} }), true);
});

test('a paste records the part it landed in and the attempt, and nothing else', () => {
  const { tracker } = world();
  assert.deepEqual(tracker.pasteFact({ partIndex: 2, attemptNumber: 1 }), { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 2, attemptNumber: 1 });
});

test('where a paste landed: a math box (with its part), a plain box inside a part, and nowhere else', () => {
  // A stand-in for an element: closest() by selector, as the DOM answers it.
  const element = (matches) => ({
    closest: (selector) => selector.split(',').map((entry) => entry.trim()).map((entry) => matches[entry]).find(Boolean) || null,
  });
  const part = (index) => ({ getAttribute: (name) => (name === 'data-answer-box-index' ? String(index) : null) });
  assert.equal(pastedPartIndex(element({ 'math-field': {}, '[data-answer-box-index]': part(2) })), 2);
  assert.equal(pastedPartIndex(element({ 'math-field': {} })), 0, 'a single math box is part 1');
  assert.equal(pastedPartIndex(element({ input: {}, '[data-answer-box-index]': part(1) })), 1);
  assert.equal(pastedPartIndex(element({ textarea: {} })), null, 'a note or a scratchpad text box is not an answer field');
  assert.equal(pastedPartIndex(element({})), null);
  assert.equal(pastedPartIndex(null), null);
});

test('the stored record is positions and counts: no response, no pasted text, no unknown key', () => {
  const { clock, tracker, advance } = world();
  tracker.noteAnswerState(state({}, []));
  clock.pageHidden(); advance(20_000); clock.pageVisible(); advance(2000);
  const all = state({ slope: '-2', intercept: '3', equation: SECRET, check: 'yes' }, ['slope', 'intercept', 'equation', 'check']);
  tracker.noteAnswerState(all);
  const facts = [
    ...tracker.attemptSubmitted({ question: { ...QUESTION, difficultyBand: 5 }, answerState: all, isCorrect: true, attemptNumber: 1 }),
    // A fact that tries to carry content in is stripped to its known fields.
    { ...tracker.pasteFact({ partIndex: 1, attemptNumber: 1 }), text: SECRET, clipboard: SECRET, response: SECRET },
  ];
  assert.deepEqual(kinds(facts).sort(), [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY, ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT, ATTEMPT_SIGNAL_KIND.PASTED].sort());
  const allowed = new Set(['schemaVersion', 'studentId', 'assignmentId', 'questionIndex', 'kind', 'attemptNumber', 'activityRole', 'partIndex', 'partCount', 'awaySeconds', 'difficultyBand']);
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
  assert.equal(buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 0, fact: { kind: 'keystrokes' } }), null);
  assert.equal(buildAttemptSignalRecord({ studentId: '', assignmentId: 'a-1', questionIndex: 0, fact }), null);
  assert.equal(buildAttemptSignalRecord({ studentId: 'S1', assignmentId: '', questionIndex: 0, fact }), null);
  const record = buildAttemptSignalRecord({ studentId: 'S1', assignmentId: 'a-1', questionIndex: 5000, activityRole: 'free text here', fact });
  assert.deepEqual(record, { schemaVersion: 1, studentId: 'S1', assignmentId: 'a-1', questionIndex: 999, kind: 'pasted', attemptNumber: 1, partIndex: 49 });
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
  // See every part at once: several parts are answered together.
  assert.deepEqual(exempt(['every-part-at-once']), [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]);
  // A response written in a word processor is pasted in.
  assert.deepEqual(exempt(['word-processor-response']), [ATTEMPT_SIGNAL_KIND.PASTED]);
  // Nothing explains a first-try right answer.
  assert.ok(!exempt(['text-to-speech', 'translation', 'every-part-at-once', 'word-processor-response']).includes(ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY));
});
