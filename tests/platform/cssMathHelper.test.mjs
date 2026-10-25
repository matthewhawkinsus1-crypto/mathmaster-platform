/*
 * THE LENGTH CALCULATOR THE LAYOUT CONTRACTS RELY ON (helpers/cssMath.mjs).
 *
 * A test that says "at this window and this much pinned chrome, the plane is no
 * taller than the room" is only worth what its arithmetic is, so the arithmetic
 * is pinned here: units, calc()'s order of operations, min() and max(), var()
 * with its fallback, and a refusal to guess at anything it cannot read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLength } from './helpers/cssMath.mjs';

const at = (expression, vars = {}, viewport = { width: 1000, height: 800 }) => evaluateLength(expression, { viewport, vars });

test('lengths in the units a layout rule uses', () => {
  assert.equal(at('12px'), 12);
  assert.equal(at('50dvh'), 400);
  assert.equal(at('10vw'), 100);
  assert.equal(at('2rem'), 32);
});

test('calc() follows the order of operations', () => {
  assert.equal(at('calc(100px - 20px * 2)'), 60);
  assert.equal(at('calc((100px - 20px) * 2)'), 160);
  assert.equal(at('calc(100px / 4 + 5px)'), 30);
  assert.equal(at('calc(100dvh - 240px - 72 * 1px)'), 488);
});

test('min() and max() choose, and nest', () => {
  assert.equal(at('min(30px, 20px, 40px)'), 20);
  assert.equal(at('max(30px, 20px, 40px)'), 40);
  // App.css's plane cap, at a 640px window: 70dvh is 448, the window less 240 is 400.
  assert.equal(at('max(140px, min(70dvh, calc(100dvh - 240px)))', {}, { width: 1366, height: 640 }), 400);
  assert.equal(at('max(140px, min(70dvh, calc(100dvh - 240px)))', {}, { width: 1366, height: 300 }), 140);
});

test('var() takes its value, else its fallback, and a value may hold calc()', () => {
  assert.equal(at('var(--a, 5px)'), 5);
  assert.equal(at('var(--a, 5px)', { '--a': '9px' }), 9);
  assert.equal(at('calc(10px + var(--a))', { '--a': 'calc(2px * 3)' }), 16);
  assert.equal(at('calc(10px + var(--a, var(--b, 4px)))', { '--b': '1px' }), 11);
  // A scaling unit written the way the stylesheets write it: 72 of --mm-px.
  assert.equal(at('calc(72 * var(--mm-px))', { '--mm-px': 'calc(1rem / 16)' }), 72);
  assert.equal(at('calc(72 * var(--mm-px))', { '--mm-px': 'calc(2rem / 16)' }), 144);
});

test('what it cannot read it refuses, rather than guessing', () => {
  assert.throws(() => at('calc(1px * 2px)'), /two lengths/);
  assert.throws(() => at('calc(1px + 2)'), /cannot be added/);
  assert.throws(() => at('var(--missing)'), /no value/);
  assert.throws(() => at('sin(1px)'), /not supported/);
  assert.throws(() => at('calc(1px +)'), /unexpected|ends too soon/);
});
