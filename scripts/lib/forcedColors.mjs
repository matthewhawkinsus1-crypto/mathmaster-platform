/*
 * FORCED COLOURS — the pure half of the forced-colours walk
 * (tests/browser/forcedColorsAudit.mjs reads the page; this file judges what it
 * read, so node can test every verdict).
 *
 * Windows' contrast themes (forced colours) replace a page's colours with the
 * user's own system colours: every text and border colour becomes one of a few
 * (CanvasText, ButtonText, LinkText, Highlight...), every background Canvas, and
 * box-shadows and gradient backgrounds are not drawn at all. Students with low
 * vision use them on school laptops. Whatever a screen showed only by a colour,
 * a background, a shadow or a gradient is gone there. The walk reads each
 * control twice, as the screen draws it and under forced colours, and asks
 * three things:
 *
 *   mm-forced-focus-not-drawn   a Tab stop shows no focus indicator: its ring
 *                               was a box-shadow, or a background, or an outline
 *                               set to none with nothing else.
 *   mm-forced-state-colour-only a selected, pressed, checked or current control
 *                               looks the same as one of its kind that is not:
 *                               the state was shown only by colour or background.
 *   mm-forced-edge-lost         a control whose edge was drawn by its background,
 *                               a gradient or a shadow has no border or outline
 *                               left, so its edge is gone.
 *   mm-forced-math-colour-kept  a formula is not drawn in the colour the theme
 *                               gives the text around it: it kept another one.
 *   mm-forced-plane-paint       a coordinate plane (an SVG drawing, whose paint
 *                               forced colours leave alone) is not drawn in the
 *                               theme's colours: its board is not Canvas, or a
 *                               line, mark or word kept a colour of its own, is
 *                               translucent, or is under 3:1 against Canvas, or
 *                               its focus ring is not a colour of the theme.
 *   mm-forced-drawing-paint     any other drawing that says something (a number
 *                               line, a mapping diagram, the 3D model, a progress
 *                               wheel, a line drawn over the page) is not drawn
 *                               in the theme's colours, judged as a plane is,
 *                               focused and with a part of it focused too.
 *
 * Each finding is shaped like an axe violation (id, impact, help, nodes), as the
 * Tab walk's are (scripts/lib/keyboardReach.mjs).
 */
import { focusIndicator } from './keyboardReach.mjs';

const WCAG = 'https://www.w3.org/WAI/WCAG21/Understanding';

export const FORCED_COLORS_RULES = Object.freeze({
  'mm-forced-focus-not-drawn': {
    impact: 'serious',
    help: 'Under forced colours every Tab stop must still draw a focus indicator (an outline or a border, not a box-shadow or a background)',
    helpUrl: `${WCAG}/focus-visible.html`,
  },
  'mm-forced-state-colour-only': {
    impact: 'serious',
    help: 'Under forced colours a selected, pressed, checked or current control must still look different from one that is not (not only by colour or background)',
    helpUrl: `${WCAG}/use-of-color.html`,
  },
  'mm-forced-edge-lost': {
    impact: 'serious',
    help: 'Under forced colours a control whose edge was its background, gradient or shadow must keep a visible edge (a border or an outline)',
    helpUrl: `${WCAG}/non-text-contrast.html`,
  },
  'mm-forced-math-colour-kept': {
    impact: 'serious',
    help: 'Under forced colours a formula must be drawn in the colour the theme gives the text around it, after a switch of contrast theme too, not in a colour it kept',
    helpUrl: `${WCAG}/contrast-minimum.html`,
  },
  'mm-forced-plane-paint': {
    impact: 'serious',
    help: 'Under forced colours a coordinate plane must be drawn in the theme\'s colours: its board Canvas, every line, mark and word an opaque colour of the theme at 3:1 or more against Canvas, and its focus ring a colour of the theme',
    helpUrl: `${WCAG}/non-text-contrast.html`,
  },
  'mm-forced-drawing-paint': {
    impact: 'serious',
    help: 'Under forced colours every other drawing (a number line, a mapping diagram, the 3D model, a progress wheel, a line drawn over the page) must be drawn in the theme\'s colours, as a plane is: its board Canvas or clear, every line, mark and word an opaque colour of the theme at 3:1 or more against Canvas, and its focus ring a colour of the theme',
    helpUrl: `${WCAG}/non-text-contrast.html`,
  },
});

