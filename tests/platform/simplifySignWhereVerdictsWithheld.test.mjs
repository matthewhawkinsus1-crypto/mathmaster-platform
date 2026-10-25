// WHERE VERDICTS ARE WITHHELD, A REFUSED PART NEVER SAYS WHICH WAY IT IS OFF.
//
// Simplify's part box refuses a typed product or fraction that is off only by
// its sign with "Check the sign." On a last step (x = (−2)(3) typed as 6) that
// tells the student the answer, and the words reached exit tickets, quizzes and
// tests (in a neutral colour; found by p3-tools-4). There the box says only
// that the part is not equal; practice keeps its coaching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  SIMPLIFY_MESSAGES,
  commitSimplifyPart,
  detectSimplifyParts,
  simplifyMessage,
  simplifyReasonShown,
} from '../../src/platform/algebra/simplify/simplifyEngine.js';

const regionsOf = (left, right) => [
  { key: 'left', label: 'left side', expression: left, variable: 'x' },
  { key: 'right', label: 'right side', expression: right, variable: 'x' },
];

// The part box's words for one typed answer, as the panel shows them.
const told = (left, right, kind, answer, verdictsWithheld) => {
  const regions = regionsOf(left, right);
  const part = detectSimplifyParts(regions).find((entry) => entry.kind === kind);
  assert.ok(part, `${left} = ${right} offers a ${kind} part`);
  const result = commitSimplifyPart(regions, part.id, { answer });
  assert.equal(result.ok, false, `${answer} is refused`);
  return simplifyMessage(simplifyReasonShown(result.reason, { verdictsWithheld }));
};

test('a last step typed with the wrong sign is told only "not equal" where verdicts are withheld', () => {
  // x = (−2)(3): the product is the answer, so "Check the sign" would give it away.
  assert.equal(told('x', '(-2) * (3)', 'product', '6', true), SIMPLIFY_MESSAGES.notEqual);
  assert.equal(told('x', '(-2) * (3)', 'product', '6', false), SIMPLIFY_MESSAGES.sign, 'practice keeps its coaching');
  // A numeric fraction off only by its sign.
  assert.equal(told('x + 6 / 4', '1', 'fraction', '-3/2', true), SIMPLIFY_MESSAGES.notEqual);
  assert.equal(told('x + 6 / 4', '1', 'fraction', '-3/2', false), SIMPLIFY_MESSAGES.sign);
  // Withheld, nothing it says mentions a sign.
  assert.doesNotMatch(told('x', '(-2) * (3)', 'product', '6', true), /sign/i);
});

test('only the sign is hidden; every other reason keeps its words, withheld or not', () => {
  assert.equal(simplifyReasonShown('sign', { verdictsWithheld: true }), 'notEqual');
  assert.equal(simplifyReasonShown('sign', { verdictsWithheld: false }), 'sign');
  assert.equal(simplifyReasonShown('sign'), 'sign', 'shown unless the activity says otherwise');
  for (const reason of Object.keys(SIMPLIFY_MESSAGES).filter((key) => key !== 'sign')) {
    assert.equal(simplifyReasonShown(reason, { verdictsWithheld: true }), reason, reason);
    assert.equal(simplifyReasonShown(reason, { verdictsWithheld: false }), reason, reason);
  }
});

test('the panel reads the activity\'s own policy and tells a refused part through it', () => {
  const panel = executableSource(readFileSync(new URL('../../src/platform/algebra/simplify/SimplifyPanel.jsx', import.meta.url), 'utf8'));
  assert.match(panel, /import \{ useToolRuntimeContext \} from '\.\.\/\.\.\/\.\.\/tools\/shared\/ToolRuntimeContext';/);
  assert.match(panel, /const verdictsWithheld = useToolRuntimeContext\(\)\?\.verdictsWithheld === true;/);
  const commitPart = region(panel, 'const commitPart = async () => {', 'const commitRegion = async () => {', 'commitPart');
  assert.match(commitPart, /simplifyMessage\(simplifyReasonShown\(result\.reason, \{ verdictsWithheld \}\)\)/);
  assert.doesNotMatch(commitPart, /simplifyMessage\(result\.reason\)/);
});
