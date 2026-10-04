/*
 * COMPUTED-STYLE THEME AUDIT — what a person would actually see.
 *
 * Runs inside the page (Playwright `page.evaluate`) and reads computed styles,
 * so it judges the rendered result, whatever produced it: a token, an inline
 * literal, a stylesheet, a browser default. It is not a screenshot diff — a
 * moved pixel cannot fail it; a white card in dark mode, unreadable text or a
 * page that scrolls sideways can.
 *
 * Findings:
 *   lightSurfaces   dark theme: a large visible element painted with a PALE
 *                   background — relative luminance > LIGHT_SURFACE and HSL
 *                   lightness >= 0.8 (white, light gray, pastel tints) —
 *                   outermost only. Gradients are judged by their lightest
 *                   stop. A dark theme's accent fill (#8ab4f8 behind dark
 *                   text, Material 3's tone-80 primary) is not pale and passes.
 *   lightBorders    dark theme: a large element outlined in a light color —
 *                   the "white box" look, even when the fill is dark.
 *   lowContrast     text under WCAG 2.2 1.4.3 against the surface it sits on
 *                   (4.5:1; 3:1 for large text). Disabled controls are exempt,
 *                   as WCAG exempts inactive components.
 *   overflow        the page scrolls horizontally, or (html/body clip overflow)
 *                   an element runs past the viewport edge and is cut off,
 *                   outside a container that scrolls on purpose.
 *   nativeControls  dark theme: an input/select/textarea whose computed
 *                   color-scheme is not dark (browser-drawn parts stay light).
 *   svgVarAttributes  an SVG fill/stroke ATTRIBUTE holding var(): not reliably
 *                   supported in presentation attributes.
 *   unknownTokens   an inline style naming a --mm-* token that is not defined.
 *
 * INTENTIONAL LIGHT CONTENT is allowlisted, and the list is short on purpose:
 * media (img, video, canvas, iframe), and anything inside an element marked
 * [data-mm-intentional-light] — a paper worksheet preview, say — which must
 * carry a reason in its `data-mm-intentional-light` value.
 */

export const LIGHT_SURFACE = 0.4;
export const LIGHT_BORDER = 0.55;
export const MIN_SURFACE_AREA = 40 * 40;
export const INTENTIONAL_LIGHT_SELECTOR = '[data-mm-intentional-light], img, video, canvas, iframe, picture';

