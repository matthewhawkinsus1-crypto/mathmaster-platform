// A STUDENT'S OWN ANSWERS IN THE GAME RECAP (LC19, findings A2-111 and A1-28).
//
// The recap listed each round's result and its worked solution, but not what
// the student answered, so they could not hold the two together. The server
// keeps a verdict, not what was typed, and a classmate's answer is in nothing
// the recap is built from; the device that sent an answer keeps a short,
// readable copy of the ones the server confirmed, and the recap shows them.
// Held here:
//   - the rows: a typed answer as typed, the math editor's LaTeX marked as
//     such, a choice in its own words (never "choice-9"), a tool's construction
//     as the released review of a test says it, and nothing for what cannot be
//     said;
//   - the copy: kept per student, game and round, read back only for the same
//     student and game, forgotten after a few games or a month, and harmless
//     when the browser refuses storage;
//   - the recap: an answer sits only on a round the server says was answered;
//   - the screens are wired to all of it (source contracts, each bound to the
//     region that does the work, and each broken once).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  CHOICE_FIELD_PROFILES,
  OWN_ANSWER_FORMAT,
  OWN_ANSWER_KEEP_GAMES,
  OWN_ANSWER_KEEP_MS,
  OWN_ANSWER_MAX_LATEX,
  OWN_ANSWER_MAX_ROWS,
  OWN_ANSWER_MAX_TEXT,
  answerIsLatex,
  forgetOldOwnAnswers,
  keepOwnAnswer,
  ownAnswerRows,
  recallOwnAnswers,
  rememberOwnAnswer,
} from '../../src/platform/liveChallenge/challengeOwnAnswers.js';
import { normalizeMatchRecap, withOwnAnswers } from '../../src/platform/liveChallenge/challengeRecapModel.js';
import { answerIsLatex as releasedReviewAnswerIsLatex } from '../../src/platform/assessment/secureExamResultsModel.js';

// A storage that behaves like the browser's: strings only, an index, a length.
const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()],
  };
};

const typedQuestion = { responseFields: [{ id: 'f1', label: 'Answer', inputProfile: 'math' }] };
const choiceQuestion = {
  responseFields: [{ id: 'f1', label: 'Choose one', inputProfile: 'choice', choices: [{ id: 'c1', label: 'A. 12' }, { id: 'c2', label: 'B. $\\frac{1}{2}$' }, { id: 'c3', label: 'C. 7' }] }],
};

/* ---------------------------------- the rows ---------------------------------- */

test('a typed answer is shown as typed; the math editor\'s LaTeX is marked so it is typeset', () => {
  assert.deepEqual(ownAnswerRows({ question: typedQuestion, responsePayload: { responses: { f1: '  3x + 2 ' } } }), [{ label: '', value: '3x + 2', format: 'text' }]);
  assert.deepEqual(ownAnswerRows({ question: typedQuestion, responsePayload: { responses: { f1: '\\frac{3}{4}' } } }), [{ label: '', value: '\\frac{3}{4}', format: 'latex' }]);
  // A dollar amount is typed text, never the start of mathematics.
  assert.deepEqual(ownAnswerRows({ question: typedQuestion, responsePayload: { responses: { f1: '$5 and $6' } } }), [{ label: '', value: '$5 and $6', format: 'text' }]);
  assert.equal(OWN_ANSWER_FORMAT.LATEX, 'latex');
});

test('the LaTeX rule is the released review\'s, answer for answer', () => {
  for (const value of ['\\frac34', '\\left\\lbrace1,2\\right\\rbrace', '(-\\infty,3]', 'x^{2}', 'a_{1}', '50\\%', '7', '0.75', '-8', 'about 7 hours', '$5 and $6', '\\$5', '', null, undefined, 'x^2', '3/4']) {
    assert.equal(answerIsLatex(value), releasedReviewAnswerIsLatex(value), JSON.stringify(value));
  }
});

