/*
 * FORCED COLOURS (WINDOWS' CONTRAST THEMES): THE STYLESHEET AND ITS HOOKS.
 *
 * A contrast theme draws every page in a few system colours: every background
 * as Canvas, no box-shadow, no gradient. src/theme/forcedColors.css gives back
 * what that takes from MathMaster's screens: an edge for every button, the
 * system's highlight for a selected, pressed or current control, a drawn
 * progress bar, the Live Class question strip's colours and the mastery key's,
 * and every coordinate plane in the theme's colours.
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
const COLOUR_PROPERTIES = /^(color|background(-color)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule(-color)?)$/;

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
  //   a colour key's swatch: the wheel it explains keeps its colours;
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

test('the mastery wheel\'s colour key, its topic list and the topic browser mark their swatches', () => {
  const key = region(read('src/components/student/MyMathPathDashboard.jsx'), '<strong>What the colours mean</strong>', 'numbers around the wheel', 'the colour key');
  assert.match(key, /data-mm-swatch="" style=\{\{ width: 11, height: 11, borderRadius: 999, background: color/);
  assert.equal((key.match(/<span data-mm-swatch="" style=\{\{ color: /g) || []).length, 2, 'both round-done dots');
  const list = region(read('src/components/student/MyMathPathWheel.jsx'), '{arc.members.map((entry) => {', '</ul>', 'the topic list');
  assert.match(list, /data-mm-swatch="" style=\{\{[^}]*background: MASTERY_STATUS_COLORS\[status\]/);
  const browser = read('src/components/student/MyMathPathTopicBrowser.jsx');
  assert.match(region(browser, '<span data-mastery-status', '</span>', 'the mastery chip'), /data-mm-swatch="" style=\{\{[^}]*background: skill\.masteryColor/);
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
  const board = rules.find((rule) => rule.selectors.length === 1 && rule.selectors[0] === '[data-mm-plane]');
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
const namedParts = () => {
  const found = new Map();
  for (const file of walk('src')) {
    const source = read(file);
    if (!/data-mm-plane-part|markPlanePart\(/.test(source)) continue;
    for (const match of source.matchAll(/data-mm-plane-part=(?:"([\w-]+)"|\{([^}]*)\})|markPlanePart\([^,]+,\s*'([\w-]+)'\)|const planePart = ([^;]+);/g)) {
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
  // Each part's rule paints in system colours (or hides a glow): the parts the stylesheet draws as the theme's.
  for (const part of styled) {
    const own = rules.filter((rule) => rule.selectors.some((selector) => selector === `[data-mm-plane-part="${part}"]`));
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
  'src/components/liveChallenge/InequalityNumberLine.jsx': 'a number line, not a plane',
  'src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx': 'three planes in a 3D model, not a coordinate plane',
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
