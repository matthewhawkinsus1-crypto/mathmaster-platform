/*
 * MATHINPUT'S KEYPAD IS ONE TAB STOP (student pass 3, PR-27; issue #383 R7,
 * #386 item 3), in real Chromium at 1366×768 and 390×844.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/mathKeypadToolbar.mjs
 *
 * Each keypad ("Math tools", and on a phone "Keys needed for this answer") is
 * a toolbar in the accessibility tree with every key still named. Tab enters
 * it once and leaves it on the next Tab; arrows, Home and End move between
 * keys; Shift+Tab comes back to the key last used; Enter on a key types into
 * the field and gives the field its focus back (the focus hand-off).
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const active = (page) => page.evaluate(() => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  const toolbar = element?.closest?.('[role="toolbar"]');
  return {
    test: element?.closest?.('[data-test]')?.getAttribute('data-test') || null,
    label: element?.getAttribute?.('aria-label') || null,
    toolbar: toolbar?.getAttribute('aria-label') || null,
    inField: Boolean(element?.closest?.('math-field') || document.activeElement?.tagName === 'MATH-FIELD'),
  };
});

const failures = [];
for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 768, isMobile: width < 768 });
  try {
    await page.goto(`${origin}/tests/browser/mathKeypadToolbar.html`, { waitUntil: 'networkidle' });
    // On a phone the keypads belong to the active field: put the student in it.
    await page.locator('math-field').first().focus();
    await page.locator('[role="toolbar"][aria-label="Math tools"]').waitFor();

    // The accessibility tree: each keypad is a named toolbar of named buttons.
    const toolbars = await page.locator('[role="toolbar"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    const expectedToolbars = width < 768 ? ['Keys needed for this answer', 'Math tools'] : ['Math tools'];
    assert.deepEqual(toolbars, expectedToolbars, `${at}: the keypads are toolbars`);
    const tree = await page.locator('[role="toolbar"][aria-label="Math tools"]').ariaSnapshot();
    assert.match(tree, /^- toolbar "Math tools"/, `${at}: the accessibility tree has a "Math tools" toolbar`);
    const keyNames = await page.locator('[role="toolbar"][aria-label="Math tools"] button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    assert.ok(keyNames.length >= 4 && keyNames.every((name) => /^\S/.test(name || '')), `${at}: every key keeps its spoken name (${keyNames.join(' | ')})`);
    for (const name of keyNames) assert.match(tree, new RegExp(`button "${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${at}: "${name}" is a named button in the tree`);
    const stops = await page.locator('[role="toolbar"] button').evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length);
    assert.equal(stops, toolbars.length, `${at}: one key per keypad is in the Tab order`);

    // Tab: field → (√x toggle) → each keypad once → After.
    await page.locator('[data-test="before"]').focus();
    const visited = [];
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab');
      const now = await active(page);
      visited.push(now.toolbar ? `toolbar:${now.toolbar}` : (now.inField ? 'field' : (now.label || now.test)));
      if (now.test === 'after') break;
    }
    assert.equal(visited.at(-1), 'after', `${at}: Tab reaches the control after the field (${visited.join(' → ')})`);
    for (const name of expectedToolbars) {
      assert.equal(visited.filter((stop) => stop === `toolbar:${name}`).length, 1, `${at}: "${name}" is one Tab stop (${visited.join(' → ')})`);
    }

    // Arrows, Home and End inside "Math tools".
    await page.locator('[data-test="after"]').focus();
    await page.keyboard.press('Shift+Tab');
    let now = await active(page);
    assert.equal(now.toolbar, 'Math tools', `${at}: Shift+Tab from After lands in the keypad`);
    assert.equal(now.label, keyNames[0], `${at}: on its first key`);
    await page.keyboard.press('ArrowRight');
    assert.equal((await active(page)).label, keyNames[1], `${at}: ArrowRight moves to the next key`);
    await page.keyboard.press('End');
    assert.equal((await active(page)).label, keyNames.at(-1), `${at}: End moves to the last key`);
    await page.keyboard.press('ArrowRight');
    assert.equal((await active(page)).label, keyNames[0], `${at}: ArrowRight on the last key wraps to the first`);
    await page.keyboard.press('ArrowLeft');
    assert.equal((await active(page)).label, keyNames.at(-1), `${at}: ArrowLeft on the first wraps to the last`);
    await page.keyboard.press('Home');
    assert.equal((await active(page)).label, keyNames[0], `${at}: Home moves to the first key`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const third = keyNames[2];
    assert.equal((await active(page)).label, third, `${at}: ArrowDown moves on`);
    // Leaving and coming back returns to the key last used.
    await page.keyboard.press('Tab');
    assert.equal((await active(page)).test, 'after', `${at}: Tab leaves the keypad`);
    await page.keyboard.press('Shift+Tab');
    assert.equal((await active(page)).label, third, `${at}: Shift+Tab comes back to the key last used`);

    // Enter on a key types into the field, and the field gets focus back.
    const insertKey = keyNames.findIndex((name) => name.startsWith('Insert ') && !/Backspace|delete/i.test(name));
    assert.ok(insertKey >= 0, `${at}: there is an Insert key`);
    await page.keyboard.press('Home');
    for (let step = 0; step < insertKey; step += 1) await page.keyboard.press('ArrowRight');
    assert.equal((await active(page)).label, keyNames[insertKey]);
    const before = await page.locator('[data-test="value"]').textContent();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const after = await page.locator('[data-test="value"]').textContent();
    assert.notEqual(after, before, `${at}: Enter on "${keyNames[insertKey]}" typed into the field`);
    assert.equal((await active(page)).inField, true, `${at}: the field has focus again after a key`);
    // …and the keypad still remembers that key.
    await page.keyboard.press('Tab');
    let back = await active(page);
    if (!back.toolbar) { await page.keyboard.press('Tab'); back = await active(page); }
    if (width < 768 && back.toolbar === 'Keys needed for this answer') { await page.keyboard.press('Tab'); back = await active(page); }
    assert.equal(back.label, keyNames[insertKey], `${at}: Tab back into the keypad lands on the key last used`);
    // TL23: the toggle is a named picture of a keypad (not "√x", which read as
    // "insert a square root"), and the key that leaves a group says
    // "move out →" whole, on one line (not "↷ out": ↷ is the redo arrow).
    const toggleView = await page.locator('.mathmaster-math-tools-toggle').first().evaluate((button) => ({
      text: button.textContent.trim(),
      icon: Boolean(button.querySelector('svg[data-math-tools-icon="keypad"][aria-hidden="true"]')),
      name: button.getAttribute('aria-label'),
    }));
    assert.deepEqual(toggleView, { text: '', icon: true, name: 'Hide math tools' }, `${at}: the toggle is a named keypad picture`);
    const outKey = await page.locator('[role="toolbar"][aria-label="Math tools"] button[aria-label="Move the cursor out of the fraction, exponent or bracket"]').evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        text: button.textContent.trim(),
        whole: button.scrollWidth <= button.clientWidth + 1,
        oneLine: button.getBoundingClientRect().height < 2 * Number.parseFloat(style.lineHeight || '0') || button.getBoundingClientRect().height <= 46,
      };
    });
    assert.deepEqual(outKey, { text: 'move out →', whole: true, oneLine: true }, `${at}: the way-out key reads in full on one line`);
    console.log(`ok ${at}: ${expectedToolbars.join(' + ')} one Tab stop each; ${keyNames.length} named keys; arrows/Home/End; Enter types and returns focus; keypad toggle and way-out key read`);
  } catch (error) {
    failures.push(error);
    console.error(`FAIL ${at}: ${error.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();
if (failures.length) process.exit(1);
console.log('mathKeypadToolbar: all checks passed');
