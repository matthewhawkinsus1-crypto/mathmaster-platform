// TARGET SIZE AND COLOUR ON THE STUDENT SHELL (job H, item 6).
// The identity bar's Log Out was a bare underlined word (~16px tall); Grades'
// "0 missing" chip was red, reading as bad news when nothing is missing.
// Browser proof: tests/browser/studentShellLargeText.mjs measures Log Out ≥ 44px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('Log Out is a 44px target that keeps the bar one line', () => {
  const bar = read('src/components/student/StudentIdentityBar.jsx');
  const button = bar.match(/<button\s+ref=\{logoutRef\}[\s\S]*?>\s*Log Out\s*<\/button>/)?.[0] || '';
  assert.ok(button, 'the Log Out button');
  assert.match(button, /minHeight: 44/);
  assert.match(button, /minWidth: 44/);
  assert.match(button, /margin: '-10px 0'/, 'it takes no more layout height than the bar\'s 24px line, so the bar stays 38px (PQ-021)');
});

test('"0 missing" is neutral; only a real missing count is red', () => {
  const grades = read('src/components/student/StudentGradeCenter.jsx');
  const chip = grades.match(/<li data-missing-count=\{summary\.missing\}[\s\S]*?missing<\/li>/)?.[0] || '';
  assert.ok(chip, 'the missing chip');
  assert.match(chip, /summary\.missing > 0 \? \{ background: 'var\(--mm-error-bg\)', color: 'var\(--mm-error-text\)' \} : \{ background: 'var\(--mm-surface-control\)', color: 'var\(--mm-text\)' \}/);
});
