/*
 * FORCED COLOURS CERTIFICATION: THE CERTIFIED SCENES UNDER WINDOWS' CONTRAST THEMES.
 *
 *   npx vite --config tests/browser/forcedColors.vite.config.mjs --host 127.0.0.1 --port 5198 --strictPort &   # stubbed standalone harnesses
 *   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &                                          # the real app, in memory
 *   node tests/browser/forcedColorsCertification.mjs      # exits 1 on any finding
 *
 *   AUDIT_ORIGIN (default http://127.0.0.1:5198: the stubbed harness server, as
 *   the accessibility certification needs it, under a cache of its own:
 *   forcedColors.vite.config.mjs), TEACHER_HARNESS_ORIGIN (default
 *   http://127.0.0.1:5188), ONLY=<screen id>[,...], PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH, FORCED_COLORS_ARTIFACTS for report.json (default
 *   tests/browser/artifacts/forcedColors, git-ignored).
 *
 * WHY. Students with low vision use Windows' contrast themes on school laptops.
 * The browser then draws every page in the theme's system colours: no
 * background but Canvas, no box-shadow, no gradient. A filled button lost its
 * edge, the page a student was on looked like every other in the navigation,
 * and nothing checked it (src/theme/forcedColors.css gives these back).
 *
 * WHAT. Every certified scene (accessibilityCertification.mjs: the student
 * screens, the exam-practice chip, the teacher's) and the rounds' own screens,
 * a Graph Feature Rush and a Graph the Line round in the student's arena
 * (LIVE_CHALLENGE_ROUND_SCREENS, which the large-text runs measure), at
 * 1366x768 and 390x844 with touch, read under forced colours in a dark contrast
 * theme and in a light one by tests/browser/forcedColorsAudit.mjs, judged by
 * scripts/lib/forcedColors.mjs. A run that names no screen leaves out the Math
 * Tools Lab's 24 tools and the Work Views they open (`ownJob` screens), as the
 * certification does: the theme job reads them in a step of its own
 * (ONLY=teacher-math-tools-lab,teacher-math-tools-lab-work-view). It fails:
 *
 *   mm-forced-focus-not-drawn     a Tab stop that, focused as a keyboard focuses
 *                                 it, shows nothing (a box-shadow ring, a
 *                                 background, an outline set to none)
 *   mm-forced-state-colour-only   a selected, pressed, checked or current control
 *                                 that looks the same as one of its kind that is
 *                                 not (its state was only a colour or a background)
 *   mm-forced-edge-lost           a control whose edge was its fill, gradient or
 *                                 shadow and has no border or outline left
 *   mm-forced-math-colour-kept    a formula not drawn in the colour the theme
 *                                 gives the text around it (one the switch to
 *                                 the light theme left white on its white page)
 *
 * HOW. Chromium draws forced colours when Playwright emulates them, and a
 * contrast theme sets prefers-color-scheme from its Canvas, as Windows tells
 * Chromium: `forcedColors: 'active'` with `colorScheme` 'dark' stands for a dark
 * contrast theme, 'light' for a light one. Each screen is opened once per
 * viewport under forced colours on a device in its dark contrast theme, and each
 * scene is driven there as the certification drives it; then the scene is read,
 * the device is switched to its light contrast theme (a standalone harness,
 * which does not follow the device, is put in the light theme with it, as the
 * contrast review puts one in the dark), read again, and switched back before
 * the next scene is driven. The palette is the device's, so the second reading
 * is of the light theme throughout. A reading focuses every Tab stop and blurs
 * it again, so what focus opens and leaves open (a phone's math keypad) is read
 * by the next reading too.
 *
 * tests/browser/forcedColorsSelfTest.mjs shows each rule finding a planted
 * defect, and passing its fixed twin, on pages written there.
 *
 * NOTHING LEAVES LOCALHOST: every context aborts non-local requests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { settleForAudit } from './accessibilityAudit.mjs';
import {
  CERTIFIED_SCREENS, LIVE_CHALLENGE_ROUND_SCREENS, STUBBED_PROBE, VIEWPORTS, newScreenContext, sceneLabel, sceneScope, screensToRun,
  servesStubbedServices,
} from './accessibilityCertification.mjs';
import { auditForcedColors } from './forcedColorsAudit.mjs';
import { FORCED_COLORS_RULE_IDS } from '../../scripts/lib/forcedColors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// The dark contrast theme first: the scene is driven in it, then read in both.
export const CONTRAST_THEMES = Object.freeze(['dark', 'light']);

// What the walk reads: the certified screens and the rounds' own (the student's arena in a Graph Feature Rush and a
// Graph the Line round, the rounds' certified scenes that are not axe's: the large-text runs measure them).
export const WALKED_SCREENS = Object.freeze([...CERTIFIED_SCREENS, ...LIVE_CHALLENGE_ROUND_SCREENS]);

/** The screens a run walks: those ONLY names, or every one of WALKED_SCREENS but those with a job of their own. */
export const screensToWalk = (only) => {
  const unknown = [...only].filter((id) => !WALKED_SCREENS.some((screen) => screen.id === id));
  if (unknown.length) throw new Error(`ONLY names unknown screen(s): ${unknown.join(', ')}`);
  return screensToRun(only, WALKED_SCREENS);
};

// A standalone harness does not follow the device: it is put in the theme the
// device is in, as the contrast review puts it (and the app puts itself).
const THEME_FROM_DEVICE = (scheme) => {
  document.documentElement.dataset.theme = scheme;
  document.documentElement.style.colorScheme = scheme;
  window.dispatchEvent(new CustomEvent('mathmasterthemechange', { detail: { theme: scheme } }));
};

