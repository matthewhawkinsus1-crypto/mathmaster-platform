// Who watches the nightly (student pass 3, wave 7 decision 23; the owner,
// 2026-10-20).
//
// GitHub mails a scheduled run's failure only to whoever last edited its cron
// line. nightly-failure-issue.yml opens (or comments on) an issue when a
// scheduled run fails, and closes it when one passes again. This keeps it
// watching every scheduled workflow, under its exact name, with the issue
// rights it needs and nothing more.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const DIR = new URL('../../.github/workflows/', import.meta.url);
const read = (name) => readFileSync(new URL(name, DIR), 'utf8');
const WATCHER = 'nightly-failure-issue.yml';
const watcher = read(WATCHER);

/** The `on:` block of a workflow (up to the next top-level key). */
const triggersOf = (text) => (text.match(/^on:\s*\n((?:[ #].*\n|\s*\n)*)/m) || [])[1] || '';
const nameOf = (text) => (text.match(/^name:\s*["']?(.+?)["']?\s*$/m) || [])[1] || null;

/** The workflows the watcher lists under `workflow_run.workflows`. */
const watched = () => {
  const block = (watcher.match(/workflow_run:\s*\n\s+workflows:\s*\n((?:\s+- .*\n)+)/) || [])[1] || '';
  return [...block.matchAll(/- "([^"]+)"/g)].map((match) => match[1]);
};

const scheduled = () => readdirSync(DIR)
  .filter((file) => /\.ya?ml$/.test(file) && file !== WATCHER)
  .map((file) => ({ file, text: read(file) }))
  .filter(({ text }) => /^\s+schedule:\s*$/m.test(triggersOf(text)));

test('every scheduled workflow is watched, by its exact name', () => {
  const names = watched();
  const nightly = scheduled();
  assert.ok(nightly.length >= 3, `found the scheduled workflows (${nightly.map(({ file }) => file).join(', ')})`);
  for (const { file, text } of nightly) {
    assert.ok(names.includes(nameOf(text)), `${file} ("${nameOf(text)}") runs on a schedule and is watched`);
  }
});

test('every watched name is a workflow that runs on a schedule (a renamed one is never silently dropped)', () => {
  const byName = new Map(scheduled().map(({ file, text }) => [nameOf(text), file]));
  for (const name of watched()) assert.ok(byName.has(name), `"${name}" names a scheduled workflow`);
});

test('the watcher reports only scheduled runs, with issue rights and nothing more', () => {
  const triggers = triggersOf(watcher);
  assert.match(triggers, /workflow_run:/);
  assert.match(triggers, /types:\s*\[completed\]/);
  assert.doesNotMatch(triggers, /pull_request|push:|schedule:/, 'triggered only by a finished run');
  assert.match(watcher, /if: github\.event\.workflow_run\.event == 'schedule'/);
  const permissions = (watcher.match(/^permissions:\s*\n((?: {2}.*\n)+)/m) || [])[1] || '';
  assert.deepEqual(permissions.trim().split('\n').map((line) => line.trim()).sort(), ['actions: read', 'issues: write']);
  assert.doesNotMatch(watcher, /actions\/checkout|actions\/download-artifact/, 'never runs or reads the run\'s code');
});

test('a failure opens or comments on one issue per workflow; a pass closes it; a cancelled run does nothing', () => {
  const script = watcher.slice(watcher.indexOf('run: |'));
  assert.match(script, /title="Nightly failed: \$\{WORKFLOW\}"/);
  assert.match(script, /failure\|timed_out\|startup_failure\)/);
  assert.match(script, /gh issue comment "\$number"/);
  assert.match(script, /gh issue create --repo "\$REPO" --title "\$title" --label "\$label"/);
  assert.match(script, /success\)\s*\n\s*number="\$\(open_issue\)"[\s\S]*gh issue close "\$number"/);
  // The event's text reaches the script only through env, never as ${{ }}
  // inside the script (a workflow or branch name is not shell code).
  assert.doesNotMatch(script, /\$\{\{/);
  assert.match(watcher, /concurrency:\s*\n\s+group: nightly-failure-issue-\$\{\{ github\.event\.workflow_run\.workflow_id \}\}\s*\n\s+cancel-in-progress: false/);
});
