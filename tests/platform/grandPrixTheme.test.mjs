/*
 * THE GRAND PRIX LOOK COSTS NOTHING A ROUND CAN FEEL (grandPrixTheme.js).
 *
 * The student side of every Live Challenge dressed as a neon race night, on
 * one condition: the game stays light, zippy and in sync. Measured in a
 * browser with the CPU slowed four times, a round's steady play does the same
 * work as before the theme, and its moments (the countdown, GO, a finished
 * graph) close to it — because of four rules these tests hold:
 *
 *   1. the arena is drawn once, on a compositor layer of its own — drawn into
 *      the round's layer, its seven gradients were redrawn under every new
 *      graph (most of the first draft's cost);
 *   2. nothing that changes during a round carries a blurred shadow — a blur
 *      is the one costly thing to draw, and it is drawn again with every
 *      tick, step or finished graph;
 *   3. every animation the theme adds moves only transform and opacity — one
 *      other property in a keyframe puts the whole animation on the main
 *      thread (the first GO did, for 800 ms, right as students start tapping);
 *   4. no effect has a clock of its own: the start lights follow the step the
 *      countdown already shows, GO follows the round's start, a +1 lives
 *      inside the finished graph's flash — so every student's screen changes
 *      on the same server second, and no effect holds a student up.
 *
 * And it stays readable: the dark graph keeps its words at 4.5:1 and its marks
 * at 3:1, each mark its own colour; reduced motion turns every effect off.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_BACKGROUND,
  ARENA_FLOOR,
  ARENA_GRAPH,
  ARENA_LINE_VARS,
  ARENA_MARKS,
  ARENA_PAGE_BACKGROUND,
  ARENA_RUSH_VARS,
  GP_RACE_CSS,
  GRAND_PRIX_CSS,
  arenaLayerCss,
  startLights,
} from '../../src/components/liveChallenge/grandPrixTheme.js';
import { arenaGameTitle, arenaTagline } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { roundMedalPlace } from '../../src/platform/liveChallenge/challengeStandingsModel.js';
import { INEQUALITY_RUSH_MODE_ID, RUSH_COMPLETE_FLASH_MS, RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';
import { LINE_CORRECT_FLASH_MS, LINE_GRAPH_MODE_ID } from '../../functions/shared/lineGraphRules.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const rushRound = componentSource('src/components/liveChallenge/GraphFeatureRushRound.jsx');
const lineRound = componentSource('src/components/liveChallenge/LineGraphRound.jsx');
const shellParts = componentSource('src/components/liveChallenge/ChallengeShellParts.jsx');
const student = componentSource('src/components/liveChallenge/LiveChallengeStudent.jsx');
const studentShell = componentSource('src/components/liveChallenge/ChallengeStudentShell.jsx');
const startLightsSource = componentSource('src/components/liveChallenge/StartLights.jsx');

// A round screen's stylesheet, as written (its ${…} pieces unexpanded).
const stylesheetOf = (source, name) => region(source, `const ${name} = \``, '\n`;', name);
const RUSH_CSS = stylesheetOf(rushRound, 'RUSH_CSS');
const LINE_CSS = stylesheetOf(lineRound, 'LINE_CSS');

// The body of a top-level rule (`selector {` at the start of a line).
const ruleBody = (css, selector) => {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at > -1, `${selector} has a rule`);
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};
// A declaration's value in a rule body, or null.
const declaration = (body, property) => {
  const match = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(body);
  return match ? match[1].trim() : null;
};
// Shadows in a box-shadow / text-shadow value: commas inside rgba(…) are not separators.
const shadowsIn = (value) => {
  const shadows = [];
  let depth = 0; let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) { shadows.push(current); current = ''; } else current += character;
  }
  shadows.push(current);
  return shadows.map((shadow) => {
    const lengths = shadow.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\binset\b|\btransparent\b/gi, ' ').trim().split(/\s+/).filter(Boolean).map((token) => parseFloat(token));
    return { x: lengths[0] || 0, y: lengths[1] || 0, blur: lengths[2] || 0, text: shadow.trim() };
  });
};
const blurredShadows = (value) => (value ? shadowsIn(value).filter((shadow) => shadow.blur > 0) : []);

// The keyframes blocks of a stylesheet: name -> the properties they set.
const keyframesIn = (css) => {
  const blocks = {};
  const pattern = /@keyframes\s+([\w-]+)\s*\{/g;
  let match;
  while ((match = pattern.exec(css))) {
    let depth = 1; let index = pattern.lastIndex;
    while (depth > 0 && index < css.length) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }
    const body = css.slice(pattern.lastIndex, index - 1);
    blocks[match[1]] = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((property) => property[1]));
  }
  return blocks;
};

const parse = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((channel) => channel / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ------------------------------- the start lights ------------------------------- */

