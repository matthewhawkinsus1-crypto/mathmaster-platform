// CAN A STUDENT DO EVERY TOOL WITHOUT A MOUSE?  (WCAG 2.1.1 Keyboard, 2.4.7 Focus Visible)
//
//   npx vite --host 127.0.0.1 --port 5499 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5499 node tests/browser/keyboardSweep.mjs
//
//   --tool=<id> | --tool=<id>:<variant>  one scene (e.g. graphing2, systemsWorkspace:spatial)
//   --extras-only / --no-extras          only / without the EXTRA_SCENES below
//   --host=bare                          no assignment-screen wrapper (Path, live challenge…)
//   --out=<name>                         write report-<name>.json, not report.json
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// AN AUDIT, NOT A GATE. It always exits 0 and writes
// tests/browser/artifacts/keyboard/report.json (gitignored, like every browser
// artifact). docs/accessibility/KEYBOARD_SWEEP.md is the human reading of it.
//
// Every registered student tool is mounted through QuestionEngine with its
// preview-bench question (keyboardSweepMain.jsx), at a 1366x768 Chromebook,
// between two sentinel buttons. Then, keyboard only:
//
//   1. FORWARD WALK. Tab from the start sentinel until the end sentinel. Every
//      stop is recorded with its accessibility-tree role and name (Chrome's own,
//      via CDP) and whether focusing it changes anything you can SEE: computed
//      outline / box-shadow / border / background of the element, its ::before
//      and ::after, and its two nearest ancestors (a :focus-within ring), plus a
//      pixel diff of the area around it, focused against blurred. A walk that
//      stops moving, or cycles, without reaching the end sentinel is a trap.
//   2. REVERSE WALK. Shift+Tab from the end sentinel back to the start.
//   3. POPUPS AND DIALOGS. Every stop that declares aria-expanded/aria-haspopup,
//      or is named like Work View / enlarge / scratchpad / calculator / hint, is
//      opened with Enter. A dialog is Tab-walked (does focus stay inside? is a
//      Close reachable?); a dialog, menu or floating panel must close on Escape
//      (a plain disclosure need not), and where focus lands afterwards is kept.
//   4. PRIMARY ACTION. A fresh copy of the tool is answered with keys only — type
//      into every box, choose with arrows/Space, plot on a focusable plane with
//      the arrow keys and Enter — and every Check/Submit control is pressed with
//      Enter. A grade, a feedback message or a state change counts as "the tool
//      responded"; a correct answer is not required (the sweep does not know the
//      answers, and keyboard operability is the question).
//   5. MOUSE-ONLY HANDLERS. Every rendered element whose React props carry a
//      click/pointer/drag handler is checked for a keyboard route: is it a tab
//      stop, and does Enter/Space reach the handler?
//   6. FOCUS THAT MOVES ON ITS OWN. Focus is checked after every keyboard Check
//      (still on the button, or dropped to <body>?) and for three seconds after
//      a single Tab right after load.
//
// A focused control counts as visibly focused only if something changed on
// screen AND it is not under another element (elementFromPoint), so a ring
// drawn underneath the sticky work bar does not pass.
//
// A static source scan runs alongside: JSX tags that are not buttons/links/
// inputs but carry onClick/onPointerDown/onMouseDown, buttons whose only
// handler is a pointer handler (Enter/Space do nothing), draggable/onDragStart,
// and `outline: none` / `outline: 0` in tool and shared styling, with file:line.

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5499';
const OUT_DIR_BASE = path.join(repo, 'tests/browser/artifacts/keyboard');
const ONLY = (process.argv.find((arg) => arg.startsWith('--tool=')) || '').slice('--tool='.length) || null;
// `--host=bare` mounts the tool without the assignment-screen wrapper (see
// keyboardSweepMain.jsx): the Path session / live challenge / recovery hosts.
const HOST = (process.argv.find((arg) => arg.startsWith('--host=')) || '').slice('--host='.length) || 'assignment';
const MAX_STOPS = 260;
const VIEWPORT = { width: 1366, height: 768 };
const OUT_DIR = HOST === 'bare' ? path.join(OUT_DIR_BASE, 'bare') : OUT_DIR_BASE;
// `--out=<name>` writes report-<name>.json instead of report.json, so a partial
// run (one tool, `--extras-only`) does not replace the full report.
const OUT_SUFFIX = (process.argv.find((arg) => arg.startsWith('--out=')) || '').slice('--out='.length);
const REPORT_NAME = OUT_SUFFIX ? `report-${OUT_SUFFIX}.json` : 'report.json';

/* ------------------------------------------------------------------------ */
/* Static source scan                                                        */
/* ------------------------------------------------------------------------ */

const SHARED_PREFIXES = ['src/components/common/', 'src/ui/', 'src/tools/shared/', 'src/MathDisplay.jsx', 'src/MathInput.jsx', 'src/index.css', 'src/App.css', 'src/theme/'];
// Not in the shared directories, but rendered around EVERY tool by
// QuestionEngine: a gap here is a platform gap, not a tool's.
const PLATFORM_CHROME = ['src/QuestionEngine.jsx', 'src/ScratchpadOverlay.jsx', 'src/components/CalculatorPanel.jsx', 'src/components/student/MobileViewportContainer.jsx'];
const isShared = (file) => SHARED_PREFIXES.some((prefix) => file.startsWith(prefix)) || PLATFORM_CHROME.includes(file);

const walkFiles = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(full, out);
    else if (/\.(jsx?|css)$/.test(name)) out.push(full);
  }
  return out;
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// The text of a JSX opening tag starting at `start` (at '<'), honouring braces
// and string literals so `onClick={() => a > b}` does not end the tag early.
const openingTag = (text, start) => {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < text.length && i < start + 6000; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return text.slice(start, i + 1);
  }
  return null;
};

const NATIVE_INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label', 'option']);
const POINTER_HANDLER = /\bon(Click|PointerDown|PointerUp|MouseDown|MouseUp|DoubleClick|TouchStart)=/;

