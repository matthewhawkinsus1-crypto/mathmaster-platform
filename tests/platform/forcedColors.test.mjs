/*
 * FORCED COLOURS (WINDOWS' CONTRAST THEMES): THE WALK'S JUDGE AND ITS CI STEP.
 *
 * tests/browser/forcedColorsCertification.mjs walks the certified scenes under
 * forced colours, dark and light, read by tests/browser/forcedColorsAudit.mjs and
 * judged by scripts/lib/forcedColors.mjs: a Tab stop that draws no focus
 * indicator, a selected or pressed control shown only by colour or background,
 * a control that lost its edge, a formula not drawn in its words' colour, a coordinate plane not drawn in the theme's
 * colours. The browser half is shown finding each planted
 * defect by forcedColorsSelfTest.mjs; this file holds the judge to its verdicts
 * on readings shaped as Chromium reports them, and the theme job to running the
 * walk on the servers it needs. (The stylesheet the walk holds the screens to:
 * forcedColorsStylesheet.test.mjs.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_RATIO, FORCED_COLORS_RULE_IDS, PLANE_THEME_COLOURS, contrastRatio, edgeLost, edgeOf, forcedFocusIndicator, judgeForcedColors,
  mathColourKept, parseColour, planePaintProblems, stateVerdict, traitDifference,
} from '../../scripts/lib/forcedColors.mjs';
import { jobsOf, readWorkflow, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';
import { region } from './helpers/sourceContract.mjs';
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

// MathLive has a formula take the colour of its words (forced-color-adjust: preserve-parent-color, in its shadow root).
// After a switch from the dark contrast theme to the light one the Live Challenge projector's formulas were white while
// their words were black: the walk reads each formula's colour against its element's.
test('a formula drawn in another colour than its words kept one under forced colours; the same colour, rounded, did not', () => {
  assert.equal(mathColourKept({ colour: 'rgb(0, 0, 0)', formulaColour: 'rgb(255, 255, 255)' }), true, 'white on the light theme, its words black');
  assert.equal(mathColourKept({ colour: 'rgb(0, 0, 0)', formulaColour: 'rgb(247, 249, 255)' }), true, 'a near-white too');
  assert.equal(mathColourKept({ colour: 'rgba(0, 0, 0, 0.5)', formulaColour: 'rgb(0, 0, 0)' }), true, 'and a fainter one');
  assert.equal(mathColourKept({ colour: TEXT, formulaColour: TEXT }), false, 'the dark theme\'s text colour, as its words');
  assert.equal(mathColourKept({ colour: 'rgb(0, 0, 159)', formulaColour: 'rgb(0, 0, 159)' }), false, 'a link\'s LinkText, which the formula takes');
  assert.equal(mathColourKept({ colour: 'color(srgb 0 0 0.004)', formulaColour: 'rgb(0, 0, 1)' }), false, 'a rounding of the colour model is the same colour');
  assert.equal(mathColourKept({ colour: 'rgb(0, 0, 0)' }), false, 'a formula not read is not judged');
  const [found, ...rest] = judgeForcedColors({
    math: [
      { target: 'div[aria-label="Question"] > math-span', html: '<math-span>2x + 5 = 17</math-span>', colour: 'rgb(0, 0, 0)', formulaColour: 'rgb(255, 255, 255)' },
      { target: 'li > math-span', html: '<math-span>x</math-span>', colour: 'rgb(0, 0, 0)', formulaColour: 'rgb(0, 0, 0)' },
    ],
  });
  assert.equal(rest.length, 0);
  assert.equal(found.id, 'mm-forced-math-colour-kept');
  assert.ok(FORCED_COLORS_RULE_IDS.includes(found.id) && found.help && found.helpUrl && found.impact);
  assert.deepEqual(found.nodes.map((entry) => entry.target[0]), ['div[aria-label="Question"] > math-span'], 'the formula that kept a colour, not the one that follows its words');
  assert.match(found.nodes[0].failureSummary, /rgb\(255, 255, 255\).*rgb\(0, 0, 0\)/, 'and both colours');
});

// The order of a switch decides whether that defect shows: drawn in the new contrast theme and then renamed (as the app
// follows the device, from its media listener) the formula keeps the page's white; renamed at once, the page was
// sometimes drawn both ways in one go, and the self-test's planted formula followed the theme under load. And a formula
// typeset only after the switch, or after the reading, is drawn afresh or not read at all.
test('a standalone page is renamed once drawn in the new contrast theme, and every formula on screen is typeset before the switch and the reading', () => {
  const walk = read('tests/browser/forcedColorsCertification.mjs');
  const switched = region(walk, 'export const useContrastTheme = async', '\n};', 'useContrastTheme');
  const media = switched.indexOf("await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme });");
  const drawn = switched.indexOf('await page.evaluate(DRAWN);');
  const renamed = switched.indexOf('await page.evaluate(THEME_FROM_DEVICE, scheme);');
  assert.ok(media >= 0 && drawn > media && renamed > drawn, 'the device switches, the page is drawn, and then it is renamed');
  assert.match(region(walk, 'const DRAWN = ', '\n});', 'DRAWN'), /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{ document\.documentElement\.getBoundingClientRect\(\); resolve\(\); \}\)\)/, 'drawn: two frames and a layout read');
  // Before the switch, in the run's loop: a scene whose formula is never typeset is not read, and says why.
  const scene = region(walk, 'const scope = sceneScope(screen, scene);', 'for (const scheme of CONTRAST_THEMES)', 'a scene before its switch');
  assert.match(scene, /await waitForFormulas\(page, \{ include: scope\.include, exclude: scope\.exclude \}\);[\s\S]*unreachable\.push\(/);
  // Before each reading, in the audit itself.
  const audit = read('tests/browser/forcedColorsAudit.mjs');
  assert.match(region(audit, 'export const auditForcedColors = async', 'const setup = await page.evaluate(INSTALL', 'a reading'), /await waitForFormulas\(page, \{ include, exclude \}\);\s*$/);
});

// ------------------------------------------------------------------ the coordinate plane
// A plane is an SVG drawing, whose paint forced colours leave alone: under a contrast theme it kept the app theme's
// colours. The walk reads what it paints (forcedColorsAudit.mjs readPlane) and the page's system colours, as Chromium
// resolves them in its emulated dark contrast theme: Canvas black, CanvasText white, GrayText green, Highlight a
// translucent cyan.
const DARK_PALETTE = {
  Canvas: CANVAS, CanvasText: TEXT, LinkText: 'rgb(255, 255, 0)', VisitedText: 'rgb(255, 255, 0)', ActiveText: 'rgb(255, 255, 0)',
  ButtonFace: CANVAS, ButtonText: TEXT, ButtonBorder: TEXT, Field: CANVAS, FieldText: TEXT, Highlight: HIGHLIGHT, HighlightText: CANVAS,
  GrayText: 'rgb(63, 242, 63)',
};
const GRAY = 'rgb(63, 242, 63)';
const planePart = (overrides = {}) => ({ tag: 'line', part: '', fill: 'rgb(0, 0, 0)', stroke: TEXT, fillOpacity: '1', strokeOpacity: '1', strokeWidth: '1px', alpha: 1, ...overrides });
// A plane as the platform draws it under forced colours (src/theme/forcedColors.css).
const themedPlane = () => ({
  target: 'svg[aria-label="Coordinate plane"]',
  html: '<svg data-mm-plane="">',
  board: { background: CANVAS, border: { drawn: true, colour: TEXT } },
  parts: [
    planePart({ tag: 'rect', part: 'paper', fill: CANVAS, stroke: 'none' }),
    planePart({ part: 'grid', stroke: GRAY }),
    planePart({ part: 'axis', stroke: TEXT, strokeWidth: '2px' }),
    planePart({ tag: 'text', fill: TEXT, stroke: CANVAS, strokeWidth: '3px' }),
    planePart({ tag: 'path', part: 'line', fill: 'none', stroke: TEXT, strokeWidth: '3px' }),
    planePart({ tag: 'circle', part: 'point', fill: TEXT, stroke: CANVAS }),
    planePart({ tag: 'circle', part: 'open', fill: CANVAS, stroke: TEXT }),
    planePart({ tag: 'polygon', part: 'shade', fill: TEXT, stroke: 'none' }),
  ],
  focusedParts: [planePart({ part: 'cursor', stroke: HIGHLIGHT })],
  focusRing: { drawn: true, colour: HIGHLIGHT },
});

test('a plane drawn in the app theme\'s colours under forced colours keeps paint of its own; in the theme\'s colours it passes', () => {
  assert.deepEqual(planePaintProblems(themedPlane(), DARK_PALETTE), [], 'the platform\'s plane, and Chromium\'s own translucent Highlight is the theme\'s');
  // As the app theme drew it, which forced colours leave alone: the dark theme's tokens and fixed blues.
  const kept = {
    ...themedPlane(),
    board: { background: 'rgb(27, 30, 37)', border: { drawn: true, colour: 'rgb(46, 58, 80)' } },
    parts: [
      planePart({ tag: 'rect', part: 'paper', fill: 'rgb(23, 26, 32)', stroke: 'none' }),
      planePart({ part: 'grid', stroke: 'rgb(74, 82, 96)' }),
      planePart({ tag: 'path', part: 'line', fill: 'none', stroke: 'rgb(26, 115, 232)' }),
    ],
    focusRing: { drawn: true, colour: 'rgb(168, 199, 250)' },
  };
  const problems = planePaintProblems(kept, DARK_PALETTE).map((problem) => problem.what);
  assert.deepEqual(problems, [
    'the board\'s background not a colour of the theme', 'the board\'s border not a colour of the theme', 'rect (paper) fill not a colour of the theme',
    'line (grid) stroke not a colour of the theme', 'path (line) stroke not a colour of the theme', 'its focus ring not a colour of the theme',
  ]);
});

test('a translucent paint is not drawn reliably by a contrast theme; a pattern is judged by its lines, and paint that is not drawn is not paint', () => {
  // A board that paints nothing of its own and is not focused: only its parts are judged, in whichever theme.
  const plane = (parts) => ({ ...themedPlane(), board: { background: 'rgba(0, 0, 0, 0)', border: { drawn: false } }, parts, focusedParts: [], focusRing: null });
  // A region tinted with the text colour at a quarter, as an app draws a shaded half-plane: a grey of no theme.
  assert.match(planePaintProblems(plane([planePart({ tag: 'polygon', part: 'shade', fill: TEXT, fillOpacity: '0.25', stroke: 'none' })]), DARK_PALETTE)[0]?.what || '', /translucent \(25%\)/);
  // A group's opacity counts too (a dragged marker's ghost).
  assert.match(planePaintProblems(plane([planePart({ tag: 'polygon', fill: TEXT, stroke: 'none', alpha: 0.55 })]), DARK_PALETTE)[0]?.what || '', /translucent \(55%\)/);
  // A pattern's lines are parts of their own; an invisible fill, a stroke no wider than nothing, and a <line>'s fill
  // (black by default, which is no colour of a light theme of cream and grey) are not drawn.
  const DESERT = {
    Canvas: 'rgb(255, 250, 239)', CanvasText: 'rgb(61, 61, 61)', LinkText: 'rgb(28, 94, 117)', VisitedText: 'rgb(28, 94, 117)', ActiveText: 'rgb(28, 94, 117)',
    ButtonFace: 'rgb(255, 250, 239)', ButtonText: 'rgb(61, 61, 61)', ButtonBorder: 'rgb(61, 61, 61)', Field: 'rgb(255, 250, 239)', FieldText: 'rgb(61, 61, 61)',
    Highlight: 'rgb(144, 57, 9)', HighlightText: 'rgb(255, 250, 239)', GrayText: 'rgb(103, 103, 103)',
  };
  assert.deepEqual(planePaintProblems(plane([
    planePart({ tag: 'polygon', fill: 'url("#hatch")', stroke: 'none' }),
    planePart({ tag: 'path', fill: 'rgb(0, 0, 0)', fillOpacity: '0', stroke: 'none' }),
    planePart({ tag: 'path', fill: 'none', stroke: 'rgb(26, 115, 232)', strokeWidth: '0px' }),
    planePart({ tag: 'line', fill: 'rgb(0, 0, 0)', stroke: 'rgb(61, 61, 61)' }),
  ]), DESERT), []);
  assert.equal(planePaintProblems(plane([planePart({ tag: 'circle', fill: 'rgb(0, 0, 0)', stroke: 'none' })]), DESERT).length, 1, 'a circle\'s black fill is drawn, and is no colour of that theme');
  // A plate of the page's own colour, translucent over the page, is still the page.
  assert.deepEqual(planePaintProblems(plane([planePart({ tag: 'rect', part: 'plate', fill: CANVAS, fillOpacity: '0.58', stroke: 'none' })]), DARK_PALETTE), []);
});

test('the paper is the page\'s Canvas, every mark is at 3:1 or more against it, and a focus ring is a colour of the theme other than Canvas', () => {
  const plane = (overrides) => ({ ...themedPlane(), focusedParts: [], ...overrides });
  assert.deepEqual(planePaintProblems(plane({ parts: [planePart({ tag: 'rect', part: 'paper', fill: TEXT, stroke: 'none' })] }), DARK_PALETTE).map((problem) => problem.what), ['rect (paper) fill CanvasText, not Canvas']);
  // A theme whose GrayText is faint on its Canvas: a grid drawn in it is a colour of the theme a student cannot see.
  const faint = { ...DARK_PALETTE, GrayText: 'rgb(40, 40, 40)' };
  assert.match(planePaintProblems(plane({ parts: [planePart({ part: 'grid', stroke: 'rgb(40, 40, 40)' })] }), faint)[0]?.what || '', /^line \(grid\) stroke 1\.\d\d:1 against Canvas$/);
  assert.deepEqual(planePaintProblems(plane({ parts: [], focusRing: { drawn: true, colour: CANVAS } }), DARK_PALETTE).map((problem) => problem.what), ['its focus ring the page\'s own colour']);
  assert.deepEqual(planePaintProblems(plane({ parts: [], focusRing: { drawn: false, colour: 'rgb(26, 115, 232)' } }), DARK_PALETTE), [], 'a ring not drawn is not judged');
});

test('focused, a plane is judged for what focus adds: its crosshair', () => {
  const plane = themedPlane();
  // What it shares with the plane at rest is said once; a crosshair in the app's purple is new.
  const kept = { ...plane, parts: [planePart({ part: 'grid', stroke: 'rgb(74, 82, 96)' })], focusedParts: [planePart({ part: 'grid', stroke: 'rgb(74, 82, 96)' }), planePart({ part: 'cursor', stroke: 'rgb(147, 52, 230)' })] };
  assert.deepEqual(planePaintProblems(kept, DARK_PALETTE).map((problem) => problem.what), ['line (grid) stroke not a colour of the theme', 'focused, line (cursor) stroke not a colour of the theme']);
});

test('one finding per plane, naming what it paints in colours of its own, once per kind', () => {
  const kept = { ...themedPlane(), parts: Array.from({ length: 9 }, () => planePart({ part: 'grid', stroke: 'rgb(74, 82, 96)' })), focusedParts: [] };
  const [found, ...rest] = judgeForcedColors({ planes: [kept, themedPlane()], palette: DARK_PALETTE });
  assert.equal(rest.length, 0);
  assert.equal(found.id, 'mm-forced-plane-paint');
  assert.ok(FORCED_COLORS_RULE_IDS.includes(found.id) && found.help && found.helpUrl && found.impact);
  assert.equal(found.nodes.length, 1, 'the plane that keeps its paint, not the one drawn in the theme\'s colours');
  assert.equal(found.nodes[0].target[0], 'svg[aria-label="Coordinate plane"]');
  assert.equal(found.nodes[0].failureSummary, 'Under forced colours the plane keeps paint of its own: line (grid) stroke not a colour of the theme rgb(74, 82, 96) ×9.');
  assert.deepEqual(judgeForcedColors({ planes: [kept], palette: null }), [], 'nothing judged without the theme\'s colours');
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

test('the walk reads the rounds\' own screens, the student\'s arena, beside the certified scenes', async () => {
  // A Graph Feature Rush round and a Graph the Line round are measured by the large-text runs and were read by no
  // forced-colours walk. The projector and the host console during a round are certified scenes it already reads.
  const { PLANE_SCREENS, screensToWalk } = await import('../browser/forcedColorsCertification.mjs');
  const { CERTIFIED_SCREENS, LIVE_CHALLENGE_ROUND_SCREENS, SCREENS, sceneLabel, screensToRun } = await import('../browser/accessibilityCertification.mjs');
  const labels = (screens) => screens.flatMap((screen) => screen.scenes.map((scene) => sceneLabel(screen, scene)));
  // The run walks what screensToWalk gives it (ONLY, or nothing named).
  assert.match(region(read('tests/browser/forcedColorsCertification.mjs'), 'const main = async () => {', 'const origins = {', 'the run'), /\n {2}const screens = screensToWalk\(ONLY\);\n/);
  const byDefault = labels(screensToWalk(new Set()));
  for (const label of ['graph-feature-rush/round', 'graph-the-line/round', 'live-challenge/lobby', 'live-challenge/round',
    'teacher-live-challenge/round', 'teacher-live-challenge/projector', 'teacher-live-challenge/results']) {
    assert.ok(byDefault.includes(label), `${label} is read`);
  }
  // Every certified scene still (beside the rounds' and the planes'), and the Lab's own-job screens left to the step
  // that names them.
  const added = labels([...LIVE_CHALLENGE_ROUND_SCREENS, ...PLANE_SCREENS]);
  assert.deepEqual(byDefault.filter((label) => !added.includes(label)), labels(screensToRun(new Set(), CERTIFIED_SCREENS)));
  assert.ok(!byDefault.some((label) => label.startsWith('teacher-math-tools-lab/')), 'the Lab\'s tools are their own step\'s');
  // ONLY can name a round, as it names a certified screen.
  assert.deepEqual(labels(screensToWalk(new Set(['graph-the-line']))), ['graph-the-line/round']);
  assert.throws(() => screensToWalk(new Set(['graph-the-lines'])), /ONLY names unknown screen\(s\): graph-the-lines/);
  // The rounds open as the live-challenge screen opens: the app, on the school's clock.
  const live = SCREENS.find((screen) => screen.id === 'live-challenge');
  for (const screen of LIVE_CHALLENGE_ROUND_SCREENS) assert.ok(screen.open === live.open && screen.harness === 'app' && screen.schoolClock, screen.id);
});

// The walk reads every plane in a scene under forced colours (readPlane), with the page's system colours, and the plane
// focused where it is a Tab stop, and judges them (mm-forced-plane-paint). Each reading is from the page as it stands.
test('the walk reads every coordinate plane under forced colours, focused too, and judges it against the page\'s system colours', () => {
  const audit = read('tests/browser/forcedColorsAudit.mjs');
  const install = region(audit, 'export const INSTALL = ', '\n};\n', 'the in-page walk');
  // The planes in scope, outermost only, each read part by part.
  assert.match(install, /const planes = \[\.\.\.new Set\(roots\.flatMap\(\(root\) => \[\.\.\.\(root\.matches\?\.\('\[data-mm-plane\]'\)/);
  const readPlane = region(install, 'const readPlane = (plane) => {', '\n  };\n', 'readPlane');
  assert.match(readPlane, /for \(const el of plane\.querySelectorAll\(PAINTED\)\)/);
  assert.match(readPlane, /fill: c\.fill,\s*stroke: c\.stroke,\s*fillOpacity: c\.fillOpacity,\s*strokeOpacity: c\.strokeOpacity,\s*strokeWidth: c\.strokeWidth,\s*alpha: alphaOf,/);
  // Read in each reading, with the theme's colours; focused, read again.
  assert.match(region(install, 'read: () => ({', '}),', 'a reading'), /planes: planes\.map\(readPlane\),\s*palette: paletteOf\(\),/);
  assert.match(region(install, 'focusReadAll: async () => {', '\n    },\n', 'the focus pass'), /if \(planes\.includes\(el\)\) \{[\s\S]*plane = readPlane\(el\);[\s\S]*\}\s*el\.blur\(\);/);
  // Judged from the forced reading, with its palette.
  const run = region(audit, 'export const auditForcedColors = async', '\n};\n', 'a reading of a scene');
  assert.match(run, /parts: forced\.planes\[i\]\.parts,\s*focusedParts: focused\?\.plane\?\.parts \|\| \[\],/);
  assert.match(run, /judgeForcedColors\(\{ edges, states, focus, math, planes, palette: forced\.palette \}\)/);
  // The colours of the theme it is judged by are the judge's own list.
  assert.match(run, /themeColours: \[\.\.\.PLANE_THEME_COLOURS\]/);
  assert.deepEqual([...PLANE_THEME_COLOURS].sort(), ['ActiveText', 'ButtonBorder', 'ButtonFace', 'ButtonText', 'Canvas', 'CanvasText', 'Field', 'FieldText', 'GrayText', 'Highlight', 'HighlightText', 'LinkText', 'VisitedText']);
});

test('the walk reads every kind of plane on the planes\' page, beside the certified scenes', async () => {
  const { PLANE_SCREENS, WALKED_SCREENS, screensToWalk } = await import('../browser/forcedColorsCertification.mjs');
  const { sceneLabel } = await import('../browser/accessibilityCertification.mjs');
  const labels = (screens) => screens.flatMap((screen) => screen.scenes.map((scene) => sceneLabel(screen, scene)));
  assert.deepEqual(labels(PLANE_SCREENS), ['coordinate-planes', 'graphing-calculator']);
  for (const screen of PLANE_SCREENS) {
    assert.ok(WALKED_SCREENS.includes(screen), `${screen.id} is walked`);
    // On the stubbed server, read for its planes alone.
    assert.equal(screen.harness, 'audit');
    assert.match(screen.include, /\[data-mm-plane\]$/);
  }
  assert.ok(labels(screensToWalk(new Set())).includes('coordinate-planes'), 'a run that names no screen walks them');
  // The page mounts each kind of plane with its real component.
  const page = read('tests/browser/forcedColorsPlanesMain.jsx');
  for (const component of ['CoordinatePlane', 'GraphDisplay', 'FunctionGraphBuilder', 'GraphAnalysis', 'GraphStory', 'GraphFeatureRushGraph', 'LineGraphCanvas', 'LineRevealGraph', 'GraphingCalculatorPanel']) {
    assert.match(page, new RegExp(`<${component}\\b`), `${component} is drawn`);
  }
  // In the state a student sees: points placed and a curve connected, a region shaded, two regions overlapping.
  assert.match(page, /markerPlacements: \{ 'endpoint-0-start': 'closed' \}/);
  assert.match(page, /shading: \[\{ m: 0\.6, b: 1, relation: '<=' \}, \{ m: -0\.6, b: 1, relation: '<' \}\]/);
});

test('a pull request that changes the walk, what it walks or a screen runs the theme certification', () => {
  for (const file of [
    'tests/browser/forcedColorsCertification.mjs', 'tests/browser/forcedColorsAudit.mjs', 'tests/browser/forcedColorsSelfTest.mjs',
    'tests/browser/forcedColors.vite.config.mjs', 'scripts/lib/forcedColors.mjs', 'src/theme/forcedColors.css',
    'tests/browser/forcedColorsPlanes.html', 'tests/browser/forcedColorsPlanesMain.jsx', 'src/tools/shared/CoordinatePlane.jsx',
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
