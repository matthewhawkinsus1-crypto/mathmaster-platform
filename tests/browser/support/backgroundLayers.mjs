/*
 * A BOX'S BACKGROUND IMAGES ARE LAYERS, READ WHERE THE TEXT IS
 * (contrastReview.mjs, its stops method).
 *
 * `background-image` may hold several images, and CSS paints the first on top
 * and the last just above the box's colour. A gradient's transparent stops
 * show what is beneath that image: the images under it, then the box's colour,
 * and only then the boxes behind it. The review used to read every stop of
 * every image as one list composited straight over what was behind the box,
 * so a glow fading to transparent over a dark stage counted as the white page:
 * the Live Challenge projector reported 17 false failures until its stage was
 * given an opaque colour.
 *
 * Each image is read at the text's own boxes (imageLayersAt): where its tile
 * lies (background-size, -position, -repeat), and along its gradient line or
 * ray (linear, radial, repeating), the colours it paints there, not every stop
 * it has. The student arena's pink glow is centred above the page: read whole,
 * its centre colour put "Your score" at 4.44:1, where the screen shows 6.8:1.
 *
 * An image the review cannot place is read whole, as before: every stop, and a
 * layer that fades to transparent over what covers the box beneath it, never
 * over another such layer (compositeLayers). That is a conic gradient, a colour
 * other than sRGB, a colour hint (Chromium mixes its colours its own way; no
 * gradient here has one), a calc() size, space or round repeats, a fixed
 * attachment, a `local` one on a box that scrolls and is placed from its
 * border box, or a box that is turned (rotated, skewed, flipped) or inside
 * one. A box that scrolls its own content is placed where it is scrolled to:
 * its `scroll` images on its padding box, its `local` ones on its content.
 *
 * Every function is self-contained but for the others defined here: the review
 * hands their source to the page (`backgroundLayersInPage`), so they may use
 * nothing else. tests/platform/contrastReviewLayers.test.mjs runs the same code
 * in node.
 */

/** `text` split at its commas outside parentheses, each part trimmed. */
export const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
};

/** A computed colour as [r, g, b, a] (0–255, alpha 0–1): rgb(), rgba(), transparent, color(srgb …). Null for any other. */
export const parseColour = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'transparent') return [0, 0, 0, 0];
  const number = (token, scale) => {
    if (token == null) return null;
    const n = token.endsWith('%') ? (Number(token.slice(0, -1)) / 100) * scale : Number(token);
    return Number.isFinite(n) ? n : null;
  };
  const alphaOf = (token) => (token == null ? 1 : number(token, 1));
  const N = '(-?[\\d.]+(?:e[-+]?\\d+)?%?)';
  const rgb = new RegExp(`^rgba?\\(\\s*${N}\\s*,?\\s*${N}\\s*,?\\s*${N}\\s*(?:[,/]\\s*${N}\\s*)?\\)$`).exec(text);
  const srgb = new RegExp(`^color\\(\\s*srgb\\s+${N}\\s+${N}\\s+${N}\\s*(?:/\\s*${N}\\s*)?\\)$`).exec(text);
  const match = rgb || srgb;
  if (!match) return null;
  const scale = rgb ? 255 : 1;
  const channels = [match[1], match[2], match[3]].map((token) => number(token, scale));
  const alpha = alphaOf(match[4]);
  if (channels.some((c) => c == null) || alpha == null) return null;
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  return [...channels.map((c) => clamp(rgb ? c : c * 255, 255)), clamp(alpha, 1)];
};

/** A <length-percentage> token in px or %, or null (a calc(), an em, an angle). */
export const lengthPercentage = (token) => {
  const m = /^(-?[\d.]+(?:e[-+]?\d+)?)(px|%)?$/.exec(String(token || '').trim().toLowerCase());
  if (!m || (!m[2] && Number(m[1]) !== 0)) return null;
  return { value: Number(m[1]), unit: m[2] === '%' ? '%' : 'px' };
};

/**
 * One gradient of a computed `background-image`: its kind, its prelude (the
 * direction, or the shape, size and centre) and its stops, each a colour and a
 * position or null. `readable` is false when a colour or a position is one the
 * review cannot read, or the gradient has a colour hint.
 */
