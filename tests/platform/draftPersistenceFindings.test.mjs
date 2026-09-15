/*
 * "I TYPED IT IN, WENT TO THE NEXT QUESTION, AND IT WAS GONE."
 *
 * That is the incident, and this is its verdict without a browser.
 * tests/browser/draftPersistence.mjs drives every certified family through
 * QuestionEngine — the surface App.jsx actually mounts, with the real draft
 * key, the real local storage and the real remount on navigation — and records
 * anything the student would have lost:
 *
 *   navigate     question A -> question B -> question A
 *   reload       the same page loaded again, every module re-evaluated
 *   reopen       a new browser on the same profile, which is a Chromebook
 *                closed at the end of one period and opened in the next
 *   replacement  a new variant must start blank, and must not take the
 *                original variant's work with it
 *
 * None of it involves pressing Submit. That is the whole point: PR #247 made a
 * submitted answer indestructible, and a student who has not submitted yet was
 * still losing everything.
 *
 * Re-record with:  npm run test:draft-persistence -- --write
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const audit = JSON.parse(readFileSync('tests/platform/fixtures/draftPersistenceFindings.json', 'utf8'));

test('no certified family lost unfinished work', () => {
  const lines = audit.findings.map((finding) => `  [${finding.sceneId}/${finding.journey}] ${finding.detail}`);
  assert.deepEqual(audit.findings, [], `the draft-persistence browser run recorded findings:\n${lines.join('\n')}`);
});

test('the run actually certified every family the brief names', () => {
  // An empty findings list means nothing if the run mounted nothing. This is
  // the list that stands between "unfinished work survives" and a gate that
  // quietly stopped covering a tool.
  assert.deepEqual(audit.families.map((family) => family.id).sort(), [
    'composed-workflow',
    'data-modeling',
    'function-investigation',
    'function-operations',
    'graphing2',
    'interactive-graph',
    'interval-number-line',
    'literal-input',
    'multi-answer',
    'sequence-explorer',
    'step-algebra',
    'systems-workspace',
    'table',
    'transformations',
  ]);
});

test('every family passed every journey that applies to it', () => {
  const failures = [];
  audit.families.forEach((family) => {
    ['navigate', 'reload', 'reopen', 'replacement'].forEach((journey) => {
      const verdict = family[journey];
      // "NO WORK" is a failure with a different cause: the scripted edit left
      // nothing behind, so the row certified an empty workspace.
      if (!['pass', 'n/a'].includes(verdict)) failures.push(`${family.id}/${journey} = ${verdict}`);
    });
  });
  assert.deepEqual(failures, []);
});

test('a replacement variant is certified as isolated in both directions', () => {
  // The dangerous half is the one that does not look like a bug: a replacement
  // that shows the previous variant's answer looks like helpful persistence.
  const replacement = audit.families.filter((family) => family.replacement !== 'n/a');
  assert.ok(replacement.length >= 1, 'at least one family exercises a replacement question');
  replacement.forEach((family) => assert.equal(family.replacement, 'pass'));
});

test('the local draft write stayed off the student’s critical path', () => {
  // Measured in the browser, against a real localStorage, while typing as fast
  // as the browser accepts keystrokes and while dragging an endpoint at display
  // rate. The budget is what a Chromebook can afford without the student
  // feeling it.
  const probes = Object.fromEntries(audit.performance.map((probe) => [probe.probe, probe]));
  assert.ok(probes['rapid typing'], 'typing latency was measured');
  assert.ok(probes['endpoint drag'], 'a display-rate drag was measured');
  audit.performance.forEach((probe) => {
    assert.ok(probe.maxMs <= audit.budgets.maxSingleWriteMs, `${probe.probe}: worst write ${probe.maxMs}ms`);
    assert.ok(probe.share <= audit.budgets.maxWriteShare, `${probe.probe}: writes were ${probe.share} of the burst`);
  });
  // A drag reported one event per pointermove and still wrote a handful of
  // times: the coalescing window is doing its job, and the final position is
  // written at pointer-up rather than waiting it out.
  assert.ok(probes['endpoint drag'].count >= 2, 'the drag actually moved the endpoint');
  assert.ok(probes['endpoint drag'].count <= 30, 'the drag did not write once per frame');
});
