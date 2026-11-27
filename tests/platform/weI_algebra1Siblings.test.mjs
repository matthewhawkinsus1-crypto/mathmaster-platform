/*
 * WE-I, THE ALGEBRA I BATCH: built-in worked siblings for the answer-box
 * Classwork of Algebra I (WORKED_EXAMPLES.md section 6; the build plan's WE-I
 * row). Two families work them: linearReasoning (new) and perpendicularLines
 * (its sibling is new). Every claim is tested over the real lesson files: one
 * walk of teacher-import-jsons/, every question as QuestionEngine receives it.
 *
 * What each sibling must be, and what this file holds:
 *   - safe by the platform's own guard (similarExampleIsSafe) for every real
 *     question it is offered on, over many seeds;
 *   - never an item on the same assignment: its prompt is not one of the
 *     assignment's problems, and no equation or inequality it states is written
 *     in any question of that assignment;
 *   - never the item's answer: no step, prompt or answer states a field's key
 *     or accepted answer, in any spelling a step could use;
 *   - never on a DOL, quiz or test: linearReasoning claims no question there,
 *     and the section rule shows no example there for any family;
 *   - worked, not just shown: several steps, and the steps say why;
 *   - Algebra I only: no "A2." question is claimed by the new family (another
 *     package owns those).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { asQuestionEngineReceivesIt, lessonFiles, measureClassworkExampleCoverage } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { familyFor } from '../../src/platform/supports/families/index.js';
import * as linearReasoning from '../../src/platform/supports/families/linearReasoning.js';
import * as perpendicularLines from '../../src/platform/supports/families/perpendicularLines.js';
import { answerSpellings, siblingGuardOf, statedEquations as statedMath } from '../../src/platform/supports/families/siblingGuard.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { assignmentProblemKeys, exampleSectionRule, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEEDS = Array.from({ length: 12 }, (_, index) => index * 7);
const ASSESSMENT_ROLES = new Set(['dol', 'quiz', 'test']);
const NEW_FAMILIES = new Set([linearReasoning, perpendicularLines]);

const text = (value) => String(value ?? '').trim();
const roleOf = (section) => text(section?.role || section?.activityRole).toLowerCase();

// The one walk: every question of every lesson, with its assignment beside it.
let walked = null;
const walk = () => {
  if (walked) return walked;
  walked = lessonFiles(repo).map((file) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, file), 'utf8')));
    const sections = compiled.package.sections.map((section) => ({
      role: roleOf(section),
      questions: section.questions.map((stored) => ({ stored, question: asQuestionEngineReceivesIt(stored) })),
    }));
    const all = sections.flatMap((section) => section.questions.map((entry) => entry.question));
    return { file, sections, all, problems: assignmentProblemKeys(all) };
  });
  return walked;
};

const claimedByNewFamily = (question) => NEW_FAMILIES.has(familyFor(question)) && Boolean(buildSimilarWorkedExample(question));

const REASON = /\bbecause\b|\bso\b|\bmeans\b|\bmust\b|\bto (?:get|undo|leave|collect|remove)\b|\bsince\b|\bwhich is\b|:/i;

test('every real question a new family works a sibling for: safe, never an assignment item, never its answer, and worked', () => {
  const kinds = new Map();
  let checked = 0;
  for (const lesson of walk()) {
    const assignmentMath = lesson.all.map((question) => statedMath([question.prompt, ...(question.answerFields || []).map((field) => field?.label)].join('\n')));
    for (const section of lesson.sections) {
      for (const { stored, question } of section.questions) {
        if (!claimedByNewFamily(question)) continue;
        const where = `${lesson.file}#${stored.questionId}`;
        const kind = familyFor(question) === linearReasoning ? linearReasoning.questionKind(question).kind : 'perpendicularLines';
        kinds.set(kind, (kinds.get(kind) || 0) + 1);
        const guard = siblingGuardOf(question);
        for (const seed of SEEDS) {
          const sibling = buildSimilarWorkedExample(question, { seed });
          if (!sibling) continue;
          checked += 1;
          // Safe by the platform's own guard.
          assert.ok(similarExampleIsSafe(question, sibling), `${where} seed ${seed}`);
          // Never the item's answer, in any spelling a step could write it.
          [sibling.prompt, ...sibling.steps, sibling.answer].forEach((piece) => {
            assert.equal(hintRevealsAnswer(piece, guard), false, `${where} seed ${seed}: ${piece}`);
          });
          // Never an item on the same assignment.
          const promptKey = text(sibling.prompt).toLowerCase().replace(/[\s$]+/g, '');
          assert.equal(lesson.all.some((other) => text(other.prompt).toLowerCase().replace(/[\s$]+/g, '') === promptKey), false, `${where}: the prompt is an assignment problem`);
          const example = workedExampleFor(question, { seed, assignmentProblems: lesson.problems, sectionRole: section.role });
          assert.ok(example && example.source === 'family', `${where} seed ${seed}: the player plays the family's sibling`);
          // Its equations may share a line with another item, never the whole problem.
          // "x = 6" alone is a value, not a problem.
          const own = new Set([...statedMath(sibling.prompt)].filter((key) => !/^[a-z]=-?[\d./]+$/.test(key)));
          if (own.size) {
            assert.equal(assignmentMath.some((stated) => [...own].every((key) => stated.has(key))), false, `${where} seed ${seed}: every equation of "${sibling.prompt}" is on the assignment`);
          }
          // Worked: several steps, and the steps say why.
          assert.ok(sibling.steps.length >= 3, `${where}: ${sibling.steps.length} steps`);
          const reasoned = sibling.steps.filter((step) => REASON.test(step)).length;
          assert.ok(reasoned >= Math.ceil(sibling.steps.length * 0.6), `${where} seed ${seed}: ${reasoned} of ${sibling.steps.length} steps say why`);
          assert.ok(sibling.steps.some((step) => /\bbecause\b|\bmeans\b|\bso\b/i.test(step)), `${where}: some step says why`);
        }
      }
    }
  }
  assert.ok(checked > 1000, `${checked} siblings checked`);
  // Every kind the batch claims is exercised by a real question.
  ['inequalityModel', 'inequalityReverse', 'solutionCount', 'verifySolution', 'systemWord', 'systemSubstitution', 'systemCases',
    'linearIntercepts', 'twoVariableContext', 'inequalityGraph', 'inequalitySystemPoints', 'inequalitySystemRegion', 'linearShift', 'perpendicularLines']
    .forEach((kind) => assert.ok(kinds.get(kind) > 0, `no real question of kind ${kind}`));
});

test('never on a DOL, quiz or test: the new family claims nothing there, and no family\'s example is shown there', () => {
  let assessed = 0;
  for (const lesson of walk()) {
    for (const section of lesson.sections) {
      if (!ASSESSMENT_ROLES.has(section.role)) continue;
      for (const { stored, question } of section.questions) {
        assessed += 1;
        assert.equal(linearReasoning.matches(question), false, `${lesson.file}#${stored.questionId}`);
        assert.equal(linearReasoning.similarProblem(question, { seed: 0 }), null, `${lesson.file}#${stored.questionId}`);
        const rule = exampleSectionRule({ sectionRole: section.role, activityRole: question.activityRole });
        assert.equal(rule.offered, false, `${lesson.file}#${stored.questionId}`);
        assert.equal(rule.opensByItself, false, `${lesson.file}#${stored.questionId}`);
      }
    }
  }
  assert.ok(assessed > 100, `${assessed} assessment questions`);
  // The family reads the question's own role too, so a DOL question asked on its own is still not claimed.
  const dolQuestion = walk().flatMap((lesson) => lesson.sections).find((section) => section.role === 'dol'
    && section.questions.some(({ question }) => linearReasoning.matches({ ...question, activityRole: 'classwork' })));
  assert.ok(dolQuestion, 'some DOL question is one the family would claim on Classwork');
});

test('Algebra I only: the new family claims no Algebra II question, and only multi-part answer boxes', () => {
  for (const lesson of walk()) {
    for (const section of lesson.sections) {
      for (const { stored, question } of section.questions) {
        if (!linearReasoning.matches(question)) continue;
        const where = `${lesson.file}#${stored.questionId}`;
        assert.match(text(question.standard), /^A\.\d/, where);
        assert.equal(question.type, 'multiAnswer', where);
        assert.equal(question.studentActions[0], 'multipleResponses', where);
        // A field that names a property of equality is answered by that name: never claimed.
        assert.ok(!(question.answerFields || []).some((field) => /\bpropert(y|ies)\b/i.test(text(field.answer))), where);
      }
    }
  }
});

test('while the item is open the new family adds only its sibling: no hint, back-up step or answer spelling', () => {
  for (const lesson of walk()) {
    for (const section of lesson.sections) {
      for (const { question } of section.questions) {
        if (familyFor(question) !== linearReasoning) continue;
        assert.deepEqual(linearReasoning.hints(question), []);
        assert.deepEqual(linearReasoning.expectedValues(question), []);
        assert.equal(linearReasoning.backUpQuestion(question), null);
        assert.equal(linearReasoning.workedSolution, undefined);
      }
    }
  }
});

test('the guard reads an answer as a step would write it', () => {
  const spelled = answerSpellings('b<=420');
  assert.ok(spelled.includes('b ≤ 420'));
  assert.ok(answerSpellings('y >= -3/2x - 5').includes('y ≥ −(3/2)x − 5') || answerSpellings('y >= -3/2x - 5').some((value) => value.includes('(3/2)x')));
  assert.ok(answerSpellings('(420,1600)').includes('(420, 1600)'));
  assert.ok(answerSpellings('2x + 3y >= 20').includes('2x + 3y ≥ 20'));
  // So a sibling that writes the item's key with spaces and symbols is refused.
  const question = { type: 'multiAnswer', studentActions: ['multipleResponses'], prompt: 'p', answerFields: [{ label: 'ineq', answer: 'b<=420' }] };
  assert.equal(hintRevealsAnswer('so b ≤ 420.', siblingGuardOf(question)), true);
});

test('coverage of the Algebra I answer boxes, from the report: before WE-I 140 uncovered, now 14', () => {
  // The uncovered multipleResponses Classwork questions on an Algebra I ("A.")
  // standard. Before this batch the report counted 140 (A.5B 18, A.2I 18,
  // A.5A 16, A.2H 14, A.3H 14, A.5C 11, A.3D 10, A.2F 8, A.3E 4, A.2G 4, A.3F 4,
  // A.3C 3, A.3B 2, A.2C 2, A.2A 2, A.3G 2, A.12C 1).
  const uncovered = {};
  measureClassworkExampleCoverage({ root: repo }).lessons.flatMap((lesson) => lesson.questions)
    .filter((entry) => entry.status === 'uncovered' && entry.kind === 'multipleResponses' && /^A\.\d/.test(entry.standard || ''))
    .forEach((entry) => { uncovered[entry.standard] = (uncovered[entry.standard] || 0) + 1; });
  const total = Object.values(uncovered).reduce((sum, count) => sum + count, 0);
  // Left: A.5A 7 (the properties of equality, whose names are the answers, and
  // the rules for counting solutions), A.2I 2, A.5C 2, A.2G 2 (the facts about
  // horizontal and vertical lines are the answers), A.12C 1 (a sequence).
  assert.deepEqual(uncovered, { 'A.12C': 1, 'A.2G': 2, 'A.5A': 7, 'A.2I': 2, 'A.5C': 2 });
  assert.equal(total, 14);
});
