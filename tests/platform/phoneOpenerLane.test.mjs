/*
 * ON A PHONE, NOTHING THE STUDENT READS OR PRESSES STARTS UNDER "⤢ OPEN WORK VIEW"
 * (PH01, PH02; findings C2-17, D-23, B-72, C1-58, B-70).
 *
 * The button floats over the top-right corner of the question's work. Rows that
 * start the work make room for it themselves; every other module started right
 * under it, which measured at 390x844 in the real engine as 15 of the 22
 * question types (the "Fractions" heading and the top of its answer box, the
 * card that says a question "could not be displayed", a graph's first line, the
 * Path stimulus's title) and, in the inclusion step, the end of "Let's back up".
 *
 * The geometry is proved in a browser (tests/browser/studentUxPlatform.mjs
 * `opener` over ?legacy=1, readAloudTranslate.mjs "Let's back up",
 * figureDescriptions.mjs the Path stimulus; all through support/openerCover.mjs).
 * Nothing here renders React or CSS, so this binds the rules the geometry
 * depends on, each to the region that does the work:
 *
 *   - a work area that does not make room for the button gets the room by
 *     default, and every row that already makes room is exempt (or its room
 *     would be counted twice);
 *   - every grader's heading is one of those rows, so the row after it starts
 *     below the button;
 *   - the "Let's back up" card starts below the button;
 *   - the example in a phone's answer box fits.
 *
 * Each assertion was broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const shellCss = executableSource(read('src/components/common/WorkViewShell.css'));
const engine = executableSource(read('src/QuestionEngine.jsx'));

// The rule that gives a phone's work area the room, and the rows it leaves alone.
const LANE = '.mathmaster-question-container.mode-portrait .mathmaster-work-view-surface[data-enlarged="false"] > .mathmaster-question-tool-workspace:not(:has(';
const laneRule = () => {
  const head = region(shellCss, LANE, '{', 'the work area\'s default room under the button');
  const body = region(shellCss, `${head}{`, '}', 'its declarations');
  const exempt = region(head, ':has(', '))', 'the rows that already share the button\'s row').slice(':has('.length);
  return { exempt: exempt.split(',').map((selector) => selector.trim()).filter(Boolean), body };
};

test('a phone\'s work area gets the room under the button, the height the button was measured to take', () => {
  const { body } = laneRule();
  assert.match(body, /padding-top:\s*var\(--mm-work-view-opener-bottom, 52px\);/, 'as padding on the work area (a margin collapses through the surface and takes the button with it)');
  // Only the phone's portrait question: the container says so.
  assert.ok(shellCss.includes(`${LANE}`), 'bound to the phone container in portrait');
  assert.doesNotMatch(body, /margin/, 'never a margin');
  // The height is the one EnlargeableFigure measures and publishes.
  const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));
  assert.match(figure, /surface\.style\.setProperty\('--mm-work-view-opener-bottom', `\$\{Math\.ceil\(opener\.offsetTop \+ opener\.offsetHeight\)\}px`\);/);
});

test('every row that already makes room for the button is exempt from the default room', () => {
  const { exempt } = laneRule();
  const wanted = {
    '.mathmaster-tool-shell-header': 'a tool\'s header keeps clear of the button\'s width (176px of right padding)',
    '.workflow-focus__rail': 'a staged question\'s step chips',
    '.workflow-focus__navigator': 'a staged question\'s step chips',
    '.mathmaster-multipart-heading': 'the multi-part heading stops before the button',
    '.mathmaster-grader-heading': 'so does every other grader\'s',
    '.mathmaster-guided-notes': 'the Guided Notes card has its own room under the button (below)',
    '.mathmaster-top-panel-row': 'the help panel\'s row starts below it',
    '.mathmaster-closed-verdict-row': 'the closed verdict chip is the button\'s row',
    '.mathmaster-work-view-loading': 'the "Opening Work View…" line would otherwise open the room and close it again when the tool loads',
    '.algebra-toolbar': 'Step Algebra\'s toolbar starts below it',
    '.algebra-relation-toolbar': 'and so does the relation workspace\'s',
  };
  for (const [selector, why] of Object.entries(wanted)) {
    assert.ok(exempt.includes(selector), `${selector} is exempt: ${why}`);
  }
  // The rows exist where the rules say: the class is drawn by the component.
  assert.match(engine, /className="mathmaster-closed-verdict-row"/);
  assert.match(engine, /className="mathmaster-top-panel-row"/);
  assert.match(engine, /<Suspense fallback=\{<p role="status" className="mathmaster-work-view-loading">/);
  assert.match(read('src/GuidedClassworkCoach.jsx'), /mathmaster-guided-notes/);
});

test('the Guided Notes card drops below the button by padding on the work area, never a margin on the card', () => {
  // Measured at 390x844 in the real App: the card's `margin-top: 52px`
  // collapsed through the work area and the surface, so the whole figure
  // moved down 52px with the button on it, and "STEP 1 OF 3" sat under the
  // button on every guided question.
  const lead = '.mathmaster-work-view-surface[data-enlarged="false"] > .mathmaster-question-tool-workspace:has(> .mathmaster-guided-notes:first-child) {';
  const rule = region(shellCss, lead, '}', 'the Guided Notes card\'s room');
  assert.match(rule, /padding-top:\s*var\(--mm-work-view-opener-bottom, 52px\);/);
  assert.doesNotMatch(shellCss, /\.mathmaster-guided-notes\s*\{[^}]*margin-top/, 'no margin-top on the card');
  // Where the work is wide the card keeps a lane on each side of the button instead.
  const wide = region(shellCss, '@media (min-width: 1100px) {\n  .mathmaster-work-view-surface[data-enlarged="false"] > .mathmaster-question-tool-workspace:has(> .mathmaster-guided-notes:first-child) {', '\n}\n', 'the wide rule');
  assert.match(wide, /padding-top:\s*0;/, 'no band where the lanes keep the card clear');
  assert.match(wide, /margin-left:\s*max\(168px, calc\(\(100% - 860px\) \/ 2\)\) !important;/);
});

test('every grader that starts its work with a heading draws it as a heading that shares the button\'s row', () => {
  const graders = readdirSync(new URL('../../src/', import.meta.url)).filter((name) => name.endsWith('Grader.jsx'));
  assert.ok(graders.length >= 7, `the graders are found (${graders.join(', ')})`);
  let headings = 0;
  for (const file of graders) {
    const source = executableSource(read(`src/${file}`));
    for (const match of source.matchAll(/<h2\b[^>]*>/g)) {
      headings += 1;
      assert.match(match[0], /className="mathmaster-(grader|multipart)-heading"/, `${file}: ${match[0].slice(0, 60)} would start under the button`);
    }
  }
  assert.ok(headings >= 7, `every grader's heading was checked (${headings})`);

  // What the class does: a heading is as tall as the button's bottom edge, so the
  // row after it starts clear; on a phone it also stops before the button.
  const tall = region(shellCss, '.mathmaster-question-container.mode-portrait .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-multipart-heading,', '}', 'the heading\'s height');
  assert.match(tall, /\.mathmaster-grader-heading/, 'both classes');
  assert.match(tall, /min-height:\s*var\(--mm-work-view-opener-bottom, 52px\);/);
  const phone = region(shellCss, '@media (max-width: 600px) {\n  .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-multipart-heading', '\n}\n', 'the phone reservations');
  const own = region(phone, '.mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-grader-heading {', '}', 'the grader heading on a phone');
  assert.match(own, /padding-right:\s*var\(--mm-work-view-opener-space, 176px\);/);
  assert.match(own, /text-align:\s*left;/);
});

test('"Let\'s back up" starts below the button and can be read from its first line', () => {
  // The card centred itself in a work area shorter than it was, so on a phone its
  // top rose out of the work, where the task card hides it and nothing scrolls to it.
  const step = region(engine, '<section ref={scaffoldRef} role="region" aria-label="Let\'s back up" data-scaffold=""', '</section>', 'the back-up step');
  const card = region(step, '<div style={{ width: \'min(560px, 94%)\'', '}}>', 'the card');
  assert.match(card, /margin: 'auto'/, 'centred only while it fits; a taller card starts at the top');
  const rule = region(shellCss, '> .mathmaster-question-tool-workspace > [data-scaffold] {', '}', 'the step on a phone');
  assert.match(rule, /padding-top:\s*calc\(var\(--mm-work-view-opener-bottom, 52px\) \+ 8px\) !important;/, 'below the button');
  assert.match(rule, /align-items:\s*flex-start !important;/, 'from the top, not centred');
});

test('on a phone the example in an answer box fits it, even on the narrowest supported phone', () => {
  // "for example 0 ≤ x ≤ 4" is 243px wide at the box's own 24px (measured in
  // Chromium at 390px, where the box has 222px for text and was cut after the
  // second ≤). A 344px phone's box has 176px.
  const EXAMPLE_PX_AT_24 = 243;
  const ROOM_ON_A_344_PHONE = 176;
  const css = executableSource(read('src/index.css'));
  const phone = region(css, '@media (max-width: 600px) {\n  math-field::part(placeholder) {', '\n}\n', 'the placeholder on a phone');
  const size = phone.match(/font-size:\s*max\(([\d.]+)em, ([\d]+)px\);/);
  assert.ok(size, 'the placeholder is a fraction of the box\'s own size, with a floor');
  assert.ok(EXAMPLE_PX_AT_24 * Number(size[1]) <= ROOM_ON_A_344_PHONE, `at ${size[1]}em the example is ${Math.round(EXAMPLE_PX_AT_24 * Number(size[1]))}px, the room is ${ROOM_ON_A_344_PHONE}px`);
  assert.ok(Number(size[2]) >= 16, 'never under 16px');
  // The typed answer is untouched: only the placeholder part is scaled.
  assert.doesNotMatch(phone, /math-field\s*\{/);
});
