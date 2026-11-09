/*
 * THE FORCED-COLOURS WALK OF ONE SCENE.
 *
 *   const result = await auditForcedColors(page, { name: 'student-home', viewport: 'desktop/dark', include, exclude });
 *   result.violations   axe-shaped (scripts/lib/forcedColors.mjs judges them)
 *   result.counts       per `${name}|${viewport}|${rule}`, as the accessibility ratchet counts
 *   result.summary      how many controls, states and Tab stops it read
 *
 * Windows' contrast themes (forced colours) draw every text and border in the
 * user's own system colours, every background as Canvas, and no box-shadow or
 * gradient at all. Chromium does the same when Playwright emulates them
 * (`page.emulateMedia({ forcedColors: 'active' })`); with `colorScheme` dark or
 * light it stands for a dark or a light contrast theme. The page is expected to
 * be open under forced colours already.
 *
 * THE WALK, on the scene as it stands (the `include` and `exclude` its audit has):
 *
 *   0. Every formula MathLive has drawn, read first, as the page stands: its
 *      element's colour and its formula's (see mathColourKept). Anything the
 *      walk does after this draws a formula afresh. Each formula on screen is
 *      waited for until it is typeset (waitForFormulas), and one that never is
 *      fails the reading by name.
 *   1. Every control that is drawn (buttons, links, fields, math boxes, and the
 *      widget roles), and every control in a state (aria-pressed, -selected,
 *      -checked, -current; a checked radio or checkbox that its label draws)
 *      with one of its kind in the same group that is not, are read twice: with
 *      forced colours turned off for a moment (how the screen draws them), and
 *      on. What each reading holds is in boxFacts and partsOf below.
 *   2. Under forced colours every Tab stop is focused as a keyboard focuses it
 *      (after a key press, so :focus-visible matches) and read focused and blurred; a
 *      stop whose style shows no change is photographed both ways, and a few
 *      changed pixels count as an indicator, as the Tab walk counts them
 *      (accessibilityKeyboardReach.mjs).
 *   3. Every coordinate plane (data-mm-plane): an SVG drawing, whose paint forced
 *      colours leave alone. Read under forced colours, as the page stands, every
 *      part it paints (each line, shape and word, a pattern's lines too): its
 *      fill and stroke, their opacity and its own, and the board's background
 *      and border; and the theme's system colours, as the page resolves them. A
 *      plane that is a Tab stop is read again focused (its ring, and what focus
 *      draws on it: the keyboard's crosshair). See readPlane.
 *   4. scripts/lib/forcedColors.mjs judges the readings.
 *
 * It leaves the page as it found it: focus dropped, every scroll position put
 * back, forced colours on.
 */
import { PLANE_THEME_COLOURS, judgeForcedColors, forcedFocusIndicator } from '../../scripts/lib/forcedColors.mjs';
import { STYLE_KEYS, STYLE_PARTS, MIN_CHANGED_PIXELS } from '../../scripts/lib/keyboardReach.mjs';
import { normalizeViolations } from '../../scripts/lib/accessibilityRatchet.mjs';
import { MATHLIVE_RENDER_PART_SELECTOR } from '../../src/platform/math/mathLiveCompat.js';

/* ------------------------------------------------------------------------ */
/* In the page                                                               */
/* ------------------------------------------------------------------------ */

