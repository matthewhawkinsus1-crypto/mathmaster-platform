import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const mobile = read('mobileLayoutFindings.json');
const phone = read('toolOpenPhoneFindings.json');
const landscape = read('mobileLayoutLandscapeFindings.json');

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

test('a phone held sideways can still see the graph and reach the answer', () => {
  // Landscape was the weakest layout of the three, and measurably broken rather
  // than merely cramped: the tool layouts collapse to one column below 900px,
  // so inside a 390px-tall workspace a graph and its controls could not both
  // fit. The graph and the answer box became mutually exclusive, and a plotting
  // tool opened with its plane entirely off screen.
  assert.deepEqual(landscape.findings, [], `landscape layout problems:\n${JSON.stringify(landscape.findings, null, 2)}`);
  assert.equal(landscape.orientation, 'landscape');
  assert.equal(landscape.viewport.width, 664);
  assert.equal(landscape.viewport.height, 390);
});

test('landscape gives the tool the width, and stops repeating the question', () => {
  // In landscape the question has its own permanent column, so the task card
  // and tool header inside the workspace are pure cost — measured at 436px of
  // chrome above a plotting tool's plane on a 390px screen.
  const css = readFileSync(new URL('../../src/components/student/MathToolMobileLayout.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 500px)'));
  assert.match(block, /mode-landscape \.mathmaster-tool-split[\s\S]{0,200}grid-template-columns: minmax\(0, 1\.5fr\) minmax\(0, 1fr\)/);
  assert.match(block, /mode-landscape \.mathmaster-tool-shell-header h2/);
  assert.match(block, /mathmaster-tool-task-directions/);
});

test('the mobile audits ran at a phone size, not a desktop one', () => {
  // A pass measured at desktop width would prove nothing, and did once: the
  // harness pages had no viewport meta tag, so a mobile context laid them out
  // at ~988px and every number described a page no student sees.
  assert.equal(mobile.viewport.width, 390);
  assert.equal(mobile.viewport.height, 664);
  assert.ok(mobile.measured >= 8, `expected a real sample, got ${mobile.measured}`);
});

test('the harness loads the same stylesheets the app does', () => {
  // FOURTH TIME THIS CLASS OF BUG BIT. A harness that renders the app's
  // components without the app's CSS measures unstyled document flow and
  // reports it as fact: with App.css missing, a two-column tool looked like a
  // 1957px single-column stack, and a desktop layout that works looked broken.
  const main = readFileSync(new URL('../browser/renderAuditMain.jsx', import.meta.url), 'utf8');
  assert.match(main, /import '\.\.\/\.\.\/src\/App\.css';/, 'renderAuditMain must load App.css, as App.jsx does');
  const toolMain = readFileSync(new URL('../browser/toolOpenAuditMain.jsx', import.meta.url), 'utf8');
  assert.match(toolMain, /import '\.\.\/\.\.\/src\/App\.css';/);
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
