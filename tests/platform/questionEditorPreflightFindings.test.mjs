/*
 * THE QUESTION EDITOR SHOWS WHAT PRE-FLIGHT SAYS ABOUT EACH QUESTION, AS REVIEW DOES.
 *
 * Pre-Flight's readiness warnings (a given written x(x - 5) = 0, a Step
 * Algebra equation whose variable cancels) and its advisory notes ("Use the
 * prices you found", an answer key to check, ...) were shown only in
 * Assignment Review. The Question Editor ran the model only to refuse an
 * error, so a teacher fixing a question there could not see what Pre-Flight
 * said about it.
 *
 * Now each question in the editor has its own findings, in full, from the same
 * model (questionPreflightFindings.js): these tests hold them to Review's lists
 * for the same stored assignment, message by message, as the teacher edits.
 * tests/browser/questionEditorPreflight.mjs opens it in Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { CANCELS_QUESTION_ID, NOTED_QUESTION_ID, PRODUCT_QUESTION_ID, editorPreflightAssignment } from './helpers/editorPreflightFixtures.mjs';
import { getStoredAssignmentQuestions, storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { ADVISORY_FINDING_GROUPS, buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  editorPreflightFindings,
  preflightClassSizeFor,
  preflightFindingsByQuestion,
  preflightFindingsCountText,
} from '../../src/platform/preflight/questionPreflightFindings.js';
import { createPreflightFindingsStore } from '../../src/components/teacher/useQuestionPreflightFindings.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

/* ----------------------------------------------------------------- the fixture */

// Algebra I M3 T2 L2 as stored, with two Step Algebra questions that reached the
// record without an import, so they keep the shapes Pre-Flight warns about
// (helpers/editorPreflightFixtures.mjs). Its Classwork 18, Question 21, says
// "Use the prices you found": a note.
const STORED = editorPreflightAssignment();
const PRODUCT = { questionId: PRODUCT_QUESTION_ID };
const CANCELS = { questionId: CANCELS_QUESTION_ID };
const NOTED_ID = NOTED_QUESTION_ID;

// What Review shows for the stored assignment (a library reuse opens it so):
// the readiness warnings among its authoring notes, the notes in their panels.
const reviewOf = (stored) => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(storedAssignmentToV5(stored), {}));
// What the editor holds for it, and what it shows.
const editorOf = (stored, questions = getStoredAssignmentQuestions(stored)) => ({ questions, found: editorPreflightFindings({ source: stored, questions }) });

const NAMED = /^Question (\d+)\b/;
// Which list of question numbers each many-question note is written from.
const SPREAD = [
  [/only the answer after the last try/, 'answerOnly'],
  [/no solutionReview\.commonError/, 'noCommonError'],
  [/hints with no Spanish version/, 'hintsMissing'],
  [/worked solution with no Spanish version/, 'reviewMissing'],
];
// A many-question note in the words for one: "35 questions — 1, 2 ... have" -> "Question 7 has".
const forOne = (sentence, number) => sentence.replace(/^\d+ questions — [\d, ]+(?: and \d+ more)? (have|show)\b/, (_, verb) => `Question ${number} ${verb === 'have' ? 'has' : 'shows'}`);

test('each question lists, in full, the readiness warnings Review lists for it, and nothing else', () => {
  const review = reviewOf(STORED);
  const { questions, found } = editorOf(STORED);
  assert.equal(review.warnings.length, 2, review.warnings.join('\n'));
  const numberOf = (id) => questions.findIndex((question) => question.questionId === id) + 1;
  const product = found.byQuestionId.get(PRODUCT.questionId);
  const cancels = found.byQuestionId.get(CANCELS.questionId);
  assert.deepEqual(product.warnings, review.warnings.filter((warning) => warning.startsWith(`Question ${numberOf(PRODUCT.questionId)} `)));
  assert.match(product.warnings[0], /writes x straight before a bracket in its equation, "x\(x - 5\) = 0"\. .* Write the multiplication: "x\*\(x - 5\) = 0"\.$/);
  assert.deepEqual(cancels.warnings, review.warnings.filter((warning) => warning.startsWith(`Question ${numberOf(CANCELS.questionId)} `)));
  assert.match(cancels.warnings[0], /has an equation whose variable cancels, "2x \+ 3 = 2x \+ 5": no number is a solution\./);
  // Every warning Review has is on the question it names, once; none is added.
  const shown = [...found.byQuestionId.entries()].flatMap(([id, entry]) => entry.warnings.map((text) => [id, text]));
  assert.deepEqual(shown.map(([, text]) => text).sort(), [...review.warnings].sort());
  shown.forEach(([id, text]) => assert.equal(questions[Number(text.match(NAMED)[1]) - 1].questionId, id, text));
  assert.deepEqual(found.assignment.warnings, []);
  assert.equal(found.warningCount, 2);
});