export const INSTALL = ({ include, exclude, styleKeys, renderPart, themeColours }) => {
  if (window.__mmForced) window.__mmForced.dispose();
  const scrolledAtStart = new Map();
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollLeft || el.scrollTop) scrolledAtStart.set(el, [el.scrollLeft, el.scrollTop]);
  }
  const windowAtStart = [scrollX, scrollY];

  const roots = include.length ? include.flatMap((selector) => [...document.querySelectorAll(selector)]) : [document.body];
  // A scene audited as a pop-up whose pop-up is gone reads nothing, and nothing
  // is not a pass.
  if (!roots.length) return { missing: include };
  const excluded = (el) => exclude.some((selector) => el.closest(selector));
  const inScope = (el) => roots.some((root) => root === el || root.contains(el)) && !excluded(el);
  // Drawn: a box of some size, not hidden, not see-through, not in a closed <details>.
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return !el.closest('[aria-hidden="true"], [inert]');
  };
  const clean = (text, max) => String(text || '').replace(/\s+/g, ' ').trim().replace(/\d+/g, 'N').slice(0, max);
  const identity = (el) => {
    const bits = [el.localName];
    if (el.id && !/\d{3,}|:r/.test(el.id)) bits.push(`#${el.id}`);
    const classes = [...(el.classList || [])].filter((name) => !/^(css|sc|jsx)-|\d{4,}/.test(name)).slice(0, 2);
    if (classes.length) bits.push(`.${classes.join('.')}`);
    const label = el.getAttribute('aria-label');
    if (label) bits.push(`[aria-label="${clean(label, 50)}"]`);
    else if (el.getAttribute('role')) bits.push(`[role=${el.getAttribute('role')}]`);
    else if (el.getAttribute('type')) bits.push(`[type=${el.getAttribute('type')}]`);
    return bits.join('');
  };
  const hasIdentity = (el) => Boolean(el.id || el.classList?.length || el.getAttribute('aria-label') || el.getAttribute('role') || [...el.attributes].some((attr) => attr.name.startsWith('data-')));
  const selectorOf = (el) => {
    const words = /^(button|a|summary|label|option|th|li)$/.test(el.localName) || /^(button|tab|radio|option|switch|checkbox|menuitem)/.test(el.getAttribute('role') || '')
      ? ` "${clean(el.innerText || el.textContent, 40)}"` : '';
    let anchor = el.parentElement;
    let depth = 0;
    while (anchor && anchor !== document.body && !hasIdentity(anchor) && depth < 8) { anchor = anchor.parentElement; depth += 1; }
    const above = anchor && anchor !== document.body && anchor !== document.documentElement ? `${identity(anchor)} > ` : '';
    return `${above}${identity(el)}${words}`;
  };
  const html = (el) => el.outerHTML.replace(/\s+/g, ' ').slice(0, 240);

  // ---------------------------------------------------------------- mathematics
  // Each formula MathLive has drawn, as the page stands: its element's colour
  // and its formula's (the render part's first child, in its shadow root). Read
  // before anything below touches the page: the style that follows restyles it,
  // and the readings turn forced colours off and on, which draws a formula
  // afresh in the theme's colour and would hide one that kept another. A math
  // element is hidden from assistive technology (its words are read beside it),
  // so drawn here means only a box of some size that is not hidden.
  const formulas = [...new Set(roots.flatMap((root) => [...(root.matches?.('math-span, math-div') ? [root] : []), ...root.querySelectorAll('math-span, math-div')]))]
    .filter((el) => {
      if (!inScope(el)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      return typeof el.checkVisibility !== 'function' || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    })
    .map((el) => ({ el, formula: el.shadowRoot?.querySelector(renderPart)?.firstElementChild || null }))
    .filter(({ formula }) => formula)
    .map(({ el, formula }) => ({ target: selectorOf(el), html: html(el), colour: getComputedStyle(el).color, formulaColour: getComputedStyle(formula).color }));

  const style = document.createElement('style');
  // Deterministic readings: no transition half way, no blinking caret.
  style.textContent = '*, *::before, *::after { transition: none !important; animation-play-state: paused !important; caret-color: transparent !important; }';
  document.head.appendChild(style);

  // ---------------------------------------------------------------- readings
  // [r, g, b, a] from a computed colour: rgb(), rgba(), or color(srgb ...), which
  // is what a color-mix() computes to; null for anything else.
  const rgbaOf = (value) => {
    const text = String(value || '').trim();
    if (text === 'transparent') return [0, 0, 0, 0];
    const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\s*\)$/.exec(text);
    if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] == null ? 1 : Number(srgb[4])];
    const m = /rgba?\(([^)]*)\)/.exec(text);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [r, g, b, a];
  };
  const alpha = (value) => rgbaOf(value)?.[3] ?? 1;
  // A shadow is drawn when one of its layers has a colour and a size.
  const shadowDrawn = (value) => {
    if (!value || value === 'none') return false;
    return value.split(/,(?![^(]*\))/).some((layer) => {
      const colour = /rgba?\([^)]*\)|color\([^)]*\)/.exec(layer)?.[0];
      const lengths = (layer.replace(/rgba?\([^)]*\)|color\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
      return (colour ? alpha(colour) > 0.05 : true) && lengths.some((length) => length !== 0);
    });
  };
  // The colour behind a box: its ancestors' backgrounds composited, root first
  // (with `self`, the box's own on top: what its ::before, ::after and children sit on).
  const behindOf = (el, self = false) => {
    const chain = [];
    for (let node = self ? el : el.parentElement; node; node = node.parentElement || node.getRootNode()?.host) chain.push(node);
    let colour = [255, 255, 255];
    for (const node of chain.reverse()) {
      const value = rgbaOf(getComputedStyle(node).backgroundColor);
      if (!value) continue;
      const [r, g, b, a] = value;
      if (!(a > 0)) continue;
      colour = [r * a + colour[0] * (1 - a), g * a + colour[1] * (1 - a), b * a + colour[2] * (1 - a)];
    }
    return `rgb(${colour.map((c) => Math.round(c)).join(', ')})`;
  };
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const boxFacts = (el, pseudo = null) => {
    const cs = getComputedStyle(el, pseudo);
    return {
      sides: SIDES.map((side) => ({ style: cs[`border${side}Style`], width: cs[`border${side}Width`], colour: cs[`border${side}Color`] })),
      outline: { style: cs.outlineStyle, width: cs.outlineWidth, colour: cs.outlineColor },
      background: cs.backgroundColor,
      gradient: /gradient\(/.test(cs.backgroundImage),
      urlImage: /url\(/.test(cs.backgroundImage),
      shadow: shadowDrawn(cs.boxShadow),
    };
  };
  // A field drawn by the box around it (a search pill: the icon, the field, a
  // clear button, inside one border): an ancestor at most three levels up that
  // draws all four sides and is hardly bigger than the control.
  const wrappedBy = (el) => {
    const rect = el.getBoundingClientRect();
    let node = el.parentElement;
    for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
      const box = node.getBoundingClientRect();
      if (box.width > rect.width + 72 || box.height > rect.height + 24) return false;
      const cs = getComputedStyle(node);
      const drawn = SIDES.every((side) => !/^(none|hidden)$/.test(cs[`border${side}Style`]) && parseFloat(cs[`border${side}Width`]) >= 1 && alpha(cs[`border${side}Color`]) > 0.1);
      if (drawn) return true;
    }
    return false;
  };
  const ICONISH = /^(svg|img|i|path|circle|rect|line|polyline|polygon|ellipse|use)$/;
  // One box as its parts: itself, its ::before and ::after when they draw, and
  // each descendant that is drawn (at most 30), each part's traits.
  const partsOf = (el) => {
    const parts = [];
    const read = (node, kind, pseudo = null) => {
      const cs = getComputedStyle(node, pseudo);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) return;
      const facts = boxFacts(node, pseudo);
      parts.push({
        kind,
        ...facts,
        // A pseudo-element sits on its own box; anything else on its ancestors.
        behind: behindOf(node, Boolean(pseudo)),
        colour: cs.color,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        textDecoration: cs.textDecorationLine,
        opacity: cs.opacity,
        transform: kind === 'self' || (node.textContent || '').trim() ? 'none' : cs.transform,
        content: pseudo ? cs.content : '',
        fill: node instanceof SVGElement ? cs.fill : '',
        stroke: node instanceof SVGElement ? cs.stroke : '',
      });
    };
    read(el, 'self');
    read(el, 'before', '::before');
    read(el, 'after', '::after');
    let count = 0;
    for (const child of el.querySelectorAll('*')) {
      if (count >= 30) break;
      const rect = child.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (typeof child.checkVisibility === 'function' && !child.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      read(child, ICONISH.test(child.localName) || !(child.textContent || '').trim() ? `icon:${child.localName}` : 'text');
      read(child, `${ICONISH.test(child.localName) ? 'icon' : 'text'}:before`, '::before');
      read(child, `${ICONISH.test(child.localName) ? 'icon' : 'text'}:after`, '::after');
      count += 1;
    }
    return { parts, text: clean(el.innerText, 80) };
  };

  // ---------------------------------------------------------------- controls
  const WIDGET_ROLES = ['button', 'link', 'tab', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'radio', 'checkbox', 'switch', 'slider', 'spinbutton', 'combobox', 'textbox', 'treeitem'];
  const CONTROL = ['button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea', 'summary', 'math-field', ...WIDGET_ROLES.map((role) => `[role="${role}"]`)].join(', ');
  const NATIVE_DRAWN = /^(checkbox|radio|range|color|file|image)$/;
  const all = (selector) => {
    const found = new Set();
    for (const root of roots) {
      if (root.matches?.(selector)) found.add(root);
      root.querySelectorAll(selector).forEach((el) => found.add(el));
    }
    return [...found].filter((el) => inScope(el) && visible(el));
  };
  // A control's edge: not one the browser draws itself (a checkbox, a radio, a
  // range), not a shape inside a drawing (its fill and stroke keep their colours).
  const controls = all(CONTROL).filter((el) => !(el instanceof SVGElement) && !(el.localName === 'input' && NATIVE_DRAWN.test(el.type)));

  // ---------------------------------------------------------------- states
  const STATES = [
    ['aria-pressed', (v) => v === 'true' || v === 'mixed', (v) => v === 'false'],
    ['aria-selected', (v) => v === 'true', (v) => v === 'false'],
    ['aria-checked', (v) => v === 'true' || v === 'mixed', (v) => v === 'false'],
    ['aria-current', (v) => v != null && v !== 'false', (v) => v == null || v === 'false'],
  ];
  const GROUP = '[role="tablist"], [role="radiogroup"], [role="listbox"], [role="toolbar"], [role="group"], [role="menu"], [role="menubar"], [role="grid"], [role="tree"], [role="list"], nav, ul, ol, fieldset, table';
  const kindOf = (el) => `${el.localName}|${el.getAttribute('role') || ''}`;
  const sharesClass = (a, b) => (!a.classList.length && !b.classList.length) || [...a.classList].some((name) => b.classList.contains(name));
  // Its kind, not in the state, in the same group (or within three levels up):
  // up to six of them. The state is lost if any one of them looks the same.
  const MAX_PEERS = 6;
  const peersOf = (el, candidates) => {
    const container = el.parentElement?.closest(GROUP);
    let scope = container;
    if (!scope) { scope = el.parentElement; for (let i = 0; i < 2 && scope?.parentElement; i += 1) scope = scope.parentElement; }
    if (!scope) return [];
    return candidates.filter((other) => other !== el && scope.contains(other) && !other.contains(el) && !el.contains(other)
      && kindOf(other) === kindOf(el) && sharesClass(other, el) && visible(other)).slice(0, MAX_PEERS);
  };
  const pairs = [];
  const seen = new Set();
  for (const [attr, on, off] of STATES) {
    const marked = all(`[${attr}]`).filter((el) => !(el.localName === 'input' && NATIVE_DRAWN.test(el.type)));
    const candidates = attr === 'aria-current'
      ? all(marked.map((el) => el.localName).filter((tag, i, list) => list.indexOf(tag) === i).join(', ') || 'none-at-all').filter((el) => off(el.getAttribute(attr)))
      : marked.filter((el) => off(el.getAttribute(attr)));
    for (const el of marked) {
      if (!on(el.getAttribute(attr)) || seen.has(el)) continue;
      seen.add(el);
      pairs.push({ on: el, peers: peersOf(el, candidates), state: `${attr}="${el.getAttribute(attr)}"` });
    }
  }
  // A checked radio or checkbox that is not drawn itself: what draws it is its
  // label (a choice card), compared with the label of one that is not checked.
  const hiddenInput = (input) => {
    const rect = input.getBoundingClientRect();
    const cs = getComputedStyle(input);
    return rect.width <= 2 || rect.height <= 2 || Number(cs.opacity) < 0.1 || cs.clipPath !== 'none' || cs.clip !== 'auto' || cs.appearance === 'none';
  };
  const inputs = [...new Set(roots.flatMap((root) => [...root.querySelectorAll('input[type="radio"], input[type="checkbox"]')]))].filter((input) => inScope(input) && !input.closest('[aria-hidden="true"], [inert]'));
  const drawer = (input) => (getComputedStyle(input).appearance === 'none' && input.getBoundingClientRect().width > 2 ? input : input.closest('label') || input.parentElement);
  for (const input of inputs) {
    if (!input.checked || !hiddenInput(input)) continue;
    const box = drawer(input);
    if (!box || !visible(box) || seen.has(box)) continue;
    seen.add(box);
    const others = inputs.filter((other) => other !== input && !other.checked && other.type === input.type
      && (input.type === 'radio' ? other.name === input.name : (box.parentElement?.closest(GROUP) || box.parentElement)?.contains(other)));
    const peerBoxes = others.map(drawer).filter((candidate, i, list) => candidate && candidate !== box && visible(candidate) && list.indexOf(candidate) === i).slice(0, MAX_PEERS);
    pairs.push({ on: box, peers: peerBoxes, state: `checked ${input.type}` });
  }

  // ---------------------------------------------------------------- Tab stops
  const TABBABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"], math-field';
  const disabled = (el) => { try { return el.matches(':disabled'); } catch { return false; } };
  const stops = all(TABBABLE).filter((el) => el.tabIndex >= 0 && !disabled(el));

  // ---------------------------------------------------------------- planes
  // Every coordinate plane in scope that is drawn. Its parts are all read, the
  // scope's exclusions aside: a scene leaves a plane's words out of axe's
  // contrast for where they sit on its lines, but under forced colours every word
  // on it is painted, and must be in the theme's colours.
  const PAINTED = 'path, line, polyline, polygon, rect, circle, ellipse, text, tspan';
  const planes = [...new Set(roots.flatMap((root) => [...(root.matches?.('[data-mm-plane]') ? [root] : []), ...root.querySelectorAll('[data-mm-plane]')]))]
    .filter((el) => inScope(el) && !el.parentElement?.closest('[data-mm-plane]'))
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) return false;
      return typeof el.checkVisibility !== 'function' || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    });
  // What one plane paints now. A part in a pattern or a marker is painted where
  // it is used, so it is read wherever it sits; a clip or a mask paints nothing.
  const readPlane = (plane) => {
    const cs = getComputedStyle(plane);
    const borderDrawn = SIDES.some((side) => !/^(none|hidden)$/.test(cs[`border${side}Style`]) && parseFloat(cs[`border${side}Width`]) >= 1);
    const parts = [];
    for (const el of plane.querySelectorAll(PAINTED)) {
      if (el.closest('clipPath, mask')) continue;
      const used = Boolean(el.closest('pattern, marker'));
      const c = getComputedStyle(el);
      if (c.display === 'none' || c.visibility !== 'visible') continue;
      if (!used && !el.getClientRects().length) continue;
      let alphaOf = 1;
      for (let node = el; node && node !== plane.parentElement; node = node.parentElement) alphaOf *= Number(getComputedStyle(node).opacity || 1);
      parts.push({
        tag: el.localName,
        part: el.getAttribute('data-mm-plane-part') || '',
        fill: c.fill,
        stroke: c.stroke,
        fillOpacity: c.fillOpacity,
        strokeOpacity: c.strokeOpacity,
        strokeWidth: c.strokeWidth,
        alpha: alphaOf,
      });
    }
    return { board: { background: cs.backgroundColor, border: { drawn: borderDrawn, colour: cs.borderTopColor } }, parts };
  };
  // The theme's colours as the page resolves them now.
  const paletteOf = () => {
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const out = {};
    for (const name of themeColours) {
      probe.style.color = name;
      out[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    return out;
  };

  const ids = [];
  const idOf = (el) => { let id = ids.indexOf(el); if (id < 0) id = ids.push(el) - 1; return id; };
  // The Tab walk's snapshot (keyboardReach.mjs), each part with what it sits on,
  // so the judge can tell a fill the page's own colour from one that is not.
  const pick = (cs, behind) => ({ ...Object.fromEntries(styleKeys.map((key) => [key, cs[key]])), behind });
  const snap = (el) => {
    const parent = el.parentElement;
    const grand = parent?.parentElement;
    return {
      self: pick(getComputedStyle(el), behindOf(el)),
      before: pick(getComputedStyle(el, '::before'), behindOf(el, true)),
      after: pick(getComputedStyle(el, '::after'), behindOf(el, true)),
      parent: parent ? pick(getComputedStyle(parent), behindOf(parent)) : null,
      grandparent: grand ? pick(getComputedStyle(grand), behindOf(grand)) : null,
    };
  };
  const settle = async (el) => {
    if (el?.localName !== 'math-field') return;
    for (let wait = 0; wait < 50 && !el.shadowRoot?.activeElement; wait += 1) await new Promise((resolve) => { setTimeout(resolve, 20); });
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  };

  window.__mmForced = {
    // One reading of every control and every state pair, in the mode the page is in now.
    read: () => ({
      edges: controls.map((el) => ({ id: idOf(el), facts: { ...boxFacts(el), behind: behindOf(el), wrapped: wrappedBy(el) } })),
      states: pairs.map((pair) => ({ on: partsOf(pair.on), peers: pair.peers.map(partsOf) })),
      planes: planes.map(readPlane),
      palette: paletteOf(),
    }),
    describe: () => ({
      edges: controls.map((el) => ({ id: idOf(el), target: selectorOf(el), html: html(el) })),
      states: pairs.map((pair) => ({ id: idOf(pair.on), target: selectorOf(pair.on), html: html(pair.on), state: pair.state, peers: pair.peers.map(selectorOf) })),
      stops: stops.map((el) => ({ id: idOf(el), target: selectorOf(el), html: html(el) })),
      planes: planes.map((el) => ({ id: idOf(el), target: selectorOf(el), html: html(el) })),
    }),
    // Every Tab stop focused as the keyboard focuses it, then blurred: the style
    // of both, and whether :focus-visible matched. A stop that focus does not
    // land on (a handler moved it, the control went away) is left out.
    focusReadAll: async () => {
      const out = [];
      for (const el of stops) {
        if (!el.isConnected) continue;
        el.focus({ preventScroll: true });
        // eslint-disable-next-line no-await-in-loop
        await settle(el);
        const landed = document.activeElement === el || el.contains(document.activeElement) || Boolean(el.shadowRoot?.activeElement);
        if (!landed) continue;
        const focusVisible = el.matches(':focus-visible') || el.matches(':focus-within');
        const focused = snap(el);
        // A plane focused draws more (the keyboard's crosshair): read it too, in a frame.
        let plane = null;
        if (planes.includes(el)) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
          plane = readPlane(el);
        }
        el.blur();
        out.push({ id: idOf(el), focusVisible, focused, blurred: snap(el), plane });
      }
      return out;
    },
    clipOf: (id) => {
      const el = ids[id];
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = el.getBoundingClientRect();
      const pad = 8;
      const x = Math.max(0, rect.x - pad);
      const y = Math.max(0, rect.y - pad);
      const width = Math.min(innerWidth, rect.x + rect.width + pad) - x;
      const height = Math.min(innerHeight, rect.y + rect.height + pad) - y;
      return width < 2 || height < 2 ? null : { x, y, width, height };
    },
    focus: async (id) => { const el = ids[id]; el?.focus({ preventScroll: true }); await settle(el); },
    blur: (id) => ids[id]?.blur(),
    dispose: () => {
      style.remove();
      document.activeElement?.blur?.();
      for (const el of document.querySelectorAll('*')) {
        const [left, top] = scrolledAtStart.get(el) || [0, 0];
        if (el.scrollLeft !== left || el.scrollTop !== top) el.scrollTo({ left, top, behavior: 'instant' });
      }
      scrollTo({ left: windowAtStart[0], top: windowAtStart[1], behavior: 'instant' });
      delete window.__mmForced;
    },
  };
  return { controls: controls.length, states: pairs.length, stops: stops.length, planes: planes.length, formulas };
};