test('a choice is shown in its own words, never as its id, and an id no choice answers to is not shown', () => {
  assert.deepEqual(ownAnswerRows({ question: choiceQuestion, responsePayload: { responses: { f1: 'c2' } } }), [{ label: '', value: 'B. $\\frac{1}{2}$', format: 'authored' }]);
  // A multi-select: each choice, in the order sent.
  assert.deepEqual(ownAnswerRows({ question: choiceQuestion, responsePayload: { responses: { f1: ['c1', 'c3'] } } }), [{ label: '', value: 'A. 12, C. 7', format: 'authored' }]);
  assert.equal(ownAnswerRows({ question: choiceQuestion, responsePayload: { responses: { f1: 'choice-9' } } }), null);
  assert.equal(ownAnswerRows({ question: choiceQuestion, responsePayload: { responses: { f1: ['c1', 'choice-9'] } } }), null, 'one unknown id and the row is not said');
  // Question-level choices serve a choice field that names none of its own.
  const shared = { choices: [{ id: 'x', text: 'Yes' }, { id: 'y', text: 'No' }], responseFields: [{ id: 'f1', label: 'Is it?', type: 'multiple-choice' }] };
  assert.deepEqual(ownAnswerRows({ question: shared, responsePayload: { responses: { f1: 'y' } } }), [{ label: '', value: 'No', format: 'authored' }]);
  // A typed field beside a choice field is typed, though the question has choices.
  const mixed = { choices: [{ id: 'a', label: 'Left' }], responseFields: [{ id: 'f1', label: 'Pick', inputProfile: 'choice' }, { id: 'f2', label: 'Why', inputProfile: 'math' }] };
  assert.deepEqual(ownAnswerRows({ question: mixed, responsePayload: { responses: { f2: 'a', f1: 'a' } } }), [
    { label: 'Pick', value: 'Left', format: 'authored' },
    { label: 'Why', value: 'a', format: 'text' },
  ]);
});

test('the choice profiles are the answer field\'s own', () => {
  const component = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeFieldQuestion.jsx', import.meta.url), 'utf8');
  const declared = region(component, 'const CHOICE_PROFILES = new Set([', ']);', 'the choice profiles');
  const names = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...CHOICE_FIELD_PROFILES].sort(), names.sort());
});

test('several fields are labelled with their own labels, in the order the student met them', () => {
  const question = { responseFields: [{ id: 'x', label: 'x =' }, { id: 'y', label: 'y =' }] };
  assert.deepEqual(ownAnswerRows({ question, responsePayload: { responses: { y: '2', x: '5' } } }), [
    { label: 'x =', value: '5', format: 'text' },
    { label: 'y =', value: '2', format: 'text' },
  ]);
  assert.equal(ownAnswerRows({ question, responsePayload: { responses: { x: '5', y: '   ' } } }).length, 1, 'a blank part is not a row');
  const many = { responseFields: Array.from({ length: 7 }, (_, index) => ({ id: `f${index}`, label: `P${index}` })) };
  const rows = ownAnswerRows({ question: many, responsePayload: { responses: Object.fromEntries(many.responseFields.map((field, index) => [field.id, String(index + 1)])) } });
  assert.equal(rows.length, OWN_ANSWER_MAX_ROWS);
});

test('a tool\'s work is said the way the released review of a test says it, and nothing is said for a tool it cannot read', () => {
  assert.deepEqual(ownAnswerRows({ question: { pathToolId: 'stepAlgebra' }, responsePayload: { raw: { finalEquation: 'x = 5' } } }), [{ label: 'Final equation', value: 'x = 5', format: 'text' }]);
  assert.deepEqual(ownAnswerRows({ question: { pathToolId: 'stepAlgebra' }, responsePayload: { raw: { finalRelation: 'x > 2', finalEquation: 'x = 5' } } })[0].value, 'x > 2');
  assert.deepEqual(ownAnswerRows({ question: { pathToolId: 'stepAlgebra' }, responsePayload: { rawJson: JSON.stringify({ finalEquation: 'y = 1' }) } })[0].value, 'y = 1');
  assert.equal(ownAnswerRows({ question: { pathToolId: 'stepAlgebra' }, responsePayload: { raw: {} } }), null);
  assert.equal(ownAnswerRows({ question: { pathToolId: 'someToolWithNoSummary' }, responsePayload: { raw: { anything: 1 } } }), null);
});

