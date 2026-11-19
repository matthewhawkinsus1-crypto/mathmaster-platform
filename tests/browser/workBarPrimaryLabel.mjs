// THE WORK BAR'S PRIMARY ACTION IS NEVER CUT OFF.
//
//   npx vite --port 5199 --strictPort &      (tests/browser/emulator/vite.config.mjs also works)
//   node tests/browser/workBarPrimaryLabel.mjs
//   AUDIT_ORIGIN=http://localhost:5543 node tests/browser/workBarPrimaryLabel.mjs
//
// Release-candidate QA m8: on a 390px phone the one-row work bar read "Sub…"
// (scrollWidth 70 > clientWidth 68) and "Next quest…". Six icon tools at a fixed
// 44px (Undo, Reset, Scratchpad, Calculator, Hint, Read aloud) left the primary
// 68px at 390 and 24px at 344, and it ellipsed.
//
// In the real QuestionEngine with every tool the bar can carry
// (tests/browser/workBarPrimaryLabelMain.jsx), at 320x640, 344x882, 390x844 and
// 1366x768, for Submit, Next question and Continue to the next section:
//   LABEL     the primary's scrollWidth <= clientWidth: nothing is cut off, and
//             its visible words begin its accessible name ("Next →" is the
//             visible part of "Next question →"; the name is the whole label).
//   ONE ROW   on a phone every control sits on one row (PQ R-1), the bar does
//             not overflow sideways, and every control is 44px tall; each tool
//             is at least the 28px it comes into the row at (wider where the
//             word under its icon needs it), and no control's words run past
//             its own box (the words under Undo and Start over ran 6px into
//             the tools beside them on a 320px phone).
//   FONT      buttons do not inherit the page font: Chromium gives them the
//             platform's control font (Arial here, Liberation Sans on headless
//             Linux — the same metrics as Arial/Arimo on a Chromebook; Roboto
//             on Android, SF on iOS). The rendered face is reported, and the
//             phone checks are run again with DejaVu Sans Bold forced onto the
//             bar — wider than Arial, Roboto and SF — so the fit is not an
//             accident of a narrow headless font. In that face six tools with
//             their words inside them and "Submit" are 309px at 320px and 323px
//             at 344px, wider than the row (the one row it had there drew Start
//             over's 57px word in a 32px button): the tools keep one row, and
//             the primary takes a row of its own under them, whole.
// Exits non-zero on any failure.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const DEVICES = [
  // The narrowest phone a student may have (review of #463): nothing scrolls
  // sideways there either.
  { id: 'phone-320', phone: true, options: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { id: 'foldable-344', phone: true, options: { viewport: { width: 344, height: 882 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { id: 'phone-390', phone: true, options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { id: 'chromebook-1366', phone: false, options: { viewport: { width: 1366, height: 768 } } },
];
const STATES = [
  // Submit over its cost (student pass 3, RUN-4): two short lines, the phone's
  // shorter cost under the verb.
  { id: 'submit', selector: 'button.mathmaster-bar-submit', name: 'Submit — uses 1 of 3 tries', phoneText: 'Submit 1 of 3', desktopText: 'Submit uses 1 of 3 tries', tools: 6 },
  { id: 'next', selector: 'button.mathmaster-bar-continue', name: 'Next question →', phoneText: 'Next →', tools: 5 },
  { id: 'section', selector: 'button.mathmaster-bar-continue', name: 'Continue to Unit 2 Review →', phoneText: 'Continue →', tools: 5 },
];
const STRESS_FONT = '.portrait-action-bar button { font-family: "DejaVu Sans", sans-serif !important; }';
// The width a tool comes into the phone's row at (MathToolMobileLayout.css): a
// target WCAG 2.5.8 counts, and the floor a 320px phone may narrow it to.
const TOOL_FLOOR = 28;
const run = Date.now();

const measure = (page, selector) => page.evaluate((primarySelector) => {
  const primary = document.querySelector(primarySelector);
  if (!primary) return null;
  const bar = primary.closest('.portrait-action-bar, .mathmaster-desktop-action-bar');
  // A block child is its own line: read as a space between words.
  const visibleText = (element) => [...element.childNodes].map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const display = getComputedStyle(node).display;
    if (display === 'none') return '';
    return display === 'block' ? ` ${visibleText(node)} ` : visibleText(node);
  }).join('');
  // How far a button's drawn words (and icons drawn as text) reach past its own
  // box; a word kept for a screen reader, clipped to a pixel, is not drawn.
  const wordsPast = (button, rect) => {
    let past = 0;
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      let drawn = Boolean(text.textContent.trim());
      for (let node = text.parentElement; drawn && node && node !== button.parentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || (style.clip && style.clip !== 'auto') || (style.position === 'absolute' && box.width <= 1 && box.height <= 1)) drawn = false;
      }
      if (!drawn) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const ink of range.getClientRects()) if (ink.width) past = Math.max(past, ink.right - rect.right, rect.left - ink.left);
    }
    return past;
  };
  const controls = bar ? [...bar.querySelectorAll(':scope > button')].map((button) => {
    const rect = button.getBoundingClientRect();
    return { name: button.getAttribute('aria-label') || button.textContent.trim(), top: Math.round(rect.top), width: rect.width, height: rect.height, wordsPast: wordsPast(button, rect), tool: button.classList.contains('mathmaster-work-bar-tool') };
  }) : [];
  return {
    portrait: Boolean(bar?.classList.contains('portrait-action-bar')),
    scrollWidth: primary.scrollWidth,
    clientWidth: primary.clientWidth,
    text: visibleText(primary).replace(/\s+/g, ' ').trim(),
    ariaLabel: primary.getAttribute('aria-label'),
    barScroll: bar ? [bar.scrollWidth, bar.clientWidth] : null,
    controls,
  };
}, selector);