/*
 * EVERY FORMULA ON SCREEN TYPESET, before the walk switches theme or reads one.
 * MathLive typesets a <math-span> or <math-div> lazily, when its own
 * IntersectionObserver first reports it (MathDisplay looks again a frame and
 * 400 ms after mount: src/platform/math/ensureMathElementRenders.js). Under load
 * that can land after a switch of contrast theme, where the formula is drawn
 * afresh in the new theme and one that would keep the old colour passes; or
 * after the reading, which then has nothing to read. So each formula on screen
 * (within 50 px of the viewport, as ensureMathElementRenders counts one) is
 * waited for, up to `timeoutMs`, and one still not typeset then fails the run by
 * name, never as "nothing found". One farther off stays lazy, as it does on a
 * student's screen, and is judged once it is drawn.
 */
export const FORMULA_WAIT_MS = 15_000;
const UNTYPESET_FORMULAS = ({ include, exclude, renderPart }) => {
  const roots = include.length ? include.flatMap((selector) => [...document.querySelectorAll(selector)]) : [document.body];
  const excluded = (el) => exclude.some((selector) => el.closest(selector));
  const waiting = [];
  for (const el of new Set(roots.flatMap((root) => [...(root.matches?.('math-span, math-div') ? [root] : []), ...root.querySelectorAll('math-span, math-div')]))) {
    if (excluded(el) || !el.isConnected || !el.getClientRects().length) continue;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.bottom < -50 || box.top > innerHeight + 50) continue;
    if (el.shadowRoot?.querySelector(renderPart)?.childElementCount) continue;
    waiting.push(`${el.parentElement?.localName || '?'} > ${el.localName} "${String(el.textContent || '').trim().slice(0, 40)}"`);
  }
  return waiting;
};