test('nothing is said for a blank answer or a payload that cannot be read; a long answer is cut, a long LaTeX is not kept', () => {
  for (const payload of [null, undefined, 'x', 7, [], {}, { responses: {} }, { responses: { f1: '   ' } }, { responses: { f1: null } }]) {
    assert.equal(ownAnswerRows({ question: typedQuestion, responsePayload: payload }), null, JSON.stringify(payload));
  }
  assert.equal(ownAnswerRows({}), null);
  assert.equal(ownAnswerRows(), null);
  const long = 'word '.repeat(80);
  const [row] = ownAnswerRows({ question: typedQuestion, responsePayload: { responses: { f1: long } } });
  assert.ok(row.value.length <= OWN_ANSWER_MAX_TEXT && row.value.endsWith('…'), row.value.length);
  const latex = `\\frac{${'1'.repeat(OWN_ANSWER_MAX_LATEX)}}{2}`;
  assert.equal(ownAnswerRows({ question: typedQuestion, responsePayload: { responses: { f1: latex } } }), null);
});

/* ------------------------------- the device's copy ------------------------------- */

test('an answer is kept for this student and game, and read back for no one else', () => {
  const storage = memoryStorage();
  const rows = [{ label: '', value: '3x + 2', format: 'text' }];
  assert.equal(rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'room-1', roundIndex: 0, rows }), true);
  assert.equal(rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'room-1', roundIndex: 2, rows: [{ label: '', value: 'B', format: 'authored' }] }), true);
  assert.deepEqual(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'room-1' }), { 0: rows, 2: [{ label: '', value: 'B', format: 'authored' }] });
  // Another student on the same device, another game: nothing.
  assert.deepEqual(recallOwnAnswers({ storage, studentId: 'ben', roomId: 'room-1' }), {});
  assert.deepEqual(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'room-2' }), {});
  assert.deepEqual(recallOwnAnswers({ storage, studentId: 'an', roomId: 'room-1' }), {}, 'a student whose id is a prefix of another\'s');
  // A round kept again is replaced, not added to.
  rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'room-1', roundIndex: 0, rows: [{ label: '', value: '4', format: 'text' }] });
  assert.equal(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'room-1' })[0][0].value, '4');
  // Built from what was asked and sent.
  assert.equal(keepOwnAnswer({ storage, studentId: 'ana', roomId: 'room-3', roundIndex: 1, question: choiceQuestion, responsePayload: { responses: { f1: 'c3' } } }), true);
  assert.equal(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'room-3' })[1][0].value, 'C. 7');
  // Nothing to say, nothing kept.
  assert.equal(keepOwnAnswer({ storage, studentId: 'ana', roomId: 'room-4', roundIndex: 0, question: typedQuestion, responsePayload: { responses: { f1: ' ' } } }), false);
  assert.deepEqual(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'room-4' }), {});
});

