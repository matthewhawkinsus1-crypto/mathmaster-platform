/*
 * STUDENT ACCESSIBLE NAMES (release-candidate QA m13) — read from Chromium's
 * accessibility tree (CDP Accessibility.getFullAXTree), not from the DOM, on
 * the accessibility certification's student-home and student-grades scenes,
 * at 1366×768 and 390×844.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/studentAccessibleNames.mjs
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188),
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
 * Exits non-zero on any failure.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS, VIEWPORTS } from './accessibilityCertification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, 'artifacts/accessible-names');
const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
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
      } catch (error) {
        check(false, `${viewport.id}: could not finish — ${error.message.split('\n')[0]}`);
        await page.screenshot({ path: path.join(artifacts, `FAIL-${viewport.id}.png`), fullPage: true }).catch(() => {});
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