export const parseGradient = (layer) => {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i.exec(String(layer || '').trim());
  if (!m) return null;
  const COLOUR = /^(?:(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\((?:[^()]|\([^()]*\))*\)|transparent\b|currentcolor\b)/i;
  const gradient = { kind: m[2].toLowerCase(), repeating: Boolean(m[1]), prelude: '', stops: [], readable: true };
  splitTopLevel(m[3]).forEach((part, index) => {
    const token = COLOUR.exec(part);
    if (!token) {
      // The prelude, or a colour hint (a lone position between two stops).
      if (index === 0) gradient.prelude = part;
      else gradient.readable = false;
      return;
    }
    const colour = parseColour(token[0]);
    const positions = part.slice(token[0].length).trim().split(/\s+/).filter(Boolean).map(lengthPercentage);
    if (!colour || positions.length > 2 || positions.some((p) => !p)) gradient.readable = false;
    for (const position of positions.length ? positions : [null]) gradient.stops.push({ colour, position });
  });
  if (!gradient.stops.length) gradient.readable = false;
  return gradient;
};

/** The stops of each gradient in a computed `background-image`, first image first. A url() image has none. */
export const gradientLayers = (image) => {
  if (!image || image === 'none') return [];
  return splitTopLevel(image).map(parseGradient).filter(Boolean)
    .map((gradient) => gradient.stops.map((stop) => stop.colour).filter(Boolean));
};

/**
 * Where a gradient's colours fall in a tile `w` × `h`: the length of its line
 * (linear) or ray (radial), the distance along it of a point, and the range of
 * that distance over a rectangle. Null for a conic gradient, or a direction,
 * shape, size or centre the review cannot read, or a degenerate one.
 */
export const gradientGeometry = (gradient, w, h) => {
  const prelude = gradient.prelude.trim().toLowerCase();
  const corners = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  if (gradient.kind === 'linear') {
    // CSS angles: 0deg points up, 90deg right. "to <corner>": perpendicular to
    // the line through the two neighbouring corners.
    let dx = 0;
    let dy = 1;
    const angle = /^(-?[\d.]+(?:e[-+]?\d+)?)(deg|grad|rad|turn)$/.exec(prelude);
    const side = /^to\s+(left|right|top|bottom)(?:\s+(left|right|top|bottom))?$/.exec(prelude);
    if (angle) {
      const radians = Number(angle[1]) * { deg: Math.PI / 180, grad: Math.PI / 200, rad: 1, turn: 2 * Math.PI }[angle[2]];
      dx = Math.sin(radians);
      dy = -Math.cos(radians);
    } else if (side) {
      const words = [side[1], side[2]];
      const sx = words.includes('left') ? -1 : (words.includes('right') ? 1 : 0);
      const sy = words.includes('top') ? -1 : (words.includes('bottom') ? 1 : 0);
      const norm = Math.hypot(w, h);
      if (sx && sy) { dx = norm ? (sx * h) / norm : 0; dy = norm ? (sy * w) / norm : 0; } else { dx = sx; dy = sy; }
    } else if (prelude) return null;
    const length = Math.abs(w * dx) + Math.abs(h * dy);
    if (!(length > 0)) return null;
    const at = (x, y) => (x - w / 2) * dx + (y - h / 2) * dy + length / 2;
    return {
      length,
      at,
      range: (x0, y0, x1, y1) => {
        const ts = corners(x0, y0, x1, y1).map(([x, y]) => at(x, y));
        return [Math.min(...ts), Math.max(...ts)];
      },
    };
  }
  if (gradient.kind !== 'radial') return null;
  const tokens = prelude.split(/\s+/).filter(Boolean);
  const atIndex = tokens.indexOf('at');
  let keyword = null;
  let circle = false;
  const sizes = [];
  for (const token of atIndex < 0 ? tokens : tokens.slice(0, atIndex)) {
    if (token === 'circle') circle = true;
    else if (token === 'ellipse') circle = false;
    else if (/^(closest|farthest)-(side|corner)$/.test(token)) keyword = token;
    else if (token === 'contain' || token === 'cover') keyword = token === 'contain' ? 'closest-side' : 'farthest-corner';
    else {
      const size = lengthPercentage(token);
      if (!size) return null;
      sizes.push(size);
    }
  }
  // The centre: one or two keywords or <length-percentage>s (default: center).
  const place = atIndex < 0 ? [] : tokens.slice(atIndex + 1);
  if (place.length > 2) return null;
  const KEYWORDS = { left: ['x', 0], right: ['x', 100], top: ['y', 0], bottom: ['y', 100], center: ['c', 50] };
  const read = (token) => (KEYWORDS[token]
    ? { axis: KEYWORDS[token][0], value: { value: KEYWORDS[token][1], unit: '%' } }
    : (lengthPercentage(token) ? { axis: 'n', value: lengthPercentage(token) } : null));
  const items = place.map(read);
  if (items.some((item) => !item)) return null;
  const centre = { value: 50, unit: '%' };
  let [px, py] = [centre, centre];
  if (items.length === 1) { if (items[0].axis === 'y') py = items[0].value; else px = items[0].value; }
  if (items.length === 2) {
    const [a, b] = items[0].axis === 'y' || items[1].axis === 'x' ? [items[1], items[0]] : items;
    [px, py] = [a.value, b.value];
  }
  const resolve = (lp, full) => (lp.unit === '%' ? (lp.value / 100) * full : lp.value);
  const cx = resolve(px, w);
  const cy = resolve(py, h);
  let rx;
  let ry;
  if (sizes.length === 1) {
    if (sizes[0].unit === '%') return null;
    rx = sizes[0].value;
    ry = rx;
  } else if (sizes.length === 2) {
    rx = resolve(sizes[0], w);
    ry = resolve(sizes[1], h);
  } else if (sizes.length) return null;
  else {
    const closest = (keyword || 'farthest-corner').startsWith('closest');
    const pick = (values) => (closest ? Math.min(...values) : Math.max(...values));
    const sidesX = [Math.abs(cx), Math.abs(w - cx)];
    const sidesY = [Math.abs(cy), Math.abs(h - cy)];
    const toCorners = corners(-cx, -cy, w - cx, h - cy).map(([x, y]) => [Math.abs(x), Math.abs(y)]);
    if ((keyword || 'farthest-corner').endsWith('side')) {
      if (circle) { rx = pick([...sidesX, ...sidesY]); ry = rx; } else { rx = pick(sidesX); ry = pick(sidesY); }
    } else {
      const corner = toCorners.reduce((best, c) => ((closest ? Math.hypot(...c) < Math.hypot(...best) : Math.hypot(...c) > Math.hypot(...best)) ? c : best));
      if (circle) { rx = Math.hypot(...corner); ry = rx; } else {
        // The ellipse through that corner, as wide for its height as the sides make it.
        const ratio = pick(sidesX) / pick(sidesY);
        if (!(ratio > 0) || !Number.isFinite(ratio)) return null;
        ry = Math.sqrt((corner[0] / ratio) ** 2 + corner[1] ** 2);
        rx = ratio * ry;
      }
    }
  }
  if (!(rx > 0 && ry > 0)) return null;
  const at = (x, y) => rx * Math.hypot((x - cx) / rx, (y - cy) / ry);
  return {
    length: rx,
    at,
    range: (x0, y0, x1, y1) => [
      at(Math.min(Math.max(cx, x0), x1), Math.min(Math.max(cy, y0), y1)),
      Math.max(...corners(x0, y0, x1, y1).map(([x, y]) => at(x, y))),
    ],
  };
};

/** The stops at their places along a line or ray `length` px long (px), fixed up as CSS Images 3 says. */
export const resolveStops = (stops, length) => {
  const px = (lp) => (lp == null ? null : (lp.unit === '%' ? (lp.value / 100) * length : lp.value));
  const out = stops.map((stop) => ({ colour: stop.colour, pos: px(stop.position) }));
  if (!out.length) return out;
  if (out[0].pos == null) out[0].pos = 0;
  if (out[out.length - 1].pos == null) out[out.length - 1].pos = length;
  // No stop before one that comes earlier in the list.
  let furthest = -Infinity;
  for (const stop of out) {
    if (stop.pos != null) { stop.pos = Math.max(stop.pos, furthest); furthest = stop.pos; }
  }
  // Stops with no place: evenly between their placed neighbours.
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].pos != null) continue;
    let j = i;
    while (out[j].pos == null) j += 1;
    const from = out[i - 1].pos;
    for (let k = i; k < j; k += 1) out[k].pos = from + ((out[j].pos - from) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return out;
};

