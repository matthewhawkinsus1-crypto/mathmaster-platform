import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { executableSource } from './helpers/sourceContract.mjs';

// EVERY REAL-TIME LISTENER HAS AN OWNER AND A CLEANUP (Job 5).
//
// A listener that is opened on navigation and never closed is how a dashboard
// grows to gigabytes: each visit adds another live query, another copy of the
// data, another callback re-rendering an unmounted screen. Today every
// Firestore listener in MathMaster is released by its owner. This guard keeps
// it that way:
//
//   - a service (.js) opens a listener only to RETURN its unsubscribe (the
//     caller owns it) or keeps it in a local that its own cleanup calls;
//   - a component (.jsx) opens one — directly or through a watch*/subscribe*
//     service — only as the return value of a useEffect, or into a variable
//     (or array of them) that the effect's cleanup releases.

const files = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(full);
  else if (/\.(jsx?|mjs)$/.test(full)) files.push(full.split(path.sep).join('/'));
});
walk('src');

const SUBSCRIBE_CALL = /\b(onSnapshot|(?:watch|subscribe)[A-Z]\w*)\(/g;

const classify = (code, index, name) => {
  const lineStart = code.lastIndexOf('\n', index) + 1;
  const before = code.slice(lineStart, index);
  const after = code.slice(index);
  if (/export const\s+\w+\s*=\s*\(?[^=]*$/.test(before) || /function\s*$/.test(before)) return 'definition';
  if (/^\s*(?:export\s+)?(?:const|let)\s+\w+\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>\s*$/.test(before)) return 'definition';
  if (/return\s+$/.test(before)) return 'returned';
  if (/useEffect\(\(\)\s*=>\s*$/.test(before)) return 'returned';
  const assigned = before.match(/(?:const|let)\s+(\w+)\s*=\s*$/);
  if (assigned) {
    const variable = assigned[1];
    return new RegExp(`\\b${variable}(?:\\?\\.)?\\(\\)`).test(after) ? 'released' : `never released: ${variable}`;
  }
  const mapped = code.slice(Math.max(0, lineStart - 200), index).match(/(?:const|let)\s+(\w+)\s*=\s*[^;]*\.map\(\([^)]*\)\s*=>\s*$/);
  if (mapped) {
    return new RegExp(`\\b${mapped[1]}\\.forEach\\(\\(?\\w+\\)?\\s*=>\\s*\\w+(?:\\?\\.)?\\(\\)\\)`).test(after) ? 'released' : `array never released: ${mapped[1]}`;
  }
  if (/=>\s*$/.test(before) && /\.map\(/.test(code.slice(lineStart, index))) return 'mapped';
  return `unowned ${name} call`;
};

test('every Firestore listener and subscription is owned and released', () => {
  const problems = [];
  let calls = 0;
  for (const file of files) {
    if (file.endsWith('.test.mjs')) continue;
    const code = executableSource(fs.readFileSync(file, 'utf8'));
    if (!/onSnapshot\(|(?:watch|subscribe)[A-Z]\w*\(/.test(code)) continue;
    for (const match of code.matchAll(SUBSCRIBE_CALL)) {
      const name = match[1];
      // Local event buses (subscribeToQuestionDrafts, watchReducedMotion) are
      // held to the same rule: a subscription is a subscription.
      const verdict = classify(code, match.index, name);
      if (verdict === 'definition') continue;
      calls += 1;
      if (!['returned', 'released', 'mapped'].includes(verdict)) problems.push(`${file}: ${verdict}`);
    }
  }
  assert.ok(calls >= 40, `the guard found the listeners (${calls})`);
  assert.deepEqual(problems, []);
});

test('the guard catches a listener opened and never released', () => {
  const code = executableSource(`
    useEffect(() => {
      const unsubscribe = onSnapshot(doc(db, 'x', id), setX);
    }, [id]);
  `);
  const index = code.indexOf('onSnapshot(');
  assert.match(classify(code, index, 'onSnapshot'), /never released/);
  const fine = executableSource(`
    useEffect(() => {
      const unsubscribe = onSnapshot(doc(db, 'x', id), setX);
      return () => unsubscribe();
    }, [id]);
  `);
  assert.equal(classify(fine, fine.indexOf('onSnapshot('), 'onSnapshot'), 'released');
});
