/*
 * THE TAB WALK THAT COUNTS INTO THE ACCESSIBILITY RATCHET (TT27).
 *
 *   const result = await auditKeyboardReach(page, { name: 'teacher-home', viewport: 'desktop' });
 *   result.counts    { 'teacher-home|desktop|mm-focus-not-visible': 2, ... }   (the ratchet unit)
 *   result.details   per key: impact, help, helpUrl, stable targets, examples
 *   result.summary   what the walk did: mode, stops, completed, the trap if any
 *
 * It is the keyboard sweep's method (tests/browser/keyboardSweep.mjs) on a
 * whole screen instead of one student tool, and what it finds is judged by the
 * pure half, scripts/lib/keyboardReach.mjs, which turns it into axe-shaped
 * violations. Run next to axe on the same page state, they share one baseline.
 *
 * ON A PAGE, a start and an end sentinel are put at the two ends of the
 * document and Tab runs from the first to the second. The end must be reached:
 * a stop that Tab never leaves, a loop, or focus thrown to <body> is a trap.
 *
 * IN A MODAL DIALOG (aria-modal, which the teacher's Assignment Hub and
 * Pre-Flight review are, both through src/ui/Dialog.jsx), focus must stay inside
 * and come round to where it began; Tab runs from the dialog itself until a stop
 * repeats. A stop outside it means the dialog did not hold focus. A dialog with
 * a single control (the Find palette) holds focus on it, which is where it began.
 *
 * AT EVERY STOP: Chromium's own role and name for it (the accessibility tree,
 * through CDP, as the sweep reads it); what focusing it changes on screen (its
 * computed style, its pseudo-elements and its two nearest ancestors, focused
 * against blurred, and a picture of it only when the style says nothing changed);
 * and whether another element is drawn over it. ALSO: every element with a
 * click or pointer handler (React's own props) and whether the keyboard
 * reaches it; and every control in the tab order the walk never visited.
 *
 * The walk blurs and refocuses each stop to read its style, and moves focus
 * and scroll while it runs. It leaves the page as it found it: its sentinels
 * and its style rule are removed, focus is dropped, and every scroll position
 * (the window's, a dialog's, a table's) is put back, so the next scene on the
 * page is audited from where this one was.
 *
 * NOT MEASURED: whether the tab order follows the visual order; Shift+Tab; a ring
 * that the style shows and a parent clips away (the picture is taken only when the
 * style shows no change); and what Escape or the arrow keys do in a menu or list.
 */
import { judgeKeyboardReach, focusIndicator, needsPicture } from '../../scripts/lib/keyboardReach.mjs';
import { normalizeViolations } from '../../scripts/lib/accessibilityRatchet.mjs';

// More stops than any screen has: reaching it means a loop the walk could not
// name, and is reported as a trap rather than as a long, passing, run.
export const MAX_STOPS = 400;

const SEGMENTED_INPUT = /^(date|time|datetime-local|month|week)$/;

/* ------------------------------------------------------------------------ */
/* In the page                                                               */
/* ------------------------------------------------------------------------ */

