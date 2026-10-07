// Grades: Start on open work, "Ways to raise your grade", and "How this grade
// is figured" — measured in Chromium on a laptop and a phone.
//
// HOW TO RUN:
//
//   npx vite --host 127.0.0.1 --port 5212 --strictPort &
//   node tests/browser/studentGradesRaise.mjs [--shots <dir>]
//
// WHAT IT CHECKS, at 1366x768 and 390x844:
//
//   1. Missing and not-started work shows Start, and no View Results (there is
//      nothing to view yet); started work shows Continue; graded work shows
//      View Results and no Start; closed work offers "Try it again — no credit".
//   2. "Ways to raise your grade" is on screen with its count, and each row is
//      a >=44px button that hands its way back.
//   3. "How this grade is figured" is collapsed, expands on press
//      (aria-expanded), and its earned/possible points reconcile with the big
//      number at the top.
//   4. No sideways scroll, no tap target under 44px, no console errors.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted.

import path from 'node:path';
import { mkdirSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5212';
const shotsIndex = process.argv.indexOf('--shots');
const SHOTS = shotsIndex > -1 ? process.argv[shotsIndex + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const MIN_TAP = 44;

const VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768, isMobile: false },
  { name: 'phone', width: 390, height: 844, isMobile: true },
];

const launch = async () => {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch {
    return chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium' });
  }
};

