import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanRenderTdz } from './helpers/renderDeclarationOrder.mjs';

/*
 * App() must never read a const on its render path before the line that
 * declares it (a TDZ ReferenceError that crashes the screen — the student
 * result page did, in 0456367). See helpers/renderDeclarationOrder.mjs.
 */

const describe = (findings) => findings.map((f) => `${f.name} read at line ${f.line}${f.via.length ? ` (via ${f.via.join(' > ')})` : ''}, declared at line ${f.declaredLine}`).join('\n');

test('App() reads nothing on its render path before it is declared', () => {
  const findings = scanRenderTdz(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'), { followCalls: true });
  assert.deepEqual(findings, [], `TDZ on App's render path:\n${describe(findings)}`);
});

// The scanner must be able to fail, and must not flag what runs later.
test('the scanner flags eager reads and ignores deferred ones', () => {
  const names = (src) => scanRenderTdz(src, { followCalls: true }).map((f) => f.name);
  assert.deepEqual(names('function App(){ const p = ok && v; const v = 1; return p; }'), ['v']);
  assert.deepEqual(names('function App(){ if (y) { const el = <A v={w} />; const w = 1; return el; } return null; }'), ['w']);
  assert.deepEqual(names('function App(){ const m = useMemo(() => z + 1, []); const z = 1; return m; }'), ['z']);
  assert.deepEqual(names('function App(){ const a = f(); function f(){ return b; } const b = 1; return a; }'), ['b']);
  assert.deepEqual(names('function App(){ const r = () => c; if (x) return r(); const c = 2; return r(); }'), ['c']);
  // Deferred: handlers and callbacks run after render.
  assert.deepEqual(names('function App(){ const h = () => q; const q = 1; return <b onClick={() => q}>{h}</b>; }'), []);
  // A function's own local of the same name is not the render-scope const.
  assert.deepEqual(names('function App(){ const r = (k) => { const w = 1; return w + k; }; const v = r(1); const w = 2; return v; }'), []);
});