const staticScan = () => {
  const roots = ['src/tools', 'src/components/common', 'src/ui'].map((dir) => path.join(repo, dir));
  const files = [...roots.flatMap((dir) => walkFiles(dir)), ...['src/MathDisplay.jsx', 'src/MathInput.jsx', 'src/index.css', 'src/App.css', ...PLATFORM_CHROME].map((file) => path.join(repo, file))];
  const nonButtonHandlers = [];
  const pointerOnlyButtons = [];
  const dragSources = [];
  const outlineNone = [];
  for (const full of files) {
    const rel = path.relative(repo, full).split(path.sep).join('/');
    const text = readFileSync(full, 'utf8');
    if (/\.jsx?$/.test(rel)) {
      for (const match of text.matchAll(/<([a-z][a-zA-Z0-9]*)\b/g)) {
        const tag = openingTag(text, match.index);
        if (!tag) continue;
        const name = match[1];
        const line = lineOf(text, match.index);
        const has = (re) => re.test(tag);
        const handlers = [...tag.matchAll(/\bon([A-Z][A-Za-z]+)=/g)].map((m) => `on${m[1]}`);
        if (has(/\bdraggable\b/) || has(/\bonDragStart=/)) dragSources.push({ file: rel, line, tag: name, handlers, shared: isShared(rel) });
        if (!POINTER_HANDLER.test(tag)) continue;
        if (NATIVE_INTERACTIVE.has(name)) {
          if (name === 'button' && !has(/\bonClick=/) && !has(/\bonKey(Down|Up)=/) && has(/\bon(PointerDown|MouseDown|TouchStart)=/)) {
            pointerOnlyButtons.push({ file: rel, line, tag: name, handlers, shared: isShared(rel) });
          }
          continue;
        }
        const role = (tag.match(/\brole=(?:"([^"]+)"|'([^']+)'|\{['"]([^'"]+)['"]\})/) || []).slice(1).find(Boolean) || null;
        // A backdrop that closes on a press of ITSELF is a mouse convenience;
        // whether Escape also closes it is checked in the browser.
        const backdrop = /event\.target === event\.currentTarget|e\.target === e\.currentTarget/.test(tag);
        nonButtonHandlers.push({
          file: rel,
          line,
          tag: name,
          role,
          tabIndex: has(/\btabIndex=/),
          keyHandler: has(/\bonKey(Down|Up|Press)=/),
          handlers,
          backdrop,
          shared: isShared(rel),
        });
      }
    }
    for (const match of text.matchAll(/outline\s*:\s*(?:'none'|"none"|none\b|0\b|'0'|"0")/g)) {
      const line = lineOf(text, match.index);
      const context = text.split('\n').slice(Math.max(0, line - 6), line + 1).join('\n');
      outlineNone.push({ file: rel, line, shared: isShared(rel), context: context.slice(-400) });
    }
  }
  return { nonButtonHandlers, pointerOnlyButtons, dragSources, outlineNone };
};

/* ------------------------------------------------------------------------ */
/* In-page helpers                                                           */
/* ------------------------------------------------------------------------ */

const PAGE_HELPERS = () => {
  if (window.__kb) return;
  let counter = 0;
  const style = document.createElement('style');
  // Deterministic pixels: no blinking caret, no hover/focus transitions half way.
  style.textContent = '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }';
  document.head.appendChild(style);

  const kbId = (el) => {
    if (!el.dataset.kbId) { counter += 1; el.dataset.kbId = `k${counter}`; }
    return el.dataset.kbId;
  };
  const reactProps = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
    return key ? el[key] : null;
  };
  const reactFiber = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    return key ? el[key] : null;
  };
  const owners = (el) => {
    const names = [];
    let fiber = reactFiber(el);
    while (fiber && names.length < 4) {
      const type = fiber.type;
      if (typeof type === 'function' || (type && typeof type === 'object')) {
        const name = type.displayName || type.name || type.render?.name || null;
        if (name && !names.includes(name) && !/^(Fragment|Suspense|Provider|Consumer|Context|Lazy|Memo|ForwardRef)$/.test(name)) names.push(name);
      }
      fiber = fiber.return;
    }
    return names;
  };
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'borderTopWidth', 'backgroundColor', 'color', 'textDecorationLine', 'filter'];
  const snapStyle = (el) => {
    if (!el) return null;
    const pick = (cs) => Object.fromEntries(PROPS.map((prop) => [prop, cs[prop]]));
    const out = { self: pick(getComputedStyle(el)), before: pick(getComputedStyle(el, '::before')), after: pick(getComputedStyle(el, '::after')) };
    const p1 = el.parentElement;
    const p2 = p1?.parentElement;
    out.parent = p1 ? pick(getComputedStyle(p1)) : null;
    out.grandparent = p2 ? pick(getComputedStyle(p2)) : null;
    return out;
  };
  const describe = (el) => {
    if (!el || el === document.body || el === document.documentElement) return { body: true };
    const rect = el.getBoundingClientRect();
    const props = reactProps(el) || {};
    const handlers = Object.keys(props).filter((k) => /^on[A-Z]/.test(k));
    return {
      id: kbId(el),
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      roleAttr: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaHasPopup: el.getAttribute('aria-haspopup'),
      ariaPressed: el.getAttribute('aria-pressed'),
      className: String(el.className?.baseVal ?? el.className ?? '').slice(0, 120),
      text: text(el),
      sentinel: el.dataset.kbSentinel || null,
      inTool: Boolean(el.closest('[data-kb-root]')),
      inDialog: Boolean(el.closest('[role="dialog"], [aria-modal="true"], dialog')),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      onScreen: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && rect.width > 0 && rect.height > 0,
      visible: visible(el),
      focusVisible: el.matches(':focus-visible'),
      obscured: obscured(el),
      handlers,
      owners: owners(el),
      scrollY: Math.round(scrollY),
    };
  };
  const active = () => document.activeElement;

  // Is the element under something else? Five sample points (centre and four
  // inset corners) inside the viewport; a point counts as covered when the
  // topmost element there is neither the element, inside it, nor an ancestor
  // of it. WCAG 2.4.11: a focused control hidden under a sticky bar is not
  // visibly focused, whatever its outline says.
  const obscured = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const inset = Math.min(6, r.width / 4, r.height / 4);
    // An SVG node is usually round: its bounding-box corners show whatever is
    // drawn behind it (RelationMapping's domain oval), which is not covering it.
    const svgNode = el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg';
    const points = (svgNode
      ? [[r.left + r.width / 2, r.top + r.height / 2]]
      : [[r.left + r.width / 2, r.top + r.height / 2], [r.left + inset, r.top + inset], [r.right - inset, r.top + inset], [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset]])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    if (!points.length) return { covered: 0, sampled: 0, by: null };
    let covered = 0;
    let by = null;
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      covered += 1;
      if (!by) by = `${hit.tagName.toLowerCase()}.${String(hit.className?.baseVal ?? hit.className ?? '').split(' ').slice(0, 2).join('.')}${hit.closest('[class*="action-bar"], [class*="work-bar"]') ? ' (in action/work bar)' : ''}`.slice(0, 90);
    }
    return { covered, sampled: points.length, by };
  };

  // Every rendered element with a pointer/click/drag handler, and whether a
  // keyboard user can reach it (tab stop) and trigger it (Enter/Space).
  const pointerAudit = () => {
    const root = document.querySelector('[data-kb-root]') || document.body;
    const all = [root, ...root.querySelectorAll('*')];
    const out = [];
    for (const el of all) {
      const props = reactProps(el);
      if (!props) continue;
      const pointer = ['onClick', 'onPointerDown', 'onMouseDown', 'onPointerUp', 'onMouseUp', 'onDoubleClick', 'onTouchStart', 'onDragStart'].filter((k) => typeof props[k] === 'function');
      if (!pointer.length) continue;
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      // Disabled controls are out of the tab order for everybody; that is not
      // a keyboard gap (whether they BECOME reachable is the primary probe's job).
      if (el.disabled || el.closest('fieldset[disabled]')) continue;
      const native = (tag === 'button' || tag === 'select' || tag === 'textarea' || (tag === 'a' && el.hasAttribute('href')) || (tag === 'input' && el.type !== 'hidden') || tag === 'summary') && !el.disabled;
      const label = tag === 'label' || Boolean(el.closest('label'));
      const tabStop = native || (el.tabIndex >= 0 && el.hasAttribute('tabindex'));
      const keyHandler = typeof props.onKeyDown === 'function' || typeof props.onKeyUp === 'function' || typeof props.onKeyPress === 'function';
      // A native button turns Enter/Space into click, so only onClick is
      // reachable that way; a pointer-only handler on a button is not.
      const activatable = keyHandler || ((tag === 'button' || tag === 'summary' || (tag === 'input' && /^(checkbox|radio|button|submit)$/.test(el.type))) && typeof props.onClick === 'function') || (tag === 'a' && typeof props.onClick === 'function');
      const focusableDescendant = [...el.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), math-field')].some((child) => child !== el && visible(child));
      const ancestorKeyRoute = (() => {
        let node = el.parentElement;
        while (node && node !== document.body) {
          const p = reactProps(node);
          if (p && (typeof p.onKeyDown === 'function') && node.tabIndex >= 0 && node.hasAttribute('tabindex')) return true;
          node = node.parentElement;
        }
        return false;
      })();
      let verdict = 'ok';
      if (!tabStop && !label) {
        if (focusableDescendant) verdict = 'wrapper';
        else if (ancestorKeyRoute) verdict = 'ok-via-focusable-ancestor';
        else if (el.getAttribute('role') === 'presentation' || el.getAttribute('aria-hidden') === 'true') verdict = 'presentational';
        // CoordinatePlane attaches its pointer handlers to read-only planes
        // too; each returns at once when the plane is not interactive.
        else if (el.getAttribute('role') === 'img' && owners(el)[0] === 'CoordinatePlane') verdict = 'noop-handler-readonly-plane';
        else verdict = 'not-reachable';
      } else if (tabStop && !activatable && !label && !(tag === 'input' || tag === 'select' || tag === 'textarea')) {
        verdict = 'reachable-not-activatable';
      }
      out.push({
        id: kbId(el),
        tag,
        roleAttr: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        className: String(el.className?.baseVal ?? el.className ?? '').slice(0, 100),
        text: text(el).slice(0, 60),
        pointer,
        keyHandler,
        tabStop,
        draggable: el.getAttribute('draggable') === 'true' || typeof props.onDragStart === 'function',
        pointerMove: typeof props.onPointerMove === 'function' || typeof props.onMouseMove === 'function',
        verdict,
        owners: owners(el),
      });
    }
    return out;
  };

  const dialogs = () => [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].filter(visible).map((el) => ({
    label: el.getAttribute('aria-label') || el.querySelector('h1,h2,h3')?.innerText?.slice(0, 40) || '',
    ariaModal: el.getAttribute('aria-modal'),
    nativeModal: el.tagName === 'DIALOG' && el.matches(':modal'),
    owners: owners(el),
  }));

  const openSurfaces = () => {
    const selectors = '[role="dialog"], [aria-modal="true"], dialog[open], [role="menu"], [role="listbox"], [role="tooltip"], :popover-open, .mathmaster-enlarged-figure, [data-work-view-open="true"]';
    return [...document.querySelectorAll(selectors)].filter(visible).map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute('role') || el.className?.toString?.().slice(0, 40) || ''}]`);
  };

  const feedbackText = () => [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live], .mm-feedback-success, .mm-feedback-error, [class*="feedback"], [class*="verdict"]')]
    .map((el) => (el.innerText || '').trim()).filter(Boolean).join(' | ').slice(0, 600);

  const svgMarks = () => {
    const root = document.querySelector('[data-kb-root]') || document.body;
    return root.querySelectorAll('svg circle, svg [data-point], svg path, svg line, svg polyline').length;
  };

  const byId = (id) => document.querySelector(`[data-kb-id="${id}"]`);

  // Every visible, ENABLED control in the tool named like a check/submit.
  const checkButtons = () => {
    const root = document.querySelector('[data-kb-root]') || document.body;
    return [...root.querySelectorAll('button, [role="button"], input[type="submit"]')]
      .filter((el) => visible(el) && /\b(check|submit|grade)\b/i.test(el.getAttribute('aria-label') || el.innerText || el.value || '') && !/hint|help|how to/i.test(el.innerText || ''))
      .map((el) => ({ id: kbId(el), name: (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 60), disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'), tabStop: el.tabIndex >= 0 && !el.disabled }));
  };

  window.__kb = { kbId, describe, active, snapStyle, pointerAudit, openSurfaces, dialogs, feedbackText, svgMarks, byId, visible, checkButtons };
};

/* ------------------------------------------------------------------------ */
/* Browser                                                                   */
/* ------------------------------------------------------------------------ */

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
// The container's Chromium (a symlink to the binary) when it is there;
// otherwise whatever Playwright resolves on its own.
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
try { if (statSync(executablePath).isFile()) launch.executablePath = executablePath; } catch { /* Playwright's default */ }

let browser;
try {
  browser = await chromium.launch(launch);
} catch (error) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, REPORT_NAME), `${JSON.stringify({ generatedAt: new Date().toISOString(), error: `browser launch failed: ${error.message}`, static: staticScan() }, null, 2)}\n`);
  console.log(`Browser launch failed (${error.message}); wrote static scan only.`);
  process.exit(0);
}
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const diffPage = await context.newPage();
await diffPage.setContent('<!doctype html><title>diff</title>');

const wait = (page, ms) => page.waitForTimeout(ms);

// Pixels that differ by more than a hair between two same-sized PNG clips.
const pixelDiff = async (a, b) => diffPage.evaluate(async ({ a: dataA, b: dataB }) => {
  const load = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  const [ia, ib] = await Promise.all([load(dataA), load(dataB)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { comparable: false, changed: null };
  const draw = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
  const pa = draw(ia); const pb = draw(ib);
  let changed = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 40) changed += 1;
  }
  return { comparable: true, changed, total: pa.length / 4 };
}, { a: `data:image/png;base64,${a.toString('base64')}`, b: `data:image/png;base64,${b.toString('base64')}` });

const clipFor = (rect) => {
  const pad = 8;
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const right = Math.min(VIEWPORT.width, rect.x + rect.w + pad);
  const bottom = Math.min(VIEWPORT.height, rect.y + rect.h + pad);
  if (right - x < 2 || bottom - y < 2) return null;
  // Very large elements (a whole plane): the ring is at the edge; cap the clip
  // so one screenshot stays cheap but still contains the border.
  return { x, y, width: right - x, height: bottom - y };
};

const STYLE_KEYS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'borderTopWidth', 'backgroundColor', 'color', 'textDecorationLine', 'filter'];
const styleChanges = (focused, blurred) => {
  const changes = [];
  if (!focused || !blurred) return changes;
  for (const part of ['self', 'before', 'after', 'parent', 'grandparent']) {
    if (!focused[part] || !blurred[part]) continue;
    for (const key of STYLE_KEYS) {
      if (focused[part][key] !== blurred[part][key]) changes.push(`${part}.${key}`);
    }
  }
  return changes;
};
const hasRing = (snap) => snap && snap.self.outlineStyle !== 'none' && parseFloat(snap.self.outlineWidth) >= 1;

const axFor = async (cdp) => {
  try {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.activeElement' });
    if (!result.objectId) return { role: null, name: null };
    const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
    const ax = nodes.find((entry) => !entry.ignored) || nodes[0];
    return { role: ax?.role?.value ?? null, name: ax?.name?.value ?? '' };
  } catch (error) {
    return { role: null, name: null, error: error.message };
  }
};

const openTool = async (toolId, { settle = 900, spec = null } = {}) => {
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  const specParam = spec ? `&spec=${encodeURIComponent(JSON.stringify(spec))}` : '';
  await page.goto(`${ORIGIN}/tests/browser/keyboardSweep.html?tool=${encodeURIComponent(toolId)}${specParam}${HOST === 'bare' ? '&host=bare' : ''}&run=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-kb-sentinel="end"]');
  await wait(page, settle);
  await page.evaluate(PAGE_HELPERS);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Accessibility.enable').catch(() => {});
  await cdp.send('DOM.enable').catch(() => {});
  return { page, cdp, errors };
};

