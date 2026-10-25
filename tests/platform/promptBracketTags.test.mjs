/*
 * NO AUTHORING TAG IN A STUDENT'S TASK (CT16).
 *
 * Two Honors lessons began a task with "[College-Readiness — SAT style]" /
 * "[College-Readiness — ACT style]", and the 3×3 systems Day 2 files with
 * "[College-Readiness / Honors Transfer]": a note to the author, read by the
 * student as part of the question (and by Read aloud). Nothing reads the tag;
 * the item's framework lives in its metadata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const jsonFiles = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(join(root, path)).isDirectory()) return jsonFiles(path);
  return name.endsWith('.json') ? [path] : [];
});
const TAG = /^\s*\[[^\]$]{3,60}\]\s/;

test('no lesson task starts with a bracketed authoring tag', () => {
  const tagged = [];
  for (const file of [...jsonFiles('teacher-import-jsons'), ...jsonFiles('docs/assignments')]) {
    let data;
    try { data = JSON.parse(readFileSync(join(root, file), 'utf8')); } catch { continue; }
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (['prompt', 'task', 'stem'].includes(key) && typeof value === 'string' && TAG.test(value)) tagged.push(`${file}: ${value.slice(0, 60)}`);
        walk(value);
      }
    };
    walk(data);
  }
  assert.deepEqual(tagged, []);
});
