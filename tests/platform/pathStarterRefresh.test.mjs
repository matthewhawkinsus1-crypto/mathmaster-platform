import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const functionsIndex = fs.readFileSync(path.join(repoRoot, 'functions/index.js'), 'utf8');
const releaseSource = fs.readFileSync(path.join(repoRoot, 'src/platform/path/pathRelease.js'), 'utf8');

const seedFiles = [
  'algebra1_pathQuestionBank_seed.json',
  'algebra2_pathQuestionBank_seed.json',
  'grade6_pathQuestionBank_seed.json',
  'grade7_pathQuestionBank_seed.json',
  'grade8_pathQuestionBank_seed.json',
  'digitalSAT_pathQuestionBank_seed.json',
  'act_pathQuestionBank_seed.json',
  'tsia2_pathQuestionBank_seed.json',
  'asvab_pathQuestionBank_seed.json',
];

const seedCount = seedFiles.reduce((total, fileName) => {
  const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'functions/seeds/pathQuestionBank', fileName), 'utf8'));
  const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  return total + items.length;
}, 0);

test('built-in Path initializer accepts the production bank even when it exceeds the custom-call limit', () => {
  assert.ok(seedCount > 600, `fixture should exercise a built-in bank larger than 600 items; got ${seedCount}`);
  assert.doesNotMatch(functionsIndex, /built-in starter bank exceeds the supported one-click import size/i);
  assert.match(functionsIndex, /items:\s*taggedItems/);
  assert.match(functionsIndex, /processPathSeedImport[\s\S]*items:\s*taggedItems/);
});

test('refresh retires only superseded bundled starter records and leaves custom Path content alone', () => {
  assert.match(functionsIndex, /BUILT_IN_PATH_SEED_MARKER/);
  assert.match(functionsIndex, /LEGACY_BUILT_IN_PATH_SEED_SOURCE/);
  assert.match(functionsIndex, /removeSupersededBuiltInPathSeedRecords/);
  assert.match(functionsIndex, /data\.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER/);
  assert.match(functionsIndex, /data\?\.seedMetadata\?\.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE/);
  assert.doesNotMatch(functionsIndex, /doc\.id\.startsWith\(["']seed_/);
});

test('web and server advertise the same refreshed Path release', () => {
  const serverRelease = functionsIndex.match(/const PATH_RUNTIME_RELEASE = "([^"]+)";/)?.[1];
  const webRelease = releaseSource.match(/PATH_WEB_RELEASE = '([^']+)'/)?.[1];
  assert.ok(serverRelease);
  assert.equal(webRelease, serverRelease);
});
