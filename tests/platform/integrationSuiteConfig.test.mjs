import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../../package.json'));
const script = pkg.scripts['test:challenge-finish'] || '';

test('the integration suite does not force the runner to exit', () => {
  // --test-force-exit was added to cure a CI hang and silently cut the suite
  // from 37 tests to 25 while still exiting 0: tests registered after a
  // top-level await are never seen. A flag that drops a third of the assertions
  // and reports success is worse than the hang it was meant to fix.
  assert.doesNotMatch(script, /--test-force-exit/);
});

test('the integration emulator does not share a port with the rules emulator', () => {
  // Both run in the same CI job, one after the other. Sharing 8181 means a slow
  // teardown leaves the second waiting on a port it can never get, which
  // presents as a job that hangs to its timeout with no useful output.
  const rulesPort = JSON.parse(read('../../firebase.json')).emulators?.firestore?.port;
  const harnessPort = JSON.parse(read('../browser/emulator/firebase.json')).emulators?.firestore?.port;
  assert.ok(rulesPort && harnessPort, 'both emulator ports must be pinned');
  assert.notEqual(harnessPort, rulesPort);
});

test('a hanging integration step fails fast instead of consuming the job', () => {
  const workflow = read('../../.github/workflows/full-platform-suite.yml');
  assert.match(
    workflow,
    /Run Live Challenge finish integration suite\s*\n\s*timeout-minutes: \d+/,
    'the step needs its own timeout so a hang is diagnosable',
  );
});

test('CI installs the functions dependencies the suite loads', () => {
  const workflow = read('../../.github/workflows/full-platform-suite.yml');
  assert.match(workflow, /npm --prefix functions ci/);
});
