/*
 * THE CONTRAST REVIEW HIDES THE TEXT WHOSE BACKGROUND IT READS
 * (tests/browser/contrastReview.mjs, HIDE_CSS).
 *
 * For its pixel reading the review makes a node's text transparent and
 * screenshots the text's boxes. A rule of the app's that sets the text's colour
 * with !important and more specificity kept the text in the shot, and the
 * text's own pixels were read as its background: in dark, the theme's
 * ":root[data-theme='dark'] #root select" left the Live Challenge projector's
 * threshold select at 1:1, where it is #f3f5f9 on #242832 (about 13:1). The
 * hiding rules must outrank every colour rule the app's stylesheets set with
 * !important.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIDE_CSS } from '../browser/contrastReview.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const splitList = (text) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  return [...parts, text.slice(start)].map((part) => part.trim()).filter(Boolean);
};
const higher = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
// Specificity as [ids, classes, types]: :is(), :not() and :has() count their
// most specific argument, :where() nothing (Selectors 4).
const specificity = (selector) => {
  const total = [0, 0, 0];
  const ident = (i) => { let j = i; while (j < selector.length && /[\w\\-]/.test(selector[j])) j += selector[j] === '\\' ? 2 : 1; return j; };
  const close = (i) => { let depth = 0; for (let j = i; j < selector.length; j += 1) { if (selector[j] === '(') depth += 1; if (selector[j] === ')' && --depth === 0) return j; } return selector.length; };
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === '#') { total[0] += 1; i = ident(i + 1); } else if (ch === '.') { total[1] += 1; i = ident(i + 1); } else if (ch === '[') {
      total[1] += 1;
      i = selector.indexOf(']', i) + 1 || selector.length;
    } else if (ch === ':' && selector[i + 1] === ':') {
      total[2] += 1;
      i = ident(i + 2);
      if (selector[i] === '(') i = close(i) + 1;
    } else if (ch === ':') {
      const end = ident(i + 1);
      const name = selector.slice(i + 1, end).toLowerCase();
      if (selector[end] === '(') {
        const stop = close(end);
        if (['is', 'not', 'has', 'matches', '-webkit-any'].includes(name)) {
          const most = splitList(selector.slice(end + 1, stop)).map(specificity).sort(higher).pop() || [0, 0, 0];
          for (let k = 0; k < 3; k += 1) total[k] += most[k];
        } else if (name !== 'where') total[1] += 1;
        i = stop + 1;
      } else { total[1] += 1; i = end; }
    } else if (/[a-zA-Z_\\-]/.test(ch)) { total[2] += 1; i = ident(i); } else i += 1;
  }
  return total;
};
// The rules of a stylesheet, innermost: [selectors, declarations].
const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
const setsColourImportant = (body) => /(?:^|[;\s])(?:color|-webkit-text-fill-color|fill)\s*:[^;]*!important/i.test(body);
const cssFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  if (entry.isDirectory()) return cssFiles(file);
  return entry.name.endsWith('.css') ? [file] : [];
});

test('specificity as the cascade counts it, for the selectors the app writes', () => {
  assert.deepEqual(specificity(":root[data-theme='dark'] #root :is(input:not([type='checkbox']), select, textarea)"), [1, 3, 1]);
  assert.deepEqual(specificity('.a :where(#b, .c) p::before'), [0, 1, 2]);
  assert.deepEqual(specificity('.__crHide *:not(#__cr):not(#__cr):not(#__cr)'), [3, 1, 0]);
});

test('the text the review hides for its pixel reading stays hidden over every colour rule the app sets with !important', () => {
  const hiding = rules(HIDE_CSS).filter(([, body]) => /color:\s*transparent\s*!important/.test(body)).flatMap(([selectors]) => splitList(selectors));
  assert.ok(hiding.length >= 2, 'the hiding rules');
  const weakestHiding = hiding.map(specificity).sort(higher)[0];
  let strongest = { specificity: [0, 0, 0], selector: null, file: null };
  const files = cssFiles(path.join(repo, 'src'));
  assert.ok(files.some((file) => file.endsWith('index.css')), 'the app\'s stylesheets are read');
  for (const file of files) {
    for (const [selectors, body] of rules(readFileSync(file, 'utf8'))) {
      if (selectors.startsWith('@') || !setsColourImportant(body)) continue;
      for (const selector of splitList(selectors)) {
        const value = specificity(selector);
        if (higher(value, strongest.specificity) > 0) strongest = { specificity: value, selector, file: path.relative(repo, file) };
      }
    }
  }
  assert.ok(strongest.selector, 'the app does set colours with !important (the dark theme\'s form controls)');
  assert.ok(higher(weakestHiding, strongest.specificity) > 0, `hiding [${weakestHiding}] must outrank "${strongest.selector}" [${strongest.specificity}] (${strongest.file})`);
});