test('the start lights: a red pod more each second of 3 · 2 · 1, all three green at GO, dark otherwise', () => {
  assert.deepEqual(startLights({ step: 3 }), ['red', null, null]);
  assert.deepEqual(startLights({ step: 2 }), ['red', 'red', null]);
  assert.deepEqual(startLights({ step: 1 }), ['red', 'red', 'red']);
  assert.deepEqual(startLights({ go: true }), ['green', 'green', 'green']);
  assert.deepEqual(startLights({ step: 2, go: true }), ['green', 'green', 'green'], 'GO wins over a stale step');
  for (const step of [null, undefined, 0, 4, 2.5, -1, 'soon']) {
    assert.deepEqual(startLights({ step }), [null, null, null], `no step ${String(step)}: the lights stay dark`);
  }
  assert.deepEqual(startLights(), [null, null, null]);
  // The component draws exactly those three pods, hidden from a screen reader
  // (which hears the countdown's own words).
  assert.match(startLightsSource, /const pods = startLights\(\{ step, go \}\);/);
  for (const pod of [0, 1, 2]) assert.match(startLightsSource, new RegExp(`data-on=\\{pods\\[${pod}\\] \\|\\| undefined\\}`));
  assert.match(startLightsSource, /className="mm-gp-lights" aria-hidden="true"/);
});

test('every countdown lights them off the step it already shows: no clock of their own', () => {
  // The classic round's countdown (a student's look only).
  const countdown = region(shellParts, 'export function ChallengeCountdown(', '\n}\n', 'ChallengeCountdown');
  assert.match(countdown, /const step = clock\?\.countdownStep;/);
  assert.match(countdown, /\{look === 'student' && <div[^>]*><StartLights step=\{step\} go=\{go\} \/><\/div>\}/);
  // The rush's and Graph the Line's: the lights take the very step the number shows.
  for (const [name, source, fn] of [['rush', rushRound, 'RushCountdownNumber'], ['line', lineRound, 'LineCountdownNumber']]) {
    const body = region(source, `function ${fn}(`, '\n}\n', fn);
    assert.match(body, /<StartLights step=\{step\} \/>/, `${name}: lights from the step`);
    assert.match(body, /data-mm-countdown=\{String\(step\)\}/, `${name}: the number from the same step`);
    assert.equal((executableSource(body).match(/setInterval|setTimeout/g) || []).length, 1, `${name}: the countdown's one ticker, as before`);
  }
});

/* ------------------------ GO, the +1, the counts: no timing ------------------------ */

test('GO shows once, at the round\'s own start, for a student who watched the countdown — and never catches a tap', () => {
  for (const [name, source] of [['rush', rushRound], ['line', lineRound]]) {
    const code = executableSource(source);
    assert.match(code, /const \[sawCountdown\] = useState\(\(\) => performance\.now\(\) < timing\.startMono\);/, `${name}: decided once, at mount`);
    assert.match(code, /\{started && sawCountdown && \(\s*<div className="mm-gp-go-flash" aria-hidden="true"><StartLights go \/><span className="mm-gp-go">GO!<\/span><\/div>\s*\)\}/, `${name}: on the round's start`);
    assert.doesNotMatch(code, /setGo|goFlash|setTimeout\([^)]*[Gg]o\b/, `${name}: no timer for GO`);
  }
  const flash = ruleBody(GP_RACE_CSS, '.mm-gp-go-flash');
  assert.match(flash, /pointer-events: none/, 'taps go through to the graph');
  assert.match(flash, /animation: mmGpGoFlash \d+ms [a-z-]+ forwards/, 'it fades out and stays out');
});

