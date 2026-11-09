// A V8 CPU PROFILE OF A PRODUCTION BUILD, READ BACK TO SOURCE NAMES.
//
// A production chunk is minified: a profile of it names `Y` and `fs`. A build
// made with `sourcemap: 'hidden'` (tests/browser/teacherWorkflow/
// vite.production.config.mjs) writes `<chunk>.js.map` beside each chunk without
// linking it, so the code is the code a student runs and a profile can still
// say "App · src/App.jsx:521". A frame's position is its function's start; the
// name comes from the map, else from the source line there.
//
//   summarizeProfile(dist, profile)  self time per function and per file (ms)
//   inclusiveProfile(dist, profile)  time with each function anywhere on the stack
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json'));
const { SourceMapConsumer } = require('source-map-js');

const NAME_BEFORE = [
  /function\s*\*?\s*([\w$]+)\s*\([^()]*$/,
  /([\w$]+)\s*[:=]\s*(?:async\s*)?function\b[^()]*$/,
  /([\w$]+)\s*[:=]\s*(?:async\s*)?\(?[\w$,\s{}[\]=.'"]*\)?\s*=>\s*\{?\s*$/,
  /([\w$]+)\s*[:=]\s*(?:useCallback|useMemo|memo)\(\s*(?:\([^()]*\)|[\w$]+)?\s*=>\s*\{?\s*$/,
  /^\s*(?:async\s+)?(?:get\s+|set\s+|static\s+)?([\w$]+)\s*\([^()]*\)\s*\{\s*$/,
  /(use(?:Effect|LayoutEffect|Memo|Callback))\(\s*\(?\)?\s*=>\s*\{?\s*$/,
];
const NATIVE = new Set(['(program)', '(garbage collector)', '(root)', '(idle)']);

export const createProfileReader = (dist) => {
  const consumers = new Map();
  const lines = new Map();
  const consumerFor = (url) => {
    const file = String(url || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    if (!dist || !file.endsWith('.js')) return null;
    if (!consumers.has(file)) {
      const mapPath = path.join(dist, `${file}.map`);
      consumers.set(file, existsSync(mapPath) ? new SourceMapConsumer(JSON.parse(readFileSync(mapPath, 'utf8'))) : null);
    }
    return consumers.get(file);
  };
  const nameAt = (consumer, source, line, column) => {
    if (!lines.has(source)) lines.set(source, consumer.sourceContentFor(source, true)?.split('\n') || null);
    const text = lines.get(source)?.[line - 1] || '';
    for (const pattern of NAME_BEFORE) {
      const match = text.slice(0, column + 1).match(pattern) || text.match(pattern);
      if (match) return match[1];
    }
    return null;
  };
  /** "name · file:line" for a profile frame. */
  const frameName = (frame) => {
    if (NATIVE.has(frame.functionName)) return frame.functionName;
    const consumer = consumerFor(frame.url);
    const fallback = `${frame.functionName || '(anonymous)'} · ${String(frame.url || '').split('/').pop() || '(native)'}`;
    if (!consumer) return fallback;
    const position = consumer.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
    if (!position.source) return fallback;
    const file = position.source.replace(/^.*?(node_modules\/|src\/|functions\/|tests\/)/, '$1');
    return `${position.name || nameAt(consumer, position.source, position.line, position.column) || frame.functionName || '(anonymous)'} · ${file}:${position.line}`;
  };
  const ms = (micros) => Math.round(micros / 100) / 10;
  const selfTimes = (profile) => {
    const self = new Map();
    profile.samples.forEach((id, index) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[index + 1] ?? 0)));
    return self;
  };
  return {
    frameName,
    summarize(profile, { top = 20 } = {}) {
      const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
      const byFunction = new Map();
      const byFile = new Map();
      let busy = 0;
      selfTimes(profile).forEach((micros, id) => {
        const name = frameName(nodes.get(id).callFrame);
        if (name === '(idle)') return;
        busy += micros;
        byFunction.set(name, (byFunction.get(name) || 0) + micros);
        const file = (name.split(' · ')[1] || name).replace(/:\d+$/, '').replace(/^node_modules\/([^/]+)\/.*$/, 'node_modules/$1');
        byFile.set(file, (byFile.get(file) || 0) + micros);
      });
      const ranked = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, micros]) => [name, ms(micros)]);
      return { busyMs: ms(busy), self: ranked(byFunction), files: ranked(byFile) };
    },
    inclusive(profile, { top = 30 } = {}) {
      const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
      const parent = new Map();
      profile.nodes.forEach((node) => (node.children || []).forEach((child) => parent.set(child, node.id)));
      const names = new Map();
      const nameOf = (id) => {
        if (!names.has(id)) names.set(id, frameName(nodes.get(id).callFrame));
        return names.get(id);
      };
      const total = new Map();
      profile.samples.forEach((leaf, index) => {
        const delta = profile.timeDeltas[index + 1] ?? 0;
        const seen = new Set();
        for (let id = leaf; id != null; id = parent.get(id)) {
          const name = nameOf(id);
          if (seen.has(name)) continue;
          seen.add(name);
          total.set(name, (total.get(name) || 0) + delta);
        }
      });
      return [...total.entries()].filter(([name]) => !NATIVE.has(name)).sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, micros]) => [name, ms(micros)]);
    },
  };
};

/** The original source position of a minified function's text, for naming a component. */
export const componentNamer = (dist) => {
  if (!dist) return () => null;
  const reader = createProfileReader(dist);
  const assets = path.join(dist, 'assets');
  const chunks = existsSync(assets)
    ? readdirSync(assets).filter((file) => file.endsWith('.js')).map((file) => [file, readFileSync(path.join(assets, file), 'utf8')])
    : [];
  return (sourceText) => {
    const probe = String(sourceText || '').slice(0, 120);
    if (!probe) return null;
    for (const [file, text] of chunks) {
      const offset = text.indexOf(probe);
      if (offset < 0) continue;
      const before = text.slice(0, offset);
      const lineNumber = before.split('\n').length - 1;
      const columnNumber = offset - before.lastIndexOf('\n') - 1;
      return reader.frameName({ url: `assets/${file}`, lineNumber, columnNumber, functionName: '' });
    }
    return null;
  };
};
