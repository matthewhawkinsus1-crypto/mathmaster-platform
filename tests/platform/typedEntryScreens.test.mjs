/*
 * AN UNFINISHED OR OVER-LONG ENTRY CANNOT BE SUBMITTED, ON ANY TYPED-FIELD
 * SURFACE (#557, #558; the owner, 2026-11-19).
 *
 * The rule is functions/shared/typedEntryGuard.mjs (typedEntryGuard.test.mjs).
 * This file holds that each screen asks it and acts on the answer: the
 * assignment engine's six typed graders, My Math Path's generic boxes, and the
 * secure field item (a secure test and Test Cycle Corrections). Nothing here
 * renders (node cannot import .jsx): the Path rule is a plain module and is
 * run; the components are read, each assertion bound to the statement that
 * does the work. tests/browser/typedEntryRefusal.mjs types into the real
 * screens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const pathEntry = await import('../../src/platform/path/pathResponseEntry.js').catch(() => ({}));
const read = (file) => executableSource(componentSource(file));

test('My Math Path: Check is held back while a box is unfinished or too long, and the box says why', () => {
  const { pathEntryProblem, pathResponseComplete } = pathEntry;
  const fields = [{ id: 'a', inputProfile: 'number' }, { id: 'b', inputProfile: 'expression' }];
  assert.equal(pathResponseComplete(fields, { a: '12', b: '2x+1' }), true);
  assert.equal(pathResponseComplete(fields, { a: '12', b: '' }), false, 'a blank box, as before');
  assert.equal(pathResponseComplete(fields, { a: '12 +', b: '2x+1' }), false, 'an unfinished entry');
  assert.equal(pathResponseComplete(fields, { a: '12', b: '2x+1\\cdot' }), false);
  assert.equal(pathResponseComplete(fields, { a: '*12', b: '2x+1' }), false);
  assert.equal(pathResponseComplete(fields, { a: '12', b: 'x'.repeat(241) }), false, 'an entry over 240 characters');
  assert.equal(pathResponseComplete(fields, { a: '-12', b: '3*-x' }), true, 'a sign that opens a term is finished');
  assert.match(pathEntryProblem(fields[0], '12 +'), /not finished.*no try is used/);
  assert.match(pathEntryProblem(fields[1], 'x'.repeat(241)), /240 characters.*no try is used/);
  assert.equal(pathEntryProblem(fields[0], '12'), '');
  // A choice is never typed. A box of words is read for its length only.
  assert.equal(pathEntryProblem({ id: 'c', inputProfile: 'choice' }, 'A+'), '');
  assert.equal(pathResponseComplete([{ id: 'w', inputProfile: 'text' }], { w: 'A+' }), true);
  assert.equal(pathResponseComplete([{ id: 'w', inputProfile: 'text' }], { w: 'x'.repeat(241) }), false);
  // No fields at all: the one default box, as before.
  assert.equal(pathResponseComplete([], { answer: 'increasing' }), true);
  assert.equal(pathResponseComplete([], {}), false);

  // The player gates both Check and Enter on it, and each box draws the sentence.
  const player = read('src/components/student/PathSessionPlayer.jsx');
  assert.match(player, /const complete = pathResponseComplete\(fields, values\);/);
  assert.match(region(player, 'const submit = async () => {', 'await onSubmitAnswer', 'the generic renderer\'s submit'), /if \(!complete \|\| isSubmitting \|\| finalized\) return;/);
  const boxes = read('src/components/student/PathResponseFields.jsx');
  for (const box of ['function WordField(', 'function MathField(']) {
    assert.match(region(boxes, box, '\n}\n', box), /<TypedEntryNotice message=\{disabled \? '' : pathEntryProblem\(field, value\)\}/, `${box} draws the notice`);
  }
});

test('the assignment engine: each typed grader reports an unfinished or over-long entry as not ready to submit', () => {
  // The engine submits only a complete answer (handleSubmit, performSubmit and
  // the Submit button all read answerState.isComplete), so "not complete" is
  // "not submitted, no try used".
  const engine = read('src/QuestionEngine.jsx');
  assert.match(region(engine, 'const performSubmit = async', 'serverGrading', 'performSubmit\'s guard'), /if \(!answerState\.isComplete \|\|/);
  assert.match(region(engine, 'const handleSubmit = async () => {', 'await performSubmit()', 'handleSubmit'), /if \(!answerState\.isComplete \|\|/);
  assert.match(engine, /const submitDisabled = !answerState\.isComplete \|\|/);

  const multi = read('src/MultiAnswerGrader.jsx');
  const entryProblems = region(multi, 'const entryProblems = useMemo(', '\n  useEffect(', 'entryProblems');
  assert.match(entryProblems, /typedEntryNotice\(answers\[field\.id\], \{/);
  assert.match(entryProblems, /words: shouldUsePlainTextInput\(field\) \|\| isChoiceAnswerField\(field\)/, 'a box of words or choices is read for its length only');
  // What it protects: a box whose shape or entry is refused keeps the whole
  // answer "not complete", so it is not submitted. The statement may fold in
  // other reasons too (SP-4: a part's step not done yet); these two stay.
  const complete = /const isComplete = ([^;]+);/.exec(entryProblems)?.[1] || '';
  assert.match(complete, /^graded\.isComplete\s*&&/, 'isComplete starts from the grader');
  assert.match(complete, /&&\s*!Object\.values\(formatProblems\)\.some\(Boolean\)/, 'a refused shape is not complete');
  assert.match(complete, /&&\s*!Object\.values\(entryProblems\)\.some\(Boolean\)/, 'a refused entry is not complete');
  assert.doesNotMatch(complete, /\|\|/, 'no other reason can make a refused entry complete');
  assert.match(region(multi, 'onStateChange({', '});', 'the grader\'s report'), /\n\s+isComplete,/, 'and that isComplete is what the engine is told');
  assert.match(multi, /<TypedEntryNotice message=\{entryProblems\[field\.id\]\} entry=\{answers\[field\.id\]\}/);
  // Part by part: a part whose entry is refused cannot be passed.
  assert.match(region(multi, 'const partDone = useMemo(', 'const firstOpenPart', 'partDone'), /&& !entryProblems\[field\.id\]/);

  for (const [file, value, complete] of [
    ['src/LiteralGrader.jsx', 'answer, { keys: safeAcceptedAnswers }', /const isComplete = graded\.isComplete && !entryProblem;/],
    ['src/FractionGrader.jsx', 'answer', /const isComplete = graded\.isComplete && !formProblem && !entryProblem;/],
    ['src/OrderedPairGrader.jsx', 'studentAnswer', /const isComplete = graded\.isComplete && !entryProblem;/],
    ['src/SystemGrader.jsx', 'answer', /const isComplete = graded\.isComplete && !entryProblem;/],
  ]) {
    const source = read(file);
    assert.ok(source.includes(`const entryProblem = typedEntryNotice(${value});`), `${file} asks the rule`);
    assert.match(source, complete, `${file} folds it into isComplete`);
    assert.match(region(source, 'onStateChange({', '});', `${file}'s report`), /\n\s+isComplete,/, `${file} reports that isComplete`);
    assert.match(source, /<TypedEntryNotice message=\{entryProblem\} entry=\{/, `${file} draws the notice`);
  }
  const table = read('src/TableGrader.jsx');
  const cells = region(table, 'const entryProblem = useMemo(', 'useEffect(', 'the table\'s entryProblem');
  assert.match(cells, /for \(const key of editableKeys\)/);
  assert.match(cells, /typedEntryNotice\(studentAnswers\[key\]\)/);
  assert.match(cells, /const isComplete = graded\.isComplete && !entryProblem;/);
  assert.match(table, /<TypedEntryNotice\s+message=\{entryProblem \?/);
});

test('the secure field item: Corrections cannot submit such an entry, and a secure test says so at the box', () => {
  const runtime = read('src/components/question/RichQuestionRuntime.jsx');
  const item = region(runtime, 'const FieldItem = (', 'const actionLabel', 'FieldItem');
  assert.match(item, /typedEntryNotice\(responses\[field\.id\], \{ words, tries: !navigationMode \}\)/);
  // A choice is not typed.
  assert.match(item, /const typed = !\(field\.choices\?\.length \|\| \(fields\.length === 1 && choices\.length\)\);/);
  assert.match(item, /const complete = fields\.every\(\(field\) => String\(responses\[field\.id\] \?\? ''\)\.trim\(\)\) && !Object\.values\(entryProblems\)\.some\(Boolean\);/);
  // Where there is a Submit (Corrections: every press spends a try), it is held back.
  assert.match(item, /if \(navigationMode \|\| !complete \|\| locked\) return;/);
  // (and, on a follow-through item, held until its rules arrive: SP-3)
  assert.match(runtime, /const enabled = complete && !locked(?: && !followThrough\.pending)?;/);
  // In a secure test the draft is still saved as typed: the refusal loses nothing.
  const update = region(item, 'const updateResponse = (id, value) => {', '\n  };\n', 'updateResponse');
  assert.match(update, /onDraftChange\?\.\(\{ responses: next/);
  assert.doesNotMatch(update, /entryProblems|typedEntryNotice/);
  assert.match(runtime, /<TypedEntryNotice message=\{locked \? '' : entryProblems\[field\.id\]\} entry=\{responses\[field\.id\] \?\? ''\} \/>/);
});

test('the notice waits for the entry to stand, and is a status a screen reader hears once', () => {
  const notice = read('src/components/common/TypedEntryNotice.jsx');
  assert.match(notice, /export const TYPED_ENTRY_NOTICE_DELAY_MS = \d+;/);
  assert.match(notice, /setTimeout\(\(\) => setShown\(message\), TYPED_ENTRY_NOTICE_DELAY_MS\)/);
  assert.match(notice, /return \(\) => clearTimeout\(timer\);/);
  assert.match(notice, /\}, \[message, entry\]\);/, 'the wait starts again when the entry changes');
  assert.match(notice, /if \(!message \|\| shown !== message\) return null;/, 'gone as soon as the entry is fine');
  assert.match(notice, /<p role="status"[^>]*data-typed-entry-notice/);
});

test('review: Live Challenge cannot lock in an unfinished or over-long entry, and its box says why', async () => {
  // The round is graded by My Math Path's comparison, which refuses such an
  // entry. A lock-in cannot be taken back: locked in unseen, `12 +` for a
  // field keyed 12 lost the round with nothing on the screen to say why.
  const { liveChallengeEntryProblem, liveChallengeResponseComplete } = await import('../../src/platform/liveChallenge/liveChallengeEntry.js').catch(() => ({}));
  const fields = [{ id: 'a', kind: 'math' }, { id: 'b', kind: 'choice' }, { id: 'c', kind: 'text' }];
  assert.equal(liveChallengeResponseComplete(fields, { a: '12', b: 'B+', c: 'increasing' }), true);
  assert.equal(liveChallengeResponseComplete(fields, { a: '12 +', b: 'B+', c: 'increasing' }), false);
  assert.equal(liveChallengeResponseComplete(fields, { a: '12\\cdot', b: 'B+', c: 'increasing' }), false);
  assert.equal(liveChallengeResponseComplete(fields, { a: 'x'.repeat(241), b: 'B+', c: 'increasing' }), false);
  assert.equal(liveChallengeResponseComplete(fields, { a: '12', b: 'B+', c: 'x'.repeat(241) }), false, 'a box of words is read for its length');
  assert.equal(liveChallengeResponseComplete(fields, { a: '12', b: 'B+', c: 'A+' }), true);
  assert.equal(liveChallengeResponseComplete(fields, { a: '', b: 'B+', c: 'increasing' }), false, 'a blank box, as before');
  assert.equal(liveChallengeResponseComplete([], {}), false, 'no fields, as before');
  assert.match(liveChallengeEntryProblem('math', '12 +'), /not finished.*cannot be locked in/);
  assert.doesNotMatch(liveChallengeEntryProblem('math', '12 +'), /try/, 'a lock-in is not a try');
  assert.match(liveChallengeEntryProblem('math', 'x'.repeat(241)), /240 characters.*cannot be locked in/);
  assert.equal(liveChallengeEntryProblem('math', '-12'), '');
  assert.equal(liveChallengeEntryProblem('choice', 'B+'), '');

  const source = read('src/components/liveChallenge/LiveChallengeFieldQuestion.jsx');
  assert.match(source, /const complete = readiness\.eligible\s+&& liveChallengeResponseComplete\(fields\.map\(\(field\) => \(\{ id: field\.id, kind: fieldKind\(field\) \}\)\), responses\);/);
  // Lock In and Enter both go through `complete`.
  assert.match(region(source, 'const submit = async () => {', 'setLockPressed(true)', 'the lock-in'), /if \(!complete \|\| disabled \|\| busy\) return;/);
  assert.match(source, /disabled=\{!complete \|\| disabled \|\| busy\} onClick=\{submit\}/);
  for (const [box, kind] of [['function MathField(', 'math'], ['function TextField(', 'text']]) {
    assert.ok(region(source, box, '\n}\n', box).includes(`<TypedEntryNotice message={disabled ? '' : liveChallengeEntryProblem('${kind}', value)}`), `${box} draws the notice`);
  }
});
