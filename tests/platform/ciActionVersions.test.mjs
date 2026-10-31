/*
 * ONE VERSION OF EACH ACTION (CI18).
 *
 * The workflows were updated together (actions/checkout and
 * actions/setup-node to v6, from v4, whose Node 20 runtime GitHub retires).
 * A workflow left on another major would run differently from the rest, so
 * every use of an action names the same major.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const files = (dir) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? files(`${dir}${entry.name}/`) : /\.ya?ml$/.test(entry.name) ? [`${dir}${entry.name}`] : []
));

test('every use of an action names the same major, and checkout and setup-node are on v6', () => {
  const majors = {};
  for (const file of files('../../.github/')) {
    for (const [, action, major] of readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/uses:\s*([\w.-]+\/[\w./-]+)@(v\d+)\b/g)) {
      (majors[action] ||= new Set()).add(major);
    }
  }
  assert.ok(Object.keys(majors).length >= 3, Object.keys(majors).join(', '));
  for (const [action, versions] of Object.entries(majors)) assert.equal(versions.size, 1, `${action} is used at ${[...versions].join(' and ')}`);
  assert.deepEqual([...majors['actions/checkout']], ['v6']);
  assert.deepEqual([...majors['actions/setup-node']], ['v6']);
});