test('what is written must be rows this module could have written, and what is read back is re-checked', () => {
  const storage = memoryStorage();
  assert.equal(rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'r', roundIndex: 0, rows: [{ label: '', value: 'x', format: 'surprise' }] }), false);
  assert.equal(rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'r', roundIndex: -1, rows: [{ label: '', value: 'x', format: 'text' }] }), false);
  assert.equal(rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'r', roundIndex: 'two', rows: [{ label: '', value: 'x', format: 'text' }] }), false);
  assert.equal(rememberOwnAnswer({ storage, studentId: '', roomId: 'r', roundIndex: 0, rows: [{ label: '', value: 'x', format: 'text' }] }), false);
  assert.equal(rememberOwnAnswer({ storage, studentId: 'ana', roomId: 'r', roundIndex: 0, rows: [] }), false);
  // Hand-edited storage: rounds that are not rows, formats that are not ours, too many rows.
  const key = storage.keys()[0] ?? 'mathmaster.liveChallenge.ownAnswers.v1/ana/r';
  storage.setItem(key, JSON.stringify({ rounds: { 0: [{ value: 'ok', format: 'text' }, { value: 5, format: 'text' }, { value: 'bad', format: 'html' }], 1: 'nope', x: [{ value: 'y', format: 'text' }], 2: [], 3: Array.from({ length: 9 }, (_, index) => ({ value: `v${index}`, format: 'text' })) } }));
  const recalled = recallOwnAnswers({ storage, studentId: 'ana', roomId: 'r' });
  assert.deepEqual(Object.keys(recalled), ['0', '3']);
  assert.deepEqual(recalled[0], [{ label: '', value: 'ok', format: 'text' }]);
  assert.equal(recalled[3].length, OWN_ANSWER_MAX_ROWS);
});

test('a browser that refuses or corrupts storage shows a recap without answers and throws nothing', () => {
  const broken = { get length() { throw new Error('no'); }, key() { throw new Error('no'); }, getItem() { throw new Error('no'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('no'); } };
  assert.equal(rememberOwnAnswer({ storage: broken, studentId: 'ana', roomId: 'r', roundIndex: 0, rows: [{ label: '', value: 'x', format: 'text' }] }), false);
  assert.deepEqual(recallOwnAnswers({ storage: broken, studentId: 'ana', roomId: 'r' }), {});
  assert.equal(forgetOldOwnAnswers({ storage: broken, studentId: 'ana' }), 0);
  assert.deepEqual(recallOwnAnswers({ storage: null, studentId: 'ana', roomId: 'r' }), {});
  assert.equal(rememberOwnAnswer({ storage: null, studentId: 'ana', roomId: 'r', roundIndex: 0, rows: [{ label: '', value: 'x', format: 'text' }] }), false);
  const corrupt = memoryStorage({ 'mathmaster.liveChallenge.ownAnswers.v1/ana/r': '{not json' });
  assert.deepEqual(recallOwnAnswers({ storage: corrupt, studentId: 'ana', roomId: 'r' }), {});
  // Writing over a corrupt copy starts it again.
  assert.equal(rememberOwnAnswer({ storage: corrupt, studentId: 'ana', roomId: 'r', roundIndex: 0, rows: [{ label: '', value: 'x', format: 'text' }] }), true);
  assert.equal(recallOwnAnswers({ storage: corrupt, studentId: 'ana', roomId: 'r' })[0][0].value, 'x');
});

test('old games are forgotten: past a month, and all but the last few; another student\'s copy is never touched', () => {
  const storage = memoryStorage();
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 25);
  const rows = [{ label: '', value: 'x', format: 'text' }];
  // Ten games, one a day.
  for (let game = 0; game < 10; game += 1) rememberOwnAnswer({ storage, studentId: 'ana', roomId: `game-${game}`, roundIndex: 0, rows, nowMs: now - (9 - game) * day });
  rememberOwnAnswer({ storage, studentId: 'ben', roomId: 'game-0', roundIndex: 0, rows, nowMs: now - 400 * day });
  const kept = [...Array(10).keys()].map((game) => `game-${game}`).filter((roomId) => Object.keys(recallOwnAnswers({ storage, studentId: 'ana', roomId })).length);
  assert.equal(kept.length, OWN_ANSWER_KEEP_GAMES);
  assert.deepEqual(kept, ['game-2', 'game-3', 'game-4', 'game-5', 'game-6', 'game-7', 'game-8', 'game-9'], 'the last eight');
  assert.equal(Object.keys(recallOwnAnswers({ storage, studentId: 'ben', roomId: 'game-0' })).length, 1, 'another student\'s old copy is theirs to forget');
  // Twenty-five days on, the two older than a month go (game-2 is 32 days old, game-3 31;
  // game-4 is exactly a month, which is not past it); two days after that, the rest.
  assert.equal(forgetOldOwnAnswers({ storage, studentId: 'ana', nowMs: now + OWN_ANSWER_KEEP_MS - 5 * day }), 2);
  assert.equal(Object.keys(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'game-4' })).length, 1);
  assert.equal(Object.keys(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'game-3' })).length, 0);
  assert.equal(forgetOldOwnAnswers({ storage, studentId: 'ana', nowMs: now + OWN_ANSWER_KEEP_MS + 2 * day }), 6);
  assert.equal(Object.keys(recallOwnAnswers({ storage, studentId: 'ana', roomId: 'game-9' })).length, 0);
  assert.equal(Object.keys(recallOwnAnswers({ storage, studentId: 'ben', roomId: 'game-0' })).length, 1);
});

