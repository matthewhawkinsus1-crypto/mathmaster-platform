/*
 * THE SYSTEMS WORKSPACE'S ISOLATION BOX READS WHAT IS TYPED ON ITS OWN FIRST.
 *
 * Once y is isolated (y = 7 - 2x) the student may write a simpler, equivalent
 * expression and substitute that instead ("Simplify first (optional)"), in a
 * 2×2 (AlgebraicSystemMode.jsx) and in a 3×3 reduction
 * (SubstitutionReductionMode.jsx). The check was expressionsEquivalent alone,
 * which reads the typed text only inside "(typed) - (isolated)": "7)-(2x" is
 * 7 - 2x there, and "y=7-2x" passed too. Either became the token the student
 * drags into the other equation: the first cannot be substituted, so the
 * substitution fell back to the isolated form while the token still showed
 * "7)-(2x"; the second substituted as an equation inside an equation.
 *
 * Step Algebra's rule (typedSide.js, 58e0e2d9) applies: read on its own first;
 * what cannot be read is told so in Simplify's words for one expression,
 * records nothing and spends no try (isolationSimplification.js). The sweep
 * below is a sample of the full one reported in the handoff: every honest
 * spelling keeps its verdict, and every verdict that changes is a spelling
 * that cannot be read on its own, whose token could not be substituted as an
 * expression. tests/browser/algebraicSubstitutionHandoff.mjs
 * (student-simplify-unreadable) and algebraicSystems3x3.mjs
 * (unreadable-rewrite) type them in Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ISOLATION_UNREADABLE_MESSAGE, judgeIsolationSimplification } from '../../src/tools/systemsWorkspace/isolationSimplification.js';
import { SIMPLIFY_MESSAGES } from '../../src/platform/algebra/simplify/simplifyEngine.js';
import { typedSideReadable } from '../../src/platform/algebra/typedSide.js';
import { expressionsEquivalent, latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import {
  isolatedExpressionFor,
  linearEquationForm,
  normalizeAlgebraicSystemConfig,
  presentableExpression,
  substituteIntoEquation,
  variableIsIsolated,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { checkTokenSimplification } from '../../functions/shared/toolMath/systemsWorkspace/substitutionReduction.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// The verdict the box gave before this change: equivalence alone.
const oldVerdict = (draft, isolated, variable) => {
  const typed = String(draft ?? '').trim();
  return Boolean(typed && isolated) && expressionsEquivalent(typed, isolated, variable);
};
const accepted = (draft, isolated, variable) => judgeIsolationSimplification(draft, isolated, variable).verdict === 'accepted';

test('a rewrite that can be read is judged as before; one that cannot be read is refused as unreadable', () => {
  const isolated = '7 - 2 x';
  for (const typed of ['7-2x', '-2x+7', '7 - 2 x', '(7-2x)', '+7-2x', '7-2\\cdot x', '\\frac{14-4x}{2}', '-(2x-7)', '\\left(7-2x\\right)', '7-\\frac42x']) {
    const judged = judgeIsolationSimplification(typed, isolated, 'y');
    assert.equal(judged.verdict, 'accepted', typed);
    assert.equal(judged.tokenExpression, latexToExpression(typed), `${typed}: the token is the typed expression, as before`);
    assert.equal(oldVerdict(typed, isolated, 'y'), true);
  }
  for (const typed of ['7+2x', '2x-7', '7-2X', '7']) {
    assert.deepEqual(judgeIsolationSimplification(typed, isolated, 'y'), { verdict: 'notEquivalent' }, typed);
  }
  for (const typed of ['7)-(2x', 'y=7-2x', 'y = 7 - 2x', '(7-2x', '7-2x)', '7-2x;', '7-2x,', '\\left(7-2x', '{7-2x}', '7-2x=']) {
    assert.deepEqual(judgeIsolationSimplification(typed, isolated, 'y'), { verdict: 'unreadable' }, typed);
  }
  // Nothing typed, or nothing isolated yet: as before, not taken (and no read is asked of it).
  assert.deepEqual(judgeIsolationSimplification('', isolated, 'y'), { verdict: 'notEquivalent' });
  assert.deepEqual(judgeIsolationSimplification('   ', isolated, 'y'), { verdict: 'notEquivalent' });
  assert.deepEqual(judgeIsolationSimplification('7-2x', null, 'y'), { verdict: 'notEquivalent' });
});

test('the old check took "7)-(2x" and "y=7-2x", and neither could be substituted as an expression', () => {
  const isolated = '7 - 2 x';
  assert.equal(oldVerdict('7)-(2x', isolated, 'y'), true, 'equivalent only inside "(typed) - (isolated)"');
  assert.equal(typedSideReadable('7)-(2x'), false);
  assert.throws(() => substituteIntoEquation('3x + y = 9', 'y', latexToExpression('7)-(2x')), 'its token cannot be substituted: the board fell back to the isolated form');
  assert.equal(oldVerdict('y=7-2x', isolated, 'y'), true);
  assert.equal(substituteIntoEquation('3x + y = 9', 'y', latexToExpression('y=7-2x')).split('=').length, 3, 'an equation inside an equation');
  // The 3×3 reduction's shared check is the same equivalence: it takes them too,
  // which is why its box reads first in the component.
  const state = { source: { equationId: 'E1', variable: 'x' }, isolation: { expression: '-y - z + 6', simplificationDraft: '6)-(y+z' } };
  const system = { variables: ['x', 'y', 'z'], equations: [{ id: 'E1', text: 'x + y + z = 6' }] };
  assert.equal(checkTokenSimplification(state, system).state.isolation.simplificationValid, true);
  assert.equal(judgeIsolationSimplification('6)-(y+z', '-y - z + 6', 'x').verdict, 'unreadable');
});

test('a rewrite that cannot be read is told so in the words Simplify uses for one expression', () => {
  assert.equal(ISOLATION_UNREADABLE_MESSAGE, SIMPLIFY_MESSAGES.unreadable);
  assert.equal(ISOLATION_UNREADABLE_MESSAGE, 'MathMaster could not read that yet. Enter one expression, without an equals sign.');
});

test('2×2: Check reads the rewrite first, and an unreadable one records nothing and costs no try', () => {
  const mode = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
  assert.doesNotMatch(mode, /expressionsEquivalent\(/, 'no equivalence of its own: the shared judge reads first');
  const check = region(mode, 'const checkAndUseIsolationSimplification = () => {', 'const changeSubstitutionTokenExpression', 'Check and use my simplification');
  const judged = check.indexOf('judgeIsolationSimplification(draft, isolatedExpr, selection.variable)');
  const firstWrite = check.indexOf('setIsolation(');
  assert.ok(judged >= 0 && firstWrite > judged, 'judged before anything is written');
  const refused = region(check, "if (judged.verdict === 'unreadable') {", '}', 'the unreadable branch');
  assert.match(refused, /setUnreadableIsolationDraft\(draft\);\s*return;/);
  assert.doesNotMatch(refused, /setIsolation|setSlotAttempt|onAction|submit/, 'nothing recorded, no try');
  // Kept in component state, never in the draft, and shown only while the box holds what was refused.
  assert.match(mode, /const \[unreadableIsolationDraft, setUnreadableIsolationDraft\] = useState\(null\);/);
  assert.match(mode, /unreadableIsolationDraft !== null && unreadableIsolationDraft === String\(isolation\.simplificationDraft \|\| ''\)\.trim\(\) \? \(\s*<p className="mathmaster-systems-substitution-feedback is-error" role="status" data-isolation-unreadable="true"[^>]*>\s*\{ISOLATION_UNREADABLE_MESSAGE\}/);
  // Enter in the box runs the same check.
  assert.match(mode, /onSubmit=\{checkAndUseIsolationSimplification\}/);
});

test('3×3: the reduction\'s Check reads the rewrite first, and leaves the reduction as it was', () => {
  const mode = executableSource(componentSource('src/tools/systemsWorkspace/SubstitutionReductionMode.jsx'));
  const check = region(mode, 'const checkTokenRewrite = () => {', '\n  };', 'the reduction\'s Check');
  assert.match(check, /if \(judgeIsolationSimplification\(reduction\.isolation\?\.simplificationDraft, isolated, sourceVariable\)\.verdict === 'unreadable'\) \{\s*apply\(\{ state: reduction, feedback: \{ stage: 'token', reason: 'unreadable' \} \}\);\s*return;\s*\}\s*apply\(checkTokenSimplification\(reduction, system\)\);/);
  assert.match(mode, /onClick=\{checkTokenRewrite\}[^>]*>Check and use my simplification</);
  // The same state is not stored again: apply writes only a changed one.
  const apply = region(mode, 'const apply = useCallback((transition) => {', 'setReductionFeedback(transition.feedback || null);', 'apply');
  assert.match(apply, /if \(transition\.state && transition\.state !== reduction\) \{\s*setStoredReduction\(transition\.state\);/);
  const words = region(mode, "case 'token:unreadable':", ';', 'the refusal');
  assert.match(words, /return ISOLATION_UNREADABLE_MESSAGE/);
});

/* ------------------------------------------------------------- the verdict sweep (a sample) */

