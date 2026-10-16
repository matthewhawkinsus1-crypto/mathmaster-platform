// ONE SIMPLIFY, EVERYWHERE (student push Q): the contracts around the engine.
//
//  - No tool renders its own simplify or combine control: the static scan.
//  - A draft saved with an old tool open still opens (simplifyState.js,
//    algebraDraftState.js), committed work untouched.
//  - The parts toolbar's keys.
//  - Never make a student multiply by 1: the display of a substituted group,
//    Distribute's refusal of a unit factor, and (a)(1) applied at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  migrateLegacySimplifyDraft,
  openSimplify,
  partsToolbarKeyAction,
  sanitizeSimplifyState,
} from '../../src/platform/algebra/simplify/simplifyState.js';
import { ALGEBRA_DRAFT_VERSION, rehydrateAlgebraDraft } from '../../src/algebraDraftState.js';
import { equationKey } from '../../src/algebraStructureToolState.js';
import { expressionToLatex, splitAdditiveTerms } from '../../src/algebraAstEngine.js';
import {
  armFactor,
  commitDistribution,
  detectDistributableGroup,
  initDistributionState,
  placeOnTerm,
} from '../../src/algebraDistributionModel.js';
import { commitSimplifyPart, detectSimplifyParts } from '../../src/platform/algebra/simplify/simplifyEngine.js';
import { STRUCTURE_TOOL_KINDS } from '../../src/algebraStructureTools.js';
import { REWRITE_MENU_KINDS, rewriteMenuOptions } from '../../src/platform/algebra/simplify/rewriteMenu.js';

const root = new URL('../../', import.meta.url).pathname;
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const walk = (directory) => readdirSync(directory).flatMap((entry) => {
  const full = path.join(directory, entry);
  if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
  return /\.(jsx?|mjs)$/.test(entry) ? [full] : [];
});
const SHARED = path.join(root, 'src/platform/algebra/simplify') + path.sep;

