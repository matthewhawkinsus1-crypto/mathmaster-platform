/*
 * A WHEEL'S LEVEL, TOLD BY ITS FILL AS WELL AS ITS COLOUR (WCAG 1.4.1).
 *
 * My Math Path's mastery wheel and the CCMR readiness wheel told a level apart
 * on the wheel by colour alone in the app's own themes: a student who cannot
 * tell green from yellow, or the readiness wheel's two ambers apart, read the
 * level only from a wedge's name or the list under the wheel. A contrast theme
 * already told the levels apart by fill (MASTERY_STATUS_FILLS,
 * DOMAIN_STATE_FILLS; src/theme/forcedColors.css): solid, hatched rising,
 * hatched falling, cross-hatched, hatched level, and empty. The app's themes
 * now draw the same fills over the same colours:
 *
 *   solid         the level's colour (Mastered, Strong)
 *   hatch-…       the level's colour, crossed by lines of WHEEL_HATCH_INK
 *                 running as a contrast theme runs them
 *   open          empty: the card's own surface inside an edge (Not Enough
 *                 Evidence; a readiness domain ready but not yet practised)
 *   muted         empty inside a dashed edge (a readiness domain with nothing
 *                 matched yet, which cannot be chosen)
 *
 * A key's swatch is drawn the same way (wheelSwatchStyle), in the dashboard's
 * colour key, the wheel's topic list and the readiness list. Under a contrast
 * theme the stylesheet draws each wedge and swatch by its fill, as before: a
 * pattern's colour is a plate there and its lines the text colour, and the
 * wedges themselves are painted by their fill (data-mm-plane-part).
 *
 * Only the wheels load this (My Math Path's own screen), never the first load.
 * The patterns themselves are drawn by WheelHatches.jsx.
 */
// The hatch's lines: a near-black (the dark theme's page colour) that keeps
// 3:1 or more against every colour a level is hatched in, at the wedge's own
// 90% opacity, over the light theme's card and the dark theme's (3.35:1 on
// the transfer gap's red, the least; wheelFills.test.mjs measures each). Not
// a theme token: a level's colour is the same in both themes, so the ink that
// reads on it is too, and every token turns light in the dark theme.
export const WHEEL_HATCH_INK = '#111318';

// An empty level's edge: 4.8:1 on the light card and 7.4:1 on the dark one at
// the wedge's 90%.
export const WHEEL_EMPTY_EDGE = 'var(--mm-text-muted)';
// A muted level's edge is dashed: on a wheel a dash is no boundary, and it is
// what tells "nothing matched yet" from "ready, not practised" without colour.
export const WHEEL_MUTED_DASH = '3 2.5';

// One hatch tile, as a contrast theme draws it: 1.5px lines 6px apart.
export const WHEEL_HATCH_TILE = 6;
export const WHEEL_HATCH_LINE = 1.5;

/*
 * Each hatch's lines. In the wheel, a tile's upright line turned by `rotate`
 * (SVG turns clockwise: 45° makes "/", rising) and its level line with it;
 * in a key's swatch, a CSS gradient at `swatch` (whose stripes run square to
 * its angle: -45deg makes "/"). Both run as the stylesheet's mask for the same
 * fill (forcedColors.css: hatch-rise -45deg, hatch-fall 45deg, hatch-level 0deg).
 */
export const WHEEL_HATCHES = Object.freeze({
  'hatch-rise': Object.freeze({ rotate: 45, lines: Object.freeze(['upright']), swatch: Object.freeze([-45]) }),
  'hatch-fall': Object.freeze({ rotate: -45, lines: Object.freeze(['upright']), swatch: Object.freeze([45]) }),
  'hatch-cross': Object.freeze({ rotate: 45, lines: Object.freeze(['upright', 'level']), swatch: Object.freeze([-45, 45]) }),
  'hatch-level': Object.freeze({ rotate: 0, lines: Object.freeze(['level']), swatch: Object.freeze([0]) }),
});

const EMPTY_FILLS = Object.freeze(['open', 'muted']);

/** The id of the pattern a hatched level of `colour` is filled with, in a wheel whose ids start with `scope`. */
export const wheelPatternId = (scope, fill, colour) => `${scope}-${fill}-${String(colour).replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * How a wedge of a level is painted in the app's themes: its `paint` (a
 * colour, or its hatch's pattern), and for an empty level an `edge` (dashed
 * where `dash`), which takes the place of the gap the other wedges cut in the
 * card's surface.
 */
export const wedgePaint = ({ scope, fill, colour }) => {
  if (WHEEL_HATCHES[fill]) return { paint: `url(#${wheelPatternId(scope, fill, colour)})`, edge: null, dash: null };
  if (EMPTY_FILLS.includes(fill)) return { paint: 'var(--mm-surface)', edge: WHEEL_EMPTY_EDGE, dash: fill === 'muted' ? WHEEL_MUTED_DASH : null };
  return { paint: colour, edge: null, dash: null };
};

/**
 * A key's swatch of a level, drawn as its wedge: its colour, hatched the same
 * way, or empty inside an edge (dashed where muted). A style for the swatch's
 * box (its size and shape are the caller's).
 */
export const wheelSwatchStyle = ({ fill, colour }) => {
  const hatch = WHEEL_HATCHES[fill];
  if (hatch) {
    const lines = hatch.swatch.map((angle) => `repeating-linear-gradient(${angle}deg, ${WHEEL_HATCH_INK} 0 1.5px, transparent 1.5px 4px)`);
    return { background: `${lines.join(', ')}, ${colour}`, border: '1px solid var(--mm-border-strong)' };
  }
  if (EMPTY_FILLS.includes(fill)) return { background: 'var(--mm-surface)', border: `1px ${fill === 'muted' ? 'dashed' : 'solid'} ${WHEEL_EMPTY_EDGE}` };
  return { background: colour, border: '1px solid var(--mm-border-strong)' };
};
