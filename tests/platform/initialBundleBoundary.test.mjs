// WHAT EVERY SIGN-IN DOWNLOADS.
//
// Everything src/main.jsx reaches through STATIC imports is in the first load
// — the sign-in screen and the dashboard pay for it before a student sees a
// question. Two static imports put MathLive (782 KB) and html2canvas plus the
// PDF renderers in front of every sign-in: the student Test Cycle card (its
// secure exam player and calculator import MathLive) and the teacher's PDF
// helpers. Moving them behind on-demand loads took the initial JS from 4.4 MB
// to 3.3 MB and the first screen on a 4x-throttled CPU from ~3.6 s to ~2.7 s.
//
// This walks the same graph a bundler does (static `import … from` and
// `export … from`, never `import()`), from main.jsx, and fails if either
// package comes back. To use MathLive or a PDF renderer from a screen that is
// always loaded, load it with `import()` or `lazy()` at the point of use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

const resolveSpecifier = (from, specifier) => {
  if (!specifier.startsWith('.')) {
    const parts = specifier.split('/');
    return `pkg:${specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]}`;
  }
  const base = path.resolve(path.dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

const staticImports = (file) => {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
};

const staticGraph = (entry) => {
  const parent = new Map([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (file.startsWith('pkg:') || !/\.(m?jsx?)$/.test(file)) continue;
    for (const specifier of staticImports(file)) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && !parent.has(resolved)) {
        parent.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return parent;
};

const chainTo = (graph, target) => {
  const chain = [];
  for (let node = target; node; node = graph.get(node)) chain.unshift(node.startsWith('pkg:') ? node : path.relative(repo, node));
  return chain.join(' -> ');
};

const graph = staticGraph(path.join(repo, 'src/main.jsx'));

test('the first load reaches App and the student and teacher shells (the walker works)', () => {
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')));
  assert.ok(graph.has('pkg:react') && graph.has('pkg:firebase'));
  assert.ok(graph.size > 200, `only ${graph.size} modules reached — the walker has stopped following imports`);
});

for (const [pkg, why] of [
  ['pkg:mathlive', 'MathLive is 782 KB; it arrives with the question runtime, the calculator or a Test Cycle'],
  ['pkg:html2canvas', 'html2canvas belongs to the PDF renderers, loaded when a teacher makes a PDF (src/platform/resources/pdfLoaders.js)'],
]) {
  test(`${pkg.slice(4)} is not in the first load`, () => {
    assert.ok(!graph.has(pkg), `${why}. Static chain: ${graph.has(pkg) ? chainTo(graph, pkg) : ''}`);
  });
}

// mathjs is still in the first load (App.jsx reaches it through nine
// imports), but only as factories: src/platform/math/mathjs.js builds each
// function on first use. Importing 'mathjs' anywhere else in the first load
// brings back its prebuilt instance, about 0.5 s more of main thread before
// the sign-in screen on a 4x-throttled CPU (tests/platform/mathjsInstance.test.mjs).
test('the first load reaches mathjs only through the lazily built instance', () => {
  const importers = [...graph.keys()]
    .filter((file) => !file.startsWith('pkg:') && /\.(m?jsx?)$/.test(file))
    .filter((file) => staticImports(file).some((specifier) => specifier === 'mathjs' || specifier.startsWith('mathjs/')))
    .map((file) => path.relative(repo, file));
  assert.deepEqual(importers, ['src/platform/math/mathjs.js']);
});
