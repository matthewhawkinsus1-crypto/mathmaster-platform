import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWarts } from '../../scripts/digital-sat-render-lint.mjs';

const compiled = () => JSON.parse(readFileSync(new URL('../../drafts/digitalSAT.v2.1.json', import.meta.url), 'utf8')).documents;

// A generator whose coefficient can be 1 renders "1x"; one whose constant can
// be 0 renders "+ 0" through a signed slot. Neither appears on the exam, and
// both were widespread before the V2.1 certification sweep - 244 instances
// across 664 families. The repair is always a parameter exclude or a derived
// constraint, so this test is the thing that keeps a widened range from
// quietly reintroducing them.
test('no Digital SAT family renders a unit coefficient, a zero constant, or an unresolved placeholder', () => {
  const warts = renderWarts(compiled(), 80);
  assert.deepEqual(warts, [], `families rendering text the exam would not print:\n  ${warts.slice(0, 20).join('\n  ')}`);
});
