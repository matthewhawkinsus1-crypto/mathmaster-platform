// A PRODUCTION BUILD'S MATH FIELDS DRAW WITH THE MATH FONTS.
//
//   node tests/browser/mathFontsProduction.mjs
//
// MathLive fetched its KaTeX fonts from ./fonts/ beside its own script —
// /assets/fonts/ in a production build, where the build published nothing.
// Hosting answered each request with index.html, MathLive gave up ("The math
// fonts could not be loaded"; body class ML__fonts-did-not-load) and every
// math field fell back to system fonts. The development server hid it: there
// the fonts 404 under Vite's optimiser and three harnesses set the directory by
// hand. So this builds a harness page with the production pipeline
// (tests/browser/harnessProduction.config.mjs), serves it the way Hosting does
// (scripts/serve-static-spa.mjs: anything missing is index.html), and checks
// the math fields there.
//
// Exits non-zero on any failure.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const outDir = mkdtempSync(path.join(os.tmpdir(), 'mm-math-fonts-'));
const build = spawnSync('npx', ['vite', 'build', '--config', 'tests/browser/harnessProduction.config.mjs', '--logLevel', 'warn'], {
  env: { ...process.env, HARNESS: 'tests/browser/mathEntryContract.html', OUT_DIR: outDir },
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('the production harness build failed');
  process.exit(1);
}

const port = await new Promise((resolve) => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const { port: free } = probe.address();
    probe.close(() => resolve(free));
  });
});
const server = spawn(process.execPath, ['scripts/serve-static-spa.mjs', outDir, String(port)], { stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 600));

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const fontResponses = [];
  page.on('response', (response) => {
    if (/\.woff2?(\?|$)/.test(response.url())) {
      fontResponses.push({ url: new URL(response.url()).pathname, status: response.status(), type: response.headers()['content-type'] || '' });
    }
  });
  const fontWarnings = [];
  page.on('console', (message) => { if (/math fonts could not be loaded/i.test(message.text())) fontWarnings.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/tests/browser/mathEntryContract.html`, { waitUntil: 'networkidle' });
  await page.locator('math-field').first().waitFor({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  check(await page.locator('math-field').count() > 0, 'the production page mounts math fields');
  check(!(await page.evaluate(() => document.body.classList.contains('ML__fonts-did-not-load'))), 'MathLive does not report that its fonts failed to load');
  check(fontWarnings.length === 0, 'no "math fonts could not be loaded" warning', fontWarnings[0] || '');
  const wrong = fontResponses.filter((entry) => entry.status !== 200 || !/font|woff/.test(entry.type));
  check(wrong.length === 0, 'every font request is answered with a font', JSON.stringify(wrong.slice(0, 3)));
  check(!fontResponses.some((entry) => entry.url.startsWith('/assets/fonts/')), 'nothing is fetched from the unpublished /assets/fonts/');
  // Every family MathLive's own loader looks for is registered (faces load
  // when a glyph first needs them), and the main face has loaded.
  const faces = await page.evaluate(() => [...document.fonts].map((face) => ({ family: face.family.replace(/["']/g, ''), status: face.status })));
  const families = new Set(faces.map((face) => face.family));
  const needed = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', 'KaTeX_Caligraphic', 'KaTeX_Fraktur', 'KaTeX_SansSerif', 'KaTeX_Script', 'KaTeX_Typewriter', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4'];
  check(needed.every((family) => families.has(family)), 'every KaTeX family MathLive needs is registered', JSON.stringify(needed.filter((family) => !families.has(family))));
  check(faces.some((face) => face.family === 'KaTeX_Main' && face.status === 'loaded'), 'and the main face has loaded');
} finally {
  await browser.close();
  server.kill();
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} math font failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nmath fonts: a production build publishes the fonts its math fields draw with.');
