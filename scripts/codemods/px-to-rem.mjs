#!/usr/bin/env node
/*
 * PX → ROOT-RELATIVE FONT SIZES (WCAG 1.4.4 Resize text) — job H, wave 2.
 *
 *   node scripts/codemods/px-to-rem.mjs            # dry run: what would change, per file
 *   node scripts/codemods/px-to-rem.mjs --write    # rewrite the files
 *   node scripts/codemods/px-to-rem.mjs --write src/components/student   # only under these paths
 *   node scripts/codemods/px-to-rem.mjs --write --include-app-shell src/App.jsx src/App.css src/app
 *                                                    # job G's run, after the App.jsx split lands
 *
 * About 2,190 inline font sizes were written in px, so a student who sets the
 * browser's text size to 200% got no bigger text. This rewrites each one to
 * `calc(N * var(--mm-px))`. `--mm-px` (src/index.css) is one CSS pixel AT THE
 * DEFAULT TEXT SIZE, defined from the root font size, so the page renders
 * pixel-for-pixel as before at default settings and every size scales with
 * the student's text-size setting. (A plain `N/16 rem` would not: the root is
 * 18px on a laptop and 16px at ≤1024px, so it would grow every label by an
 * eighth on laptops.)
 *
 * What it rewrites (and nothing else):
 *   JS/JSX object properties  fontSize: 14 | 14.5 | '14px' | 'clamp(12px, 2vw, 16px)'
 *                             and literal branches of a ternary value
 *                             (`compact ? 12 : 14`; never an operand such as
 *                             the 3 in `label.length > 3 ? …`)
 *                             lineHeight: '20px' (a NUMBER lineHeight is a
 *                             unitless multiplier and already scales)
 *   CSS declarations          font-size: 14px  and  line-height: 20px
 *                             (px inside clamp()/calc()/max()/min() too)
 *
 * What it leaves alone:
 *   - src/App.jsx, src/app/** and src/App.css (job G's; re-run after G lands)
 *   - JSX attributes (`<text fontSize={12}>`): SVG user units scale with the
 *     drawing, not the text setting, and a presentation attribute cannot hold
 *     var().
 *   - In a file that draws SVG text (<text>/<tspan>), any fontSize outside a
 *     `style={{…}}` literal on a non-text element: such an object may be
 *     spread onto an SVG element as attributes. Reported as "skipped" so a
 *     human can look.
 *   - A line containing `px-to-rem-ignore`, or a file containing
 *     `px-to-rem: off`.
 *
 * Idempotent: a rewritten value no longer matches, so a second run changes
 * nothing (tests/platform/pxToRemCodemod.test.mjs). Re-run it after merging
 * main and review the diff.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PX_VAR = '--mm-px';
const NUMBER = String.raw`\d+(?:\.\d+)?|\.\d+`;

/** `14` → `calc(14 * var(--mm-px))`. */
export const pxExpression = (value) => `calc(${Number(value)} * var(${PX_VAR}))`;

/** Every `Npx` inside a CSS value (clamp/calc/min/max included). `0px` stays 0. */
export const convertCssValue = (value) => String(value).replace(new RegExp(String.raw`(^|[\s(,+*/-])(${NUMBER})px\b`, 'g'), (all, lead, number) => (
  Number(number) === 0 ? `${lead}0` : `${lead}${pxExpression(number)}`
));

// ---- CSS ---------------------------------------------------------------------
const CSS_PROPERTY = /(^|[;{\s])(font-size|line-height)(\s*:\s*)([^;{}]*?\d[^;{}]*?px[^;{}]*?)(\s*(?:!important)?\s*)(?=;|})/g;

export const transformCss = (source) => {
  if (source.includes('px-to-rem: off')) return { output: source, changes: 0, skipped: 0 };
  let changes = 0;
  const output = source.split('\n').map((line) => {
    if (line.includes('px-to-rem-ignore')) return line;
    return line.replace(CSS_PROPERTY, (all, lead, property, colon, value, tail) => {
      if (/var\(--mm-px\)/.test(value) && !/\dpx/.test(value.replace(/var\(--mm-px\)/g, ''))) return all;
      const next = convertCssValue(value);
      if (next === value) return all;
      changes += 1;
      return `${lead}${property}${colon}${next}${tail}`;
    });
  }).join('\n');
  return { output, changes, skipped: 0 };
};

// ---- JS / JSX ----------------------------------------------------------------

// The end of a property value: the first `,` or `}` at depth 0 (strings and
// template literals skipped).
const valueEnd = (source, start) => {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\'' || char === '"' || char === '`') {
      const quote = char;
      for (index += 1; index < source.length && source[index] !== quote; index += 1) {
        if (source[index] === '\\') index += 1;
      }
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) return index;
      depth -= 1;
    } else if (char === ',' && depth === 0) return index;
    else if (char === '\n' && depth === 0 && /^\s*[A-Za-z_$][\w$]*\s*:/.test(source.slice(index + 1))) return index;
  }
  return source.length;
};

// A literal that IS the value or a ternary branch: at the start, or after `?`
// or the ternary `:`, and followed by the end, `:` or `)`.
const BRANCH = new RegExp(String.raw`(^\s*|\?\s*|:\s*|\(\s*)(?:(${NUMBER})|'(${NUMBER})px'|"(${NUMBER})px"|'([^'\n]*\dpx[^'\n]*)')(?=\s*(?:$|:|\)))`, 'g');

