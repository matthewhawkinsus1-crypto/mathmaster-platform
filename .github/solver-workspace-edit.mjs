import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/platform/referenceInformationHierarchy.test.mjs';
let source = await readFile(path, 'utf8');

const hierarchyBefore = `  const referenceIndex = engine.indexOf('<ReferenceInfoCard referenceInfo={referenceInfo} />');
  const workspaceIndex = engine.indexOf('className="mathmaster-question-tool-workspace"');
  const guidedIndex = engine.indexOf('<GuidedClassworkCoach', workspaceIndex);
  assert.ok(referenceIndex > 0);
  assert.ok(workspaceIndex > referenceIndex);
  assert.ok(guidedIndex > workspaceIndex);`;

const hierarchyAfter = `  const referenceIndex = engine.indexOf('<ReferenceInfoCard referenceInfo={referenceInfo} />');
  const workspaceIndex = engine.indexOf('className="mathmaster-question-tool-workspace"');
  const guidedDeclarationIndex = engine.indexOf('const guidedCoach = (');
  const guidedIndex = engine.indexOf('{!solverWorkspaceActive && guidedCoach}', workspaceIndex);
  assert.ok(referenceIndex > 0);
  assert.ok(workspaceIndex > referenceIndex);
  assert.ok(guidedDeclarationIndex > 0);
  assert.ok(guidedIndex > workspaceIndex);
  assert.match(engine, /const guidedCoach = \\([\\s\\S]*<GuidedClassworkCoach/);`;

const contextBefore = `  assert.match(viewport, /\\{contextPanel\\}[\\s\\S]*<main className="math-tool-workspace">/, 'attempt/tools context remains outside the task anchor');`;
const contextAfter = `  assert.match(viewport, /\\{!workspaceActive && contextPanel\\}[\\s\\S]*<main className="math-tool-workspace">/, 'attempt/tools context remains outside the task anchor in normal mode and is suppressed in solver workspace mode');`;

if (!source.includes(hierarchyBefore)) {
  throw new Error('Expected Guided Notes hierarchy assertion block was not found.');
}
if (!source.includes(contextBefore)) {
  throw new Error('Expected context-panel hierarchy assertion was not found.');
}

source = source
  .replace(hierarchyBefore, hierarchyAfter)
  .replace(contextBefore, contextAfter);

await writeFile(path, source);
