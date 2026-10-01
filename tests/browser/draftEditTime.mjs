// OPENING A QUESTION IS NOT AN EDIT — IN EVERY CERTIFIED FAMILY (PQ-044).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/draftEditTime.mjs [scene-id ...]
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed)
//
// Every workspace writes its draft back the moment it mounts, and the time a
// draft carries is what orders it against the server copy and against every
// other Chromebook: newer wins. When the mount write was stamped "now", merely
// opening a question made whatever it showed — on a fresh Chromebook, empty
// boxes — the newest work; the server copy lost the restore to it and the
// background save carried it over the real work (questionDraftStorage.js).
//
// So, for each of the draft-persistence certification's families, in the same
// harness (draftPersistence.html, QuestionEngine mounted as App.jsx mounts it):
//
//   OPEN      a question nobody has worked: every draft it writes carries no
//             edit time;
//   EDIT      the student works it (real keys and clicks): every draft the
//             work changed carries the edit's time;
//   NAVIGATE  away and back — the workspace mounts again and writes its drafts
//             back — and every time is exactly what the edit left;
//   RELOAD    the same, after a reload.
//
// The draft VALUES are the certification's business (npm run
// test:draft-persistence); this is only about their time. Exits non-zero on any
// failure.
import { DRAFT_SCENES } from './draftPersistenceScenes.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/draftPersistence.html`;
const ONLY = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
// The guided-notes coach records its own panel state on mount: chrome, not work
// (the certification leaves it out for the same reason).
const COACH = [':guided-step', ':guided-collapsed'];

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));

const ready = async (sceneId) => {
  await page.waitForSelector(`[data-draft-scene="${sceneId}"]`, { timeout: 15000 });
  await page.waitForFunction(() => !document.body.textContent.includes('Opening Work View…'), null, { timeout: 15000 });
  await page.waitForTimeout(500);
};
const go = async (index) => {
  await page.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(DRAFT_SCENES[index].id);
};
// This question's drafts as stored: value and edit time, by key suffix.
const stored = () => page.evaluate(() => {
  const prefix = document.querySelector('[data-draft-scene]')?.getAttribute('data-draft-key') || '';
  const out = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!prefix || !key || !key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    // Persisted Undo stacks are local-only and never offered to the sync.
    if (/:undo:/.test(suffix)) continue;
    try {
      const envelope = JSON.parse(window.localStorage.getItem(key));
      out[suffix] = { value: JSON.stringify(envelope?.value ?? null), savedAt: Number(envelope?.savedAt) || 0 };
    } catch { /* not a draft */ }
  }
  return out;
});
const controls = (selector) => page.locator(`[data-draft-scene] ${selector}`);

