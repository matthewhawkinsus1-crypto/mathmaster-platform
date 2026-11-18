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

// EVERYTHING UNDER EVERY OPENER ON THE PAGE, SAID WHAT IT IS (the opener sweep,
// tests/browser/workViewOpenerCover.mjs).
//
// readOpenerCover above answers "is anything under the question's own button";
// the sweep needs every opener a page draws (a question's, a Lab tool's, a
// figure's that is its own Work View: a Path stimulus, the session recap) and
// what each thing under it is, in the words of the report:
//
//   text            words (not a point's name or an axis label)
//   point           a dot, an open or closed end, a line's end marker
//   point-name      a point's name drawn beside its dot
//   axis-label      a number on an axis, an axis's name or title
//   curve-name      a curve's name (curveLabels.js keeps them clear already)
//   equation        typeset mathematics; `equation-in-list` when its row has
//                   siblings that are equations too (a system's list)
//   control         anything a student presses, types in or drags
//   badge           tries left, "Question complete", a verdict, a section's
//                   "Complete", a progress count
//
//   const readings = await readOpenerCoverage(page);
//   // [{ opener: [l, t, r, b], stacked, covered: [{ kind, what, box }], over: [{ what, by }] }]
//
// Each opener is scrolled to the middle of its scroller first, and every math
// element is drawn (MathLive draws one only once it is on screen: an equation
// not drawn yet has no box and could not be found under the button). What is
// clipped away by a scroller, including the button itself, does not count.
// `covered` is what the button is drawn over: the browser is asked what is on
// top inside the overlap. `over` is the other way round, something drawn over
// the button there (a bar pinned to the bottom of the screen, which content
// scrolls under): reported, not counted as covered.
//
// A coordinate plane is not itself "covered": the button floats over the
// corner of the figure it opens by design. Its parts are read instead: its
// points, their names, its axis numbers and names, its curves' names.
const OPENERS = 'button.mathmaster-work-view-opener';

