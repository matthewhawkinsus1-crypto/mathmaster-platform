/*
 * THE STUDENT'S FIRST LOAD AS A MODULE GRAPH, FOR SOURCE CONTRACTS.
 *
 * The walk tests/platform/initialBundleBoundary.test.mjs does (static
 * `import … from` and `export … from`, never `import()`), from main.jsx and
 * then App.jsx, which AppShell loads the moment an account is signed in.
 * `firstLoadGraph()` maps every module reached to the module that reached it;
 * `chainTo` prints that path, for a failure message.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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

export const firstLoadGraph = () => {
  const graph = new Map(staticGraph(path.join(repo, 'src/main.jsx')));
  for (const [file, parent] of staticGraph(path.join(repo, 'src/App.jsx'))) {
    if (!graph.has(file)) graph.set(file, parent ?? path.join(repo, 'src/app/shell/AppShell.jsx'));
  }
  return graph;
};

export const chainTo = (graph, target) => {
  const chain = [];
  for (let node = target; node; node = graph.get(node)) chain.unshift(node.startsWith('pkg:') ? node : path.relative(repo, node));
  return chain.join(' -> ');
};