/** Waits until every formula on screen in the scope is typeset; throws naming any that is not by `timeoutMs`. */
export const waitForFormulas = async (page, { include = null, exclude = null, timeoutMs = FORMULA_WAIT_MS } = {}) => {
  const asList = (value) => (value == null ? [] : [].concat(value));
  const scope = { include: asList(include), exclude: asList(exclude), renderPart: MATHLIVE_RENDER_PART_SELECTOR };
  const deadline = Date.now() + timeoutMs;
  let waiting = await page.evaluate(UNTYPESET_FORMULAS, scope);
  while (waiting.length && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(100);
    // eslint-disable-next-line no-await-in-loop
    waiting = await page.evaluate(UNTYPESET_FORMULAS, scope);
  }
  if (waiting.length) {
    throw new Error(`${waiting.length} formula(s) on screen not typeset by MathLive in ${Math.round(timeoutMs / 1000)} s, so not read: ${waiting.slice(0, 4).join(' | ')}`);
  }
};

/* Runs in the page: how many pixels differ by more than a hair between two same-sized PNGs. */
const changedPixelsInPage = async ({ a, b }) => {
  const decode = async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  };
  const [left, right] = await Promise.all([decode(a), decode(b)]);
  if (left.width !== right.width || left.height !== right.height) return null;
  let changed = 0;
  for (let i = 0; i < left.data.length; i += 4) {
    if (Math.max(Math.abs(left.data[i] - right.data[i]), Math.abs(left.data[i + 1] - right.data[i + 1]), Math.abs(left.data[i + 2] - right.data[i + 2])) > 40) changed += 1;
  }
  return changed;
};

