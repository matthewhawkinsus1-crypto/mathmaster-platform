/*
 * CONTRAST REVIEW — decides every color-contrast node axe-core could not.
 *
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/contrastReview.mjs          # exits 1 while any decided failure remains
 *
 *   Same environment as accessibilityCertification.mjs (AUDIT_ORIGIN,
 *   TEACHER_HARNESS_ORIGIN, ONLY=<screen id>[,...], PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH, ACCESSIBILITY_ARTIFACTS). Writes contrast-review.json
 *   next to the certification's report.json.
 *
 * WHY. axe answers "needs review" for text it cannot place on one solid colour:
 * text over a gradient, an image, a pseudo-element, or a translucent layer, and
 * one-glyph icons. The certification reports those and moves on; this script
 * decides them.
 *
 * HOW, for every incomplete color-contrast node of every SCREENS scene, at both
 * viewports (the certification's own drivers and contexts):
 *
 *   1. STOPS. Walk the element and its ancestors to the root, collecting every
 *      background-color and every colour stop of every background-image
 *      gradient. Composite back to front over white: each stop over every
 *      candidate colour beneath it (rgba is composited, never dropped). Opacity
 *      on the text's own chain fades the text toward its background.
 *   2. PIXELS. Make the node's text (and its descendants', and SVG text fill)
 *      transparent, screenshot each of the node's text boxes, and take the
 *      darkest and the lightest background pixel (by relative luminance).
 *   3. The node's ratio is the WORST of text-vs-each-stop and text-vs-darkest /
 *      text-vs-lightest pixel. Required: 4.5:1, 3:1 for large text (>= 24px, or
 *      >= 18.66px bold), 3:1 for an icon glyph that is a control's only visible
 *      label (WCAG 1.4.11 non-text: it identifies the control).
 *
 * SKIPPED, and said so per family: an aria-hidden glyph that is purely
 * decorative AND sits inside a control (or status line) whose visible text
 * label is itself measured here and passes. Graph / SVG axis text always
 * counts. Colour emoji (which paint their own colours, not `color`) are judged
 * by their background-free pixels as decorative only under the same rule.
 *
 * Families group nodes by component: the node's own classes/tag plus its
 * nearest identified ancestor (a class, data-mm-*, aria-label or role).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AXE_PATH, settleForAudit } from './accessibilityAudit.mjs';
import { SCREENS, VIEWPORTS, sceneLabel } from './accessibilityCertification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// ------------------------------------------------------------------ colour maths (node side)
const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];

/*
 * The worst ratio of one text colour (rgba) against background candidates
 * (opaque rgb). Translucent text is composited over each candidate first.
 */
export const worstRatio = (text, backgrounds) => {
  let worst = Infinity;
  let against = null;
  for (const bg of backgrounds) {
    const ratio = contrast(over(text, bg), bg);
    if (ratio < worst) { worst = ratio; against = bg; }
  }
  return { ratio: worst, against };
};

