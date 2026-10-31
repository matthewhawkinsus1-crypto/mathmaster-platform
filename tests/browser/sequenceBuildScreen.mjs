// THE "BUILD THE SEQUENCE MODEL" SCREEN: EVERY TERM'S BOX IS ON THE SCREEN.
//
//   node_modules/.bin/vite --host 127.0.0.1 --port 6020 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:6020 node tests/browser/sequenceBuildScreen.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// TL40 (finding D-52): at 1366 the sixth output box of the DOL #3 Review's
// question 13 table was cut off at its panel's right edge. The table is a row of
// one box per term; it sat in half the page whatever its width, so six terms
// (573px) were behind the edge of a 474px column and the last two boxes needed a
// sideways scroll nobody is told about. Measured here for 3 to 8 terms (the
// screen's range), under practice and under a DOL, at 1366x768: no box is behind
// the column's edge and the table needs no sideways scroll (the columns stack
// when the table is wider than half the page), and a value of five characters
// ("-12.5") fits in its box. At 390x844 a table of six boxes is wider than the
// screen, so there it scrolls — and every box must still be reachable:
// focusing one brings it fully on the screen.
//
// AX32 (finding C1-98): the plane under the table says how to plot from the
// keyboard before it has keyboard focus (a short line ending the gesture line),
// and the fuller sentence replaces that line once Tab has brought it focus.
//
// TL39 (findings E2-9, D-76): the question writes its terms as f(n), as the DOL
// does: every box and direction on the screen says f(n), the whole question is
// done and graded right (and a slip graded wrong, its feedback in f(n)), by
// mouse and by finger; an unauthored question keeps aₙ, and so does one that has
// the student type a rule.
//
// Driven only through rendered controls, in the real QuestionEngine
// (sequenceBuildScreenMain.jsx). Exits non-zero on failure.

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
let total = 0;
const check = (ok, label, detail = '') => {
  total += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const stamp = Date.now();
let pageCount = 0;
const SCREENS = [
  { name: '1366x768', viewport: { width: 1366, height: 768 }, touch: false },
  { name: '390x844', viewport: { width: 390, height: 844 }, touch: true },
];
const BOXES = 'input[aria-label^="Sequence output"]';
// ONLY=tl39 (or tl40, ax32; comma-separated) runs just those sections.
const only = (process.env.ONLY || '').split(',').map((name) => name.trim()).filter(Boolean);
const wants = (name) => !only.length || only.includes(name);

const open = async (context, label, role, extra = {}) => {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => check(false, `${label}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/sequenceBuildScreen.html?role=${role}&run=${stamp}-${(pageCount += 1)}&extra=${encodeURIComponent(JSON.stringify(extra))}`, { waitUntil: 'networkidle' });
  await page.locator(BOXES).first().waitFor();
  await page.waitForTimeout(500);
  return page;
};

// Where the table's boxes are, against the edge of the column they sit in.
const tableFit = (page) => page.evaluate((boxSelector) => {
  const inputs = [...document.querySelectorAll(boxSelector)];
  const table = inputs[0].closest('table');
  const wrapper = table.parentElement;
  const panel = wrapper.closest('.mathmaster-tool-panel');
  const wrapperRect = wrapper.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const neighbour = [...panel.parentElement.children].find((child) => child !== panel);
  const boxes = inputs.map((input) => { const rect = input.getBoundingClientRect(); return { name: input.getAttribute('aria-label').replace('Sequence output ', ''), left: rect.left, right: rect.right }; });
  return {
    boxes: inputs.length,
    scrolls: wrapper.scrollWidth > wrapper.clientWidth + 1,
    column: Math.round(wrapperRect.width),
    table: Math.round(table.getBoundingClientRect().width),
    besideTheAnalysis: neighbour ? Math.abs(neighbour.getBoundingClientRect().top - panelRect.top) < 4 : false,
    behindTheEdge: boxes.filter((box) => box.left < wrapperRect.left - 0.5 || box.right > wrapperRect.right + 0.5).map((box) => box.name),
  };
}, BOXES);

// Whether a box is wholly on the screen, and inside the column that scrolls it.
const onScreen = (page, index) => page.evaluate(([boxSelector, at]) => {
  const input = document.querySelectorAll(boxSelector)[at];
  const wrapper = input.closest('table').parentElement.getBoundingClientRect();
  const rect = input.getBoundingClientRect();
  return rect.left >= wrapper.left - 0.5 && rect.right <= wrapper.right + 0.5 && rect.left >= 0 && rect.right <= window.innerWidth;
}, [BOXES, index]);

/* ------------------------------------------- TL40: every box on the screen */

for (const screen of wants('tl40') ? SCREENS : []) {
  const context = await browser.newContext({ viewport: screen.viewport, hasTouch: screen.touch, isMobile: screen.touch });
  const desktop = !screen.touch;
  for (const role of ['practice', 'dol']) {
    for (const count of desktop ? [3, 4, 5, 6, 7, 8] : [3, 6, 8]) {
      const label = `${count} terms (${screen.name}, ${role})`;
      const page = await open(context, label, role, { displayCount: count });
      const fit = await tableFit(page);
      check(fit.boxes === count, `${label}: a box for every term`, `${fit.boxes}`);
      if (desktop) {
        check(fit.behindTheEdge.length === 0, `${label}: no box is behind the column's edge`, `table ${fit.table}px in a ${fit.column}px column${fit.behindTheEdge.length ? `, past the edge: ${fit.behindTheEdge.join(', ')}` : ''}`);
        check(!fit.scrolls, `${label}: the table needs no sideways scroll`, `table ${fit.table}px in a ${fit.column}px column`);
        // The question this item came from keeps the table beside the analysis.
        if (count === 6) check(fit.besideTheAnalysis, `${label}: the table still sits beside the analysis`);
      } else {
        // A phone's column is one row of the screen: a wide table scrolls there, and each box must still be reachable.
        const unreachable = [];
        for (let index = 0; index < count; index += 1) {
          await page.locator(BOXES).nth(index).focus();
          await page.waitForTimeout(80);
          if (!(await onScreen(page, index))) unreachable.push(`a${index + 1}`);
        }
        check(unreachable.length === 0, `${label}: every box can be brought on to the screen`, unreachable.join(', '));
      }
      // The longest value a term takes, typed, fits in its box without the text scrolling.
      const first = page.locator(BOXES).first();
      await first.fill('-12.5');
      const fits = await first.evaluate((input) => input.scrollWidth <= input.clientWidth);
      check(fits, `${label}: "-12.5" fits in its box`);
      await page.close();
    }
  }
  await context.close();
}

/* ---------- AX32: the plane names the keyboard route before it has focus */

// The plane under the table (the shared CoordinatePlane) said how to plot from
// the keyboard only once it HAD keyboard focus, so a keyboard or switch student
// read the pointer's directions ("Press the grid and slide to aim") all the way
// to it. The route now ends the gesture line before focus; the fuller sentence
// takes its place from the plane's first keyboard focus.
for (const screen of wants('ax32') ? SCREENS : []) {
  const context = await browser.newContext({ viewport: screen.viewport, hasTouch: screen.touch, isMobile: screen.touch });
  for (const role of ['practice', 'dol']) {
    const label = `the plane's directions (${screen.name}, ${role})`;
    const page = await open(context, label, role);
    const help = () => page.locator('.mathmaster-plot-help').first().innerText();
    const before = await help();
    check(/Press the grid and slide to aim/.test(before) && /From the keyboard, focus the grid and use the arrow keys and Enter\./.test(before),
      `${label}: before focus, the gesture line and the keyboard route`, before.replace(/\s+/g, ' '));
    let focused = false;
    for (let step = 0; step < 40 && !focused; step += 1) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.matches?.('svg[role="application"]') === true);
    }
    check(focused, `${label}: the plane is reached with Tab`);
    const after = await help();
    check(/The arrow keys move the\s+crosshair/.test(after) && !/From the keyboard, focus the grid/.test(after),
      `${label}: on keyboard focus the fuller sentence takes the short line's place`, after.replace(/\s+/g, ' '));
    await page.close();
  }
  await context.close();
}

