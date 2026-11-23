// EVERY QUESTION OF THE THREE THANKSGIVING BREAK PACKETS, ON A SCREEN.
//
//   npx vite --host 127.0.0.1 --port 5327 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5327 node tests/browser/thanksgivingPacketCheck.mjs
//
//   node tests/browser/thanksgivingPacketCheck.mjs a2h              one packet (a1, a1h, a2h)
//   node tests/browser/thanksgivingPacketCheck.mjs --only=tg-u2-q4  named questions
//   node tests/browser/thanksgivingPacketCheck.mjs --device=phone   one width
//   THANKSGIVING_SHOTS=<directory>                                  where the pictures go
//
// thanksgivingPacketCheckMain.jsx compiles each packet as an import does,
// stores it and reads it back, and mounts one question in the real
// QuestionEngine as a student on Classwork with unlimited tries. This driver
// opens every question of every packet at 1366x768 and at 390x844 and holds,
// for each one:
//
//   - it renders, with no page error, no console error and no error text;
//   - the packet says its tries are unlimited, and the strip above the
//     question says so;
//   - the worked example the player's own rules give it (examplePlayer.js)
//     opens by itself exactly when those rules say so (the first Classwork
//     question on a skill; the second, faded, where the example hands over),
//     and on request ("Try a similar one") otherwise; a question that names
//     an example is played that example, never the platform's in its place;
//     and "Your turn" on its last slide closes it;
//   - a question with no example of its own (the parent-function items, whose
//     example is the platform's own; the SAT items, which are Practice) is
//     reported, not failed;
//   - nothing scrolls sideways, with the example open and with it closed.
//
// It does not answer the questions: the answers were driven by hand-written
// journeys once (docs/reviews/2026-11-21-thanksgiving-packet-tool-check.md).
// It is not wired into CI: about 45 minutes for all three packets. Run it
// after a change to a packet or to a tool one of them uses.
//
// Exits non-zero on any failure.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5327';
const ARTIFACTS = process.env.THANKSGIVING_SHOTS || path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/thanksgivingPacketCheck');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

const args = process.argv.slice(2);
const option = (name, fallback) => (args.find((arg) => arg.startsWith(`--${name}=`)) || `--${name}=${fallback}`).slice(name.length + 3);
const files = args.filter((arg) => !arg.startsWith('--'));
const only = option('only', '').split(',').filter(Boolean);
const devices = option('device', 'desktop,phone').split(',');

