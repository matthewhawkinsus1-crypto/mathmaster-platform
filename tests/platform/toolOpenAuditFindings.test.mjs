import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const findings = JSON.parse(readFileSync(new URL('./fixtures/toolOpenFindings.json', import.meta.url), 'utf8'));

test('every tool opens with the tool on screen and its directions folded', () => {
  // Recorded by tests/browser/toolOpenAudit.mjs in a real Chromium at a
  // Chromebook viewport. Pixel position and scroll depth are not things a
  // source-inspection test can measure, so the browser records and this asserts.
  assert.deepEqual(findings.findings, [], `browser audit found problems:\n${JSON.stringify(findings.findings, null, 2)}`);
});

test('the audit measured the screen students actually use', () => {
  // A pass at desktop height would prove nothing about a Chromebook.
  assert.equal(findings.viewport.width, 1366);
  assert.equal(findings.viewport.height, 640);
  assert.ok(findings.measured >= 19, `expected at least 19 tools measured, got ${findings.measured}`);
});