const INSTALL = ({ rootSelector }) => {
  if (window.__mmReach) window.__mmReach.dispose();
  // Tab scrolls every stop into view, so the page the walk leaves is not the one it
  // was given: the next scene on the same page would be audited from where this
  // one's walk ended (axe then reads the sidebar as out of view, and a stop's
  // place under a sticky bar depends on which way it was scrolled to). What was
  // scrolled, and where to, is kept here and put back by dispose.
  const scrolledAtStart = new Map();
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollLeft || el.scrollTop) scrolledAtStart.set(el, [el.scrollLeft, el.scrollTop]);
  }
  const windowAtStart = [scrollX, scrollY];
  const restoreScroll = () => {
    for (const el of document.querySelectorAll('*')) {
      const [left, top] = scrolledAtStart.get(el) || [0, 0];
      if (el.scrollLeft !== left || el.scrollTop !== top) el.scrollTo({ left, top, behavior: 'instant' });
    }
    scrollTo({ left: windowAtStart[0], top: windowAtStart[1], behavior: 'instant' });
  };
  const style = document.createElement('style');
  // Deterministic pixels: no blinking caret, and no ring half way through a
  // transition when the style is read at once.
  style.textContent = '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }';
  document.head.appendChild(style);

  const ids = new Map();
  const elements = [];
  const idOf = (el) => {
    if (!ids.has(el)) { ids.set(el, elements.length); elements.push(el); }
    return ids.get(el);
  };
  const reactProps = (el) => {
    const key = Object.keys(el).find((entry) => entry.startsWith('__reactProps$'));
    return key ? el[key] : null;
  };
  // Drawn, and not skipped: what a closed <details> holds keeps its box (Chromium
  // reports a size for it) yet is never painted, hit-tested or focused, which
  // `checkVisibility` knows and the box does not.
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
      && (typeof el.checkVisibility !== 'function' || el.checkVisibility());
  };
  const clean = (text, max) => String(text || '').replace(/\s+/g, ' ').trim().replace(/\d+/g, 'N').slice(0, max);

  // A selector that reads the same on every run: tag, id, two classes, one
  // attribute that names it, its words, and the nearest ancestor that has an
  // identity of its own. (scripts/lib/accessibilityRatchet.mjs stableTarget
  // then strips generated ids and numbers.)
  const identity = (el) => {
    const bits = [el.localName];
    if (el.id) bits.push(`#${el.id}`);
    const classes = [...(el.classList || [])].filter((name) => !/^(css|sc|jsx)-|\d{4,}/.test(name)).slice(0, 2);
    if (classes.length) bits.push(`.${classes.join('.')}`);
    const label = el.getAttribute('aria-label');
    if (label) bits.push(`[aria-label="${clean(label, 60)}"]`);
    else if (el.getAttribute('role')) bits.push(`[role=${el.getAttribute('role')}]`);
    else if (el.getAttribute('type')) bits.push(`[type=${el.getAttribute('type')}]`);
    return bits.join('');
  };
  const hasIdentity = (el) => Boolean(el.id || el.classList?.length || el.getAttribute('aria-label') || el.getAttribute('role') || [...el.attributes].some((attr) => attr.name.startsWith('data-')));
  const selectorOf = (el) => {
    const own = identity(el);
    const words = ['button', 'a', 'summary', 'label', 'option', 'th', 'h1', 'h2', 'h3'].includes(el.localName) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab'
      ? ` "${clean(el.innerText || el.textContent, 40)}"` : '';
    let anchor = el.parentElement;
    let depth = 0;
    while (anchor && anchor !== document.body && !hasIdentity(anchor) && depth < 8) { anchor = anchor.parentElement; depth += 1; }
    const above = anchor && anchor !== document.body && anchor !== document.documentElement ? `${identity(anchor)} > ` : '';
    return `${above}${own}${words}`;
  };

  const SNAP_KEYS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'borderTopWidth', 'backgroundColor', 'color', 'textDecorationLine', 'filter'];
  const snap = (el) => {
    const pick = (cs) => Object.fromEntries(SNAP_KEYS.map((key) => [key, cs[key]]));
    const parent = el.parentElement;
    const grand = parent?.parentElement;
    return {
      self: pick(getComputedStyle(el)),
      before: pick(getComputedStyle(el, '::before')),
      after: pick(getComputedStyle(el, '::after')),
      parent: parent ? pick(getComputedStyle(parent)) : null,
      grandparent: grand ? pick(getComputedStyle(grand)) : null,
    };
  };

  // Is the element under something else? Five sample points (the centre and
  // four inset corners) inside the viewport; a point is covered when what is
  // drawn there is neither the element, inside it, nor around it.
  const obscured = (el) => {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const inset = Math.min(6, rect.width / 4, rect.height / 4);
    const round = el instanceof SVGElement && el.localName !== 'svg';
    const points = (round
      ? [[rect.left + rect.width / 2, rect.top + rect.height / 2]]
      : [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + inset, rect.top + inset], [rect.right - inset, rect.top + inset], [rect.left + inset, rect.bottom - inset], [rect.right - inset, rect.bottom - inset]])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    if (!points.length) return { covered: 0, sampled: 0, by: null };
    let covered = 0;
    let by = null;
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      covered += 1;
      if (!by) by = identity(hit).slice(0, 90);
    }
    return { covered, sampled: points.length, by };
  };

  const describe = (el) => {
    const rect = el.getBoundingClientRect();
    return {
      id: idOf(el),
      target: selectorOf(el),
      html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 240),
      tag: el.localName,
      type: el.getAttribute('type'),
      roleAttr: el.getAttribute('role'),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      onScreen: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && rect.width > 0 && rect.height > 0,
      obscured: obscured(el),
      scrollY: Math.round(scrollY),
    };
  };

  // The root of the walk: an open modal dialog, else the page.
  const dialogs = () => [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter(visible);
  const modal = dialogs().pop() || null;
  const include = rootSelector ? document.querySelector(rootSelector) : null;
  const root = modal || include || document.body;

  const TABBABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"], math-field, audio[controls], video[controls]';
  const disabled = (el) => { try { return el.matches(':disabled'); } catch { return false; } };
  const tabbables = () => [...root.querySelectorAll(TABBABLE)]
    .filter((el) => el.tabIndex >= 0 && !disabled(el) && !el.closest('[inert]') && !el.dataset.mmReachSentinel && visible(el));

  // Handlers that do nothing but stop an event reaching the card around them
  // are not actions: no keyboard route is owed to them.
  const onlyStopsPropagation = (handler) => {
    const source = Function.prototype.toString.call(handler).replace(/\s+/g, '');
    return /^(\(\w*\)|\w+)=>(\w+\.stopPropagation\(\)|\{\w+\.stopPropagation\(\);?\})$/.test(source)
      || /^function\w*\(\w*\)\{\w+\.stopPropagation\(\);?\}$/.test(source);
  };
  const pointerAudit = () => {
    const out = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const props = reactProps(el);
      if (!props) continue;
      const pointer = ['onClick', 'onPointerDown', 'onMouseDown', 'onPointerUp', 'onMouseUp', 'onDoubleClick', 'onTouchStart', 'onDragStart']
        .filter((key) => typeof props[key] === 'function' && !onlyStopsPropagation(props[key]));
      if (!pointer.length || !visible(el)) continue;
      const tag = el.localName;
      if (el.disabled || el.closest('fieldset[disabled]')) continue;
      const native = tag === 'button' || tag === 'select' || tag === 'textarea' || (tag === 'a' && el.hasAttribute('href')) || (tag === 'input' && el.type !== 'hidden') || tag === 'summary';
      const label = tag === 'label' || Boolean(el.closest('label'));
      const tabStop = native || (el.tabIndex >= 0 && el.hasAttribute('tabindex'));
      const keyHandler = ['onKeyDown', 'onKeyUp', 'onKeyPress'].some((key) => typeof props[key] === 'function');
      // A native button turns Enter and Space into a click.
      const activatable = keyHandler
        || ((tag === 'button' || tag === 'summary' || (tag === 'input' && /^(checkbox|radio|button|submit)$/.test(el.type))) && typeof props.onClick === 'function')
        || (tag === 'a' && typeof props.onClick === 'function');
      const focusableInside = [...el.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), math-field')].some((child) => child !== el && visible(child));
      const keyRouteAbove = (() => {
        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
          const above = reactProps(node);
          if (above && typeof above.onKeyDown === 'function' && node.tabIndex >= 0 && node.hasAttribute('tabindex')) return true;
        }
        return false;
      })();
      let verdict = 'ok';
      if (!tabStop && !label) {
        if (focusableInside) verdict = 'wrapper';
        else if (keyRouteAbove) verdict = 'ok-via-focusable-ancestor';
        else if (el.getAttribute('role') === 'presentation' || el.getAttribute('aria-hidden') === 'true') verdict = 'presentational';
        else verdict = 'not-reachable';
      } else if (tabStop && !activatable && !label && !['input', 'select', 'textarea'].includes(tag)) {
        verdict = 'reachable-not-activatable';
      }
      out.push({ target: selectorOf(el), html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 240), verdict, pointer });
    }
    return out;
  };

  // The stop Tab just made: what it is, and what focusing it changed.
  const observe = async (previousId) => {
    await new Promise((resolve) => { requestAnimationFrame(() => resolve()); });
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { body: true };
    if (el.dataset?.mmReachSentinel) return { sentinel: el.dataset.mmReachSentinel };
    // Tab that stayed on the same element (the parts of a date box) is not a
    // new stop, and blurring it would send the next Tab back to its first part.
    if (ids.get(el) === previousId && previousId != null) return { same: true, id: previousId, type: el.getAttribute('type'), target: selectorOf(el) };
    const info = describe(el);
    info.insideRoot = root.contains(el);
    info.focusVisible = el.matches(':focus-visible');
    const focused = snap(el);
    el.blur();
    const blurred = snap(el);
    const rect = el.isConnected ? el.getBoundingClientRect() : null;
    info.sameBox = Boolean(rect) && Math.round(scrollY) === info.scrollY && Math.round(rect.y) === info.rect.y;
    el.focus({ preventScroll: true });
    info.refocused = document.activeElement === el;
    return { ...info, focused, blurred };
  };

  const blurById = (id) => { elements[id]?.blur(); };
  const focusById = (id) => { const el = elements[id]; if (!el?.isConnected) return false; el.focus({ preventScroll: true }); return document.activeElement === el; };
  const clipOf = (id) => {
    const rect = elements[id].getBoundingClientRect();
    const pad = 8;
    const x = Math.max(0, rect.x - pad);
    const y = Math.max(0, rect.y - pad);
    const width = Math.min(innerWidth, rect.x + rect.width + pad) - x;
    const height = Math.min(innerHeight, rect.y + rect.height + pad) - y;
    // A very large element draws its ring at its edge: capped, the picture
    // stays cheap and still holds the border.
    return width < 2 || height < 2 || width * height >= innerWidth * innerHeight ? null : { x, y, width, height };
  };

  const placeSentinel = (which) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mmReachSentinel = which;
    button.setAttribute('aria-hidden', 'true');
    button.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    if (which === 'start') document.body.insertBefore(button, document.body.firstChild);
    else document.body.appendChild(button);
  };
  const focusSentinel = (which) => document.querySelector(`[data-mm-reach-sentinel="${which}"]`)?.focus({ preventScroll: true });

  const unreached = () => {
    const visited = new Set(ids.keys());
    const radioGroupVisited = (el) => el.type === 'radio' && el.name
      && [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)].some((other) => visited.has(other));
    return tabbables().filter((el) => !visited.has(el) && !radioGroupVisited(el)).map((el) => ({ target: selectorOf(el), html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 240) }));
  };

  const dispose = () => {
    document.querySelectorAll('[data-mm-reach-sentinel]').forEach((node) => node.remove());
    style.remove();
    document.activeElement?.blur?.();
    restoreScroll();
    delete window.__mmReach;
  };

  if (modal) {
    modal.focus({ preventScroll: true });
  } else {
    placeSentinel('start');
    placeSentinel('end');
    focusSentinel('start');
  }
  window.__mmReach = {
    mode: modal ? 'modal' : 'page',
    rootTarget: root === document.body ? 'document' : selectorOf(root),
    observe, blurById, focusById, clipOf, unreached, pointerAudit, dispose, focusSentinel,
    tabbableCount: () => tabbables().length,
  };
  return { mode: window.__mmReach.mode, rootTarget: window.__mmReach.rootTarget, tabbables: tabbables().length };
};