// ------------------------------------------------------------------ in-page analysis
/* Runs in the page: axe's incomplete color-contrast nodes, each described. */
const collectInPage = async ({ include, exclude }) => {
  const context = { include: include.length ? include.map((s) => [s]) : [['html']] };
  if (exclude.length) context.exclude = exclude.map((s) => [s]);
  const result = await window.axe.run(context, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['incomplete'], elementRef: true });
  const entry = result.incomplete.find((item) => item.id === 'color-contrast');
  const nodes = entry ? entry.nodes : [];

  const parse = (value) => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(value || '');
    if (!m) return null;
    let a = m[4] == null ? 1 : (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]));
    if (!Number.isFinite(a)) a = 1;
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  };
  // Computed colours inside gradients are serialised as rgb()/rgba(); named
  // `transparent` too may appear.
  const gradientStops = (image) => {
    if (!image || image === 'none' || !/gradient\(/.test(image)) return [];
    const stops = [];
    for (const match of image.matchAll(/rgba?\([^)]*\)|\btransparent\b/g)) {
      stops.push(match[0] === 'transparent' ? [0, 0, 0, 0] : parse(match[0]));
    }
    return stops.filter(Boolean);
  };
  const hasUrlImage = (image) => /url\(/.test(image || '');
  const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];

  const idOf = (el) => {
    const bits = [];
    const cls = [...(el.classList || [])].filter((c) => !/^(css|sc|jsx)-|^__cr/.test(c));
    if (cls.length) bits.push(`.${cls.join('.')}`);
    for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
      if (/^data-mm-|^data-test-cycle|^role$/.test(attr)) bits.push(`[${attr}${attr === 'role' ? `=${el.getAttribute(attr)}` : ''}]`);
    }
    if (el.getAttribute?.('aria-label')) bits.push(`[aria-label="${el.getAttribute('aria-label').replace(/\d+/g, 'N')}"]`);
    return bits.join('');
  };
  const SEMANTIC = /^(button|a|section|nav|header|footer|main|aside|h[1-6]|p|li|label|summary|svg|math-span|math-field|table)$/;
  const parentOf = (node) => node.parentElement || node.getRootNode()?.host || null;
  // The component: the nearest identified ancestor (class, data-mm-*, role,
  // aria-label), and between it and the node the nearest semantic element.
  const familyOf = (el) => {
    const own = `${el.localName}${idOf(el)}${el.getAttribute('aria-hidden') === 'true' ? '[aria-hidden]' : ''}`;
    let anchor = parentOf(el);
    let semantic = null;
    let depth = 0;
    while (anchor && !idOf(anchor) && depth < 10) {
      if (!semantic && SEMANTIC.test(anchor.localName)) semantic = anchor.localName;
      anchor = parentOf(anchor);
      depth += 1;
    }
    const anchorId = anchor ? `${anchor.localName}${idOf(anchor)}` : 'root';
    return `${anchorId.slice(0, 120)}${semantic ? ` ${semantic}` : ''} > ${own}`;
  };

  const CONTROL = 'button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="link"], label, summary, [role="status"], [role="alert"]';
  const isEmoji = (text) => /\p{Extended_Pictographic}/u.test(text);

  const describe = (el) => {
    const style = getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize);
    const fontWeight = Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
    const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    // Text colour: -webkit-text-fill-color wins over color; SVG text uses fill.
    let text = parse(el instanceof SVGElement ? style.fill : (style.webkitTextFillColor || style.color)) || parse(style.color);
    const gradientText = /text/.test(style.backgroundClip || style.webkitBackgroundClip || '') ? gradientStops(style.backgroundImage) : [];
    const texts = gradientText.length ? gradientText : [text];

    // Back-to-front layers: root first.
    const chain = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement || node.getRootNode()?.host) chain.push(node);
    chain.reverse();
    let candidates = [[255, 255, 255]];
    const notes = new Set();
    let fade = 1; // opacity between the text and its nearest opaque layer
    for (const node of chain) {
      const s = getComputedStyle(node);
      const layers = [];
      const bg = parse(s.backgroundColor);
      if (bg && bg[3] > 0 && !(node === el && gradientText.length)) layers.push([bg]);
      const stops = node === el && gradientText.length ? [] : gradientStops(s.backgroundImage);
      if (stops.length) { layers.push(stops); notes.add('gradient'); }
      if (hasUrlImage(s.backgroundImage)) notes.add('image');
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(node, pseudo);
        if (p.content && p.content !== 'none' && (parse(p.backgroundColor)?.[3] > 0 || gradientStops(p.backgroundImage).length)) notes.add(`pseudo ${pseudo}`);
      }
      if (s.mixBlendMode !== 'normal' || (s.filter && s.filter !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none')) notes.add('blend/filter');
      for (const stopsOfLayer of layers) {
        const next = [];
        for (const beneath of candidates) {
          for (const stop of stopsOfLayer) next.push(over(stop, beneath));
        }
        // Keep the distinct candidates (rounded), bounded.
        const seen = new Map();
        for (const c of next) seen.set(c.map((v) => Math.round(v)).join(','), c.map((v) => Math.round(v)));
        candidates = [...seen.values()].slice(0, 400);
      }
      const opacity = Number(s.opacity);
      if (layers.some((l) => l.every((stop) => stop[3] >= 1))) fade = 1;
      if (opacity < 1) { fade *= opacity; notes.add(`opacity ${opacity}`); }
    }
    const textColours = texts.map((c) => [c[0], c[1], c[2], c[3] * fade]);
    const glyph = (el.textContent || '').trim();
    const ariaHidden = Boolean(el.closest('[aria-hidden="true"]'));
    const control = el.closest(CONTROL);
    return {
      tag: el.localName,
      text: glyph.slice(0, 60),
      pointerEvents: style.pointerEvents,
      textAlpha: Math.max(...textColours.map((c) => c[3])),
      fontSize, fontWeight, large,
      svg: el instanceof SVGElement || Boolean(el.closest('svg')),
      ariaHidden,
      emoji: isEmoji(glyph),
      shortGlyph: [...glyph].length <= 2,
      family: familyOf(el),
      textColours,
      stopCandidates: candidates,
      notes: [...notes],
      control: control && control !== el ? {
        tag: control.localName,
        label: (control.getAttribute('aria-label') || '').slice(0, 60),
        visibleText: [...control.querySelectorAll('*')].concat(control)
          .flatMap((n) => [...n.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim() && !c.parentElement.closest('[aria-hidden="true"]')).map((c) => c.textContent.trim()))
          .join(' ').slice(0, 80),
      } : null,
    };
  };

  window.__crTargets = [];
  const described = [];
  for (const node of nodes) {
    const el = node.element;
    if (!el) continue;
    const index = window.__crTargets.push(el) - 1;
    const info = describe(el);
    info.index = index;
    info.target = node.target.flat().join(' >>> ');
    info.axe = { messageKey: node.any?.[0]?.data?.messageKey || node.any?.[0]?.message || null, data: node.any?.[0]?.data || null };
    // The control's visible label nodes, to decide decorative glyphs.
    if (info.ariaHidden && info.control) {
      const control = el.closest(CONTROL);
      const labels = [];
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent.trim() || t.parentElement.closest('[aria-hidden="true"]')) continue;
        if (!labels.includes(t.parentElement)) labels.push(t.parentElement);
      }
      info.labelIndexes = labels.slice(0, 4).map((label) => {
        const i = window.__crTargets.push(label) - 1;
        return { index: i, ...describe(label) };
      });
    }
    described.push(info);
  }
  return described;
};