const focusSentinel = async (page, which) => {
  await page.evaluate((w) => document.querySelector(`[data-kb-sentinel="${w}"]`).focus(), which);
};

/* Forward walk with focus-indicator measurement. */
const forwardWalk = async (page, cdp) => {
  await focusSentinel(page, 'start');
  const stops = [];
  const visits = new Map();
  let reachedEnd = false;
  let trap = null;
  let lastId = null;
  let sameCount = 0;
  for (let i = 0; i < MAX_STOPS; i += 1) {
    await page.keyboard.press('Tab');
    await wait(page, 70);
    const info = await page.evaluate(() => window.__kb.describe(window.__kb.active()));
    if (info.body) {
      stops.push({ index: i, body: true });
      trap = trap || { kind: 'focus-lost-to-body', afterId: lastId };
      // Tab from <body> starts at the top of the document again; keep going
      // a little so a single lost focus does not hide the rest of the tool.
      if (stops.filter((s) => s.body).length > 2) break;
      continue;
    }
    if (info.sentinel === 'end') { reachedEnd = true; break; }
    if (info.sentinel === 'start') { trap = { kind: 'wrapped-to-start', afterId: lastId }; break; }
    if (info.id === lastId) {
      sameCount += 1;
      if (sameCount >= 3) { trap = { kind: 'tab-does-not-leave', id: info.id, tag: info.tag, name: info.ariaLabel || info.text }; break; }
      continue;
    }
    sameCount = 0;
    lastId = info.id;
    const count = (visits.get(info.id) || 0) + 1;
    visits.set(info.id, count);
    if (count >= 3) { trap = { kind: 'cycle', id: info.id, tag: info.tag, name: info.ariaLabel || info.text }; break; }
    if (count > 1) { stops.push({ index: i, revisit: info.id }); continue; }

    const ax = await axFor(cdp);
    // Focused vs blurred, same scroll position.
    const focusedStyle = await page.evaluate(() => window.__kb.snapStyle(window.__kb.active()));
    const clip = info.onScreen ? clipFor(info.rect) : null;
    let shotFocused = null;
    if (clip && clip.width * clip.height < 1366 * 768) shotFocused = await page.screenshot({ clip }).catch(() => null);
    const blurred = await page.evaluate((id) => {
      const el = window.__kb.byId(id);
      el.blur();
      return { style: window.__kb.snapStyle(el), scrollY: Math.round(scrollY), rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() };
    }, info.id);
    await wait(page, 40);
    let shotBlurred = null;
    if (shotFocused && blurred.scrollY === info.scrollY && blurred.rect.y === info.rect.y) shotBlurred = await page.screenshot({ clip }).catch(() => null);
    // Put focus back where Tab left it; the next Tab continues from here.
    const refocused = await page.evaluate((id) => {
      const el = window.__kb.byId(id);
      if (!el || !el.isConnected) return false;
      el.focus({ preventScroll: true });
      return document.activeElement === el || el.contains(document.activeElement);
    }, info.id);
    let diff = null;
    if (shotFocused && shotBlurred) diff = await pixelDiff(shotFocused, shotBlurred);
    const changes = styleChanges(focusedStyle, blurred.style);
    const ring = hasRing(focusedStyle) && changes.some((c) => c.startsWith('self.outline'));
    const changedPixels = diff?.comparable ? diff.changed : null;
    let indicator;
    if (ring) indicator = 'outline';
    else if (changes.some((c) => c.endsWith('boxShadow'))) indicator = 'box-shadow';
    else if (changes.length) indicator = `style:${changes.slice(0, 3).join(',')}`;
    else if (changedPixels !== null && changedPixels >= 20) indicator = 'pixels-only';
    else indicator = 'none';
    // A ring that changed style but drew nothing on screen (clipped by an
    // overflow ancestor, or zero-contrast) is not a visible indicator.
    const drawn = changedPixels === null ? null : changedPixels >= 20;
    stops.push({
      index: i,
      id: info.id,
      tag: info.tag,
      type: info.type,
      role: ax.role,
      name: ax.name,
      roleAttr: info.roleAttr,
      className: info.className,
      text: info.text.slice(0, 60),
      inTool: info.inTool,
      onScreen: info.onScreen,
      visible: info.visible,
      focusVisibleMatched: info.focusVisible,
      ariaExpanded: info.ariaExpanded,
      ariaHasPopup: info.ariaHasPopup,
      ariaPressed: info.ariaPressed,
      handlers: info.handlers,
      owners: info.owners,
      indicator,
      styleChanges: changes,
      changedPixels,
      drawn,
      obscured: info.obscured,
      // Half or more of the sample points covered: the student cannot see it.
      hiddenUnderOverlay: Boolean(info.obscured && info.obscured.sampled && info.obscured.covered / info.obscured.sampled >= 0.6),
      focusVisibleIndicator: indicator !== 'none' && drawn !== false && !(info.obscured && info.obscured.sampled && info.obscured.covered / info.obscured.sampled >= 0.6),
      refocused,
    });
    if (!refocused) {
      // The element unmounted on blur; Tab now continues from <body>.
      stops[stops.length - 1].note = 'element did not survive blur; walk continues from document start';
    }
  }
  return { stops, reachedEnd, trap };
};

