/*
 * THE GRAND PRIX LOOK: the student side of every Live Challenge, dressed as a
 * neon race night — deep navy and purple, cyan and magenta light, gold for
 * points, a checkered flag, start lights and a GO.
 *
 * WHAT IT COSTS, ON PURPOSE NOTHING MUCH:
 *   - no images, no web fonts, no libraries: gradients, borders and the
 *     system font set in a heavy italic. Everything here is a string of CSS.
 *   - painted once: behind a full-screen round the arena sits on a
 *     compositor layer of its own (arenaLayerCss), so nothing that changes
 *     above it — a new graph, a tick of the clock — ever draws it again;
 *     every glow is static. No backdrop-filter, no blur layers, no animated
 *     shadows or filters.
 *   - no blur on anything that changes during a round. A blurred glow is the
 *     one costly thing to draw, and drawing it again on every tick, step or
 *     finished graph is what a slow Chromebook would feel: the clocks, the
 *     counts and the live score, the countdowns, the lights, GO, the +1, the
 *     buttons, the classic banner and the graph frames all use crisp edges
 *     and offset shadows instead. (Measured with the CPU slowed 4x: steady
 *     play costs what it did before the theme, a round's moments close to it
 *     — docs/architecture/live-challenge-shell.md, "The Grand Prix look".)
 *   - motion only on an event, and only transform and opacity (the
 *     compositor's cheap path; one other property in a keyframe would put the
 *     whole animation back on the main thread): a round's lights and GO, a
 *     finished graph, points earned. Nothing loops but what already did (the
 *     lobby's "players in" dot) and a clock's last ten seconds.
 *   - no timing of its own: every effect is keyed to state the screens
 *     already have (the server-anchored countdown step, a feedback event), so
 *     every student's lights change on the same second, as their numbers do,
 *     and no effect holds a student up: each fits inside a moment the game
 *     already had (a finished graph's flash, the GO).
 *   - prefers-reduced-motion turns every animation here off; nothing is
 *     conveyed by motion or colour alone.
 *
 * Pure: strings and one small function. The screens put the strings in a
 * <style>; node tests read them (tests/platform/grandPrixTheme.test.mjs).
 */

// The poster's colours.
export const GP = Object.freeze({
  navy: '#080c2a',
  ink: '#0a1034',
  purple: '#2a0f5c',
  cyan: '#35e3ff',
  blue: '#3d7bff',
  magenta: '#ff3fd1',
  gold: '#ffd23f',
  goldDeep: '#ff9d00',
  green: '#45ff8a',
  red: '#ff3d5a',
  text: '#eef2ff',
  muted: '#b8c4ef',
});

/*
 * The arena behind a game: three soft lights (magenta overhead, cyan and blue
 * from the sides) over a navy-to-black night, and a faint track grid that
 * fades out toward the top. Top layer first: the lights, then the fade (the
 * night's own colours, so only the grid fades), the grid, the night. One
 * background value: painted once.
 */
const ARENA_LAYERS = Object.freeze([
  'radial-gradient(60% 45% at 50% -8%, rgba(255,63,209,.38), transparent 70%)',
  'radial-gradient(45% 40% at 0% 18%, rgba(53,227,255,.22), transparent 70%)',
  'radial-gradient(45% 40% at 100% 22%, rgba(61,123,255,.26), transparent 70%)',
  'linear-gradient(to bottom, rgba(22,11,69,1) 0%, rgba(13,15,57,.55) 30%, rgba(10,16,52,0) 55%)',
  'repeating-linear-gradient(90deg, rgba(53,227,255,.07) 0 1px, transparent 1px 64px)',
  'repeating-linear-gradient(0deg, rgba(53,227,255,.07) 0 1px, transparent 1px 64px)',
  'linear-gradient(180deg, #160b45 0%, #0a1034 42%, #060818 100%)',
]);
// The night's last colour: under the arena, and below it on a long page.
export const ARENA_FLOOR = '#060818';
export const ARENA_BACKGROUND = ARENA_LAYERS.join(', ');