/* ----------------------------------- the recap ----------------------------------- */

const recapOf = (rounds) => normalizeMatchRecap({
  status: 'finished', roomId: 'room-1', self: { joined: true }, rounds: rounds.map((round) => ({ solutionAvailable: false, ...round })),
}, { roomId: 'room-1', scheduledRoundCount: rounds.length });

test('an answer sits only on a round the server says was answered, and the rest of the recap is as it was', () => {
  const recap = recapOf([
    { roundIndex: 0, answered: true, isCorrect: true, scorePercent: 100 },
    { roundIndex: 1, answered: false, isCorrect: null, scorePercent: null },
    { roundIndex: 2, answered: true, isCorrect: false, scorePercent: 0 },
  ]);
  const rows = (value) => [{ label: '', value, format: 'text' }];
  const merged = withOwnAnswers(recap, { 0: rows('a'), 1: rows('b (never reached the server)'), 3: rows('d (no such round)') });
  assert.deepEqual(merged.rounds.map((round) => round.ownAnswer?.[0]?.value ?? null), ['a', null, null]);
  // Nothing else moved.
  assert.deepEqual(merged.rounds.map((round) => round.result.text), recap.rounds.map((round) => round.result.text));
  assert.equal(merged.self, recap.self);
  assert.equal(merged.personalBests, recap.personalBests);
  // Nothing to add: the same recap. No recap: no recap. Junk: ignored.
  assert.equal(withOwnAnswers(recap, {}), recap);
  assert.equal(withOwnAnswers(recap, { 1: rows('only the unanswered') }), recap);
  assert.equal(withOwnAnswers(null, { 0: rows('a') }), null);
  assert.equal(withOwnAnswers(recap, null), recap);
  assert.equal(withOwnAnswers(recap, 'junk'), recap);
  assert.ok(Object.isFrozen(merged) && Object.isFrozen(merged.rounds));
});

/* ----------------------------- the screens are wired to it ----------------------------- */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const studentScreen = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
const studentShell = read('src/components/liveChallenge/ChallengeStudentShell.jsx');
const dryRun = read('src/components/liveChallenge/ChallengeDryRun.jsx');

test('a round tells the screen what was asked and sent once the server confirmed it — and only what this device sent', () => {
  const settle = region(studentScreen, '  const settle = (grading) => {', '  const settleAsAlreadyRecorded = () => {', 'the settle that confirms an answer');
  assert.match(settle, /const sent = pendingRef\.current;/);
  assert.ok(settle.indexOf('const sent = pendingRef.current;') < settle.indexOf('pendingRef.current = null;'), 'the envelope is read before it is cleared');
  assert.match(settle, /if \(sent\?\.responsePayload\) onOwnAnswer\?\.\(\{ roundIndex: sent\.roundIndex, question, responsePayload: sent\.responsePayload \}\);/);
  // An answer the server already held from another device is not this payload.
  const already = region(studentScreen, '  const settleAsAlreadyRecorded = () => {', '  // REFUSED BEFORE GO.', 'the already-recorded settle');
  assert.doesNotMatch(executableSource(already), /onOwnAnswer/);
  // Both ways an answer is confirmed — the first send and a retry — go through it.
  const submit = region(studentScreen, '  const submit = async (responsePayload, { atRoundEnd = false } = {}) => {', '  useEffect(() => {\n    const transitionedToExpired', 'submit');
  assert.match(submit, /const grading = await submitResponse\(capture\);\s*settle\(grading\);/);
  const retry = region(studentScreen, '  const retryPending = async () => {', '  // The resend at GO calls the latest retry', 'retryPending');
  assert.match(retry, /const grading = await submitResponse\(pending\);\s*settle\(grading\);/);
});

