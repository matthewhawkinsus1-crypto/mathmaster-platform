/*
 * FORCED COLOURS (WINDOWS' CONTRAST THEMES): THE WALK'S JUDGE AND ITS CI STEP.
 *
 * tests/browser/forcedColorsCertification.mjs walks the certified scenes under
 * forced colours, dark and light, read by tests/browser/forcedColorsAudit.mjs and
 * judged by scripts/lib/forcedColors.mjs: a Tab stop that draws no focus
 * indicator, a selected or pressed control shown only by colour or background,
 * a control that lost its edge. The browser half is shown finding each planted
 * defect by forcedColorsSelfTest.mjs; this file holds the judge to its verdicts
 * on readings shaped as Chromium reports them, and the theme job to running the
 * walk on the servers it needs. (The stylesheet the walk holds the screens to:
 * forcedColorsStylesheet.test.mjs.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_RATIO, FORCED_COLORS_RULE_IDS, contrastRatio, edgeLost, edgeOf, forcedFocusIndicator, judgeForcedColors,
  parseColour, stateVerdict, traitDifference,
} from '../../scripts/lib/forcedColors.mjs';
import { jobsOf, readWorkflow, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// ------------------------------------------------------------------ readings
// Computed styles as Chromium reports them under forced colours in a dark
// contrast theme: Canvas black, CanvasText white, Highlight cyan.
const CANVAS = 'rgb(0, 0, 0)';
const TEXT = 'rgb(255, 255, 255)';
const HIGHLIGHT = 'rgba(0, 230, 255, 0.8)';
const none = { style: 'none', width: '0px', colour: TEXT };
const solid = (colour = TEXT, width = '1px') => ({ style: 'solid', width, colour });
const box = (overrides = {}) => ({
  sides: [none, none, none, none], outline: none, background: 'rgba(0, 0, 0, 0)', behind: CANVAS,
  gradient: false, urlImage: false, shadow: false, wrapped: false, ...overrides,
});
// A part of a control as partsOf reads it.
const part = (overrides = {}) => ({
  kind: 'self', ...box(), colour: TEXT, fontWeight: '700', fontStyle: 'normal', textDecoration: 'none', opacity: '1', transform: 'none', content: '', fill: '', stroke: '', ...overrides,
});

test('colours are read as Chromium computes them, translucent and color() ones too', () => {
  assert.deepEqual(parseColour('rgb(26, 115, 232)'), [26, 115, 232, 1]);
  assert.deepEqual(parseColour('rgba(0, 230, 255, 0.8)'), [0, 230, 255, 0.8]);
  assert.deepEqual(parseColour('transparent'), [0, 0, 0, 0]);
  assert.deepEqual(parseColour('color(srgb 1 0 0 / 0.5)'), [255, 0, 0, 0.5]);
  assert.equal(Math.round(contrastRatio([255, 255, 255], [0, 0, 0])), 21);
});

test('a button whose edge was its fill has lost it under forced colours, until a border or an outline is drawn', () => {
  // On screen: #1a73e8 on white, border none. Under forced colours: Canvas on Canvas.
  const normal = box({ background: 'rgb(26, 115, 232)', behind: 'rgb(255, 255, 255)' });
  const forced = box({ background: CANVAS });
  assert.equal(edgeLost({ normal, forced }), true);
  assert.equal(edgeLost({ normal, forced: { ...forced, outline: solid() } }), false, 'an outline (forcedColors.css draws one inset) is an edge');
  assert.equal(edgeLost({ normal, forced: { ...forced, sides: [solid(), solid(), solid(), solid()] } }), false, 'a border is an edge');
  assert.equal(edgeLost({ normal, forced: { ...forced, background: HIGHLIGHT } }), false, 'a system colour fill that differs from Canvas is an edge');
  assert.equal(edgeLost({ normal, forced: { ...forced, wrapped: true } }), false, 'a pill drawn around a field is its edge');
});

test('a gradient or a shadow was an edge too; a text-styled button had none to lose; a border is never lost', () => {
  assert.equal(edgeLost({ normal: box({ gradient: true }), forced: box() }), true, 'a gradient button');
  assert.equal(edgeLost({ normal: box({ shadow: true }), forced: box() }), true, 'a card button raised by its shadow');
  assert.equal(edgeLost({ normal: box(), forced: box() }), false, 'a text-styled button');
  assert.equal(edgeLost({ normal: box({ sides: [solid('rgb(95, 99, 104)'), none, none, none], background: 'rgb(241, 243, 244)', behind: 'rgb(255, 255, 255)' }), forced: box() }), false,
    'forced colours recolour a border, they never take it away');
  // #f1f3f4 on white is a grey key a person sees; #f8f9fa is a tint few do.
  assert.equal(edgeOf(box({ background: 'rgb(241, 243, 244)', behind: 'rgb(255, 255, 255)' })).background, true);
  assert.equal(edgeOf(box({ background: 'rgb(248, 249, 250)', behind: 'rgb(255, 255, 255)' })).background, false);
  assert.ok(EDGE_RATIO > 1 && EDGE_RATIO < 1.2);
});

test('a selected tab shown only by its fill is colour-only under forced colours; a Highlight fill, a weight or a glyph shows it', () => {
  const tab = (overrides) => ({ parts: [part(overrides)], text: 'Overview' });
  const normal = { on: tab({ background: 'rgb(26, 115, 232)', behind: 'rgb(255, 255, 255)', colour: 'rgb(255, 255, 255)' }), off: tab({ background: 'rgb(255, 255, 255)', behind: 'rgb(255, 255, 255)', colour: 'rgb(32, 33, 36)' }) };
  const forced = { on: tab({ background: CANVAS }), off: tab({}) };
  assert.equal(stateVerdict({ normal, forced }), 'colour-only');
  assert.equal(stateVerdict({ normal, forced: { ...forced, on: tab({ background: HIGHLIGHT, colour: 'rgb(0, 0, 0)' }) } }), 'shown', 'forcedColors.css highlights it');
  assert.equal(stateVerdict({ normal, forced: { on: tab({ fontWeight: '700' }), off: tab({ fontWeight: '400' }) } }), 'shown', 'bold against regular');
  assert.equal(stateVerdict({ normal, forced: { on: { ...tab({}), text: '✓ Overview' }, off: tab({}) } }), 'shown', 'a check mark in its words');
  assert.equal(stateVerdict({ normal: { on: tab({}), off: tab({}) }, forced: { on: tab({}), off: tab({}) } }), 'not-shown', 'the same on screen too: not a forced-colours loss');
});

test('two looks a person cannot tell apart are one trait: an opaque Canvas fill on Canvas, and 600 against 800', () => {
  const on = { parts: [part({ background: CANVAS, fontWeight: '800' })], text: 'Home' };
  const off = { parts: [part({ background: 'rgba(0, 0, 0, 0)', fontWeight: '600' })], text: 'Assignments' };
  assert.deepEqual(traitDifference(on, off), []);
  // A visible descendant (an icon only the selected one draws) is a difference.
  const withIcon = { ...on, parts: [...on.parts, part({ kind: 'icon:svg', fill: 'rgb(255, 255, 255)' })] };
  assert.ok(traitDifference(withIcon, off).length > 0);
});

test('a focus ring that was a box-shadow is no indicator under forced colours; an outline, or pixels that change, is', () => {
  const snapshot = (self) => ({ self: { outlineStyle: 'none', outlineWidth: '0px', outlineColor: TEXT, boxShadow: 'none', borderTopColor: TEXT, borderBottomColor: TEXT, borderTopWidth: '1px', backgroundColor: CANVAS, color: TEXT, textDecorationLine: 'none', filter: 'none', ...self }, before: null, after: null, parent: null, grandparent: null });
  const blurred = snapshot({});
  assert.equal(forcedFocusIndicator({ focused: snapshot({ outlineStyle: 'solid', outlineWidth: '3px', outlineColor: HIGHLIGHT }), blurred }), 'outline');
  // Chromium reports a box-shadow it does not draw; it is read as nothing.
  assert.equal(forcedFocusIndicator({ focused: snapshot({ boxShadow: 'rgb(26, 115, 232) 0px 0px 0px 3px' }), blurred }), 'none');
  assert.equal(forcedFocusIndicator({ focused: blurred, blurred, changedPixels: 120 }), 'pixels-only');
  assert.equal(forcedFocusIndicator({ focused: blurred, blurred, changedPixels: 4 }), 'none');
});

test('what Chromium reports and does not draw is no indicator: an outline colour with no outline, a border colour with no border, Canvas on Canvas', () => {
  const snapshot = (self) => ({ self: { outlineStyle: 'none', outlineWidth: '0px', outlineColor: TEXT, boxShadow: 'none', borderTopColor: TEXT, borderBottomColor: TEXT, borderTopWidth: '0px', borderBottomWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', color: TEXT, textDecorationLine: 'none', filter: 'none', behind: CANVAS, ...self }, before: null, after: null, parent: null, grandparent: null });
  const blurred = snapshot({});
  // Focused, Chromium turns the outline and border colours to Highlight whether or not either is drawn.
  const recoloured = snapshot({ outlineColor: HIGHLIGHT, outlineWidth: '3px', borderTopColor: HIGHLIGHT, borderBottomColor: HIGHLIGHT });
  assert.equal(forcedFocusIndicator({ focused: recoloured, blurred }), 'none', 'nothing drawn changed: the walk takes a picture');
  assert.equal(forcedFocusIndicator({ focused: recoloured, blurred, changedPixels: 0 }), 'none');
  // A tint on focus (#e8f0fe) is painted as the page: opaque Canvas on Canvas. Its style shows no change, so the walk
  // photographs the stop (a picture that does not change then decides it).
  assert.equal(forcedFocusIndicator({ focused: snapshot({ backgroundColor: CANVAS }), blurred }), 'none');
  // A drawn border, recoloured to Highlight on focus, is a change a person sees (Chromium's own, on a bordered button).
  const bordered = (colour) => snapshot({ borderTopWidth: '2px', borderBottomWidth: '2px', borderTopColor: colour, borderBottomColor: colour });
  assert.equal(forcedFocusIndicator({ focused: bordered(HIGHLIGHT), blurred: bordered(TEXT) }), 'style');
  // A fill in a system colour that differs from Canvas is one too.
  assert.equal(forcedFocusIndicator({ focused: snapshot({ backgroundColor: HIGHLIGHT }), blurred }), 'style');
});

test('one scene\'s readings become axe-shaped violations, a state reported once however many peers look like it', () => {
  const normalEdge = box({ background: 'rgb(26, 115, 232)', behind: 'rgb(255, 255, 255)' });
  const tab = (overrides) => ({ parts: [part(overrides)], text: '' });
  const colourOnly = { normal: { on: tab({ background: 'rgb(26, 115, 232)', behind: 'rgb(255, 255, 255)' }), off: tab({}) }, forced: { on: tab({}), off: tab({}) } };
  const violations = judgeForcedColors({
    edges: [{ target: 'button "Continue"', html: '<button>', normal: normalEdge, forced: box() }, { target: 'button "Fine"', html: '<button>', normal: normalEdge, forced: box({ outline: solid() }) }],
    states: [
      { id: 7, target: 'button[role=tab] "Room"', html: '<button>', state: 'aria-selected="true"', peer: 'Walkthrough', ...colourOnly },
      { id: 7, target: 'button[role=tab] "Room"', html: '<button>', state: 'aria-selected="true"', peer: 'Attention', ...colourOnly },
    ],
    focus: [{ target: 'div[role=button]', html: '<div>', focused: null, blurred: null, changedPixels: 0 }],
  });
  assert.deepEqual(violations.map((violation) => violation.id).sort(), ['mm-forced-edge-lost', 'mm-forced-focus-not-drawn', 'mm-forced-state-colour-only']);
  assert.deepEqual(violations.find((violation) => violation.id === 'mm-forced-edge-lost').nodes.map((node) => node.target[0]), ['button "Continue"']);
  assert.equal(violations.find((violation) => violation.id === 'mm-forced-state-colour-only').nodes.length, 1, 'Room is one finding, not one per peer');
  violations.forEach((violation) => assert.ok(FORCED_COLORS_RULE_IDS.includes(violation.id) && violation.help && violation.helpUrl && violation.impact));
});

// ------------------------------------------------------------------ CI
test('the theme readability job runs the forced-colours walk on the stubbed server and the app, after its self-test', () => {
  const workflow = 'theme-certification.yml';
  const text = readWorkflow(workflow);
  assert.match(text, /^permissions:\n {2}contents: read$/m);
  const job = jobsOf(text)['browser-readability'];
  assert.ok(job, 'the theme readability job');
  const steps = stepsOf(job);
  const at = (pattern) => steps.findIndex((step) => pattern.test(step));
  const server = at(/npx vite --config tests\/browser\/forcedColors\.vite\.config\.mjs --host 127\.0\.0\.1 --port (\d+) --strictPort/);
  const app = at(/npx vite --config tests\/browser\/teacherWorkflow\/vite\.config\.mjs/);
  const selfTest = at(/run: node tests\/browser\/forcedColorsSelfTest\.mjs\s*$/m);
  const walkStep = at(/run: node tests\/browser\/forcedColorsCertification\.mjs\s*$/m);
  assert.ok(server >= 0 && app >= 0 && selfTest >= 0 && walkStep >= 0, 'the stubbed server, the app, the self-test and the walk');
  assert.ok(server < walkStep && app < walkStep && selfTest < walkStep, 'the servers start and the self-test runs before the walk');
  const port = steps[server].match(/--port (\d+)/)[1];
  assert.notEqual(port, '5199', 'not the plain Work View server\'s port');
  assert.match(steps[walkStep], new RegExp(`AUDIT_ORIGIN: "http://127\\.0\\.0\\.1:${port}"`));
  assert.match(steps[walkStep], /TEACHER_HARNESS_ORIGIN: "http:\/\/127\.0\.0\.1:5188"/);
  // They run whatever the dark-mode certification before them did.
  for (const index of [server, selfTest, walkStep]) assert.match(steps[index], /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.ok(steps.some((step) => /path: tests\/browser\/artifacts\/forcedColors/.test(step) && /if: always\(\)/.test(step)), 'its report is kept');
  // Its own dependency cache: beside the plain server on 5199 a shared one reloads pages mid-test.
  assert.match(read('tests/browser/forcedColors.vite.config.mjs'), /cacheDir: path\.join\(root, 'node_modules\/\.vite-forced-colors'\)/);
});

test('the theme job walks the Math Tools Lab\'s tools and their Work Views too, in a step of their own', async () => {
  // A run that names no screen leaves out the screens certified in a job of their own (`ownJob`: the Lab's other tools
  // and the Work Views they open), so the step above does not read them. This one names them, every one: a screen
  // given a job of its own later is walked here as soon as it is named.
  const { CERTIFIED_SCREENS } = await import('../browser/accessibilityCertification.mjs');
  const ownJob = CERTIFIED_SCREENS.filter((screen) => screen.ownJob).map((screen) => screen.id).sort();
  assert.deepEqual(ownJob, ['teacher-math-tools-lab', 'teacher-math-tools-lab-work-view']);
  const steps = stepsOf(jobsOf(readWorkflow('theme-certification.yml'))['browser-readability']);
  const at = (pattern) => steps.findIndex((step) => pattern.test(step));
  const app = at(/npx vite --config tests\/browser\/teacherWorkflow\/vite\.config\.mjs/);
  const lab = steps.findIndex((step) => /run: node tests\/browser\/forcedColorsCertification\.mjs\s*$/m.test(step) && /^\s*ONLY: /m.test(step));
  assert.ok(app >= 0 && lab > app, 'after the in-memory app starts');
  assert.deepEqual(steps[lab].match(/^\s*ONLY: (\S+)$/m)[1].split(',').sort(), ownJob, 'it names every screen the walk otherwise leaves out');
  assert.match(steps[lab], /TEACHER_HARNESS_ORIGIN: "http:\/\/127\.0\.0\.1:5188"/);
  assert.match(steps[lab], /if: \$\{\{ !cancelled\(\) \}\}/, 'whatever the steps before it did');
  // Its report beside the certified scenes' (FORCED_COLORS_ARTIFACTS), not over it, inside the folder that is kept.
  const folder = steps[lab].match(/FORCED_COLORS_ARTIFACTS: (\S+)$/m)?.[1];
  assert.ok(folder && folder.startsWith('tests/browser/artifacts/forcedColors/'), `its own folder under the kept one (${folder})`);
  assert.ok(steps.slice(lab).some((step) => /path: tests\/browser\/artifacts\/forcedColors\s*$/m.test(step) && /if: always\(\)/.test(step)), 'and it is kept');
});

test('a pull request that changes the walk, what it walks or a screen runs the theme certification', () => {
  for (const file of [
    'tests/browser/forcedColorsCertification.mjs', 'tests/browser/forcedColorsAudit.mjs', 'tests/browser/forcedColorsSelfTest.mjs',
    'tests/browser/forcedColors.vite.config.mjs', 'scripts/lib/forcedColors.mjs', 'src/theme/forcedColors.css',
    'tests/browser/accessibilityCertification.mjs', 'tests/browser/accessibilityTeacherScreens.mjs', 'tests/browser/accessibilityAudit.mjs',
    'tests/browser/accessibilityKeyboardReach.mjs', 'tests/browser/accessibilitySecureExamMain.jsx', 'tests/browser/support/touchEmulation.mjs',
    'tests/browser/emulator/vite.config.mjs', 'tests/browser/studentUxPlatformMain.jsx', 'tests/browser/keyboardSweep.html',
    'scripts/lib/keyboardReach.mjs', 'scripts/lib/accessibilityRatchet.mjs', 'src/App.jsx',
  ]) {
    assert.ok(runsOnPullRequest('theme-certification.yml', file), `a change to ${file} runs the theme certification`);
  }
  // Not every accessibility driver: the walk does not load the teacher menus' keyboard driver.
  assert.equal(runsOnPullRequest('theme-certification.yml', 'tests/browser/accessibilityTeacherMenus.mjs'), false);
});