test('each question lists, in full, the notes Review shows for it: its question-version notes, then its panels\' notes, then a note for many questions; the rest are the whole assignment\'s', () => {
  const review = reviewOf(STORED);
  const { questions, found } = editorOf(STORED);
  const expected = new Map();
  const expect = (number) => {
    const id = questions[number - 1].questionId;
    if (!expected.has(id)) expected.set(id, { versions: [], own: [], shared: [] });
    return expected.get(id);
  };
  // Review's "Question versions and Recovery" panel comes first (questionGeneration.notes).
  const versionNotes = review.questionGeneration?.notes || [];
  const unnamed = [];
  versionNotes.forEach((note) => {
    const named = note.match(NAMED);
    if (named) expect(Number(named[1])).versions.push(note);
    else unnamed.push(note);
  });
  assert.ok(versionNotes.some((note) => NAMED.test(note)) && unnamed.length > 1, 'the lesson has question-version notes that name a question, and some that name none');
  let reviewNotes = 0;
  ADVISORY_FINDING_GROUPS.forEach(({ id }) => {
    (review[id]?.warnings || []).forEach((note) => {
      reviewNotes += 1;
      const named = note.match(NAMED);
      if (named) { expect(Number(named[1])).own.push(note); return; }
      // A note for many questions: its numbers are the list its own audit keeps.
      const [, field] = SPREAD.find(([kind]) => kind.test(note)) || [];
      const numbers = review[id]?.[field];
      assert.ok(numbers?.length > 1, `a many-question note with its numbers: ${note.slice(0, 80)}`);
      numbers.forEach((number) => expect(number).shared.push(forOne(note, number)));
    });
  });
  assert.ok(reviewNotes > 3, 'the lesson has notes of both kinds');
  assert.equal(found.byQuestionId.size, new Set([...expected.keys(), PRODUCT.questionId, CANCELS.questionId]).size);
  for (const [id, { versions, own, shared }] of expected) {
    assert.deepEqual(found.byQuestionId.get(id)?.notes, [...versions, ...own, ...shared], id);
  }
  // Warm-Up 3 draws one of three cases a student is not told: on its card, in Review's words.
  const mixed = found.byQuestionId.get(questions[2].questionId).notes[0];
  assert.match(mixed, /^Question 3 \(Warm-Up Q3\) mixes one solution, no solution, infinitely many solutions .* and the workspace does not tell a student which case they drew\.$/);
  // Classwork 18: "Use the prices you found", exactly as Review's panel says it, first.
  const noted = found.byQuestionId.get(NOTED_ID);
  assert.equal(noted.notes[0], review.otherQuestionReferences.warnings[0]);
  assert.match(noted.notes[0], /^Question 21 says "Use the prices you found", which needs an answer from another question\./);
  assert.deepEqual(noted.warnings, []);
  // "12 questions generate a different version …", "DOL Recovery ready: …": the whole assignment's.
  assert.deepEqual(found.assignment.notes, unnamed);
  assert.ok(unnamed.some((note) => note.startsWith('DOL Recovery ready: ')));
});