/*
 * THE ARENA ON A LAYER OF ITS OWN, behind a full-screen round's content
 * (`selector`, a round's shell): a ::before the compositor keeps
 * (will-change), drawn once and never again when anything above it changes.
 * Drawn into the same layer as the round, its seven gradients were redrawn
 * under every new graph — measured, that was most of the theme's cost.
 *
 * The layer sits under the content inside the shell's own stacking context —
 * which a round's shell already is (fixed, z-index 9000), so nothing about its
 * place among the app's layers changes. Never for the student page around it
 * (ARENA_PAGE_BACKGROUND): a stacking context there would trap the round,
 * rendered inside the page, under the app's own layers.
 */
export const arenaLayerCss = (selector) => `
${selector} { isolation: isolate; background: ${ARENA_FLOOR}; }
${selector}::before {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: ${ARENA_BACKGROUND};
  will-change: transform;
}
`;

/*
 * The arena behind the student page, which scrolls: its own background, over
 * its first screen's height, the floor below — never stretched down a long
 * page, and never background-attachment: fixed (which repaints on every
 * scroll). Not a layer of its own (see arenaLayerCss): what changes on the
 * page is small (a clock's digits, a typed answer), and the page must not
 * become a stacking context.
 */
export const ARENA_PAGE_BACKGROUND = `${ARENA_LAYERS.map((layer) => `${layer} top center / 100% 100vh no-repeat`).join(', ')}, ${ARENA_FLOOR}`;

/*
 * A graph or number line on the arena: dark glass with neon lines — the
 * poster's graphs. Scoped to a game's own screen (its shell's rule), so
 * nothing else on the platform changes. The words on it (labels, axes) keep
 * 4.5:1 on the ground; every mark keeps 3:1.
 */
export const ARENA_GRAPH = Object.freeze({
  bg: '#0b1240',
  grid: 'rgba(110,150,255,.24)',
  gridMinor: 'rgba(110,150,255,.11)',
  axis: '#b4c2ff',
  label: '#e4e9ff',
  highlight: '#ffd23f',
});

/*
 * What a game draws on it, each in its own colour: the curve (and the
 * student's line) cyan, a found point (a right line) green, a miss red, an
 * asymptote magenta, a slip in method orange, a helper purple — and the
 * keyboard cursor and focus ring white, which none of them is.
 */
export const ARENA_MARKS = Object.freeze({
  curve: '#35e3ff',
  found: '#45ff8a',
  miss: '#ff5d73',
  asymptote: '#ff7ae0',
  method: '#ffb020',
  helper: '#c58af9',
  focus: '#ffffff',
});

// The graph's own tokens (src/theme/tokens.css), for a game's shell rule.
export const ARENA_GRAPH_VARS = [
  `--mm-graph-bg: ${ARENA_GRAPH.bg}`,
  `--mm-graph-grid: ${ARENA_GRAPH.grid}`,
  `--mm-graph-grid-minor: ${ARENA_GRAPH.gridMinor}`,
  `--mm-graph-axis: ${ARENA_GRAPH.axis}`,
  `--mm-graph-label: ${ARENA_GRAPH.label}`,
  `--mm-graph-highlight: ${ARENA_GRAPH.highlight}`,
  `--mm-focus: ${ARENA_MARKS.focus}`,
].join('; ');

// Graph Feature Rush and Inequality Graphing Rush (GraphFeatureRushRound).
export const ARENA_RUSH_VARS = [
  ARENA_GRAPH_VARS,
  `--mm-rush-curve: ${ARENA_MARKS.curve}`,
  `--mm-rush-found: ${ARENA_MARKS.found}`,
  `--mm-rush-miss: ${ARENA_MARKS.miss}`,
  `--mm-rush-asymptote: ${ARENA_MARKS.asymptote}`,
].join('; ');

