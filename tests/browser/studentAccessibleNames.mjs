/*
 * STUDENT ACCESSIBLE NAMES (release-candidate QA m13) — read from Chromium's
 * accessibility tree (CDP Accessibility.getFullAXTree), not from the DOM, on
 * the accessibility certification's student-home and student-grades scenes,
 * at 1366×768 and 390×844.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/studentAccessibleNames.mjs
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &   # the math boxes
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), AUDIT_ORIGIN
 *   (default http://127.0.0.1:5199),
 *   PLAYWRIGHT_MODULE / CHROMIUM_PATH as in accessibilityCertification.mjs.
 *
 * What it proves:
 *   Home    no button has a heading node inside it (a heading inside a button
 *           is invalid content; the Home groups' "Finished 3" did). Each Home
 *           group's heading is a level-2 heading whose child is its disclosure
 *           button, and the button keeps the group's label and count.
 *   Grades  the hide/show grade toggle is named exactly "Hide grade", then,
 *           pressed, exactly "Show grade" — no emoji in either name, no
 *           aria-pressed contradicting the label — and no button on the
 *           screen carries an emoji in its name.
 *   Math boxes (pass 3, A11Y-3) on studentUxPlatform.html (AUDIT_ORIGIN):
 *           every math box of an assignment question, a practice question
 *           and an exit ticket, and one in Work View, is named where focus
 *           LANDS — the element the accessibility tree reports focused is
 *           MathLive's keyboard sink, and its name is the box's own (never
 *           ""), on first focus and again after typing, leaving and coming
 *           back (MathLive rewrites the sink's label on every focus). And (AX11)
 *           it says what it holds: the focused element's description is the
 *           box's content in words ("3 over 4") once there is some, absent on
 *           an empty box, and gone again when the box is cleared.
 *   Complete badge (pass 3, A11Y-7): a finished section's "Complete" badge
 *           on the section tabs is at least 12px.
 * Exits non-zero on any failure.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCompletedSection, SCREENS, VIEWPORTS } from './accessibilityCertification.mjs';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, 'artifacts/accessible-names');
const origins = {
  app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
  audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199',
};
const EMOJI = /\p{Extended_Pictographic}/u;

const failures = [];
const check = (ok, message) => {
  if (ok) console.log(`  ok   ${message}`);
  else { console.log(`  FAIL ${message}`); failures.push(message); }
};

// The full AX tree as id -> node, with parents, names and roles flattened.
const readTree = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  const byId = new Map();
  for (const node of nodes) {
    byId.set(node.nodeId, {
      id: node.nodeId,
      ignored: Boolean(node.ignored),
      role: node.role?.value || '',
      name: String(node.name?.value || '').trim(),
      childIds: node.childIds || [],
      props: Object.fromEntries((node.properties || []).map((prop) => [prop.name, prop.value?.value])),
      domId: node.backendDOMNodeId,
    });
  }
  for (const node of byId.values()) for (const child of node.childIds) if (byId.has(child)) byId.get(child).parent = node.id;
  const descendants = (node) => node.childIds.flatMap((id) => (byId.has(id) ? [byId.get(id), ...descendants(byId.get(id))] : []));
  const visible = [...byId.values()].filter((node) => !node.ignored);
  return { byId, visible, descendants };
};

const buttonsWithHeadings = ({ visible, descendants }) => visible
  .filter((node) => node.role === 'button')
  .filter((node) => descendants(node).some((child) => !child.ignored && child.role === 'heading'))
  .map((node) => node.name || '(unnamed)');

const sceneOf = (id) => {
  const screen = SCREENS.find((entry) => entry.id === id);
  if (!screen) throw new Error(`accessibilityCertification SCREENS has no ${id}`);
  return screen;
};

const runHome = async (page, viewport) => {
  const screen = sceneOf('student-home');
  await screen.scenes[0].run(page, origins, { first: true });
  const tree = await readTree(page);
  const nested = buttonsWithHeadings(tree);
  check(nested.length === 0, `${viewport} Home: no button contains a heading${nested.length ? ` (found: ${nested.join(' | ')})` : ''}`);

  // The groups' disclosure buttons, as the DOM names them, each matched to its
  // AX heading: heading level 2 -> child button (expanded state) named "<label> <count>".
  const groups = await page.locator('section[aria-labelledby^="group-"]').evaluateAll((sections) => sections.map((section) => {
    const label = document.getElementById(section.getAttribute('aria-labelledby'))?.textContent.trim();
    return { label, expanded: section.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') };
  }));
  check(groups.length > 0, `${viewport} Home: the scene has assignment groups to check (${groups.map((g) => g.label).join(', ')})`);
  check(groups.some((group) => group.label === 'Finished'), `${viewport} Home: the Finished group is on the scene`);
  for (const group of groups) {
    const heading = tree.visible.find((node) => node.role === 'heading' && node.name.startsWith(`${group.label} `)
      && node.childIds.some((id) => tree.byId.get(id)?.role === 'button'));
    check(Boolean(heading) && heading.props.level === 2, `${viewport} Home: "${group.label}" is a level-2 heading that contains its button`);
    const button = heading && tree.descendants(heading).find((node) => node.role === 'button');
    check(Boolean(button) && new RegExp(`^${group.label} \\d+$`).test(button.name), `${viewport} Home: the "${group.label}" button is named "<label> <count>" (got "${button?.name}")`);
    check(Boolean(button) && String(button.props.expanded) === group.expanded, `${viewport} Home: the "${group.label}" button exposes aria-expanded=${group.expanded} (AX expanded ${button?.props.expanded})`);
  }
  // Behaviour kept: the closed Finished group still opens from its button.
  const finished = page.locator('section[aria-labelledby="group-completed"] button[aria-expanded]');
  if (await finished.count()) {
    const before = await finished.getAttribute('aria-expanded');
    await finished.click();
    const after = await finished.getAttribute('aria-expanded');
    check(before !== after && await page.locator('#group-completed-body').count() === (after === 'true' ? 1 : 0), `${viewport} Home: the Finished button still toggles its group (${before} -> ${after})`);
    await finished.click();
  }
  await page.screenshot({ path: path.join(artifacts, `home-${viewport}.png`) }).catch(() => {});
};

const runGrades = async (page, viewport) => {
  const screen = sceneOf('student-grades');
  await screen.scenes[0].run(page, origins, { first: false });
  const toggleNames = (tree) => tree.visible.filter((node) => node.role === 'button' && /grade$/i.test(node.name) && /\b(hide|show)\b/i.test(node.name));

  let tree = await readTree(page);
  let toggles = toggleNames(tree);
  check(toggles.length === 1 && toggles[0].name === 'Hide grade', `${viewport} Grades: the toggle is named exactly "Hide grade" (got ${JSON.stringify(toggles.map((t) => t.name))})`);
  check(toggles.length === 1 && toggles[0].props.pressed === undefined, `${viewport} Grades: no pressed state contradicts the "Hide grade" label (pressed=${toggles[0]?.props.pressed})`);
  const emojiButtons = tree.visible.filter((node) => node.role === 'button' && EMOJI.test(node.name)).map((node) => node.name);
  check(emojiButtons.length === 0, `${viewport} Grades: no button name carries an emoji${emojiButtons.length ? ` (found: ${emojiButtons.join(' | ')})` : ''}`);
  const nested = buttonsWithHeadings(tree);
  check(nested.length === 0, `${viewport} Grades: no button contains a heading${nested.length ? ` (found: ${nested.join(' | ')})` : ''}`);

  // The other state: the grade is hidden and the same button now says Show.
  // Found by its visible text, not its name: the names are what is judged.
  const toggle = page.locator('button').filter({ hasText: /(Hide|Show) grade/ }).first();
  await page.locator('button').filter({ hasText: /Hide grade/ }).first().click();
  await page.locator('button').filter({ hasText: /Show grade/ }).first().waitFor({ timeout: 10_000 });
  tree = await readTree(page);
  toggles = toggleNames(tree);
  check(toggles.length === 1 && toggles[0].name === 'Show grade', `${viewport} Grades: hidden, the toggle is named exactly "Show grade" (got ${JSON.stringify(toggles.map((t) => t.name))})`);
  check(toggles.length === 1 && toggles[0].props.pressed === undefined, `${viewport} Grades: no pressed state contradicts the "Show grade" label (pressed=${toggles[0]?.props.pressed})`);
  const emojiHidden = tree.visible.filter((node) => node.role === 'button' && EMOJI.test(node.name)).map((node) => node.name);
  check(emojiHidden.length === 0, `${viewport} Grades (hidden): no button name carries an emoji${emojiHidden.length ? ` (found: ${emojiHidden.join(' | ')})` : ''}`);
  // The emoji is still drawn: the visual design is unchanged.
  const shown = await toggle.innerText();
  check(EMOJI.test(shown), `${viewport} Grades: the toggle still shows its emoji ("${shown.trim()}")`);
  await page.screenshot({ path: path.join(artifacts, `grades-hidden-${viewport}.png`) }).catch(() => {});
  await toggle.click();
};

// The element focus really landed on (through shadow roots), and what the
// accessibility tree says is focused: its role and name.
const focusedName = async (page) => {
  const dom = await page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    const host = active?.getRootNode?.()?.host;
    return { part: active?.getAttribute?.('part') || '', host: host?.tagName?.toLowerCase() || '', hostName: host?.getAttribute?.('aria-label') || '' };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  const focused = nodes.filter((node) => !node.ignored && (node.properties || []).some((prop) => prop.name === 'focused' && prop.value?.value) && node.role?.value !== 'RootWebArea');
  const node = focused[focused.length - 1];
  return { ...dom, role: node?.role?.value || '', name: String(node?.name?.value || '').trim(), description: String(node?.description?.value || '').trim() };
};

const checkBoxNamed = async (page, field, where) => {
  await field.click();
  await page.waitForTimeout(250);
  const first = await focusedName(page);
  check(first.host === 'math-field' && first.part === 'keyboard-sink', `${where}: focus lands in the math box's keyboard sink (${first.host || 'no host'} ${first.part || first.role})`);
  check(first.name !== '' && first.name === first.hostName, `${where}: the focused element is named "${first.hostName}" (got ${first.role} "${first.name}")`);
  check(first.description === '', `${where}: an empty box describes nothing (got "${first.description}")`);
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await field.click();
  await page.waitForTimeout(250);
  const again = await focusedName(page);
  check(again.name !== '' && again.name === again.hostName, `${where}: typed in, left and focused again, still named "${again.hostName}" (got ${again.role} "${again.name}")`);
  check(again.description === '1', `${where}: focused again, the box says what it holds, "1" (got "${again.description}")`);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(250);
  const emptied = await focusedName(page);
  check(emptied.description === '', `${where}: emptied, it describes nothing again (got "${emptied.description}")`);
};

// A fraction is said in words, and what a box holds follows what is typed into
// it (AX11): typed, left, and come back to, it still says "3 over 4"; the sink
// carries the description itself, never the host, where focus never lands.
const checkBoxDescribed = async (page, field, where) => {
  await field.click();
  await page.waitForTimeout(250);
  await page.keyboard.type('3/4');
  await page.waitForTimeout(250);
  const typed = await focusedName(page);
  check(typed.description === '3 over 4', `${where}: typed 3/4, the focused box describes "3 over 4" (got "${typed.description}")`);
  await page.keyboard.press('Tab');
  await field.click();
  await page.waitForTimeout(250);
  const back = await focusedName(page);
  check(back.description === '3 over 4' && back.name === back.hostName, `${where}: focused again, named "${back.hostName}" and described "3 over 4" (got "${back.name}" / "${back.description}")`);
  const where2 = await field.evaluate((host) => ({
    host: host.getAttribute('aria-description'),
    sink: host.shadowRoot?.querySelector('[part="keyboard-sink"]')?.getAttribute('aria-description'),
  }));
  check(where2.host === null && where2.sink === '3 over 4', `${where}: the description is on the keyboard sink, not the host (host ${JSON.stringify(where2.host)}, sink ${JSON.stringify(where2.sink)})`);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(250);
  const cleared = await focusedName(page);
  check(cleared.description === '', `${where}: cleared, it describes nothing again (got "${cleared.description}")`);
};

const runMathBoxes = async (page, viewport) => {
  await page.goto(`${origins.audit}/tests/browser/studentUxPlatform.html?q=ux-multi&run=names-${viewport}`, { timeout: 180_000 });
  await page.waitForFunction(() => window.__ux && document.querySelector('[data-question-id="ux-multi"]'), null, { timeout: 180_000 });
  for (const [questionId, where] of [['ux-multi', 'assignment'], ['ux-simple', 'practice'], ['ux-dol-simple', 'exit ticket']]) {
    await page.evaluate((qid) => window.__ux.go(qid), questionId);
    await page.waitForFunction((qid) => document.querySelector(`[data-question-id="${qid}"] math-field`), questionId, { timeout: 60_000 });
    await page.waitForTimeout(1200);
    const fields = page.locator(`[data-question-id="${questionId}"] math-field`);
    const count = await fields.count();
    check(count > 0, `${viewport} ${where}: the question has math boxes to check (${count})`);
    for (let index = 0; index < count; index += 1) await checkBoxNamed(page, fields.nth(index), `${viewport} ${where} box ${index + 1}`);
    if (questionId === 'ux-multi') await checkBoxDescribed(page, fields.first(), `${viewport} ${where} box 1`);
  }
  // Work View: the enlarged workspace draws its own copy of the question.
  await page.evaluate(() => window.__ux.go('ux-multi'));
  await page.waitForFunction(() => document.querySelector('[data-question-id="ux-multi"] math-field'), null, { timeout: 60_000 });
  await page.getByRole('button', { name: /Open Work View/ }).first().click();
  await page.locator('.mathmaster-work-view-header').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800);
  const inWorkView = page.locator('.mathmaster-work-view-host[data-open="true"] math-field').first();
  check(await inWorkView.count() === 1, `${viewport} Work View: a math box is open in Work View`);
  if (await inWorkView.count()) await checkBoxNamed(page, inWorkView, `${viewport} Work View box`);
  await page.screenshot({ path: path.join(artifacts, `math-boxes-${viewport}.png`) }).catch(() => {});
};

const runCompleteBadge = async (page, viewport) => {
  await page.locator('nav[aria-label="Student navigation"] a').filter({ hasText: 'Assignments' }).first().evaluate((link) => link.click());
  await page.getByText('My Assignments').first().waitFor({ timeout: 30_000 });
  await openCompletedSection(page);
  const badge = await page.locator('.mathmaster-section-tab.is-complete small').first().evaluate((element) => ({
    text: element.textContent.trim(), size: parseFloat(getComputedStyle(element).fontSize),
  }));
  check(badge.size >= 12, `${viewport} section tabs: the "${badge.text}" badge is at least 12px (${badge.size}px)`);
  // AX38: every tab's count, not only the Complete badge (10px on a laptop).
  const counts = await page.locator('.mathmaster-section-tab small').evaluateAll((elements) => elements
    .map((element) => ({ text: element.textContent.trim(), size: parseFloat(getComputedStyle(element).fontSize) })));
  check(counts.length > 0 && counts.every((count) => count.size >= 12), `${viewport} section tabs: every count is at least 12px (${counts.map((count) => `${count.text} ${count.size}px`).join(', ')})`);
  // AX45: one main landmark on the assignment screen; its work area is not a
  // second one nested inside it.
  const landmarks = await page.evaluate(() => ({
    mains: document.querySelectorAll('main, [role="main"]').length,
    workArea: Boolean(document.querySelector('.math-tool-workspace')),
  }));
  check(landmarks.workArea && landmarks.mains === 1, `${viewport} assignment: exactly one main landmark with the work area open (${landmarks.mains}, work area ${landmarks.workArea})`);
  await page.screenshot({ path: path.join(artifacts, `complete-badge-${viewport}.png`) }).catch(() => {});
};

const main = async () => {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(artifacts, { recursive: true });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n${viewport.id} ${viewport.width}x${viewport.height}`);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.isMobile), hasTouch: Boolean(viewport.hasTouch),
        colorScheme: 'light', reducedMotion: 'reduce',
      });
      await context.route('**/*', (route) => (
        /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(route.request().url()) || /^(data|blob):/.test(route.request().url())
          ? route.continue() : route.abort()
      ));
      const page = await context.newPage();
      try {
        await sceneOf('student-home').open(page, origins);
        await runHome(page, viewport.id);
        await runGrades(page, viewport.id);
        await runCompleteBadge(page, viewport.id);
        await runMathBoxes(page, viewport.id);
      } catch (error) {
        check(false, `${viewport.id}: could not finish — ${error.message.split('\n')[0]}`);
        await screenshotKeepingTouch(page, { path: path.join(artifacts, `FAIL-${viewport.id}.png`), fullPage: true }).catch(() => {});
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(`\nstudentAccessibleNames FAILED (${failures.length}):\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nstudentAccessibleNames passed.');
};

await main();
