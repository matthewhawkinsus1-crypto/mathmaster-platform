/*
 * A GENERIC CHECK IS NEVER LABELLED "ANSWER:" (release-candidate QA m9).
 *
 * The projector showed "Answer: Check that the selected answer is consistent
 * with the stated geometry" — 8 ACT items (and ~140 seeded reviews) carry a
 * check instruction, not an answer, in answerSummary. The content is job J's;
 * the label is decided here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { answerSummaryLabel } from '../../src/platform/liveChallenge/challengeSolutionModel.js';
import { executableSource } from './helpers/sourceContract.mjs';

test('check instructions are labelled as checks, answers as answers', () => {
  assert.equal(answerSummaryLabel('Check that the selected answer is consistent with the stated geometry.'), 'Check');
  assert.equal(answerSummaryLabel('Verify that the selected answer satisfies all original conditions.'), 'Check');
  assert.equal(answerSummaryLabel('x = 4'), 'Answer');
  assert.equal(answerSummaryLabel('The slope is 3, so choice B.'), 'Answer');
  assert.equal(answerSummaryLabel('Checkers have 64 squares'), 'Answer', 'a word that merely starts with "check" is not an instruction');
});

test('the projector and the host console both take the label from the rule', () => {
  for (const path of ['src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'src/components/liveChallenge/ChallengeHostConsole.jsx']) {
    const source = executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    assert.match(source, /import \{[^}]*\banswerSummaryLabel\b[^}]*\} from '\.\.\/\.\.\/platform\/liveChallenge\/challengeSolutionModel\.js';/, path);
    assert.match(source, /\{answerSummaryLabel\(review\.answerSummary\)\}:/, path);
    assert.doesNotMatch(source, />Answer: ?<\//, `${path}: no hard-coded "Answer:" label`);
  }
});