// The certification's edits, made the way a student makes them: real keys and
// clicks (a dropdown is chosen from the keyboard, not set by script).
const applyEdits = async (scene) => {
  for (const action of scene.edit) {
    if (action.kind === 'math') {
      const field = controls('math-field').nth(action.index);
      if (!(await field.count())) continue;
      await field.click();
      await page.keyboard.type(action.value, { delay: 12 });
      await page.keyboard.press('Tab');
    } else if (action.kind === 'fill') {
      const input = controls('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])').nth(action.index);
      if (!(await input.count())) continue;
      await input.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(action.value, { delay: 12 });
      await page.keyboard.press('Tab');
    } else if (action.kind === 'choose') {
      // The option the scene names, reached with the arrow keys (or the next
      // one, where a dropdown is authored per question).
      const select = controls('select').nth(action.index);
      if (!(await select.count())) continue;
      const { values, current } = await select.evaluate((node) => ({ values: [...node.options].map((option) => option.value), current: node.selectedIndex }));
      const wanted = values.indexOf(action.value);
      const target = wanted >= 0 ? wanted : Math.min(current + 1, values.length - 1);
      await select.focus();
      for (let step = current; step !== target; step += target > current ? 1 : -1) {
        await page.keyboard.press(target > current ? 'ArrowDown' : 'ArrowUp');
      }
      await page.keyboard.press('Tab');
    } else if (action.kind === 'activate') {
      const control = page.locator('[data-draft-scene]').getByRole('button', { name: action.name, exact: true }).first();
      if (await control.count()) await control.click();
    } else if (action.kind === 'plane') {
      const box = await page.evaluate(() => {
        const svgs = [...document.querySelectorAll('[data-draft-scene] svg')]
          .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
          .filter((entry) => entry.box.width > 120 && entry.box.height > 120)
          .sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height));
        if (!svgs[0]) return null;
        svgs[0].svg.scrollIntoView({ block: 'center', inline: 'center' });
        const { x, y, width, height } = svgs[0].svg.getBoundingClientRect();
        return { x, y, width, height };
      });
      if (!box) continue;
      await page.waitForTimeout(150);
      await page.mouse.move(box.x + box.width * action.fx, box.y + box.height * action.fy);
      await page.mouse.down();
      await page.mouse.up();
    } else if (action.kind === 'press') {
      const button = page.locator('[data-draft-scene] button', { hasText: action.label }).first();
      if (await button.count()) await button.click();
    }
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(400);
};

await page.goto(PAGE);
await page.waitForSelector('[data-draft-scene]', { timeout: 60000 });

for (let index = 0; index < DRAFT_SCENES.length; index += 1) {
  const scene = DRAFT_SCENES[index];
  if (ONLY.length && !ONLY.includes(scene.id)) continue;
  const tag = scene.label;
  // A Chromebook that has never seen this question.
  await page.evaluate(() => window.__mmDraft.clearStorage());
  await go(index === 0 ? 1 : 0);
  await page.evaluate(() => window.__mmDraft.clearStorage());
  await go(index);

  const opened = await stored();
  const stamped = Object.entries(opened).filter(([, entry]) => entry.savedAt > 0).map(([suffix]) => suffix || '(question)');
  check(Object.keys(opened).length > 0 && stamped.length === 0, `${tag}: opening it writes its drafts with no edit time`, stamped.length ? `stamped: ${stamped.join(', ')}` : `${Object.keys(opened).length} draft(s)`);

  await applyEdits(scene);
  const edited = await stored();
  const changed = Object.keys(edited).filter((suffix) => !COACH.includes(suffix) && edited[suffix].value !== opened[suffix]?.value);
  if (!changed.length) {
    check(false, `${tag}: the scripted edit changed a draft`, 'nothing changed, so nothing was checked');
    continue;
  }
  const unstamped = changed.filter((suffix) => !(edited[suffix].savedAt > 0));
  check(unstamped.length === 0, `${tag}: every draft the student's work changed carries the edit's time`, unstamped.length ? `not stamped: ${unstamped.join(', ')}` : changed.join(', '));

  const sameTimes = (after) => Object.keys(edited)
    .filter((suffix) => !COACH.includes(suffix))
    .filter((suffix) => (after[suffix]?.savedAt ?? 0) !== edited[suffix].savedAt)
    .map((suffix) => `${suffix || '(question)'} ${edited[suffix].savedAt} -> ${after[suffix]?.savedAt ?? 'gone'}`);

  await go(index === 0 ? 1 : 0);
  await go(index);
  const navigated = sameTimes(await stored());
  check(navigated.length === 0, `${tag}: away and back, every draft keeps the edit's time`, navigated.join('; '));

  await page.reload();
  await page.waitForSelector('[data-draft-scene]', { timeout: 60000 });
  await go(index);
  const reloaded = sameTimes(await stored());
  check(reloaded.length === 0, `${tag}: after a reload, every draft keeps the edit's time`, reloaded.join('; '));
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} edit-time failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nedit time: opening, coming back to and reloading a question never makes its drafts newer; the student\'s edits do.');