const reverseWalk = async (page) => {
  await focusSentinel(page, 'end');
  const ids = [];
  let reachedStart = false;
  let trap = null;
  let lastId = null;
  let same = 0;
  const seen = new Map();
  for (let i = 0; i < MAX_STOPS; i += 1) {
    await page.keyboard.press('Shift+Tab');
    await wait(page, 50);
    const info = await page.evaluate(() => window.__kb.describe(window.__kb.active()));
    if (info.body) { trap = { kind: 'focus-lost-to-body', afterId: lastId }; break; }
    if (info.sentinel === 'start') { reachedStart = true; break; }
    if (info.sentinel === 'end') { trap = { kind: 'wrapped-to-end', afterId: lastId }; break; }
    if (info.id === lastId) { same += 1; if (same >= 3) { trap = { kind: 'shift-tab-does-not-leave', id: info.id, tag: info.tag }; break; } continue; }
    same = 0;
    lastId = info.id;
    const n = (seen.get(info.id) || 0) + 1;
    seen.set(info.id, n);
    if (n >= 3) { trap = { kind: 'cycle', id: info.id }; break; }
    if (n === 1) ids.push(info.id);
  }
  return { ids, reachedStart, trap };
};

const POPUP_NAME = /work view|enlarge|expand|full ?screen|scratchpad|calculator|hint|help|menu|more|options|about this tool|how to do this|show|open|reset question/i;

