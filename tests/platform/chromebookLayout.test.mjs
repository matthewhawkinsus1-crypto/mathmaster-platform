// The screen a student actually has.
//
// The target is an ordinary school Chromebook: about 1366x768, which leaves
// roughly 1266x600 of usable page once browser chrome is accounted for, driven
// by a trackpad, on imperfect Wi-Fi. These tests check the properties that make
// a question workable on that machine — and, equally, that nothing in the
// codebase quietly assumes a developer's monitor.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const sourceFiles = [];
const walk = (dir) => readdirSync(dir).forEach((entry) => {
  const full = join(dir, entry);
  if (statSync(full).isDirectory()) walk(full);
  else if (/\.(jsx|js)$/.test(entry)) sourceFiles.push(full);
});
walk(SRC);

const read = (path) => readFileSync(join(SRC, path), 'utf8');
const player = read('components/student/PathSessionPlayer.jsx');
const graph = read('InteractiveGraphWorkspace.jsx');
const css = read('App.css');

// Usable width on the target device.
const USABLE_WIDTH = 1266;

test('no layout assumes a screen wider than a school Chromebook', () => {
  const wide = [];
  sourceFiles.forEach((file) => {
    const src = readFileSync(file, 'utf8');
    [...src.matchAll(/\b(minWidth|width):\s*'?(\d{3,4})(px)?'?/g)].forEach((match) => {
      if (Number(match[2]) > USABLE_WIDTH) {
        wide.push(`${file.replace(SRC + '/', '')}: ${match[1]} ${match[2]}`);
      }
    });
  });
  assert.deepEqual(wide, [], 'a fixed width past the viewport forces horizontal scrolling on the mathematics');
});

test('no container is pinned to a height taller than the visible page', () => {
  const tall = [];
  sourceFiles.forEach((file) => {
    const src = readFileSync(file, 'utf8');
    [...src.matchAll(/\bheight:\s*'?(\d{3,4})px'?/g)].forEach((match) => {
      if (Number(match[1]) > 520) tall.push(`${file.replace(SRC + '/', '')}: ${match[1]}px`);
    });
  });
  assert.deepEqual(tall, [], 'a fixed tall container cuts content off on a short screen');
});

test('the Check action follows the student down a long question', () => {
  // Prompt, stimulus, response fields, hint panel and feedback all sit above
  // the button. On a 600px page that meant scrolling down to submit and back up
  // to read the answer, for every attempt.
  assert.match(player, /position: 'sticky',\s*\n\s*bottom: 10/,
    'the primary action must stay reachable without scrolling');
});

test('pressing Enter in a response field submits', () => {
  // The single most common interaction in a maths session, and the one that
  // most obviously should not require reaching for the trackpad.
  const fields = read('components/student/PathResponseFields.jsx');
  assert.match(fields, /onSubmit\?\.\(\)/, 'Enter must trigger the primary check action');
  assert.match(graph, /event\.key === 'Enter'/, 'and in the graph workspace exact-entry boxes too');
});

test('the interactive plane has a visible focus ring, and something to focus', () => {
  // The ring existed for a long time with nothing focusable to put it on.
  assert.match(css, /\.mathmaster-responsive-canvas:focus-visible/, 'the ring must exist');
  assert.match(graph, /tabIndex=\{0\}/, 'and the plane must actually be reachable by Tab');
  assert.match(graph, /className="mathmaster-responsive-canvas/, 'and carry the class the ring targets');
});

test('focus moves to the response after a submission', () => {
  // A Chromebook screen is short. A student who submitted at the bottom of the
  // card should not have to hunt for what the platform said back.
  assert.match(player, /feedbackRef\.current\?\.focus\?\.\(\)/);
  assert.match(player, /tabIndex=\{-1\}[\s\S]{0,120}aria-live="polite"/,
    'the feedback region must be focusable and announced');
});

test('every interactive control clears the trackpad target floor', () => {
  // 32px is the floor; the codebase mostly uses 40. Anything smaller is a
  // coin-flip on a trackpad.
  const small = [];
  [player, read('components/student/PathResponseFields.jsx'), read('components/student/PathSupportBar.jsx')]
    .forEach((src, index) => {
      [...src.matchAll(/minHeight:\s*'?(\d{1,3})(px)?'?/g)].forEach((match) => {
        if (Number(match[1]) > 0 && Number(match[1]) < 32) small.push(`file ${index}: ${match[1]}px`);
      });
    });
  assert.deepEqual(small, [], 'a control smaller than this is hard to hit on a trackpad');
});

test('the student card keeps its mathematics inside the page', () => {
  // Wide content — a table, a long expression — must scroll inside its own
  // container rather than pushing the page sideways.
  assert.match(player, /maxWidth: 880/, 'the reading column stays a comfortable width');
});

test('a tool that draws is allowed to scale with the viewport', () => {
  // The graph is authored against a fixed viewBox and scaled by CSS, which is
  // what lets it fit a narrow screen without redrawing.
  assert.match(graph, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(graph, /width: '100%', height: 'auto'/);
});

// --- The Phase 9 student surfaces ---------------------------------------------

test('every new student surface has a thumb-sized primary control', () => {
  // A trackpad on a Chromebook and a thumb on a phone both need about 44px.
  // These are the screens a student uses most, so they are the ones where a
  // cramped target costs the most mis-taps.
  ['components/student/WhatShouldIDoNow.jsx',
    'components/student/AssignmentGroup.jsx',
    'components/student/WeeklyPathGoalPanel.jsx'].forEach((path) => {
    const source = read(path);
    const heights = [...source.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
    assert.ok(heights.length > 0, `${path} sets no explicit control height`);
    heights.forEach((height) => {
      assert.ok(height >= 44, `${path} has a ${height}px target, below the 44px minimum`);
    });
  });
});

test('the new student surfaces do not pin themselves to a wide fixed width', () => {
  ['components/student/WhatShouldIDoNow.jsx',
    'components/student/AssignmentGroup.jsx',
    'components/student/WeeklyPathGoalPanel.jsx'].forEach((path) => {
    const source = read(path);
    [...source.matchAll(/(?:^|[^-])width:\s*'?(\d+)px/g)].forEach((match) => {
      assert.ok(Number(match[1]) <= USABLE_WIDTH,
        `${path} fixes a width of ${match[1]}px, wider than the usable ${USABLE_WIDTH}px`);
    });
  });
});

test('a student can always leave an active Path session', () => {
  // The brief: no state should require a browser refresh or Home as the only
  // escape. An active session had no exit at all.
  assert.match(player, /Back to My Math Path/,
    'the session player offers no way back to My Math Path');
});