/* Runs in the page: the darkest and lightest pixel of a PNG (base64). */
const pixelExtremes = async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  let dark = null; let light = null; let dl = Infinity; let ll = -Infinity;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * ch(data[i]) + 0.7152 * ch(data[i + 1]) + 0.0722 * ch(data[i + 2]);
    if (l < dl) { dl = l; dark = [data[i], data[i + 1], data[i + 2]]; }
    if (l > ll) { ll = l; light = [data[i], data[i + 1], data[i + 2]]; }
  }
  return { dark, light };
};

const HIDE_CSS = `
  .__crHide, .__crHide * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }
  .__crHide text, text.__crHide, .__crHide tspan, tspan.__crHide { fill: transparent !important; stroke: transparent !important; }
  *, *::before, *::after { transition: none !important; animation-play-state: paused !important; }
`;

/* Screenshot each text box of target `index` with its text hidden. */
const measurePixels = async (page, index) => {
  const rects = await page.evaluate(({ i, css }) => {
    const el = window.__crTargets[i];
    if (!el?.isConnected) return [];
    // The hiding rule must reach the node's own tree: MathLive renders into a
    // shadow root that a document stylesheet does not style.
    for (const root of [document, el.getRootNode()]) {
      const host = root === document ? document.head : root;
      if (host.querySelector?.(':scope > style[data-cr-style]')) continue;
      const style = document.createElement('style');
      style.dataset.crStyle = '';
      style.textContent = css;
      host.append(style);
    }
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.classList.add('__crHide');
    const out = [];
    const push = (r) => {
      // Inset by a pixel: the box edge can antialias into a neighbouring layer.
      const x = Math.max(0, r.left + 1); const y = Math.max(0, r.top + 1);
      const w = Math.min(window.innerWidth, r.right - 1) - x; const h = Math.min(window.innerHeight, r.bottom - 1) - y;
      if (w >= 1 && h >= 1) out.push({ x, y, width: w, height: h });
    };
    if (el instanceof SVGElement) push(el.getBoundingClientRect());
    else {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) push(r);
      }
      if (!out.length) push(el.getBoundingClientRect());
    }
    return out.slice(0, 12);
  }, { i: index, css: HIDE_CSS });
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  const extremes = [];
  for (const clip of rects) {
    // eslint-disable-next-line no-await-in-loop
    const png = await page.screenshot({ clip, animations: 'disabled' }).catch(() => null);
    if (!png) continue;
    // eslint-disable-next-line no-await-in-loop
    extremes.push(await page.evaluate(pixelExtremes, png.toString('base64')));
  }
  await page.evaluate((i) => window.__crTargets[i]?.classList.remove('__crHide'), index);
  const all = extremes.flatMap((e) => [e.dark, e.light]).filter(Boolean);
  if (!all.length) return null;
  const sorted = all.sort((a, b) => luminance(a) - luminance(b));
  return { dark: sorted[0], light: sorted[sorted.length - 1] };
};

