import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The recorded result of rendering every seed question in a real browser and
// reading the screen back.
//
// WHY A FIXTURE AND NOT A LIVE CHECK. Reading the screen needs a dev server and
// Chromium, which the unit suite has neither of. So the browser pass is run by
// hand (`node tests/browser/renderAudit.mjs --write`) and its verdict is
// committed; this test holds that verdict to zero. A regression that puts `$x$`
// back on a student's screen fails here as soon as someone re-runs the audit,
// and the count below fails immediately if the fixture is quietly emptied or
// narrowed to a handful of questions.
//
// This exists because payload tests cannot see pixels. Every field checked here
// had a correct payload and a wrong screen.

const audit = JSON.parse(readFileSync(new URL('./fixtures/renderAuditFindings.json', import.meta.url), 'utf8'));

test('no seed question shows raw LaTeX markup to a student', () => {
  const detail = audit.findings
    .slice(0, 10)
    .map((entry) => `${entry.id}: ${entry.leaks.map((leak) => leak.samples.join(' ')).join(' | ')}`)
    .join('\n');
  assert.equal(
    audit.findings.length,
    0,
    `${audit.findings.length} question(s) render authored markup as text:\n${detail}`,
  );
});

test('the render audit covered a real spread of the bank', () => {
  // A green result means nothing if the audit only looked at twelve questions.
  //
  // The bank is now 5,150 generated templates across nine seed files, and
  // rendering every one in a browser takes hours, so the recorded pass is a
  // `--stride` sample that walks the whole bank rather than the first N of it —
  // taking the first N would have meant auditing one seed file and calling it
  // coverage. The placeholder and delimiter classes are checked exhaustively
  // and cheaply elsewhere; what needs a browser is whether a FIELD is rendered
  // through MathText, which is a property of components and shows up in a
  // sample.
  assert.ok(audit.rendered >= 600, `render audit covered only ${audit.rendered} questions`);
  assert.equal(audit.skipped, 0, `${audit.skipped} questions were not issuable and went unaudited`);
});
