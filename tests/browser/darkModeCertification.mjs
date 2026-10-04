/*
 * DARK MODE CERTIFICATION — light and dark, phone / tablet / desktop.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &                        # Work View harness
 *   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &           # the real app, in memory
 *   npm run certify:dark-mode
 *
 *   AUDIT_ORIGIN (default http://localhost:5199), TEACHER_HARNESS_ORIGIN
 *   (default http://127.0.0.1:5188), PLAYWRIGHT_MODULE / CHROMIUM_PATH,
 *   ONLY=workview|app to run one part, DARK_MODE_CERTIFICATION_SHOTS for
 *   artifacts (default tests/browser/artifacts/darkMode, git-ignored).
 *
 * PART 1 — WORK VIEW. Assignment controls, MathLive, tables, feedback and three
 * representative tools stay readable in both themes; graph labels never match
 * the graph background; and (new) no tool paints a pale surface in dark mode.
 *
 * PART 2 — THE APPLICATION. The real App.jsx (firebase/* replaced by in-memory
 * fakes; synthetic school) signed in as a teacher and as a student, at iPhone,
 * large iPhone, iPad and desktop widths. Every surface below is opened through
 * the UI — dashboard, class selector, Live Class Walkthrough, student drawer,
 * quick-search dialog, assignment menu, assignments, library, classes,
 * students/supports, gradebook, grade export, reports, testing, Live
 * Challenge, administration, the root administrator's Teacher View /
 * Administration workspace, and the student's screens — and audited from
 * computed styles by tests/browser/themeAudit.mjs:
 *
 *   dark   no large PALE surface (white / light-gray / pastel card, panel, nav,
 *          header, SVG shape), no pale neutral outline (the "white box"),
 *          native controls with a dark color-scheme
 *   both   text contrast (WCAG 2.2 1.4.3), no clipped horizontal overflow, no
 *          undefined --mm-* token, no var() in an SVG presentation attribute
 *
 * It is not a screenshot comparison: a moved pixel cannot fail it. Every
 * failure saves a full-page screenshot and the findings in the artifacts dir;
 * every run writes report.json and a few reference screenshots.
 *
 * INTENTIONAL LIGHT CONTENT: media, and elements marked
 * [data-mm-intentional-light="<reason>"] (themeAudit.mjs). Keep that list short.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFailures, auditTheme } from './themeAudit.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const appOrigin = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const shots = process.env.DARK_MODE_CERTIFICATION_SHOTS || path.join(repo, 'tests/browser/artifacts/darkMode');
const ONLY = process.env.ONLY || '';
mkdirSync(shots, { recursive: true });

const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const report = { workView: [], app: [] };
const failures = [];

// ------------------------------------------------------------------ PART 1
if (!ONLY || ONLY === 'workview') {
  const devices = [
    ['chromebook', 1366, 768], ['phone-portrait', 390, 844],
    ['phone-landscape', 844, 390], ['tablet', 768, 1024],
  ];
  const tools = ['graphing2', 'stepAlgebra2', 'dataModelingLab'];
  for (const [device, width, height] of devices) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      const page = await context.newPage();
      await page.goto(`${origin}/tests/browser/workViewCertification.html`, { waitUntil: 'networkidle' });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
      for (const tool of tools) {
        await page.evaluate((id) => window.__mmStage4(id), tool);
        await page.locator(`[data-stage4-tool="${tool}"]`).waitFor();
        await page.waitForTimeout(300);
        const failures = await page.locator(`[data-stage4-tool="${tool}"]`).evaluate((root) => {
          const rgba = (value) => {
            const channels = (value.match(/[\d.]+/g) || []).map(Number);
            return { rgb: channels.slice(0, 3), alpha: channels.length > 3 ? channels[3] : 1 };
          };
          const luminance = (value) => {
            const channels = rgba(value).rgb.map((entry) => { const n = entry / 255; return n <= .03928 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
            return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
          };
          const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
          const background = (node) => {
            for (let current = node; current; current = current.parentElement) {
              const value = getComputedStyle(current).backgroundColor;
              if (rgba(value).alpha > 0) return value;
            }
            return getComputedStyle(document.documentElement).backgroundColor;
          };
          return [...root.querySelectorAll('p,label,button,input,select,textarea,math-field,th,td,svg text')]
            .filter((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; })
            .map((node) => ({ node, style: getComputedStyle(node) }))
            .filter(({ node }) => (node.matches('input,select,textarea,math-field') && !['checkbox', 'radio', 'range', 'color'].includes(node.type)) || (node.textContent || '').trim())
            .filter(({ node, style }) => ratio(style.color, background(node)) < (Number.parseFloat(style.fontSize) >= 24 ? 3 : 4.5))
            .slice(0, 12).map(({ node }) => node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.tagName);
        });
        assert.deepEqual(failures, [], `${device}/${theme}/${tool} has low-contrast foreground/background pairs`);
        if (theme === 'dark') {
          // New in Dark Mode 2.0: the tool must not paint pale surfaces either.
          const surfaces = await auditTheme(page, { theme, root: `[data-stage4-tool="${tool}"]` });
          report.workView.push({ device, tool, lightSurfaces: surfaces.lightSurfaceCount });
          assert.deepEqual(surfaces.lightSurfaces, [], `${device}/dark/${tool} paints a light surface in dark mode`);
        }
        // The PLANE, not "the first svg": the action bar's calculator icon is an
        // svg too (CalculatorIcon.jsx), and 300ms after the root appears the
        // lazily loaded plane may not exist yet. With `svg.first()` this check
        // either read the icon (no <text>: getComputedStyle(null) threw on PR
        // #399's CI) or, before the icon existed, found no svg and was skipped.
        const graph = page.locator(`[data-stage4-tool="${tool}"] svg.mathmaster-responsive-canvas`).first();
        if (tool === 'graphing2') await graph.waitFor({ state: 'attached', timeout: 30000 });
        if (tool === 'graphing2') {
          const colors = await graph.evaluate((svg) => ({ bg: getComputedStyle(svg.querySelector('rect')).fill, labels: getComputedStyle(svg.querySelector('text')).fill }));
          assert.notEqual(colors.bg, colors.labels, `${device}/${theme} graph labels must differ from graph background`);
        }
        await page.screenshot({ path: path.join(shots, `${device}-${theme}-${tool}.png`), fullPage: true });
      }
      await context.close();
    }
  }
  console.log('Part 1: Work View controls, MathLive, tables, feedback and representative tools certified in light and dark.');
}

// ------------------------------------------------------------------ PART 2
const VIEWPORTS = [
  { name: 'iphone', width: 390, height: 844 },
  { name: 'iphone-max', width: 430, height: 932 },
  { name: 'ipad', width: 820, height: 1180 },
  { name: 'desktop', width: 1366, height: 900 },
];

const teacherNav = (page) => page.locator('nav[aria-label="Teacher dashboard navigation"]');
const openTab = async (page, title) => {
  // Programmatic click: some tool screens lay an overlay over the rail.
  await teacherNav(page).locator(`button[title="${title}"]`).evaluate((button) => button.click());
  await page.waitForTimeout(900);
};
const closeOverlay = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };

// Each step leaves the page showing one surface, which is then audited.
const TEACHER_STEPS = [
  { id: 'teacher-dashboard', run: async () => {} },
  { id: 'class-selector-open', required: '[role="listbox"]', run: async (page) => {
    await page.locator('[aria-haspopup="listbox"]').first().click();
    await page.waitForTimeout(300);
  }, after: async (page) => { await page.locator('[aria-haspopup="listbox"]').first().click(); await page.waitForTimeout(300); } },
  { id: 'live-walkthrough', run: async (page) => {
    await page.getByRole('tab', { name: /^Walkthrough/ }).click();
    await page.waitForTimeout(400);
  } },
  { id: 'quick-search-dialog', required: '[role="dialog"]', run: async (page) => {
    await page.getByRole('button', { name: /^.?\s*Find/ }).first().click();
    await page.waitForTimeout(300);
    await page.keyboard.type('Sys');
    await page.waitForTimeout(300);
  }, after: closeOverlay },
  { id: 'assignments', run: (page) => openTab(page, 'Assignments') },
  { id: 'assignment-menu-open', required: '[role="menu"]', run: async (page) => {
    await page.locator('.mm-dashboard-content [aria-haspopup="true"]').first().click();
    await page.waitForTimeout(300);
  }, after: closeOverlay },
  { id: 'library', run: (page) => openTab(page, 'Library') },
  { id: 'classes', run: (page) => openTab(page, 'Classes') },
  { id: 'students-and-supports', run: (page) => openTab(page, 'Students') },
  { id: 'student-profile-drawer', required: '[role="dialog"][aria-modal="true"]', run: async (page) => {
    // A roster name opens the learning-profile drawer.
    await page.locator('.mm-dashboard-content table tbody button').first().click();
    await page.waitForTimeout(500);
  }, after: closeOverlay },
  { id: 'gradebook', run: (page) => openTab(page, 'Grades') },
  { id: 'grade-export', run: (page) => openTab(page, 'Grade Export') },
  { id: 'reports-analytics', run: (page) => openTab(page, 'Analytics') },
  { id: 'testing-secure-exams', run: (page) => openTab(page, 'Secure Exams') },
  { id: 'live-challenge', run: (page) => openTab(page, 'Live Challenge') },
  { id: 'administration-access', run: (page) => openTab(page, 'Student Access') },
];

const STUDENT_STEPS = ['Home', 'Assignments', 'Grades', 'My Rewards', 'My Math Path', 'Tests & Exams'].map((name) => ({
  id: `student-${name.toLowerCase().replace(/\W+/g, '-').replace(/-$/, '')}`,
  run: async (page) => {
    await page.locator('nav button').filter({ hasText: name }).first().evaluate((element) => element.click());
    await page.waitForTimeout(900);
  },
}));

// The root administrator's Teacher View / Administration workspace (the
// harness's ?rootAdmin=1 gives the teacher those claims).
const ADMIN_STEPS = [
  { id: 'admin-teacher-view-toggle', required: '[aria-label="Root administrator workspace"]', run: async () => {} },
  { id: 'administration-workspace', run: async (page) => {
    await page.locator('[aria-label="Root administrator workspace"]').getByRole('button', { name: 'Administration' }).click();
    await page.getByRole('heading', { name: 'MathMaster Administration' }).waitFor({ timeout: 15_000 });
  } },
];

const REFERENCE_SHOTS = new Set(['admin-teacher-view-toggle', 'administration-workspace', 'teacher-dashboard', 'live-walkthrough', 'class-selector-open', 'assignment-menu-open', 'student-home', 'student-my-math-path']);

const certify = async ({ role, steps, viewport, theme }) => {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const query = { student: '?reset=1&as=student&studentId=910002', admin: '?reset=1&rootAdmin=1' }[role] || '?reset=1';
  await page.goto(`${appOrigin}/tests/browser/teacherWorkflow/index.html${query}`);
  if (role !== 'student') await page.getByRole('heading', { name: 'Live Class', exact: true }).waitFor({ timeout: 90_000 });
  else await page.locator('nav[aria-label="Student navigation"]').first().waitFor({ timeout: 90_000 });
  const resolved = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || null,
  }));
  assert.equal(resolved.theme, theme, `${role}/${viewport.name}: the app resolved data-theme="${resolved.theme}" on a ${theme} device`);
  assert.match(resolved.colorScheme, new RegExp(theme), `${role}/${viewport.name}: :root color-scheme must follow the ${theme} theme`);

  for (const step of steps) {
    const label = `${role}/${viewport.name}/${theme}/${step.id}`;
    try {
      await step.run(page);
      if (step.required) await page.locator(step.required).first().waitFor({ state: 'visible', timeout: 10_000 });
    } catch (error) {
      failures.push(`${label}: could not open the surface — ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: path.join(shots, `FAIL-${role}-${viewport.name}-${theme}-${step.id}.png`), fullPage: true }).catch(() => {});
      await step.after?.(page).catch(() => {});
      continue;
    }
    const result = await auditTheme(page, { theme });
    const found = auditFailures(result);
    report.app.push({ label, findings: found.length, lightSurfaces: result.lightSurfaceCount, lightBorders: result.lightBorderCount, lowContrast: result.lowContrastCount, overflow: Boolean(result.overflow) });
    if (found.length) {
      failures.push(...found.slice(0, 8).map((finding) => `${label}: ${finding}`));
      await page.screenshot({ path: path.join(shots, `FAIL-${role}-${viewport.name}-${theme}-${step.id}.png`), fullPage: true });
    } else if (REFERENCE_SHOTS.has(step.id) && ['iphone', 'desktop'].includes(viewport.name)) {
      await page.screenshot({ path: path.join(shots, `${role}-${viewport.name}-${theme}-${step.id}.png`) });
    }
    await step.after?.(page);
  }
  if (pageErrors.length) failures.push(`${role}/${viewport.name}/${theme}: page errors — ${pageErrors.slice(0, 3).join(' | ')}`);
  await context.close();
};

if (!ONLY || ONLY === 'app') {
  for (const viewport of VIEWPORTS) {
    for (const theme of ['dark', 'light']) {
      await certify({ role: 'teacher', steps: TEACHER_STEPS, viewport, theme });
      await certify({ role: 'student', steps: STUDENT_STEPS, viewport, theme });
      await certify({ role: 'admin', steps: ADMIN_STEPS, viewport, theme });
    }
  }
  console.log(`Part 2: ${report.app.length} application surfaces audited (teacher, student and administrator; ${VIEWPORTS.length} viewports; light and dark).`);
}

await browser.close();
writeFileSync(path.join(shots, 'report.json'), JSON.stringify({ failures, ...report }, null, 2));
if (failures.length) {
  console.error(`\n${failures.length} dark-mode certification finding(s):`);
  failures.slice(0, 80).forEach((failure) => console.error(`  - ${failure}`));
  console.error(`\nScreenshots and report.json: ${path.relative(repo, shots)}`);
  process.exitCode = 1;
} else {
  console.log(`Dark mode certification passed. Reference screenshots and report.json: ${path.relative(repo, shots)}`);
}
