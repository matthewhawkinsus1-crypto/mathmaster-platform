import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * The browser audit's verdict, asserted without a browser.
 *
 * tests/browser/stagedQuestion.mjs mounts every stage of the staged
 * function-characteristics question on a phone, a phone held sideways and a
 * Chromebook, and records anything wrong into the fixture below. Two classes of
 * finding it looks for:
 *
 *   FIT   the prompt and the control the student answers with are both on
 *         screen at once, with no scrolling.
 *   LEAK  no coordinate readout appears on a stage that asks the student to
 *         MARK a feature they are later asked to write down.
 *
 * Re-record with:  npx vite --port 5199 --strictPort &
 *                  node tests/browser/stagedQuestion.mjs --write
 */
const findings = JSON.parse(readFileSync('tests/platform/fixtures/stagedQuestionFindings.json', 'utf8'));

test('the staged question fits and does not leak on any device', () => {
  assert.deepEqual(
    findings,
    [],
    `browser audit recorded findings:\n${findings.map((f) => `  [${f.device}] ${f.stage}: ${f.issue}`).join('\n')}`,
  );
});
