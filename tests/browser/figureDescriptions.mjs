/*
 * FIGURES SAY WHAT THEY SHOW (student pass 3, Q-8; VPAT 1.1.1), read from
 * Chromium's accessibility tree at 1366×768 and 390×844.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/figureDescriptions.mjs
 *
 * Every figure outside the shared coordinate plane is mounted through the real
 * QuestionEngine (tests/browser/figureDescriptionsMain.jsx). For each, the
 * driver reads the node's computed name and description (CDP
 * Accessibility.getPartialAXTree), changes the figure once the way a student
 * would, and reads it again:
 *
 *   interval    the name is short and the description reads the dots and the
 *               shading the student placed, then the keys; never notation, on
 *               an item that asks for the notation.
 *   numberLine  the pick-a-point line names the marks and the chosen one, and
 *               the chosen mark is pressed; the static question graph above it
 *               says what kinds of marks it has while the question is open
 *               and where they are once it is closed.
 *   threePlane  each plane by its equation and colour, hidden or shown; on
 *               practice the revealed point is read, on a DOL there is no
 *               reveal and the text never names a point or a pair of planes.
 *   construct   the legacy graph workspace reads back a point the student
 *               placed (with its coordinates).
 *   analysis    its given graph is "a graph is drawn", no positions.
 *   story       the Graph Story sketch says how many strokes were drawn.
 *
 * At 390x844 it also checks A11Y-10: beside Submit, Undo and Reset keep a
 * word under their icons.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// Name, role and description as the accessibility tree computes them.
const axNode = async (page, selector) => {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert.ok(nodeId, `no element for ${selector}`);
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const node = nodes[0];
    return { role: node.role?.value || '', name: node.name?.value || '', description: node.description?.value || '' };
  } finally {
    await cdp.detach();
  }
};

const open = async (page, q, { role = 'practice', closed = false } = {}) => {
  await page.goto(`${origin}/tests/browser/figureDescriptions.html?q=${q}&role=${role}${closed ? '&closed=1' : ''}`, { waitUntil: 'networkidle' });
  await page.locator(`[data-figure-fixture="${q}"]`).waitFor();
  await page.waitForTimeout(400);
};

// Notation a picture-to-symbols item asks the student to write.
const NOTATION = /[[\]()]\s*−?\d|[≤≥<>]|\bx\s*=|interval notation:/;

const failures = [];
const step = async (at, what, run) => {
  try {
    await run();
    console.log(`ok ${at}: ${what}`);
  } catch (error) {
    failures.push(`${at}: ${what}: ${error.message}`);
    console.error(`FAIL ${at}: ${what}\n  ${error.message}`);
  }
};

for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  const phone = width < 768;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${at}: page error: ${error.message}`));

  await step(at, 'interval number line: what the student drew, never notation', async () => {
    await open(page, 'interval');
    const LINE = 'svg[role="application"][aria-label^="Number line"]';
    const before = await axNode(page, LINE);
    assert.equal(before.role, 'application');
    assert.match(before.name, /^Number line from −?[\d.]+ to −?[\d.]+$/, 'the name is the line, not its instructions');
    assert.match(before.description, /^Number line from .+, labelled every [\d.]+\. Nothing is drawn on it yet\. Click anywhere on the line/, before.description);
    // Place an endpoint with the keyboard: focus the line, Enter at the marker.
    await page.locator(LINE).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const pending = await axNode(page, LINE);
    assert.match(pending.description, /A (closed|open) dot at −?[\d/]+ is placed and waits for a second endpoint or a ray\./, pending.description);
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const drawn = await axNode(page, LINE);
    assert.match(drawn.description, /Your graph: Shaded from an? (closed|open) dot at −?[\d/]+ to an? (closed|open) dot at −?[\d/]+\./, drawn.description);
    assert.notEqual(drawn.description, pending.description, 'the description follows the drawing');
    const graphPart = drawn.description.split('Click anywhere')[0];
    assert.doesNotMatch(graphPart, NOTATION, `no interval notation or inequality on an item that asks for it: "${graphPart}"`);
  });

  await step(at, 'legacy number line: the marks and the student\'s choice', async () => {
    await open(page, 'numberLine');
    const GROUP = '[data-number-line-choices]';
    const before = await axNode(page, GROUP);
    assert.equal(before.role, 'group');
    assert.equal(before.name, 'Number line');
    assert.match(before.description, /^Number line with points at .+\. No point is selected yet\.$/, before.description);
    const first = page.locator(`${GROUP} button`).first();
    const label = await first.getAttribute('aria-label');
    await first.click();
    const after = await axNode(page, GROUP);
    assert.match(after.description, new RegExp(`Selected: ${label.replace(/^Select /, '').replace('-', '−')}\\.$`), after.description);
    assert.equal(await first.getAttribute('aria-pressed'), 'true', 'the chosen mark is pressed');
  });

  // A11Y-10: on a phone the work bar drops its words beside Submit, and Undo
  // (↶) and Reset (↺) were two near-identical arrows. Each keeps its word as a
  // caption under the icon; the other tools stay icon-only.
  if (phone) await step(at, 'work bar: Undo and Reset keep a caption beside Submit', async () => {
    await open(page, 'numberLine');
    const captions = await page.evaluate(() => [...document.querySelectorAll('.portrait-action-bar[data-has-primary="true"] .mathmaster-action-label')].map((label) => {
      const box = label.getBoundingClientRect();
      return { text: label.textContent.trim(), shown: box.width > 8 && box.height > 6 };
    }));
    const shown = captions.filter((caption) => caption.shown).map((caption) => caption.text.replace(/ Question$/, ''));
    assert.deepEqual(shown, ['Undo', 'Reset'], `only Undo and Reset show their word: ${JSON.stringify(captions)}`);
    for (const name of ['Undo', 'Reset Question']) {
      assert.equal(await page.locator('.portrait-action-bar').getByRole('button', { name, exact: true }).count(), 1, `"${name}" keeps its accessible name`);
    }
  });

  await step(at, 'static question graph: kinds while open, positions once closed', async () => {
    await open(page, 'numberLine');
    const GRAPH = 'svg[aria-label="Question graph"]';
    const live = await axNode(page, GRAPH);
    assert.equal(live.role, 'image');
    assert.match(live.description, /^x from −5 to 5, y from .+\. 1 line\. 1 point labelled A.*Positions are not read out while this question can be answered\.$/, live.description);
    assert.doesNotMatch(live.description, /\(2, 3\)|crosses|passes through/, 'no position while it can be answered');
    // A closed question's work area is `inert` (Q-97), which takes it out of
    // the accessibility tree altogether, so the closed reading is checked on
    // the element the graph's aria-describedby points to.
    await open(page, 'numberLine', { closed: true });
    const review = await page.evaluate((selector) => {
      const svg = document.querySelector(selector);
      return document.getElementById(svg.getAttribute('aria-describedby'))?.textContent || '';
    }, GRAPH);
    assert.match(review, /A at \(2, 3\)/, `the closed question reads the point at the drawn grid: ${review}`);
    assert.doesNotMatch(review, /Positions are not read out/);
  });

  for (const role of ['practice', 'dol']) {
    await step(at, `three-plane model (${role}): planes by equation; the reveal only where allowed`, async () => {
      await open(page, 'threePlane', { role });
      const MODEL = 'svg[role="application"][aria-label="Three planes in 3D"]';
      const before = await axNode(page, MODEL);
      assert.match(before.description, /^3D model with the x, y and z axes\. Plane 1, blue: x plus y plus z equals 6\. Plane 2, red: x minus y plus z equals 2\. Plane 3, green: 2x plus y minus z equals 1\. Dashed lines mark where shown planes cross\. Arrow keys rotate the model/, before.description);
      const drawing = await axNode(page, 'g[role="img"][aria-label="3D view of the three planes"]');
      assert.match(drawing.description, /^3D model with the x, y and z axes\./, 'the drawing has the same description');
      await page.getByRole('checkbox', { name: 'Show plane 2' }).click();
      const hidden = await axNode(page, MODEL);
      assert.match(hidden.description, /Plane 2, red: x minus y plus z equals 2, hidden\./, hidden.description);
      const reveal = page.getByRole('button', { name: 'Reveal the solution point' });
      if (role === 'practice') {
        await reveal.click();
        await page.waitForTimeout(200);
        const revealed = await axNode(page, MODEL);
        assert.match(revealed.description, /Marked on the model: the point 1, 2, 3\./, revealed.description);
      } else {
        assert.equal(await reveal.count(), 0, 'no reveal on a DOL');
        const text = (await axNode(page, MODEL)).description;
        assert.doesNotMatch(text, /Marked|planes \d and \d|parallel|share|one point|no point|infinitely/i, `nothing classifies the system on a DOL: ${text}`);
      }
    });
  }

  await step(at, 'legacy graph workspace: the student\'s own point is read back', async () => {
    await open(page, 'construct');
    const PLANE = '.mathmaster-function-workspace-graph svg[role="application"]';
    const before = await axNode(page, PLANE);
    assert.equal(before.name, 'Coordinate plane');
    assert.match(before.description, /^x from −4 to 4, y from −6 to 8\. Nothing is placed yet\. Use the arrow keys/, before.description);
    await page.getByRole('button', { name: /^Plot the point where x = 0/ }).click();
    await page.getByRole('spinbutton', { name: 'x', exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: 'y', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Place at this coordinate' }).click();
    await page.waitForTimeout(250);
    const after = await axNode(page, PLANE);
    assert.match(after.description, /You placed 1 point: Plot the point where x = 0 at \(0, 1\)\./, after.description);
  });

  await step(at, 'legacy graph workspace: a given graph is drawn, positions not read', async () => {
    await open(page, 'analysis');
    const text = (await axNode(page, '.mathmaster-function-workspace-graph svg[role="application"]')).description;
    assert.match(text, /A graph is drawn\. Positions on it are not read out while this question can be answered\./, text);
    assert.doesNotMatch(text, /\(\s*−?\d+,\s*−?\d+\s*\)/, 'no coordinates of the given graph');
  });

  await step(at, 'graph story sketch: the strokes the student drew', async () => {
    await open(page, 'story');
    const SKETCH = 'svg[aria-label="Graph story sketch"]';
    const before = await axNode(page, SKETCH);
    assert.equal(before.description, 'x-axis: x. y-axis: y. Nothing is drawn yet.');
    const box = await page.locator(SKETCH).boundingBox();
    await page.locator(SKETCH).scrollIntoViewIfNeeded();
    const fresh = await page.locator(SKETCH).boundingBox();
    const rect = fresh || box;
    await page.mouse.move(rect.x + rect.width * 0.3, rect.y + rect.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.4, { steps: 6 });
    await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await axNode(page, SKETCH);
    assert.equal(after.description, 'x-axis: x. y-axis: y. You drew 1 stroke.');
  });

  await context.close();
}
await browser.close();
if (failures.length) {
  console.error(`\nfigureDescriptions: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('figureDescriptions: all checks passed');