/** The colour a gradient paints at distance `t` along its line or ray: premultiplied, as browsers mix. */
export const colourAt = (stops, t) => {
  const mix = ([r0, g0, b0, a0], [r1, g1, b1, a1], w) => {
    const a = a0 + (a1 - a0) * w;
    if (!(a > 0)) return [0, 0, 0, 0];
    const channel = (c0, c1) => (c0 * a0 * (1 - w) + c1 * a1 * w) / a;
    return [channel(r0, r1), channel(g0, g1), channel(b0, b1), a];
  };
  if (t <= stops[0].pos) return stops[0].colour;
  for (let i = 0; i + 1 < stops.length; i += 1) {
    const [a, b] = [stops[i], stops[i + 1]];
    if (t > b.pos) continue;
    if (!(b.pos > a.pos)) return b.colour;
    return mix(a.colour, b.colour, (t - a.pos) / (b.pos - a.pos));
  }
  return stops[stops.length - 1].colour;
};

/**
 * Every colour a gradient paints between distances `t0` and `t1`: each stop
 * there, and five points across each stretch between them (a mix of two
 * colours can be darker in the middle than at either end).
 */
export const coloursBetween = (stops, t0, t1) => {
  const points = [t0, t1];
  const colours = [];
  for (const stop of stops) {
    if (stop.pos >= t0 && stop.pos <= t1) { points.push(stop.pos); colours.push(stop.colour); }
  }
  points.sort((a, b) => a - b);
  for (let i = 0; i + 1 < points.length; i += 1) {
    for (let j = 0; j <= 4; j += 1) colours.push(colourAt(stops, points[i] + ((points[i + 1] - points[i]) * j) / 4));
  }
  return colours;
};