// Graph the Line (LineGraphRound).
export const ARENA_LINE_VARS = [
  ARENA_GRAPH_VARS,
  `--mm-line-draw: ${ARENA_MARKS.curve}`,
  `--mm-line-given: ${ARENA_MARKS.curve}`,
  `--mm-line-right: ${ARENA_MARKS.found}`,
  `--mm-line-wrong: ${ARENA_MARKS.miss}`,
  `--mm-line-method: ${ARENA_MARKS.method}`,
  `--mm-line-helper: ${ARENA_MARKS.helper}`,
].join('; ');

// A checkered flag strip, as a background (a conic gradient: no image).
export const CHECKER = 'repeating-conic-gradient(#f4f6ff 0 25%, #11142a 0 50%) 0 0 / 14px 14px';

/*
 * The start lights over a countdown: three pods, lit red one more each second
 * of 3 · 2 · 1, all green at GO. `step` is the countdown step the screen
 * already shows, off the round's one server-anchored clock — so every
 * student's lights change on the same second as their number. Anything else
 * (no step yet) leaves them dark.
 */
export const startLights = ({ step = null, go = false } = {}) => {
  if (go === true) return Object.freeze(['green', 'green', 'green']);
  const value = Number(step);
  const lit = Number.isInteger(value) && value >= 1 && value <= 3 ? 4 - value : 0;
  return Object.freeze([0, 1, 2].map((pod) => (pod < lit ? 'red' : null)));
};

/*
 * THE RACE MOMENTS, for every screen a student races on. The rush and line
 * screens carry their own copy in their stylesheets, so a teacher's practice
 * (which has no student page around it) gets them too; a repeated rule costs
 * nothing.
 *
 *   .mm-gp-lights / .mm-gp-light   the start lights (StartLights.jsx)
 *   .mm-gp-go                      GO, in green
 *   .mm-gp-go-flash                GO over a round's first second: no taps
 *                                  caught, faded out to nothing after
 *   .mm-gp-plus                    a gold +1 rising off a finished item, inside
 *                                  the flash the game already shows
 *   .mm-gp-bump                    a count that went up, popping once
 *   mmGpPulse                      a clock's last ten seconds (each screen's
 *                                  own low-time rule uses it)
 */
export const GP_RACE_CSS = `
/* A lit pod: a bright core and a crisp halo ring (a spread, not a blur). */
.mm-gp-lights { display: inline-flex; justify-self: center; gap: 10px; padding: 8px 12px; border-radius: 14px; background: #05060f; border: 2px solid #222a4f; }
.mm-gp-light { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #3a3f55, #15182a 70%); }
.mm-gp-light[data-on="red"] { background: radial-gradient(circle at 35% 30%, #ffe3e7 0%, #ff3d5a 42%, #b3122c 78%); box-shadow: 0 0 0 3px rgba(255,61,90,.4); }
.mm-gp-light[data-on="green"] { background: radial-gradient(circle at 35% 30%, #e6fff0 0%, #45ff8a 42%, #12a148 78%); box-shadow: 0 0 0 3px rgba(69,255,138,.4); }
.mm-gp-go { font-style: italic; font-weight: 1000; text-transform: uppercase; display: inline-block; transform: skewX(-8deg); color: ${GP.green}; text-shadow: 3px 3px 0 rgba(53,227,255,.55), 0 6px 0 #06301a; }
/* As big as what it shows, centred on the screen it covers: a small layer.
   It ends at opacity 0 and stays (the compositor draws nothing for it). */
.mm-gp-go-flash { position: absolute; left: 50%; top: 50%; z-index: 3; display: grid; justify-items: center; gap: 10px; pointer-events: none; transform: translate(-50%, -50%); animation: mmGpGoFlash 800ms ease-out forwards; }
.mm-gp-go-flash .mm-gp-go { font-size: clamp(56px, 16vmin, 120px); line-height: 1; }
.mm-gp-plus {
  position: absolute; left: 50%; top: 40%; z-index: 3; pointer-events: none;
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 12px;
  background: linear-gradient(180deg, #ffe680 0%, #ffc21a 55%, #f59f00 100%); color: #2b1700;
  border: 2px solid #fff3b0; box-shadow: 0 4px 0 #a86400;
  font-size: clamp(22px, 5vmin, 34px); font-weight: 1000; font-style: italic; line-height: 1;
  animation: mmGpRise 420ms ease-out forwards;
}
.mm-gp-plus::before { content: "★"; font-style: normal; }
.mm-gp-bump { display: inline-block; animation: mmGpBump 380ms cubic-bezier(.2,.9,.3,1.4); }
@keyframes mmGpPop { from { transform: scale(.6) rotate(-3deg); opacity: 0; } to { opacity: 1; } }
@keyframes mmGpGoFlash {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.7); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
  60% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.04); }
}
@keyframes mmGpRise {
  0% { opacity: 0; transform: translate(-50%, 12px) scale(.6); }
  25% { opacity: 1; transform: translate(-50%, -4px) scale(1.12); }
  65% { opacity: 1; transform: translate(-50%, -22px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -44px) scale(1); }
}
@keyframes mmGpBump { from { transform: scale(1.45); } to { transform: scale(1); } }
@keyframes mmGpPulse { 50% { transform: scale(1.08); } }
@media (prefers-reduced-motion: reduce) {
  .mm-gp-points, .mm-gp-trophy, .mm-gp-bump { animation: none !important; }
  .mm-gp-go-flash, .mm-gp-plus { display: none; }
}
`;

