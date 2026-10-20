/*
 * A ✓ / ✗ mark is named where a screen reader can hear it (student pass 3,
 * FIGURE_DESCRIPTIONS "Not done").
 *
 * The "Your answer" row (QuestionEngine) and the worked solution's "Part by
 * part" rows (SolutionReviewPanel) drew each part's verdict as a bare <span>
 * with aria-label="correct" / "not correct". A span has no role, so the name is
 * not allowed there (axe: aria-prohibited-attr) and screen readers skip it: the
 * part was heard without its verdict. Each mark is now role="img".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const jsxFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : jsxFiles(full);
  return name.endsWith('.jsx') ? [full] : [];
});

// Every element that names a verdict mark in words.
const verdictMarks = (source) => [...executableSource(source).matchAll(/<(\w+)\b[^<>]*?aria-label="(?:not )?correct"[^<>]*>\s*[✓✗]/g)];

test('the marks the defect named are images with names', () => {
  for (const file of ['src/QuestionEngine.jsx', 'src/SolutionReviewPanel.jsx']) {
    const marks = verdictMarks(readFileSync(join(ROOT, file), 'utf8'));
    assert.equal(marks.length, 2, `${file}: a ✓ and a ✗`);
    marks.forEach((mark) => assert.match(mark[0], /role="img"/, `${file}: ${mark[0]}`));
  }
});

test('no ✓ / ✗ anywhere in src is named on an element without a role', () => {
  const offenders = jsxFiles(join(ROOT, 'src')).flatMap((file) => verdictMarks(readFileSync(file, 'utf8'))
    .filter((mark) => mark[1] === 'span' || mark[1] === 'div')
    .filter((mark) => !/\brole="/.test(mark[0]))
    .map((mark) => `${relative(ROOT, file)}: ${mark[0]}`));
  assert.deepEqual(offenders, []);
});