// Systems a student isolates in: T2 L2 compiled as a teacher's import compiles it,
// the DOL 2 review's 3×3s, and two versions of each algebraic systems family.
// (The full sweep, every systems item in the repository, is in the handoff.)
const compiledSystems = (relative) => compileTeacherImport(readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'))
  .model.questions.filter((question) => question.type === 'systemsWorkspace' && question.mode === 'algebraic');
const familySystems = (id) => [0, 1].map((seat) => resolveFamilyQuestionInstance({
  question: { questionId: `isolation-${id}`, questionFamily: { id } },
  assignmentId: 'isolation-sample',
  storageIndex: 0,
  allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'provisional' },
})?.question).filter((question) => question?.type === 'systemsWorkspace');
const sampleSystems = () => [
  ...compiledSystems('teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json'),
  ...compiledSystems('teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json'),
  ...familySystems('systems.substitution'),
  ...familySystems('systems.algebraic2x2'),
].map((question) => normalizeAlgebraicSystemConfig(question));

const rational = (value) => {
  for (let d = 1; d <= 120; d += 1) {
    const n = Math.round(value * d);
    if (Math.abs(n / d - value) < 1e-9) return { n, d };
  }
  return null;
};
const plain = ({ n, d }) => (d === 1 ? `${n}` : `${n}/${d}`);
const latex = ({ n, d }) => (d === 1 ? `${n}` : `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`);
const sum = (parts) => parts.filter(Boolean).join('+').replace(/\+-/g, '-') || '0';

