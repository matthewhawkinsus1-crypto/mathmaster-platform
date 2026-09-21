import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// functions/ deploys as its own package (firebase.json source: "functions"
// only) and cannot import src/, so the authoritative V5 question-type
// contract used to validate a Teacher Question Repair candidate server-side
// (functions/lib/teacherQuestionRepair.js) is necessarily a duplication of
// the same contract src/platform/contract/questionTypeCatalog.js exposes to
// the AI authoring prompt and the browser Preflight validator. These are the
// drift guards: if either copy changes without the other, a repair could
// pass server validation against rules the client no longer enforces, or
// reject a candidate the client would accept.
const stripImports = (source) => source
  .split('\n')
  .filter((line) => !line.trim().startsWith('import '))
  .join('\n');

test('functions/shared/analysisRequestCatalog.mjs is byte-identical to its src/ original', async () => {
  const [clientSource, serverSource] = await Promise.all([
    readFile('src/analysisRequestCatalog.js', 'utf8'),
    readFile('functions/shared/analysisRequestCatalog.mjs', 'utf8'),
  ]);
  assert.equal(serverSource, clientSource);
});

test('functions/shared/questionRecipes.mjs is byte-identical to its src/ original', async () => {
  const [clientSource, serverSource] = await Promise.all([
    readFile('src/platform/workflow/questionRecipes.js', 'utf8'),
    readFile('functions/shared/questionRecipes.mjs', 'utf8'),
  ]);
  assert.equal(serverSource, clientSource);
});

test('functions/shared/questionTypeCatalog.mjs matches its src/ original except for the two import paths', async () => {
  const [clientSource, serverSource] = await Promise.all([
    readFile('src/platform/contract/questionTypeCatalog.js', 'utf8'),
    readFile('functions/shared/questionTypeCatalog.mjs', 'utf8'),
  ]);
  assert.equal(stripImports(serverSource), stripImports(clientSource));
  assert.match(serverSource, /from '\.\/analysisRequestCatalog\.mjs'/);
  assert.match(serverSource, /from '\.\/questionRecipes\.mjs'/);
});

test('the authoritative catalog actually has real required-field rules, not just type names', async () => {
  const catalog = await import('../../functions/shared/questionTypeCatalog.mjs');
  const entry = catalog.getTypeEntry('relationshipModel');
  assert.ok(entry);
  assert.ok(entry.required.length > 0);
  assert.equal(typeof entry.validate, 'function');
});