const browser = await launch();
const failures = [];
const blocked = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.isMobile ? 2 : 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)/.test(url)) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));

  await page.goto(`${ORIGIN}/tests/browser/studentGradesRaise.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmGradesScene === 'function' && window.__mmGrades, { timeout: 30000 });

  const fail = (scene, message) => failures.push(`${viewport.name}/${scene}: ${message}`);

  const layout = async (scene) => {
    const seen = await page.evaluate((minTap) => {
      const width = document.documentElement.clientWidth;
      const small = [...document.querySelectorAll('button, a[href], input, select')]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.height < minTap || box.width < minTap))
        .map(({ element, box }) => `${(element.innerText || element.tagName).trim().slice(0, 40)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      const wide = [...document.querySelectorAll('*')]
        .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.right > width + 1; })
        .slice(0, 3).map((element) => element.tagName.toLowerCase());
      return {
        width, scrollWidth: document.documentElement.scrollWidth, small, wide,
        crashed: document.querySelector('[data-mm-crashed]')?.textContent || '',
      };
    }, MIN_TAP);
    if (seen.crashed) fail(scene, seen.crashed);
    if (seen.scrollWidth > seen.width + 1) fail(scene, `sideways scroll: ${seen.scrollWidth} > ${seen.width}`);
    seen.wide.forEach((tag) => fail(scene, `<${tag}> past the screen edge`));
    seen.small.forEach((label) => fail(scene, `tap target under ${MIN_TAP}px: ${label}`));
  };

  const rowButtons = (title) => page.evaluate((needle) => {
    const row = [...document.querySelectorAll('article')].find((article) => article.querySelector('h3')?.textContent === needle);
    return row ? [...row.querySelectorAll('button')].map((button) => button.innerText.trim()) : null;
  }, title);

  /* SCENE: grades — everything wired. */
  await page.evaluate(() => window.__mmGradesScene('grades'));
  await page.waitForTimeout(300);
  errors.length = 0;
  await page.evaluate(() => window.__mmGradesScene('gradesNotWired'));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__mmGradesScene('grades'));
  await page.waitForTimeout(300);

  const expectations = [
    ['Slope from Two Points', ['Start'], ['View Results']],
    ['Two-Step Equations', ['Start'], ['View Results']],
    ['Graphing Linear Equations', ['Continue', 'View Results'], ['Start']],
    ['Distributive Property', ['Continue', 'View Results'], ['Start']],
    ['Solving One-Step Equations', ['View Results'], ['Start', 'Continue']],
    ['Writing Expressions', ['View Results'], ['Start', 'Continue']],
    ['Order of Operations', ['View Results'], ['Start', 'Continue']],
    ['Integers on a Number Line', ['View Results', 'Try it again — no credit'], ['Start', 'Continue', 'Practice']],
    ['Inequalities', ['View Results'], ['Start', 'Continue']],
  ];
  for (const [title, mustHave, mustNot] of expectations) {
    const buttons = await rowButtons(title);
    if (!buttons) { fail('grades', `row "${title}" not found`); continue; }
    mustHave.forEach((label) => { if (!buttons.includes(label)) fail('grades', `"${title}" lacks ${label} (has ${buttons.join(', ')})`); });
    mustNot.forEach((label) => { if (buttons.includes(label)) fail('grades', `"${title}" must not show ${label}`); });
  }

  // Start on the missing row hands its assignment id back.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('article')].find((article) => article.querySelector('h3')?.textContent === 'Slope from Two Points');
    [...row.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Start').click();
  });
  const afterStart = await page.evaluate(() => window.__mmGrades.clicks.slice(-1)[0]);
  if (afterStart?.kind !== 'start' || afterStart?.value !== 'missing-open') fail('grades', `Start handed back ${JSON.stringify(afterStart)}`);

  // Ways to raise your grade: visible, counted, each row a big button.
  const ways = await page.evaluate(() => {
    const heading = document.getElementById('ways-to-raise-heading');
    const section = heading?.closest('section');
    const buttons = section ? [...section.querySelectorAll('button[data-way-kind]')] : [];
    const box = heading?.getBoundingClientRect();
    return {
      heading: heading?.textContent || null,
      visible: Boolean(box && box.height > 0),
      rows: buttons.map((button) => ({ kind: button.dataset.wayKind, text: button.innerText.replace(/\s+/g, ' ').trim(), height: Math.round(button.getBoundingClientRect().height) })),
      expected: window.__mmGrades.waysCount,
      whatChangedFirst: (() => {
        const panel = document.querySelector('[data-what-changed]');
        const summary = document.querySelector('[aria-label="Current marking period grade"]');
        return Boolean(panel && summary && heading
          && (summary.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)
          && (panel.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING));
      })(),
    };
  });
  if (!ways.visible) fail('grades', 'Ways to raise your grade is not on screen');
  if (ways.heading !== `Ways to raise your grade (${ways.expected})`) fail('grades', `heading reads "${ways.heading}"`);
  if (ways.rows.length !== ways.expected || ways.expected !== 6) fail('grades', `expected 6 ways, saw ${ways.rows.length}`);
  ways.rows.forEach((row) => { if (row.height < MIN_TAP) fail('grades', `way row ${row.kind} is ${row.height}px tall`); });
  if (!ways.whatChangedFirst) fail('grades', 'What changed is not between the summary and the ways list');
  await page.evaluate(() => document.querySelector('button[data-way-kind]').click());
  const afterWay = await page.evaluate(() => window.__mmGrades.clicks.slice(-1)[0]);
  if (afterWay?.kind !== 'way' || !String(afterWay?.value).startsWith('missing:')) fail('grades', `way click handed back ${JSON.stringify(afterWay)}`);

  // Section shares are printed on a row.
  const shareText = await page.evaluate(() => [...document.querySelectorAll('[data-section-share]')].map((node) => node.textContent));
  if (!shareText.includes('20% of this grade') || !shareText.includes('30% of this grade')) fail('grades', `section shares missing: ${shareText.slice(0, 4).join(' | ')}`);

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `grades-${viewport.name}-top.png`) });

  // How this grade is figured: collapsed, expands, reconciles.
  const toggle = page.getByRole('button', { name: /How this grade is figured/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'false') fail('grades', 'grade math should start collapsed');
  await toggle.click();
  await page.waitForTimeout(100);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') fail('grades', 'grade math did not expand');
  const math = await page.evaluate(() => ({
    text: document.querySelector('[data-grade-math]')?.innerText || '',
    big: document.querySelector('[aria-label="Current marking period grade"]')?.innerText || '',
    score: window.__mmGrades.summaryScore,
  }));
  const parsed = math.text.match(/earned ([\d.]+) of ([\d.]+) points on counted work = (\d+)%/);
  if (!parsed) fail('grades', `grade math text: ${math.text.slice(0, 120)}`);
  else {
    const [, earned, possible, percent] = parsed;
    if (Math.round((Number(earned) / Number(possible)) * 100) !== Number(percent)) fail('grades', `${earned}/${possible} does not make ${percent}%`);
    if (Number(percent) !== math.score || !math.big.includes(`${math.score}%`)) fail('grades', `math says ${percent}%, the summary says ${math.score}%`);
  }
  if (!/current score[^.]*Distributive Property/.test(math.text)) fail('grades', 'in-progress work is not named');
  if (!/Not counted in this grade: 1 missing, 1 waiting on your teacher, 1 excused/.test(math.text)) fail('grades', 'not-counted counts missing');
  await layout('grades');
  if (SHOTS) {
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, `grades-${viewport.name}-math.png`) });
    await page.screenshot({ path: path.join(SHOTS, `grades-${viewport.name}-full.png`), fullPage: true });
  }

  /* SCENE: nothing to raise — a kind line, not an empty box. */
  await page.evaluate(() => window.__mmGradesScene('gradesNothingToRaise'));
  await page.waitForTimeout(200);
  const empty = await page.evaluate(() => document.getElementById('ways-to-raise-heading')?.closest('section')?.innerText || '');
  if (!/all caught up/i.test(empty)) fail('gradesNothingToRaise', `empty list reads "${empty}"`);
  await layout('gradesNothingToRaise');

  /* SCENE: not wired — no section at all. */
  await page.evaluate(() => window.__mmGradesScene('gradesNotWired'));
  await page.waitForTimeout(200);
  if (await page.evaluate(() => Boolean(document.getElementById('ways-to-raise-heading')))) fail('gradesNotWired', 'ways list drawn without a list');
  await layout('gradesNotWired');

  errors
    .filter((message) => !/ERR_FAILED|net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(message))
    .forEach((message) => fail('console', message));
  console.log(`${viewport.name} ${viewport.width}x${viewport.height}: ways=${ways.rows.length} math="${parsed ? parsed[0] : '?'}" shares=${shareText.length}`);
  await context.close();
}

await browser.close();
console.log(`blocked ${blocked.length} non-local request(s) — no production contact`);
if (failures.length) {
  console.log(`FAIL\n${failures.map((line) => `  - ${line}`).join('\n')}`);
  process.exit(1);
}
console.log('PASS');