export const FORCED_COLORS_RULE_IDS = Object.freeze(Object.keys(FORCED_COLORS_RULES));

// ------------------------------------------------------------------ colours
/** [r, g, b, a] from a computed colour: rgb(), rgba(), color(srgb ...) or `transparent`. */
export const parseColour = (value) => {
  const text = String(value || '').trim();
  if (!text || text === 'transparent') return [0, 0, 0, 0];
  const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\s*\)$/.exec(text);
  if (srgb) {
    const alpha = srgb[4] == null ? 1 : (srgb[4].endsWith('%') ? Number(srgb[4].slice(0, -1)) / 100 : Number(srgb[4]));
    return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, alpha];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (!rgb) return null;
  const alpha = rgb[4] == null ? 1 : (rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]));
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number.isFinite(alpha) ? alpha : 1];
};

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];

// A background tells a box from what is behind it when the two differ by this
// much: #f1f3f4 on white (1.11:1) is a grey key a person sees; #f8f9fa (1.05:1)
// is a tint few do.
export const EDGE_RATIO = 1.1;

const visibleColour = (value) => (parseColour(value)?.[3] ?? 0) > 0.1;
const drawnLine = (style, width, colour) => style && style !== 'none' && style !== 'hidden' && parseFloat(width) >= 1 && visibleColour(colour);

/**
 * What draws a box's edge, from one reading of it (the in-page `boxFacts`):
 * the sides its border draws, an outline, a background that differs from what
 * is behind it (or a background image), a shadow, and a box just around it that
 * draws all four sides (`wrapped`: a search pill around its field).
 */
export const edgeOf = (facts) => {
  if (!facts) return { border: 0, outline: false, background: false, image: false, shadow: false, wrapped: false, any: false };
  const border = (facts.sides || []).filter((side) => drawnLine(side.style, side.width, side.colour)).length;
  const outline = Boolean(drawnLine(facts.outline?.style, facts.outline?.width, facts.outline?.colour));
  const own = parseColour(facts.background);
  const behind = parseColour(facts.behind) || [255, 255, 255, 1];
  const background = Boolean(own && own[3] > 0 && contrastRatio(over(own, behind), behind) >= EDGE_RATIO);
  const image = Boolean(facts.gradient);
  const shadow = Boolean(facts.shadow);
  const wrapped = Boolean(facts.wrapped);
  return { border, outline, background, image, shadow, wrapped, any: border > 0 || outline || background || image || shadow };
};

/**
 * mm-forced-edge-lost: the control showed an edge on screen that was not a border
 * or an outline (its background, a gradient, a shadow), and under forced colours
 * it has no border, outline or background of its own left, and no box just
 * around it that draws one.
 */
export const edgeLost = ({ normal, forced }) => {
  const before = edgeOf(normal);
  const after = edgeOf(forced);
  if (!before.any) return false;
  // A border or an outline is never taken away by forced colours, only recoloured.
  if (before.border > 0 || before.outline) return false;
  return !(after.border > 0 || after.outline || after.background || after.wrapped);
};

// ------------------------------------------------------------------ states
// A background as a person sees it: the colour it paints over what is behind
// it, or nothing when the two cannot be told apart. Under forced colours a
// selected pill's opaque Canvas on the Canvas around it is no background at
// all, the same as its neighbour's transparent one.
const seenBackground = (background, behind) => {
  const own = parseColour(background);
  if (!own || own[3] <= 0) return '-';
  const under = parseColour(behind) || [255, 255, 255, 1];
  const painted = over(own, under);
  return contrastRatio(painted, under) >= EDGE_RATIO ? `rgb(${painted.map((c) => Math.round(c)).join(', ')})` : '-';
};

