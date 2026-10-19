/*
 * Student pass 3, the plan's A11Y-11 / A11Y-12 remainders and the Matrix
 * calculator's targets (FIGURE_DESCRIPTIONS "Not done"):
 *
 *   - a scroll the platform starts on Student Home, Grades and Graph Scenario
 *     Match glided even when the student's device asks for reduced motion;
 *   - directions named one device ("Click the grid", "Tap a card"), so a
 *     keyboard or touch student was told a gesture that is not theirs;
 *   - the Matrix calculator's Frac / Dec buttons were 36px tall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrollMotion } from '../../src/motionPreference.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('scrollMotion jumps for a student who asked for less motion, and glides otherwise', () => {
  const saved = globalThis.window;
  try {
    globalThis.window = { matchMedia: (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) };
    assert.equal(scrollMotion(), 'auto');
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(scrollMotion(), 'smooth');
  } finally {
    globalThis.window = saved;
  }
});

for (const [file, importPath, count] of [
  ['src/components/student/StudentDashboardView.jsx', '../../motionPreference.js', 1],
  ['src/components/student/StudentGradeCenter.jsx', '../../motionPreference.js', 1],
  ['src/GraphScenarioMatch.jsx', './motionPreference.js', 3],
]) {
  test(`${file}: every scroll it starts follows the reduced-motion preference`, () => {
    const source = executableSource(read(file));
    assert.doesNotMatch(source, /behavior:\s*['"]smooth['"]/, 'no scroll glides regardless of the preference');
    assert.equal((source.match(/behavior:\s*scrollMotion\(\)/g) || []).length, count, 'each scroll asks scrollMotion()');
    assert.match(source, new RegExp(`^import \\{ scrollMotion \\} from '${importPath.replace(/\./g, '\\.')}';$`, 'm'), 'and imports it');
  });
}

// Directions that name one pointing device as THE way.
const ONE_DEVICE = /(^|[.:;!?]\s*|['"`])(Click|Tap)\b(?! or (tap|click)\b)/;

test('the plotting, sorting and matching directions name no single device', () => {
  const graphing = region(executableSource(read('src/tools/graphing2/Graphing2.jsx')), '<TaskCard', '/>', 'Graphing 2 task card');
  const sort = region(executableSource(read('src/tools/openSortBoard/OpenSortBoard.jsx')), '<TaskCard', '/>', 'Open Sort task card');
  const match = executableSource(read('src/GraphScenarioMatch.jsx'));
  const lines = [
    ...[...graphing.matchAll(/'([^']+)'/g)].map((entry) => entry[1]),
    ...[...sort.matchAll(/'([^']+)'/g)].map((entry) => entry[1]),
    ...[...match.matchAll(/'((?:Click|Tap|Select)[^']*)'/g)].map((entry) => entry[1]),
  ];
  assert.ok(lines.some((line) => /plot a point/.test(line)), 'found the plotting step');
  assert.ok(lines.some((line) => /place it there/.test(line)), 'found the sorting step');
  assert.ok(lines.some((line) => /onto a scenario/.test(line)), 'found the matching direction');
  const oneDevice = lines.filter((line) => ONE_DEVICE.test(line));
  assert.deepEqual(oneDevice, []);
  // A placed card's tooltip, too.
  assert.doesNotMatch(executableSource(read('src/tools/openSortBoard/OpenSortBoard.jsx')), /title="Tap /);
});

test('the Matrix calculator\'s Frac / Dec buttons are at least 44px', () => {
  const view = region(executableSource(read('src/tools/matrixLab/MatrixCalculator.jsx')), 'aria-label="Show the result as"', '</div>', 'the result view buttons');
  const buttons = [...view.matchAll(/<button[\s\S]*?<\/button>/g)].map((entry) => entry[0]);
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    const height = Number(button.match(/minHeight: (\d+)/)?.[1]);
    const width = Number(button.match(/minWidth: (\d+)/)?.[1]);
    assert.ok(height >= 44 && width >= 44, `${button.slice(0, 120)}…: ${height}×${width}`);
  }
});