/* ------------------------------------------------------------------------ */
/* In node                                                                   */
/* ------------------------------------------------------------------------ */

const frames = (page) => page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));

/** Forced colours on or off for the page, and two frames for the restyle. */
export const setForcedColors = async (page, active) => {
  await page.emulateMedia({ forcedColors: active ? 'active' : 'none' });
  await frames(page);
};

/**
 * Read one scene under forced colours and judge it. `include` / `exclude` are
 * the scene's audit scope (accessibilityCertification.mjs sceneScope).
 */
export const auditForcedColors = async (page, { name, viewport = 'default', include = null, exclude = null } = {}) => {
  if (!name) throw new Error('auditForcedColors: name (the scene label) is required');
  const asList = (value) => (value == null ? [] : [].concat(value));
  // Nothing hovered: a pointer left over a control by the scene's own clicks
  // would draw that control's hover style into one reading and not the other.
  await page.mouse.move(0, 0).catch(() => {});
  // Every formula on screen typeset first: one that is not cannot be read.
  await waitForFormulas(page, { include, exclude });
  const setup = await page.evaluate(INSTALL, { include: asList(include), exclude: asList(exclude), styleKeys: [...STYLE_KEYS, 'borderBottomWidth'], renderPart: MATHLIVE_RENDER_PART_SELECTOR, themeColours: [...PLANE_THEME_COLOURS] });
  if (setup.missing) throw new Error(`${name}: nothing on the page matches the scene's scope (${setup.missing.join(', ')})`);
  try {
    const described = await page.evaluate(() => window.__mmForced.describe());
    await setForcedColors(page, false);
    const normal = await page.evaluate(() => window.__mmForced.read());
    await setForcedColors(page, true);
    const forced = await page.evaluate(() => window.__mmForced.read());

    const edges = described.edges.map((entry, i) => ({ ...entry, normal: normal.edges[i].facts, forced: forced.edges[i].facts }));
    // One comparison per peer; a state with no peer of its kind to compare with
    // is listed, not judged.
    const states = described.states.flatMap((entry, i) => entry.peers.map((peer, k) => ({
      ...entry,
      peer,
      normal: { on: normal.states[i].on, off: normal.states[i].peers[k] },
      forced: { on: forced.states[i].on, off: forced.states[i].peers[k] },
    })));

    // Keyboard modality: after a real key press, focus given in code matches
    // :focus-visible as Tab's does.
    await page.keyboard.press('Shift');
    const stopsById = new Map(described.stops.map((stop) => [stop.id, stop]));
    const reads = await page.evaluate(() => window.__mmForced.focusReadAll());
    const focus = [];
    for (const read of reads) {
      const stop = stopsById.get(read.id);
      const entry = { ...stop, ...read, changedPixels: null };
      if (forcedFocusIndicator(entry) === 'none') {
        // The style shows nothing: a picture of it focused and blurred decides.
        // eslint-disable-next-line no-await-in-loop
        const clip = await page.evaluate((id) => window.__mmForced.clipOf(id), stop.id);
        if (clip) {
          // eslint-disable-next-line no-await-in-loop
          await page.evaluate((id) => window.__mmForced.focus(id), stop.id);
          // eslint-disable-next-line no-await-in-loop
          const focusedShot = await page.screenshot({ clip, animations: 'disabled' }).catch(() => null);
          // eslint-disable-next-line no-await-in-loop
          await page.evaluate((id) => window.__mmForced.blur(id), stop.id);
          // eslint-disable-next-line no-await-in-loop
          const blurredShot = await page.screenshot({ clip, animations: 'disabled' }).catch(() => null);
          if (focusedShot && blurredShot) {
            // eslint-disable-next-line no-await-in-loop
            entry.changedPixels = await page.evaluate(changedPixelsInPage, { a: focusedShot.toString('base64'), b: blurredShot.toString('base64') });
          }
        }
      }
      focus.push(entry);
    }

    const math = setup.formulas;
    // Each plane as it stands, and focused where it is a Tab stop: its ring, and the parts focus draws.
    const focusById = new Map(focus.map((entry) => [entry.id, entry]));
    const planes = described.planes.map((entry, i) => {
      const focused = focusById.get(entry.id);
      const ring = focused?.focused?.self;
      const drawn = Boolean(ring) && ring.outlineStyle !== 'none' && parseFloat(ring.outlineWidth) >= 1;
      return {
        ...entry,
        board: forced.planes[i].board,
        parts: forced.planes[i].parts,
        focusedParts: focused?.plane?.parts || [],
        focusRing: focused ? { drawn, colour: ring?.outlineColor } : null,
      };
    });
    const violations = judgeForcedColors({ edges, states, focus, math, planes, palette: forced.palette });
    const normalized = normalizeViolations({ screen: name, viewport, violations });
    return {
      name,
      viewport,
      ...normalized,
      violations,
      summary: {
        controls: setup.controls,
        states: described.states.length,
        statesCompared: described.states.filter((entry) => entry.peers.length).length,
        statesWithoutPeer: described.states.filter((entry) => !entry.peers.length).map((entry) => `${entry.target} (${entry.state})`),
        stops: focus.length,
        formulas: math.length,
        planes: planes.length,
        planeParts: planes.reduce((sum, plane) => sum + plane.parts.length, 0),
        stopsInScope: described.stops.length,
        stopsNotFocusVisible: focus.filter((entry) => !entry.focusVisible).length,
        stopsPhotographed: focus.filter((entry) => entry.changedPixels != null).length,
        minChangedPixels: MIN_CHANGED_PIXELS,
      },
      readings: { edges, states, focus, math, planes, palette: forced.palette },
    };
  } finally {
    await page.evaluate(() => window.__mmForced?.dispose()).catch(() => {});
  }
};

export { STYLE_PARTS };