// What a box looks like apart from its words: each part (the box, its ::before
// and ::after, each descendant that is drawn) as one line of its traits. Words
// differ between any two controls (their labels), so text is left out; the
// glyphs that mark a state are read on their own (STATE_GLYPHS). A weight of
// 600 and one of 800 are both bold to the eye: a weight counts as a mark only
// across that line.
const traitLine = (part) => [
  part.kind,
  `b:${(part.sides || []).map((side) => (drawnLine(side.style, side.width, side.colour) ? `${Math.round(parseFloat(side.width))}${side.style}/${side.colour}` : '-')).join(' ')}`,
  `o:${drawnLine(part.outline?.style, part.outline?.width, part.outline?.colour) ? `${part.outline.style}${Math.round(parseFloat(part.outline.width))}/${part.outline.colour}` : '-'}`,
  `bg:${seenBackground(part.background, part.behind)}`,
  `img:${part.gradient ? 'y' : '-'}${part.urlImage ? 'u' : ''}`,
  `sh:${part.shadow ? 'y' : '-'}`,
  `c:${part.colour}`,
  `fw:${Number(part.fontWeight) >= 550 ? 'bold' : 'normal'}`,
  `fs:${part.fontStyle}`,
  `td:${part.textDecoration}`,
  `op:${Math.round(Number(part.opacity ?? 1) * 10)}`,
  `tf:${part.transform || 'none'}`,
  part.content ? `ct:${part.content}` : '',
  part.fill ? `fill:${part.fill}` : '',
  part.stroke ? `stroke:${part.stroke}` : '',
].join('|');

export const traitsOf = (facts) => (facts?.parts || []).map(traitLine);

// Glyphs and words that say a state in the text itself: a check mark, a filled
// dot, "Selected".
export const STATE_GLYPHS = /[✓✔☑●◉★✕✗]|\b(selected|current|chosen|pressed)\b/i;

/** The traits one box has and the other has not, both ways (sets: a label's own structure is not a state). */
export const traitDifference = (on, off) => {
  const a = new Set(traitsOf(on));
  const b = new Set(traitsOf(off));
  return [...a].filter((line) => !b.has(line)).concat([...b].filter((line) => !a.has(line)));
};

/**
 * mm-forced-state-colour-only, for one control in a state (selected, pressed,
 * checked, current) and one of its kind in the same group that is not:
 *
 *   'colour-only'   on screen the two looked different; under forced colours
 *                   nothing tells them apart.
 *   'shown'         under forced colours they still differ (a border, a weight,
 *                   an icon, a system colour the screen chose).
 *   'not-shown'     they look the same on screen too: not a forced-colours loss
 *                   (the state may be said in words), so not judged here.
 */
export const stateVerdict = ({ normal, forced }) => {
  const glyph = (facts) => STATE_GLYPHS.test(facts?.on?.text || '') && !STATE_GLYPHS.test(facts?.off?.text || '');
  if (glyph(forced)) return 'shown';
  const forcedDiff = traitDifference(forced?.on, forced?.off);
  if (forcedDiff.length) return 'shown';
  const normalDiff = traitDifference(normal?.on, normal?.off);
  return normalDiff.length ? 'colour-only' : 'not-shown';
};

// ------------------------------------------------------------------ focus
/*
 * A focus snapshot (keyboardReach.mjs snap, with each part's `behind` and its
 * bottom border's width) as it is DRAWN under forced colours. Chromium reports
 * values it does not paint there: a box-shadow; an outline colour, which it
 * turns to Highlight on a focused control even while the outline's style is
 * none; a border colour with no border; and a fill that is the page's own
 * Canvas, opaque on focus and transparent when blurred, the same to the eye.
 * Read as reported, each was a change on focus, and a ring that was a shadow,
 * or a focus shown by a tint, passed (forcedColorsSelfTest.mjs plants both).
 */
const asDrawn = (snapshot) => (snapshot ? Object.fromEntries(Object.entries(snapshot).map(([part, keys]) => {
  if (!keys) return [part, keys];
  const outline = keys.outlineStyle !== 'none' && parseFloat(keys.outlineWidth) >= 1 && visibleColour(keys.outlineColor);
  const top = parseFloat(keys.borderTopWidth) >= 1;
  const bottom = keys.borderBottomWidth == null ? top : parseFloat(keys.borderBottomWidth) >= 1;
  return [part, {
    ...keys,
    boxShadow: 'none',
    outlineStyle: outline ? keys.outlineStyle : 'none',
    outlineWidth: outline ? keys.outlineWidth : '-',
    outlineColor: outline ? keys.outlineColor : '-',
    borderTopColor: top ? keys.borderTopColor : '-',
    borderBottomColor: bottom ? keys.borderBottomColor : '-',
    backgroundColor: keys.behind ? seenBackground(keys.backgroundColor, keys.behind) : keys.backgroundColor,
  }];
})) : snapshot);

