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
  const graph = staticGraph(path.join(ROOT, 'src/main.jsx'));
  assert.ok(graph.size > 200, `the walker reached only ${graph.size} modules — the import parser has broken`);
  // The light half IS expected on the startup path; it is what lets App.jsx
  // and the checkpoint writer ask "can the server mark this?".
  assert.ok(graph.has(path.join(ROOT, 'functions/shared/serverGrading/gradingSupport.mjs')),
    'the light grading support module should be reachable from the app (sanity check for the walker)');
  HEAVY.forEach((relative) => {
    const absolute = path.join(ROOT, relative);
    assert.equal(graph.has(absolute), false, `${relative} is statically reachable from src/main.jsx:\n  ${graph.has(absolute) ? chainTo(graph, absolute) : ''}`);
  });
  const toolGraderFiles = [...graph.keys()].filter((file) => file.includes(`${path.sep}serverGrading${path.sep}tools${path.sep}`));
  assert.deepEqual(toolGraderFiles.map((file) => path.relative(ROOT, file)), [], 'no tool grader is on the startup path');
});

test('the lazy loader is a dynamic import, which is what keeps the graders out', () => {
  const loader = fs.readFileSync(path.join(ROOT, 'src/platform/grading/sharedGradingLoader.js'), 'utf8');
  assert.match(loader, /import\(\s*'[^']*serverGrading\/serverResponseGrading\.mjs'\s*\)/);
  assert.deepEqual(staticSpecifiers(loader), [], 'the loader must not statically import anything');
});
