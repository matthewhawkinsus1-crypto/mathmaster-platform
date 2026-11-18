// HOW MANY TIMES A FUNCTION RAN IN A WINDOW, IN A PRODUCTION BUILD.
//
// V8's precise coverage with call counts (CDP Profiler.startPreciseCoverage,
// callCount) counts every invocation of every function from the moment it is
// started; takePreciseCoverage reads the counts and sets them back to zero. A
// production chunk is minified, so each counted function is read back through
// the build's hidden source maps (`sourcemap: 'hidden'`,
// tests/browser/teacherWorkflow/vite.production.config.mjs) to its original
// file and the text of the line it starts on: "export const simplify = " in
// functions/shared/algebra/safeMath.mjs, not "te".
//
// Precise coverage stops V8 from optimizing while it runs, so a window it
// counts is slower than the same window uncounted: its counts are exact, its
// timings are not used.
//
//   const counter = createCallCounter(cdp, dist);
//   await counter.start();
//   ... part of the window ...
//   const first = await counter.take({ stop: false });  // [{ source, line, text, count }]
//   ... the rest ...
//   const rest = await counter.take();                  // counted since the last take
//   countWhere(first, { source: /safeMath\.mjs$/, text: /^export const parse = / })
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json'));
const { SourceMapConsumer } = require('source-map-js');

const chunkFile = (url) => String(url || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];

export const createCallCounter = (cdp, dist) => {
  const chunks = new Map();
  const chunkFor = (url) => {
    const file = chunkFile(url);
    if (!chunks.has(file)) {
      const full = path.join(dist, file);
      const mapPath = `${full}.map`;
      if (!file.endsWith('.js') || !existsSync(full) || !existsSync(mapPath)) chunks.set(file, null);
      else {
        const text = readFileSync(full, 'utf8');
        const lineStarts = [0];
        for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
        chunks.set(file, { lineStarts, consumer: new SourceMapConsumer(JSON.parse(readFileSync(mapPath, 'utf8'))), lines: new Map() });
      }
    }
    return chunks.get(file);
  };
  const originalOf = (chunk, offset) => {
    let low = 0;
    let high = chunk.lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (chunk.lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    const position = chunk.consumer.originalPositionFor({ line: low + 1, column: offset - chunk.lineStarts[low] });
    if (!position.source) return null;
    if (!chunk.lines.has(position.source)) chunk.lines.set(position.source, chunk.consumer.sourceContentFor(position.source, true)?.split('\n') || []);
    const source = position.source.replace(/^.*?(node_modules\/|src\/|functions\/|tests\/)/, '$1');
    return { source, line: position.line, text: String(chunk.lines.get(position.source)[position.line - 1] || '').trim() };
  };
  return {
    async start() {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
      // Counts start from the first take.
      await cdp.send('Profiler.takePreciseCoverage');
    },
    // The counts since the last take, which sets them to zero: with { stop:
    // false } counting goes on, so no call falls between two takes.
    async take({ stop = true } = {}) {
      const { result } = await cdp.send('Profiler.takePreciseCoverage');
      if (stop) await cdp.send('Profiler.stopPreciseCoverage');
      const ran = [];
      for (const script of result) {
        const chunk = chunkFor(script.url);
        if (!chunk) continue;
        for (const fn of script.functions) {
          const count = fn.ranges[0]?.count || 0;
          if (!count) continue;
          const original = originalOf(chunk, fn.ranges[0].startOffset);
          if (original) ran.push({ ...original, count });
        }
      }
      return ran;
    },
  };
};

/** Invocations of the functions whose source and first line match. */
export const countWhere = (ran, { source, text }) => ran
  .filter((entry) => source.test(entry.source) && text.test(entry.text))
  .reduce((sum, entry) => sum + entry.count, 0);
