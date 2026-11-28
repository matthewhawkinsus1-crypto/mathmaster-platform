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
 *   - in Spanish too: every sentence is one the Spanish pack knows
 *     (esSupport.js, linearReasoningSiblings), so Translate gives all of it;
 *   - asked and answered alike: the answer line has one labelled part for each
 *     thing the sibling's prompt asks (the family says which, `asks`), so the
 *     boxes "Practise one like this" builds from it check the whole task;
 *   - right in every step: each value a step states agrees with the next step
 *     and with the answer (arithmetic, a sign change, a reversed symbol);
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
import { answerSpellings, siblingGuardOf, siblingIsSafe, statedEquations as statedMath } from '../../src/platform/supports/families/siblingGuard.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { assignmentProblemKeys, exampleSectionRule, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { buildPracticeLikeThis, checkPracticePart, readPracticeAnswer } from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';

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

test('every real question a new family works a sibling for: safe, never an assignment item, never its answer, worked, and in Spanish', async () => {
  const spanish = await loadLanguagePack('es');
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
          // "x = 6" alone is a value, not a problem ("y = −2" is a line, and the family never shares one with its item).
          const own = new Set([...statedMath(sibling.prompt)].filter((key) => !/^[a-z]=-?[\d./]+$/.test(key)));
          if (own.size) {
            assert.equal(assignmentMath.some((stated) => [...own].every((key) => stated.has(key))), false, `${where} seed ${seed}: every equation of "${sibling.prompt}" is on the assignment`);
          }
          // Worked: several steps, and the steps say why.
          assert.ok(sibling.steps.length >= 3, `${where}: ${sibling.steps.length} steps`);
          const reasoned = sibling.steps.filter((step) => REASON.test(step)).length;
          assert.ok(reasoned >= Math.ceil(sibling.steps.length * 0.6), `${where} seed ${seed}: ${reasoned} of ${sibling.steps.length} steps say why`);
          assert.ok(sibling.steps.some((step) => /\bbecause\b|\bmeans\b|\bso\b/i.test(step)), `${where}: some step says why`);
          // In Spanish, every sentence (as the readAloudAndTranslate test reads a sibling).
          const translated = translateWithPack([sibling.prompt, ...sibling.steps, `Answer: ${sibling.answer}`].join(' '), spanish);
          assert.equal(translated.coverage, TRANSLATION_COVERAGE.FULL, `${where} seed ${seed}: ${translated.sentences.filter((part) => !part.translated && !part.mathOnly).map((part) => part.source).join(' | ')}`);
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

test('a sibling never states an equation its item states: a line such as y = −2 counts, a bare value such as k = 0 does not', () => {
  const question = { type: 'multiAnswer', prompt: 'Use the line y = −2.', answerFields: [{ label: 'If k = 0, the line perpendicular to y = −2 through (5, 6)', answer: 'x=5' }] };
  const example = (prompt) => ({ prompt, steps: ['A first step, because.', 'A second step, so.'], answer: 'x = 3' });
  assert.equal(siblingIsSafe(question, siblingGuardOf(question), example('Write the line perpendicular to y = −2 through (3, 1).')), false);
  assert.equal(siblingIsSafe(question, siblingGuardOf(question), example('Write the line perpendicular to y = 7 through (3, 1).')), true);
  assert.equal(siblingIsSafe(question, siblingGuardOf(question), example('Solve it when k = 0, then write the line perpendicular to y = 7 through (3, 1).')), true);
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

/* ------------------------------------------------------------------------
 * The two classes of defect the first review found (#623): a practice whose
 * boxes check less than its prompt asks, and a step whose stated value does
 * not follow from the one before it. Each is held for every sibling of every
 * real item the two families claim, seeds 0 to 20.
 * --------------------------------------------------------------------- */

const SIBLING_SEEDS = Array.from({ length: 21 }, (_, index) => index);
const claimedItems = () => walk().flatMap((lesson) => lesson.sections.flatMap((section) => section.questions
  .filter(({ question }) => NEW_FAMILIES.has(familyFor(question)))
  .map(({ stored, question }) => ({ where: `${lesson.file}#${stored.questionId}`, question, family: familyFor(question) }))));

test('every sibling answers each part its prompt asks, and "Practise one like this" boxes exactly those parts', () => {
  let checked = 0;
  let practices = 0;
  for (const { where, question, family } of claimedItems()) {
    const asksByPrompt = new Map();
    for (const seed of SIBLING_SEEDS) {
      const sibling = family.similarProblem(question, { seed });
      if (!sibling) continue;
      checked += 1;
      assert.ok(Array.isArray(sibling.asks) && sibling.asks.length > 0, `${where} seed ${seed}: the family says what the prompt asks`);
      asksByPrompt.set(sibling.prompt, sibling.asks);
      const { parts } = readPracticeAnswer(sibling.answer);
      assert.equal(parts.length, sibling.asks.length, `${where} seed ${seed}: "${sibling.answer}" has ${parts.length} parts for ${sibling.asks.join(', ')}`);
      assert.ok(parts.some((part) => part.checkable), `${where} seed ${seed}: some part can be checked`);
      parts.forEach((part) => {
        // A label must not swallow the value ("Up | 2: 3x + 5").
        assert.doesNotMatch(String(part.expected), /^[-−]?\d+(?:\/\d+)?:\s/, `${where} seed ${seed}: ${part.label} | ${part.expected}`);
        assert.notEqual(checkPracticePart(part, part.expected), 'incorrect', `${where} seed ${seed}: its own answer`);
      });
    }
    // The practice the student is given is one of these siblings, boxed the same way.
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    if (!practice || practice.source !== 'family') continue;
    let asks = asksByPrompt.get(practice.prompt);
    for (let offset = 1; !asks && offset <= 12; offset += 1) {
      for (let attempt = 0; !asks && attempt < 6; attempt += 1) {
        const sibling = family.similarProblem(question, { seed: 97 * offset + attempt, keepCase: true });
        if (sibling?.prompt === practice.prompt) asks = sibling.asks;
      }
    }
    assert.ok(asks, `${where}: the practice is the family's sibling`);
    assert.equal(practice.parts.length, asks.length, `${where}: the practice boxes ${practice.parts.length} parts for ${asks.join(', ')}`);
    practices += 1;
  }
  assert.ok(checked > 2000, `${checked} siblings`);
  assert.ok(practices > 100, `${practices} practices`);
});

// Pure arithmetic, as a step writes it: "4(89) + 25", "−3/4", "15(8) + 9(3)".
const ARITHMETIC = /^[-−\d.()+×·/\s]+$/;
const evaluate = (expression) => {
  const source = expression.replace(/[−]/g, '-').replace(/[×·]/g, '*').replace(/(\d|\))\s*\(/g, '$1*(').replace(/\)\s*(\d)/g, ')*$1');
  if (!/\d/.test(source) || !/^[-\d.()+*/\s]+$/.test(source)) return null;
  try {
    const value = Function(`"use strict"; return (${source});`)();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};
const valueOf = (written) => evaluate(String(written).trim().replace(/[.,]$/, ''));
const FLIPPED = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
const claimCount = { arithmetic: 0, flips: 0, symbols: 0 };

/** Every claim a step makes that can be checked by itself; returns the ones that are false. */
const falseClaims = (sibling) => {
  const wrong = [];
  sibling.steps.forEach((step) => {
    // "a = b = c": consecutive pieces that are pure arithmetic must agree.
    // A run of arithmetic counts only when no variable is attached to it:
    // "x + 11 = 17" and "3x + 55 = 73" state nothing to check here.
    step.split(/[:;]|,\s(?![\d−-])|\.\s|\bso\b|\band\b|\bthen\b|\bbut\b|\bwhich\b/).forEach((clause) => {
      const pieces = clause.split('=');
      for (let index = 0; index + 1 < pieces.length; index += 1) {
        const leftPiece = pieces[index];
        const left = leftPiece.match(/[-−\d.()+×·/\s]*$/)[0].trim();
        const before = leftPiece.slice(0, leftPiece.length - leftPiece.match(/[-−\d.()+×·/\s]*$/)[0].length);
        const rightPiece = pieces[index + 1];
        const right = rightPiece.match(/^[-−\d.()+×·/\s]*/)[0].trim().replace(/[\s+×·/−-]+$/, '');
        const after = rightPiece.slice(rightPiece.match(/^[-−\d.()+×·/\s]*/)[0].length);
        if (!/^[-−]?[\d(]/.test(left) || !/^[-−]?[\d(]/.test(right)) continue;
        if (/(?:^|[^A-Za-z])[A-Za-z]$|[A-Za-z0-9)]$/.test(before) || /^[A-Za-z(]/.test(after)) continue;
        if (pieces[index].trim() !== left && /[+−\-×·/]\s*$/.test(before.trimEnd())) continue;
        const a = valueOf(left);
        const b = valueOf(right);
        if (a === null || b === null) continue;
        claimCount.arithmetic += 1;
        if (Math.abs(a - b) > 1e-6) wrong.push(`${left} = ${right}`);
      }
    });
    // "flip A to get B, then change its sign …: C": B is 1/A, and C is −B.
    const flip = /flip (\S+) to get (\S+), then change its sign[^:]*: (\S+?)\.?$/.exec(step);
    if (flip) {
      claimCount.flips += 1;
      const [a, b, c] = flip.slice(1).map(valueOf);
      if (a === null || b === null || c === null || Math.abs(a * b - 1) > 1e-9 || Math.abs(c + b) > 1e-9) wrong.push(flip[0]);
      if (!new RegExp(`perpendicular slope ${flip[3].replace(/[()]/g, '\\$&')}(;|$)`).test(sibling.answer)) wrong.push(`answer does not give ${flip[3]}`);
    }
    // "so < turns into >", "so ≥ becomes ≤", "reverses ≤ to ≥": the symbol is the reversed one.
    for (const match of step.matchAll(/([<>≤≥]) (?:turns into|becomes|to) ([<>≤≥])/g)) {
      claimCount.symbols += 1;
      if (FLIPPED[match[1]] !== match[2]) wrong.push(match[0]);
    }
  });
  return wrong;
};

test('every value a sibling step states agrees with the next step and with the answer', () => {
  let checked = 0;
  for (const { where, question, family } of claimedItems()) {
    for (const seed of SIBLING_SEEDS) {
      const sibling = family.similarProblem(question, { seed });
      if (!sibling) continue;
      checked += 1;
      assert.deepEqual(falseClaims(sibling), [], `${where} seed ${seed}\n${[sibling.prompt, ...sibling.steps, sibling.answer].join('\n')}`);
    }
  }
  assert.ok(checked > 2000, `${checked} siblings`);
  // The checker checked something: thousands of sums, every perpendicular flip, every reversed symbol.
  assert.ok(claimCount.arithmetic > 5000 && claimCount.flips > 100 && claimCount.symbols > 100, JSON.stringify(claimCount));
});

test('the step checker can fail: a sign change that keeps the sign, a sum that is off, a symbol not reversed', () => {
  const sibling = (steps, answer = 'slope 3; perpendicular slope −1/3') => ({ prompt: 'p', steps, answer });
  assert.deepEqual(falseClaims(sibling(['Flip it: flip 3 to get 1/3, then change its sign, because a quarter turn reverses one: −1/3.'])), []);
  assert.equal(falseClaims(sibling(['Flip it: flip −3 to get 1/3, then change its sign, because a quarter turn reverses one: 1/3.'], 'slope −3; perpendicular slope 1/3')).length, 1);
  assert.equal(falseClaims(sibling(['Check: 4(89) + 25 = 382, which is at least 379.'])).length, 1);
  assert.deepEqual(falseClaims(sibling(['Check: 4(89) + 25 = 381, which is at least 379.'])), []);
  assert.equal(falseClaims(sibling(['Divide by −2. So < turns into <: x < 3.'])).length, 1);
});
