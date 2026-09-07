import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * The handoff document is the map someone reads before touching this
 * workspace — which file owns which concern, which commands to run, what the
 * deploy needs. A map is only worth keeping if it is true, and nothing about
 * renaming a file makes prose follow it. These two checks are the cheapest
 * thing that stops the document from confidently pointing at code that moved.
 *
 * They deliberately check only what can be checked mechanically. The prose
 * about student safety and override eligibility is guarded by the tests that
 * cover those behaviours, not by this one.
 */

const repoFile = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const DOC = 'docs/plans/2026-09-07-question-review-repair-workspace.md';
const doc = readFileSync(repoFile(DOC), 'utf8');

test('every source file the handoff document points at still exists', () => {
  const referenced = [...doc.matchAll(/`((?:src|tests|functions|scripts)\/[A-Za-z0-9_./-]+)`/g)]
    .map((match) => match[1]);

  assert.ok(referenced.length >= 12, `expected the document to map the workspace's files, found ${referenced.length}`);

  const missing = referenced.filter((relative) => !existsSync(repoFile(relative)));
  assert.deepEqual(
    missing,
    [],
    `${DOC} points at files that do not exist. Update the document alongside the rename: ${missing.join(', ')}`,
  );
});

test('every command the handoff document tells you to run is a real npm script', () => {
  const pkg = JSON.parse(readFileSync(repoFile('package.json'), 'utf8'));
  const referenced = [...doc.matchAll(/npm run ([a-z0-9:-]+)/g)].map((match) => match[1]);

  assert.ok(referenced.length >= 4, `expected the document to list the verification commands, found ${referenced.length}`);

  const unknown = referenced.filter((name) => !pkg.scripts?.[name]);
  assert.deepEqual(
    unknown,
    [],
    `${DOC} tells a reader to run npm scripts that do not exist: ${unknown.join(', ')}`,
  );
});
