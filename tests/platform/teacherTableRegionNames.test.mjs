// EVERY SIDEWAYS-SCROLLING TABLE ON A TEACHER SCREEN HAS A NAME (TT27).
//
// A table wider than its box scrolls inside a wrapper. A browser makes that
// wrapper a keyboard stop, and a screen reader says only "group" or nothing for
// it, so the teacher cannot tell what they have landed on. The wrapper is a
// focusable region named for its table (the five that already were, and the 45
// found after them, share one shape). Student screens and student tools are not
// in this list: what a student sees is unchanged by this batch.
//
// Node cannot render the screens, so the wrappers are found in source: any
// element that scrolls sideways (overflowX auto or scroll, or the two shared
// scroller classes) with a table inside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});
const FILES = [
  ...walk('src/components/teacher').filter((file) => file.endsWith('.jsx')),
  'src/ClassroomManagerV2.jsx', 'src/ClassroomSync.jsx', 'src/TexasStandardsDashboard.jsx', 'src/SignInAccess.jsx',
  'src/app/teacher/TeacherWorkspace.jsx', 'src/components/demo/DemoExperience.jsx',
  'src/components/assessment/ProctorLiveMonitor.jsx', 'src/components/analytics/DistrictAnalyticsView.jsx',
];

// The opening tag starting at `start`, read to its closing ">" outside any braces.
const openingTag = (source, start) => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    else if (source[i] === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1);
  }
  return source.slice(start);
};

// Opening tags of wrappers that scroll sideways and hold a table.
export const sidewaysTableWrappers = (source) => {
  const found = [];
  for (const match of source.matchAll(/<(?:div|section)\b/g)) {
    const tag = openingTag(source, match.index);
    if (!/overflowX:\s*['"](?:auto|scroll)['"]|className="(?:se|cr)-scroll-x"/.test(tag)) continue;
    if (/<table\b/.test(source.slice(match.index + tag.length, match.index + tag.length + 1500))) found.push(tag);
  }
  return found;
};

test('the finder sees a bare wrapper and an already named one', () => {
  assert.equal(sidewaysTableWrappers(`<div style={{ overflowX: 'auto' }}><table></table></div>`).length, 1);
  assert.equal(sidewaysTableWrappers(`<div className="cr-scroll-x"><table></table></div>`).length, 1);
  assert.equal(sidewaysTableWrappers(`<div style={{ overflowX: 'auto' }}><p>no table</p></div>`).length, 0);
});

test('every sideways-scrolling table wrapper on a teacher screen is a focusable region with a name', () => {
  let count = 0;
  for (const file of FILES) {
    for (const tag of sidewaysTableWrappers(readFileSync(join(root, file), 'utf8'))) {
      count += 1;
      assert.match(tag, /role="region"/, `${file}: ${tag.slice(0, 90)} needs role="region"`);
      assert.match(tag, /aria-label=(?:"[^"]+"|\{[^}]+\})/, `${file}: ${tag.slice(0, 90)} needs a name`);
      assert.match(tag, /tabIndex=\{0\}/, `${file}: ${tag.slice(0, 90)} needs to be a keyboard stop`);
    }
  }
  assert.ok(count >= 45, `expected to find the teacher wrappers, found ${count}`);
});
