/*
 * FORCED COLOURS (WINDOWS' CONTRAST THEMES): THE STYLESHEET AND ITS HOOKS.
 *
 * A contrast theme draws every page in a few system colours: every background
 * as Canvas, no box-shadow, no gradient. src/theme/forcedColors.css gives back
 * what that takes from MathMaster's screens: an edge for every button, the
 * system's highlight for a selected, pressed or current control, a drawn
 * progress bar, the Live Class question strip's colours and the mastery key's.
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
  //   a colour key's swatch: the wheel it explains keeps its colours.
  const optedOut = rules.filter((rule) => rule.declarations['forced-color-adjust']?.value === 'none');
  const reasons = optedOut.map((rule) => {
    const selector = rule.selectors.join(', ');
    if (/\[aria-current\]:not\(\[aria-current="false"\]\)/.test(selector) && /\[aria-pressed="true"\]/.test(selector)) return 'selected control';
    if (selector === '[data-question-state]') return 'question strip';
    if (selector === '[data-mm-swatch]') return 'colour key swatch';
    return `unexplained: ${selector}`;
  });
  assert.deepEqual(reasons.sort(), ['colour key swatch', 'question strip', 'selected control']);
  // The selected control, out of forced adjustment, sets every colour it paints.
  const selected = optedOut.find((rule) => /\[aria-pressed="true"\]/.test(rule.selectors.join(', ')));
  for (const property of ['background', 'color', 'border-color', 'outline-color', 'box-shadow']) {
    assert.ok(selected.declarations[property]?.important, `the selected control sets ${property}`);
  }
});

test('a button keeps an edge and a focused selected control a system-colour ring, each more or less specific than the page\'s focus ring as it must be', () => {
  // The page's focus ring (index.css) is (0,5,1). The edge outline must lose to it (a focused button shows the ring);
  // the selected control's ring colour must win over it (out of forced adjustment the ring would be the app's colour).
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