test('only the live round keeps answers: the screen passes the handler, a teacher\'s dry run does not', () => {
  const live = region(studentScreen, '          <ChallengeRound\n            key={`${room.roomId}-${room.currentRound}-${room.roundVersion}`}', '          />', 'the live round');
  assert.match(live, /\n\s*persistResult\n\s*liveShell\n\s*onOwnAnswer=\{keepAnswerHere\}\n/);
  const dryRound = region(dryRun, '    <ChallengeRound', '/>', 'the dry run\'s round');
  assert.doesNotMatch(dryRound, /onOwnAnswer/);
  assert.doesNotMatch(executableSource(dryRun), /challengeOwnAnswers|keepOwnAnswer/);
});

test('the screen keeps the answer for this student and game, and puts what the device kept into the recap', () => {
  const keeping = region(studentScreen, '  const keepAnswerHere = useCallback(', '  // READ ALOUD, for a student', 'keeping and recalling answers');
  assert.match(keeping, /keepOwnAnswer\(\{ storage: ownAnswerStorage\(\), studentId, roomId, roundIndex, question, responsePayload \}\)/);
  assert.match(keeping, /\[studentId, roomId\]\);/);
  assert.match(keeping, /withOwnAnswers\(recap, recallOwnAnswers\(\{ storage: ownAnswerStorage\(\), studentId, roomId \}\)\)/);
  // A last answer confirmed after the recap arrived still reaches it.
  assert.match(keeping, /if \(kept && mountedRef\.current\) setOwnAnswersKept\(\(count\) => count \+ 1\);/);
  assert.match(keeping, /\[recap, studentId, roomId, ownAnswersKept\]/);
  const finished = region(studentScreen, "{room.status === 'finished' && (", "{room.status === 'cancelled' && (", 'the final screen');
  assert.match(finished, /<StudentMatchRecap recap=\{recapWithAnswers\} \/>/);
  assert.doesNotMatch(executableSource(finished), /<StudentMatchRecap recap=\{recap\}/);
  // A browser that refuses storage is not an error.
  assert.match(studentScreen, /const ownAnswerStorage = \(\) => \{\s*try \{ return window\.localStorage; \} catch \{ return null; \}\s*\};/);
});

test('the recap draws a round\'s answer before its solution: typed text as text, LaTeX typeset, a choice in its own words', () => {
  const round = region(studentShell, '{recap.rounds.map((round) => (', '</ol>', 'the recap rounds');
  assert.ok(round.indexOf('{round.ownAnswer && <OwnAnswer rows={round.ownAnswer} />}') > -1 && round.indexOf('{round.ownAnswer && <OwnAnswer rows={round.ownAnswer} />}') < round.indexOf('<RoundSolutionCard'), 'before the worked solution');
  const answer = region(studentShell, 'function OwnAnswer({ rows }) {', '\n}\n', 'the answer');
  assert.match(answer, /Your answer/);
  assert.match(answer, /row\.format === OWN_ANSWER_FORMAT\.LATEX\s*\? <MathText as="span" style=\{\{ fontWeight: 800 \}\}>\{`\$\$\{row\.value\}\$`\}<\/MathText>/);
  assert.match(answer, /row\.format === OWN_ANSWER_FORMAT\.AUTHORED\s*\? <MathText as="span" style=\{\{ fontWeight: 800 \}\}>\{row\.value\}<\/MathText>/);
  // Typed text is a plain text node: MathText would read a "$" in it as mathematics.
  assert.match(answer, /: <span style=\{\{ fontWeight: 800 \}\}>\{row\.value\}<\/span>\}/);
});
