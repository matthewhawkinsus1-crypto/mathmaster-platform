import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SESSION_STATUS, proctorSessionStatus } from '../../src/platform/assessment/secureExamNavigationModel.js';
import { parseHexColor, relativeLuminance } from '../../src/theme/themeColorRoles.js';

// The live proctor monitor's Status column: a teacher reads words, never a
// stored code, and the colour is a theme token that keeps its contrast on the
// dark theme's rows (the fixed light-theme blue read 2.13:1 there).
const monitor = readFileSync('src/components/assessment/ProctorLiveMonitor.jsx', 'utf8');

test('every session status is said in a teacher\'s words', () => {
  const said = Object.fromEntries(Object.values(SESSION_STATUS).map((status) => [status, proctorSessionStatus(status).label]));
  assert.deepEqual(said, {
    not_started: 'Not started',
    in_progress: 'In progress',
    locked_proctor: 'Locked by a teacher',
    locked_integrity: 'Locked after leaving the test',
    submitted: 'Submitted',
    force_submitted: 'Submitted by a teacher',
    time_expired: 'Time ran out',
  });
  for (const [status, label] of Object.entries(said)) assert.doesNotMatch(label, /_/, `${status} is shown as words`);
  assert.equal(proctorSessionStatus('locked_proctor').tone, 'locked');
  assert.equal(proctorSessionStatus('locked_integrity').tone, 'locked');
  for (const status of ['submitted', 'force_submitted', 'time_expired']) assert.equal(proctorSessionStatus(status).tone, 'done');
  for (const status of ['not_started', 'in_progress']) assert.equal(proctorSessionStatus(status).tone, 'neutral');
});

test('a status the server adds later is shown as stored, not hidden', () => {
  assert.deepEqual(proctorSessionStatus('locked_device'), { status: 'locked_device', label: 'locked_device', tone: 'locked' });
  assert.deepEqual(proctorSessionStatus(''), { status: '', label: 'Unknown', tone: 'neutral' });
  assert.equal(proctorSessionStatus(undefined).label, 'Unknown');
});

test('the Status cell shows the words, keeps the stored code as data, and colours by tone', () => {
  assert.match(monitor, /const shown = proctorSessionStatus\(session\.status\);/);
  assert.match(monitor, /color: statusColor\(shown\.tone\), fontWeight: 800 \}\} data-proctor-status=\{shown\.status\}>\{shown\.label\}<\/td>/);
  assert.doesNotMatch(monitor, />\{session\.status\}</, 'the stored code is never the cell\'s text');
});

const palette = readFileSync('src/theme/tokens.css', 'utf8');
const definitions = (text) => Object.fromEntries([...text.matchAll(/(--mm-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const themes = {
  light: definitions(palette.slice(palette.indexOf(':root {'), palette.indexOf('@media screen'))),
  dark: definitions(palette.slice(palette.indexOf(":root[data-theme='dark'] {"))),
};
const resolve = (value, tokens) => value.replace(/var\((--mm-[\w-]+)\)/g, (_, name) => resolve(tokens[name], tokens));
const ratio = (a, b) => {
  const x = relativeLuminance(parseHexColor(a)); const y = relativeLuminance(parseHexColor(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('each tone is a theme token that reads at 4.5:1 or more on the rows, in both themes', () => {
  const block = monitor.slice(monitor.indexOf('const STATUS_TONE_COLOR'), monitor.indexOf('});', monitor.indexOf('const STATUS_TONE_COLOR')));
  const tones = Object.fromEntries([...block.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(tones).sort(), ['done', 'locked', 'neutral']);
  for (const [tone, color] of Object.entries(tones)) {
    assert.match(color, /^var\(--mm-[\w-]+\)$/, `${tone} is a token, not a fixed colour`);
    for (const [theme, tokens] of Object.entries(themes)) {
      for (const surface of ['--mm-surface', '--mm-page-bg']) {
        const text = resolve(color, tokens);
        const background = resolve(`var(${surface})`, tokens);
        const measured = ratio(text, background);
        assert.ok(measured >= 4.5, `${theme}: ${tone} (${text}) on ${surface} (${background}) is ${measured.toFixed(2)}:1`);
      }
    }
  }
});
