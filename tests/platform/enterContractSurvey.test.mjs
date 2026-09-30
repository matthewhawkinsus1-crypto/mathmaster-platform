// The browser survey (tests/browser/enterContractSurvey.mjs) drives every
// registry tool's typed boxes with Enter and records what happened. These
// assertions hold its latest run, so a regression fails the ordinary suite with
// no browser needed. Refresh with --write after adding or changing a tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';

const survey = JSON.parse(readFileSync(new URL('./fixtures/enterContractSurvey.json', import.meta.url), 'utf8'));

test('the Enter survey covered every registry tool', () => {
  const surveyed = new Set(survey.tools.map((row) => row.toolId));
  const missing = [...TOOL_CATALOG_IDS].filter((toolId) => !surveyed.has(toolId));
  assert.deepEqual(missing, [], 'rerun tests/browser/enterContractSurvey.mjs --write');
});

// Platform quirks audit: Inverse Composition (restriction), Sequence Explorer
// (compare) and Interval Number Line spent an attempt on the first Enter while
// a choice, a plane or a second box was still unset.
test('no single Enter submits an attempt from a tool with more than one answer control', () => {
  const surprises = survey.tools
    .filter((row) => (row.typedFields + row.otherAnswerControls) > 1)
    .filter((row) => row.enters.some((entry) => entry.submittedAttempt))
    .map((row) => row.toolId);
  assert.deepEqual(surprises, []);
});

test('every Enter the survey drove did something a student can see, or nothing at all', () => {
  const unexplained = survey.tools.flatMap((row) => row.enters
    .filter((entry) => entry.result && !/^field-gone$/.test(entry.result))
    .map((entry) => `${row.toolId} #${entry.field}: ${entry.result}`));
  assert.deepEqual(unexplained, [], 'a typed box the survey could not drive');
});