test('a +1 rises off a finished item inside the flash the game already shows: it never holds up the next one', () => {
  const rise = Number(/\.mm-gp-plus \{[^}]*animation: mmGpRise (\d+)ms/.exec(GP_RACE_CSS)?.[1]);
  assert.ok(rise > 0, 'the +1 has its rise');
  assert.ok(rise <= RUSH_COMPLETE_FLASH_MS, `rush: ${rise} ms fits a finished graph's ${RUSH_COMPLETE_FLASH_MS} ms`);
  assert.ok(rise <= LINE_CORRECT_FLASH_MS, `line: ${rise} ms fits a right line's ${LINE_CORRECT_FLASH_MS} ms`);
  // A rush item's +N is its points (the taps its answer takes), from the
  // completing feedback of that very item.
  assert.match(executableSource(rushRound), /\{transition\?\.kind === RUSH_FEEDBACK\.COMPLETE && <span key=\{`plus-\$\{transition\.questionIndex\}`\} className="mm-gp-plus" aria-hidden="true">\+\{feedback\?\.kind === RUSH_FEEDBACK\.COMPLETE && feedback\.questionIndex === transition\.questionIndex \? \(feedback\.points \?\? 1\) : 1\}<\/span>\}/);
  assert.match(executableSource(lineRound), /\{transition\?\.kind === LINE_FEEDBACK\.CORRECT && <span key=\{`plus-\$\{transition\.questionIndex\}`\} className="mm-gp-plus" aria-hidden="true">\+1<\/span>\}/);
  // The counts pop by remounting on their own value: no state, no timer.
  assert.match(rushRound, /<span key=\{completed\} className=\{completed > 0 \? 'mm-gp-bump' : undefined\} aria-hidden="true">✓ \{completed\}<\/span>/);
  assert.match(rushRound, /<span key=\{points\} className=\{points > 0 \? 'mm-gp-bump' : undefined\} aria-hidden="true">★ \{points\}<\/span>/);
  assert.match(lineRound, /<span key=\{completed\} className=\{completed > 0 \? 'mm-gp-bump' : undefined\} aria-hidden="true">✓ \{completed\}<\/span>/);
  assert.match(lineRound, /<span key=\{streak\} className="mm-gp-bump" aria-hidden="true">🔥 \{streak\}<\/span>/);
});

/* -------------------------------- what it costs -------------------------------- */

test('every animation the theme adds moves only transform and opacity (the compositor\'s path)', () => {
  const theme = { ...keyframesIn(GRAND_PRIX_CSS), ...keyframesIn(GP_RACE_CSS) };
  const names = Object.keys(theme);
  assert.ok(names.length >= 5, `the theme's keyframes: ${names.join(', ')}`);
  for (const [name, properties] of Object.entries(theme)) {
    const extra = [...properties].filter((property) => property !== 'transform' && property !== 'opacity');
    assert.deepEqual(extra, [], `${name} also animates ${extra.join(', ')}: it would run on the main thread`);
  }
  // The rounds' low-time pulse is one of them.
  assert.match(ruleBody(RUSH_CSS, '.mm-rush-clock-low'), /animation: mmGpPulse /);
  assert.match(ruleBody(LINE_CSS, '.mm-line-clock-low'), /animation: mmGpPulse /);
});

