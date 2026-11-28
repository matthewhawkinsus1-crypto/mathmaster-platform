/*
 * THE EXAMPLES SAFETY AUDIT: every built-in worked example, held to the
 * stricter sibling guard (src/platform/supports/families/siblingGuard.js).
 *
 * The player (examplePlayer.js workedExampleFor) shows a family's sibling,
 * or a replay of one on the student's tool (Step Algebra, the radical solver,
 * the plane, the inequality workspace). The platform's own check is
 * similarExampleIsSafe. siblingIsSafe is stricter: it also reads the item's
 * answers as a step would write them (≤ for <=, − for -, spacing, (1/2)x), and
 * it refuses a sibling whose prompt states one of the item's own equations.
 *
 * The audit (WE-I follow-up, seeds 0 to 20, 13,734 examples) found the
 * stricter guard refusing three kinds of example the platform let through:
 *   - real: a systems sibling worked with one of the item's own lines
 *     (m3t2l2-pr-13's y = −x + 6, tg-u9-q2's y = x − 2), and an
 *     inverseComposition sibling of (f · g)(x) with the item's own
 *     g(x) = x − 4. Both families now refuse such a sibling and draw another;
 *   - false alarms in the guard's own reading of equations: a recursive
 *     rule's "for n ≥ 2" (a condition on an index letter, not a problem), a
 *     LaTeX \frac read in fragments, and |x + 1| cut at its bar. The reader
 *     was fixed; the examples were right.
 * No example stated an item's answer in any spelling.
 *
 * Every real lesson item, on every help-giving section, as QuestionEngine
 * receives it. Seeds 0 to 6 here (the audit ran 0 to 20).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { asQuestionEngineReceivesIt, lessonFiles } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { sharesItemEquation, siblingGuardOf, siblingIsSafe, statedEquations } from '../../src/platform/supports/families/siblingGuard.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { assignmentProblemKeys, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEEDS = [0, 1, 2, 3, 4, 5, 6];
const ASSESSMENT = new Set(['dol', 'quiz', 'test']);

const flat = (example) => ({
  prompt: String(example.prompt || ''),
  steps: (example.steps || []).map((step) => [step.show, step.why].filter(Boolean).join(' ')).filter(Boolean),
  answer: String(example.answer || ''),
});

const reasons = (question, example) => {
  const guard = siblingGuardOf(question);
  const out = [];
  if (sharesItemEquation(question, example.prompt)) out.push('the prompt states one of the item\'s own equations');
  [example.prompt, ...example.steps, example.answer].forEach((piece) => guard.forEach((value) => {
    if (hintRevealsAnswer(piece, [value])) out.push(`"${value}" in: ${piece}`);
  }));
  return out;
};

test('every built-in worked example on the real lessons passes the stricter sibling guard as well as the platform\'s', () => {
  const bySource = {};
  const refused = [];
  for (const file of lessonFiles(repo)) {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, file), 'utf8')));
    const all = compiled.package.sections.flatMap((section) => section.questions.map((question) => asQuestionEngineReceivesIt(question)));
    const problems = assignmentProblemKeys(all);
    compiled.package.sections.forEach((section) => {
      const role = String(section.role || section.activityRole || '').toLowerCase();
      if (ASSESSMENT.has(role)) return;
      section.questions.forEach((stored) => {
        const question = asQuestionEngineReceivesIt(stored);
        SEEDS.forEach((seed) => {
          const shown = workedExampleFor(question, { seed, assignmentProblems: problems, sectionRole: role });
          if (!shown || shown.source !== 'family') return;
          const example = flat(shown);
          const source = `${familyFor(question)?.family || 'replay'}/${shown.format}`;
          bySource[source] = (bySource[source] || 0) + 1;
          assert.ok(example.answer, `${file}#${stored.questionId} seed ${seed}: an answer line to check`);
          assert.ok(similarExampleIsSafe(question, example), `${file}#${stored.questionId} seed ${seed}: the platform guard`);
          if (!siblingIsSafe(question, siblingGuardOf(question), example)) {
            refused.push(`${file}#${stored.questionId} seed ${seed} (${source}): ${reasons(question, example).join('; ') || 'too few steps'}`);
          }
        });
      });
    });
  }
  assert.deepEqual(refused, []);
  // The audit reaches every kind of example: siblings of every family, and the replays.
  const total = Object.values(bySource).reduce((sum, count) => sum + count, 0);
  assert.ok(total > 4000, `${total} examples`);
  ['systems/replay', 'linearEquations/replay', 'linesAndSlope/replay', 'replay/replay', 'inverseComposition/steps', 'systems/steps', 'functionFeatures/steps']
    .forEach((source) => assert.ok(bySource[source] > 0, `${source}: ${JSON.stringify(bySource)}`));
});

test('the guard reads equations as a student does: LaTeX, absolute value bars, and a condition on an index letter', () => {
  // A \frac is one number, not fragments.
  assert.ok(statedEquations('Solve $\\frac{1}{2}\\left(x + 9\\right) - \\frac{4}{3}x = -\\frac{3}{4}x + 4$ for $x$.').has('1/2x+9-4/3x=-3/4x+4'));
  // |x + 1| is part of the rule.
  assert.ok(statedEquations('Use the graph of f(x) = -2|x + 1| + 4 for -5 ≤ x ≤ 2.').has('fx=-2|x+1|+4'));
  // "for n ≥ 2" is a condition, so two different sequences do not share a problem.
  const sequence = { prompt: 'A sequence is given by f(1) = 3 and f(n) = f(n − 1) + 5 for n ≥ 2.' };
  assert.equal(sharesItemEquation(sequence, 'A sequence has a₁ = 12 and aₙ = aₙ₋₁ - 3 for n ≥ 2.'), false);
  // One of the item's own lines is shared, and refused.
  const system = { prompt: 'The lines y = 2x + 1 and y = −x + 6 cross between grid lines.' };
  assert.equal(sharesItemEquation(system, 'Solve the system: $y = -4x + 18$ and $y = -x + 6$.'), true);
  assert.equal(sharesItemEquation(system, 'Solve the system: $y = -4x + 18$ and $y = -x + 7$.'), false);
});