/* ------------------------------------------------------------------------ */
/* In node                                                                   */
/* ------------------------------------------------------------------------ */

// Chromium's own role and name for the focused element.
const accessibleNameOfFocus = async (cdp) => {
  try {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.activeElement' });
    if (!result.objectId) return { role: null, name: null };
    const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
    const entry = nodes.find((candidate) => !candidate.ignored) || nodes[0];
    return { role: entry?.role?.value ?? null, name: entry?.name?.value ?? '' };
  } catch (error) {
    return { role: null, name: null, error: error.message };
  }
};

// Pixels that differ by more than a hair between two same-sized PNG clips,
// counted in a page of their own.
const countChangedPixels = async (diffPage, first, second) => diffPage.evaluate(async ({ a, b }) => {
  const load = (source) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
  const [left, right] = await Promise.all([load(a), load(b)]);
  if (left.width !== right.width || left.height !== right.height) return null;
  const draw = (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const pa = draw(left);
  const pb = draw(right);
  let changed = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 40) changed += 1;
  }
  return changed;
}, { a: `data:image/png;base64,${first.toString('base64')}`, b: `data:image/png;base64,${second.toString('base64')}` });

/**
 * Tab through the screen as it stands and count what the keyboard cannot do.
 * `include` is the same CSS selector the axe audit of this screen was given;
 * an open modal dialog is the root whatever it says.
 */