const popupProbe = async (page, stops) => {
  const results = [];
  const candidates = stops.filter((s) => s.id && s.inTool && (s.ariaExpanded !== null || s.ariaHasPopup || (POPUP_NAME.test(`${s.name} ${s.text}`) && (s.tag === 'button' || s.role === 'button'))));
  let stale = false;
  for (const original of candidates.slice(0, 14)) {
    const stop = { ...original };
    if (stale) {
      // Fresh copy: reach the same stop the way a student would, by Tab.
      await focusSentinel(page, 'start');
      for (let i = 0; i <= stop.index; i += 1) { await page.keyboard.press('Tab'); await wait(page, 25); }
      const here = await page.evaluate(() => window.__kb.describe(window.__kb.active()));
      stop.id = here.id;
    }
    const present = await page.evaluate((id) => Boolean(id && window.__kb.byId(id)), stop.id);
    if (!present) { results.push({ id: stop.id, name: stop.name, skipped: 'gone' }); continue; }
    // Mark what is already floating (position fixed) so a panel this press
    // opens can be told apart from one that was there before.
    const before = await page.evaluate((id) => {
      document.querySelectorAll('[data-kb-fixed]').forEach((el) => el.removeAttribute('data-kb-fixed'));
      document.querySelectorAll('body *').forEach((el) => { if (getComputedStyle(el).position === 'fixed') el.setAttribute('data-kb-fixed', '1'); });
      return { surfaces: window.__kb.openSurfaces(), expanded: window.__kb.byId(id).getAttribute('aria-expanded') };
    }, stop.id);
    await page.evaluate((id) => window.__kb.byId(id).focus(), stop.id);
    await page.keyboard.press('Enter');
    await wait(page, 450);
    const opened = await page.evaluate((id) => {
      const el = window.__kb.byId(id);
      const act = window.__kb.active();
      return {
        surfaces: window.__kb.openSurfaces(),
        expanded: el ? el.getAttribute('aria-expanded') : 'gone',
        activeInDialog: Boolean(act && act.closest && act.closest('[role="dialog"], [aria-modal="true"], dialog')),
        active: window.__kb.describe(act),
      };
    }, stop.id);
    const newSurfaces = opened.surfaces.filter((s) => !before.surfaces.includes(s));
    const expandedNow = before.expanded === 'false' && opened.expanded === 'true';
    const didOpen = newSurfaces.length > 0 || expandedNow;
    const dialogInfo = newSurfaces.some((s) => /dialog/.test(s)) ? await page.evaluate(() => window.__kb.dialogs()) : [];
    // A plain disclosure (aria-expanded, nothing floating) is not expected to
    // close on Escape; a dialog or a floating panel is.
    const floating = expandedNow && !newSurfaces.length ? await page.evaluate(() => [...document.querySelectorAll('body *')]
      .some((el) => !el.hasAttribute('data-kb-fixed') && getComputedStyle(el).position === 'fixed' && window.__kb.visible(el))) : false;
    const kind = newSurfaces.some((s) => /dialog/.test(s)) ? 'dialog' : newSurfaces.length ? 'popover' : floating ? 'floating-panel' : 'disclosure';
    const entry = { id: stop.id, name: stop.name || stop.text, tag: stop.tag, opened: didOpen, kind, newSurfaces, dialogInfo, expandedNow, focusMovedIntoDialog: opened.activeInDialog };
    if (!didOpen) { results.push(entry); continue; }
    let dialogTabbing = null;
    if (newSurfaces.some((s) => /dialog/.test(s))) {
      // Inside a dialog: is there a close control reachable by Tab, and does
      // Tab stay inside (expected for a modal) or leak out?
      const names = [];
      let leaked = false;
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        await wait(page, 30);
        const d = await page.evaluate(() => { const a = window.__kb.active(); return { inDialog: Boolean(a?.closest?.('[role="dialog"], [aria-modal="true"], dialog')), label: (a?.getAttribute?.('aria-label') || a?.innerText || '').trim().slice(0, 40), body: a === document.body }; });
        if (!d.inDialog) leaked = true;
        names.push(d.label);
      }
      dialogTabbing = { leaked, closeReachable: names.some((n) => /close|done|exit|back|×|✕/i.test(n)), stops: [...new Set(names)].slice(0, 20) };
    }
    await page.keyboard.press('Escape');
    await wait(page, 400);
    const after = await page.evaluate((id) => {
      const el = window.__kb.byId(id);
      const act = window.__kb.active();
      return { surfaces: window.__kb.openSurfaces(), expanded: el ? el.getAttribute('aria-expanded') : 'gone', focusOnTrigger: Boolean(el && (act === el || el.contains(act))), activeBody: act === document.body, activeAfter: (() => { const d = window.__kb.describe(act); return d.body ? "body" : `${d.tag} ${d.ariaLabel || d.text}`.slice(0, 60); })() };
    }, stop.id);
    const closedByEscape = newSurfaces.every((s) => !after.surfaces.includes(s)) && !(expandedNow && after.expanded === 'true');
    Object.assign(entry, { dialogTabbing, closedByEscape, escapeExpected: kind !== 'disclosure', focusReturnedToTrigger: after.focusOnTrigger, focusDroppedToBody: after.activeBody, focusAfterEscape: after.activeAfter });
    if (!closedByEscape) {
      // Can it be closed with the keyboard at all? Look for a Close control in
      // what opened, press it with Enter; otherwise re-press the trigger.
      const closer = await page.evaluate(() => {
        const scope = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].filter(window.__kb.visible).pop();
        if (!scope) return null;
        const btn = [...scope.querySelectorAll('button')].find((b) => /close|done|save & close|exit|✕|×/i.test(b.getAttribute('aria-label') || b.innerText || ''));
        return btn ? window.__kb.kbId(btn) : null;
      });
      if (closer) {
        await page.evaluate((id) => window.__kb.byId(id).focus(), closer);
        await page.keyboard.press('Enter');
        await wait(page, 400);
        entry.closedByKeyboardControl = await page.evaluate((s) => s.every((x) => !window.__kb.openSurfaces().includes(x)), newSurfaces);
      } else if (expandedNow) {
        await page.evaluate((id) => window.__kb.byId(id)?.focus(), stop.id);
        await page.keyboard.press('Enter');
        await wait(page, 300);
        entry.closedByKeyboardControl = await page.evaluate((id) => window.__kb.byId(id)?.getAttribute('aria-expanded') !== 'true', stop.id);
      } else {
        entry.closedByKeyboardControl = false;
      }
      if (!entry.closedByKeyboardControl) {
        // Leave the page as it was for the next probe.
        await page.reload({ waitUntil: 'networkidle' });
        await wait(page, 900);
        await page.evaluate(PAGE_HELPERS);
        entry.note = 'page reloaded to close it; later probes in this tool ran on a fresh copy';
        stale = true;
      }
    }
    results.push(entry);
  }
  return results;
};