/**
 * mm-forced-focus-not-drawn: what shows focus on a Tab stop under forced colours
 * (keyboardReach.mjs focusIndicator, on the snapshots as drawn): 'outline',
 * 'style', 'pixels-only' or 'none'. A ring that was a box-shadow, or a focus
 * shown by a fill forced colours paint as the page, reads as nothing changed.
 */
export const forcedFocusIndicator = ({ focused, blurred, changedPixels = null }) => focusIndicator({ focused: asDrawn(focused), blurred: asDrawn(blurred), changedPixels });

// ------------------------------------------------------------------ mathematics
/*
 * A formula's colour under forced colours. MathLive draws each <math-span> and
 * <math-div> in its own shadow root, where its stylesheet gives the formula
 * forced-color-adjust: preserve-parent-color: the formula takes the colour of
 * the text around it, a link's LinkText, a selected choice's HighlightText, and
 * not one of its own. In Chromium that held when the formula was drawn but not
 * after a switch of contrast theme under a colour of the page's own (the Live
 * Challenge projector's white): the app restyles the page for its new theme,
 * and the formula took the page's white again, on a light theme's white page,
 * while the words around it were black. The walk reads the formula as the page
 * stands, before its own readings turn forced colours off and on, which draws
 * it afresh.
 *
 * `colour` is the math element's (the system colour its text is given),
 * `formulaColour` its formula's (the render part's first child). A rounding of
 * the colour model is not a different colour.
 */
export const mathColourKept = ({ colour, formulaColour } = {}) => {
  // Nothing read is not judged (parseColour takes an empty value for transparent).
  if (!colour || !formulaColour) return false;
  const host = parseColour(colour);
  const formula = parseColour(formulaColour);
  if (!host || !formula) return false;
  return host.some((value, index) => Math.abs(value - formula[index]) > (index === 3 ? 0.02 : 1.5));
};

// ------------------------------------------------------------------ the coordinate plane
/*
 * A plane is an SVG drawing (data-mm-plane), and forced colours leave its paint
 * alone: Chromium gives every <svg> forced-color-adjust: preserve-parent-color,
 * so its fills and strokes, and the board's own background, border and focus
 * ring, keep whatever the page gave them. Under a contrast theme the plane is
 * judged by what it paints:
 *
 *   the board            transparent or the page's Canvas; a drawn border in a
 *                        colour of the theme
 *   every fill, stroke   an opaque colour of the theme (`palette`: the system
 *                        colours a contrast theme sets, as the page resolves
 *                        them now), and, unless it is Canvas itself (a halo, a
 *                        label's plate, an open point's middle), at 3:1 or more
 *                        against Canvas. A translucent paint is not drawn
 *                        reliably by a contrast theme (and is a colour of no
 *                        theme), so it fails too; one that is hardly drawn at
 *                        all (an invisible fill) is not paint.
 *   the paper            (data-mm-plane-part="paper") Canvas
 *   its focus ring       a colour of the theme other than Canvas
 *
 * A fill or stroke that is a pattern (url(#…)) is judged by the pattern's own
 * lines, which the walk reads as parts too.
 *
 * Every other drawing that says something (data-mm-drawing: a number line, a
 * mapping diagram, the 3D model, a progress wheel) is judged the same way, and
 * one drawn over the page ("overlay": a match's line, a stroke's ink) by its
 * parts alone, its board being clear.
 */
export const PLANE_CONTRAST = 3;
// The system colours a Windows contrast theme sets (Mark, AccentColor and
// SelectedItem are not among them: Chromium's emulation keeps them fixed).
export const PLANE_THEME_COLOURS = Object.freeze(['Canvas', 'CanvasText', 'LinkText', 'VisitedText', 'ActiveText', 'ButtonFace', 'ButtonText', 'ButtonBorder', 'Field', 'FieldText', 'Highlight', 'HighlightText', 'GrayText']);
const NOT_DRAWN = 0.05;
const OPAQUE = 0.99;
// A channel's rounding apart.
const sameColour = (a, b) => a.every((value, index) => Math.abs(value - b[index]) <= 2);

/**
 * The theme's colours as painted on its Canvas: { name: [r, g, b] } (a
 * translucent system colour, as Chromium's Highlight is, composited over Canvas,
 * as a part painted in it is).
 */