/** The device switched to a contrast theme, the page following it. */
export const useContrastTheme = async (page, screen, scheme) => {
  await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme });
  if (screen.harness !== 'app') await page.evaluate(THEME_FROM_DEVICE, scheme);
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
};

const main = async () => {
  const ONLY = new Set(String(process.env.ONLY || '').split(',').map((entry) => entry.trim()).filter(Boolean));
  const screens = screensToWalk(ONLY);
  const origins = {
    app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
    audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5198',
  };
  // The standalone scenes need the stubbed services (the secure exam never opens
  // on a plain server): say so, rather than report a scene that never opened.
  if (screens.some((screen) => screen.harness === 'audit')) {
    const probe = await fetch(`${origins.audit}${STUBBED_PROBE}`).then((response) => response.text()).catch(() => '');
    if (!servesStubbedServices(probe)) {
      throw new Error(`${origins.audit} is not the stubbed harness server: start tests/browser/forcedColors.vite.config.mjs there (see theme-certification.yml).`);
    }
  }
  const artifacts = process.env.FORCED_COLORS_ARTIFACTS || path.join(repo, 'tests/browser/artifacts/forcedColors');
  mkdirSync(artifacts, { recursive: true });

  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);

  const results = [];
  const unreachable = [];
  const started = Date.now();
  for (const viewport of VIEWPORTS) {
    for (const screen of screens) {
      const [first] = CONTRAST_THEMES;
      const context = await newScreenContext(browser, screen, {
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.isMobile), hasTouch: Boolean(viewport.hasTouch),
        colorScheme: first, forcedColors: 'active', reducedMotion: 'reduce',
      });
      // A standalone harness in the dark theme before its first paint, as the
      // contrast review opens it on a dark device.
      if (screen.harness !== 'app') {
        await context.addInitScript((scheme) => {
          const apply = () => { document.documentElement.dataset.theme = scheme; document.documentElement.style.colorScheme = scheme; };
          if (document.documentElement) apply();
          else new MutationObserver((_, observer) => { if (document.documentElement) { apply(); observer.disconnect(); } }).observe(document, { childList: true });
        }, first);
      }
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      let firstScene = true;
      try {
        if (screen.open) await screen.open(page, origins);
      } catch (error) {
        unreachable.push(`${screen.id}|${viewport.id}: could not open: ${error.message.split('\n')[0]}`);
        await context.close();
        continue;
      }
      for (const scene of screen.scenes) {
        const label = sceneLabel(screen, scene);
        try {
          await scene.run(page, origins, { first: firstScene });
          firstScene = false;
          await settleForAudit(page);
        } catch (error) {
          unreachable.push(`${label}|${viewport.id}: could not reach the scene: ${error.message.split('\n')[0]}`);
          break;
        }
        const scope = sceneScope(screen, scene);
        for (const scheme of CONTRAST_THEMES) {
          await useContrastTheme(page, screen, scheme);
          const key = `${viewport.id}/${scheme}`;
          try {
            const result = await auditForcedColors(page, { name: label, viewport: key, include: scope.include, exclude: scope.exclude });
            results.push({ label, viewport: viewport.id, scheme, counts: result.counts, details: result.details, summary: result.summary });
            const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
            console.log(`${total ? 'FAIL' : 'ok  '} ${label.padEnd(40)} ${viewport.id.padEnd(8)} ${scheme.padEnd(6)} ${result.summary.controls} controls, ${result.summary.statesCompared} states, ${result.summary.stops} stops, ${result.summary.formulas} formulas${total ? `: ${total} finding(s)` : ''}`);
          } catch (error) {
            unreachable.push(`${label}|${key}: the forced-colours reading failed: ${error.message.split('\n')[0]}`);
          }
        }
        // Back to the theme the next scene is driven in.
        await useContrastTheme(page, screen, first);
      }
      await context.close();
    }
  }
  await browser.close();

  const failures = results.filter((result) => Object.keys(result.counts).length);
  const report = {
    generatedBy: 'tests/browser/forcedColorsCertification.mjs',
    rules: FORCED_COLORS_RULE_IDS,
    viewports: VIEWPORTS,
    contrastThemes: CONTRAST_THEMES,
    screens: screens.map((screen) => ({ id: screen.id, scenes: screen.scenes.map((scene) => sceneLabel(screen, scene)) })),
    unreachable,
    seconds: Math.round((Date.now() - started) / 1000),
    results,
  };
  writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const readings = results.length;
  console.log(`\n${readings} reading(s) of ${screens.reduce((sum, screen) => sum + screen.scenes.length, 0)} scene(s) at ${VIEWPORTS.length} viewport(s) in ${CONTRAST_THEMES.length} contrast themes, ${report.seconds}s.`);
  if (failures.length) {
    console.error(`\n${failures.length} reading(s) under forced colours with findings (src/theme/forcedColors.css is where the platform gives back what forced colours take):`);
    for (const failure of failures) {
      for (const detail of Object.values(failure.details)) {
        console.error(`  ${failure.label}|${failure.viewport}|${failure.scheme} ${detail.ruleId}: ${detail.help}`);
        detail.examples.forEach((example) => console.error(`      ${example.target}\n        ${example.summary}`));
      }
    }
  }
  if (unreachable.length) {
    console.error(`\n${unreachable.length} scene(s) could not be read:\n  ${unreachable.join('\n  ')}`);
  }
  if (failures.length || unreachable.length) {
    console.error(`\nForced colours certification FAILED. Report: ${path.relative(repo, path.join(artifacts, 'report.json'))}`);
    process.exitCode = 1;
  } else {
    console.log(`Forced colours certification passed. Report: ${path.relative(repo, path.join(artifacts, 'report.json'))}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