/* Does focus stay where the student put it in the first seconds after load?
 * Tab once from the start sentinel, then watch for three seconds. Focus that
 * drops to <body> on its own sends the next Tab back to the top of the page. */
const lateFocusProbe = async (page) => {
  await focusSentinel(page, 'start');
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => { const d = window.__kb.describe(window.__kb.active()); return d.body ? 'body' : `${d.tag} ${d.ariaLabel || d.text}`.slice(0, 60); });
  for (let i = 0; i < 15; i += 1) {
    await wait(page, 200);
    const now = await page.evaluate(() => document.activeElement === document.body || !document.activeElement);
    if (now) return { focused: first, droppedToBodyAfterMs: (i + 1) * 200 };
  }
  return { focused: first, droppedToBodyAfterMs: null };
};

/* Answer the tool with keys only, then press every Check/Submit with Enter.
 *
 * Up to three passes: a staged tool unlocks its next step only after a Check,
 * so each pass fills whatever is newly reachable and then presses the checks
 * it found. Boxes already typed into and planes already plotted on are left
 * alone on later passes. */
const CHECK_NAME = /\b(check|submit|grade)\b/i;
const primaryProbe = async (page, cdp) => {
  const log = [];
  const checkResults = [];
  const typed = new Set();
  const plotted = new Set();
  const pressedGroups = new Set();
  const pressedChecks = new Map();
  let reachedEnd = false;
  const marksBefore = await page.evaluate(() => window.__kb.svgMarks());
  for (let pass = 0; pass < 3; pass += 1) {
    await focusSentinel(page, 'start');
    const checks = [];
    let lastId = null;
    let same = 0;
    const visits = new Map();
    let changedSomething = false;
    // Only the boxes that existed when this pass began are typed into. A
    // calculator-style list adds a blank row whenever the last one is filled;
    // typing into every row it grows would walk forever (a probe artefact, not
    // a trap — a student leaves the blank row and Tabs on).
    const existing = new Set(await page.evaluate(() => [...document.querySelectorAll('[data-kb-root] :is(input, textarea, select, math-field, [contenteditable="true"])')].map((el) => window.__kb.kbId(el))));
    for (let i = 0; i < MAX_STOPS; i += 1) {
      await page.keyboard.press('Tab');
      await wait(page, 50);
      const info = await page.evaluate(() => window.__kb.describe(window.__kb.active()));
      if (info.body || info.sentinel === 'start') break;
      if (info.sentinel === 'end') { reachedEnd = true; break; }
      if (info.id === lastId) { same += 1; if (same >= 3) break; continue; }
      same = 0; lastId = info.id;
      const n = (visits.get(info.id) || 0) + 1; visits.set(info.id, n);
      if (n > 1) { if (n >= 3) break; continue; }
      if (!info.inTool || info.inDialog) continue;
      const ax = await axFor(cdp);
      const name = `${ax.name || ''} ${info.text}`;
      const role = ax.role;
      const tag = info.tag;
      const textEntry = tag === 'textarea' || tag === 'math-field' || (tag === 'input' && /^(text|number|search|tel|)$/.test(info.type || '')) || role === 'textbox' || role === 'math' || role === 'spinbutton';
      if (textEntry) {
        if (typed.has(info.id) || !existing.has(info.id)) continue;
        typed.add(info.id);
        await page.keyboard.type('2');
        await wait(page, 50);
        changedSomething = true;
        log.push({ pass, id: info.id, did: 'typed 2', role, name: ax.name });
        continue;
      }
      if (tag === 'select' || role === 'combobox') {
        if (typed.has(info.id)) continue;
        typed.add(info.id);
        await page.keyboard.press('ArrowDown');
        await wait(page, 60);
        changedSomething = true;
        log.push({ pass, id: info.id, did: 'ArrowDown', role, name: ax.name });
        continue;
      }
      if (role === 'radio' || role === 'slider' || (tag === 'input' && info.type === 'range')) {
        if (typed.has(info.id)) continue;
        typed.add(info.id);
        await page.keyboard.press(role === 'radio' ? 'Space' : 'ArrowRight');
        await wait(page, 60);
        changedSomething = true;
        log.push({ pass, id: info.id, did: role === 'radio' ? 'Space' : 'ArrowRight', role, name: ax.name });
        continue;
      }
      if (role === 'application' || info.roleAttr === 'application') {
        if (plotted.has(info.id)) continue;
        plotted.add(info.id);
        // Plot one point at a time (arrows to aim, Enter to place) until some
        // Check becomes enabled — a tool that wants two points restarts the
        // construction on a third.
        let placed = 0;
        for (let k = 0; k < 4; k += 1) {
          if (k > 0) for (const key of ['ArrowRight', 'ArrowRight', 'ArrowUp']) { await page.keyboard.press(key); await wait(page, 30); }
          await page.keyboard.press('Enter');
          await wait(page, 120);
          placed += 1;
          const ready = await page.evaluate(() => window.__kb.checkButtons().some((c) => !c.disabled));
          if (ready) break;
        }
        changedSomething = true;
        log.push({ pass, id: info.id, did: `plotted ${placed} point(s) with arrows+Enter`, role, name: ax.name });
        continue;
      }
      if (CHECK_NAME.test(name) && !/hint|help|how to/i.test(name)) {
        checks.push({ id: info.id, name: (ax.name || info.text).slice(0, 60), role });
        continue;
      }
      // One choice per group of toggle/choice buttons, so a multiple-choice
      // step is answered without un-answering it.
      const choiceLike = info.ariaPressed !== null || role === 'option' || role === 'checkbox' || role === 'switch' || role === 'radio' || role === 'menuitemradio';
      if (choiceLike) {
        const group = await page.evaluate((id) => { const el = window.__kb.byId(id); return el?.parentElement ? window.__kb.kbId(el.parentElement) : id; }, info.id);
        if (!pressedGroups.has(group) && info.ariaPressed !== 'true') {
          pressedGroups.add(group);
          await page.keyboard.press('Space');
          await wait(page, 120);
          changedSomething = true;
          log.push({ pass, id: info.id, did: 'Space on choice', role, name: ax.name });
        }
      }
    }
    // Every enabled Check in the tool, whether or not the walk met it: one the
    // walk did NOT meet but which is enabled and visible is a reachability gap.
    const inDom = await page.evaluate(() => window.__kb.checkButtons());
    const walked = new Set(checks.map((c) => c.id));
    for (const c of inDom) {
      if (!c.disabled && !walked.has(c.id)) checkResults.push({ pass, id: c.id, name: c.name, result: 'enabled-but-not-reached-by-Tab' });
    }
    let pressedAny = false;
    for (const check of checks.slice(0, 4)) {
      const key = `${check.id}`;
      if ((pressedChecks.get(key) || 0) >= 2) continue;
      const state = await page.evaluate((id) => {
        const el = window.__kb.byId(id);
        return { present: Boolean(el), disabled: Boolean(el?.disabled || el?.getAttribute('aria-disabled') === 'true'), feedback: window.__kb.feedbackText(), grades: window.__KB_GRADES__.length, body: document.body.innerText };
      }, check.id);
      if (!state.present) continue;
      pressedChecks.set(key, (pressedChecks.get(key) || 0) + 1);
      await page.evaluate((id) => window.__kb.byId(id).focus(), check.id);
      await page.keyboard.press('Enter');
      await wait(page, 900);
      pressedAny = true;
      // Where focus is once the tool has answered: a keyboard student who
      // pressed Check and is now on <body> has to start again from the top.
      const after = await page.evaluate(() => ({ feedback: window.__kb.feedbackText(), grades: window.__KB_GRADES__.length, last: window.__KB_GRADES__.slice(-1)[0] || null, body: document.body.innerText, focusOnBody: document.activeElement === document.body || !document.activeElement, focusNow: (() => { const d = window.__kb.describe(window.__kb.active()); return d.body ? 'body' : `${d.tag} ${d.ariaLabel || d.text}`.slice(0, 60); })() }));
      let result;
      if (after.grades > state.grades) result = 'graded';
      else if (after.feedback !== state.feedback) result = 'feedback-changed';
      else if (after.body !== state.body) result = 'page-changed';
      else if (state.disabled) result = 'disabled';
      else result = 'no-response';
      checkResults.push({ pass, ...check, disabledBefore: state.disabled, result, feedback: after.feedback.slice(0, 200), lastGrade: after.last, focusAfter: after.focusNow, focusLostToBody: after.focusOnBody });
    }
    if (!pressedAny && !changedSomething) break;
  }
  const marksAfter = await page.evaluate(() => window.__kb.svgMarks());
  const remaining = await page.evaluate(() => window.__kb.checkButtons());
  return { reachedEnd, actions: log, checks: checkResults, checkButtonsAtEnd: remaining, plotMarksBefore: marksBefore, plotMarksAfter: marksAfter, gradesTotal: await page.evaluate(() => window.__KB_GRADES__.length), grades: await page.evaluate(() => window.__KB_GRADES__) };
};