export const planePalette = (palette) => {
  const canvas = parseColour(palette?.Canvas);
  if (!canvas || canvas[3] < OPAQUE) return null;
  const base = canvas.slice(0, 3);
  return Object.fromEntries(PLANE_THEME_COLOURS
    .map((name) => [name, parseColour(palette?.[name])])
    .filter(([, colour]) => colour && colour[3] > NOT_DRAWN)
    .map(([name, colour]) => [name, over(colour, base)]));
};

/**
 * What is wrong with one plane under forced colours: a list of { what, colour }
 * (empty when it is drawn in the theme's colours). `plane` is the walk's reading
 * (forcedColorsAudit.mjs readPlane), `palette` the page's system colours.
 */
export const planePaintProblems = (plane, palette) => {
  const colours = planePalette(palette);
  if (!colours || !plane) return [];
  const canvas = colours.Canvas;
  const named = (rgb) => Object.entries(colours).find(([, value]) => sameColour(value, rgb))?.[0] || null;
  const problems = [];
  // `alpha`: the part's own opacity and its fill's or stroke's (a system colour
  // may itself be translucent: Chromium's emulated Highlight is 80%, and is the
  // theme's colour as given).
  const judge = (what, value, alpha, { mustBe = null, notCanvas = false } = {}) => {
    const text = String(value || '').trim();
    if (!text || text === 'none' || text.startsWith('url(')) return;
    const colour = parseColour(text);
    if (!colour || colour[3] * alpha <= NOT_DRAWN) return;
    const painted = over([colour[0], colour[1], colour[2], colour[3] * alpha], canvas);
    const name = named(painted);
    if (alpha < OPAQUE && !(name === 'Canvas' && !notCanvas)) problems.push({ what: `${what} translucent (${Math.round(alpha * 100)}%)`, colour: text });
    else if (!name) problems.push({ what: `${what} not a colour of the theme${colour[3] < OPAQUE ? ' (translucent)' : ''}`, colour: text });
    else if (mustBe && name !== mustBe) problems.push({ what: `${what} ${name}, not ${mustBe}`, colour: text });
    else if (notCanvas && name === 'Canvas') problems.push({ what: `${what} the page's own colour`, colour: text });
    else if (name !== 'Canvas' && contrastRatio(painted, canvas) < PLANE_CONTRAST) {
      problems.push({ what: `${what} ${contrastRatio(painted, canvas).toFixed(2)}:1 against Canvas`, colour: text });
    }
  };
  const board = plane.board || {};
  judge('the board\'s background', board.background, 1, { mustBe: 'Canvas' });
  if (board.border?.drawn) judge('the board\'s border', board.border.colour, 1);
  const judgeParts = (parts) => parts.forEach((part) => {
    const name = `${part.tag}${part.part ? ` (${part.part})` : ''}`;
    const alpha = Number.isFinite(Number(part.alpha)) ? Number(part.alpha) : 1;
    const fillAlpha = alpha * (Number.isFinite(Number(part.fillOpacity)) ? Number(part.fillOpacity) : 1);
    const strokeAlpha = alpha * (Number.isFinite(Number(part.strokeOpacity)) ? Number(part.strokeOpacity) : 1);
    // A <line> has no inside: its fill (black by default) is never drawn.
    if (part.tag !== 'line') judge(`${name} fill`, part.fill, fillAlpha, { mustBe: part.part === 'paper' ? 'Canvas' : null });
    if (parseFloat(part.strokeWidth) > 0) judge(`${name} stroke`, part.stroke, strokeAlpha);
  });
  judgeParts(plane.parts || []);
  // Focused, only what focus adds (its crosshair): the parts it shares with the plane at rest were judged there.
  const atRest = new Set(problems.map((problem) => `${problem.what} ${problem.colour}`));
  const before = problems.length;
  judgeParts(plane.focusedParts || []);
  const added = problems.splice(before).filter((problem) => !atRest.has(`${problem.what} ${problem.colour}`));
  problems.push(...added.map((problem) => ({ ...problem, what: `focused, ${problem.what}` })));
  if (plane.focusRing?.drawn) judge('its focus ring', plane.focusRing.colour, 1, { notCanvas: true });
  return problems;
};

/**
 * mm-forced-plane-paint, for one plane, or mm-forced-drawing-paint for another drawing (`kind`): its problems grouped
 * (the same kind of part, the same colour, once).
 */
