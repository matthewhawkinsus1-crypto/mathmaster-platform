import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * THE SHARED GRADERS LOAD LAZILY IN THE BROWSER.
 *
 * functions/shared/serverGrading/toolGraders.mjs imports every registry tool's
 * grader and, through them, every tool's mathematics. The server imports it
 * statically; the student app must not, or every student downloads every tool
 * to open any assignment. The browser reaches the graders three ways, all lazy:
 *
 *   - a tool's own chunk imports only its own grader (tools/<toolId>.mjs);
 *   - QuestionEngine dynamic-imports the dispatch at submit time
 *     (src/platform/grading/sharedGradingLoader.js);
 *   - teacher Pre-Flight lives in a lazily loaded chunk.
 *
 * This walks the STATIC import graph from the app entry (dynamic `import()`
 * is the code-split boundary and is not followed) and fails if it reaches the
 * heavy half. A static import added anywhere on that path — App.jsx importing
 * submissionIngestion.mjs instead of submissionEnvelope.mjs, say — turns this
 * red, which the build itself would never do.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HEAVY = [
  'functions/shared/serverGrading/toolGraders.mjs',
  'functions/shared/serverGrading/serverResponseGrading.mjs',
  'functions/shared/submissionIngestion.mjs',
  'functions/shared/sectionRecoveryActions.mjs',
  // The question-kind dispatch and its heavy graders: the composed workflow
  // grader (which carries the graph workspace's), and the Step Algebra
  // workspace and step engines. Pre-Flight, which IS on the startup path,
  // self-checks answer keys with the light ordinary and final-answer graders.
  'functions/shared/serverGrading/questionResponseGrading.mjs',
  'functions/shared/serverGrading/questionGraders/composedWorkflow.mjs',
  'functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs',
  'functions/shared/serverGrading/stepAlgebraStepVerification.mjs',
];

const RESOLVE_EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

const resolveSpecifier = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
};

// Static `import ... from '...'`, `import '...'` and `export ... from '...'`.
// Comments are stripped first so a commented-out import is not followed.
const staticSpecifiers = (source) => {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const found = [];
  const patterns = [
    /(?:^|[\s;])import\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /(?:^|[\s;])export\s+(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g,
  ];
  patterns.forEach((pattern) => {
    for (const match of code.matchAll(pattern)) found.push(match[1]);
  });
  return found;
};

const staticGraph = (entry) => {
  const seen = new Map();
  const queue = [{ file: entry, from: null }];
  while (queue.length) {
    const { file, from } = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, from);
    let source = '';
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    staticSpecifiers(source).forEach((specifier) => {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push({ file: resolved, from: file });
    });
  }
  return seen;
};

const chainTo = (graph, file) => {
  const chain = [];
  let cursor = file;
  while (cursor) {
    chain.unshift(path.relative(ROOT, cursor));
    cursor = graph.get(cursor);
  }
  return chain.join('\n  -> ');
};

