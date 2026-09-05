import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/platform/referenceInformationHierarchy.test.mjs';
let source = await readFile(path, 'utf8');

const before = `  const referenceIndex = engine.indexOf('<ReferenceInfoCard referenceInfo={referenceInfo} />');
  const workspaceIndex = engine.indexOf('className="mathmaster-question-tool-workspace"');
  const guidedIndex = engine.indexOf('<GuidedClassworkCoach', workspaceIndex);
  assert.ok(referenceIndex > 0);
  assert.ok(workspaceIndex > referenceIndex);
  assert.ok(guidedIndex > workspaceIndex);`;

const after = `  const referenceIndex = engine.indexOf('<ReferenceInfoCard referenceInfo={referenceInfo} />');
  const workspaceIndex = engine.indexOf('className="mathmaster-question-tool-workspace"');
  const guidedDeclarationIndex = engine.indexOf('const guidedCoach = (');
  const guidedIndex = engine.indexOf('{!solverWorkspaceActive && guidedCoach}', workspaceIndex);
  assert.ok(referenceIndex > 0);
  assert.ok(workspaceIndex > referenceIndex);
  assert.ok(guidedDeclarationIndex > 0);
  assert.ok(guidedIndex > workspaceIndex);
  assert.match(engine, /const guidedCoach = \\([\\s\\S]*<GuidedClassworkCoach/);`;

if (!source.includes(before)) {
  throw new Error('Expected reference-information hierarchy assertion block was not found.');
}

source = source.replace(before, after);
await writeFile(path, source);
