/*
 * EVERY BROWSER ON THE TEACHER HARNESS RUNS ON THE SCHOOL'S CLOCK.
 *
 * The harness fixture builds the bell schedule from the browser's clock:
 * Period 3 begins now and ends 50 minutes later, unless that is past
 * midnight, when its end is clamped to 23:55. On CI's clock (UTC), from about
 * 23:05 the exit ticket therefore opened and, from 23:55, the period had
 * ended. CI's run on 6ac578ed met both at 23:40 to 23:59: the 2.4.11 walk and
 * the contrast review found the exit ticket's "open — start now" reminder over
 * a phone's navigation, and the private controls journeys could not finish a
 * DOL step. teacherWorkflow/schoolClock.mjs puts a browser on a school morning
 * (Wednesday 11:00 in Chicago), whatever the hour on the runner.
 *
 * So every driver that opens the harness makes its contexts there: with
 * newSchoolContext, or through accessibilityCertification.mjs's
 * newScreenContext, which puts every app-harness screen there. A driver that
 * sets its own clock says so below, with its reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const browserDir = path.join(repo, 'tests/browser');

const OWN_CLOCK = {
  // It sets the page's clock itself and moves it on, to pass a Warm-Up's close.
  'tests/browser/teacherWorkflow/warmupReopenJourneys.mjs': /clock\.(install|setSystemTime|setFixedTime|fastForward|runFor)/,
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const file = path.join(dir, name);
  if (name === 'node_modules' || name === 'artifacts') return [];
  return statSync(file).isDirectory() ? walk(file) : [file];
});

const drivers = walk(browserDir)
  .filter((file) => file.endsWith('.mjs') && !file.endsWith('.config.mjs'))
  .map((file) => ({ file, rel: path.relative(repo, file), source: readFileSync(file, 'utf8') }))
  // A driver that opens the harness page in a browser it launches (a module of
  // screen definitions, such as accessibilityTeacherScreens.mjs, launches none).
  .filter(({ source }) => /teacherWorkflow\/index\.html/.test(source) && /chromium\.launch\(|\.newContext\(/.test(source));

test('the drivers that open the teacher harness are found', () => {
  assert.ok(drivers.length >= 25, `found ${drivers.length}`);
  for (const rel of ['tests/browser/teacherWorkflow/privateControlsJourneys.mjs', 'tests/browser/teacherWorkflow/walkthroughJourneys.mjs', 'tests/browser/accessibilityCertification.mjs']) {
    assert.ok(drivers.some((driver) => driver.rel === rel), `${rel} is one of them`);
  }
});

test('each makes its browser contexts on the school clock, or sets its own and says why', () => {
  for (const { rel, source } of drivers) {
    if (OWN_CLOCK[rel]) {
      assert.match(source, OWN_CLOCK[rel], `${rel} sets its own clock`);
      continue;
    }
    const onSchoolClock = /from '(\.\/|\.\/teacherWorkflow\/|\.\.\/teacherWorkflow\/)schoolClock\.mjs'/.test(source)
      || /\bnewScreenContext\(/.test(source);
    assert.ok(onSchoolClock, `${rel} opens the teacher harness with no school clock (use newSchoolContext from teacherWorkflow/schoolClock.mjs)`);
  }
});

test('the school clock is a school morning in the school\'s zone, whatever the hour on the runner', async () => {
  const { schoolMorningBefore, SCHOOL_TIME_ZONE } = await import('../browser/teacherWorkflow/schoolClock.mjs');
  assert.equal(SCHOOL_TIME_ZONE, 'America/Chicago');
  // 23:50 UTC, when the browser's own clock had Period 3 clamped to end by 23:55.
  const lateUtc = Date.parse('2026-11-07T23:50:00Z');
  const morning = schoolMorningBefore(lateUtc);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: SCHOOL_TIME_ZONE, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' })
    .formatToParts(morning).map(({ type, value }) => [type, value]));
  assert.deepEqual([parts.weekday, parts.hour, parts.minute], ['Wed', '11', '00']);
  assert.ok(morning <= lateUtc, 'never ahead of the runner');
});