// Each variable isolated from each equation it is in, as v = constant + Σ k·u.
const isolationsOf = ({ equations, variables }) => equations.flatMap((text, index) => {
  const form = linearEquationForm(text, variables);
  if (!form) return [];
  return variables.filter((v) => Math.abs(form.coefficients[v] || 0) > 1e-9).map((v) => {
    const terms = variables.filter((u) => u !== v)
      .map((u) => ({ u, k: rational(-(form.coefficients[u] || 0) / form.coefficients[v]) }))
      .filter((term) => term.k && term.k.n !== 0);
    const constant = rational(form.constant / form.coefficients[v]);
    const isolated = variableIsIsolated(text, v)
      ? isolatedExpressionFor(text, v)
      : presentableExpression(sum([...terms.map((term) => `${plain(term.k)} * ${term.u}`), plain(constant)]));
    return { v, terms, constant, isolated, others: equations.filter((_, other) => other !== index) };
  });
});
const coefficientText = ({ n, d }, u, style) => {
  if (d === 1) return `${n === 1 ? '' : n === -1 ? '-' : n}${u}`;
  return style === 'latex' ? `${latex({ n, d })}${u}` : `(${n}/${d})${u}`;
};
// What a student types for the simpler form: plain, MathLive's LaTeX, terms in either order, dressed.
const honestSpellings = ({ terms, constant, isolated }) => {
  const forms = new Set([isolated]);
  for (const style of ['plain', 'latex']) {
    const termTexts = terms.map((term) => coefficientText(term.k, term.u, style));
    const constantText = constant.n === 0 ? '' : style === 'latex' ? latex(constant) : plain(constant);
    forms.add(sum([...termTexts, constantText]));
    forms.add(sum([constantText, ...termTexts]));
    forms.add(`(${sum([...termTexts, constantText])})`);
    forms.add(`\\left(${sum([constantText, ...termTexts])}\\right)`);
  }
  return [...forms];
};
// What a hurried or half-done entry looks like: readable only in context, a statement, unbalanced.
const hostileSpellings = ({ v, terms, constant, isolated }) => {
  const forms = [`(${isolated}`, `${isolated})`, `${v}=${isolated}`, `${isolated};`, `\\left(${isolated}`];
  if (terms.length) forms.push(`${plain(constant)})+(${sum(terms.map((term) => coefficientText(term.k, term.u, 'plain')))}`);
  return forms;
};
const substitutesAsExpression = (draft, v, others) => others.every((other) => {
  try {
    return substituteIntoEquation(other, v, latexToExpression(draft)).split('=').length === 2;
  } catch {
    return false;
  }
});

