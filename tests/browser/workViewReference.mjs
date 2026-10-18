/*
 * "INFORMATION YOU NEED" IN WORK VIEW (student pass 3, TOOL-12), in Chromium
 * at 1366×768 and 390×844.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/workViewReference.mjs
 *
 * A question's reference card sat in the task card, which Work View hides: a
 * student who enlarged the work lost the numbers the question gives
 * (tests/browser/workViewReferenceMain.jsx mounts the real QuestionEngine).
 *
 *   1366x768  Work View's header has a "Reference" button beside Task and Help;
 *             its drawer ("Reference") holds the group "Information you need"
 *             with the authored lines, read from the accessibility tree.
 *   390x844   No fourth header button (it squeezed the task): the Task drawer
 *             holds the task and, after it, the same group.
 *   both      On a DOL it is still there (it is the question, not help); a
 *             scenario reference (Interval Number Line) is carried the same
 *             way; a question with no reference card gets neither.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

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

const openWorkView = async (page, q, role = 'practice') => {
  await page.goto(`${origin}/tests/browser/workViewReference.html?q=${q}&role=${role}`, { waitUntil: 'networkidle' });
  await page.locator(`[data-reference-fixture="${q}"]`).waitFor();
  await page.getByRole('button', { name: /Enlarge question|Open Work View/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /Work View/ });
  await dialog.waitFor();
  return dialog;
};

const FIXTURES = {
  line: ['A taxi charges a $3 pickup fee.', 'Each mile costs $2 more.'],
  interval: ['A freezer must stay at or below −3 degrees and above −8 degrees.'],
};

for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  const phone = width < 768;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${at}: page error: ${error.message}`));

  for (const [q, role] of [['line', 'practice'], ['line', 'dol'], ['interval', 'practice']]) {
    await step(at, `${q} (${role}): the reference is reachable in Work View`, async () => {
      const dialog = await openWorkView(page, q, role);
      const header = dialog.locator('header.mathmaster-work-view-header');
      const names = await header.getByRole('button').allTextContents();
      let drawer;
      if (phone) {
        assert.ok(!names.includes('Reference'), `no fourth header button on a phone: ${names.join(' | ')}`);
        await header.getByRole('button', { name: 'Task', exact: true }).click();
        drawer = dialog.getByRole('region', { name: 'Original task' });
      } else {
        assert.deepEqual(names.slice(0, 3), ['Task', 'Reference', 'Help'], `the header: ${names.join(' | ')}`);
        const button = header.getByRole('button', { name: 'Reference', exact: true });
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
        await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        drawer = dialog.getByRole('region', { name: 'Reference' });
      }
      await drawer.waitFor();
      const group = drawer.getByRole('group', { name: 'Information you need' });
      const tree = await group.ariaSnapshot();
      for (const line of FIXTURES[q]) {
        // The math in a line is spoken in words, so match the prose around it.
        const prose = line.split(/\$\d+/)[0].trim();
        assert.ok(tree.includes(prose), `"${prose}" is in the accessibility tree:\n${tree}`);
      }
      assert.ok(await group.isVisible(), 'the group is on screen');
      // The work stays usable: closing the drawer hides it again.
      if (phone) await dialog.locator('header').getByRole('button', { name: 'Task', exact: true }).click();
      else await dialog.locator('header').getByRole('button', { name: 'Reference', exact: true }).click();
      assert.equal(await group.isVisible(), false, 'the drawer closes');
    });
  }

  await step(at, 'a question with no reference card gets no Reference', async () => {
    const dialog = await openWorkView(page, 'none');
    const names = await dialog.locator('header.mathmaster-work-view-header').getByRole('button').allTextContents();
    assert.ok(!names.includes('Reference'), names.join(' | '));
    await dialog.locator('header').getByRole('button', { name: 'Task', exact: true }).click();
    assert.equal(await dialog.getByRole('group', { name: 'Information you need' }).count(), 0);
  });

  await context.close();
}
await browser.close();
if (failures.length) {
  console.error(`\nworkViewReference: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('workViewReference: all checks passed');
