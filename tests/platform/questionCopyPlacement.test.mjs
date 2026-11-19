/*
 * A DUPLICATED QUESTION IS SHOWN WHERE SAVE STORES IT; ON A LIVE ASSIGNMENT NOTHING STORED MOVES.
 *
 * The Question Editor numbers its cards by their place in its list. Pre-Flight
 * and Save build the assignment again from each question's section
 * (rebuildV5SectionsFromQuestions), and every student's grade tracker keeps
 * its records by stored index. Duplicate on a live assignment put the copy at
 * the end of the editor's list ("Duplicated questions are appended after
 * student activity begins so existing indexes remain unchanged",
 * LESSON_SCENARIO_ASSIGNMENT_EDITOR_ARCHITECTURE.md), but the copy kept its
 * source's section, so Pre-Flight and Save put it inside that section. A copy
 * of Question 2 of Algebra I M3 T2 L2: the region "Pre-Flight for Question 21"
 * read "Question 22 says "Use the prices you found"…" (80 of the 86 findings
 * that name a question named another number than their card), and Save stored
 * the copy as Question 4, moving 39 of the 42 stored questions one index on,
 * away from the records students had made on them.
 *
 * Now the copy goes where Save stores it (questionCopyPlacement.js): right
 * after its source with no student history, and once students have records,
 * after every stored question, in a section of its own role appended after
 * every section, as an Honors swap's replacement is. The real editor is
 * mounted here (its hooks kept from render to render,
 * helpers/rerenderingHookShim.mjs), Duplicate and Save are pressed, and what
 * Save hands the Teacher Workspace is stored the way saveQuestionEditor
 * stores it.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { RERENDERING_SHIM, findElement, startRerenderingLoader } from './helpers/rerenderingComponent.mjs';
import { NOTED_QUESTION_ID, editorPreflightAssignment } from './helpers/editorPreflightFixtures.mjs';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions, storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { editorPreflightFindings } from '../../src/platform/preflight/questionPreflightFindings.js';
import { withAppendedQuestionSections } from '../../src/platform/rigor/honorsExtensionSwap.js';
import { projectCurrentAssignmentContent } from '../../src/platform/assignments/currentContentProjection.js';
import { normalizeAssignmentQuestions } from '../../src/app/student/assignmentRuntimeHelpers.js';

let loader = null;
let Editor = null;
let mount = null;
before(async () => {
  loader = await startRerenderingLoader();
  Editor = (await loader.ssrLoadModule('/src/AssignmentQuestionEditorBase.jsx')).default;
  ({ mount } = await loader.ssrLoadModule(RERENDERING_SHIM));
});
after(async () => { await loader?.close(); });

const STORED = editorPreflightAssignment();
const STORED_IDS = getStoredAssignmentQuestions(STORED).map((question) => question.questionId);
const idsOf = (questions) => questions.map((question) => question.questionId);

const cardsOf = (view) => {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props?.['data-question-card']) found.push(node);
    walk(node.props?.children);
  };
  walk(view.output);
  return found;
};

/** The real editor: Duplicate pressed on each card numbered in `numbers`, in turn, then Save. What Save hands over. */
const duplicateThenSave = async ({ live, numbers }) => {
  const saves = [];
  const view = mount(Editor, {
    assignment: STORED,
    hasLiveProtection: live,
    onSave: async (payload) => { saves.push(payload); },
    onClose: () => {},
    rosterSizesByClassId: { 'period-3': 28 },
  });
  try {
    for (const number of numbers) {
      const card = cardsOf(view).find((node) => node.props['data-question-card'] === number);
      findElement(card, (element) => element.type === 'button' && element.props.children === 'Duplicate').props.onClick();
    }
    assert.equal(cardsOf(view).length, STORED_IDS.length + numbers.length, 'a card for each copy');
    await findElement(view.output, (element) => element.type === 'button' && element.props.children === 'Save Assignment Questions').props.onClick();
  } finally {
    view.unmount();
  }
  assert.equal(saves.length, 1, 'Save handed the edit over');
  return saves[0];
};

// What saveQuestionEditor (TeacherWorkspace.jsx) stores for it.
const storeAsTheWorkspaceDoes = ({ questions, appendedSections }) => {
  const candidate = storedAssignmentToV5(withAppendedQuestionSections(STORED, appendedSections), {
    titleOverride: STORED.title,
    questions: normalizeAssignmentQuestions(questions),
  });
  const model = buildAssignmentV5PreflightModel(candidate);
  assert.deepEqual(model.errors, []);
  return { ...STORED, ...canonicalV5PersistencePatch(model.assignmentV5) };
};