/**
 * Each image of one box, first image first, at one of the text's boxes `rect`
 * (viewport px: left, top, right, bottom): the colours it paints over that
 * rectangle, transparent too where it leaves part of it bare ({ stops, placed:
 * true }), or, when it cannot be placed, every stop it has ({ stops, placed:
 * false }). A url() image or `none` has no stops.
 *
 * style: the box's computed background-image, -size, -position-x,
 * -position-y, -repeat, -origin and -attachment. box: its border box, border
 * and padding widths [top, right, bottom, left], the rectangle it paints
 * (`clip`; null for the page's own background, which covers the canvas),
 * whether it is `plain` (neither it nor a box around it turned, and no box
 * between it and the text scrolls or is fixed or sticky), and, for a box that
 * scrolls its own content, `scroll`: its scrollLeft, scrollTop, scrollWidth
 * and scrollHeight, where an image attached `local` is.
 */
export const imageLayersAt = (style, box, rect) => {
  const image = String(style.image || 'none');
  if (image === 'none') return [];
  const list = (value) => splitTopLevel(String(value || ''));
  const [sizes, xs, ys, repeats, origins, attachments] = [style.size, style.positionX, style.positionY, style.repeat, style.origin, style.attachment].map(list);
  const pick = (values, i, fallback) => (values[0] ? values[i % values.length] : fallback).toLowerCase();
  const BARE = [0, 0, 0, 0];
  return splitTopLevel(image).map((layer, i) => {
    const gradient = parseGradient(layer);
    if (!gradient) return { stops: [], placed: false };
    const whole = { stops: gradient.stops.map((stop) => stop.colour).filter(Boolean), placed: false };
    const attachment = pick(attachments, i, 'scroll');
    if (!rect || !box?.plain || !gradient.readable || !(attachment === 'scroll' || attachment === 'local')) return whole;
    // The positioning area: the padding box, unless background-origin says otherwise.
    const inset = (r, [t, right, b, l]) => ({ left: r.left + l, top: r.top + t, width: Math.max(0, r.width - l - right), height: Math.max(0, r.height - t - b) });
    const origin = pick(origins, i, 'padding-box');
    const padding = inset(box.border, box.borders);
    let area = origin === 'border-box' ? box.border : (origin === 'content-box' ? inset(padding, box.paddings) : padding);
    // `local` in a box that scrolls: the image is on the box's content, all of
    // it (scrollWidth by scrollHeight, padding included), moved by the scroll
    // offset. In a box that does not scroll, `local` paints as `scroll` does.
    if (attachment === 'local' && box.scroll) {
      if (origin === 'border-box') return whole;
      const content = { left: padding.left - box.scroll.left, top: padding.top - box.scroll.top, width: Math.max(padding.width, box.scroll.width), height: Math.max(padding.height, box.scroll.height) };
      area = origin === 'content-box' ? inset(content, box.paddings) : content;
    }
    // The tile: background-size (a gradient has no size of its own, so auto, cover and contain fill the area).
    const size = pick(sizes, i, 'auto').split(/\s+/);
    const span = (token, full) => {
      if (token == null || token === 'auto' || token === 'cover' || token === 'contain') return full;
      const lp = lengthPercentage(token);
      return lp ? (lp.unit === '%' ? (lp.value / 100) * full : lp.value) : NaN;
    };
    const tile = { w: span(size[0], area.width), h: span(size[1], area.height) };
    if (size.length > 2 || !Number.isFinite(tile.w) || !Number.isFinite(tile.h)) return whole;
    // Where the tile starts: background-position, a percentage of the room the
    // tile leaves. "right 10px" computes to calc(100% - 10px).
    const offset = (value, full, length) => {
      const tokens = value.split(/\s+/);
      const room = full - length;
      const keyword = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };
      if (tokens.length === 1 && tokens[0] in keyword) return (keyword[tokens[0]] / 100) * room;
      if (tokens.length === 2 && tokens[0] in keyword && lengthPercentage(tokens[1])) {
        const lp = lengthPercentage(tokens[1]);
        const by = lp.unit === '%' ? (lp.value / 100) * room : lp.value;
        return keyword[tokens[0]] === 100 ? room - by : by;
      }
      const sum = /^calc\((-?[\d.]+)% ([-+]) ([\d.]+)px\)$/.exec(value);
      if (sum) return (Number(sum[1]) / 100) * room + (sum[2] === '-' ? -1 : 1) * Number(sum[3]);
      const lp = tokens.length === 1 ? lengthPercentage(tokens[0]) : null;
      return lp ? (lp.unit === '%' ? (lp.value / 100) * room : lp.value) : null;
    };
    const x = offset(pick(xs, i, '0%'), area.width, tile.w);
    const y = offset(pick(ys, i, '0%'), area.height, tile.h);
    const repeat = pick(repeats, i, 'repeat').split(/\s+/);
    if (repeat.length === 1) repeat.push(repeat[0] === 'repeat-x' ? 'no-repeat' : (repeat[0] === 'repeat-y' ? 'repeat' : repeat[0]));
    if (repeat[0] === 'repeat-x') repeat[0] = 'repeat';
    if (repeat[0] === 'repeat-y') repeat[0] = 'no-repeat';
    if (x == null || y == null || !repeat.every((r) => r === 'repeat' || r === 'no-repeat')) return whole;
    if (!(tile.w > 0 && tile.h > 0)) return { stops: [BARE], placed: true };
    const shape = gradientGeometry(gradient, tile.w, tile.h);
    if (!shape) return whole;
    const stops = resolveStops(gradient.stops, shape.length);
    const first = stops[0].pos;
    const period = stops[stops.length - 1].pos - first;
    if (gradient.repeating && !(period > 1e-6)) return whole;
    // The text's box on the painted part of this box, in the tile's own coordinates.
    const clip = box.clip;
    const inside = clip
      ? { left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top), right: Math.min(rect.right, clip.left + clip.width), bottom: Math.min(rect.bottom, clip.top + clip.height) }
      : null;
    const r = inside && inside.right > inside.left && inside.bottom > inside.top ? inside : rect;
    // Along one axis: the stretches of the tile the text's box covers, and
    // whether it reaches past a tile that does not repeat.
    const along = (from, to, length, repeats) => {
      if (!repeats) {
        if (to <= 0 || from >= length) return null;
        return { parts: [[Math.max(0, from), Math.min(length, to)]], bare: from < -0.01 || to > length + 0.01 };
      }
      if (to - from >= length) return { parts: [[0, length]], bare: false };
      const a = ((from % length) + length) % length;
      const b = a + (to - from);
      return { parts: b <= length ? [[a, b]] : [[a, length], [0, b - length]], bare: false };
    };
    const left = area.left + x;
    const top = area.top + y;
    const ax = along(r.left - left, r.right - left, tile.w, repeat[0] === 'repeat');
    const ay = along(r.top - top, r.bottom - top, tile.h, repeat[1] === 'repeat');
    if (!ax || !ay) return { stops: [BARE], placed: true };
    const colours = ax.bare || ay.bare ? [BARE] : [];
    for (const [x0, x1] of ax.parts) {
      for (const [y0, y1] of ay.parts) {
        const [t0, t1] = shape.range(x0, y0, x1, y1);
        // A repeating gradient: the same stretch of its first period.
        let stretches = [[t0, t1]];
        if (gradient.repeating) {
          const u0 = first + ((((t0 - first) % period) + period) % period);
          const u1 = u0 + (t1 - t0);
          stretches = t1 - t0 >= period ? [[first, first + period]] : (u1 <= first + period ? [[u0, u1]] : [[u0, first + period], [first, u1 - period]]);
        }
        for (const [s0, s1] of stretches) colours.push(...coloursBetween(stops, s0, s1));
      }
    }
    const seen = new Map();
    for (const colour of colours) seen.set(colour.map((v) => Math.round(v * 1000) / 1000).join(), colour);
    return { stops: [...seen.values()], placed: true };
  });
};

