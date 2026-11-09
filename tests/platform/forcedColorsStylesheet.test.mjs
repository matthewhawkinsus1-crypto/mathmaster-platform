/*
 * FORCED COLOURS (WINDOWS' CONTRAST THEMES): THE STYLESHEET AND ITS HOOKS.
 *
 * A contrast theme draws every page in a few system colours: every background
 * as Canvas, no box-shadow, no gradient. src/theme/forcedColors.css gives back
 * what that takes from MathMaster's screens: an edge for every button, the
 * system's highlight for a selected, pressed or current control, a drawn
 * progress bar, the Live Class question strip's colours, and every coordinate
 * plane and every other drawing that says something in the theme's colours,
 * with what only colour told apart told apart by its fill, on a wheel and in
 * its key.
 * This file holds the stylesheet to "nothing changes without forced colours,
 * and only system colours", its two kinds of rule to their place against the
 * page's focus ring, and the screens to the hooks it styles. What the rules do
 * on a page is measured by tests/browser/forcedColorsCertification.mjs, on the
 * certified scenes, under forced colours dark and light.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseCss } from './helpers/cssRules.mjs';
import { region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// ------------------------------------------------------------------ the stylesheet
const SHEET = 'src/theme/forcedColors.css';
const rules = parseCss(read(SHEET));
const SYSTEM_COLOURS = new Set(['Canvas', 'CanvasText', 'Highlight', 'HighlightText', 'ButtonText', 'ButtonFace', 'ButtonBorder', 'LinkText', 'GrayText', 'Field', 'FieldText', 'Mark', 'MarkText', 'AccentColor', 'AccentColorText', 'SelectedItem', 'SelectedItemText', 'VisitedText', 'ActiveText']);
const COLOUR_PROPERTIES = /^(color|background(-color)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule(-color)?|mask(-image)?|-webkit-text-stroke(-color)?)$/;

test('nothing changes without forced colours: every rule of the stylesheet is inside its media query', () => {
  assert.ok(rules.length >= 8, `${SHEET} is expected to hold the forced-colours rules`);
  const outside = rules.filter((rule) => !rule.atRules.some((atRule) => /^@media \(forced-colors: active\)$/.test(atRule)));
  assert.deepEqual(outside.map((rule) => rule.selectors.join(', ')), []);
  // And the platform loads it: every page that takes index.css.
  assert.match(read('src/index.css'), /^@import '\.\/theme\/forcedColors\.css';$/m);
});

test('it paints only in system colours: no hex, rgb(), hsl(), named colour or app token', () => {
  const offenders = [];
  for (const rule of rules) {
    for (const [property, { value }] of Object.entries(rule.declarations)) {
      if (!COLOUR_PROPERTIES.test(property)) continue;
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|var\(/i.test(value)) offenders.push(`${rule.selectors[0]} { ${property}: ${value} }`);
      const words = value.split(/[\s,()]+/).filter((word) => /^[a-z]+$/i.test(word));
      const colours = words.filter((word) => !/^(solid|dashed|dotted|double|none|inherit|transparent|currentcolor|auto|thin|medium|thick)$/i.test(word));
      colours.filter((word) => !SYSTEM_COLOURS.has(word)).forEach((word) => offenders.push(`${rule.selectors[0]} { ${property}: ${value} } (${word})`));
    }
  }
  assert.deepEqual(offenders, []);
});

test('forced-color-adjust: none only where a control must be painted in system colours or a drawing keeps its own', () => {
  // Each opt-out, and why (the stylesheet says it at length):
  //   a selected / pressed / current control: Chromium paints a Canvas plate behind text under forced colours, so
  //     HighlightText on Highlight is only readable out of forced adjustment, painted in system colours only;
  //   the Live Class question strip: its colours are what each question's bar means;
  //   a colour key's swatch: drawn as the part of the wheel it explains, in system colours (a fill or a hatch, which
  //     forced colours drop unless the swatch opts out);
  //   a Live Challenge status dot (a student's presence on the roster, "Reconnecting…"): its colour is what it says;
  //   the start lights: a lit pod's red or green is what it says;
  //   the checkered flag: a gradient, which forced colours drop unless the drawing opts out (painted in system colours).
  const optedOut = rules.filter((rule) => rule.declarations['forced-color-adjust']?.value === 'none');
  const reasons = optedOut.map((rule) => {
    const selector = rule.selectors.join(', ');
    if (/\[aria-current\]:not\(\[aria-current="false"\]\)/.test(selector) && /\[aria-pressed="true"\]/.test(selector)) return 'selected control';
    if (selector === '[data-question-state]') return 'question strip';
    if (selector === '[data-mm-swatch]') return 'colour key swatch';
    if (selector === '[data-mm-status-dot]') return 'status dot';
    if (selector === '[data-mm-start-lights] > *') return 'start lights';
    if (selector === '.mm-gp-flagged::before, .mm-gp-checker') return 'checkered flag';
    return `unexplained: ${selector}`;
  });
  assert.deepEqual([...reasons].sort(), ['checkered flag', 'colour key swatch', 'question strip', 'selected control', 'start lights', 'status dot']);
  // What keeps its own colour still shows on either theme: an edge in the theme's text colour (a gold dot, an amber bar
  // on a light theme's white; a dark pod on a dark theme's black).
  for (const reason of ['status dot', 'start lights']) {
    const rule = optedOut[reasons.indexOf(reason)];
    assert.equal(rule.declarations.outline?.value, '1px solid CanvasText', `${reason}: a CanvasText edge`);
  }
  // The flag is drawn again in the theme's own two colours, not its own: a checker of Canvas and CanvasText.
  const flag = optedOut[reasons.indexOf('checkered flag')];
  assert.match(flag.declarations.background?.value || '', /^repeating-conic-gradient\(CanvasText 0 25%, Canvas 0 50%\)/);
  assert.ok(flag.declarations.background.important, 'over the theme\'s own flag, which a later <style> sets');
  // The selected control, out of forced adjustment, sets every colour it paints.
  const selected = optedOut.find((rule) => /\[aria-pressed="true"\]/.test(rule.selectors.join(', ')));
  for (const property of ['background', 'color', 'border-color', 'outline-color', 'box-shadow']) {
    assert.ok(selected.declarations[property]?.important, `the selected control sets ${property}`);
  }
});

// A selector's specificity, and which of two wins (the rules here are weighed against the page's focus ring).
const specificity = (selector) => {
  // Enough of the specificity algorithm for these selectors: :is/:not take their most specific argument.
  const inner = (text) => {
    let ids = 0; let classes = 0; let types = 0;
    let rest = text;
    rest = rest.replace(/:(is|not|where)\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g, (match, kind, args) => {
      if (kind === 'where') return '';
      const best = args.split(/,(?![^(]*\))/).map((arg) => inner(arg.trim())).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];
      ids += best[0]; classes += best[1]; types += best[2];
      return ' ';
    });
    ids += (rest.match(/#[\w-]+/g) || []).length;
    classes += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
    types += (rest.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return [ids, classes, types];
  };
  return inner(selector);
};
const above = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

test('a button keeps an edge and a focused selected control a system-colour ring, each more or less specific than the page\'s focus ring as it must be', () => {
  // The page's focus ring (index.css) is (0,5,1). The edge outline must lose to it (a focused button shows the ring);
  // the selected control's ring colour must win over it (out of forced adjustment the ring would be the app's colour).
  const pageRing = rules.length && parseCss(read('src/index.css')).find((rule) => rule.selectors.some((selector) => selector.endsWith(':focus-visible') &&/\[tabindex\]:not\(\[tabindex="-1"\]\)/.test(selector)) && rule.declarations.outline?.important);
  assert.ok(pageRing, 'index.css draws the page\'s focus ring');
  const ring = specificity(pageRing.selectors[0]);
  assert.deepEqual(ring, [0, 5, 1]);
  const edge = rules.find((rule) => rule.declarations.outline?.value === '1px solid ButtonText');
  assert.ok(edge, 'every button gets a ButtonText edge');
  assert.ok(above(specificity(edge.selectors[0]), ring) < 0, 'a focused button shows the page\'s ring, not its edge');
  const selectedRing = rules.find((rule) => rule.selectors[0].endsWith(':focus-visible') && rule.declarations['outline-color']);
  assert.ok(selectedRing, 'a focused selected control has a ring colour of its own');
  assert.ok(above(specificity(selectedRing.selectors[0]), ring) > 0, 'its colour wins over the page ring\'s app colour');
  assert.ok(SYSTEM_COLOURS.has(selectedRing.declarations['outline-color'].value));
});

// ------------------------------------------------------------------ hooks
const walk = (dir, out = []) => {
  for (const entry of readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })) {
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(file);
  }
  return out;
};

test('every hook the stylesheet styles is set by a screen: a rule nothing matches is a fix that does nothing', () => {
  const hooks = [...new Set(rules.flatMap((rule) => rule.selectors.join(' ').match(/\[data-mm-[\w-]+|\[data-question-state/g) || []).map((hook) => hook.slice(1)))];
  assert.ok(hooks.length >= 5, `hooks found: ${hooks.join(', ')}`);
  const sources = walk('src').map((file) => read(file)).join('\n');
  const unset = hooks.filter((hook) => !new RegExp(`\\b${hook}=`).test(sources));
  assert.deepEqual(unset, [], 'hooks the stylesheet styles that no screen sets');
});

test('a progress bar names its track and its fill, and a session\'s steps say which is done, current or to come', () => {
  const weekly = region(read('src/components/student/WeeklyPathGoalPanel.jsx'), 'export function WeeklyProgressBar', '\n}\n', 'the weekly bar');
  const track = region(weekly, 'role="progressbar"', 'style={{', 'its track');
  assert.match(track, /data-mm-progress-track=""/);
  assert.match(region(weekly, track, '/>', 'its fill'), /data-mm-progress-fill=""/);
  const player = read('src/components/student/PathSessionPlayer.jsx');
  const steps = region(player, 'aria-label="Progress through this session"', '</div>', 'the session\'s steps');
  // The same three states the step's own fill draws: done, the one being worked, to come.
  assert.match(steps, /data-mm-progress-step=\{index < done \? 'done' : index === done \? 'current' : 'todo'\}/);
  assert.match(steps, /background: index < done \? [^:]+ : index === done \? /, 'the fill it stands for is keyed the same way');
});

test('a Live Class strip bar carries the state the projector may show, never the hidden one', () => {
  const strip = region(read('src/components/teacher/LiveClassMonitor.jsx'), 'function ProgressStrip(', '\n}\n', 'the question strip');
  // `states` is the string after concealment: on the projector an omitted item is drawn as an untouched one, and its
  // attribute must not tell a classmate otherwise.
  assert.match(strip, /const states = conceal\s*\?[^;]*replaceAll\(QUESTION_STATE_CHARS\.NOT_REQUIRED, QUESTION_STATE_CHARS\.UNTOUCHED\)/);
  assert.match(strip, /\[\.\.\.states\]\.map\(\(character, index\) =>[\s\S]*data-question-state=\{character\}/);
});

test('the mastery wheel\'s colour key, its topic list and the topic browser mark their swatches with the fill of the level each explains', () => {
  // Under a contrast theme the wheel tells its levels apart by their fills (below), so a swatch is drawn as its level's
  // wedge is: the key names the fill of the very status whose colour it shows.
  const key = region(read('src/components/student/MyMathPathDashboard.jsx'), '<strong>What the colours mean</strong>', 'numbers around the wheel', 'the colour key');
  assert.match(key, /\{Object\.entries\(MASTERY_STATUS_COLORS\)\.map\(\(\[status, color\]\) => \([\s\S]*data-mm-swatch=\{MASTERY_STATUS_FILLS\[status\]\} style=\{\{ width: 11, height: 11, borderRadius: 999, background: color/);
  // The two round-done dots: a practice round's an empty ring, a Level 3 round's solid, as the wheel's badges.
  assert.match(key, /<span data-mm-swatch="ring" style=\{\{ color: 'var\(--mm-success-text\)'[^}]*\}\}>●<\/span> practice round done/);
  assert.match(key, /<span data-mm-swatch="point" style=\{\{ color: 'var\(--mm-accent-text\)'[^}]*\}\}>●<\/span> Level 3 \(stretch\) round done/);
  const list = region(read('src/components/student/MyMathPathWheel.jsx'), '{arc.members.map((entry) => {', '</ul>', 'the topic list');
  assert.match(list, /data-mm-swatch=\{MASTERY_STATUS_FILLS\[status\] \|\| MASTERY_STATUS_FILLS\[NOT_ENOUGH_EVIDENCE\]\} style=\{\{[^}]*background: MASTERY_STATUS_COLORS\[status\]/);
  const browser = read('src/components/student/MyMathPathTopicBrowser.jsx');
  assert.match(region(browser, '<span data-mastery-status', '</span>', 'the mastery chip'), /data-mm-swatch=\{MASTERY_STATUS_FILLS\[skill\.masteryStatus\] \|\| 'open'\} style=\{\{[^}]*background: skill\.masteryColor/);
});

// ------------------------------------------------------------------ Live Challenge
// A Live Challenge draws its meters, dots, lights and flags with fills and gradients, which a contrast theme does not
// draw. Each is named for the stylesheet with a data attribute (the rounds' layout is another batch's: the screens
// only gain attributes), or reached by the class the theme already gives it.
const LIVE = 'src/components/liveChallenge';
const live = (file) => read(`${LIVE}/${file}`);
// What the stylesheet's rule for exactly this selector declares for a property ({ value, important }), or undefined.
const declares = (selector, property) => rules.find((rule) => rule.selectors.includes(selector) && rule.declarations[property])?.declarations[property];

test('a Live Challenge\'s round meters say which round is done, being played or to come, as their fills do', () => {
  // The projector's meter across its header.
  const meter = region(live('LiveChallengeArenaProjector.jsx'), 'function RoundProgress(', '\n}\n', 'the projector\'s round meter');
  assert.match(meter, /data-mm-progress-step=\{complete \? 'done' : active \? 'current' : 'todo'\}/);
  assert.match(meter, /background: complete \? [^:]+ : active \? /, 'the fill it stands for is keyed the same way');
  // A student's own round, under its clock.
  const pips = region(live('LiveChallengeStudent.jsx'), 'Array.from({ length: Math.max(1, Number(room.roundCount) || 1) })', '</div>', 'a student\'s round pips');
  assert.match(pips, /data-mm-progress-step=\{pip < roundIndex \? 'done' : pip === roundIndex \? 'current' : 'todo'\}/);
  assert.match(pips, /background: pip < roundIndex \? [^:]+ : pip === roundIndex \? /, 'keyed as its fill is');
  // Both are drawn by the step rules: done filled, the current one ringed.
  assert.equal(declares('[data-mm-progress-step="done"]', 'background-color')?.value, 'Highlight');
  assert.equal(declares('[data-mm-progress-step="current"]', 'outline-width')?.value, '2px');
});

test('a Live Challenge\'s bars name their track and fill: the projector\'s "Locked in", each racer\'s, a rush round\'s pause', () => {
  const lockedIn = region(live('LiveChallengeArenaProjector.jsx'), '<span>Locked in</span>', 'Scores update as answers lock.', 'the projector\'s Locked in bar');
  assert.match(lockedIn, /<div data-mm-progress-track="" style=\{\{[^}]*\}\}>\s*<div data-mm-progress-fill="" style=\{\{ width: `\$\{answeredShare\}%`/);
  const race = region(live('GraphFeatureRushHost.jsx'), 'export function RushRaceBoard(', '\n}\n', 'the race board');
  assert.match(race, /<span aria-hidden="true" data-mm-progress-track="" style=\{\{[^}]*\}\}>\s*<span data-mm-progress-fill="" style=\{\{[^}]*width: `\$\{Math\.round\(\(valueOf\(row\) \/ top\) \* 100\)\}%`/);
  // A rush round's pause after misses (Graph Feature Rush, Graph the Line): a track and the span that drains inside it,
  // reached by their own classes.
  const track = rules.find((rule) => rule.declarations.outline?.value === '1px solid CanvasText' && rule.selectors.some((selector) => selector.includes('[data-mm-progress-track]')));
  const fill = rules.find((rule) => rule.declarations['background-color']?.value === 'Highlight' && rule.selectors.some((selector) => selector.includes('[data-mm-progress-fill]')));
  for (const [file, name] of [['GraphFeatureRushRound.jsx', 'mm-rush-cooldown'], ['LineGraphRound.jsx', 'mm-line-cooldown']]) {
    const source = live(file);
    assert.match(source, new RegExp(`<div className="${name}" role="status"[^>]*>\\s*<span key=`), `${file}: the pause is a track with its fill inside`);
    assert.match(source, new RegExp(`\\.${name} > span \\{[^}]*background: #`), `${file}: its fill is a fill`);
    assert.ok(track.selectors[0].includes(`.${name}`) && fill.selectors[0].includes(`.${name} > span`), `${file}: drawn as a bar`);
  }
});

test('every Live Challenge status dot is named, and keeps its colour with an edge', () => {
  // Every dot: the shell's (.mm-shell-dot), the pulsing ones (.mm-shell-pulse) and the projector's (.mm-arena-pulse).
  const dots = [];
  for (const file of readdirSync(new URL(`../../${LIVE}`, import.meta.url)).filter((name) => name.endsWith('.jsx'))) {
    for (const tag of live(file).match(/<span\b[^>]*className="[^"]*\b(?:mm-shell-dot|mm-shell-pulse|mm-arena-pulse)\b[^"]*"[^>]*\/>/g) || []) dots.push({ file, tag });
  }
  // "Round live", the roster's, "Reconnecting…", the lobby's players in, the projector's "Waiting for teacher to start".
  assert.ok(dots.length >= 5, `dots found: ${dots.map((dot) => dot.file).join(', ')}`);
  assert.deepEqual(dots.filter((dot) => !/\bdata-mm-status-dot=""/.test(dot.tag)).map((dot) => `${dot.file}: ${dot.tag}`), []);
  // The roster's dot is the one whose colour says the most: each presence its own.
  const roster = region(live('ChallengeHostConsole.jsx'), 'export function HostRosterPanel(', '\n}\n', 'the roster');
  assert.match(roster, /data-mm-status-dot="" style=\{\{ background: presenceColor\(presence\) \}\}/);
  assert.equal(declares('[data-mm-status-dot]', 'forced-color-adjust')?.value, 'none');
});

test('the start lights, the checkered flags and the projector\'s cover are drawn again', async () => {
  // The lights: a pod has data-on only while it is lit, so an unlit one is the empty ring.
  const lights = live('StartLights.jsx');
  assert.match(lights, /<span className="mm-gp-lights" aria-hidden="true" data-mm-start-lights=/);
  assert.equal((lights.match(/<span className="mm-gp-light" data-on=\{pods\[\d\] \|\| undefined\} \/>/g) || []).length, 3);
  assert.equal(declares('[data-mm-start-lights] > :not([data-on])', 'background')?.value, 'Canvas');
  // The flags: the Grand Prix theme draws both with a gradient only, which forced colours drop.
  const { GRAND_PRIX_CSS } = await import('../../src/components/liveChallenge/grandPrixTheme.js');
  const theme = parseCss(GRAND_PRIX_CSS);
  for (const selector of ['.mm-gp-flagged::before', '.mm-gp-checker']) {
    const own = theme.find((rule) => rule.selectors.includes(selector) && rule.declarations.background);
    assert.match(own?.declarations.background.value || '', /^repeating-conic-gradient\(/, `${selector}: the theme's flag is a gradient`);
    assert.ok(rules.some((rule) => rule.selectors.includes(selector) && rule.declarations['forced-color-adjust']?.value === 'none'), `${selector}: drawn again under forced colours`);
  }
  assert.match(live('ChallengeStudentShell.jsx'), /const CARD = 'mm-gp-card mm-gp-flagged';/);
  assert.match(live('LiveChallengeStudent.jsx'), /<span className="mm-gp-checker" aria-hidden="true"/);
  // The projector: a layer over the whole page whose cover is gradients alone, so the console showed through it.
  const shell = region(live('LiveChallengeArenaProjector.jsx'), '<div ref={shellRef} className="mm-arena-shell"', '<ChallengeShellStyles />', 'the projector\'s layer');
  assert.match(shell, /data-mm-arena-stage=\{/);
  assert.match(shell, /position: 'fixed',\s*inset: 0,/);
  assert.match(shell, /background: 'radial-gradient\([^']*linear-gradient\([^']*\)',/, 'its cover is gradients, which forced colours drop');
  const cover = declares('[data-mm-arena-stage]', 'background-color');
  assert.equal(cover?.value, 'Canvas');
  assert.ok(cover.important, 'over the layer\'s own background');
});

// MathLive has a formula take the colour of its words (preserve-parent-color, in its shadow root). Under a colour of the
// screen's own, a switch from a dark contrast theme to a light one left the projector's formulas white on the light
// theme's white page (forcedColorsCertification.mjs, mm-forced-math-colour-kept). The two screens that paint their own
// look give their mathematics the theme's text colour; nowhere else is mathematics recoloured.
test('the Live Challenge projector and a student\'s page draw their mathematics in the theme\'s text colour, outside links and controls', () => {
  const mathRules = rules.filter((rule) => rule.selectors.some((selector) => /\bmath-(span|div)\b/.test(selector)));
  assert.equal(mathRules.length, 1, 'one rule colours mathematics');
  const [rule] = mathRules;
  assert.deepEqual(Object.keys(rule.declarations), ['color']);
  assert.equal(rule.declarations.color.value, 'CanvasText');
  assert.ok(!rule.declarations.color.important, 'inside a selected choice its HighlightText (!important) still wins');
  assert.equal(rule.selectors.length, 1);
  const [selector] = rule.selectors;
  // Only on the two screens: app-wide it would recolour mathematics in a link or a disabled control.
  assert.match(selector, /^:is\(\[data-mm-arena-stage\], \.mm-gp-arena-page\) :is\(math-span, math-div\):not\(/);
  // Never inside a link or a control, whose words the theme draws in colours of their own.
  const outside = /:not\(:is\(([^()]*)\) \*\)$/.exec(selector)?.[1].split(/,\s*/) || [];
  for (const control of ['a', 'button', '[role="button"]', '[role="link"]', '[role="radio"]', '[role="checkbox"]', '[role="option"]', '[role="tab"]', '[role="switch"]']) {
    assert.ok(outside.includes(control), `not inside ${control}`);
  }
  // Each screen carries its hook: the projector's layer, and the page a student plays on.
  assert.match(region(live('LiveChallengeArenaProjector.jsx'), '<div ref={shellRef} className="mm-arena-shell"', '<ChallengeShellStyles />', 'the projector\'s layer'), /data-mm-arena-stage=\{/);
  assert.match(live('LiveChallengeStudent.jsx'), /<div className="mm-gp-arena-page" style=\{\{/, 'a student\'s page');
});

// ------------------------------------------------------------------ the Math Tools Lab
test('a box whose edge was its fill keeps one: the Regression Calculator\'s expression rows', () => {
  // The forced-colours walk over the Math Tools Lab found it, in the tool and in its Work View: each expression's box is
  // drawn with no border, and in the dark theme the field colour every box gets is its only edge.
  const tool = parseCss(read('src/tools/regressionCalculator/RegressionCalculator.css'));
  assert.equal(tool.find((rule) => rule.selectors.includes('.regression-expression-row input'))?.declarations.border?.value, '0');
  const darkField = parseCss(read('src/index.css')).find((rule) => rule.selectors.some((selector) => selector.startsWith(':root[data-theme=\'dark\'] #root :is(input')));
  assert.match(darkField?.declarations.background?.value || '', /^var\(--mm-input-bg\)$/, 'the dark theme fills every box');
  assert.match(region(read('src/tools/regressionCalculator/RegressionCalculator.jsx'), '<div className="regression-expression-row">', '/>', 'an expression row'), /<input\s+id=\{`regression-\$\{row\.id\}`\}\s+aria-label=\{`Expression \$\{rowIndex \+ 1\}`\}/);
  // Under forced colours that fill is the page's: the box gets the buttons' line, inset so nothing moves, in a system
  // colour, and less specific than the page's focus ring, which a focused box shows instead.
  const edge = rules.find((rule) => rule.selectors.includes('.regression-expression-row input'));
  assert.equal(edge?.declarations.outline?.value, '1px solid CanvasText');
  assert.equal(edge.declarations['outline-offset']?.value, '-1px');
  assert.ok(edge.declarations.outline.important, 'over the tool\'s own outline');
  assert.ok(above(specificity(edge.selectors[0]), [0, 5, 1]) < 0, 'a focused box shows the page\'s ring');
});

// ------------------------------------------------------------------ the coordinate plane
// A plane is an SVG drawing: Chromium gives every <svg> forced-color-adjust: preserve-parent-color, so forced colours
// leave its paint alone, and it kept the app theme's colours under a contrast theme. The stylesheet draws every plane
// (data-mm-plane) in the theme's colours, by its tokens and its parts (data-mm-plane-part); the forced-colours walk reads
// what each plane paints (mm-forced-plane-paint). These hold the rules and the hooks to each other.
const SYSTEM_VALUE = /^(Canvas|CanvasText|GrayText|Highlight)$/;
const planeTokenRule = (selector) => rules.find((rule) => rule.selectors.includes(selector) && Object.keys(rule.declarations).some((name) => name.startsWith('--mm-')));

test('a plane\'s own colours, under forced colours, are the theme\'s: the graph tokens and every token a Live Challenge round sets on its shell', async () => {
  // The app theme's graph tokens (both themes), and the page's focus ring, which every plane draws.
  const tokens = [...new Set(read('src/theme/tokens.css').match(/--mm-graph-[\w-]+(?=:)/g))];
  assert.ok(tokens.length >= 6, `graph tokens: ${tokens.join(', ')}`);
  const root = planeTokenRule(':root');
  assert.ok(root, 'one rule redefines them on the page');
  for (const name of [...tokens, '--mm-focus']) {
    const declared = root.declarations[name];
    assert.ok(declared, `${name} is redefined`);
    assert.match(declared.value, SYSTEM_VALUE, `${name}: a system colour`);
    assert.ok(declared.important, `${name}: over the theme's own (:root[data-theme='dark'])`);
  }
  // A round's shell sets its own tokens (grandPrixTheme.js; the line round's label tokens beside them): each is a
  // system colour there too, so a mark a round adds later cannot keep its neon.
  const { ARENA_RUSH_VARS, ARENA_LINE_VARS } = await import('../../src/components/liveChallenge/grandPrixTheme.js');
  const names = (text) => String(text).split(';').map((entry) => entry.trim().split(':')[0].trim()).filter(Boolean);
  const lineShellCss = region(read('src/components/liveChallenge/LineGraphRound.jsx'), '.mm-line-shell {', '\n}', 'the line round\'s shell');
  for (const [selector, set] of [['.mm-rush-shell', names(ARENA_RUSH_VARS)], ['.mm-line-shell', [...names(ARENA_LINE_VARS), ...(lineShellCss.match(/--mm-line-[\w-]+(?=:)/g) || [])]]]) {
    const own = rules.filter((rule) => rule.selectors.includes(selector) && Object.keys(rule.declarations).some((name) => name.startsWith('--mm-')));
    for (const name of new Set(set)) {
      const declared = own.map((rule) => rule.declarations[name]).find(Boolean);
      assert.ok(declared, `${selector} ${name} is redefined`);
      assert.match(declared.value, SYSTEM_VALUE, `${selector} ${name}: a system colour`);
      assert.ok(declared.important, `${selector} ${name}: over the shell's own`);
    }
  }
});

test('the board is the page\'s Canvas and every word on a plane the text colour; nothing a plane paints is left to its own colours', () => {
  const board = rules.find((rule) => rule.selectors.includes('[data-mm-plane]') && rule.declarations['background-color']);
  assert.equal(board?.declarations['background-color']?.value, 'Canvas');
  assert.ok(board.declarations['background-color'].important, 'over the board\'s own background, set inline');
  assert.equal(board.declarations['box-shadow']?.value, 'none');
  assert.equal(board.declarations.color?.value, 'CanvasText', 'what is drawn in currentColor');
  const words = rules.find((rule) => rule.selectors.includes('[data-mm-plane] text'));
  assert.equal(words?.declarations.fill?.value, 'CanvasText');
  assert.ok(words.declarations.fill.important && words.declarations.opacity?.value === '1', 'opaque, over a label\'s own fill');
});

// The parts the stylesheet draws, and the parts the planes name: each named part is drawn, and each drawn part is named.
const PART = /\[data-mm-plane-part="([\w-]+)"\]/g;
const styledParts = () => new Set(rules.flatMap((rule) => [...rule.selectors.join(' ').matchAll(PART)].map((match) => match[1])));
// A part's name is written in the markup, chosen in it (`{held ? 'held' : 'point'}`), or taken from a drawing's fills
// (`PLANE_FILLS`, `MASTERY_STATUS_FILLS`: a level's or a plane's fill under a contrast theme).
const namedParts = () => {
  const found = new Map();
  for (const file of walk('src')) {
    const source = read(file);
    if (!/data-mm-plane-part|markPlanePart\(|const [A-Z_]+_FILLS = /.test(source)) continue;
    for (const match of source.matchAll(/data-mm-plane-part=(?:"([\w-]+)"|\{([^}]*)\})|markPlanePart\([^,]+,\s*'([\w-]+)'\)|const (?:planePart|[A-Z_]+_FILLS) = ([^;]+);/g)) {
      const words = match[1] || match[3] ? [match[1] || match[3]] : [...String(match[2] || match[4]).matchAll(/'([\w-]+)'/g)].map((word) => word[1]);
      words.forEach((word) => found.set(word, [...(found.get(word) || []), file]));
    }
  }
  return found;
};

test('every part of a plane the stylesheet draws is one a plane names, and every part a plane names is drawn', () => {
  const styled = styledParts();
  const named = namedParts();
  assert.ok(styled.size >= 12, `parts drawn: ${[...styled].join(', ')}`);
  assert.deepEqual([...styled].filter((part) => !named.has(part)), [], 'drawn by the stylesheet, named by no plane');
  assert.deepEqual([...named.keys()].filter((part) => !styled.has(part)).map((part) => `${part} (${named.get(part).join(', ')})`), [], 'named by a plane, drawn by no rule');
  // Each part's rule paints in system colours (or hides a glow): the parts the stylesheet draws as the theme's. A part
  // drawn only inside a drawing (the words on a chosen value) is named last in its selector.
  for (const part of styled) {
    const own = rules.filter((rule) => rule.selectors.some((selector) => selector.endsWith(`[data-mm-plane-part="${part}"]`)));
    assert.ok(own.length, `${part} has a rule of its own`);
  }
});

test('a shaded region is hatched in the text colour, a second the other way, and a translucent glow is not drawn', () => {
  const shade = rules.find((rule) => rule.selectors.includes('[data-mm-plane-part="shade"]'));
  assert.equal(shade?.declarations.fill?.value, 'CanvasText');
  assert.equal(shade.declarations['fill-opacity']?.value, '1');
  assert.match(shade.declarations['mask-image']?.value || '', /^repeating-linear-gradient\(45deg, CanvasText 0 [\d.]+px, transparent [\d.]+px [\d.]+px\)$/, 'lines of the text colour, with the grid between them');
  const second = rules.find((rule) => rule.selectors.includes('[data-mm-plane-part="shade"]:nth-child(even of [data-mm-plane-part="shade"])'));
  assert.match(second?.declarations['mask-image']?.value || '', /^repeating-linear-gradient\(-45deg, /, 'the next region the other way: an overlap is cross-hatched');
  assert.equal(rules.find((rule) => rule.selectors.includes('[data-mm-plane-part="glow"]'))?.declarations.display?.value, 'none');
  // Selected, held or dragged, and the keyboard's crosshair: the theme's Highlight.
  assert.equal(rules.find((rule) => rule.selectors.includes('[data-mm-plane-part="held"]'))?.declarations.fill?.value, 'Highlight');
  assert.equal(rules.find((rule) => rule.selectors.includes('[data-mm-plane-part="held-open"]'))?.declarations.stroke?.value, 'Highlight');
  assert.equal(rules.find((rule) => rule.selectors.includes('[data-mm-plane-part="cursor"]'))?.declarations.stroke?.value, 'Highlight');
});

// Every component that draws a coordinate plane names its board (the walk reads `[data-mm-plane]`, and the stylesheet
// draws it). The board is the <svg> it draws in, or, for the graphing calculator, the box JSXGraph draws into: found
// here by what tells it from the file's other elements of its kind.
const openingTags = (source, tagName) => {
  const tags = [];
  let at = source.indexOf(`<${tagName}`);
  while (at >= 0) {
    let depth = 0;
    let quote = null;
    let end = at + tagName.length + 1;
    for (; end < source.length; end += 1) {
      const c = source[end];
      if (quote) { if (c === quote) quote = null; continue; }
      // A comment between attributes ("the theme's colours") is not a quote.
      if (source.startsWith('//', end)) { end = source.indexOf('\n', end); continue; }
      if (source.startsWith('/*', end)) { end = source.indexOf('*/', end) + 1; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    if (/^[\s/>]/.test(source[at + tagName.length + 1] || '')) tags.push(source.slice(at, end + 1));
    at = source.indexOf(`<${tagName}`, end);
  }
  return tags;
};
const PLANE_DRAWERS = [
  ['src/tools/shared/CoordinatePlane.jsx', 'svg', 'mathmaster-responsive-canvas'],
  ['src/GraphDisplay.jsx', 'svg', 'mathmaster-responsive-canvas'],
  ['src/InteractiveGraphWorkspace.jsx', 'svg', 'mathmaster-responsive-canvas'],
  ['src/GraphStory.jsx', 'svg', 'Graph story sketch'],
  ['src/components/liveChallenge/GraphFeatureRushGraph.jsx', 'svg', 'mm-rush-graph'],
  ['src/components/liveChallenge/LineGraphCanvas.jsx', 'svg', 'mm-line-graph'],
  ['src/components/liveChallenge/LineRevealGraph.jsx', 'svg', 'aria-label={`The line'],
  ['src/tools/relationMapping/RelationMapping.jsx', 'svg', 'Coordinate plane for plotting the relation'],
  ['src/components/assessment/GraphingCalculatorPanel.jsx', 'div', 'ref={boardBoxRef}'],
];
// Drawings with the plane's tokens that are not a board of their own, each with its reason.
const NOT_A_BOARD = {
  'src/components/liveChallenge/LineGridLayer.jsx': 'the grid under Graph the Line\'s planes, drawn inside their boards',
  'src/tools/systemsWorkspace/InequalityBuildPanels.jsx': 'the Systems Workspace\'s marks, drawn inside the shared plane',
  'src/components/liveChallenge/InequalityNumberLine.jsx': 'a number line, not a plane: one of the other drawings (DRAWINGS, below)',
  'src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx': 'three planes in a 3D model, not a coordinate plane: one of the other drawings (DRAWINGS, below)',
  'src/components/liveChallenge/GraphFeatureRushRound.jsx': 'the rush round\'s shell, which sets the tokens',
  'src/components/liveChallenge/LineGraphRound.jsx': 'the line round\'s shell, which sets the tokens',
  'src/components/liveChallenge/grandPrixTheme.js': 'the rounds\' tokens',
};

test('every component that draws a coordinate plane names its board, and a drawing with the plane\'s tokens is a board or says why not', () => {
  for (const [file, tagName, marker] of PLANE_DRAWERS) {
    const boards = openingTags(read(file), tagName).filter((tag) => tag.includes(marker));
    assert.equal(boards.length, 1, `${file}: one board`);
    assert.match(boards[0], /\sdata-mm-plane=""/, `${file}: the board is named`);
  }
  const drawers = new Set(PLANE_DRAWERS.map(([file]) => file));
  const drawings = walk('src').filter((file) => /var\(--mm-graph-(axis|grid)/.test(read(file)));
  assert.deepEqual(drawings.filter((file) => !drawers.has(file) && !NOT_A_BOARD[file]), [], 'draws with the plane\'s axis or grid tokens, and is neither a board nor said not to be one');
});

test('a key beside a plane draws its sample line as the plane draws it', () => {
  // A legend's sample (a short line in each mark's colour and dash, in a small svg of its own), outside the plane's svg:
  // drawn in the text colour. One drawn in the words' own colour (currentColor) follows them already.
  const key = rules.find((rule) => rule.selectors.includes('[data-mm-plane-key] :is(line, path)'));
  assert.equal(key?.declarations.stroke?.value, 'CanvasText');
  assert.ok(key.declarations.stroke.important, 'over the sample\'s own colour, set inline');
  const small = (attributes) => ['width', 'height'].every((size) => Number(new RegExp(`\\b${size}="(\\d+)"`).exec(attributes)?.[1]) <= 40);
  const samples = walk('src').flatMap((file) => [...read(file).matchAll(/<svg\b([^>]*)>\s*<line\b([^>]*)\/>\s*<\/svg>/g)]
    .filter((match) => small(match[1]) && /\bstroke(=|:)/.test(match[2]) && !/currentColor/.test(match[2]))
    .map((match) => ({ file, named: /data-mm-plane-key=""/.test(match[1]) })));
  assert.ok(samples.length >= 8, `${samples.length} keys`);
  assert.deepEqual(samples.filter((sample) => !sample.named).map((sample) => sample.file), [], 'a key whose line keeps its own colour');
});

// ------------------------------------------------------------------ the other drawings
// A number line, the mapping diagram, the 3D model, the two progress wheels, a match's line and a stroke's ink are SVG
// drawings too, and kept the app theme's paint under a contrast theme as a plane did. Each names itself
// (data-mm-drawing) and its parts with the plane's words, so the plane's rules draw it; the forced-colours walk reads
// what each paints (mm-forced-drawing-paint). These hold the drawings, the rules and the keys to each other.
const DRAWINGS = [
  // [file, tag, what tells the drawing from the file's other tags of its kind, '' a board of its own | 'overlay' over the page]
  ['src/tools/intervalNumberLine/IntervalNumberLine.jsx', 'svg', 'onKeyDown={handleLineKeyDown}', ''],
  ['src/components/liveChallenge/InequalityNumberLine.jsx', 'svg', 'mm-rush-line', ''],
  ['src/tools/relationMapping/RelationMapping.jsx', 'svg', 'aria-label="Mapping diagram"', ''],
  ['src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx', 'svg', 'ref={modelRef}', ''],
  ['src/components/student/MyMathPathWheel.jsx', 'svg', 'mastery wheel', ''],
  ['src/components/student/CCMRReadinessWheel.jsx', 'svg', 'readiness by domain', ''],
  ['src/GraphScenarioMatch.jsx', 'svg', 'graph-scenario-connector-layer', 'overlay'],
  ['src/StepByStepAlgebraCore.jsx', 'svg', 'zIndex: 5', 'overlay'],
  ['src/MultiRelationAlgebraCore.jsx', 'svg', 'zIndex: 9999', 'overlay'],
];
// Every other <svg> a screen draws, and why it is neither a plane, a drawing nor a plane's key: drawn in currentColor
// (the words' or the button's colour, which forced colours give the theme's), decoration beside its words, or used by
// no screen. (A printed worksheet's figures are built in code, off the screen, for a PDF: assignmentWorksheetVisuals.js.)
const NOT_A_DRAWING = [
  ['src/LoginScreen.jsx', 'viewBox="0 0 48 48"', 'the Google mark: a logo in its own colours, beside its words'],
  ['src/MathInput.jsx', 'data-math-tools-icon="keypad"', 'the keypad icon, in currentColor'],
  ['src/components/common/CalculatorIcon.jsx', 'mathmaster-calculator-icon', 'the calculator icon, in currentColor'],
  ['src/components/common/StarIcon.jsx', 'mathmaster-star-icon', 'the Class Points star: decoration beside its words, in its own colours as the emoji was'],
  ['src/components/assessment/SatReferenceSheet.jsx', '<svg', 'the reference sheet\'s figures, in currentColor'],
  ['src/components/common/ResponsiveMathCanvas.jsx', '<svg', 'used by no screen'],
  ['src/tools/regressionCalculator/RegressionCalculator.jsx', 'viewBox="0 0 28 28"', 'the add-regression icon, in currentColor'],
  ['src/tools/systemsWorkspace/InequalityControls.jsx', 'viewBox="0 0 30 10"', 'a line style\'s icon, in currentColor'],
  ['src/tools/systemsWorkspace/InequalityControls.jsx', 'viewBox="0 0 24 24"', 'the show and hide icon, in currentColor'],
];

test('every other drawing names itself as the last attribute of its tag, and one drawn over the page as an overlay', () => {
  for (const [file, tagName, marker, kind] of DRAWINGS) {
    const tags = openingTags(read(file), tagName).filter((tag) => tag.includes(marker));
    assert.equal(tags.length, 1, `${file}: one drawing`);
    assert.match(tags[0], new RegExp(`\\sdata-mm-drawing="${kind}"\\s*>$`), `${file}: named "${kind}", last`);
  }
  // A board is the page's Canvas, as a plane's; one over the page keeps no background, which would hide the page.
  const board = rules.find((rule) => rule.selectors.includes('[data-mm-plane]') && rule.declarations['background-color']);
  assert.ok(board.selectors.includes('[data-mm-drawing=""]'), 'a drawing\'s own board');
  const painted = rules.filter((rule) => rule.selectors.some((selector) => /^\[data-mm-drawing(="overlay")?\]$/.test(selector)) && Object.keys(rule.declarations).some((name) => name.startsWith('background')));
  assert.deepEqual(painted.map((rule) => rule.selectors.join(', ')), [], 'nothing paints a drawing over the page');
  // Its words and markers as a plane's.
  assert.ok(rules.find((rule) => rule.selectors.includes('[data-mm-plane] text'))?.selectors.includes('[data-mm-drawing] text'));
  assert.ok(rules.find((rule) => rule.selectors.includes('[data-mm-plane] marker > *'))?.selectors.includes('[data-mm-drawing] marker > *'));
});

test('every <svg> a screen draws is a plane, another drawing, a plane\'s key, or said to be an icon or decoration', () => {
  const accounted = (file, tag) => /\sdata-mm-(plane|drawing|plane-key)=/.test(tag)
    || NOT_A_DRAWING.some(([listed, marker]) => listed === file && tag.includes(marker));
  const unaccounted = walk('src').flatMap((file) => openingTags(read(file), 'svg').filter((tag) => !accounted(file, tag)).map((tag) => `${file}: ${tag.slice(0, 90)}`));
  assert.deepEqual(unaccounted, [], 'an <svg> a contrast theme would leave in its own paint, with no word on how it is drawn there');
  // Each listed one is still there (a stale entry would excuse a new drawing).
  for (const [file, marker] of NOT_A_DRAWING) assert.ok(openingTags(read(file), 'svg').some((tag) => tag.includes(marker)), `${file}: ${marker}`);
});

// What a part looks like under forced colours: its fill, stroke and mask, from every rule that draws exactly it (a part
// alone, or one of an :is() list of parts), but not a rule for one kind of element.
const partLook = (part) => {
  const own = `[data-mm-plane-part="${part}"]`;
  const merged = {};
  for (const rule of rules.filter((entry) => entry.selectors.some((selector) => selector === own || (selector.startsWith(':is(') && selector.includes(own) && !/\)\S/.test(selector))))) {
    Object.assign(merged, Object.fromEntries(Object.entries(rule.declarations).map(([name, { value }]) => [name, value])));
  }
  return merged;
};
const angles = (value) => [...String(value || '').matchAll(/(-?\d+)deg/g)].map((match) => Number(match[1])).sort((a, b) => a - b);

test('under a contrast theme a wheel tells its levels apart by their fills, each its own, and its key draws each the same way', async () => {
  const { MASTERY_STATUS_COLORS, MASTERY_STATUS_FILLS } = await import('../../src/platform/mastery/strandConfig.js');
  const { DOMAIN_STATE, DOMAIN_STATE_FILLS } = await import('../../src/platform/ccmr/domainReadiness.js');
  // Every mastery level and every readiness state has a fill, and no two of one wheel the same.
  assert.deepEqual(Object.keys(MASTERY_STATUS_FILLS).sort(), Object.keys(MASTERY_STATUS_COLORS).sort());
  assert.equal(new Set(Object.values(MASTERY_STATUS_FILLS)).size, Object.keys(MASTERY_STATUS_COLORS).length);
  assert.deepEqual(Object.keys(DOMAIN_STATE_FILLS).sort(), Object.values(DOMAIN_STATE).sort());
  assert.equal(new Set(Object.values(DOMAIN_STATE_FILLS)).size, Object.values(DOMAIN_STATE).length);
  // Each fill is drawn by the stylesheet in system colours, and no two alike: solid, empty, a hatch one way, the other,
  // both, or level.
  const fills = [...new Set([...Object.values(MASTERY_STATUS_FILLS), ...Object.values(DOMAIN_STATE_FILLS)])];
  const looks = fills.map((fill) => {
    const look = partLook(fill);
    assert.ok(look.fill && look.stroke, `${fill}: drawn (${JSON.stringify(look)})`);
    return JSON.stringify([look.fill, look.stroke, angles(look['mask-image'])]);
  });
  assert.equal(new Set(looks).size, fills.length, `every fill looks different: ${looks.join(' ')}`);
  // Its key's swatch shows the same fill: solid, empty or hatched the same way.
  for (const fill of fills) {
    const swatch = rules.find((rule) => rule.selectors.includes(`[data-mm-swatch="${fill}"]`) && rule.declarations.background)?.declarations.background.value;
    assert.ok(swatch, `a swatch for ${fill}`);
    assert.deepEqual(angles(swatch), angles(partLook(fill)['mask-image']), `${fill}: the swatch's hatch runs as the wedge's`);
  }
  // The wheel's wedge takes its level's fill, and Highlight while it is the one named in the hub; a round done is an
  // empty ring and a Level 3 round a solid dot, which the key's two dots say.
  const wheel = read('src/components/student/MyMathPathWheel.jsx');
  assert.match(wheel, /data-mm-plane-part=\{active \? 'held' : MASTERY_STATUS_FILLS\[status\] \|\| MASTERY_STATUS_FILLS\[NOT_ENOUGH_EVIDENCE\]\} \/>/);
  assert.match(wheel, /\{passCount > 0 && <circle [^>]*fill=\{passColor\}[^>]*data-mm-plane-part=\{passCount >= 3 \? 'point' : 'open'\} \/>\}/);
  const key = region(read('src/components/student/MyMathPathDashboard.jsx'), '<strong>What the colours mean</strong>', 'numbers around the wheel', 'the colour key');
  assert.match(key, /data-mm-swatch="ring"[^>]*>●<\/span> practice round done/);
  assert.match(key, /data-mm-swatch="point"[^>]*>●<\/span> Level 3 \(stretch\) round done/);
  assert.equal(partLook('open').fill, 'Canvas', 'a ring is empty');
  assert.equal(partLook('point').fill, 'CanvasText', 'a dot is solid');
  assert.equal(rules.find((rule) => rule.selectors.includes('[data-mm-swatch="ring"]'))?.declarations.color?.value, 'Canvas', 'the key\'s ring is empty');
  assert.match(rules.find((rule) => rule.selectors.includes('[data-mm-swatch="ring"]'))?.declarations['-webkit-text-stroke']?.value || '', /CanvasText$/, 'inside an edge');
  assert.equal(rules.find((rule) => rule.selectors.includes('[data-mm-swatch="point"]'))?.declarations.color?.value, 'CanvasText', 'the key\'s dot is solid');
  // The readiness wheel the same way, beside each domain's name in its list.
  const ccmr = read('src/components/student/CCMRReadinessWheel.jsx');
  assert.match(ccmr, /data-mm-plane-part=\{isActive \? 'held' : DOMAIN_STATE_FILLS\[entry\.state\]\}/);
  assert.match(region(ccmr, '{domains.map((entry) => (', '</li>', 'the list'), /data-mm-swatch=\{DOMAIN_STATE_FILLS\[entry\.state\]\} \/>/);
  assert.equal(partLook('held').fill, 'Highlight');
});

test('the 3D model\'s three planes are hatched three ways, each keeping its label', () => {
  const model = read('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx');
  const fills = JSON.parse(/const PLANE_FILLS = (\[[^\]]*\]);/.exec(model)?.[1].replace(/'/g, '"') || '[]');
  assert.equal(new Set(fills).size, 3, 'three different hatches');
  assert.equal(new Set(fills.map((fill) => JSON.stringify(angles(partLook(fill)['mask-image'])))).size, 3, 'running three ways');
  assert.match(model, /fill=\{plane\.color\}\s*fillOpacity=\{0\.28\}\s*stroke=\{plane\.color\}\s*strokeWidth=\{2\}\s*data-mm-plane-part=\{PLANE_FILLS\[plane\.index % PLANE_FILLS\.length\]\}/);
  assert.match(model, /className="mathmaster-threeplane-plane-label"\s*textAnchor="middle"\s*data-mm-plane-part="halo"/, 'its label on a halo of the page');
  // Hatched more thinly than a wheel's wedge, so where three cross, the lines and labels on them still read.
  for (const fill of fills) {
    const thin = rules.find((rule) => rule.selectors.includes(`polygon[data-mm-plane-part="${fill}"]`))?.declarations['mask-image']?.value || '';
    assert.deepEqual(angles(thin), angles(partLook(fill)['mask-image']), `${fill}: the same way`);
    assert.ok(Number(/transparent [\d.]+px ([\d.]+)px/.exec(thin)?.[1]) > Number(/transparent [\d.]+px ([\d.]+)px/.exec(partLook(fill)['mask-image'])?.[1]), `${fill}: farther apart`);
  }
});

test('a number line draws its ends by their fill, the one being placed in Highlight, and its shading solid', () => {
  const tool = read('src/tools/intervalNumberLine/IntervalNumberLine.jsx');
  assert.match(tool, /fill=\{interval\.minClosed \? '#1a73e8' : '#fff'\}[^>]*data-mm-plane-part=\{interval\.minClosed \? 'closed' : 'open'\}/);
  assert.match(tool, /fill=\{interval\.maxClosed \? '#1a73e8' : '#fff'\}[^>]*data-mm-plane-part=\{interval\.maxClosed \? 'closed' : 'open'\}/);
  assert.match(tool, /fill=\{pending\.closed \? '#8a3ffc' : '#fff'\}[^>]*data-mm-plane-part=\{pending\.closed \? 'held' : 'held-open'\}/);
  assert.match(tool, /stroke="#1a73e8"\s*strokeWidth="6"\s*opacity="0\.85"\s*data-mm-plane-part="line"/);
  const rush = read('src/components/liveChallenge/InequalityNumberLine.jsx');
  assert.match(rush, /strokeOpacity=\{0\.5\} strokeWidth=\{BAND\}[^>]*data-mm-plane-part="line" \/>/, 'the shading, translucent on screen, solid there');
  assert.match(rush, /fill=\{dot\.closed \? tone : 'var\(--mm-graph-bg\)'\}[^>]*data-mm-plane-part=\{dot\.closed \? 'closed' : 'open'\} \/>/);
  assert.equal(partLook('line')['opacity'], '1');
  assert.equal(partLook('held-open').stroke, 'Highlight');
});

test('a mapping diagram draws its chosen value in Highlight, and the values it can map to faint until one is chosen', () => {
  const mapping = read('src/tools/relationMapping/RelationMapping.jsx');
  assert.match(mapping, /data-mm-plane-part=\{selectedDomain === value \? 'held' : 'open'\} \/>/);
  assert.match(mapping, /data-mm-plane-part=\{selectedDomain === value \? 'held-text' : undefined\}>\{value\}<\/text>/);
  assert.match(mapping, /opacity=\{selectedDomain == null \? 0\.55 : 1\} data-mm-plane-part=\{selectedDomain == null \? 'muted' : 'open'\} \/>/, 'faint on screen, the theme\'s grey there');
  assert.equal(partLook('muted').stroke, 'GrayText');
  // The words on the chosen value are the highlight's own, over the drawing's words rule.
  const words = rules.find((rule) => rule.selectors.includes('[data-mm-drawing] [data-mm-plane-part="held-text"]'));
  assert.equal(words?.declarations.fill?.value, 'HighlightText');
  assert.ok(above(specificity(words.selectors[0]), specificity('[data-mm-drawing] text')) > 0, 'over every word\'s CanvasText');
});

test('a line drawn over the page as a student drags is Highlight, a strike that holds the text colour', () => {
  assert.match(read('src/StepByStepAlgebraCore.jsx'), /opacity=\{ink\.locked \? 1 : 0\.85\}\s*data-mm-plane-part=\{ink\.locked \? 'line' : 'cursor'\}/);
  assert.match(read('src/MultiRelationAlgebraCore.jsx'), /stroke="#7b61ff"[\s\S]{0,120}opacity="0\.78"\s*data-mm-plane-part="cursor"/);
  assert.equal(partLook('cursor').stroke, 'Highlight');
  assert.match(read('src/GraphScenarioMatch.jsx'), /className="graph-scenario-connector-path" data-mm-plane-part="line" \/>/);
});

// A canvas is pixels a page paints itself, which forced colours never repaint, so what each draws under a contrast
// theme is the script's to choose. Every canvas the student's or teacher's screens paint, and what it draws there.
const CANVASES = {
  'src/InteractiveGraphWorkspace.jsx': 'the graph workspace\'s drag images: drawn in the theme\'s Highlight (forcedHeldColour)',
  'src/ScratchpadOverlay.jsx': 'the scratchpad: the student\'s paper and ink, kept as they are (white paper, saved as an image a teacher sees)',
  'src/platform/preflight/teacherReviewScreenshotCapture.js': 'a teacher\'s screenshot, captured and never drawn on a screen',
};

test('every canvas a screen paints is listed, and the graph workspace\'s drag images are drawn in the theme\'s Highlight', () => {
  const painted = walk('src').filter((file) => /getContext\(['"]2d['"]\)/.test(read(file)));
  assert.deepEqual(painted.sort(), Object.keys(CANVASES).sort(), 'a canvas a contrast theme leaves in its own paint, with no word on what it draws there');
  const workspace = read('src/InteractiveGraphWorkspace.jsx');
  const held = region(workspace, 'const forcedHeldColour = () => {', '\n};', 'forcedHeldColour');
  assert.match(held, /window\.matchMedia\?\.\('\(forced-colors: active\)'\)\.matches\) return null;/, 'only under a contrast theme');
  assert.match(held, /probe\.style\.color = 'Highlight';/, 'the theme\'s own Highlight');
  for (const name of ['makePointDragImage', 'makeMarkerDragImage']) {
    const image = region(workspace, `const ${name} = `, '\n};', name);
    assert.match(image, /const held = forcedHeldColour\(\);/, `${name} asks for it`);
    assert.match(image, /context\.fillStyle = held \|\| /, `${name} fills in it`);
  }
  // Opaque, and no translucent halo: a glow the plane leaves out too.
  assert.match(region(workspace, 'const makeMarkerDragImage = ', '\n};'), /context\.globalAlpha = held \? 1 : 0\.62;/);
  assert.match(region(workspace, 'const makePointDragImage = ', '\n};'), /if \(!held\) \{\s*context\.fillStyle = 'rgba\(0,166,166,0\.28\)';/);
});
