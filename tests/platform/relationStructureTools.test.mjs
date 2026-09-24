import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseRelationSource,
  relationStateToText,
  validateRelationTransition,
} from '../../src/algebraRelationFoundation.js';
import {
  commitRelationDistribution,
  commitRelationLikeTerms,
  relationDistributionCandidates,
  relationLikeTermCandidates,
} from '../../src/algebraRelationStructureModel.js';
import {
  armFactor,
  initDistributionState,
  placeOnTerm,
} from '../../src/algebraDistributionModel.js';
import { region } from './helpers/sourceContract.mjs';

// DISTRIBUTE AND COMBINE LIKE TERMS INSIDE AN INEQUALITY (Job 2).
//
// The relation workspace reuses the equation engine's distribution and
// like-term models on one expression of one branch. The student places every
// product and types every combined term; the workspace's equivalence check is
// the final word, so a wrong sum is refused rather than corrected.

const relation = (source) => parseRelationSource(source, 'x');
const placeEverywhere = (detected) => {
  let distribution = initDistributionState(detected);
  distribution.terms.forEach((_, index) => { distribution = placeOnTerm(armFactor(distribution), index); });
  return distribution;
};
const equivalent = (before, after) => validateRelationTransition(before, after, { kind: 'equivalentRewrite' }).valid;

test('a negative multiplier reaches every term and the symbol does not move', () => {
  const before = relation('-3(x - 4) > 2x + 7');
  const [candidate] = relationDistributionCandidates(before.branches[0]);
  assert.equal(candidate.expressionIndex, 0);
  assert.equal(candidate.detected.factorText, '-3');
  const after = commitRelationDistribution(before, 0, 0, placeEverywhere(candidate.detected));
  assert.equal(relationStateToText(after), '(-3)(x) + (-3)(-4) > 2 x + 7', 'products stay unsimplified for the student');
  assert.deepEqual(after.branches[0].relations, ['>']);
  assert.equal(equivalent(before, after), true);
  assert.equal(relationStateToText(before), '-3 (x - 4) > 2 x + 7', 'the previous state is not mutated (Undo restores it)');
});

test('a fraction multiplier is distributed exactly', () => {
  const before = relation('1/2(4x - 6) < 3');
  const [candidate] = relationDistributionCandidates(before.branches[0]);
  const after = commitRelationDistribution(before, 0, candidate.expressionIndex, placeEverywhere(candidate.detected));
  assert.match(relationStateToText(after), /\(1 \/ 2\)\(4 x\) \+ \(1 \/ 2\)\(-6\) < 3/);
  assert.equal(equivalent(before, after), true);
});

test('the middle region of a compound inequality is distributable', () => {
  const before = relation('-2 < 3(x + 1) <= 9');
  const candidates = relationDistributionCandidates(before.branches[0]);
  assert.deepEqual(candidates.map((entry) => entry.expressionIndex), [1]);
  const after = commitRelationDistribution(before, 0, 1, placeEverywhere(candidates[0].detected));
  assert.equal(relationStateToText(after), '-2 < (3)(x) + (3)(1) <= 9');
  assert.equal(equivalent(before, after), true);
});

test('nothing commits until the multiplier is on every term', () => {
  const before = relation('-3(x - 4) > 2x + 7');
  const [candidate] = relationDistributionCandidates(before.branches[0]);
  const partial = placeOnTerm(armFactor(initDistributionState(candidate.detected)), 0);
  assert.equal(commitRelationDistribution(before, 0, 0, partial), null);
  assert.deepEqual(relationDistributionCandidates(relation('x + 2 > 5').branches[0]), [], 'no group, no Distribute offer');
});

test('like terms: the student types the sum and the workspace checks it', () => {
  const before = relation('2x + 3x - 4 <= 11');
  assert.deepEqual(relationLikeTermCandidates(before.branches[0]).map((entry) => entry.groups), [[{ key: 'x^1', indices: [0, 1] }]]);
  const good = commitRelationLikeTerms(before, 0, 0, [0, 1], '5x');
  assert.equal(relationStateToText(good.next), '5 x - 4 <= 11');
  assert.equal(equivalent(before, good.next), true);
  const wrong = commitRelationLikeTerms(before, 0, 0, [0, 1], '6x');
  assert.equal(equivalent(before, wrong.next), false, 'a wrong sum is not an equivalent rewrite, so the workspace refuses it');
});

test('like terms in the middle of a compound inequality, including a negative term', () => {
  const before = relation('4 < 2x + 3x - x < 12');
  const result = commitRelationLikeTerms(before, 0, 1, [0, 1, 2], '4x');
  assert.equal(relationStateToText(result.next), '4 < 4 x < 12');
  assert.equal(equivalent(before, result.next), true);
});

test('like terms: every unacceptable choice gets a plain reason and no state', () => {
  const before = relation('2x + 3x - 4 <= 11');
  const refuse = (indices, input) => {
    const result = commitRelationLikeTerms(before, 0, 0, indices, input);
    assert.equal(result.next, null, `${JSON.stringify(indices)} ${input}`);
    return result.reason;
  };
  assert.match(refuse([0, 2], '5x'), /not alike/);
  assert.match(refuse([0], '2x'), /at least two/);
  assert.match(refuse([0, 1], ''), /Enter the single term/);
  assert.match(refuse([0, 1], '5x + 1'), /one term with the same variable part/);
  assert.match(refuse([0, 1], '5y'), /one term with the same variable part/);
  assert.equal(commitRelationLikeTerms(before, 0, 7, [0, 1], '5x').next, null);
});

test('the relation workspace commits structure steps through its validated commit', () => {
  const core = fs.readFileSync('src/MultiRelationAlgebraCore.jsx', 'utf8');
  assert.match(core, /import \{ RelationDistributionPanel, RelationLikeTermsPanel \} from '\.\/RelationStructureTools\.jsx'/);
  const commitStep = region(core, 'const commitStructureStep = async', '};', 'the structure commit');
  assert.match(commitStep, /commitState\(next, label, kind, \{ kind: 'equivalentRewrite' \}\)/, 'validated like every rewrite, recorded for Undo and history');
  assert.match(core, /<RelationDistributionPanel[\s\S]*?onCommit=\{commitStructureStep\}/);
  assert.match(core, /<RelationLikeTermsPanel[\s\S]*?onCommit=\{commitStructureStep\}/);
});