test('verdict sweep: every honest rewrite is taken as before, and only rewrites that cannot be read on their own change', () => {
  const tally = { systems: 0, threeByThree: 0, isolations: 0, honest: 0, honestChanged: 0, hostileTakenBefore: 0, hostileTakenNow: 0, changedUnreadable: 0, changedTokenBroken: 0 };
  for (const system of sampleSystems()) {
    tally.systems += 1;
    if (system.variables.length === 3) tally.threeByThree += 1;
    for (const isolation of isolationsOf(system)) {
      tally.isolations += 1;
      for (const typed of honestSpellings(isolation)) {
        tally.honest += 1;
        assert.equal(oldVerdict(typed, isolation.isolated, isolation.v), true, `${typed} for ${isolation.v} = ${isolation.isolated}`);
        if (accepted(typed, isolation.isolated, isolation.v) !== true) tally.honestChanged += 1;
      }
      for (const typed of hostileSpellings(isolation)) {
        const before = oldVerdict(typed, isolation.isolated, isolation.v);
        const now = accepted(typed, isolation.isolated, isolation.v);
        if (before) tally.hostileTakenBefore += 1;
        if (now) tally.hostileTakenNow += 1;
        if (before && !now) {
          if (!typedSideReadable(typed)) tally.changedUnreadable += 1;
          // An equation whose other equations lack v would not show it; the rest do.
          if (!substitutesAsExpression(typed, isolation.v, isolation.others) || /=/.test(typed)) tally.changedTokenBroken += 1;
        }
      }
    }
  }
  // Not vacuous: 2×2s and 3×3s worked, rewrites typed, hostile ones taken before.
  assert.ok(tally.systems >= 14 && tally.threeByThree >= 2 && tally.isolations >= 50 && tally.honest >= 300 && tally.hostileTakenBefore >= 80, JSON.stringify(tally));
  assert.equal(tally.honestChanged, 0, `an honest rewrite changed verdict: ${JSON.stringify(tally)}`);
  assert.equal(tally.hostileTakenNow, 0, 'a rewrite that reads only in context is still taken');
  assert.equal(tally.changedUnreadable, tally.hostileTakenBefore, 'every rewrite that changed verdict cannot be read on its own');
  assert.equal(tally.changedTokenBroken, tally.hostileTakenBefore, 'and none of them was a token that substitutes as an expression');
});