export const auditKeyboardReach = async (page, { name, viewport = 'default', include = null, maxStops = MAX_STOPS } = {}) => {
  if (!name) throw new Error('auditKeyboardReach: name (the screen id) is required');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable').catch(() => {});
  await cdp.send('DOM.enable').catch(() => {});
  let diffPage = null;
  const setup = await page.evaluate(INSTALL, { rootSelector: include });
  const modal = setup.mode === 'modal';
  const stops = [];
  const seen = new Set();
  let completed = false;
  let trap = null;
  let lastTarget = null;
  let sameCount = 0;
  let lastId = null;
  let bodyHits = 0;
  try {
    for (let index = 0; index < maxStops; index += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate((previousId) => window.__mmReach.observe(previousId), lastId);
      if (stop.body) {
        bodyHits += 1;
        trap = trap || { kind: 'focus-lost-to-body', target: lastTarget || 'document', summary: `focus went to the page body after ${lastTarget || 'the start'}` };
        // Tab from <body> goes on from where focus was, so a single lost
        // focus does not hide the rest of the screen; three in a row is a loop.
        if (bodyHits > 2) break;
        continue;
      }
      bodyHits = 0;
      if (stop.sentinel === 'end') { completed = !trap; break; }
      if (stop.sentinel === 'start') { trap = trap || { kind: 'wrapped-to-start', target: lastTarget || 'document', summary: `Tab wrapped to the start of the page after ${lastTarget || 'the start'}` }; break; }
      if (stop.same) {
        sameCount += 1;
        // A date or time box is several stops inside one element (month, day,
        // year, the picker): Tab moves between them without leaving it.
        const patience = SEGMENTED_INPUT.test(stop.type || '') ? 8 : 3;
        if (sameCount >= patience) {
          // A modal with one control in its tab order (the Find palette: one box, and the arrow keys
          // for what it lists) holds focus on it: Tab has nowhere else to go, which is the dialog
          // working. With any other control in it, a stop Tab will not leave is still a trap.
          if (modal && setup.tabbables === 1) { completed = !trap; break; }
          trap = { kind: 'tab-does-not-leave', target: stop.target, summary: 'Tab did not move focus off this control' };
          break;
        }
        continue;
      }
      sameCount = 0;
      lastId = stop.id;
      if (seen.has(stop.id)) {
        // In a dialog, coming round to a stop already seen is the walk's end.
        if (modal) { completed = !trap; } else { trap = trap || { kind: 'loop', target: stop.target, summary: 'Tab went round in a loop before reaching the end of the page' }; }
        break;
      }
      seen.add(stop.id);
      lastTarget = stop.target;

      const ax = await accessibleNameOfFocus(cdp);
      let changedPixels = null;
      if (needsPicture(stop.focused, stop.blurred) && stop.onScreen && stop.sameBox) {
        const clip = await page.evaluate((id) => window.__mmReach.clipOf(id), stop.id);
        if (clip) {
          const focusedShot = await page.screenshot({ clip }).catch(() => null);
          await page.evaluate((id) => window.__mmReach.blurById(id), stop.id);
          const blurredShot = await page.screenshot({ clip }).catch(() => null);
          await page.evaluate((id) => window.__mmReach.focusById(id), stop.id);
          if (focusedShot && blurredShot) {
            diffPage = diffPage || await page.context().newPage();
            await diffPage.setContent('<!doctype html><title>diff</title>');
            changedPixels = await countChangedPixels(diffPage, focusedShot, blurredShot);
          }
        }
      }
      stops.push({
        id: stop.id,
        target: stop.target,
        html: stop.html,
        role: ax.role,
        name: ax.name,
        indicator: focusIndicator({ focused: stop.focused, blurred: stop.blurred, changedPixels }),
        obscured: stop.obscured,
        outside: modal && stop.insideRoot === false,
      });
      if (modal && stop.insideRoot === false) {
        trap = trap || { kind: 'left-the-dialog', target: stop.target, summary: 'Tab took focus out of the open dialog' };
        break;
      }
      if (!stop.refocused) {
        // The control unmounted on blur: Tab goes on from where it was.
        lastId = null;
      }
    }
    // Nothing to Tab through is a screen that did not open, not one that passed.
    if (!stops.length) throw new Error(`the Tab walk found no stop on ${name}|${viewport} (${setup.tabbables} control(s) in the tab order)`);
    if (!completed && !trap) trap = { kind: 'too-many-stops', target: lastTarget || 'document', summary: `${maxStops} Tab stops and no end in sight` };
    const unreached = await page.evaluate(() => window.__mmReach.unreached());
    const pointerAudit = await page.evaluate(() => window.__mmReach.pointerAudit());
    const record = { mode: setup.mode, completed, trap, stops, unreached, pointerAudit };
    const violations = judgeKeyboardReach(record);
    const normalized = normalizeViolations({ screen: name, viewport, violations });
    return {
      name,
      viewport,
      ...normalized,
      summary: {
        mode: setup.mode,
        root: setup.rootTarget,
        tabbableInRoot: setup.tabbables,
        stops: stops.length,
        // Each stop as Chromium names it: the order a person Tabs through the screen.
        stopNames: stops.map((stop) => `${stop.role || '?'}: ${String(stop.name || '').slice(0, 60) || '(no name)'}`),
        unreachedTargets: unreached.map((entry) => entry.target),
        completed,
        trap,
        unreached: unreached.length,
        pointerHandlers: pointerAudit.length,
        pointerAudit: pointerAudit.filter((entry) => !['ok', 'wrapper', 'ok-via-focusable-ancestor', 'presentational'].includes(entry.verdict)).map((entry) => ({ target: entry.target, verdict: entry.verdict })),
      },
    };
  } finally {
    await page.evaluate(() => window.__mmReach?.dispose()).catch(() => {});
    if (diffPage) await diffPage.close().catch(() => {});
    await cdp.detach().catch(() => {});
  }
};