/*
 * The cards around a game (lobby, results, final) and the student page's
 * pieces. A game's own screen adds its specifics to its own stylesheet
 * (GraphFeatureRushRound, LineGraphRound).
 */
export const GRAND_PRIX_CSS = `
/* The student page (LiveChallengeStudent): the arena over its first screen, as
   its own background — no stacking context (ARENA_PAGE_BACKGROUND). */
.mm-gp-arena-page { background: ${ARENA_PAGE_BACKGROUND}; }
.mm-gp-title {
  margin: 0; font-style: italic; font-weight: 1000; text-transform: uppercase; letter-spacing: .01em; line-height: .95;
  display: inline-block; transform: skewX(-6deg);
  background: linear-gradient(180deg, #ffffff 0%, #dbe6ff 42%, #7d93d8 52%, #f2f6ff 74%, #aebdf0 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 10px rgba(255,63,209,.45)) drop-shadow(0 2px 0 rgba(10,16,52,.9));
}
.mm-gp-title-gold {
  background: linear-gradient(180deg, #fff6c2 0%, #ffd23f 45%, #ff9d00 70%, #ffe27a 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 10px rgba(255,157,0,.45)) drop-shadow(0 2px 0 rgba(10,16,52,.9));
}
.mm-gp-banner {
  display: inline-block; padding: 7px 18px; border-radius: 10px; transform: skewX(-8deg);
  background: linear-gradient(180deg, rgba(20,30,90,.95), rgba(10,16,52,.95));
  border: 2px solid ${GP.cyan}; box-shadow: 0 0 14px rgba(53,227,255,.45), inset 0 0 10px rgba(53,227,255,.18);
  font-style: italic; font-weight: 1000; text-transform: uppercase; letter-spacing: .02em; color: #fff;
}
.mm-gp-banner b { color: ${GP.gold}; font-weight: 1000; }
.mm-gp-checker { display: inline-block; width: 28px; height: 14px; background: ${CHECKER}; border-radius: 2px; vertical-align: -1px; }
.mm-gp-card {
  position: relative; overflow: hidden; text-align: center; color: ${GP.text};
  border-radius: 18px; padding: clamp(18px, 4vw, 28px);
  background: linear-gradient(160deg, rgba(42,15,92,.92) 0%, rgba(12,20,70,.94) 55%, rgba(8,12,42,.96) 100%);
  border: 1px solid rgba(53,227,255,.45);
  box-shadow: 0 0 0 1px rgba(255,63,209,.18), 0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
}
/* The checkered flag across a card's top corners (a masked conic gradient, painted once). */
.mm-gp-flagged::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 14px; pointer-events: none;
  background: ${CHECKER}; opacity: .88;
  -webkit-mask-image: linear-gradient(90deg, #000 0 16%, transparent 34% 66%, #000 84%);
  mask-image: linear-gradient(90deg, #000 0 16%, transparent 34% 66%, #000 84%);
}
.mm-gp-eyebrow { font-size: calc(13 * var(--mm-px)); font-weight: 1000; font-style: italic; text-transform: uppercase; letter-spacing: .1em; color: ${GP.cyan}; }
.mm-gp-plate {
  display: inline-block; padding: 6px 18px; border-radius: 10px; transform: skewX(-8deg);
  background: linear-gradient(180deg, #ff4d6d 0%, #c8102e 100%); color: #fff;
  border: 2px solid rgba(255,255,255,.85); box-shadow: 0 4px 0 rgba(0,0,0,.35);
  font-style: italic; font-weight: 1000; letter-spacing: .01em; overflow-wrap: anywhere;
}
.mm-gp-tagline { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; font-style: italic; font-weight: 1000; text-transform: uppercase; letter-spacing: .03em; }
.mm-gp-tagline span:nth-child(1) { color: ${GP.gold}; }
.mm-gp-tagline span:nth-child(2) { color: ${GP.cyan}; }
.mm-gp-tagline span:nth-child(3) { color: #ff7ae0; }
.mm-gp-tagline span + span::before { content: "•"; margin-right: 12px; color: rgba(255,255,255,.55); }
/* A phone stacks the three calls: a wrapped line never starts with a bullet. */
@media (max-width: 480px) {
  .mm-gp-tagline { flex-direction: column; gap: 2px; }
  .mm-gp-tagline span + span::before { content: none; }
}
.mm-gp-points {
  display: inline-flex; align-items: center; gap: 8px; padding: 7px 16px; border-radius: 12px; transform: rotate(-3deg);
  background: linear-gradient(180deg, #ffe680 0%, #ffc21a 55%, #f59f00 100%); color: #2b1700;
  border: 2px solid #fff3b0; box-shadow: 0 4px 0 #a86400, 0 0 16px rgba(255,194,26,.45);
  font-weight: 1000; font-style: italic; text-transform: uppercase; letter-spacing: .01em;
  animation: mmGpPop 460ms cubic-bezier(.2,.9,.3,1.35) both;
}
.mm-gp-points::before { content: "★"; font-style: normal; }
.mm-gp-medal { display: inline-grid; place-items: center; width: 1.9em; height: 1.9em; border-radius: 50%; font-weight: 1000; color: #2b1700; box-shadow: 0 0 0 3px rgba(255,255,255,.75), 0 0 14px rgba(255,210,63,.5); }
.mm-gp-medal[data-place="1"] { background: radial-gradient(circle at 35% 30%, #fff6c2, #ffc21a 55%, #c98700); }
.mm-gp-medal[data-place="2"] { background: radial-gradient(circle at 35% 30%, #ffffff, #c9d3e8 55%, #8a96b3); }
.mm-gp-medal[data-place="3"] { background: radial-gradient(circle at 35% 30%, #ffe1c4, #e0975a 55%, #9c5a24); }
.mm-gp-trophy { display: inline-grid; place-items: center; width: 84px; height: 84px; border-radius: 50%; font-size: 46px; line-height: 1; background: radial-gradient(circle at 50% 40%, rgba(255,210,63,.35), rgba(255,210,63,0) 70%); animation: mmGpPop 520ms cubic-bezier(.2,.9,.3,1.35) both; }
${GP_RACE_CSS}`;