// Each Pre-Flight finding that names a question, against the card it is drawn on.
const findingsOffTheirCard = ({ questions, appendedSections }) => {
  const found = editorPreflightFindings({ source: withAppendedQuestionSections(STORED, appendedSections), questions, classSize: 28 });
  const numberOf = new Map(questions.map((question, index) => [question.questionId, index + 1]));
  let named = 0;
  const off = [];
  for (const [id, entry] of found.byQuestionId) {
    for (const text of [...entry.warnings, ...entry.notes]) {
      const number = text.match(/^Question (\d+)\b/);
      if (!number) continue;
      named += 1;
      if (Number(number[1]) !== numberOf.get(id)) off.push(`card ${numberOf.get(id)}: ${text.slice(0, 60)}`);
    }
  }
  return { named, off, found, numberOf };
};

test('live: a copy of Question 2 is shown, numbered and stored after every stored question, and no stored question moves', async () => {
  const saved = await duplicateThenSave({ live: true, numbers: [2] });
  const copy = saved.questions.at(-1);
  assert.equal(idsOf(saved.questions).slice(0, STORED_IDS.length).join(), STORED_IDS.join(), 'the editor shows the copy last');

  // Save stores the questions in the order the editor numbers them, and every stored index keeps its question.
  const stored = getStoredAssignmentQuestions(storeAsTheWorkspaceDoes(saved));
  const moved = STORED_IDS.filter((id, index) => stored[index].questionId !== id);
  assert.deepEqual(moved, [], `${moved.length} of ${STORED_IDS.length} stored questions moved to another index`);
  assert.deepEqual(idsOf(stored), idsOf(saved.questions));
  assert.equal(copy.activityRole, 'warmup');
  assert.equal(saved.appendedSections.length, 1, 'a Warm-Up section of its own, after the DOL');
  assert.equal(saved.appendedSections[0].role, 'warmup');

  // Pre-Flight's findings on each card name that card's number.
  const { named, off, found, numberOf } = findingsOffTheirCard(saved);
  assert.ok(named > 80, `findings that name a question (${named})`);
  assert.deepEqual(off, []);
  assert.match(found.byQuestionId.get(NOTED_QUESTION_ID).notes[0], new RegExp(`^Question ${numberOf.get(NOTED_QUESTION_ID)} says "Use the prices you found"`));

  // Students are given the copy with the Warm-Up, after its stored questions.
  const projection = projectCurrentAssignmentContent(storeAsTheWorkspaceDoes(saved));
  assert.deepEqual(projection.diagnostics, []);
  const warmup = projection.logicalSections.find((section) => section.role === 'warmup');
  assert.equal(warmup.entries.at(-1).questionId, copy.questionId);
  assert.equal(warmup.entries.length, 4);
});

test('live: copies of another role each go after everything stored, and a copy of the last section\'s role joins it', async () => {
  // Question 2 (Warm-Up), then 41 and 42 (DOL): the first DOL copy follows the
  // Warm-Up copy's section in a section of its own, and the second joins it.
  const saved = await duplicateThenSave({ live: true, numbers: [2, 41, 42] });
  assert.deepEqual(saved.appendedSections.map((section) => section.role), ['warmup', 'dol']);
  assert.deepEqual(saved.questions.slice(-3).map((question) => question.activityRole), ['warmup', 'dol', 'dol']);
  const stored = getStoredAssignmentQuestions(storeAsTheWorkspaceDoes(saved));
  assert.deepEqual(idsOf(stored), idsOf(saved.questions));
  assert.deepEqual(idsOf(stored).slice(0, STORED_IDS.length), STORED_IDS);
  assert.deepEqual(findingsOffTheirCard(saved).off, []);
});

test('with no student history a copy goes right after its source, where Save stores it', async () => {
  const saved = await duplicateThenSave({ live: false, numbers: [2] });
  assert.deepEqual(saved.appendedSections, []);
  assert.equal(saved.questions[2].activityRole, 'warmup');
  assert.notEqual(saved.questions[2].questionId, STORED_IDS[1]);
  assert.deepEqual(idsOf(saved.questions).filter((_, index) => index !== 2), STORED_IDS);
  const stored = getStoredAssignmentQuestions(storeAsTheWorkspaceDoes(saved));
  assert.deepEqual(idsOf(stored), idsOf(saved.questions));
  assert.deepEqual(findingsOffTheirCard(saved).off, []);
});