const judge = (info, pixels) => {
  const backgrounds = [...info.stopCandidates];
  if (pixels) backgrounds.push(pixels.dark, pixels.light);
  let worst = { ratio: Infinity, against: null, text: null };
  for (const text of info.textColours) {
    const r = worstRatio(text, backgrounds);
    if (r.ratio < worst.ratio) worst = { ...r, text };
  }
  return worst;
};

const hex = (c) => (c ? `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}${c[3] != null && c[3] < 1 ? `@${Math.round(c[3] * 100)}%` : ''}` : null);

// ------------------------------------------------------------------ main
const main = async () => {
  const ONLY = new Set(String(process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean));
  const screens = SCREENS.filter((screen) => !ONLY.size || ONLY.has(screen.id));
  const origins = {
    app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
    audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199',
  };
  const artifacts = process.env.ACCESSIBILITY_ARTIFACTS || path.join(repo, 'tests/browser/artifacts/accessibility');
  mkdirSync(artifacts, { recursive: true });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);

  const nodes = [];
  const unreachable = [];
  for (const viewport of VIEWPORTS) {
    for (const screen of screens) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.isMobile), hasTouch: Boolean(viewport.hasTouch),
        colorScheme: 'light', reducedMotion: 'reduce',
      });
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      let first = true;
      try {
        if (screen.open) await screen.open(page, origins);
      } catch (error) {
        unreachable.push(`${screen.id}|${viewport.id}: ${error.message.split('\n')[0]}`);
        await context.close();
        continue;
      }
      for (const scene of screen.scenes) {
        const label = sceneLabel(screen, scene);
        try {
          await scene.run(page, origins, { first });
          first = false;
          await settleForAudit(page);
        } catch (error) {
          unreachable.push(`${label}|${viewport.id}: ${error.message.split('\n')[0]}`);
          break;
        }
        if (!(await page.evaluate(() => typeof window.axe?.run === 'function'))) await page.addScriptTag({ path: AXE_PATH });
        const asList = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]));
        const described = await page.evaluate(collectInPage, { include: asList(screen.include), exclude: asList(screen.exclude) });
        for (const info of described) {
          // eslint-disable-next-line no-await-in-loop
          const pixels = await measurePixels(page, info.index);
          const worst = judge(info, pixels);
          let labelWorst = null;
          if (info.labelIndexes?.length) {
            labelWorst = Infinity;
            for (const labelInfo of info.labelIndexes) {
              // eslint-disable-next-line no-await-in-loop
              const lp = await measurePixels(page, labelInfo.index);
              const lw = judge(labelInfo, lp);
              const need = labelInfo.large ? 3 : 4.5;
              labelWorst = Math.min(labelWorst, lw.ratio / need);
            }
          }
          // Decision.
          const decorative = info.ariaHidden && info.shortGlyph;
          let required = info.large ? 3 : 4.5;
          let decision;
          if (decorative && info.control?.visibleText && labelWorst != null && labelWorst >= 1) {
            decision = 'skip: decorative glyph in a control whose visible text label passes';
          } else if (decorative && info.control && !info.control.visibleText) {
            required = 3; // the glyph is the control's only visible label: non-text (1.4.11)
            decision = 'icon is the control\'s only visible label (3:1 non-text)';
          }
          // WCAG 1.4.3 exempts text that is pure decoration. Held narrowly: a
          // hidden-from-AT, click-through layer drawn at <= 10% opacity (the
          // secure exam's anti-photo watermark), outside every control.
          if (!decision && info.ariaHidden && !info.control && info.pointerEvents === 'none' && info.textAlpha <= 0.1) {
            decision = 'skip: pure decoration (WCAG 1.4.3 incidental) — aria-hidden, click-through, <= 10% opacity watermark';
          }
          if (info.emoji && !decision?.startsWith('skip')) {
            decision = decision || 'colour emoji';
          }
          const pass = decision?.startsWith('skip') ? true : worst.ratio >= required;
          nodes.push({
            scene: label, viewport: viewport.id, target: info.target, family: info.family,
            text: info.text, fontSize: info.fontSize, fontWeight: info.fontWeight, large: info.large,
            ariaHidden: info.ariaHidden, emoji: info.emoji, svg: info.svg, control: info.control,
            axeReason: info.axe.messageKey, notes: info.notes,
            textColour: hex(worst.text), against: hex(worst.against),
            stops: info.stopCandidates.length > 6 ? `${info.stopCandidates.length} candidates` : info.stopCandidates.map(hex),
            pixels: pixels ? { dark: hex(pixels.dark), light: hex(pixels.light) } : null,
            ratio: Number(worst.ratio.toFixed(2)), required, labelMargin: labelWorst == null ? null : Number(labelWorst.toFixed(2)),
            decision: decision || null, pass,
          });
        }
        console.log(`     ${label.padEnd(32)} ${viewport.id.padEnd(8)} ${described.length} undecided node(s)`);
      }
      await context.close();
    }
  }
  await browser.close();

  // Families. A skipped (decorative) node still reports its own measured
  // ratio, and the weakest margin of the control label that justified it.
  const families = new Map();
  for (const node of nodes) {
    const f = families.get(node.family) || {
      family: node.family, count: 0, worst: null, failing: 0, skipped: 0, labelMargin: null,
      scenes: new Set(), decisions: new Set(), example: null,
    };
    f.count += 1;
    f.scenes.add(`${node.scene}|${node.viewport}`);
    if (node.decision) f.decisions.add(node.decision);
    const skipped = Boolean(node.decision?.startsWith('skip'));
    if (skipped) f.skipped += 1;
    if (!node.pass) f.failing += 1;
    if (node.labelMargin != null) f.labelMargin = Math.min(f.labelMargin ?? Infinity, node.labelMargin);
    // The example is the weakest node (by margin over its requirement),
    // preferring a judged node over a skipped one.
    const margin = node.ratio / node.required;
    const exampleSkipped = Boolean(f.example?.decision?.startsWith('skip'));
    if (!f.example || (exampleSkipped && !skipped) || (exampleSkipped === skipped && margin < f.example.ratio / f.example.required)) f.example = node;
    families.set(node.family, f);
  }
  const familyRows = [...families.values()].map((f) => ({
    family: f.family, count: f.count,
    worstRatio: f.example.ratio, required: f.example.required,
    skipped: f.skipped, failing: f.failing, labelMargin: f.labelMargin,
    verdict: f.failing ? 'FAIL' : (f.skipped === f.count ? 'SKIP (decorative)' : 'pass'),
    decisions: [...f.decisions], scenes: [...f.scenes].sort(),
    example: { scene: f.example.scene, viewport: f.example.viewport, target: f.example.target, text: f.example.text, textColour: f.example.textColour, against: f.example.against, notes: f.example.notes },
  })).sort((a, b) => (b.failing - a.failing) || ((a.worstRatio / a.required) - (b.worstRatio / b.required)));

  console.log('');
  for (const row of familyRows) {
    console.log(`${row.verdict.padEnd(17)} ${String(row.count).padStart(3)}  worst ${row.worstRatio.toFixed(2).padStart(5)} / ${String(row.required).padEnd(3)}  ${row.family}`);
    console.log(`${' '.repeat(23)}e.g. ${row.example.scene}|${row.example.viewport} "${row.example.text}" ${row.example.textColour} on ${row.example.against}${row.example.notes.length ? ` (${row.example.notes.join(', ')})` : ''}`);
    for (const decision of row.decisions) console.log(`${' '.repeat(23)}${decision}${row.labelMargin != null && decision.includes('label passes') ? ` (label at ${row.labelMargin.toFixed(2)}x its requirement)` : ''}`);
  }
  const failing = nodes.filter((node) => !node.pass);
  const report = {
    generatedBy: 'tests/browser/contrastReview.mjs',
    method: 'worst of text vs every composited background stop and vs the darkest/lightest background pixel with the text hidden',
    unreachable, totals: { nodes: nodes.length, families: familyRows.length, failingNodes: failing.length, skippedDecorative: nodes.filter((n) => n.decision?.startsWith('skip')).length },
    families: familyRows, nodes,
  };
  writeFileSync(path.join(artifacts, 'contrast-review.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${nodes.length} undecided color-contrast node(s) in ${familyRows.length} famil(ies); ${failing.length} fail, ${report.totals.skippedDecorative} skipped as decorative. Report: ${path.relative(repo, path.join(artifacts, 'contrast-review.json'))}`);
  if (unreachable.length) {
    console.error(`${unreachable.length} scene(s) could not be reached:\n  ${unreachable.join('\n  ')}`);
  }
  if (failing.length || unreachable.length) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
