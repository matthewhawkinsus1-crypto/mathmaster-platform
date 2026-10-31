// WCAG 2.2 2.5.8 TARGET SIZE (MINIMUM), as the keyboard sweep reads it.
//
// A pointer target under 24x24 CSS px passes only by the spacing exception: the
// 24px circle centred on its box meets no other target and no other undersized
// target's circle. `boxes` are what the sweep's in-page `targetBoxes()` returns,
// all measured at one scroll position: { x, y, w, h, ... } in page pixels.
//
// Read here: the spacing exception. Not read: an equivalent control elsewhere on
// the page, a target the user agent sizes, a size that is essential. A target
// listed under `failing` may still pass by one of those, so the list is what a
// reviewer looks at, not a verdict. A target inside another (an icon in its
// button) is that control, not its neighbour.
//
// Pure, so tests/platform/keyboardSweepTargetSize.test.mjs reads it in node.

export const TARGET_MIN = 24;

const gapToBox = (point, box) => Math.hypot(
  Math.max(box.x - point.x, 0, point.x - (box.x + box.w)),
  Math.max(box.y - point.y, 0, point.y - (box.y + box.h)),
);

const boxInside = (inner, outer) => (
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5
);

const undersized = (box) => Math.min(box.w, box.h) < TARGET_MIN;

export const smallTargetsOf = (boxes = []) => {
  const small = boxes.filter(undersized);
  const crowded = (box) => {
    const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    return boxes.some((other) => {
      if (other === box || boxInside(box, other) || boxInside(other, box)) return false;
      // Another target inside the 24px circle (radius 12) …
      if (gapToBox(centre, other) < TARGET_MIN / 2) return true;
      // … or another undersized target whose own circle meets this one (centres under 24 apart).
      if (!undersized(other)) return false;
      return Math.hypot(centre.x - (other.x + other.w / 2), centre.y - (other.y + other.h / 2)) < TARGET_MIN;
    });
  };
  const failing = small.filter(crowded);
  const named = ({ id, tag, roleAttr, name, className, owners, w, h }) => ({ id, tag, roleAttr, name, className, owners, w, h });
  return {
    measured: boxes.length,
    undersized: small.length,
    bySpacing: small.length - failing.length,
    // The undersized targets with no room around them: what a reviewer looks at.
    failing: failing.map(named),
    // The undersized targets the spacing exception passes: listed so the exception can be checked by eye.
    passing: small.filter((box) => !failing.includes(box)).map(named),
  };
};

/*
 * RUNS IN THE PAGE. Playwright serialises this function, so it takes nothing
 * from this module: `page.evaluate(collectTargetBoxes, { rootSelector })`.
 *
 * Every pointer target under the root, as a box in page pixels (so one scroll
 * position, one frame): the native controls and ARIA widgets a pointer can
 * press, and whatever else carries a React pointer handler. Left out, because
 * the criterion leaves them out or they are not a target at all:
 *   - disabled controls and anything in an inert subtree (no action);
 *   - links inside a sentence (the "inline" exception);
 *   - text only a screen reader gets, and a skip link waiting off screen;
 *   - an element with a pointer handler that holds a control of its own: the
 *     control is the target (a card around its buttons).
 * A checkbox or radio whose label is drawn is measured as its label, which a
 * press on the text also toggles.
 */
export const collectTargetBoxes = ({ rootSelector = 'body' } = {}) => {
  const root = document.querySelector(rootSelector) || document.body;
  const CONTROLS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, math-field, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="slider"], [role="gridcell"], [role="treeitem"], [tabindex]:not([tabindex="-1"])';
  const POINTER = ['onClick', 'onPointerDown', 'onMouseDown', 'onPointerUp', 'onMouseUp', 'onDoubleClick', 'onTouchStart', 'onDragStart'];
  const reactProps = (el) => {
    const key = Object.keys(el).find((name) => name.startsWith('__reactProps$'));
    return key ? el[key] : null;
  };
  const drawn = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  // Visually hidden on purpose: clipped to nothing, or one pixel square. A
  // wrapper that is itself 0x0 only counts when it clips what is inside it:
  // Work View's host and body are 0x0 boxes whose children are drawn anyway.
  const forScreenReadersOnly = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      const tiny = r.width <= 1 && r.height <= 1;
      const clips = node === el || style.overflowX !== 'visible' || style.overflowY !== 'visible';
      if ((style.clip && style.clip !== 'auto') || style.clipPath === 'inset(50%)' || (tiny && clips)) return true;
    }
    return false;
  };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const candidates = new Map();
  for (const el of root.querySelectorAll(CONTROLS)) candidates.set(el, 'control');
  for (const el of root.querySelectorAll('*')) {
    const props = reactProps(el);
    if (props && !candidates.has(el) && POINTER.some((key) => typeof props[key] === 'function')) candidates.set(el, 'handler');
  }
  const out = [];
  let index = 0;
  for (const [el, why] of candidates) {
    if (!drawn(el) || el.disabled || el.closest('fieldset[disabled], [inert]') || forScreenReadersOnly(el)) continue;
    if (el.matches('.mm-skip-link:not(:focus)')) continue;
    if (why === 'handler' && [...el.querySelectorAll(CONTROLS)].some((child) => drawn(child))) continue;
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
      && [...(el.parentElement?.childNodes || [])].some((node) => node !== el && node.nodeType === 3 && node.textContent.trim().length > 0);
    if (inline) continue;
    let box = el;
    if (el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type)) {
      const label = el.labels?.[0] || el.closest('label');
      if (label && drawn(label)) box = label;
    }
    const r = box.getBoundingClientRect();
    // Left of or above the page: nobody can scroll there.
    if (r.right + scrollX <= 0 || r.bottom + scrollY <= 0) continue;
    index += 1;
    out.push({
      id: `t${index}`,
      why,
      tag: el.tagName.toLowerCase(),
      roleAttr: el.getAttribute('role'),
      name: (el.getAttribute('aria-label') || textOf(el) || el.getAttribute('title') || '').slice(0, 50),
      className: String(el.className?.baseVal ?? el.className ?? '').slice(0, 80),
      owners: [],
      x: Math.round((r.x + scrollX) * 10) / 10,
      y: Math.round((r.y + scrollY) * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
    });
  }
  return out;
};