const DEVICES = {
  desktop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const ERROR_TEXT = /something went wrong|could not be (shown|displayed|loaded)|Unknown question/i;

const browser = await chromium.launch(launch);
const failures = [];
const notes = [];
const fail = (where, message) => { failures.push(`${where}: ${message}`); console.log(`FAIL ${where}: ${message}`); };

let serial = 0;
const open = async (device, file, question = '', extra = '') => {
  serial += 1;
  const context = await browser.newContext(DEVICES[device]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`); });
  await page.goto(`${ORIGIN}/tests/browser/thanksgivingPacketCheck.html?file=${file}&q=${question}&run=${Date.now()}-${serial}${extra}`, { waitUntil: 'networkidle' });
  return { page, context, errors };
};

// The player on screen: the one in the work, not the copy Work View keeps in its closed Help drawer.
const playerOf = (page) => page.locator('.mathmaster-hint-panel [data-worked-example-player]');

// What reaches past the right edge without being inside a sideways scroller or a clipping box of its own.
const sideways = (page) => page.evaluate(() => {
  const width = window.innerWidth;
  const wide = [];
  for (const element of document.querySelectorAll('body *')) {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || box.right <= width + 2) continue;
    let parent = element.parentElement;
    let held = false;
    while (parent && parent !== document.body) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= width + 2) { held = true; break; }
      parent = parent.parentElement;
    }
    if (!held) wide.push(`${element.tagName.toLowerCase()} to ${Math.round(box.right)}px`);
  }
  return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: wide.slice(0, 4) };
});

for (const file of files.length ? files : ['a1', 'a1h', 'a2h']) {
  const listing = await open('desktop', file, '', '&list=1');
  const packet = await listing.page.evaluate(() => window.__mmPacket);
  await listing.context.close();
  if (packet.compileErrors.length) fail(file, `the packet does not compile: ${JSON.stringify(packet.compileErrors).slice(0, 300)}`);
  if (packet.attemptPolicy !== 'unlimited') fail(file, `the stored assignment's attempt policy is ${packet.attemptPolicy}, not unlimited`);
  if (!packet.storedExamples) fail(file, 'the stored assignment lost its worked examples');
  if (!packet.rolesCarried) fail(file, 'a stored question does not carry its section role, so the player cannot read the lesson');
  mkdirSync(path.join(ARTIFACTS, file), { recursive: true });
  let checked = 0;

  for (const question of packet.questions) {
    if (only.length && !only.includes(question.questionId)) continue;
    const rule = question.exampleRule;
    const opensByItself = rule.opensByItself === true;
    const failedBefore = failures.length;
    for (const device of devices) {
      const where = `${file} ${question.questionId} ${device}`;
      const { page, context, errors } = await open(device, file, question.questionId);
      try {
        await page.locator('[data-packet-question]').waitFor();
        await page.waitForTimeout(1500);
        const body = await page.locator('body').innerText();
        if (ERROR_TEXT.test(body)) fail(where, `error text on screen: ${(ERROR_TEXT.exec(body) || [''])[0]}`);
        if (!/Unlimited tries on this question/.test(body)) fail(where, 'the strip does not say the tries are unlimited');

        const player = playerOf(page);
        const openedByItself = (await player.count()) === 1;
        if (rule.from === 'own' && rule.source !== 'authored') fail(where, `the player hides its example ${rule.exampleId} (it would state an answer) and gives ${rule.source || 'nothing'} instead`);
        if (rule.offered && opensByItself !== openedByItself) fail(where, opensByItself ? 'the example should open by itself here, and did not' : 'the example opened by itself where the rules say it does not');
        if (openedByItself && rule.faded !== ((await player.getAttribute('data-example-faded')) !== null)) fail(where, rule.faded ? 'the second question on a skill should open its example faded' : 'the example opened faded on the first question of its skill');
        // The example a student asks for is the whole one: fold a faded one away first.
        if (openedByItself && rule.faded) {
          const slides = Number(await player.getAttribute('data-example-slide-count'));
          for (let step = 1; step < slides; step += 1) { await player.locator('[data-example-next]').click(); await page.waitForTimeout(100); }
          await player.locator('[data-example-your-turn]').click();
          await page.waitForTimeout(500);
        }
        if ((await player.count()) === 0) {
          const control = page.locator('[data-hint-control]').first();
          if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
          await page.waitForTimeout(250);
          const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
          if (await offer.count()) { await offer.first().click(); await page.waitForTimeout(500); }
        }
        if ((await player.count()) === 1) {
          const source = await player.getAttribute('data-example-source');
          if (source !== rule.source) fail(where, `the example played is "${source}"; the rules give "${rule.source}"`);
          if (rule.exampleId && source !== 'authored') notes.push(`${where}: ${rule.exampleId} would state an answer of this question, so the platform's own example plays`);
          if (!rule.exampleId) notes.push(`${where}: no example of its own; the platform's (${source}) plays`);
          const open = await sideways(page);
          if (open.page > 1 || open.wide.length) fail(where, `scrolls sideways with the example open: ${JSON.stringify(open)}`);
          await page.screenshot({ path: path.join(ARTIFACTS, file, `${question.questionId}-${device}-example.png`) });
          const slides = Number(await player.getAttribute('data-example-slide-count'));
          // A problem slide, then each step (a step that uses another skill may open that skill's slides).
          if (!(slides >= (rule.steps || 1) + 1)) fail(where, `the example has ${slides} slides for ${rule.steps} steps`);
          let clicks = 0;
          while ((await player.locator('[data-example-your-turn]').count()) === 0 && clicks < 40) {
            await player.locator('[data-example-next]').click();
            await page.waitForTimeout(100);
            clicks += 1;
          }
          if ((await player.locator('[data-example-your-turn]').count()) === 0) fail(where, 'the example never reaches Your turn');
          else {
            await player.locator('[data-example-your-turn]').click();
            await page.waitForTimeout(600);
            if (await player.count()) fail(where, '"Your turn" did not close the example');
          }
        } else if (rule.offered && rule.source) fail(where, `the example (${rule.exampleId || rule.source}) did not open, by itself or on request`);
        else notes.push(`${where}: no worked example is offered (section role: ${question.role})`);

        // The whole question in one picture: a tall window at the same width (a phone's stage scrolls inside itself).
        const hint = page.locator('[data-hint-control][aria-expanded="true"]');
        if (await hint.count()) await hint.first().click().catch(() => {});
        const closed = await sideways(page);
        if (closed.page > 1 || closed.wide.length) fail(where, `scrolls sideways: ${JSON.stringify(closed)}`);
        await page.setViewportSize({ width: DEVICES[device].viewport.width, height: device === 'phone' ? 2600 : 1900 });
        await page.waitForTimeout(350);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(ARTIFACTS, file, `${question.questionId}-${device}.png`) });
      } catch (error) {
        fail(where, `the driver stopped: ${String(error.message).split('\n')[0]}`);
      }
      if (errors.length) fail(where, errors.slice(0, 3).join(' | '));
      checked += 1;
      await context.close();
    }
    console.log(`${failures.length === failedBefore ? 'ok  ' : 'FAIL'} ${file} ${question.questionId} [${question.type}] example ${rule.exampleId || 'none'} (${rule.from || 'none'}, plays ${rule.source || 'nothing'}${opensByItself ? (rule.faded ? ', opens by itself faded' : ', opens by itself') : ''})`);
  }
  console.log(`${file}: ${checked} question screens checked`);
}

await browser.close();
if (notes.length) console.log(`\nNoted, not failed:\n  ${notes.join('\n  ')}`);
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nEvery question renders, has its example and stays inside the screen.');
