// WHAT THE "⤢ OPEN WORK VIEW" BUTTON COVERS, READ FROM THE RENDERED PAGE (PH01).
//
// The button floats over the top-right corner of a question's work. Nothing the
// student reads or presses may be under it, and the only way to know is to ask
// the browser where the words and the controls are drawn.
//
//   const { opener, covered } = await readOpenerCover(page);
//   // opener   { left, top, right, bottom } in CSS px, or null (no button)
//   // covered  ['"Fractions"', '<math-field> "Fraction answer"', ...]
//
// What counts as covered: a piece of text, or a control (button, field, select,
// radio, a plane drawn as an svg), whose box meets the button's. What does not:
// what is clipped away by a scrolling or hiding ancestor (a staged question's
// step chips, which scroll sideways under the button's lane and are not drawn
// there), what is visually hidden (a screen-reader line, 1px or clipped), and
// anything not painted (display none, visibility hidden, opacity 0).
//
// `buttonSelector` is the opener of the work you are looking at; the default is
// the question's own, closed.
const DEFAULT_OPENER = '.mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button';

export const readOpenerCover = (page, { buttonSelector = DEFAULT_OPENER } = {}) => page.evaluate((selector) => {
  const opener = [...document.querySelectorAll(selector)].find((button) => /enlarge|work view/i.test(button.textContent || ''));
  if (!opener) return { opener: null, covered: [] };
  const o = opener.getBoundingClientRect();
  const meets = (r) => r.width > 0 && r.height > 0 && r.left < o.right - 1 && r.right > o.left + 1 && r.top < o.bottom - 1 && r.bottom > o.top + 1;

  // The part of a box that can be seen: cut by every ancestor that clips.
  const seen = (element, box) => {
    let rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'contents') continue;
      const clipX = style.overflowX !== 'visible';
      const clipY = style.overflowY !== 'visible';
      if (clipX || clipY) {
        const b = ancestor.getBoundingClientRect();
        if (clipX) { rect.left = Math.max(rect.left, b.left); rect.right = Math.min(rect.right, b.right); }
        if (clipY) { rect.top = Math.max(rect.top, b.top); rect.bottom = Math.min(rect.bottom, b.bottom); }
      }
      if (rect.right <= rect.left || rect.bottom <= rect.top) return null;
    }
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.right - rect.left, height: rect.bottom - rect.top };
  };
  // Not drawn, or drawn for a screen reader only.
  const hidden = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'contents') continue;
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
      if ((style.clip && style.clip !== 'auto') || (style.clipPath && style.clipPath !== 'none') || (box.width <= 2 && box.height <= 2)) return true;
    }
    return false;
  };

  const hits = [];
  const walker = document.createTreeWalker(opener.parentElement, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (opener.contains(node) || !node.textContent.trim()) continue;
    const parent = node.parentElement;
    if (!parent || hidden(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const shown = [...range.getClientRects()].map((rect) => seen(parent, rect)).filter(Boolean);
    if (shown.some(meets)) hits.push(`"${node.textContent.trim().slice(0, 28)}"`);
  }
  opener.parentElement.querySelectorAll('button, input, math-field, select, textarea, [role="radio"], [role="button"], svg[role="application"], svg[role="img"]').forEach((element) => {
    if (element === opener || hidden(element)) return;
    const shown = seen(element, element.getBoundingClientRect());
    if (shown && meets(shown)) hits.push(`<${element.tagName.toLowerCase()}> "${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 24)}"`);
  });
  return { opener: { left: o.left, top: o.top, right: o.right, bottom: o.bottom }, covered: [...new Set(hits)] };
}, buttonSelector);
