import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerInStem } from '../../scripts/digital-sat-spr-stem-probe.mjs';

const compiled = () => JSON.parse(readFileSync(new URL('../../drafts/digitalSAT.v2.1.json', import.meta.url), 'utf8')).documents;

// The certification sweep's strong checks all need four options, so none of
// them looks at the 166 student-produced-response families. Fifteen of those
// print their own expected answer in the stem in every draw. Some are the skill
// being tested - "the zeros of x^2-12x+32 are r and s; what is rs?" prints 32
// because Vieta's relation is the point - and some are read-offs carrying a
// band 5 / DOK 3 label. Sorting those apart is authoring work, recorded in
// DIGITAL_SAT_V2_1_CERTIFICATION_AUDIT.md and not done here.
//
// The count is pinned so it can only fall: repairing a family fails this test
// and forces the number down, and a new family that hands over its answer fails
// it too.
const ANSWER_IN_STEM_CEILING = 15;

test('no new Digital SAT SPR family prints its own answer in the stem', () => {
  const rows = answerInStem(compiled(), 120);
  assert.ok(rows.length <= ANSWER_IN_STEM_CEILING,
    `${rows.length} SPR families print the answer in the stem, above the recorded ${ANSWER_IN_STEM_CEILING}:\n  ${rows.map((r) => r.id).join('\n  ')}`);
  assert.equal(rows.length, ANSWER_IN_STEM_CEILING,
    'the recorded count has fallen - lower ANSWER_IN_STEM_CEILING to the new number');
});