export const convertJsFontValue = (value) => value.replace(BRANCH, (all, lead, bare, single, double, cssString) => {
  if (bare != null) return `${lead}'${pxExpression(bare)}'`;
  if (single != null || double != null) return `${lead}'${pxExpression(single ?? double)}'`;
  const next = convertCssValue(cssString);
  return next === cssString ? all : `${lead}'${next}'`;
});

export const convertJsLineHeightValue = (value) => value.replace(new RegExp(String.raw`(^\s*|\?\s*|:\s*)'(${NUMBER})px'(?=\s*(?:$|:|\)))`, 'g'), (all, lead, number) => `${lead}'${pxExpression(number)}'`);

const SVG_TEXT_TAGS = new Set(['text', 'tspan', 'textPath']);

// Is `index` inside a `style={{ … }}` literal, and on which element?
const styleLiteralAt = (source, index) => {
  const open = source.lastIndexOf('style={{', index);
  if (open < 0) return null;
  // The literal must still be open at `index`.
  let depth = 0;
  for (let cursor = open + 'style={'.length; cursor < index; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    else if (source[cursor] === '}') depth -= 1;
    if (depth <= 0) return null;
  }
  const tagMatch = [...source.slice(Math.max(0, open - 2000), open).matchAll(/<([A-Za-z][\w.]*)/g)].pop();
  return { tag: tagMatch?.[1] || null };
};

const PROPERTY = /(?<![\w$.'"-])(fontSize|lineHeight)(\s*:\s*)/g;

export const transformJs = (source) => {
  if (source.includes('px-to-rem: off')) return { output: source, changes: 0, skipped: 0 };
  const drawsSvgText = /<(?:text|tspan|textPath)\b/.test(source);
  let output = '';
  let cursor = 0;
  let changes = 0;
  let skipped = 0;
  for (const match of source.matchAll(PROPERTY)) {
    const valueStart = match.index + match[0].length;
    if (valueStart < cursor) continue;
    // Not a JSX attribute (`fontSize={…}` / `fontSize="…"`): those have `=`.
    const end = valueEnd(source, valueStart);
    const value = source.slice(valueStart, end);
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    const lineEnd = source.indexOf('\n', match.index);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    if (line.includes('px-to-rem-ignore')) continue;
    const next = match[1] === 'fontSize' ? convertJsFontValue(value) : convertJsLineHeightValue(value);
    if (next === value) continue;
    if (drawsSvgText) {
      const literal = styleLiteralAt(source, match.index);
      if (!literal || SVG_TEXT_TAGS.has(literal.tag)) { skipped += 1; continue; }
    }
    output += source.slice(cursor, valueStart) + next;
    cursor = end;
    changes += 1;
  }
  output += source.slice(cursor);
  return { output, changes, skipped };
};

// ---- Files -------------------------------------------------------------------
export const EXCLUDED = (relative) => (
  relative === 'src/App.jsx'
  || relative === 'src/App.css'
  || relative.startsWith('src/app/')
  || relative === 'src/main.jsx'
  || /(^|\/)__tests__\//.test(relative)
);

const walk = (dir, root, out = []) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) { walk(file, root, out); continue; }
    if (/\.(jsx?|css)$/.test(name)) out.push(path.relative(root, file).replaceAll('\\', '/'));
  }
  return out;
};

export const runCodemod = ({ root, paths = ['src'], write = false, includeAppShell = false } = {}) => {
  const files = paths.flatMap((entry) => {
    const absolute = path.resolve(root, entry);
    return statSync(absolute).isDirectory() ? walk(absolute, root) : [path.relative(root, absolute).replaceAll('\\', '/')];
  }).filter((relative) => relative.startsWith('src/') && (includeAppShell || !EXCLUDED(relative)));
  const report = [];
  for (const relative of files) {
    const absolute = path.join(root, relative);
    const source = readFileSync(absolute, 'utf8');
    const { output, changes, skipped } = relative.endsWith('.css') ? transformCss(source) : transformJs(source);
    if (changes || skipped) report.push({ file: relative, changes, skipped });
    if (write && output !== source) writeFileSync(absolute, output);
  }
  return report;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  // Job G's run, once its App.jsx split has landed: --include-app-shell
  // src/App.jsx src/App.css src/app (src/main.jsx carries no font sizes).
  const includeAppShell = args.includes('--include-app-shell');
  const paths = args.filter((arg) => !arg.startsWith('--'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const report = runCodemod({ root, paths: paths.length ? paths : ['src'], write, includeAppShell });
  const total = report.reduce((sum, row) => sum + row.changes, 0);
  const skipped = report.reduce((sum, row) => sum + row.skipped, 0);
  for (const row of report) console.log(`${row.changes.toString().padStart(4)} ${row.skipped ? `(${row.skipped} skipped) ` : ''}${row.file}`);
  console.log(`${write ? 'rewrote' : 'would rewrite'} ${total} value(s) in ${report.filter((row) => row.changes).length} file(s); ${skipped} skipped for review (SVG text files)`);
}
