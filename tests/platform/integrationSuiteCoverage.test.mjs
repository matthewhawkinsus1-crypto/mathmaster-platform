// Every integration suite runs in CI. Each file under tests/integration is
// matched by the test pattern of an npm script that a workflow step runs, so
// moving a suite into its own folder (and its own emulator) cannot quietly take
// it out of CI. The Live Challenge launch certification keeps an emulator to
// itself: the parallel suites' load failed its class-scale budgets and waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { scripts } = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
const workflowDir = path.join(repo, '.github/workflows');
const workflows = readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).map((name) => readFileSync(path.join(workflowDir, name), 'utf8')).join('\n');
const runInCi = new Set([...workflows.matchAll(/npm run ([\w:.-]+)/g)].map((match) => match[1]));

// `*` stays inside one folder, `**/` spans any number of folders (none
// included), as node --test reads them.
const escape = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const globPattern = (glob) => new RegExp(`^${glob.split('**/').map((part) => part.split('*').map(escape).join('[^/]*')).join('(?:.*/)?')}$`);
const suites = Object.entries(scripts)
  .map(([name, command]) => ({ name, patterns: (command.match(/tests\/integration\/[^\s"'\\]+\.test\.mjs/g) || []).map(globPattern) }))
  .filter((suite) => suite.patterns.length);
const runnersOf = (file) => suites.filter((suite) => suite.patterns.some((pattern) => pattern.test(file))).map((suite) => suite.name);

const files = readdirSync(path.join(repo, 'tests/integration'), { recursive: true })
  .map((file) => String(file).split(path.sep).join('/'))
  .filter((file) => file.endsWith('.test.mjs'))
  .map((file) => `tests/integration/${file}`);

test('every integration suite file is run by an npm script that CI runs', () => {
  assert.ok(files.length >= 20, `found ${files.length} integration suite files`);
  for (const file of files) {
    const runners = runnersOf(file);
    assert.ok(runners.length, `${file} is run by no npm script`);
    assert.ok(runners.some((name) => runInCi.has(name)), `${file} is run only by ${runners.join(', ')}, which no workflow step runs`);
  }
});

test('the Live Challenge launch certification has an emulator to itself', () => {
  const certification = 'tests/integration/liveChallengeLaunch/liveChallengeLaunchCertification.test.mjs';
  assert.ok(files.includes(certification), `${certification} exists`);
  assert.deepEqual(runnersOf(certification), ['test:live-challenge-launch:emulator'], 'no shared integration run includes it');
  const shared = files.filter((file) => !file.startsWith('tests/integration/liveChallengeLaunch/') && runnersOf(file).includes('test:live-challenge-launch:emulator'));
  assert.deepEqual(shared, [], 'its run includes no other suite');
  assert.match(scripts['test:live-challenge-launch:emulator'], /^firebase emulators:exec --only firestore /, 'it starts its own emulator');
});