test('nothing that changes during a round carries a blurred shadow; the graph frames carry no blurred glow', () => {
  const changing = [
    [RUSH_CSS, ['.mm-rush-clock', '.mm-rush-clock-low', '.mm-rush-count', '.mm-rush-done', '.mm-rush-points', '.mm-rush-flash', '.mm-rush-overlay strong', '.mm-rush-dne', '.mm-rush-check']],
    [LINE_CSS, ['.mm-line-clock', '.mm-line-clock-low', '.mm-line-count', '.mm-line-done', '.mm-line-streak', '.mm-line-flash', '.mm-line-overlay strong', '.mm-line-button-primary']],
    [GP_RACE_CSS, ['.mm-gp-light[data-on="red"]', '.mm-gp-light[data-on="green"]', '.mm-gp-go', '.mm-gp-plus']],
  ];
  for (const [css, selectors] of changing) {
    for (const selector of selectors) {
      const body = ruleBody(css, selector);
      for (const property of ['box-shadow', 'text-shadow']) {
        assert.deepEqual(blurredShadows(declaration(body, property)).map((shadow) => shadow.text), [], `${selector} ${property}`);
      }
      assert.doesNotMatch(body, /filter:/, `${selector}: no filter`);
    }
  }
  // A new graph redraws its frame's edge: a rim, not a blurred glow around it.
  for (const [css, selector] of [[RUSH_CSS, '.mm-rush-graph-frame'], [LINE_CSS, '.mm-line-graph-frame']]) {
    const glows = shadowsIn(declaration(ruleBody(css, selector), 'box-shadow')).filter((shadow) => shadow.blur > 0 && shadow.x === 0 && shadow.y === 0);
    assert.deepEqual(glows.map((shadow) => shadow.text), [], `${selector}: no glow`);
  }
  // The classic round: its banner (redrawn as its lines come and go), its
  // ticking timer, the header's live score, and a student's countdown number.
  const bannerShadow = /background: roundBannerBackground\(urgent\),[\s\S]{0,400}?boxShadow: '([^']+)'/.exec(student)?.[1];
  assert.ok(bannerShadow, 'the banner has its rim');
  assert.deepEqual(blurredShadows(bannerShadow), [], 'the banner: a rim, no blur');
  const scoreShadow = /textShadow: '([^']+)'/.exec(region(student, 'data-mm-student-score="1"', '</header>', 'the live score'))?.[1];
  assert.ok(scoreShadow, 'the live score has its neon');
  assert.deepEqual(blurredShadows(scoreShadow), [], 'the live score: crisp offsets only');
  const [, urgentShadow, calmShadow] = /textShadow: urgent \? '([^']+)' : '([^']+)'/.exec(student) || [];
  assert.ok(urgentShadow && calmShadow, 'the timer has its neon');
  assert.deepEqual([...blurredShadows(urgentShadow), ...blurredShadows(calmShadow)], [], 'the timer: crisp offsets only');
  const countGlow = /const STUDENT_COUNT_GLOW = Object\.freeze\(\{[^}]*textShadow: '([^']+)'/.exec(shellParts)?.[1];
  assert.ok(countGlow, 'the countdown number has its neon');
  assert.deepEqual(blurredShadows(countGlow), [], 'the countdown number: crisp offsets only');
});

