// Drive the Path map, "Browse all topics", the wheel legend and Recommended in
// Chromium at desktop and phone size.
//
// HOW TO RUN:
//   npx vite --port 5215 --strictPort &
//   node tests/browser/pathTopicBrowser.mjs
//
// Checks: the browser lists every unit and says where the class is; search
// narrows by name; locked and future skills explain themselves and offer the
// repair instead of a door; a practice button launches through the map's own
// launcher with the map's card shape; focus lands on the browser and returns to
// its button; the wheel's topics and skill names are listed under it; cards
// name their evidence. Every scene: no sideways scroll, tap targets >= 44px, no
// console errors. Every non-localhost request is aborted, so nothing here can
// reach Firestore or a real student.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5215';
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, isMobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
];
const MIN_TAP = 44;

const SCENES = [
  {
    name: 'pathMap', as: 'mapCards',
    mustContain: ['Your path', 'Browse all topics', 'Why this is suggested', 'Class unit · Module 2: Exploring Constant Rate of Change',
      'Your class is working on this now (Module 2: Exploring Constant Rate of Change).', 'Your score on this is 64% from 4 questions.', '1 practice round done'],
    mustNotContain: ['Path pass', 'TEKS', 'Class unit · Topic'],
    mustReach: ['Browse all topics', 'Start Level 1'],
  },
  {
    name: 'pathMap', as: 'browseByUnit', steps: [{ click: 'Browse all topics' }],
    mustContain: ['All topics in Algebra I', 'Module 1: Searching for Patterns', 'Module 2: Exploring Constant Rate of Change', 'Module 5: Maximizing and Minimizing',
      'Your class is working on this unit now', '49 skills', 'Search by name', 'By class unit', 'By topic',
      'Finding slope', 'Developing', 'Not Enough Evidence', 'Equations of perpendicular lines', 'Practice for this skill is being prepared'],
    mustNotContain: ['TEKS', 'Path pass'],
    mustReach: ['← Back to your path', 'By topic'],
    verify: () => (document.activeElement?.id === 'topic-browser-title' ? [] : [`focus is on ${document.activeElement?.tagName} #${document.activeElement?.id}, not the browser heading`]),
  },
  {
    name: 'pathMap', as: 'browseByTopic', steps: [{ click: 'Browse all topics' }, { click: 'By topic' }, { click: 'Quadratic Functions & Equations' }],
    mustContain: ['Linear Functions & Representations', 'Quadratic Functions & Equations', 'Class unit · Module 5: Maximizing and Minimizing', 'Your class reaches this in about', 'Nothing is wrong'],
    mustNotContain: ['TEKS'],
  },
  {
    name: 'pathMap', as: 'browseSearch', steps: [{ click: 'Browse all topics' }, { fill: '#topic-browser-search', value: 'slope' }],
    mustContain: ['skills match', 'Finding slope', 'Module 2: Exploring Constant Rate of Change'],
    mustNotContain: ['Solving linear equations', 'Module 5: Maximizing and Minimizing'],
  },
  {
    name: 'pathMap', as: 'browseLockedAndLaunch',
    steps: [{ click: 'Browse all topics' }, { fill: '#topic-browser-search', value: 'solving' }, { click: 'Practise Solving linear equations' }],
    mustContain: ['Strengthen Solving linear equations first — this skill builds on it.', 'Practise Solving linear equations', 'Your class reaches this in about', 'skills match'],
    mustNotContain: ['Start Level 1: Solving literal equations'],
    verify: () => {
      const launches = window.__mmLaunches || [];
      const problems = [];
      // A locked skill launches nothing itself; its repair launches the prerequisite.
      if (!launches.some((card) => card.skillId === 'teks:A.5A')) problems.push(`the repair did not launch Solving linear equations: ${JSON.stringify(launches)}`);
      if (launches.some((card) => ['teks:A.12E', 'teks:A.5B', 'teks:A.5C'].includes(card.skillId))) problems.push('a locked skill launched');
      const locked = [...document.querySelectorAll('[data-path-state="locked"]')];
      if (!locked.length) problems.push('no locked skill rendered');
      locked.forEach((row) => { if (row.querySelector('button[aria-label^="Start"]')) problems.push('a locked skill has a start button'); });
      return problems;
    },
  },
  {
    name: 'pathMap', as: 'browseLaunch', steps: [{ click: 'Browse all topics' }, { clickLabel: 'Start Level 1: Finding slope' }],
    mustContain: ['All topics in Algebra I'],
    verify: () => {
      const [card] = window.__mmLaunches || [];
      // The map's launcher contract: skillId + title + engine status.
      return card && card.skillId === 'teks:A.3A' && card.status === 'available' && card.title === 'Finding slope'
        ? [] : [`launch did not reach the map's launcher with the map's card: ${JSON.stringify(window.__mmLaunches)}`];
    },
  },
  {
    name: 'pathMap', as: 'browseBack', steps: [{ click: 'Browse all topics' }, { click: '← Back to your path' }],
    mustContain: ['Your path', 'Why this is suggested'],
    mustNotContain: ['All topics in Algebra I'],
    verify: () => ((document.activeElement?.innerText || '').includes('Browse all topics') ? [] : ['focus did not return to "Browse all topics"']),
  },
  {
    name: 'gradeEightPath', as: 'browseGradeEight', steps: [{ click: 'Browse all topics' }],
    mustContain: ['All topics in Grade 8', 'Slope and rate of change', 'Proportional and linear functions', 'grouped by topic'],
    mustNotContain: ['TEKS', 'By class unit', 'Grade 8 ·'],
  },
  {
    name: 'wheel', as: 'wheelLegend', steps: [{ css: '[data-wheel-legend] button', hasText: 'Linear Functions & Representations' }],
    mustContain: ['Topics on your wheel', 'Linear Functions & Representations', 'Number & Algebraic Methods', 'Finding slope', 'Developing',
      'What the colours mean', 'Secure', 'Needs Attention', 'Not Enough Evidence', 'practice round done', 'Level 3 (stretch) round done'],
    mustNotContain: ['🔵', 'TEKS'],
    verify: () => {
      const problems = [];
      const svg = document.querySelector('svg[role="group"]');
      if (!/49 skills in 5 topics/.test(svg?.getAttribute('aria-label') || '')) problems.push(`wheel label: ${svg?.getAttribute('aria-label')}`);
      const wedges = [...document.querySelectorAll('svg g[role="button"]')];
      if (wedges.length !== 49) problems.push(`expected 49 wedges, saw ${wedges.length}`);
      if (!wedges.every((wedge) => /\(topic \d+, .+\): /.test(wedge.getAttribute('aria-label') || ''))) problems.push('a wedge label does not name its topic');
      const topics = document.querySelectorAll('[data-wheel-topic]');
      if (topics.length !== 5) problems.push(`legend lists ${topics.length} topics, not 5`);
      const box = svg?.getBoundingClientRect();
      if (!box || box.width < 200) problems.push(`wheel rendered ${Math.round(box?.width || 0)}px wide`);
      return problems;
    },
  },
  {
    name: 'wheelGradeEight', as: 'wheelGradeEight',
    mustContain: ['Topics on your wheel', 'Slope and rate of change', 'Personal finance: credit, saving and college'],
    mustNotContain: ['TEKS', 'Grade 8 ·'],
  },
  {
    name: 'recommended', as: 'recommendedCards',
    mustContain: ['Recommended for you', 'Your class is working on this now (Module 2: Exploring Constant Rate of Change).'],
    mustNotContain: ['TEKS'],
  },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const failures = [];
let blocked = 0;
for (const view of VIEWPORTS) {
  const context = await browser.newContext({ viewport: view.viewport, isMobile: view.isMobile, hasTouch: view.isMobile });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return route.continue();
    blocked += 1;
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/pathTopicBrowser.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmTopicScene === 'function', { timeout: 60000 });
  for (const scene of SCENES) {
    errors.length = 0;
    const problems = [];
    await page.evaluate((name) => window.__mmTopicScene(name), scene.name);
    await page.waitForTimeout(300);
    for (const step of scene.steps || []) {
      try {
        if (step.click) await page.getByRole('button', { name: step.click, exact: false }).first().click({ timeout: 4000 });
        if (step.clickLabel) await page.locator(`button[aria-label="${step.clickLabel}"]`).first().click({ timeout: step.optional ? 800 : 4000 });
        if (step.fill) await page.fill(step.fill, step.value);
        // Scoped clicks: the wheel's wedges are buttons too, and their labels
        // name their topic, so a role query alone could open a skill card.
        if (step.css) await page.locator(step.css, { hasText: step.hasText }).first().click({ timeout: 4000 });
      } catch (error) {
        if (!step.optional) problems.push(`step ${JSON.stringify(step)} failed: ${String(error?.message || error).split('\n')[0]}`);
      }
      await page.waitForTimeout(200);
    }
    const seen = await page.evaluate((minTap) => {
      const width = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll('button, a[href], input, select')].filter((element) => element.getBoundingClientRect().width > 0);
      return {
        crashed: document.querySelector('[data-mm-crashed]')?.textContent || null,
        text: document.body.innerText.replace(/\s+/g, ' '),
        width,
        scrollWidth: document.documentElement.scrollWidth,
        small: controls.map((element) => ({ label: (element.innerText || element.getAttribute('aria-label') || element.id || '').trim().slice(0, 50), box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.height < minTap || box.width < minTap).map(({ label, box }) => `${label} ${Math.round(box.width)}x${Math.round(box.height)}`),
        wide: [...document.querySelectorAll('[data-mm-scene] *')].map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.right > width + 1)
          .slice(0, 4).map(({ element, box }) => `<${element.tagName.toLowerCase()}> to ${Math.round(box.right)}px: ${(element.innerText || '').trim().slice(0, 40)}`),
        controls: controls.map((element) => ({ label: (element.innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(), right: element.getBoundingClientRect().right })),
      };
    }, MIN_TAP);
    if (seen.crashed) problems.push(`crashed: ${seen.crashed}`);
    errors.filter((error) => !/net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(error)).forEach((error) => problems.push(`console: ${error}`));
    if (seen.scrollWidth > seen.width + 1) problems.push(`sideways scroll ${seen.scrollWidth} > ${seen.width}`);
    seen.wide.forEach((entry) => problems.push(`past the screen edge: ${entry}`));
    seen.small.forEach((entry) => problems.push(`small tap target: ${entry}`));
    const text = seen.text.toLowerCase();
    (scene.mustContain || []).forEach((needle) => { if (!text.includes(needle.toLowerCase())) problems.push(`missing: ${needle}`); });
    (scene.mustNotContain || []).forEach((needle) => { if (text.includes(needle.toLowerCase())) problems.push(`must not show: ${needle}`); });
    (scene.mustReach || []).forEach((needle) => {
      const control = seen.controls.find((entry) => entry.label.toLowerCase().includes(needle.toLowerCase()));
      if (!control) problems.push(`missing control: ${needle}`);
      else if (control.right > seen.width + 1) problems.push(`control off screen: ${needle}`);
    });
    if (scene.verify) (await page.evaluate(scene.verify)).forEach((problem) => problems.push(problem));
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${view.name.padEnd(7)} ${scene.as}${problems.length ? `\n     ${problems.join('\n     ')}` : ''}`);
    if (problems.length) failures.push({ view: view.name, scene: scene.as, problems });
    await page.screenshot({ path: `${process.env.SHOT_DIR || '/tmp'}/pathTopicBrowser-${view.name}-${scene.as}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
console.log(`blocked ${blocked} non-local request(s) — no production contact`);
if (failures.length) { console.error(`${failures.length} scene(s) failed`); process.exit(1); }
console.log('all scenes passed');
