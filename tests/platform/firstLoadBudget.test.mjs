/*
 * The student first-load budget (scripts/lib/firstLoadBudget.mjs,
 * scripts/check-first-load-budget.mjs): what a student downloads before the
 * sign-in screen and before Home, ratcheted against a checked-in baseline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ALLOWANCE_BYTES,
  baselineFrom,
  compareToBaseline,
  criticalPaths,
  measurePaths,
  staticClosure,
} from '../../scripts/lib/firstLoadBudget.mjs';

// A miniature Vite manifest: the entry loads the shell; App is a dynamic
// import with its own static graph; a teacher screen is a dynamic import of App.
const manifest = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_react.js', '_firebase.js'], dynamicImports: ['src/App.jsx'], css: ['assets/index.css'] },
  '_react.js': { file: 'assets/react.js' },
  '_firebase.js': { file: 'assets/firebase.js' },
  'src/App.jsx': { file: 'assets/App.js', isDynamicEntry: true, imports: ['_react.js', '_mathjs.js'], dynamicImports: ['src/TeacherHome.jsx'], css: ['assets/App.css'] },
  '_mathjs.js': { file: 'assets/mathjs.js', imports: ['_react.js'] },
  'src/TeacherHome.jsx': { file: 'assets/TeacherHome.js', isDynamicEntry: true, imports: ['_charts.js'] },
  '_charts.js': { file: 'assets/charts.js' },
};

test('a path follows static imports and their CSS, never a dynamic import', () => {
  assert.deepEqual([...staticClosure(manifest, ['index.html'])].sort(), ['assets/firebase.js', 'assets/index.css', 'assets/index.js', 'assets/react.js']);
  const paths = criticalPaths(manifest);
  assert.deepEqual(paths.signIn, ['assets/firebase.js', 'assets/index.css', 'assets/index.js', 'assets/react.js']);
  assert.ok(paths.studentHome.includes('assets/App.js') && paths.studentHome.includes('assets/mathjs.js') && paths.studentHome.includes('assets/App.css'));
  assert.ok(!paths.studentHome.includes('assets/TeacherHome.js') && !paths.studentHome.includes('assets/charts.js'), 'a lazily loaded teacher screen is not on a student path');
  // The student app's chunk renamed or gone: the budget fails, never measures
  // Home as sign-in alone ("below baseline").
  const renamed = { ...manifest };
  delete renamed['src/App.jsx'];
  assert.throws(() => criticalPaths(renamed), /no chunk for src\/App\.jsx/);
});

test('the ratchet fails growth past the allowance and a path with no baseline, and passes a reduction', () => {
  const measured = measurePaths({ signIn: ['a', 'b'], studentHome: ['a', 'b', 'c'] }, (file) => ({ a: 1000, b: 2000, c: 50_000 })[file]);
  assert.deepEqual(measured, { signIn: { bytes: 3000, files: 2 }, studentHome: { bytes: 53_000, files: 3 } });
  const baseline = baselineFrom(measured);
  assert.equal(baseline.allowanceBytes, DEFAULT_ALLOWANCE_BYTES);
  assert.equal(compareToBaseline({ measured, baseline }).ok, true);
  const grown = { ...measured, signIn: { bytes: 3000 + DEFAULT_ALLOWANCE_BYTES + 1, files: 3 } };
  const over = compareToBaseline({ measured: grown, baseline });
  assert.equal(over.ok, false);
  assert.equal(over.over[0].name, 'signIn');
  const within = { ...measured, signIn: { bytes: 3000 + DEFAULT_ALLOWANCE_BYTES, files: 3 } };
  assert.equal(compareToBaseline({ measured: within, baseline }).ok, true, 'ordinary growth inside the allowance passes');
  const smaller = compareToBaseline({ measured: { ...measured, studentHome: { bytes: 40_000, files: 3 } }, baseline });
  assert.equal(smaller.ok, true);
  assert.equal(smaller.reduced[0].name, 'studentHome');
  assert.equal(compareToBaseline({ measured: { ...measured, newPath: { bytes: 1, files: 1 } }, baseline }).ok, false, 'a path with no baseline fails');
});

test('the checked-in baseline holds the measured split, and CI checks it after the production build', () => {
  const baseline = JSON.parse(readFileSync(new URL('../../scripts/first-load-baseline.json', import.meta.url), 'utf8'));
  assert.ok(baseline.paths.signIn.bytes > 0 && baseline.paths.studentHome.bytes > 0);
  // The point of the shell: the sign-in screen is a fraction of the app. Measured
  // 1,406 KB gzip for both before src/app/shell/AppShell.jsx; ~288 KB after.
  assert.ok(baseline.paths.signIn.bytes < 400 * 1024, `sign-in baseline ${baseline.paths.signIn.bytes} B — the app is back on the sign-in path`);
  assert.ok(baseline.paths.signIn.bytes * 3 < baseline.paths.studentHome.bytes);
  const workflow = readFileSync(new URL('../../.github/workflows/full-platform-suite.yml', import.meta.url), 'utf8');
  const build = workflow.indexOf('run: npm run build\n');
  const budget = workflow.indexOf('run: node scripts/check-first-load-budget.mjs');
  assert.ok(build > 0 && budget > build, 'the budget runs after the production build in CI');
  const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  assert.match(vite, /build: \{ manifest: true \}/, 'the budget reads dist/.vite/manifest.json');
  const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
  assert.ok(firebase.hosting.ignore.includes('**/.*'), 'the manifest (dist/.vite) is never deployed');
});
