/*
 * THE QUESTION EDITOR IS WIRED TO THE SUPERSESSION GUARD.
 *
 * node cannot render the editor, so each contract is bound to the handler or
 * card region that does the work (region(...)) and asserts what it must DO:
 * ask the guard before Include changes anything, leave the list untouched on
 * a refusal, explain the refusal on the card itself, refuse to save two
 * active versions of one question, and never create a second version through
 * Duplicate, a repair, or a removal. See docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.
 *
 * The behaviour itself is proven in questionSupersessionGuard.test.mjs; the
 * rendered card is certified at phone, iPad and Chromebook sizes by
 * tests/browser/questionEditorSupersession.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assignmentQuestionEditorSource } from './helpers/splitComponentSource.mjs';
import { assertCapability, executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const editorBase = executableSource(read('src/AssignmentQuestionEditorBase.jsx'));
const editor = executableSource(assignmentQuestionEditorSource());

test('the guard is imported next to its calls (a .jsx call with no import passes every check and fails at runtime)', () => {
  const imported = /import\s*\{([^}]*)\}\s*from\s*'\.\/platform\/assignments\/questionSupersession\.js'/.exec(editorBase);
  assert.ok(imported, 'AssignmentQuestionEditorBase imports the supersession guard');
  for (const name of ['planQuestionInclusion', 'describeQuestionSupersession', 'findSupersessionConflicts', 'withoutSupersessionLink', 'keepSupersessionLink', 'detachSupersessionLinksTo']) {
    assert.match(imported[1], new RegExp(`\\b${name}\\b`), `${name} is imported`);
    assert.match(editorBase, new RegExp(`\\b${name}\\(`), `${name} is called`);
  }
});

test('1. Include asks the guard first, and a refusal returns before the question list changes', () => {
  const toggle = region(editorBase, 'const toggleExcluded', 'const removeQuestion', 'toggleExcluded');
  const plan = toggle.indexOf('planQuestionInclusion(');
  assert.ok(plan > 0, 'Include is planned by the guard');
  const refused = toggle.indexOf("plan.status !== 'ready'");
  assert.ok(refused > plan, 'the plan status is checked');
  const apply = toggle.indexOf('setQuestions(plan.questions)');
  assert.ok(apply > refused, 'only a ready plan is applied');
  const refusalBranch = toggle.slice(refused, apply);
  assert.match(refusalBranch, /plan\.teacherMessage/, 'the teacher is told why, in the guard\'s words');
  assert.match(refusalBranch, /return;/, 'and the handler stops');
  assert.doesNotMatch(refusalBranch, /setQuestions\(/, 'a refusal never touches the questions');
  // Exclude stays a plain, always-allowed retirement.
  assert.match(toggle, /teacherExcluded:\s*true/);
});

test('the save refuses two active versions of one question, before anything is written', () => {
  const save = region(editorBase, 'const save = async', 'return (', 'save');
  const check = save.indexOf('findSupersessionConflicts(');
  const write = save.indexOf('onSave(');
  assert.ok(check > 0 && write > check, 'conflicts are checked before onSave');
  assert.match(save.slice(check, write), /return;/);
  // The Safe Repair Pack import saves directly, so it is guarded too.
  const pack = region(editorBase, 'const importSafeRepairPack', 'const swapHonorsExtension', 'importSafeRepairPack');
  const packCheck = pack.indexOf('findSupersessionConflicts(');
  assert.ok(packCheck > 0 && pack.indexOf('onSave(') > packCheck, 'the pack import checks before it saves');
});

test('no editor action can create a second version: Duplicate drops the link, a repair keeps the existing one, a removal detaches it', () => {
  const duplicate = region(editorBase, 'const duplicateQuestion', 'const moveQuestion', 'duplicateQuestion');
  assert.match(duplicate, /withoutSupersessionLink\(/);
  const repair = region(editorBase, 'const acceptRepairReplacement', 'const repairWithMathMasterAi', 'acceptRepairReplacement');
  assert.match(repair, /keepSupersessionLink\(/);
  const remove = region(editorBase, 'const removeQuestion', 'const duplicateQuestion', 'removeQuestion');
  // Throw Out Safely still only retires; a permanent removal detaches links to the removed id.
  assert.match(remove, /teacherExcluded:\s*true/);
  assert.match(remove, /detachSupersessionLinksTo\(/);
});

test('the card shows that a question was replaced, by which question, and why Include is unavailable', () => {
  const cards = region(editorBase, '{questions.map((question, index) => {', '{repairIndex === index', 'question cards');
  assert.match(cards, /describeQuestionSupersession\(questions,\s*index\)/);
  assertCapability(cards, ['Replaced by Question', /REPLACED/], 'a replaced question is labelled as replaced');
  assertCapability(cards, ['Replaces Question', /REPLACEMENT/], 'an active replacement names what it replaced');
  // The Include control is marked unavailable for assistive technology, and
  // the reason is visible text on the card, not a hover tooltip.
  assert.match(cards, /aria-disabled=\{[^}]*includeBlocked/);
  assert.match(cards, /includeBlockedReason/);
  assert.match(cards, /role="alert"/, 'a refused Include is announced where the teacher pressed it');
  assert.match(cards, /inclusionNotice/);
});

test('20. the new card controls stay usable on phones, iPads and Chromebooks', () => {
  const notice = region(editorBase, '{supersession.isVersioned', '{honorsAction', 'supersession notice');
  const heights = [...notice.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.ok(heights.length >= 1 && heights.every((height) => height >= 44), `touch targets ≥ 44px (${heights})`);
  assert.match(notice, /flexWrap:\s*'wrap'/);
  assert.doesNotMatch(notice, /onMouseEnter|onMouseOver|:hover/, 'nothing depends on hover');
  assert.doesNotMatch(notice, /width:\s*\d{4,}|minWidth:\s*[4-9]\d\d/, 'no fixed width wider than a phone');
  // The Include/Exclude control itself is a real touch target too.
  const toolbar = region(editorBase, 'onClick={() => toggleExcluded(index)}', '</button>', 'Include/Exclude button');
  const toolbarHeights = [...toolbar.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.ok(toolbarHeights.length === 1 && toolbarHeights[0] >= 44, `Include/Exclude ≥ 44px (${toolbarHeights})`);
  // The wrapper still renders the base that holds all of this.
  assert.match(editor, /<AssignmentQuestionEditorBase\b/);
});