const scrollToOpener = (page, index) => page.evaluate(({ selector, at }) => {
  const shown = (button) => {
    const box = button.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    for (let node = button; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const opener = [...document.querySelectorAll(selector)].filter(shown)[at];
  opener?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  document.querySelectorAll('math-div, math-span').forEach((element) => element.render?.());
  return Boolean(opener);
}, { selector: OPENERS, at: index });

const readOneOpener = (page, index) => page.evaluate(({ selector, at }) => {
  const POINT_PARTS = new Set(['point', 'open', 'closed', 'held', 'held-open']);
  const BADGES = [
    '.mathmaster-question-attempt-strip', '.mathmaster-closed-verdict', '[data-grade-weight]', '[data-one-try-notice]',
    '.mathmaster-section-tab small', '.mathmaster-section-complete-medallion', '.mathmaster-question-number',
    '.mathmaster-result-pill', '.graph-scenario-match-progress',
  ].join(', ');
  const CONTROLS = 'button, input:not([type="hidden"]), select, textarea, math-field, a[href], summary, [role="button"], [role="radio"], [role="checkbox"], [role="slider"], [role="switch"], [role="tab"], [role="combobox"], [role="spinbutton"], [role="option"], [role="menuitem"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  const isSvg = (node) => node instanceof SVGElement;
  const shown = (button) => {
    const box = button.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    for (let node = button; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  // Not drawn, or drawn for a screen reader only. An SVG part's clip-path is the
  // plot's edge, not a way of hiding it.
  const hidden = (element) => {
    for (let node = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'contents') continue;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
      if (!isSvg(node)) {
        const box = node.getBoundingClientRect();
        if ((style.clip && style.clip !== 'auto') || (style.clipPath && style.clipPath !== 'none') || (box.width <= 2 && box.height <= 2)) return true;
        if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY') return true;
      }
    }
    return false;
  };
  // The part of a box that can be seen: cut by every ancestor that clips.
  const seen = (element, box) => {
    const rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
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
    return rect;
  };
  const round = (rect) => [rect.left, rect.top, rect.right, rect.bottom].map(Math.round);
  const opener = [...document.querySelectorAll(selector)].filter(shown)[at];
  if (!opener) return null;
  const surface = opener.closest('.mathmaster-work-view-surface');
  const stacked = surface?.getAttribute('data-opener-stacked') === 'true';
  const o = seen(opener, opener.getBoundingClientRect());
  if (!o) return { opener: round(opener.getBoundingClientRect()), stacked, scene: opener.closest('[data-cue-scene]')?.getAttribute('data-cue-scene') || null, offScreen: true, covered: [], over: [] };
  const meets = (r) => Boolean(r) && r.left < o.right - 1 && r.right > o.left + 1 && r.top < o.bottom - 1 && r.bottom > o.top + 1;
  const containsOpener = (r) => r.left <= o.left + 1 && r.right >= o.right - 1 && r.top <= o.top + 1 && r.bottom >= o.bottom - 1;
  const found = [];
  const add = (kind, what, element, rect) => found.push({ kind, what: String(what || '').replace(/\s+/g, ' ').trim().slice(0, 40), element, rect });
  const pointPart = (element) => POINT_PARTS.has(element?.getAttribute?.('data-mm-plane-part')) || element?.hasAttribute?.('data-point-shape');
  const svgTextKind = (text) => {
    if (text.closest('[data-curve-label]')) return 'curve-name';
    if (text.closest('[data-point-label]')) return 'point-name';
    // A point's name drawn beside its dot in the same group (the static graph's points).
    if ([...(text.parentElement?.children || [])].some((sibling) => sibling !== text && pointPart(sibling))) return 'point-name';
    const words = text.textContent.trim();
    if (/^[−-]?\d+(?:[.,]\d+)?$/.test(words) || /^[xy]$/i.test(words)) return 'axis-label';
    return 'text';
  };
  // Words: HTML text by its line boxes, an SVG <text> by its box.
  const svgTexts = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (opener.contains(node) || !node.textContent.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('math-div, math-span')) continue;
    if (isSvg(parent)) {
      const text = parent.closest('text');
      if (!text || svgTexts.has(text)) continue;
      svgTexts.add(text);
      const raw = text.getBoundingClientRect();
      if (!meets(raw) || hidden(text)) continue;
      const rect = seen(text, raw);
      if (meets(rect)) add(text.closest(BADGES) ? 'badge' : svgTextKind(text), text.textContent, text, rect);
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const raws = [...range.getClientRects()].filter(meets);
    if (!raws.length || hidden(parent)) continue;
    const rect = raws.map((raw) => seen(parent, raw)).find(meets);
    if (!rect) continue;
    add(parent.closest(BADGES) ? 'badge' : parent.closest('[data-plane-axis-title]') ? 'axis-label' : 'text', node.textContent, parent, rect);
  }
  // Typeset mathematics, by its box.
  document.querySelectorAll('math-div, math-span').forEach((element) => {
    const raw = element.getBoundingClientRect();
    if (!meets(raw) || hidden(element)) return;
    const rect = seen(element, raw);
    if (!meets(rect)) return;
    const row = element.parentElement;
    const list = row?.parentElement;
    const inList = Boolean(list) && [...list.children].filter((sibling) => sibling !== row && sibling.querySelector?.('math-div, math-span')).length > 0;
    add(element.closest(BADGES) ? 'badge' : inList ? 'equation-in-list' : 'equation', element.textContent || element.getAttribute('aria-label'), element, rect);
  });
  // A plane's points, and a line's end marker.
  document.querySelectorAll('svg [data-mm-plane-part], svg [data-point-shape]').forEach((element) => {
    if (!pointPart(element)) return;
    const raw = element.getBoundingClientRect();
    if (!meets(raw) || hidden(element)) return;
    const rect = seen(element, raw);
    if (meets(rect)) add('point', element.tagName.toLowerCase() === 'polygon' ? 'a line\'s end marker' : `a ${element.getAttribute('data-mm-plane-part') || 'point'} point`, element, rect);
  });
  // Controls: not the button itself, not a plane (its parts are read above),
  // and not a card or panel the button floats over (its words are read above).
  document.querySelectorAll(CONTROLS).forEach((element) => {
    if (element === opener || element.contains(opener) || opener.contains(element)) return;
    if (element.matches('svg') && (element.hasAttribute('data-mm-plane') || /^(application|img)$/.test(element.getAttribute('role') || ''))) return;
    const raw = element.getBoundingClientRect();
    if (!meets(raw) || containsOpener(raw) || hidden(element)) return;
    const rect = seen(element, raw);
    if (meets(rect)) add(element.closest(BADGES) ? 'badge' : 'control', element.getAttribute('aria-label') || element.textContent || element.tagName, element, rect);
  });
  // Which is drawn on top inside the overlap: the button, or the other thing.
  const covered = [];
  const over = [];
  const seenKey = new Set();
  for (const hit of found) {
    const x = (Math.max(hit.rect.left, o.left) + Math.min(hit.rect.right, o.right)) / 2;
    const y = (Math.max(hit.rect.top, o.top) + Math.min(hit.rect.bottom, o.bottom)) / 2;
    const top = document.elementFromPoint(x, y);
    const key = `${hit.kind}|${hit.what}|${round(hit.rect).join(',')}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    if (!top || opener.contains(top)) covered.push({ kind: hit.kind, what: hit.what, box: round(hit.rect) });
    else if (!hit.element.contains(top) && !top.contains(hit.element)) {
      // Neither the button nor the thing itself: whatever is drawn over both.
      over.push({ what: hit.what, by: `${top.tagName.toLowerCase()}${typeof top.className === 'string' && top.className ? `.${top.className.trim().split(/\s+/)[0]}` : ''}` });
    } else over.push({ what: hit.what, by: hit.what });
  }
  return { opener: round(o), stacked, scene: opener.closest('[data-cue-scene]')?.getAttribute('data-cue-scene') || null, covered, over };
}, { selector: OPENERS, at: index });

export const readOpenerCoverage = async (page, { settle = 250 } = {}) => {
  const count = await page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((button) => {
    const box = button.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    for (let node = button; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }).length, OPENERS);
  const readings = [];
  for (let index = 0; index < count; index += 1) {
    if (!(await scrollToOpener(page, index))) continue;
    await page.waitForTimeout(settle);
    const reading = await readOneOpener(page, index);
    if (reading) readings.push(reading);
  }
  return readings;
};
