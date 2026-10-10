// Drive the weekly panel and the skill card in Chromium at desktop and phone size.
//
// HOW TO RUN:
//   npx vite --port 5209 --strictPort &
//   node tests/browser/pathProgressTruth.mjs
//
// Checks: a half-done weekly session reads "Resume" and is not counted; the
// skill card shows one score and the "what's left" checklist; no sideways
// scroll, tap targets >= 44px, no console errors. Every non-localhost request
// is aborted, so nothing here can reach Firestore or a real student.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5209';
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, isMobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
];
const SCENES = [
  { name: 'weeklyHalfDone', mustContain: ['1 of 3 done', 'Completed ✓', 'Resume session 2 · 1 of 5 answered', 'Grade so far'], mustNotContain: ['Goal hit'], mustReach: ['Resume session 2'] },
  { name: 'weeklyHalfDoneCompact', mustContain: ['0 of 3 sessions complete'], mustNotContain: ['Weekly target complete'] },
  { name: 'skillCardNotYet', mustContain: ["What's left to master this", 'Your score on this skill', '90%', 'Secure', 'Level 2 round done', 'Stretch practice'], mustNotContain: ['Observed accuracy', 'Mastery estimate', 'Path Pass', 'Mastery challenge'] },
  { name: 'skillCardMastered', mustContain: ['You have mastered this skill', 'Mastered'], mustNotContain: ["What's left to master this"] },
];
const MIN_TAP = 44;
// StandardBadge chips (TEKS / CCMR connection) belong to src/components/common
// (job F's accessibility lane) and are reported there, not failed here.
const KNOWN_ELSEWHERE = [/^TEKS /, /^CCMR connection/];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const failures = [];
for (const view of VIEWPORTS) {
  const context = await browser.newContext({ viewport: view.viewport, isMobile: view.isMobile, hasTouch: view.isMobile });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/pathProgressTruth.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmPathScene === 'function', { timeout: 30000 });
  for (const scene of SCENES) {
    errors.length = 0;
    await page.evaluate((name) => window.__mmPathScene(name), scene.name);
    await page.waitForTimeout(300);
    const seen = await page.evaluate((minTap) => {
      const width = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')].filter((element) => element.getBoundingClientRect().width > 0);
      return {
        crashed: document.querySelector('[data-mm-crashed]')?.textContent || null,
        text: document.body.innerText.replace(/\s+/g, ' '),
        width,
        scrollWidth: document.documentElement.scrollWidth,
        small: controls.map((element) => ({ label: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 40), box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.height < minTap || box.width < minTap).map(({ label, box }) => `${label} ${Math.round(box.width)}x${Math.round(box.height)}`),
        controls: controls.map((element) => ({ label: (element.innerText || '').replace(/\s+/g, ' ').trim(), right: element.getBoundingClientRect().right })),
      };
    }, MIN_TAP);
    const problems = [];
    if (seen.crashed) problems.push(`crashed: ${seen.crashed}`);
    errors.filter((error) => !/net::|Failed to fetch|FirebaseError/i.test(error)).forEach((error) => problems.push(`console: ${error}`));
    if (seen.scrollWidth > seen.width + 1) problems.push(`sideways scroll ${seen.scrollWidth} > ${seen.width}`);
    seen.small.filter((entry) => !KNOWN_ELSEWHERE.some((pattern) => pattern.test(entry))).forEach((entry) => problems.push(`small tap target: ${entry}`));
    const text = seen.text.toLowerCase();
    (scene.mustContain || []).forEach((needle) => { if (!text.includes(needle.toLowerCase())) problems.push(`missing: ${needle}`); });
    (scene.mustNotContain || []).forEach((needle) => { if (text.includes(needle.toLowerCase())) problems.push(`must not show: ${needle}`); });
    (scene.mustReach || []).forEach((needle) => {
      const control = seen.controls.find((entry) => entry.label.toLowerCase().includes(needle.toLowerCase()));
      if (!control) problems.push(`missing control: ${needle}`);
      else if (control.right > seen.width + 1) problems.push(`control off screen: ${needle}`);
    });
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${view.name} ${scene.name}${problems.length ? `\n     ${problems.join('\n     ')}` : ''}`);
    if (problems.length) failures.push({ view: view.name, scene: scene.name, problems });
    await page.screenshot({ path: `${process.env.SHOT_DIR || '/tmp'}/pathProgressTruth-${view.name}-${scene.name}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
if (failures.length) { console.error(`${failures.length} scene(s) failed`); process.exit(1); }
console.log('all scenes passed');