test('the arena is drawn once, on a layer of its own, behind every round — and the page around a round stays out of the app\'s layers', () => {
  const layer = arenaLayerCss('.x-shell');
  assert.match(layer, /\.x-shell \{ isolation: isolate; background: #[0-9a-f]{6}; \}/, 'its own stacking context, on the night\'s floor');
  const before = layer.slice(layer.indexOf('.x-shell::before {'));
  assert.ok(before.length > 20, 'a ::before');
  for (const needle of ['position: absolute', 'z-index: -1', 'pointer-events: none', 'will-change: transform', `background: ${ARENA_BACKGROUND};`]) {
    assert.ok(before.includes(needle), `the arena layer has ${needle}`);
  }
  // Both round screens put it behind their shell, and paint no arena of their own.
  // A shell is already a stacking context (fixed, with a z-index), so the
  // layer changes nothing about its place among the app's layers.
  for (const [name, css, selector] of [['rush', RUSH_CSS, '.mm-rush-shell'], ['line', LINE_CSS, '.mm-line-shell']]) {
    const shell = ruleBody(css, selector);
    assert.match(shell, /position: fixed;/, `${name}: a fixed shell`);
    assert.match(shell, /z-index: \d+;/, `${name}: with its own z-index`);
  }
  assert.ok(RUSH_CSS.includes("${arenaLayerCss('.mm-rush-shell')}"), 'the rush');
  assert.ok(LINE_CSS.includes("${arenaLayerCss('.mm-line-shell')}"), 'Graph the Line');
  for (const [name, source] of [['rush', rushRound], ['line', lineRound]]) {
    assert.doesNotMatch(executableSource(source), /ARENA_BACKGROUND|radial-gradient\(120% 90% at 50% 0%, #1f2a44/, `${name}: no arena painted into the round's own layer`);
  }
  // The student page: its own background, over its first screen, the floor
  // below. It holds the full-screen rounds (z-index 9000 over the app's own
  // layers), so it must never become a stacking context that would trap them.
  const page = ruleBody(GRAND_PRIX_CSS, '.mm-gp-arena-page');
  assert.equal(declaration(page, 'background'), ARENA_PAGE_BACKGROUND);
  assert.ok(ARENA_PAGE_BACKGROUND.endsWith(`, ${ARENA_FLOOR}`), 'the floor below the first screen');
  assert.equal((ARENA_PAGE_BACKGROUND.match(/top center \/ 100% 100vh no-repeat/g) || []).length, ARENA_BACKGROUND.split(/, (?=(?:repeating-)?(?:linear|radial)-gradient)/).length, 'every arena layer over the first screen only');
  assert.doesNotMatch(page, /isolation|z-index|transform|will-change|filter|opacity|contain|position/, 'no stacking context on the page');
  assert.doesNotMatch(GRAND_PRIX_CSS, /\.mm-gp-arena-page::before/, 'and no layer of its own');
  for (const css of [GRAND_PRIX_CSS, RUSH_CSS, LINE_CSS]) assert.doesNotMatch(css, /background-attachment:\s*fixed/);
});

test('reduced motion turns every effect off', () => {
  const reduced = GP_RACE_CSS.slice(GP_RACE_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(reduced.length > 30, 'the race moments honour reduced motion');
  assert.match(reduced, /\.mm-gp-points, \.mm-gp-trophy, \.mm-gp-bump \{ animation: none !important; \}/);
  // GO and the +1 are motion alone (their words are elsewhere): gone.
  assert.match(reduced, /\.mm-gp-go-flash, \.mm-gp-plus \{ display: none; \}/);
  for (const [css, clock] of [[RUSH_CSS, '.mm-rush-clock-low'], [LINE_CSS, '.mm-line-clock-low']]) {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.ok(block.includes(`${clock} { animation: none; }`), `${clock} stops pulsing`);
  }
  // Every keyframes the theme adds is used only by a rule the block turns off,
  // or by a round's low clock (above). mmGpPop: the points badge and trophy.
  for (const name of Object.keys(keyframesIn(GP_RACE_CSS))) {
    assert.ok(['mmGpPop', 'mmGpGoFlash', 'mmGpRise', 'mmGpBump', 'mmGpPulse'].includes(name), `${name} is accounted for`);
  }
});

/* ------------------------------ readable in the dark ------------------------------ */

test('the arena graph keeps its words at 4.5:1 and every mark at 3:1, each mark its own colour', () => {
  for (const words of ['label', 'axis']) {
    const ratio = contrast(ARENA_GRAPH[words], ARENA_GRAPH.bg);
    assert.ok(ratio >= 4.5, `${words} ${ratio.toFixed(2)}:1`);
  }
  for (const [mark, colour] of Object.entries(ARENA_MARKS)) {
    const ratio = contrast(colour, ARENA_GRAPH.bg);
    assert.ok(ratio >= 3, `${mark} ${ratio.toFixed(2)}:1 on the graph`);
  }
  const colours = [ARENA_GRAPH.axis, ...Object.values(ARENA_MARKS)];
  assert.equal(new Set(colours).size, colours.length, 'no mark shares a colour with another, or with the axes');
  // The rounds draw exactly these: the rush's tokens and Graph the Line's.
  for (const [token, colour] of [['--mm-rush-curve', ARENA_MARKS.curve], ['--mm-rush-found', ARENA_MARKS.found], ['--mm-rush-miss', ARENA_MARKS.miss], ['--mm-rush-asymptote', ARENA_MARKS.asymptote], ['--mm-graph-bg', ARENA_GRAPH.bg], ['--mm-focus', ARENA_MARKS.focus]]) {
    assert.ok(ARENA_RUSH_VARS.includes(`${token}: ${colour}`), `rush ${token}`);
  }
  for (const [token, colour] of [['--mm-line-draw', ARENA_MARKS.curve], ['--mm-line-right', ARENA_MARKS.found], ['--mm-line-wrong', ARENA_MARKS.miss], ['--mm-line-method', ARENA_MARKS.method], ['--mm-line-helper', ARENA_MARKS.helper], ['--mm-graph-bg', ARENA_GRAPH.bg]]) {
    assert.ok(ARENA_LINE_VARS.includes(`${token}: ${colour}`), `line ${token}`);
  }
  assert.match(RUSH_CSS, /\.mm-rush-shell \{[^`]*?\$\{ARENA_RUSH_VARS\};\n\}/, 'the rush shell sets them');
  assert.match(LINE_CSS, /\.mm-line-shell \{[^`]*?\$\{ARENA_LINE_VARS\};/, 'the line shell sets them');
});

/* ------------------------------- a round's medal ------------------------------- */

test('a round medal is for 1st, 2nd or 3rd — never for a place in the round\'s last group', () => {
  const row = (rank, extra = {}) => ({ rank, participated: true, place: { short: String(rank) }, ...extra });
  const view = (selfRank, ranks, tableBoard = null) => {
    const rows = ranks.map((rank, at) => row(rank, { isSelf: at === ranks.indexOf(selfRank) }));
    return { rows, self: rows.find((r) => r.isSelf) || null, tableBoard };
  };
  assert.equal(roundMedalPlace(view(1, [1, 2, 3, 4])), 1);
  assert.equal(roundMedalPlace(view(2, [1, 2, 3, 4])), 2);
  assert.equal(roundMedalPlace(view(3, [1, 2, 3, 4])), 3);
  assert.equal(roundMedalPlace(view(4, [1, 2, 3, 4, 5])), null, 'not a podium place');
  assert.equal(roundMedalPlace(view(3, [1, 2, 3])), null, '3rd of 3 is the last place');
  assert.equal(roundMedalPlace(view(2, [1, 2])), null, '2nd of 2 is the last place');
  assert.equal(roundMedalPlace(view(1, [1])), null, 'alone: first and last');
  assert.equal(roundMedalPlace(view(1, [1, 1])), null, 'everyone tied: tied with the last');
  // The class's copy lists the top few only: its last group comes from the summary.
  assert.equal(roundMedalPlace(view(2, [1, 2], { lastRank: 9, totalCount: 9 })), 2, 'the last group is further down the class');
  assert.equal(roundMedalPlace(view(3, [1, 2, 3], { lastRank: 3, totalCount: 5 })), null, 'tied with the class\'s last group');
  // No place, no play, nothing known: no medal.
  assert.equal(roundMedalPlace(null), null);
  assert.equal(roundMedalPlace({ self: { ...row(1), participated: false }, rows: [row(1), row(2)] }), null);
  assert.equal(roundMedalPlace({ self: { ...row(1), place: { short: '—' } }, rows: [row(1), row(2)] }), null);
  assert.equal(roundMedalPlace({ self: row(1), rows: [] }), null, 'no last place known');
  // The results card draws exactly this.
  assert.match(studentShell, /medal=\{roundMedalPlace\(view\)\}/);
});

/* ------------------------------- the race's name ------------------------------- */

test('the lobby names the race as the poster does, with three calls under it', () => {
  assert.equal(arenaGameTitle({ challengeMode: RUSH_MODE_ID }), 'Graph Feature Rush');
  assert.equal(arenaGameTitle({ challengeMode: INEQUALITY_RUSH_MODE_ID }), 'Inequality Graphing Rush');
  assert.equal(arenaGameTitle({ challengeMode: LINE_GRAPH_MODE_ID.CLASSIC }), 'Graph the Line');
  assert.equal(arenaGameTitle({ challengeMode: LINE_GRAPH_MODE_ID.SPRINT }), 'Graph the Line Sprint');
  assert.equal(arenaGameTitle({ challengeMode: LINE_GRAPH_MODE_ID.RUSH }), 'Graph the Line Rush');
  assert.equal(arenaGameTitle({ challengeMode: 'solverRace' }), 'Solver Race');
  assert.equal(arenaGameTitle({ challengeMode: 'standard' }), 'Live Challenge');
  assert.equal(arenaGameTitle({}), 'Live Challenge');
  assert.equal(arenaGameTitle(null), 'Live Challenge');
  assert.deepEqual(arenaTagline({ challengeMode: RUSH_MODE_ID }), ['Find the features', 'Earn points', 'Race to the podium']);
  assert.deepEqual(arenaTagline({ challengeMode: INEQUALITY_RUSH_MODE_ID })[0], 'Graph the solutions');
  assert.deepEqual(arenaTagline({ challengeMode: LINE_GRAPH_MODE_ID.SPRINT })[0], 'Graph the lines');
  assert.deepEqual(arenaTagline({ challengeMode: 'solverRace' })[0], 'Solve it fast');
  assert.deepEqual(arenaTagline({})[0], 'Answer fast');
  // The lobby: the name, "Grand Prix" only for a Grand Prix game, the calls,
  // and still the plain words of what to do and how the game plays.
  const lobby = region(studentShell, 'export function StudentLobbyCard(', '\n}\n', 'the lobby');
  assert.match(lobby, /const title = arenaGameTitle\(room\);/);
  assert.match(lobby, /\{room\?\.scoringStrategyId === 'grandPrix' && \(/);
  assert.match(lobby, /\{arenaTagline\(room\)\.map\(\(words\) => <span key=\{words\}>\{words\}<\/span>\)\}/);
  assert.match(lobby, /Waiting for your teacher to start\. Keep this screen open\./);
  assert.match(lobby, /\{lobbyGameWords\(room\)\}/);
});