/* --------------------- TL39: the question writes its terms the way the DOL does */

// DOL #3 Review's question 13 sets `notation: "f(n)"`, so the screen says f(n)
// where it said aₙ (and the prompt no longer translates). Driven as a student
// does it: every box named by its term, the table filled, the six points plotted
// by mouse click or finger tap, the pattern named, and Check — graded right, and
// the same slip graded wrong with its feedback in f(n). Where a rule is typed the
// screen stays aₙ, and an unauthored question keeps aₙ.
if (wants('tl39')) {
  const A_ANYWHERE = /aₙ|a₁|a[₀-₉]|a₍/;
  const TERMS = [-7, -3, 1, 5, 9, 13];
  // The plane's own numbers give the screen mapping (as graphKeyboardRoute.mjs),
  // fitted through all of them: a phone's plane is six pixels to a unit, and two
  // labels' rounding would plot a far term one unit off.
  const planeFit = (page) => page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]');
    const marks = [...svg.querySelectorAll('text')]
      .filter((node) => /^-?\d+$/.test(node.textContent.trim()))
      .map((node) => { const rect = node.getBoundingClientRect(); return { value: Number(node.textContent), cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 }; });
    // The x labels share a row; every other number is on the y axis.
    const rows = {};
    marks.forEach((mark) => { const at = Math.round(mark.cy); (rows[at] = rows[at] || []).push(mark); });
    const xMarks = Object.values(rows).sort((one, two) => two.length - one.length)[0];
    const yMarks = marks.filter((mark) => !xMarks.includes(mark));
    const regress = (list, key) => {
      const n = list.length;
      const sum = (pick) => list.reduce((total, mark) => total + pick(mark), 0);
      const [sx, sy, sxx, sxy] = [sum((m) => m.value), sum((m) => m[key]), sum((m) => m.value * m.value), sum((m) => m.value * m[key])];
      const scale = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      return { zero: (sy - scale * sx) / n, scale };
    };
    return { x: regress(xMarks, 'cx'), y: regress(yMarks, 'cy') };
  });
  const bodyText = (page) => page.evaluate(() => document.body.innerText);
  const names = (page) => page.locator(BOXES).evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label').replace('Sequence output ', '')));

  // A whole attempt at the question: the table (with a slip in a term when asked), the plot, the pattern; then Check.
  const attempt = async (page, screen, { slipAt = -1 } = {}) => {
    for (let index = 0; index < TERMS.length; index += 1) {
      await page.locator(BOXES).nth(index).fill(String(index === slipAt ? TERMS[index] + 1 : TERMS[index]));
    }
    // On a touch screen the number keypad comes up with the boxes and covers the
    // foot of the page, as it does for a student: "Done" puts it away.
    const done = page.getByRole('button', { name: 'Done', exact: true });
    if (await done.count() && await done.first().isVisible()) await done.first().click();
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.evaluate(() => document.querySelector('svg[role="application"]').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    for (let index = 0; index < TERMS.length; index += 1) {
      const fit = await planeFit(page);
      const [px, py] = [fit.x.zero + (index + 1) * fit.x.scale, fit.y.zero + TERMS[index] * fit.y.scale];
      if (screen.touch) await page.touchscreen.tap(px, py);
      else await page.mouse.click(px, py);
      await page.waitForTimeout(120);
    }
    await page.getByLabel('Sequence family').selectOption('arithmetic');
    await page.getByLabel('Common difference').fill('4');
    // Check by keyboard: on a phone the action bar can sit over the button.
    await page.locator('[data-mm-enter-action="submit"]').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    return page.evaluate(() => window.__mmGraded.at(-1) ?? null);
  };

  for (const screen of SCREENS) {
    const context = await browser.newContext({ viewport: screen.viewport, hasTouch: screen.touch, isMobile: screen.touch });
    for (const role of ['practice', 'dol']) {
      const label = `f(n) (${screen.name}, ${role})`;
      // What is on the screen: every box and every direction in f(n), none in aₙ.
      const page = await open(context, label, role);
      check(JSON.stringify(await names(page)) === JSON.stringify(['f(1)', 'f(2)', 'f(3)', 'f(4)', 'f(5)', 'f(6)']), `${label}: each box is named by its term, f(1) to f(6)`, JSON.stringify(await names(page)));
      const seen = await bodyText(page);
      check(/Output f\(n\)/.test(seen) && /Each sequence value f\(n\) is the output/.test(seen), `${label}: the table and its explanation say f(n)`);
      check(!A_ANYWHERE.test(seen), `${label}: and nothing on the screen says aₙ`, (A_ANYWHERE.exec(seen) || [''])[0]);
      // Doing it: right answers are graded right.
      const graded = await attempt(page, screen);
      check(graded?.isCorrect === true, `${label}: the table, the six plotted points and the pattern are graded correct`, JSON.stringify(graded?.isCorrect));
      await page.close();

      // The same attempt with a slip in the fourth term is graded wrong; where outcomes are shown, the feedback speaks f(n).
      const slipped = await open(context, `${label} (slip)`, role);
      const verdict = await attempt(slipped, screen, { slipAt: 3 });
      check(verdict?.isCorrect === false, `${label}: a slip in f(4) is graded wrong`, JSON.stringify(verdict?.isCorrect));
      if (role === 'practice') {
        const feedback = await bodyText(slipped);
        check(/Check your table: start from f\(1\)/.test(feedback) && !A_ANYWHERE.test(feedback), `${label}: and the feedback says f(1), not a₁`, (/Check your table[^.]*\./.exec(feedback) || [''])[0]);
      }
      await slipped.close();
    }
    // An unauthored question keeps aₙ; a question that has the student type a rule keeps it whatever was authored.
    const plain = await open(context, `unauthored (${screen.name})`, 'practice', { notation: null });
    check(/Output aₙ/.test(await bodyText(plain)) && JSON.stringify(await names(plain)) === JSON.stringify(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']), `unauthored (${screen.name}): the screen says aₙ, as it always has`);
    await plain.close();
    const typed = await open(context, `rule (${screen.name})`, 'practice', { studentActions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence', 'writeRecursive', 'writeExplicit'] });
    const typedText = await bodyText(typed);
    check(/Output aₙ/.test(typedText) && /aₙ =/.test(typedText) && !/f\(n\)/.test(typedText.replace(/f\(n\) = f\(n − 1\) \+ 4/g, '')),
      `rule (${screen.name}): where the student types a rule the boxes and the table stay aₙ though f(n) was authored`);
    await typed.close();
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} of ${total} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} checks passed: every term's box is on the screen of the Build the Sequence Model table, its plane names the keyboard route before it has focus, and a question that says f(n) is done and graded in f(n).`);