/**
 * One of the text's boxes in cells no wider or taller than `size` px (at most
 * 24 across and 3 down), each read and composited on its own: across a line as
 * wide as a phone, one glow is bright at its left end and another at its right,
 * and read as one box the two counted on top of each other where neither is
 * that bright.
 */
export const cellsOf = (rect, size = 16) => {
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const nx = Math.max(1, Math.min(24, Math.ceil(w / size)));
  const ny = Math.max(1, Math.min(3, Math.ceil(h / size)));
  const cells = [];
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      cells.push({ left: rect.left + (w * i) / nx, top: rect.top + (h * j) / ny, right: rect.left + (w * (i + 1)) / nx, bottom: rect.top + (h * (j + 1)) / ny });
    }
  }
  return cells;
};

/**
 * Every colour one box's background can be, over the colours behind the box:
 * its layers bottom first (its colour, then its images from the last to the
 * first). A layer read at the text ({ stops, placed: true }), or one with no
 * transparent stop, covers what is beneath it there: each of its colours over
 * every colour beneath it. A layer read whole (a list of stops) that fades to
 * transparent (a glow, a fade, a grid line) is only somewhere in the box, and
 * the review does not know where: its stops are composited over what covers
 * the box beneath it, never over another such layer of the box. Stacked, the
 * student arena's three glows, each in its own corner, made a light purple
 * found nowhere on the screen. Rounded and distinct; past 400, the darkest,
 * the lightest and an even spread between them (the worst ratio is against an
 * end).
 */
