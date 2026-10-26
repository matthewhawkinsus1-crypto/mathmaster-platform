// TWO SMALL FAILURES THE TEACHER SCREENS' ACCESSIBILITY AUDIT FOUND (TT27), HELD.
//
// 1. The Pre-Flight review's header subtitle (the lesson's title and file) was
//    white at 92% opacity on the header's blue: 4.06:1, and 4.5:1 is what small
//    text needs (WCAG 1.4.3). The contrast review decided it (tests/browser/
//    contrastReview.mjs over the teacher-preflight scene, which axe leaves
//    "needs review" because the text has an opacity).
// 2. The Warm-Up timer's select was named by a hidden <label for=id>, and the id
//    was built from the assignment and class, so the same control on the class
//    page behind the Assignment Hub shared it. The hub's select was announced as
//    "Warm-Up timer minutes Warm-Up timer minutes" (axe duplicate-id-aria and
//    form-field-multiple-labels, "needs review"; Chromium's name for the select).
//
// The browser proof of both is the certification's teacher scenes
// (teacher-preflight, teacher-assignment-hub) and the contrast review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHexColor, relativeLuminance } from '../../src/theme/themeColorRoles.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

const ratio = (a, b) => {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('the Pre-Flight header\'s small text is white on its blue at full strength, which is at least 4.5:1', () => {
  const header = region(read('src/components/teacher/LessonPreflightModal.jsx'), '<header style={{', '</header>', 'the review header');
  const background = header.match(/background: '(#[0-9a-fA-F]{6})'/)?.[1];
  const color = header.match(/color: '(#[0-9a-fA-F]{3,6})'/)?.[1];
  assert.ok(background && color, 'the header sets its own colours, so they are what is measured');
  const subtitle = region(header, '<span style={{', '</span>', 'the subtitle');
  assert.doesNotMatch(subtitle, /opacity/, 'the subtitle is not faded: white at 92% on this blue is 4.06:1');
  const white = parseHexColor(color.length === 4 ? `#${color.slice(1).split('').map((digit) => digit + digit).join('')}` : color);
  assert.ok(ratio(white, parseHexColor(background)) >= 4.5, `the subtitle's contrast on ${background} is ${ratio(white, parseHexColor(background)).toFixed(2)}:1`);
});

test('the same arithmetic fails what was shipped: white at 92% on that blue', () => {
  const blue = parseHexColor('#1a73e8');
  const faded = [0, 1, 2].map((channel) => Math.round(255 * 0.92 + blue[channel] * 0.08));
  assert.ok(ratio(faded, blue) < 4.5, `${ratio(faded, blue).toFixed(2)}:1 is below 4.5:1, which is why the check above is not satisfied by any opacity`);
});

test('the Warm-Up timer select is named on itself, with no id for a label to share with the same control elsewhere', () => {
  const row = region(read('src/components/teacher/ClassLessonControls.jsx'), 'action.timer ? (', 'TIMER_CHOICES.map', 'the timer control');
  assert.match(row, /<select aria-label="Warm-Up timer minutes" className="tw-select"/, 'its name is on the select');
  assert.doesNotMatch(row, /htmlFor=|<label/, 'no label that points at an id');
  assert.doesNotMatch(row, /\bid=/, 'and no id for one to point at: the hub and the class page behind it render the same control');
});