/* ------------------------------------------------------------------------ */
/* Run                                                                       */
/* ------------------------------------------------------------------------ */

const idPage = await context.newPage();
await idPage.goto(`${ORIGIN}/tests/browser/keyboardSweep.html`, { waitUntil: 'networkidle', timeout: 90000 });
const allIds = await idPage.evaluate(() => window.__TOOL_IDS__ || []);
await idPage.close();
/*
 * MORE THAN ONE MODE PER TOOL, WHERE THE MODES ARE DIFFERENT INTERFACES.
 *
 * SAMPLE_SPECS gives one question per tool. Systems Workspace in particular is
 * five different workspaces behind one id (inequality builder, algebraic
 * substitution board, augmented matrix, the 3D three-plane view), and
 * Transformations Lab's parameter-matching mode has no plane to plot on at all.
 * These scenes come from the existing browser fixtures
 * (systemsWorkspaceStudioMain.jsx, workViewMatrix.mjs) and are merged over the
 * tool's sample question.
 */
const EXTRA_SCENES = [
  { toolId: 'systemsWorkspace', variant: 'inequalities-build', spec: { mode: 'inequalities', prompt: 'Graph the system y ≥ x + 1 and y < −0.5x + 6. Then classify the solution region.', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }], studentBuild: { boundary: true, lineStyle: true, shading: true }, reasoning: { classifyRegion: true }, graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 } } },
  { toolId: 'systemsWorkspace', variant: 'algebraic', spec: { mode: undefined, prompt: 'Solve the system algebraically.', studentActions: ['solveSystem'], equations: ['2x + y = 7', 'x - y = -1'], variables: ['x', 'y'], requireVerification: true } },
  { toolId: 'systemsWorkspace', variant: 'matrix', spec: { mode: 'matrix', prompt: 'Solve the system represented by the augmented matrix.', matrix: { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: -1 } } },
  { toolId: 'systemsWorkspace', variant: 'spatial', spec: { mode: 'spatial', prompt: 'Explore the three planes, then classify the system.', equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'], variables: ['x', 'y', 'z'] } },
  { toolId: 'transformationsLab', variant: 'match', spec: { mode: 'match', prompt: 'Change a, h and k until your graph sits on the dashed target.', family: 'quadratic', target: { a: 2, h: -1, k: 3 }, initial: { a: 1, h: 0, k: 0 }, graphBounds: { xMin: -7, xMax: 7, yMin: -7, yMax: 9 } } },
  // The relation's own coordinate plot (RelationCoordinatePlot), which typed
  // entry only backs up when the author sets plotEntryMode.
  { toolId: 'relationMapping', variant: 'plot', spec: { pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }], ask: ['plot', 'domain', 'range'] } },
  { toolId: 'sequenceExplorer', variant: 'fullBridge', spec: { mode: 'fullBridge', prompt: 'Complete the table, plot the terms, and write both sequence rules.', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, displayCount: 5, targetN: 8, studentActions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence', 'writeExplicit', 'writeRecursive', 'findSequenceTerm'] } },
];
const EXTRAS_ONLY = process.argv.includes('--extras-only');
const NO_EXTRAS = process.argv.includes('--no-extras');
const scenes = [
  ...(EXTRAS_ONLY ? [] : allIds.map((toolId) => ({ toolId, variant: 'sample', spec: null }))),
  ...(NO_EXTRAS ? [] : EXTRA_SCENES),
].filter((scene) => !ONLY || ONLY === scene.toolId || ONLY === `${scene.toolId}:${scene.variant}`);
const toolIds = [...new Set(scenes.map((scene) => scene.toolId))];

const tools = [];
for (const scene of scenes) {
  const { toolId, variant, spec } = scene;
  const sceneKey = variant === 'sample' ? toolId : `${toolId}:${variant}`;
  const started = Date.now();
  const entry = { toolId, variant, sceneKey, spec };
  try {
    const first = await openTool(toolId, { spec });
    entry.pageErrors = first.errors;
    entry.pointerAudit = await first.page.evaluate(() => window.__kb.pointerAudit());
    entry.forward = await forwardWalk(first.page, first.cdp);
    entry.reverse = await reverseWalk(first.page);
    entry.popups = await popupProbe(first.page, entry.forward.stops);
    await first.page.close();

    const fresh = await openTool(toolId, { settle: 150, spec });
    entry.lateFocus = await lateFocusProbe(fresh.page);
    entry.pageErrors.push(...fresh.errors);
    await fresh.page.close();

    const second = await openTool(toolId, { spec });
    entry.primary = await primaryProbe(second.page, second.cdp);
    entry.pageErrors.push(...second.errors);
    await second.page.close();
  } catch (error) {
    entry.error = String(error?.stack || error).slice(0, 800);
  }
  const stops = (entry.forward?.stops || []).filter((s) => s.id);
  const toolStops = stops.filter((s) => s.inTool);
  entry.summary = {
    tabStops: toolStops.length,
    reachedEnd: entry.forward?.reachedEnd ?? false,
    trap: entry.forward?.trap || null,
    reverseReachedStart: entry.reverse?.reachedStart ?? false,
    reverseTrap: entry.reverse?.trap || null,
    noVisibleFocus: toolStops.filter((s) => !s.focusVisibleIndicator).map((s) => ({ id: s.id, tag: s.tag, role: s.role, name: s.name, className: s.className, indicator: s.indicator, changedPixels: s.changedPixels, hiddenUnderOverlay: s.hiddenUnderOverlay, obscured: s.obscured, owners: s.owners })),
    focusHiddenUnderOverlay: toolStops.filter((s) => s.hiddenUnderOverlay).map((s) => ({ id: s.id, tag: s.tag, name: s.name, by: s.obscured?.by })),
    unnamed: toolStops.filter((s) => !s.name).map((s) => ({ id: s.id, tag: s.tag, role: s.role, className: s.className, owners: s.owners })),
    offscreenStops: toolStops.filter((s) => !s.onScreen || !s.visible).map((s) => ({ id: s.id, tag: s.tag, role: s.role, name: s.name, className: s.className })),
    pointerNotReachable: (entry.pointerAudit || []).filter((p) => p.verdict === 'not-reachable'),
    pointerNotActivatable: (entry.pointerAudit || []).filter((p) => p.verdict === 'reachable-not-activatable'),
    dragOnly: (entry.pointerAudit || []).filter((p) => (p.draggable || p.pointerMove) && !p.keyHandler && !p.tabStop),
    escapeFailures: (entry.popups || []).filter((p) => p.opened && p.escapeExpected && p.closedByEscape === false),
    keyboardUncloseable: (entry.popups || []).filter((p) => p.opened && p.closedByEscape === false && p.closedByKeyboardControl === false),
    dialogFocusLeaks: (entry.popups || []).filter((p) => p.dialogTabbing?.leaked),
    checks: entry.primary?.checks || [],
    focusDroppedAfterLoadMs: entry.lateFocus?.droppedToBodyAfterMs ?? null,
    focusLostAfterCheck: (entry.primary?.checks || []).filter((c) => c.focusLostToBody).map((c) => c.name),
    plotted: entry.primary ? entry.primary.plotMarksAfter !== entry.primary.plotMarksBefore : null,
  };
  entry.ms = Date.now() - started;
  tools.push(entry);
  // Per-tool partial file, so a long run can be read while it is going.
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `tool-${sceneKey.replace(':', '--')}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  const s = entry.summary;
  console.log(`${sceneKey.padEnd(36)} stops=${String(s.tabStops).padStart(3)} end=${s.reachedEnd ? 'y' : 'N'} rev=${s.reverseReachedStart ? 'y' : 'N'} noFocusRing=${s.noVisibleFocus.length} unnamed=${s.unnamed.length} mouseOnly=${s.pointerNotReachable.length} notActivatable=${s.pointerNotActivatable.length} escFail=${s.escapeFailures.length} hidden=${s.focusHiddenUnderOverlay.length} lateDrop=${s.focusDroppedAfterLoadMs ?? '-'} lostAfterCheck=${s.focusLostAfterCheck.length} checks=${s.checks.map((c) => c.result).join(',') || '-'} grades=${entry.primary?.gradesTotal ?? '-'}${entry.error ? ` ERROR ${entry.error.split('\n')[0]}` : ''}`);
}

await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  viewport: VIEWPORT,
  harness: 'tests/browser/keyboardSweep.html (QuestionEngine + SAMPLE_SPECS, sentinels)',
  host: HOST,
  toolsMeasured: toolIds.length,
  scenesMeasured: tools.length,
  static: staticScan(),
  tools,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote ${path.relative(repo, path.join(OUT_DIR, REPORT_NAME))}`);
process.exit(0);
