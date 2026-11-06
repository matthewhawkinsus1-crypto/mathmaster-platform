/*
 * A BOX'S BACKGROUND IMAGES ARE LAYERS (contrastReview.mjs, its stops method).
 *
 * `background-image` may hold several images, and CSS paints the first on top
 * and the last just above the box's colour. A gradient's transparent stops
 * show what is beneath that image: the images under it, then the box's colour,
 * and only then the boxes behind it. The review used to read every stop of
 * every image as one list composited straight over what was behind the box,
 * so a glow fading to transparent over a dark stage counted as the white page:
 * the Live Challenge projector reported 17 false failures until its stage was
 * given an opaque colour. A glow is only somewhere in its box, so glows are
 * not stacked on each other (compositeLayers).
 *
 * Both functions are self-contained: the review hands their source to the page
 * (`backgroundLayersInPage`), so they may use nothing outside their own bodies.
 * tests/platform/contrastReviewLayers.test.mjs runs the same code in node.
 */

/** The stops of each gradient in a computed `background-image`, first image first. A url() image has none. */
export const gradientLayers = (image) => {
  if (!image || image === 'none') return [];
  const parse = (value) => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(value || '');
    if (!m) return null;
    let a = m[4] == null ? 1 : (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]));
    if (!Number.isFinite(a)) a = 1;
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  };
  const layers = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= image.length; i += 1) {
    const ch = image[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (i === image.length || (ch === ',' && depth === 0)) {
      const layer = image.slice(start, i);
      start = i + 1;
      if (!/gradient\(/.test(layer)) continue;
      const stops = [];
      for (const match of layer.matchAll(/rgba?\([^)]*\)|\btransparent\b/g)) stops.push(match[0] === 'transparent' ? [0, 0, 0, 0] : parse(match[0]));
      layers.push(stops.filter(Boolean));
    }
  }
  return layers;
};

/**
 * Every colour one box's background can be, over the colours behind the box:
 * its layers bottom first (its colour, then its images from the last to the
 * first). A layer with no transparent stop covers the whole box, so each of
 * its stops is composited over every colour beneath it. A layer that fades to
 * transparent (a glow, a fade, a grid line) is only somewhere in the box, and
 * the review does not know where: its stops are composited over what covers
 * the box beneath it, never over another such layer of the box. Stacked, the
 * student arena's three glows, each in its own corner, made a light purple
 * found nowhere on the screen. Rounded, distinct, at most 400.
 */
export const compositeLayers = (candidates, layersBottomFirst) => {
  const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
  const distinct = (colours) => {
    const seen = new Map();
    for (const colour of colours) {
      const rounded = colour.map((v) => Math.round(v));
      seen.set(rounded.join(','), rounded);
    }
    return [...seen.values()].slice(0, 400);
  };
  const each = (stops, beneath) => beneath.flatMap((colour) => stops.map((stop) => over(stop, colour)));
  let cover = candidates;
  let current = candidates;
  for (const stops of layersBottomFirst) {
    if (!stops.length) continue;
    if (stops.every((stop) => stop[3] > 0)) {
      current = distinct(each(stops, current));
      cover = current;
    } else {
      current = distinct([...current, ...each(stops, cover)]);
    }
  }
  return current;
};

/** What the review evaluates in a page before it reads the page: both functions, as window.__crLayers. */
export const backgroundLayersInPage = `window.__crLayers = { gradientLayers: ${gradientLayers}, compositeLayers: ${compositeLayers} };`;
