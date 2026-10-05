/*
 * THE PLOT STAYS IN ITS BOX, AND THE DIRECTIONS ARE SAID ONCE.
 *
 * Student UX pass, R-7 and R-8.
 *
 *   R-8  CoordinatePlane drew `lines` from xMin to xMax whatever the slope, and
 *        `functions` to ±2 units past the window, so y = 2x − 4 on a −6..6
 *        warm-up card ran through the top padding and over the axis numbers.
 *        The mathematics is clipped to the plotting rectangle; the axis
 *        numbers, points and drag handles are not.
 *   R-7  Every interactive plane printed four lines of directions under
 *        itself; three planes in one tool printed them three times. The first
 *        interactive plane in a ToolShell now shows one line, with keyboard
 *        and zoom detail folded; the rest show none. Screen-reader
 *        instructions stay on every plane.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const plane = read('src/tools/shared/CoordinatePlane.jsx');
const svg = plane.slice(plane.indexOf('<svg'), plane.indexOf('</svg>'));

// The clip groups, in order, and what sits outside every one of them.
const clipGroups = [...svg.matchAll(/<g clipPath=\{plotClip\}>([\s\S]*?)<\/g>\s*(?=\n\s*\n|\{)/g)].map((match) => match[1]);

test('the plotting rectangle is a clip path with a url-safe id', () => {
  assert.match(plane, /const clipId = `mm-plot-clip-\$\{useId\(\)\.replace\(\/\[\^a-zA-Z0-9_-\]\/g, ''\)\}`;/);
  assert.match(svg, /<clipPath id=\{clipId\}>\s*<rect x=\{pad\} y=\{pad\} width=\{innerW\} height=\{innerH\} \/>\s*<\/clipPath>/);
});

test('lines, curves, regions and polylines are drawn inside the clip', () => {
  const clipped = clipGroups.join('\n');
  for (const drawing of ['regions.map(', 'verticalLines.map(', 'horizontalLines.map(', 'functions.map(', 'lines.map(', 'polylines.map(']) {
    assert.ok(clipped.includes(drawing), `${drawing} must be inside <g clipPath={plotClip}>`);
  }
});

test('axis numbers, points and handles are never clipped away', () => {
  const clipped = clipGroups.join('\n');
  for (const border of ['xTicks.filter(', 'yTicks.filter(', 'points.map(', 'preview && chip']) {
    assert.ok(!clipped.includes(border), `${border} must stay outside the clip`);
    assert.ok(svg.includes(border), `${border} still drawn`);
  }
});

test('a tool that draws its own curves is handed the clip', () => {
  assert.match(plane, /children\(\{ sx, sy, pad, innerW, innerH, width, height, plotClip \}\)/);
  assert.match(read('src/components/student/PathQuestionStimulus.jsx'), /\(\{ sx, sy, plotClip \}\) => curves\.map\([\s\S]*?clipPath=\{plotClip\}/);
  // The student-build inequality graph hands it to the layers it draws (its
  // shading, the overlap and the boundaries) — and they draw inside it.
  assert.match(read('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'), /\(\{ sx, sy, plotClip \}\) => \(\s*<InequalityGraphLayers\b[^>]*?\bplotClip=\{plotClip\}/);
  const layers = read('src/tools/systemsWorkspace/InequalityBuildPanels.jsx');
  const graphLayers = layers.slice(layers.indexOf('export function InequalityGraphLayers('));
  assert.match(graphLayers, /return \(\s*<>\s*<g clipPath=\{plotClip\}>[\s\S]*?polygon[\s\S]*?<line key=\{`line\$\{index\}`\}[\s\S]*?<\/g>/, 'shading, overlap and boundaries are clipped');
});

test('plotting directions: one line, keyboard help on keyboard focus, once per tool', () => {
  const help = plane.slice(plane.indexOf('<div className="mathmaster-plot-help"'), plane.indexOf(') : null}\n        </>'));
  assert.match(help, /Press the grid and slide to aim/);
  // A tool whose current step says beside the plane what a tap does asks for
  // 'keyboard' only: no standing gesture line, the keyboard sentence on focus.
  assert.match(plane, /\{showPlotHelpHere && \(showPlotHelp !== 'keyboard' \|\| keyboardHelpVisible\) \? \(\s*<div className="mathmaster-plot-help"/);
  assert.match(help, /\{showPlotHelp === 'keyboard' \? null : \(\s*<p[^>]*>\s*Press the grid and slide to aim/);
  assert.match(read('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'), /<CoordinatePlane[\s\S]*?showPlotHelp="keyboard"/);
  // Not a folded row (a third 44px fold under Sequence Explorer's plane failed
  // the tool-open audit): the keyboard sentence shows while the plane has
  // keyboard focus, which is when a sighted keyboard user needs it.
  assert.match(help, /\{keyboardHelpVisible \? \(\s*<p[^>]*>\s*The arrow keys move the\s*\n?\s*crosshair/, 'the keyboard gesture is still described');
  assert.doesNotMatch(help, /QuietDisclosure/);
  assert.match(svg, /onFocus=\{\(event\) => \{[\s\S]*?event\.currentTarget\.matches\(':focus-visible'\)[\s\S]*?setKeyboardHelpVisible\(true\)/);
  assert.match(svg, /onBlur=\{\(\) => setKeyboardHelpVisible\(false\)\}/);
  assert.match(plane, /const showPlotHelpHere = usePlotHelpSlot\(interactive && showPlotHelp\);/);
  const shell = read('src/tools/shared/ToolShell.jsx');
  // One scope per tool: everything in the shell's body is inside it. (The body
  // also provides the tool's description to its TaskCard, PQ-023.)
  const body = shell.slice(shell.indexOf('<div className="mathmaster-tool-shell-body"'));
  assert.match(body.slice(0, body.indexOf('</div>')), /^<div className="mathmaster-tool-shell-body"[^>]*>(?:<[A-Za-z.]+[^>]*>)*<PlotHelpScope>\{children\}<\/PlotHelpScope>/);
  // A screen reader keeps its instructions on every plane, deduplicated or not.
  assert.match(svg, /aria-label=\{interactive \? `\$\{ariaLabel\}\. Click to plot, or use the arrow keys to move the crosshair and Enter to plot\.`/);
});

test('the help scope gives the directions to the first plane that asks, and passes them on', () => {
  const scope = read('src/tools/shared/plotHelpScope.js');
  assert.match(scope, /claimsRef\.current = \[\.\.\.claimsRef\.current, id\];\s*setOwner\(claimsRef\.current\[0\] \?\? null\);/);
  assert.match(scope, /claimsRef\.current = claimsRef\.current\.filter\(\(entry\) => entry !== id\);\s*setOwner\(claimsRef\.current\[0\] \?\? null\);/, 'an unmounted plane hands the directions to the next');
  assert.match(scope, /if \(!scope\) return true;\s*return scope\.owner === id;/, 'outside a tool shell every plane keeps its directions');
});
