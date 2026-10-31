// A HIDDEN GRADE IS SAID AS "GRADE HIDDEN", NOT AS ITS DOTS (AX15, H-69).
//
// "Hide grade" puts dots where the number was. A screen reader read the dots
// ("Period 1 bullet bullet · 3 assignments"). Every mask in Grades, its
// section breakdown and its Test Cycle breakdown now draws the dots for the
// eye only and says "grade hidden". Rendered here through vite, as the app
// builds them.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

// What assistive technology reads: the markup without aria-hidden subtrees.
const spoken = (html) => html
  .replace(/<span aria-hidden="true">[^<]*<\/span>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

test('the mask draws dots for the eye and says "grade hidden"', async () => {
  const HiddenGradeMask = (await vite.ssrLoadModule('/src/components/student/HiddenGradeMask.jsx')).default;
  const html = renderToStaticMarkup(React.createElement(HiddenGradeMask, { dots: '•••' }));
  assert.match(html, /<span aria-hidden="true">•••<\/span>/);
  assert.equal(spoken(html), 'grade hidden');
});

test('a hidden section breakdown says "grade hidden" for each section and never a dot', async () => {
  const GradeSectionBreakdown = (await vite.ssrLoadModule('/src/components/student/GradeSectionBreakdown.jsx')).default;
  const sections = {
    warmup: { total: 2, attempted: 2, score: 50 },
    classwork: { total: 4, attempted: 4, score: 75 },
  };
  const hidden = renderToStaticMarkup(React.createElement(GradeSectionBreakdown, { sections, hidden: true }));
  assert.doesNotMatch(spoken(hidden), /•/);
  assert.equal((spoken(hidden).match(/grade hidden/g) || []).length, 2);
  assert.doesNotMatch(spoken(hidden), /\d+%/, 'and no number');
  const shown = renderToStaticMarkup(React.createElement(GradeSectionBreakdown, { sections, hidden: false }));
  assert.match(spoken(shown), /50%/);
  assert.doesNotMatch(shown, /grade hidden/);
});

test('no student grade screen draws a bare dot mask any more', () => {
  const dir = new URL('../../src/components/student/', import.meta.url);
  const offenders = readdirSync(dir)
    .filter((name) => name.endsWith('.jsx') && name !== 'HiddenGradeMask.jsx')
    .filter((name) => /hidden \? '•+'/.test(readFileSync(new URL(name, dir), 'utf8')));
  assert.deepEqual(offenders, [], 'use <HiddenGradeMask /> so the mask is said, not spelled');
});
