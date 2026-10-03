/*
 * THE SCREENS ARE WIRED TO THE RECIPE REGISTRY, NOT TO A FALLBACK.
 *
 * node cannot render these components, so each contract below is anchored to
 * the handler that does the work (region(...)) and asserts what it must DO:
 * ask the registry, honour an "unavailable" answer by leaving the assignment
 * unchanged, validate the candidate before accepting it, and carry the swap's
 * appended section through the editor's save. See
 * docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assignmentQuestionEditorSource } from './helpers/splitComponentSource.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const modal = executableSource(read('src/components/teacher/LessonPreflightModal.jsx'));
const app = executableSource(read('src/App.jsx'));
const editorBase = executableSource(read('src/AssignmentQuestionEditorBase.jsx'));
const editor = executableSource(assignmentQuestionEditorSource());

test('the no-AI button asks the recipe registry with the assignment\'s course, and an unavailable answer changes nothing', () => {
  assert.match(modal, /import\s*\{[^}]*buildDeterministicHonorsExtension[^}]*\}\s*from\s*'..\/..\/platform\/rigor\/honorsExtensionRecipes\.js'/);
  assert.doesNotMatch(modal, /buildHonorsEnrichmentQuestion/, 'the generic generator is no longer reachable from Pre-Flight');
  const handler = region(modal, 'const addLocalHonorsDepth', 'const sectionVariantMode', 'addLocalHonorsDepth');
  assert.match(handler, /buildDeterministicHonorsExtension\(\{[\s\S]*assignmentCourseId:\s*effectiveAssignmentV5\?\.assignment\?\.courseId/);
  // "unavailable" → message, and return BEFORE the extension is stored.
  const unavailable = handler.indexOf("status !== 'ready'");
  const stored = handler.indexOf('setHonorsEnrichmentQuestion(');
  assert.ok(unavailable > 0 && stored > unavailable, 'the unavailable branch is checked before anything is stored');
  assert.match(handler.slice(unavailable, stored), /setHonorsAiMessage\([\s\S]*?\);\s*return;/);
  // The candidate is judged by the full Pre-Flight before it is accepted.
  assert.match(handler, /buildAssignmentV5PreflightModel\(/);
  assert.match(handler, /newlyIntroducedPreflightErrors\(/);
  // The button keeps its name; its explanation no longer promises a generic extension.
  assert.match(modal, /Add built-in Honors extension \(no AI\)/);
});

test('publish uses the extension the teacher reviewed, never regenerates per destination course, and certifies it', () => {
  assert.match(app, /import\s*\{[^}]*buildDeterministicHonorsExtension[^}]*certifyHonorsExtensionQuestion[^}]*\}\s*from\s*'\.\/platform\/rigor\/honorsExtensionRecipes\.js'|import\s*\{[^}]*certifyHonorsExtensionQuestion[^}]*buildDeterministicHonorsExtension[^}]*\}\s*from\s*'\.\/platform\/rigor\/honorsExtensionRecipes\.js'/);
  assert.doesNotMatch(app, /buildHonorsEnrichmentQuestion/);
  const split = region(app, 'const destinationVariants = destinationGroups.map', 'const createdAssignments = []', 'honors destination split');
  assert.doesNotMatch(split, /course:\s*destination\.course/, 'the extension is never rebuilt from a destination class\'s course');
  assert.match(split, /certifyHonorsExtensionQuestion\(enrichmentQuestion\)/);
});

test('the editor save evaluates the final candidate, including a swap\'s appended section', () => {
  const save = region(app, 'const saveQuestionEditor = async', 'const persistence = canonicalV5PersistencePatch', 'saveQuestionEditor');
  assert.match(save, /appendedSections/);
  assert.match(save, /withAppendedQuestionSections\(questionEditorAssignment,\s*appendedSections\)/);
  assert.match(save, /buildAssignmentV5PreflightModel\(candidateV5\)/);
  assert.match(save, /if \(!model\.isValid\)/, 'an invalid active question still blocks the save');
  assert.match(app, /import\s*\{[^}]*withAppendedQuestionSections[^}]*\}\s*from\s*'\.\/platform\/rigor\/honorsExtensionSwap\.js'/);
});

test('the question editor offers Swap / Replace with Current Honors Extension, validated before it is applied', () => {
  assert.match(editor, /honorsExtensionActionFor\(/);
  assert.match(editor, /Swap Honors Extension|action\.label/);
  const swap = region(editorBase, 'const swapHonorsExtension', 'const applyMetadataEdit', 'swapHonorsExtension');
  assert.match(swap, /planHonorsExtensionSwap\(\{[\s\S]*protectHistory:\s*hasLiveProtection/);
  assert.match(swap, /withAppendedQuestionSections\(/);
  assert.match(swap, /buildAssignmentV5PreflightModel\(/);
  const check = swap.indexOf('if (!model.isValid)');
  const apply = swap.indexOf('setQuestions(plan.questions)');
  assert.ok(check > 0 && apply > check, 'the candidate is validated before the editor shows it');
  assert.match(swap, /setAppendedSections\(/);
  // The save carries what a swap appended.
  assert.match(editorBase, /onSave\(\{[^}]*questions[^}]*liveRepairs[^}]*appendedSections[^}]*\}\)/);
  // A legacy extension with no vetted recipe is explained on the card, not hidden in a tooltip.
  assert.match(editorBase, /honorsAction\.explanation/);
});

test('14. the new editor controls stay usable on phones, iPads and Chromebooks', () => {
  const card = region(editorBase, '{honorsAction', '{repairIndex === index', 'Honors extension card controls');
  // A real touch target, wrapping instead of overflowing, readable without hover.
  const heights = [...card.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.ok(heights.length >= 1 && heights.every((height) => height >= 44), `touch targets ≥ 44px (${heights})`);
  assert.match(card, /flexWrap:\s*'wrap'/);
  assert.doesNotMatch(card, /onMouseEnter|onMouseOver|:hover/, 'nothing depends on hover');
  assert.doesNotMatch(card, /width:\s*\d{4,}|minWidth:\s*[4-9]\d\d/, 'no fixed width wider than a phone');
  // The dialog itself still fits the viewport.
  assert.match(editorBase, /width:\s*'min\(1080px, 97vw\)'/);
  assert.match(editorBase, /maxHeight:\s*'94vh'/);
});