test('no tool renders its own Simplify or Combine like terms control outside the shared component', () => {
  const offenders = [];
  for (const file of walk(path.join(root, 'src'))) {
    if (file.startsWith(SHARED)) continue;
    const source = executableSource(readFileSync(file, 'utf8'));
    const relative = path.relative(root, file);
    // A control's visible label (JSX text) or its programmatic label.
    if (/>\s*(Rewrite \/ Simplify|Simplify arithmetic|Combine like terms)\s*</.test(source)) offenders.push(`${relative}: renders an old control label`);
    if (/['"`](Rewrite \/ Simplify|Simplify arithmetic)['"`]/.test(source)) offenders.push(`${relative}: names an old control`);
    if (/title=["{]['"`]?Combine like terms/.test(source)) offenders.push(`${relative}: a panel titled Combine like terms`);
    // The old models' UI entry points: only the shared engine may combine or multiply out.
    if (/from ['"][./]*algebraArithmeticModel(\.js)?['"]/.test(source)) offenders.push(`${relative}: imports the old arithmetic model`);
    if (file.endsWith('.jsx') && /\b(replaceSelectedLikeTerms|selectedLikeTermInfo|replacementIsSingleLikeTerm|replaceSingleAdditiveTerm|commitRelationLikeTerms)\b/.test(source)) {
      offenders.push(`${relative}: combines like terms itself`);
    }
  }
  assert.deepEqual(offenders, []);
  // The two workspaces render the shared panel.
  for (const file of ['src/StepByStepAlgebraCore.jsx', 'src/MultiRelationAlgebraCore.jsx']) {
    const source = executableSource(read(file));
    assert.match(source, /import SimplifyPanel from '\.\/platform\/algebra\/simplify\/SimplifyPanel\.jsx';/, file);
    assert.match(source, /<SimplifyPanel\b/, file);
  }
});

test('the scan can fail: an old label or import in any src file is caught', () => {
  const scan = (source) => />\s*(Rewrite \/ Simplify|Simplify arithmetic|Combine like terms)\s*</.test(source)
    || /from ['"][./]*algebraArithmeticModel(\.js)?['"]/.test(source);
  assert.equal(scan('<button>Combine like terms</button>'), true);
  assert.equal(scan("import { x } from './algebraArithmeticModel.js';"), true);
  assert.equal(scan('<button>Simplify</button>'), false);
});

test('Rewrite is one menu of shape changes; Simplify owns every computation', () => {
  assert.deepEqual([...REWRITE_MENU_KINDS].sort(), [...STRUCTURE_TOOL_KINDS].sort());
  assert.ok(!STRUCTURE_TOOL_KINDS.includes('arithmetic'));
  // A numeric fraction is Simplify's, never Cancel factors'.
  const numeric = rewriteMenuOptions({ left: 'y', right: '6 / 4 + x', variable: 'x' });
  assert.equal(numeric.reduce.length, 0);
  const symbolic = rewriteMenuOptions({ left: 'y', right: '6 * x / 4', variable: 'x' });
  assert.equal(symbolic.reduce.length, 1);
});

const equation = { left: '2 * x + (1) * (-4 * x) + (1) * (12)', right: '2', variable: 'x' };
const key = equationKey(equation);
const regions = [
  { key: 'left', label: 'left side', expression: equation.left, variable: 'x' },
  { key: 'right', label: 'right side', expression: equation.right, variable: 'x' },
];

test('a draft saved with Simplify arithmetic or Combine like terms open is migrated, never lost', () => {
  // Simplify arithmetic on a product: the product is chosen, the answer kept.
  const product = { left: '3 * (5 * (x - 3))', right: 'y', variable: 'x' };
  const productKey = equationKey(product);
  const productRegions = [{ key: 'left', label: 'left side', expression: product.left, variable: 'x' }, { key: 'right', label: 'right side', expression: product.right, variable: 'x' }];
  const arithmetic = migrateLegacySimplifyDraft(
    { structureTool: { kind: 'arithmetic', equationKey: productKey, candidateId: 'left:0', answer: '15' } },
    { key: productKey, regions: productRegions },
  );
  assert.equal(arithmetic.structureTool, null);
  assert.equal(arithmetic.simplifyTool.partId, 'left:product:0');
  assert.equal(arithmetic.simplifyTool.answer, '15');
  // Combine like terms with the whole group chosen: that part, answer kept.
  const like = migrateLegacySimplifyDraft(
    { likeTermsOpen: true, likeTermsSide: 'left', selectedLikeTermIndices: [0, 1], likeTermsAnswer: '-2x' },
    { key, regions },
  );
  assert.equal(like.simplifyTool.partId, 'left:likeTerms:0.1');
  assert.equal(like.simplifyTool.answer, '-2x');
  // A stale tool (another equation) closes cleanly.
  const stale = migrateLegacySimplifyDraft(
    { structureTool: { kind: 'arithmetic', equationKey: 'old = 1', candidateId: 'left:0', answer: '3' } },
    { key, regions },
  );
  assert.equal(stale.structureTool, null);
  assert.equal(stale.simplifyTool, null);
  // Another structure tool passes through untouched.
  const factor = { kind: 'factor', equationKey: key, undoStack: [] };
  assert.equal(migrateLegacySimplifyDraft({ structureTool: factor }, { key, regions }).structureTool, factor);
});

test('rehydrating a draft migrates the open tool and keeps the committed work', () => {
  const workSteps = [{ kind: 'distribution', description: 'Distributed 1', before: { left: '2 * x + 1 * (-4 * x + 12)', right: '2' }, after: equation }];
  const restored = rehydrateAlgebraDraft({
    draft: {
      algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
      equation,
      workSteps,
      structureTool: { kind: 'arithmetic', equationKey: key, candidateId: 'left:1', answer: '-4' },
      likeTermsOpen: false,
      likeTermsSide: '',
      selectedLikeTermIndices: [],
      likeTermsAnswer: '',
    },
    initialEquation: equation,
  });
  assert.deepEqual(restored.equation, equation);
  assert.deepEqual(restored.workSteps, workSteps);
  assert.equal(restored.structureTool, null);
  assert.equal(restored.simplifyTool?.kind, 'simplify', 'the old tool reopens as Simplify');
  assert.ok(!('likeTermsOpen' in restored), 'the old fields are not carried forward');
  // A pending move still clears every open tool, Simplify included.
  const pending = rehydrateAlgebraDraft({
    draft: { algebraDraftVersion: ALGEBRA_DRAFT_VERSION - 1, equation, simplifyTool: openSimplify(key) },
    initialEquation: equation,
  });
  assert.equal(pending.simplifyTool, null);
  // A Simplify slot from another equation is never replayed.
  assert.equal(sanitizeSimplifyState(openSimplify('a = b'), key), null);
  assert.equal(sanitizeSimplifyState(openSimplify(key), key).kind, 'simplify');
  // Device storage is re-typed, never trusted (verifier review).
  const tampered = sanitizeSimplifyState({ ...openSimplify(key), answer: { x: 1 }, regionAnswer: 'y'.repeat(5000), signs: ['+', 1, -1, 7], partId: 42, undoStack: [null, 'x', { answer: 3 }] }, key);
  assert.equal(tampered.answer, '');
  assert.equal(tampered.regionAnswer.length, 500);
  assert.deepEqual(tampered.signs, [0, 1, -1, 0]);
  assert.equal(tampered.partId, null);
  assert.deepEqual(tampered.undoStack.map((entry) => entry.answer), ['']);
});

test('the parts toolbar: arrows move and wrap, Home/End jump, Enter and Space open, Escape closes', () => {
  assert.deepEqual(partsToolbarKeyAction('ArrowRight', 0, 3), { type: 'move', index: 1 });
  assert.deepEqual(partsToolbarKeyAction('ArrowDown', 2, 3), { type: 'move', index: 0 });
  assert.deepEqual(partsToolbarKeyAction('ArrowLeft', 0, 3), { type: 'move', index: 2 });
  assert.deepEqual(partsToolbarKeyAction('Home', 2, 3), { type: 'move', index: 0 });
  assert.deepEqual(partsToolbarKeyAction('End', 0, 3), { type: 'move', index: 2 });
  assert.deepEqual(partsToolbarKeyAction('Enter', 1, 3), { type: 'open', index: 1 });
  assert.deepEqual(partsToolbarKeyAction(' ', 1, 3), { type: 'open', index: 1 });
  assert.deepEqual(partsToolbarKeyAction('Escape', 1, 3), { type: 'close' });
  assert.equal(partsToolbarKeyAction('a', 1, 3), null);
  // The panel wires them to the toolbar, and Escape in the box returns focus.
  const panel = executableSource(read('src/platform/algebra/simplify/SimplifyPanel.jsx'));
  assert.match(panel, /role="toolbar"[\s\S]*?onKeyDown=\{onToolbarKeyDown\}/);
  const closeBox = region(panel, 'const closeBox = () => {', '\n  };', 'closeBox');
  assert.match(closeBox, /clearSimplifyPart\(current\)/);
  assert.match(closeBox, /focusChip\(returnTo\)/);
  assert.match(region(panel, 'const onBoxKeyDown = (event) => {', '\n  };', 'box keys'), /event\.key !== 'Escape'[\s\S]*closeBox\(\)/);
});

test('a substituted group is shown as the group, never as a product with 1', () => {
  for (const [stored, shown] of [
    ['2 * x + 1 * (-4 * x + 12)', '2x+\\left(-4x+12\\right)'],
    ['3 * x - 1 * (-4 * x + 12)', '3x-\\left(-4x+12\\right)'],
    ['-1 * (6 - y - z) + 4 * y - z', '-\\left(6- y- z\\right)+4y- z'],
  ]) {
    assert.equal(expressionToLatex(stored), shown);
    assert.ok(splitAdditiveTerms(stored).every((term) => !/(^|[^\d.])1\\left/.test(term.latex)), `${stored}: ${splitAdditiveTerms(stored).map((term) => term.latex)}`);
  }
  // A real coefficient is unchanged: 3(-3 + 2y) stays a product to distribute.
  assert.equal(expressionToLatex('3 * (-3 + 2 * y) + 5 * y'), '3\\left(-3+2y\\right)+5y');
  // The term row reads the group as drawn, not "1 times".
  const row = executableSource(read('src/AlgebraTermRow.jsx'));
  assert.match(row, /const spokenTermText = \(text\) => String\(text \?\? ''\)\.replace\(\/\^\(\[\+-\]\?\\s\*\)1 \\\* \(\\\(\.\*\\\)\)\$\/, '\$1\$2'\);/);
});

const distributeEverywhere = (eq) => {
  let state = initDistributionState(detectDistributableGroup(eq));
  for (let index = 0; index < state.terms.length; index += 1) state = placeOnTerm(armFactor(state), index);
  return commitDistribution(eq, state);
};

test('never multiply by 1: Distribute refuses a unit factor, and (a)(1) is applied the moment it would appear', () => {
  for (const left of ['2 * x + 1 * (-4 * x + 12)', '3 * x - 1 * (-4 * x + 12)', '-1 * (x + 2)']) {
    assert.equal(detectDistributableGroup({ left, right: '2', variable: 'x' }), null, left);
  }
  assert.equal(distributeEverywhere({ left: '3 * (x + 1)', right: '9', variable: 'x' }).left, '(3)(x) + 3');
  // A -1 inside keeps its sign product for the student: (-2)(-1).
  assert.equal(distributeEverywhere({ left: '-2 * (x - 1)', right: '9', variable: 'x' }).left, '(-2)(x) + (-2)(-1)');
  // A real factor still distributes, unsimplified: the products are the student's.
  assert.equal(distributeEverywhere({ left: '3 * (-3 + 2 * y) + 5 * y', right: '24', variable: 'y' }).left, '(3)(-3) + (3)(2 * y) + 5 * y');
});

test('only a WRITTEN 1 is applied for the student: 2/2 and 3 - 2 are arithmetic the student does (Codex review)', () => {
  // A computed unit factor is distributable like any other factor, and a computed unit term keeps its product.
  assert.equal(detectDistributableGroup({ left: '(2/2) * (x + 3)', right: '4', variable: 'x' })?.factorText, '2 / 2');
  assert.equal(distributeEverywhere({ left: '3 * (x + 2/2)', right: '9', variable: 'x' }).left, '(3)(x) + (3)(2 / 2)');
  assert.equal(distributeEverywhere({ left: '3 * (x + 1)', right: '9', variable: 'x' }).left, '(3)(x) + 3');
  const regions = (left) => [{ key: 'left', label: 'left side', expression: left, variable: 'x' }, { key: 'right', label: 'right side', expression: '4', variable: 'x' }];
  const kindsOf = (left) => detectSimplifyParts(regions(left)).map((part) => `${part.kind}:${part.termIndices.join('.')}`);
  // Not a one-press "Remove parentheses": the product is typed first.
  assert.deepEqual(kindsOf('(2/2) * (x + 3)'), ['product:0']);
  assert.deepEqual(kindsOf('x - (3 - 2) * (x + 3)'), ['product:1']);
  assert.deepEqual(kindsOf('x - 1 * (x + 3)'), ['parentheses:1']);
  // Typing the product keeps the group, so removing it (and each sign after a minus) is still the next step.
  const typed = commitSimplifyPart(regions('x - (3 - 2) * (x + 3)'), 'left:product:1', { answer: '-1', signs: [] });
  assert.equal(typed.ok, true);
  assert.equal(typed.expression, 'x - 1 * (x + 3)');
  const next = detectSimplifyParts(regions(typed.expression)).find((part) => part.kind === 'parentheses');
  assert.equal(next?.sign, -1);
  assert.equal(commitSimplifyPart(regions('(2/2) * (x + 3)'), 'left:product:0', { answer: '1', signs: [] }).expression, '1 * (x + 3)');
  // A product of 1 with letters alone is still just the letters.
  assert.equal(commitSimplifyPart(regions('(1/2) * 2 * x'), 'left:product:0', { answer: '1', signs: [] }).expression, 'x');
});