export async function auditTheme(page, { theme, root = 'body', limit = 25 } = {}) {
  return page.evaluate(({ theme: activeTheme, rootSelector, limit: max, LIGHT_SURFACE: lightSurface, LIGHT_BORDER: lightBorder, MIN_SURFACE_AREA: minArea, INTENTIONAL_LIGHT_SELECTOR: allowSelector }) => {
    const parse = (value) => {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
    };
    const pale = (rgb) => (Math.max(...rgb) + Math.min(...rgb)) / 510 >= 0.8;
    const luminance = (rgb) => {
      const c = rgb.map((v) => { const n = v / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const gradientStops = (image) => [...String(image || '').matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter((c) => c && c.alpha > 0.5);
    const visible = (el, style = getComputedStyle(el)) => {
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const describe = (el) => {
      const box = el.getBoundingClientRect();
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('') : '';
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48);
      const parents = [];
      for (let p = el.parentElement; p && parents.length < 2 && p !== document.body; p = p.parentElement) {
        const pc = typeof p.className === 'string' && p.className.trim() ? `.${p.className.trim().split(/\s+/)[0]}` : '';
        if (p.id || pc || p.getAttribute('aria-label')) parents.push(`${p.tagName.toLowerCase()}${p.id ? `#${p.id}` : ''}${pc}${p.getAttribute('aria-label') ? `[${p.getAttribute('aria-label').slice(0, 24)}]` : ''}`);
      }
      return `${parents.reverse().join(' > ')}${parents.length ? ' > ' : ''}${el.tagName.toLowerCase()}${cls} "${label}" @${Math.round(box.x)},${Math.round(box.y + window.scrollY)} ${Math.round(box.width)}x${Math.round(box.height)}`;
    };
    const allowed = (el) => Boolean(el.closest(allowSelector));
    const surfaceOf = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const stops = gradientStops(style.backgroundImage);
        if (stops.length) return stops[0].rgb;
        const bg = parse(style.backgroundColor);
        if (bg && bg.alpha > 0.5) return bg.rgb;
      }
      const html = parse(getComputedStyle(document.documentElement).backgroundColor);
      return html && html.alpha > 0.5 ? html.rgb : (activeTheme === 'dark' ? [0, 0, 0] : [255, 255, 255]);
    };

    const scope = document.querySelector(rootSelector) || document.body;
    const all = [scope, ...scope.querySelectorAll('*')];
    const lightSurfaces = [];
    const lightBorders = [];
    const lowContrast = [];
    const nativeControls = [];
    const svgVarAttributes = [];
    const unknownTokens = new Set();
    const flaggedSurfaces = [];
    const rootStyle = getComputedStyle(document.documentElement);

    for (const el of all) {
      const style = getComputedStyle(el);
      if (!visible(el, style)) continue;
      const inlineStyle = el.getAttribute('style') || '';
      for (const token of inlineStyle.matchAll(/var\((--mm-[a-z0-9-]+)\s*[,)]/g)) {
        if (!rootStyle.getPropertyValue(token[1]).trim() && !style.getPropertyValue(token[1]).trim()) unknownTokens.add(token[1]);
      }
      if (el instanceof SVGElement && /var\(/.test(`${el.getAttribute('fill') || ''}${el.getAttribute('stroke') || ''}`)) svgVarAttributes.push(describe(el));
      if (allowed(el)) continue;
      const box = el.getBoundingClientRect();
      const area = box.width * box.height;

      // A pale SVG shape (a wheel's white center disc, a white plot area) is a
      // light surface too, unless it is a graph drawn on --mm-graph-bg.
      if (activeTheme === 'dark' && el instanceof SVGGraphicsElement && el.matches('rect, circle, ellipse, path, polygon') && area >= minArea) {
        const fill = parse(style.fill);
        if (fill && fill.alpha > 0.5 && Number(style.fillOpacity || 1) > 0.5 && pale(fill.rgb) && luminance(fill.rgb) > lightSurface) {
          lightSurfaces.push(`${describe(el)} svg-fill=${style.fill}`);
        }
        continue;
      }
      if (activeTheme === 'dark' && area >= minArea && !flaggedSurfaces.some((parent) => parent.contains(el))) {
        const bg = parse(style.backgroundColor);
        const stops = gradientStops(style.backgroundImage);
        const paleLuminance = (rgb) => (pale(rgb) ? luminance(rgb) : 0);
        const lightest = [bg && bg.alpha > 0.5 ? paleLuminance(bg.rgb) : 0, ...stops.map((stop) => paleLuminance(stop.rgb))].reduce((a, b) => Math.max(a, b), 0);
        // Material 3's dark filled button is a tone-80 accent (#8ab4f8,
        // #d0bcff) behind dark text: chromatic, small, interactive. A pale
        // NEUTRAL fill (white/gray) is never exempt.
        const accentControl = bg && el.matches('button, [role="button"], a, input[type="submit"]') && area <= 40000
          && Math.max(...bg.rgb) - Math.min(...bg.rgb) >= 40;
        if (lightest > lightSurface && !accentControl) {
          flaggedSurfaces.push(el);
          lightSurfaces.push(`${describe(el)} bg=${style.backgroundColor}${stops.length ? ` gradient=${style.backgroundImage.slice(0, 60)}` : ''}`);
        }
        const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((side) => Number.parseFloat(style[`border${side}Width`]) >= 1 && style[`border${side}Style`] !== 'none');
        // Pale NEUTRAL outlines are the "white box" look; an amber or blue accent
        // outline (a selected state) is not.
        const lightSides = sides.filter((side) => { const c = parse(style[`border${side}Color`]); return c && c.alpha > 0.5 && luminance(c.rgb) > lightBorder && pale(c.rgb) && Math.max(...c.rgb) - Math.min(...c.rgb) < 40; });
        // A white outline on a saturated banner (an outlined button on the blue
        // Resume card) is that banner's own design, not a light box on dark chrome.
        const host = el.parentElement ? surfaceOf(el.parentElement) : [0, 0, 0];
        const onSaturatedBanner = Math.max(...host) - Math.min(...host) >= 60;
        if (lightSides.length >= 2 && box.width >= 80 && box.height >= 24 && !onSaturatedBanner) lightBorders.push(`${describe(el)} border=${style.borderTopColor}`);
      }

      if (activeTheme === 'dark' && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]), select, textarea')) {
        if (!/dark/.test(style.colorScheme)) nativeControls.push(`${describe(el)} color-scheme=${style.colorScheme}`);
      }

      const ownText = [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      const isField = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]), select, textarea');
      if ((ownText || isField) && !el.closest('[aria-hidden="true"]') && !el.matches(':disabled') && !el.closest('button:disabled, [aria-disabled="true"]')) {
        const fg = parse(style.color);
        if (fg && fg.alpha > 0.4) {
          const bg = surfaceOf(el);
          const size = Number.parseFloat(style.fontSize);
          const bold = Number(style.fontWeight) >= 700;
          const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
          const r = ratio(fg.rgb, bg);
          if (r < min) lowContrast.push(`${describe(el)} ${r.toFixed(2)}:1 fg=${style.color} bg=rgb(${bg.join(',')})`);
        }
      }
    }
    // html/body clip horizontal overflow (index.css), so scrollWidth cannot see
    // it: content past the right edge is simply cut off. Look for elements that
    // extend past the viewport outside a deliberate scroll container.
    const viewportWidth = document.documentElement.clientWidth;
    const clipped = [];
    const scrollsX = (node) => {
      for (let p = node.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        if (p.id === 'root') continue;
        const ox = getComputedStyle(p).overflowX;
        if (['auto', 'scroll', 'hidden', 'clip'].includes(ox)) return true;
      }
      return false;
    };
    for (const el of all) {
      if (clipped.some((parent) => parent.contains(el))) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || !visible(el, style)) continue;
      const box = el.getBoundingClientRect();
      if ((box.right > viewportWidth + 1 || box.left < -1) && box.width > 4 && !scrollsX(el)) clipped.push(el);
    }
    const doc = document.scrollingElement || document.documentElement;
    const overflowing = clipped.slice(0, 5).map(describe);
    return {
      lightSurfaces: lightSurfaces.slice(0, max),
      lightSurfaceCount: lightSurfaces.length,
      lightBorders: lightBorders.slice(0, max),
      lightBorderCount: lightBorders.length,
      lowContrast: lowContrast.slice(0, max),
      lowContrastCount: lowContrast.length,
      overflow: doc.scrollWidth > doc.clientWidth + 1 || overflowing.length
        ? { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, viewportWidth, offscreen: overflowing }
        : null,
      nativeControls: nativeControls.slice(0, max),
      svgVarAttributes: svgVarAttributes.slice(0, max),
      unknownTokens: [...unknownTokens],
    };
  }, { theme, rootSelector: root, limit, LIGHT_SURFACE, LIGHT_BORDER, MIN_SURFACE_AREA, INTENTIONAL_LIGHT_SELECTOR });
}

export const auditFailures = (result) => [
  ...result.lightSurfaces.map((entry) => `light surface: ${entry}`),
  ...result.lightBorders.map((entry) => `light border: ${entry}`),
  ...result.lowContrast.map((entry) => `low contrast: ${entry}`),
  ...(result.overflow ? [`horizontal overflow: ${JSON.stringify(result.overflow)}`] : []),
  ...result.nativeControls.map((entry) => `native control not dark: ${entry}`),
  ...result.svgVarAttributes.map((entry) => `var() in SVG attribute: ${entry}`),
  ...result.unknownTokens.map((entry) => `undefined token: ${entry}`),
];