test('the student app entry never statically imports the shared grader map', () => {
  // main.jsx, then App.jsx — AppShell loads App lazily the moment an account
  // signs in, so for a student both are the startup path.
  const graph = staticGraph(path.join(ROOT, 'src/main.jsx'));
  for (const [file, parent] of staticGraph(path.join(ROOT, 'src/App.jsx'))) {
    if (!graph.has(file)) graph.set(file, parent ?? path.join(ROOT, 'src/app/shell/AppShell.jsx'));
  }
  assert.ok(graph.size > 200, `the walker reached only ${graph.size} modules — the import parser has broken`);
  // The light half IS expected on the startup path; it is what lets App.jsx
  // and the checkpoint writer ask "can the server mark this?".
  assert.ok(graph.has(path.join(ROOT, 'functions/shared/serverGrading/gradingSupport.mjs')),
    'the light grading support module should be reachable from the app (sanity check for the walker)');
  HEAVY.forEach((relative) => {
    const absolute = path.join(ROOT, relative);
    assert.equal(graph.has(absolute), false, `${relative} is statically reachable from src/main.jsx:\n  ${graph.has(absolute) ? chainTo(graph, absolute) : ''}`);
  });
  // A surface whose COMPONENT is on the startup path carries its own grader
  // with it — that is the component's own code, not the aggregate map: a
  // registry tool rendered as a composed-workflow stage (WorkflowRunner and
  // the Mapping Diagram), or a question type QuestionEngine renders itself
  // (GraphLine, GraphStory, InteractiveGraphWorkspace, ...). What must never
  // happen is a grader reached through shared platform code: a .js module,
  // the app shell, QuestionEngine's dispatch, or anything that pulls in more
  // than one surface's grader.
  const isGraderFile = (file) => file.includes(`${path.sep}serverGrading${path.sep}tools${path.sep}`);
  const PLATFORM_SHELLS = new Set(['src/main.jsx', 'src/App.jsx', 'src/QuestionEngine.jsx'].map((relative) => path.join(ROOT, relative)));
  const gradersImportedBy = (importer) => [...graph.entries()]
    .filter(([file, from]) => from === importer && isGraderFile(file)).length;
  const toolGraderFiles = [...graph.keys()].filter(isGraderFile);
  // A composed workflow re-marks its graph stages with the graph workspace's
  // own grader. That grader is on the startup path anyway, through its own
  // component (WorkflowRunner renders InteractiveGraphWorkspace), so the
  // composed grader adds no bytes — and the exemption holds only while the
  // component still imports exactly that grader statically.
  const STAGE_GRADERS = [{
    importer: path.join(ROOT, 'functions/shared/serverGrading/questionGraders/composedWorkflow.mjs'),
    grader: path.join(ROOT, 'functions/shared/serverGrading/tools/graphWorkspace.mjs'),
    component: path.join(ROOT, 'src/InteractiveGraphWorkspace.jsx'),
  }];
  const importsStatically = (component, grader) => graph.has(component)
    && staticSpecifiers(fs.readFileSync(component, 'utf8')).some((specifier) => resolveSpecifier(component, specifier) === grader);
  STAGE_GRADERS.forEach(({ importer, component, grader }) => {
    // Only relevant while the composed grader is itself on the startup path.
    if (!graph.has(importer)) return;
    assert.ok(importsStatically(component, grader), `${path.relative(ROOT, component)} no longer imports ${path.relative(ROOT, grader)} on the startup path; the composed-stage exemption no longer holds`);
  });
  const viaSharedCode = toolGraderFiles.filter((file) => {
    let importer = graph.get(file);
    // Grader-internal imports (a tool grader composed of mode modules) are
    // followed back to whoever imported the grader itself.
    while (importer && isGraderFile(importer)) importer = graph.get(importer);
    if (!importer) return true;
    if (STAGE_GRADERS.some((stage) => stage.importer === importer && stage.grader === file && importsStatically(stage.component, file))) return false;
    if (importer.startsWith(path.join(ROOT, 'src', 'tools') + path.sep)) return false;
    const ownComponent = importer.endsWith('.jsx') && !PLATFORM_SHELLS.has(importer) && gradersImportedBy(importer) === 1;
    return !ownComponent;
  });
  assert.deepEqual(viaSharedCode.map((file) => `${path.relative(ROOT, file)} <- ${path.relative(ROOT, graph.get(file) || '')}`), [],
    'a tool grader reached through shared platform code instead of its own tool component');
});

test('the lazy loader is a dynamic import, which is what keeps the graders out', () => {
  const loader = fs.readFileSync(path.join(ROOT, 'src/platform/grading/sharedGradingLoader.js'), 'utf8');
  assert.match(loader, /import\(\s*'[^']*serverGrading\/serverResponseGrading\.mjs'\s*\)/);
  assert.deepEqual(staticSpecifiers(loader), [], 'the loader must not statically import anything');
});