test('the findings follow the teacher\'s edits, and Review agrees after each', () => {
  const questions = getStoredAssignmentQuestions(STORED);
  // The product written out: its warning goes.
  const written = questions.map((question) => (question.questionId === PRODUCT.questionId ? { ...question, equationLatex: 'x*(x - 5) = 0', prompt: 'Solve $x(x-5)=0$.' } : question));
  const afterWrite = editorOf(STORED, written).found;
  assert.deepEqual(afterWrite.byQuestionId.get(PRODUCT.questionId)?.warnings || [], []);
  assert.equal(afterWrite.byQuestionId.get(CANCELS.questionId).warnings.length, 1);
  // The cancelling equation excluded: Pre-Flight no longer judges it at all.
  const excluded = written.map((question) => (question.questionId === CANCELS.questionId ? { ...question, teacherExcluded: true } : question));
  const afterExclude = editorOf(STORED, excluded).found;
  assert.equal(afterExclude.byQuestionId.has(CANCELS.questionId), false);
  assert.equal(afterExclude.warningCount, 0);
  // Review on the same edits says the same.
  const review = reviewOf({ ...STORED, sections: rebuildV5SectionsFromQuestions(STORED, excluded) });
  assert.deepEqual(review.warnings, []);
});

test('neither warnings nor notes ever block a save', () => {
  const candidate = buildAssignmentV5PreflightModel(storedAssignmentToV5(STORED, { questions: getStoredAssignmentQuestions(STORED) }));
  assert.equal(candidate.isValid, true, 'the candidate with two warnings and many notes passes Save\'s check');
  assert.deepEqual(candidate.errors, []);
  // Save refuses on the model's errors only, in the editor and in the workspace.
  const editor = executableSource(componentSource('src/AssignmentQuestionEditorBase.jsx'));
  const save = region(editor, 'const save = async () => {', '<div role="presentation"', 'save()');
  assert.doesNotMatch(save, /preflightFindings|warningCount|noteCount/);
  const workspace = executableSource(readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8'));
  const saveEditor = region(workspace, 'const saveQuestionEditor = async', 'const persistence = canonicalV5PersistencePatch', 'saveQuestionEditor');
  assert.match(saveEditor, /if \(!model\.isValid\) \{/);
  assert.doesNotMatch(saveEditor, /model\.warnings|preflightFindings/);
});

test('the editor counts question versions against the class Review counts them against', () => {
  assert.equal(preflightClassSizeFor(['a', 'b'], { a: 24, b: 31, c: 40 }), 31, 'the largest chosen class');
  assert.equal(preflightClassSizeFor([], { a: 24, c: 40 }), 40, 'none chosen: the largest of all');
  assert.equal(preflightClassSizeFor(undefined, {}), null);
  assert.equal(preflightClassSizeFor(['a'], null), null);
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  assert.match(modal, /const preflightClassSize = useMemo\(\s*\(\) => preflightClassSizeFor\(draft\.assignedClassIds, rosterSizesByClassId\),/);
  const editor = executableSource(componentSource('src/AssignmentQuestionEditorBase.jsx'));
  assert.match(editor, /preflightClassSizeFor\(assignment\?\.assignedClassIds, rosterSizesByClassId\)/);
  const workspace = executableSource(readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8'));
  const mount = region(workspace, '<AssignmentQuestionEditor', '/>', 'the editor\'s mount');
  assert.match(mount, /rosterSizesByClassId=\{preflightRosterSizesByClassId\}/);
});

test('a note that names no question, or a warning on no question, is the whole assignment\'s; nothing is dropped', () => {
  const found = preflightFindingsByQuestion({
    questions: [{ questionId: 'q1' }, { questionId: 'q2' }],
    diagnostics: [
      { severity: 'warning', message: 'Question 2 warns.', questionId: 'q2', questionIndex: 1 },
      { severity: 'warning', message: 'Every question is aligned to A.5A.', questionId: null, questionIndex: null },
      { severity: 'blocking', message: 'Question 1 cannot be saved.', questionId: 'q1', questionIndex: 0 },
    ],
    hintAnswers: { warnings: ['Question 1, hint 2 gives the answer.'] },
    spanishVersions: { warnings: ['2 questions — 1, 2 have hints with no Spanish version, so a student who reads in Spanish sees them in English only. Add translations.es.hints: one Spanish line for each hint, in the same order, with every number, letter and symbol exactly as in the English.', 'A note for no question.'], hintsMissing: [1, 2], reviewMissing: [] },
    // Review's question-version notes: one opening with its question, a
    // Recovery note ending with it, one for the assignment, one naming two.
    questionGeneration: { notes: [
      '2 questions generate a different version for each student from a Question Family.',
      'Question 1 (Warm-Up Q1) mixes one solution, no solution in equal shares as students are seated.',
      'Warm-Up Recovery will skip one question: its family cannot make a fresh version (Question 2)',
      '2 questions are graded on the student\'s device; the server records that result within its attempt limits but cannot re-mark it: Question 1 (a drawing); Question 2 (a drawing).',
    ] },
  });
  assert.deepEqual(found.byQuestionId.get('q1'), { warnings: [], notes: ['Question 1 (Warm-Up Q1) mixes one solution, no solution in equal shares as students are seated.', 'Question 1, hint 2 gives the answer.', 'Question 1 has hints with no Spanish version, so a student who reads in Spanish sees them in English only. Add translations.es.hints: one Spanish line for each hint, in the same order, with every number, letter and symbol exactly as in the English.'] });
  assert.deepEqual(found.byQuestionId.get('q2').warnings, ['Question 2 warns.'], 'a blocking error is not a warning');
  assert.deepEqual(found.byQuestionId.get('q2').notes, ['Warm-Up Recovery will skip one question: its family cannot make a fresh version (Question 2)', 'Question 2 has hints with no Spanish version, so a student who reads in Spanish sees them in English only. Add translations.es.hints: one Spanish line for each hint, in the same order, with every number, letter and symbol exactly as in the English.']);
  assert.deepEqual(found.assignment, { warnings: ['Every question is aligned to A.5A.'], notes: ['2 questions generate a different version for each student from a Question Family.', '2 questions are graded on the student\'s device; the server records that result within its attempt limits but cannot re-mark it: Question 1 (a drawing); Question 2 (a drawing).', 'A note for no question.'] });
  assert.equal(found.warningCount, 2);
  assert.equal(found.noteCount, 8);
  assert.deepEqual(preflightFindingsByQuestion({}), { byQuestionId: new Map(), assignment: { warnings: [], notes: [] }, warningCount: 0, noteCount: 0 });
});

test('the region\'s heading counts what it holds', () => {
  assert.equal(preflightFindingsCountText({ warnings: ['a'], notes: ['b', 'c'] }), '1 warning, 2 notes');
  assert.equal(preflightFindingsCountText({ warnings: ['a', 'b'], notes: [] }), '2 warnings');
  assert.equal(preflightFindingsCountText({ warnings: [], notes: ['b'] }), '1 note');
  assert.equal(preflightFindingsCountText({}), '');
});

/* ------------------------------------------------------------------- the wiring */

test('the editor runs the hook on the candidate Save judges, never on the title, and shows a region on each question below its controls', () => {
  const editor = executableSource(componentSource('src/AssignmentQuestionEditorBase.jsx'));
  assert.match(editor, /const preflightStore = useQuestionPreflightFindings\(\{\s*source: candidateSource,\s*questions,\s*classSize: preflightClassSize,\s*\}\);/);
  const card = region(editor, '<article', '</article>', 'a question card');
  const controls = card.indexOf("{hasLiveProtection ? 'Throw Out Safely' : 'Remove'}");
  const findings = card.indexOf('<QuestionPreflightFindings store={preflightStore} questionId={question.questionId} subject={`Question ${index + 1}`} />');
  const notices = card.indexOf('{supersession.isVersioned && supersessionSummary && (');
  assert.ok(controls > 0 && findings > controls && notices > findings, 'after the question\'s controls, before its notices');
  const list = region(editor, '<PreflightFindingsState', '{questions.map((question, index) => {', 'the list above the cards');
  assert.match(list, /store=\{preflightStore\} source=\{candidateSource\} questions=\{questions\} classSize=\{preflightClassSize\}>\s*<QuestionPreflightFindings store=\{preflightStore\} subject="the whole assignment" \/>\s*<\/PreflightFindingsState>/);
  // The editor holds no findings in its own state: they never redraw its cards.
  assert.doesNotMatch(editor, /preflightFindings\b|preflightStore\.snapshot/);
});

test('the hook runs once as the editor opens, then only when the questions have been still for the delay, in the worker', () => {
  const hook = executableSource(readFileSync(new URL('../../src/components/teacher/useQuestionPreflightFindings.js', import.meta.url), 'utf8'));
  assert.match(hook, /export const PREFLIGHT_FINDINGS_DELAY_MS = 500;/);
  const effect = region(hook, 'useEffect(() => {', '}, [store, runner, source, questions, classSize, delayMs]);', 'the effect');
  assert.match(effect, /const timer = setTimeout\(\(\) => \{[\s\S]*runner\.request\(\{ source, questions, classSize \}, \(findings, basis\) => store\.publish\(findings, basis\)\);[\s\S]*\}, ranRef\.current \? delayMs : 0\);/);
  // An edit (or closing the editor) clears the timer and makes a run still going stale.
  assert.match(effect, /return \(\) => \{\s*clearTimeout\(timer\);\s*runner\.cancel\(\);\s*\};/);
  // An edit publishes nothing and sets no state: the editor draws once a
  // keystroke, as before, and the findings already shown stay until the new ones are in.
  const beforeTimer = effect.slice(0, effect.indexOf('const timer = setTimeout('));
  assert.doesNotMatch(beforeTimer, /setState|publish|request/);
  assert.doesNotMatch(hook, /useState\(\{ findings/);
  // The hook makes no run on the page's thread: the runner hands each to the
  // worker (questionEditorPreflightWorker.test.mjs), and closing the editor ends it.
  const body = region(hook, 'export default function useQuestionPreflightFindings', '\n}', 'the hook');
  assert.doesNotMatch(body, /editorPreflightFindings|answerEditorPreflightRequest|buildAssignmentV5PreflightModel/);
  assert.match(body, /const \[runner\] = useState\(createPreflightFindingsRunner\);/);
  assert.match(body, /useEffect\(\(\) => \(\) => runner\.stop\(\), \[runner\]\);/);
  // The worker in the one form Vite bundles as a worker, answering with the page's own function.
  assert.match(hook, /new Worker\(new URL\('\.\.\/\.\.\/platform\/preflight\/editorPreflightWorker\.js', import\.meta\.url\), \{ type: 'module'/);
  const worker = executableSource(readFileSync(new URL('../../src/platform/preflight/editorPreflightWorker.js', import.meta.url), 'utf8'));
  assert.match(worker, /self\.addEventListener\('message', \(event\) => \{\s*self\.postMessage\(answerEditorPreflightRequest\(event\.data\)\);\s*\}\);/);
});

test('the store hands each region its question\'s findings, the same object while they do not change', () => {
  const store = createPreflightFindingsStore();
  const heard = [];
  const unsubscribe = store.subscribe(() => heard.push(store.snapshot()));
  assert.deepEqual(store.snapshot(), { findings: null, basis: null });
  const run = (warnings) => preflightFindingsByQuestion({
    questions: [{ questionId: 'q1' }, { questionId: 'q2' }],
    diagnostics: warnings.map((message) => ({ severity: 'warning', message, questionId: message.startsWith('Question 1') ? 'q1' : 'q2' })),
    hintAnswers: { warnings: ['Question 2, hint 1 gives the answer.'] },
  });
  const basis = { source: {}, questions: [], classSize: null };
  store.publish(run(['Question 1 warns.']), basis);
  const first = store.snapshot().findings;
  assert.equal(heard.length, 1);
  assert.equal(store.snapshot().basis, basis);
  // A run where only question 1's findings change keeps question 2's object.
  store.publish(run(['Question 1 warns again.']), basis);
  const second = store.snapshot().findings;
  assert.equal(second.byQuestionId.get('q2'), first.byQuestionId.get('q2'), 'unchanged: the same object, so its region is not drawn again');
  assert.notEqual(second.byQuestionId.get('q1'), first.byQuestionId.get('q1'));
  assert.equal(second.assignment, first.assignment);
  // A run the model could not make leaves nothing to show.
  store.publish(null, basis);
  assert.equal(store.snapshot().findings, null);
  unsubscribe();
  store.publish(run([]), basis);
  assert.equal(heard.length, 3, 'a listener that left hears nothing more');
});

test('the region: a heading with the count, no landmark, a list item by item; warnings open, notes behind Show; nothing announced or focused', () => {
  const view = executableSource(readFileSync(new URL('../../src/components/teacher/PreflightFindings.jsx', import.meta.url), 'utf8'));
  // Not a landmark (preflightFindingsRegion.test.mjs renders it): one for each
  // question flooded a screen reader's landmark list.
  assert.match(view, /<div data-preflight-findings=\{subject\} style=\{regionStyle\}>/);
  assert.doesNotMatch(view, /<section\b|role="region"|aria-labelledby/);
  assert.match(view, /<h3 style=\{headingStyle\}>\s*Pre-Flight<span className="mm-visually-hidden"> for \{subject\}:<\/span><span aria-hidden="true">:<\/span> \{preflightFindingsCountText\(\{ warnings, notes \}\)\}\s*<\/h3>/);
  assert.match(view, /aria-expanded=\{open\}\s*aria-controls=\{listId\}/);
  assert.match(view, /const \[open, setOpen\] = useState\(warnings\.length > 0\);/);
  assert.match(view, /<ul id=\{listId\} hidden=\{!open\} style=\{\{ \.\.\.listStyle, display: open \? 'grid' : 'none' \}\}>/);
  assert.match(view, /<li key=\{`warning:\$\{text\}`\} data-preflight-finding="warning">\s*<strong style=\{KIND_STYLE\.warning\}>Warning: <\/strong>\{text\}/);
  assert.match(view, /<li key=\{`note:\$\{text\}`\} data-preflight-finding="note">\s*<strong style=\{KIND_STYLE\.note\}>Note: <\/strong>\{text\}/);
  assert.doesNotMatch(view, /aria-live|role="(?:alert|status)"|\.focus\(|scrollIntoView/, 'nothing that interrupts typing');
  assert.match(view, /const PreflightFindingsRegion = memo\(PreflightFindings\);/);
  // Each region subscribes to its own question's findings in the store.
  const slot = region(view, 'export const QuestionPreflightFindings = memo(', '\n});', 'a question\'s region');
  assert.match(slot, /useSyncExternalStore\(store\.subscribe, \(\) => \{[\s\S]*questionId == null \? all\.assignment : \(all\.byQuestionId\.get\(String\(questionId\)\) \|\| null\)/);
  assert.match(slot, /return findings \? <PreflightFindingsRegion findings=\{findings\} subject=\{subject\} \/> : null;/);
  const state = region(view, 'export function PreflightFindingsState(', '\n}', 'the state');
  assert.match(state, /const current = Boolean\(basis\) && basis\.source === source && basis\.questions === questions && basis\.classSize === classSize;/);
});

test('it stays off the student\'s first load: only lazy teacher screens import it', () => {
  const importers = (needle) => ['src/AssignmentQuestionEditorBase.jsx', 'src/components/teacher/LessonPreflightModal.jsx', 'src/app/teacher/TeacherWorkspace.jsx', 'src/App.jsx']
    .filter((file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').includes(needle));
  assert.deepEqual(importers('questionPreflightFindings.js'), ['src/AssignmentQuestionEditorBase.jsx', 'src/components/teacher/LessonPreflightModal.jsx']);
  assert.deepEqual(importers('PreflightFindings.jsx'), ['src/AssignmentQuestionEditorBase.jsx']);
  assert.deepEqual(importers('useQuestionPreflightFindings.js'), ['src/AssignmentQuestionEditorBase.jsx']);
  // The worker (the model's whole graph again, about 0.9 MB gzip) is started
  // by the hook alone, so only a teacher who opens the editor ever fetches it.
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  const startsWorker = walk('src').filter((file) => /\.(?:js|jsx)$/.test(file) && executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')).includes('editorPreflightWorker.js'));
  assert.deepEqual(startsWorker, ['src/components/teacher/useQuestionPreflightFindings.js']);
  const lazy = readFileSync(new URL('../../src/app/lazyScreens.js', import.meta.url), 'utf8');
  assert.match(lazy, /export const AssignmentQuestionEditor = lazy\(\(\) => import\('\.\.\/AssignmentQuestionEditor\.jsx'\)\);/);
  assert.match(lazy, /export const LessonPreflightModal = lazy\(\(\) => import\('\.\.\/components\/teacher\/LessonPreflightModal\.jsx'\)\);/);
});