export const planePaintSummary = (problems, kind = 'plane') => {
  const counts = new Map();
  for (const problem of problems) {
    const key = `${problem.what} ${problem.colour}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const lines = [...counts].map(([key, count]) => (count > 1 ? `${key} ×${count}` : key));
  return `Under forced colours the ${kind} keeps paint of its own: ${lines.slice(0, 6).join('; ')}${lines.length > 6 ? `; and ${lines.length - 6} more` : ''}.`;
};

// ------------------------------------------------------------------ judging
const node = (target, html, summary) => ({ target: [target], html: String(html || '').slice(0, 240), failureSummary: summary });
const violation = (id, nodes) => ({ id, impact: FORCED_COLORS_RULES[id].impact, help: FORCED_COLORS_RULES[id].help, helpUrl: FORCED_COLORS_RULES[id].helpUrl, nodes });

/**
 * One scene's readings -> axe-shaped violations.
 *
 *   edges   [{ target, html, normal, forced }]           every control on screen
 *   states  [{ id, target, html, state, peer, normal: { on, off }, forced: { on, off } }]
 *           one per control in a state and one of its peers (`id` names the
 *           control): the control is reported once, when any peer looks the same
 *   focus   [{ target, html, focusVisible, focused, blurred, changedPixels }]
 *   math    [{ target, html, colour, formulaColour }]       every formula drawn
 *   planes  [{ target, html, board, parts, focusedParts, focusRing }]  every coordinate plane, read
 *           under forced colours, judged against `palette` (the page's system colours)
 *   drawings  the same, for every other drawing (`focusedParts`: what it draws while it, or a part of
 *           it, is focused)
 */
export const judgeForcedColors = ({ edges = [], states = [], focus = [], math = [], planes = [], drawings = [], palette = null } = {}) => {
  const out = [];
  const edgeNodes = edges.filter(edgeLost).map((entry) => {
    const before = edgeOf(entry.normal);
    const what = [before.background && 'its background', before.image && 'a background image', before.shadow && 'a shadow'].filter(Boolean).join(' and ');
    return node(entry.target, entry.html, `Its edge was ${what}; under forced colours it has no border or outline, so the control has no edge.`);
  });
  if (edgeNodes.length) out.push(violation('mm-forced-edge-lost', edgeNodes));
  const lost = new Map();
  for (const entry of states) {
    const key = entry.id ?? entry.target;
    if (!lost.has(key) && stateVerdict(entry) === 'colour-only') lost.set(key, entry);
  }
  const stateNodes = [...lost.values()]
    .map((entry) => node(entry.target, entry.html, `Its state (${entry.state}) looks the same as ${entry.peer} under forced colours: it was shown only by colour or background.`));
  if (stateNodes.length) out.push(violation('mm-forced-state-colour-only', stateNodes));
  const focusNodes = focus.filter((entry) => forcedFocusIndicator(entry) === 'none')
    .map((entry) => node(entry.target, entry.html, 'Focused under forced colours, nothing about it changes on screen: its indicator was a box-shadow or a background, or its outline is none.'));
  if (focusNodes.length) out.push(violation('mm-forced-focus-not-drawn', focusNodes));
  const mathNodes = math.filter(mathColourKept)
    .map((entry) => node(entry.target, entry.html, `The formula is drawn in ${entry.formulaColour}, the text around it in ${entry.colour}: under forced colours it kept a colour the theme does not give it.`));
  if (mathNodes.length) out.push(violation('mm-forced-math-colour-kept', mathNodes));
  const planeNodes = planes.map((entry) => ({ entry, problems: planePaintProblems(entry, palette) }))
    .filter(({ problems }) => problems.length)
    .map(({ entry, problems }) => node(entry.target, entry.html, planePaintSummary(problems)));
  if (planeNodes.length) out.push(violation('mm-forced-plane-paint', planeNodes));
  const drawingNodes = drawings.map((entry) => ({ entry, problems: planePaintProblems(entry, palette) }))
    .filter(({ problems }) => problems.length)
    .map(({ entry, problems }) => node(entry.target, entry.html, planePaintSummary(problems, 'drawing')));
  if (drawingNodes.length) out.push(violation('mm-forced-drawing-paint', drawingNodes));
  return out;
};