export const compositeLayers = (candidates, layersBottomFirst) => {
  const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
  const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const distinct = (colours) => {
    const seen = new Map();
    for (const colour of colours) {
      const rounded = colour.map((v) => Math.round(v));
      seen.set(rounded.join(','), rounded);
    }
    const all = [...seen.values()];
    if (all.length <= 400) return all;
    all.sort((a, b) => luminance(a) - luminance(b));
    return Array.from({ length: 400 }, (_, i) => all[Math.round((i * (all.length - 1)) / 399)]);
  };
  const each = (stops, beneath) => beneath.flatMap((colour) => stops.map((stop) => over(stop, colour)));
  let cover = candidates;
  let current = candidates;
  for (const layer of layersBottomFirst) {
    const { stops, placed } = Array.isArray(layer) ? { stops: layer, placed: false } : layer;
    if (!stops.length) continue;
    if (placed || stops.every((stop) => stop[3] > 0)) {
      current = distinct(each(stops, current));
      cover = current;
    } else {
      current = distinct([...current, ...each(stops, cover)]);
    }
  }
  return current;
};

const IN_PAGE = { splitTopLevel, parseColour, lengthPercentage, parseGradient, gradientLayers, gradientGeometry, resolveStops, colourAt, coloursBetween, imageLayersAt, cellsOf, compositeLayers };

/** What the review evaluates in a page before it reads the page: the functions above, as window.__crLayers. */
export const backgroundLayersInPage = `(() => {
${Object.entries(IN_PAGE).map(([name, fn]) => `  const ${name} = ${fn};`).join('\n')}
  window.__crLayers = { ${Object.keys(IN_PAGE).join(', ')} };
})();`;