const renderedFont = async (page, selector) => {
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
  await session.detach();
  return fonts.map((font) => font.familyName).join(', ');
};

for (const device of DEVICES) {
  for (const state of STATES) {
    for (const stress of device.phone ? [false, true] : [false]) {
      const scene = `${device.id}/${state.id}${stress ? '/DejaVu Sans' : ''}`;
      const context = await browser.newContext(device.options);
      const page = await context.newPage();
      page.on('pageerror', (error) => failures.push(`${scene}: page error ${error.message}`));
      await page.goto(`${ORIGIN}/tests/browser/workBarPrimaryLabel.html?state=${state.id}&run=${run}-${device.id}-${state.id}-${stress}`, { waitUntil: 'networkidle' });
      const primary = page.locator(state.selector).first();
      try {
        await primary.waitFor({ timeout: 90000 });
      } catch {
        check(false, `${scene}: the primary action is in the bar`, state.selector);
        await context.close();
        continue;
      }
      if (stress) await page.addStyleTag({ content: STRESS_FONT });
      await page.waitForTimeout(400);
      const facts = await measure(page, state.selector);
      const face = await renderedFont(page, state.selector);
      console.log(`     ${scene}: primary rendered in ${face}`);
      if (stress) check(/DejaVu Sans/.test(face), `${scene}: the wider reference font is the one rendered`, face);

      check(facts.scrollWidth <= facts.clientWidth, `${scene}: the primary label is not cut off`, `scrollWidth ${facts.scrollWidth}, clientWidth ${facts.clientWidth}, "${facts.text}"`);
      check(facts.ariaLabel === state.name, `${scene}: the accessible name is the whole label`, `${facts.ariaLabel}`);
      check(await page.getByRole('button', { name: state.name, exact: true }).count() === 1, `${scene}: the button is found by its whole name`);
      const visibleWords = facts.text.replace(/ →$/, '');
      // Every word on the button is in its accessible name, in order.
      const inOrder = visibleWords.split(/\s+/).reduce((at, word) => (at < 0 ? at : state.name.indexOf(word, at) < 0 ? -1 : state.name.indexOf(word, at) + word.length), 0) >= 0;
      check(state.name.startsWith(visibleWords.split(' ')[0]) && inOrder, `${scene}: the visible words are the accessible name's`, `"${facts.text}" in "${state.name}"`);

      if (device.phone) {
        check(facts.portrait, `${scene}: the phone bar is the portrait action bar`);
        check(facts.text === state.phoneText, `${scene}: the phone shows the short label`, `"${facts.text}"`);
        const tools = facts.controls.filter((control) => control.tool);
        check(tools.length === state.tools, `${scene}: every tool is in the bar`, tools.map((tool) => tool.name).join(', '));
        const tops = new Set(facts.controls.map((control) => control.top));
        const rows = facts.controls.map((control) => `${control.name}@${control.top}`).join(' ');
        if (!stress) check(tops.size === 1, `${scene}: one row of controls (R-1)`, rows);
        else {
          // The widest face: the tools on one row, the primary beside them or on a row of its own under them.
          const toolTops = new Set(tools.map((tool) => tool.top));
          const primaryTop = facts.controls.find((control) => !control.tool)?.top;
          check(toolTops.size === 1 && primaryTop >= [...toolTops][0] && tops.size <= 2, `${scene}: the tools on one row, the primary beside them or on a row of its own under them`, rows);
        }
        check(facts.barScroll[0] <= facts.barScroll[1], `${scene}: the bar does not overflow sideways`, `${facts.barScroll[0]} <= ${facts.barScroll[1]}`);
        const short = facts.controls.filter((control) => control.height < 44);
        check(short.length === 0, `${scene}: every control is at least 44px tall`, short.map((control) => `${control.name} ${control.height}`).join(', '));
        const narrow = tools.filter((tool) => tool.width < TOOL_FLOOR);
        check(narrow.length === 0, `${scene}: every tool is at least ${TOOL_FLOOR}px wide`, tools.map((tool) => `${tool.name} ${tool.width.toFixed(1)}`).join(', '));
        const spilling = facts.controls.filter((control) => control.wordsPast > 1);
        check(spilling.length === 0, `${scene}: no control's words run past its own box`, spilling.map((control) => `${control.name} ${control.wordsPast.toFixed(1)}px`).join(', '));
      } else {
        check(!facts.portrait, `${scene}: the desktop bar is not the phone bar`);
        check(facts.text === (state.desktopText || state.name), `${scene}: the desktop shows the whole label`, `"${facts.text}"`);
      }
      await context.close();
    }
  }
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((failure) => `  - ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('\nwork bar primary label: all checks passed');
