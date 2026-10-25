// THE GRAPH WORKSPACE TELLS A KEYBOARD STUDENT THE TRUTH, AND NAMES ITS FIELDS.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/graphKeyboardRoute.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// Selecting a point card or an end marker is announced with the routes that
// place it. The typed x / y entry is one of them only while it is on screen:
// end markers come after the curve has fixed the points, when it is gone, and
// the marker announcement used to offer it anyway. And each analysis field is
// called by its part ("Domain in interval notation"), not by its placeholder —
// the format example "[2, ∞)" — or, with none, "Math answer".
//
// And (pass 3, TOOL-1) the whole function-graph question by keyboard alone:
// points typed, Check Point Placements, "Connect my points" (focus goes there
// when the check passes), the end markers by arrow keys and Enter, Submit —
// graded correct for the right points and wrong for wrong ones, under practice
// and under a DOL. On a DOL "Connect my points" is offered only with the
// keyboard-access support, and is then recorded as that support provided;
// without it the DOL offers no Connect (the owner, 2026-10-23, C1-120).
//
// Driven only through rendered controls, in the real QuestionEngine
// (graphKeyboardRouteMain.jsx), under practice and under a DOL (whose points
// are held still by the student's own sketch rather than by a passed check).
// Names are read from Chrome's accessibility tree. Exits non-zero on failure.

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
let total = 0;
const check = (ok, label, detail = '') => {
  total += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const stamp = Date.now();
let pageCount = 0;
const open = async (q, role = 'practice', extra = '') => {
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${q} (${role}): page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/graphKeyboardRoute.html?q=${q}&role=${role}${extra}&run=${stamp}-${(pageCount += 1)}`, { waitUntil: 'networkidle' });
  await page.locator('[data-graph-keyboard-fixture]').waitFor();
  await page.waitForTimeout(700);
  return page;
};

const announcement = async (page) => (await page.locator('[role="status"][aria-live="polite"]').allInnerTexts()).join(' ').trim();
const OFFERS_TYPING = /type an exact coordinate/;
const exactEntryShown = async (page) => (await page.getByRole('button', { name: 'Place at this coordinate' }).count()) > 0
  && page.getByRole('button', { name: 'Place at this coordinate' }).isVisible();

/** What Chrome's accessibility tree calls each math field (role "math"), in page order. */
const mathFieldNames = async (page) => {
  const client = await page.context().newCDPSession(page);
  const { nodes } = await client.send('Accessibility.getFullAXTree');
  await client.detach();
  return nodes.filter((node) => node.role?.value === 'math' && !node.ignored).map((node) => node.name?.value ?? '');
};

// The grid's own axis labels give the screen mapping (as graphPointCheck.mjs).
const axisFit = (page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const marks = [...svg.querySelectorAll('text')]
    .filter((t) => /^-?\d+$/.test(t.textContent.trim()))
    .map((t) => { const r = t.getBoundingClientRect(); return { value: Number(t.textContent), cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  const line = (key, other) => {
    const rows = {};
    marks.forEach((m) => { const k = Math.round(m[other]); (rows[k] = rows[k] || []).push(m); });
    const best = Object.values(rows).sort((a, b) => b.length - a.length)[0].sort((a, b) => a.value - b.value);
    const [a, b] = [best[0], best[best.length - 1]];
    const scale = (b[key] - a[key]) / (b.value - a.value);
    return { zero: a[key] - a.value * scale, scale };
  };
  return { x: line('cx', 'cy'), y: line('cy', 'cx') };
});
const toScreen = (fit, x, y) => [fit.x.zero + x * fit.x.scale, fit.y.zero + y * fit.y.scale];
const line = (x) => 2 * x + 1;

const typePoint = async (page, card, x, y) => {
  await page.getByRole('button', { name: new RegExp(`^${card}`) }).click();
  await page.getByRole('spinbutton', { name: 'x', exact: true }).fill(String(x));
  await page.getByRole('spinbutton', { name: 'y', exact: true }).fill(String(y));
  await page.getByRole('button', { name: 'Place at this coordinate' }).click();
  await page.waitForTimeout(200);
};
const drawLine = async (page) => {
  const fit = await axisFit(page);
  const points = [];
  for (let x = -2.4; x <= 3.2 + 1e-9; x += 0.2) points.push(toScreen(fit, x, line(x)));
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...point, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(400);
};
// The legacy workspace's plane: named "Coordinate plane", its keys in its description (Q-8).
const plane = (page) => page.locator('.mathmaster-function-workspace-graph svg[role="application"]').first();
const markerButton = (page, type) => page.locator('button', { hasText: type }).first();

/* ------------------------------------------- Function Investigation, by role */

for (const role of ['practice', 'dol']) {
  const page = await open('investigation', role);
  const label = `investigation (${role})`;

  // A point card: the typed entry is on screen, and offered.
  await page.getByRole('button', { name: /^Plot the point where x = 0/ }).click();
  await page.waitForTimeout(150);
  let said = await announcement(page);
  const cardName = await page.getByRole('button', { name: /^Plot the point where x = 0/ }).getAttribute('aria-label');
  check(await exactEntryShown(page) && OFFERS_TYPING.test(said) && OFFERS_TYPING.test(cardName),
    `${label}: a selected point card offers the typed coordinate, which is on screen`, `"${said}"`);

  // ...and the route it offers works.
  await typePoint(page, 'Plot the point where x = 0', 0, 1);
  check(/^Placed Plot the point where x = 0 at \(0, 1\)\.$/.test(await announcement(page)), `${label}: the typed coordinate places the point`, `"${await announcement(page)}"`);
  await typePoint(page, 'Plot the point where x = 2', 2, 5);
  if (role === 'practice') {
    await page.getByRole('button', { name: 'Check Point Placements' }).click();
    await page.waitForTimeout(250);
  }
  await drawLine(page);

  // An end marker: the curve holds the points still, the typed entry is gone,
  // and the announcement must not send the student looking for it.
  check(await markerButton(page, 'Arrow').count() === 1, `${label}: the curve is drawn and the end markers are offered`);
  await markerButton(page, 'Arrow').click();
  await page.waitForTimeout(150);
  said = await announcement(page);
  check(!(await exactEntryShown(page)), `${label}: with the curve drawn the typed entry is not on screen`);
  check(/^Arrow selected\. Use the arrow keys on the plane and press Enter\.$/.test(said) && !OFFERS_TYPING.test(said),
    `${label}: the marker announcement offers only what is there — the arrow keys and Enter`, `"${said}"`);

  // ...and the route it does offer places the marker.
  await plane(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  said = await announcement(page);
  check(said.startsWith('Placed Arrow at ('), `${label}: arrow keys and Enter place the marker`, `"${said}"`);
  await page.close();
}

/* ---------------------------------------- the analysis fields, named by part */

{
  // Through to the analysis stage of the investigation (practice).
  const page = await open('investigation', 'practice');
  await typePoint(page, 'Plot the point where x = 0', 0, 1);
  await typePoint(page, 'Plot the point where x = 2', 2, 5);
  await page.getByRole('button', { name: 'Check Point Placements' }).click();
  await page.waitForTimeout(250);
  await drawLine(page);
  // In practice the true ends pulse until they are marked, and a marker
  // dropped on one snaps to it. Read where the next one is before each drop:
  // the first drop's feedback moves the plane down the page.
  for (let drop = 0; drop < 2; drop += 1) {
    await markerButton(page, 'Arrow').click();
    await page.waitForTimeout(100);
    const [px, py] = await page.evaluate(() => {
      const box = document.querySelector('.mathmaster-endpoint-pulse').getBoundingClientRect();
      return [box.x + box.width / 2, box.y + box.height / 2];
    });
    await page.mouse.click(px, py);
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: '2. Analyze Function' }).click();
  await page.waitForTimeout(600);
  const names = await mathFieldNames(page);
  check(JSON.stringify(names) === JSON.stringify(['Domain in interval notation', 'Range in interval notation']),
    'investigation: the domain and range fields are named by their parts, not by the example "[2, ∞)"', JSON.stringify(names));
  await page.close();
}

{
  // An analysis-only question: a value with no placeholder, an authored label
  // with mathematics in it, and a point typed as coordinates.
  const page = await open('analysis');
  const names = await mathFieldNames(page);
  check(JSON.stringify(names) === JSON.stringify(['The value of f(2)', 'The domain of f', 'The y-intercept']),
    'analysis: every field is named by its part, in plain words', JSON.stringify(names));
  check(!names.some((name) => /^(Math answer|\[2, ∞\)|\(x, y\) or DNE)$/.test(name)), 'analysis: no field is called by its placeholder or the generic name', JSON.stringify(names));
  await page.close();
}

/* ------------------- TL38: a point the student marked is not drawn red */

// Red says "wrong" everywhere else on the platform, so a point the student
// selected on the plane — right or wrong, and before anything is graded — has
// a colour of its own (src/platform/graph/studentMarkColor.js). Marked here by
// the mouse or finger and by the keyboard, on a Chromebook and a phone, under
// practice and a DOL, on the intercept and on a point that is NOT the intercept.
{
  const RED = '#d93025';
  const TEAL = '#00838f';
  const marksOn = (page) => page.evaluate(() => [...document.querySelectorAll('svg circle[r="8"][stroke="#fff"]')]
    .filter((circle) => circle.getBoundingClientRect().width > 0)
    .map((circle) => (circle.getAttribute('fill') || '').toLowerCase()));
  // The crosshair starts at the middle of the plane and each arrow key moves it
  // one snap step; it announces where it is, so walk until it says (x, y).
  const walkCursorTo = async (page, x, y) => {
    await plane(page).focus();
    for (let guard = 0; guard < 80; guard += 1) {
      const at = /\((-?[\d.]+), (-?[\d.]+)\)/.exec(await announcement(page));
      if (!at) return false;
      const [cx, cy] = [Number(at[1]), Number(at[2])];
      if (cx === x && cy === y) return true;
      await page.keyboard.press(cx < x ? 'ArrowRight' : cx > x ? 'ArrowLeft' : cy < y ? 'ArrowUp' : 'ArrowDown');
    }
    return false;
  };
  for (const [screen, viewport, touch] of [['1366x768', { width: 1366, height: 768 }, false], ['390x844', { width: 390, height: 844 }, true]]) {
    const screenContext = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    for (const role of ['practice', 'dol']) {
      for (const route of ['pointer', 'keyboard']) {
        for (const [what, x, y] of [['the intercept', 0, 1], ['another point', 2, 5]]) {
          const label = `mark ${what} by ${route === 'pointer' ? (touch ? 'tap' : 'click') : 'keyboard'} (${screen}, ${role})`;
          const page = await screenContext.newPage();
          page.setDefaultTimeout(8000);
          page.on('pageerror', (error) => check(false, `${label}: page error`, error.message));
          await page.goto(`${ORIGIN}/tests/browser/graphKeyboardRoute.html?q=pick&role=${role}&run=${stamp}-${(pageCount += 1)}`, { waitUntil: 'networkidle' });
          await page.locator('[data-graph-keyboard-fixture]').waitFor();
          await page.waitForTimeout(700);
          await page.getByRole('button', { name: /intercept/ }).first().click();
          await page.waitForTimeout(150);
          check((await marksOn(page)).length === 0, `${label}: nothing is marked yet`);
          if (route === 'pointer') {
            await plane(page).scrollIntoViewIfNeeded();
            const fit = await axisFit(page);
            const [px, py] = toScreen(fit, x, y);
            if (touch) await page.touchscreen.tap(px, py);
            else await page.mouse.click(px, py);
          } else {
            check(await walkCursorTo(page, x, y), `${label}: the arrow keys walk the crosshair to (${x}, ${y})`, `"${await announcement(page)}"`);
            await page.keyboard.press('Enter');
          }
          await page.waitForTimeout(300);
          const marks = await marksOn(page);
          check(marks.length === 1 && marks[0] === TEAL, `${label}: one mark, in its own colour`, JSON.stringify(marks));
          check(!marks.includes(RED), `${label}: and it is not red`);
          await page.close();
        }
      }
    }
    await screenContext.close();
  }
}

/* ------------------------- TOOL-1: the whole question, by keyboard alone */

{
  const focusName = (page) => page.evaluate(() => {
    const el = document.activeElement;
    return !el || el === document.body ? '<body>' : (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 60);
  });
  const enterOn = async (page, locator) => { await locator.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); };
  const typeByKeyboard = async (page, card, x, y) => {
    await enterOn(page, page.getByRole('button', { name: new RegExp(`^${card}`) }));
    await page.getByRole('spinbutton', { name: 'x', exact: true }).focus();
    await page.keyboard.type(String(x));
    await page.getByRole('spinbutton', { name: 'y', exact: true }).focus();
    await page.keyboard.type(String(y));
    // Enter in the y box places the point (it owns its Enter).
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  };
  const cursorAt = async (page) => {
    const match = (await announcement(page)).match(/\((-?[\d.]+), (-?[\d.]+)\)/);
    return match ? [Number(match[1]), Number(match[2])] : null;
  };
  const markEndByKeyboard = async (page, target) => {
    await enterOn(page, markerButton(page, 'Arrow'));
    await plane(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    let at = await cursorAt(page);
    for (let i = 0; i < 80 && at && Math.abs(at[0] - target[0]) > 0.01; i += 1) { await page.keyboard.press(at[0] < target[0] ? 'ArrowRight' : 'ArrowLeft'); at = await cursorAt(page); }
    for (let i = 0; i < 80 && at && Math.abs(at[1] - target[1]) > 0.01; i += 1) { await page.keyboard.press(at[1] < target[1] ? 'ArrowUp' : 'ArrowDown'); at = await cursorAt(page); }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  };
  const connect = (page) => page.locator('[data-graph-connect-points="construction"]');
  const curvePart = (page) => page.evaluate(() => (window.__mmGraded.at(-1)?.parts || []).find((part) => part.id === 'graph-curve') || null);
  const keyboardAccessRecords = (page) => page.evaluate(() => window.__mmEvidence.filter((record) => record.supportId === 'keyboard-access').map((record) => record.eventType));

  // On a DOL the keyboard-only route is the keyboard-access support's: the plan
  // offers Connect there. Practice offers it to everyone.
  for (const [role, points, right] of [['practice', [1, 5], true], ['dol', [1, 5], true], ['dol', [2, 6], false]]) {
    const label = `keyboard only, ${role}, ${right ? 'right' : 'wrong'} points`;
    const page = await open('construct', role, role === 'dol' ? '&plan=keyboard' : '');
    await typeByKeyboard(page, 'Plot the point where x = 0', 0, points[0]);
    check(/^Placed Plot the point where x = 0 at /.test(await announcement(page)), `${label}: Enter in the y box places the point`, `"${await announcement(page)}"`);
    await typeByKeyboard(page, 'Plot the point where x = 2', 2, points[1]);
    if (role === 'practice') {
      await enterOn(page, page.getByRole('button', { name: 'Check Point Placements' }));
      check(await focusName(page) === 'Connect my points', `${label}: a passed check sends focus to Connect my points, not the page`, await focusName(page));
    } else {
      check(await connect(page).count() === 1, `${label}: with the keyboard-access support, Connect my points is offered once every point is down`);
      check((await keyboardAccessRecords(page)).includes('provided'), `${label}: and that is recorded as the support provided`, JSON.stringify(await keyboardAccessRecords(page)));
      await connect(page).focus();
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check((await connect(page).innerText()).includes('Curve drawn'), `${label}: Connect my points draws the curve through the student's points`, await announcement(page));
    check(await focusName(page) !== '<body>', `${label}: after connecting, focus is not thrown to the page`, await focusName(page));
    check(await markerButton(page, 'Arrow').count() === 1, `${label}: the end markers come next, reachable by keyboard`);
    await markEndByKeyboard(page, [-3.5, -6]);
    await markEndByKeyboard(page, [3.5, 8]);
    await enterOn(page, page.getByRole('button', { name: /^Submit/ }).first());
    await page.waitForTimeout(800);
    const graded = await page.evaluate(() => window.__mmGraded.at(-1) || null);
    const curve = await curvePart(page);
    check(Boolean(graded), `${label}: the question is submitted by keyboard`);
    check(curve?.isComplete === true && curve?.isCorrect === right && graded?.isCorrect === right,
      `${label}: graded ${right ? 'correct' : 'wrong'}, the curve with it`, JSON.stringify({ isCorrect: graded?.isCorrect, curve }));
    await page.close();
  }

  // A DOL without the keyboard-access support: no Connect, and nothing names
  // it — the curve is the student's to draw. Practice offers it to everyone
  // and records no support for it.
  {
    const page = await open('construct', 'dol');
    await typeByKeyboard(page, 'Plot the point where x = 0', 0, 1);
    await typeByKeyboard(page, 'Plot the point where x = 2', 2, 5);
    await page.waitForTimeout(300);
    check(await connect(page).count() === 0, 'DOL without the keyboard-access support: no Connect my points');
    check(/Draw your curve through all of your points/.test(await page.locator('body').innerText()), 'DOL without the support: it still says to draw the curve');
    check(!/Connect my points/.test(await page.locator('body').innerText()), 'DOL without the support: nothing names Connect my points');
    check((await keyboardAccessRecords(page)).length === 0, 'DOL without the support: no support recorded');
    await page.close();

    const practice = await open('construct', 'practice', '&plan=keyboard');
    await typeByKeyboard(practice, 'Plot the point where x = 0', 0, 1);
    await typeByKeyboard(practice, 'Plot the point where x = 2', 2, 5);
    await enterOn(practice, practice.getByRole('button', { name: 'Check Point Placements' }));
    check(await connect(practice).count() === 1, 'practice: Connect my points is offered, plan or not');
    check((await keyboardAccessRecords(practice)).length === 0, 'practice: everyone has it, so it is not the support provided');
    await practice.close();
  }

  // Enter in the x box with y still empty moves on to y; it places nothing
  // (an empty y is not 0; pass 3 review).
  {
    const page = await open('construct', 'practice');
    await enterOn(page, page.getByRole('button', { name: /^Plot the point where x = 0/ }));
    await page.getByRole('spinbutton', { name: 'x', exact: true }).focus();
    await page.keyboard.type('0');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.closest('label')?.textContent?.trim()?.[0] || '');
    check(focused === 'y' && !/^Placed /.test(await announcement(page)),
      'typed entry: Enter in x with y empty moves to y and places nothing', `focus "${focused}", "${await announcement(page)}"`);
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check(/^Placed Plot the point where x = 0 at \(0, 1\)\.$/.test(await announcement(page)), 'typed entry: then Enter in y places (0, 1)', `"${await announcement(page)}"`);
    // A card that states its x needs only y: Enter in y with x empty places it.
    await enterOn(page, page.getByRole('button', { name: /^Plot the point where x = 2/ }));
    await page.getByRole('spinbutton', { name: 'y', exact: true }).focus();
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check(/^Placed Plot the point where x = 2 at \(2, 5\)\.$/.test(await announcement(page)), 'typed entry: a card that states its x is placed from y alone', `"${await announcement(page)}"`);
    await page.close();
  }

  // AX27 (F-PLACE-NEEDS-SELECT): "Place at this coordinate" places the point a
  // student has chosen. With none chosen it can only say so, and used to say it
  // in a status line at the foot of the tool. The cue beside it says it before
  // it is pressed, is the button's description, and names the point once one
  // is chosen; pressing with none chosen says so first, before any number.
  {
    const page = await open('construct', 'practice');
    const cue = page.locator('[data-graph-exact-cue]');
    const buttonDescription = async () => {
      const client = await page.context().newCDPSession(page);
      const { nodes } = await client.send('Accessibility.getFullAXTree');
      await client.detach();
      return nodes.find((node) => node.role?.value === 'button' && node.name?.value === 'Place at this coordinate')?.description?.value ?? '';
    };
    check(/^Choose which point you are placing first, then type its x and y\.$/.test(await cue.innerText()),
      'typed entry: with no point chosen, the cue says to choose one first', `"${await cue.innerText()}"`);
    check((await buttonDescription()) === (await cue.innerText()), 'typed entry: and the Place button is described by it', `"${await buttonDescription()}"`);
    check(await cue.evaluate((node) => !node.closest('[aria-live], [role="status"], [role="alert"]') && !node.hasAttribute('aria-live')),
      'typed entry: the cue is plain text, not a second live region (the announcements stay one voice)');
    await page.getByRole('spinbutton', { name: 'x', exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: 'y', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Place at this coordinate' }).click();
    await page.waitForTimeout(200);
    check(await announcement(page) === 'Choose which point you are placing first.', 'typed entry: Place with no point chosen says to choose one, and nothing else', `"${await announcement(page)}"`);
    check(await page.getByRole('spinbutton', { name: 'x', exact: true }).inputValue() === '0', 'typed entry: and keeps the numbers the student typed');
    await page.getByRole('spinbutton', { name: 'x', exact: true }).fill('');
    await page.getByRole('spinbutton', { name: 'y', exact: true }).fill('');
    await page.getByRole('button', { name: 'Place at this coordinate' }).click();
    await page.waitForTimeout(200);
    check(await announcement(page) === 'Choose which point you are placing first.', 'typed entry: with the boxes empty too, the missing point is said first', `"${await announcement(page)}"`);
    await page.getByRole('button', { name: /^Plot the point where x = 0/ }).click();
    await page.waitForTimeout(150);
    check(/^Placing Plot the point where x = 0\. Type its x and y, then press Place at this coordinate\.$/.test(await cue.innerText()),
      'typed entry: once a point is chosen, the cue names it', `"${await cue.innerText()}"`);
    await page.getByRole('button', { name: 'Place at this coordinate' }).click();
    await page.waitForTimeout(200);
    check(await announcement(page) === 'Enter a number for both x and y.', 'typed entry: with a point chosen and no numbers, it asks for the numbers', `"${await announcement(page)}"`);
    await page.close();
  }

  // Practice, wrong points: the check refuses them and nothing is connected.
  const page = await open('construct', 'practice');
  await typeByKeyboard(page, 'Plot the point where x = 0', 0, 2);
  await typeByKeyboard(page, 'Plot the point where x = 2', 2, 6);
  await enterOn(page, page.getByRole('button', { name: 'Check Point Placements' }));
  check(await connect(page).count() === 0, 'keyboard only, practice, wrong points: no curve can be connected until the points are right');
  await page.close();

  // The inverse sketch, mirrored: reflect both points by keyboard, check them,
  // and "Connect my reflected points" draws the inverse through them.
  for (const [reflected, right] of [[[[1, 0], [3, 1]], true], [[[0, 1], [1, 3]], false]]) {
    const label = `keyboard only, inverse, ${right ? 'reflected' : 'unreflected'} points`;
    const inverse = await open('inverse', 'practice');
    await typeByKeyboard(inverse, 'Plot the point where x = 0', 0, 1);
    await typeByKeyboard(inverse, 'Plot the point where x = 1', 1, 3);
    await enterOn(inverse, inverse.getByRole('button', { name: 'Check Point Placements' }));
    await inverse.keyboard.press('Enter');
    await inverse.waitForTimeout(300);
    for (const end of [[-3.5, -6], [2.5, 6]]) await markEndByKeyboard(inverse, end);
    await enterOn(inverse, inverse.getByRole('button', { name: '2. Build Inverse' }));
    await typeByKeyboard(inverse, 'Reflect the point at x = 0', ...reflected[0]);
    await typeByKeyboard(inverse, 'Reflect the point at x = 1', ...reflected[1]);
    await enterOn(inverse, inverse.getByRole('button', { name: 'Check Reflected Points' }));
    const connectInverse = inverse.locator('[data-graph-connect-points="inverse"]');
    if (!right) {
      check(await connectInverse.count() === 0, `${label}: nothing to connect until the reflected points are right`);
      await inverse.close();
      continue;
    }
    check(await focusName(inverse) === 'Connect my reflected points', `${label}: a passed check sends focus to Connect my reflected points`, await focusName(inverse));
    await inverse.keyboard.press('Enter');
    await inverse.waitForTimeout(300);
    check((await connectInverse.innerText()).includes('Inverse drawn') && /snapped to the exact inverse/.test(await announcement(inverse)),
      `${label}: the inverse is drawn through the reflected points and snaps`, await announcement(inverse));
    check(await focusName(inverse) !== '<body>', `${label}: after connecting, focus is not thrown to the page`, await focusName(inverse));
    await inverse.close();
  }
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} of ${total} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} checks passed: the keyboard announcements offer only routes that are on screen, and every analysis field is named by its part.`);
