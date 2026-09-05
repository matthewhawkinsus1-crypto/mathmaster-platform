import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const mobile = read('mobileLayoutFindings.json');
const phone = read('toolOpenPhoneFindings.json');

test('a student on a phone can reach the answer and the submit control', () => {
  // Recorded by tests/browser/mobileLayoutAudit.mjs driving PathSessionPlayer —
  // the same surface an assignment renders — with real sanitized bank
  // questions, on a phone viewport.
  assert.deepEqual(mobile.findings, [], `mobile layout problems:\n${JSON.stringify(mobile.findings, null, 2)}`);
});

test('every tool also opens ready on a phone, not just on a Chromebook', () => {
  assert.deepEqual(phone.findings, [], `phone tool-open problems:\n${JSON.stringify(phone.findings, null, 2)}`);
  assert.equal(phone.viewport.width, 390);
});

test('the mobile audits ran at a phone size, not a desktop one', () => {
  // A pass measured at desktop width would prove nothing, and did once: the
  // harness pages had no viewport meta tag, so a mobile context laid them out
  // at ~988px and every number described a page no student sees.
  assert.equal(mobile.viewport.width, 390);
  assert.equal(mobile.viewport.height, 664);
  assert.ok(mobile.measured >= 8, `expected a real sample, got ${mobile.measured}`);
});

test('the harness pages carry the same viewport meta the app does', () => {
  // The guard for the bug above: without this the mobile audits silently
  // measure a desktop layout and report success.
  const pages = ['renderAudit', 'toolOpenAudit', 'liveChallengeGame', 'warmupChallengeRender', 'answerRoundTrip', 'captureToolResponses', 'fractionProbe'];
  pages.forEach((name) => {
    const html = readFileSync(new URL(`../browser/${name}.html`, import.meta.url), 'utf8');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/, `${name}.html must mirror index.html`);
  });
});
