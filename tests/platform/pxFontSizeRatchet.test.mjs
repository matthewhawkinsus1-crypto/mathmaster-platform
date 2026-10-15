// NO NEW PX FONT SIZES IN src/** (WCAG 1.4.4 Resize text; student push N).
//
// Every screen font size is written calc(N * var(--mm-px)) (or in em/rem/%),
// so it follows the student's browser text-size setting; a size written in
// px stays the same size at 200%. The sweep (scripts/codemods/px-to-rem.mjs)
// converted the ~2,800 that existed. This keeps it that way: a px font size or
// px line height anywhere in src/** fails here, with the file and the fix.
//
// The fix is almost always `node scripts/codemods/px-to-rem.mjs --write
// --include-app-shell <file>`. A real exception goes in ALLOWED below, by
// file, with its count and the reason — never a blanket pragma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRINT_ONLY, runCodemod } from '../../scripts/codemods/px-to-rem.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Font sizes that stay in px on purpose. `skipped` is what the codemod leaves
// for review in a file that draws SVG text; `pattern` counts the residual
// forms the codemod cannot rewrite (RESIDUAL below); `pragma` counts
// `px-to-rem-ignore` lines.
const ALLOWED = Object.freeze({
  'src/components/student/MyMathPathWheel.jsx': { skipped: 4, why: 'SVG <text> labels inside the wheel: SVG text scales with its drawing, not the text setting' },
  'src/components/student/CCMRReadinessWheel.jsx': { skipped: 2, why: 'SVG <text> labels inside the wheel: SVG text scales with its drawing' },
  'src/components/assessment/GraphingCalculatorPanel.jsx': { pragma: 1, why: 'JSXGraph tick labels: JSXGraph appends its own px unit to fontSize, so calc() would be invalid; the labels are part of the graph' },
  'src/components/teacher/caseReview/caseReview.css': { pragma: 1, why: 'the case-review print sheet (@media print): paper, like the PDF generators, not the screen' },
  'src/components/liveChallenge/ChallengeShellParts.jsx': { pattern: 1, why: 'the 3·2·1·GO countdown digit: aria-hidden, already 88–260px; the live region under it carries the text and scales' },
});

// Px font sizes the codemod cannot see: computed or held in a variable.
const RESIDUAL = [
  { name: 'a template-literal px font size', re: /fontSize:\s*`[^`]*px`/g },
  { name: 'a px size held in a *Size variable', re: /\b(?:const|let|var)\s+\w*[Ss]ize\w*\s*=(?!=)[^;\n]*['"`](?:clamp\()?\d+(?:\.\d+)?px/g },
  { name: 'a px font size set on .style', re: /\.style\.(?:fontSize|lineHeight)\s*=\s*['"`][^'"`]*\dpx/g },
  { name: 'a px font shorthand', re: /\bfont:\s*['"`][^'"`]*\d(?:\.\d+)?px/g },
];

// A look table read as `fontSize: style.size` (Live Challenge standings): in a
// file that does that, every `size:` value is a font size and must not be px.
export const sizeKeysInPx = (source) => {
  if (!/fontSize:\s*\w+\.size\b/.test(source)) return 0;
  return [...source.matchAll(/\bsize:\s*([^,\n}]+)/g)]
    .filter(([, value]) => /^\d+(?:\.\d+)?\s*$/.test(value) || /^['"`][^'"`]*\d(?:\.\d+)?px/.test(value.trim())).length;
};

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file, out);
    else if (/\.(jsx?|css)$/.test(name)) out.push(path.relative(root, file).replaceAll('\\', '/'));
  }
  return out;
};

const screenFiles = () => walk(path.join(root, 'src'))
  .filter((file) => !PRINT_ONLY.includes(file) && !/(^|\/)__tests__\//.test(file));

export const scanPxFontSizes = () => {
  const found = new Map();
  const add = (file, key, count, detail) => {
    if (!count) return;
    const entry = found.get(file) || { skipped: 0, pattern: 0, pragma: 0, codemod: 0, details: [] };
    entry[key] += count;
    entry.details.push(detail);
    found.set(file, entry);
  };
  for (const row of runCodemod({ root, paths: ['src'], includeAppShell: true })) {
    add(row.file, 'codemod', row.changes, `${row.changes} px font size(s) the codemod would rewrite`);
    add(row.file, 'skipped', row.skipped, `${row.skipped} skipped in an SVG-text file`);
  }
  for (const file of screenFiles()) {
    const source = readFileSync(path.join(root, file), 'utf8');
    add(file, 'pragma', source.split('\n').filter((line) => line.includes('px-to-rem-ignore')).length, 'px-to-rem-ignore line(s)');
    add(file, 'pragma', source.includes('px-to-rem: off') ? 1000 : 0, 'a whole-file px-to-rem: off');
    if (file.endsWith('.css')) continue;
    for (const { name, re } of RESIDUAL) add(file, 'pattern', [...source.matchAll(re)].length, name);
    add(file, 'pattern', sizeKeysInPx(source), 'a px `size:` read as fontSize: style.size');
  }
  return found;
};

test('no px font size in src/** outside the allow-list', () => {
  const problems = [];
  for (const [file, entry] of scanPxFontSizes()) {
    const allowed = ALLOWED[file] || {};
    if (entry.codemod) problems.push(`${file}: ${entry.codemod} px font size(s) — run node scripts/codemods/px-to-rem.mjs --write --include-app-shell ${file}`);
    for (const key of ['skipped', 'pattern', 'pragma']) {
      if (entry[key] > (allowed[key] || 0)) problems.push(`${file}: ${entry[key]} ${key} (allowed ${allowed[key] || 0}) — ${entry.details.join('; ')}`);
    }
  }
  assert.deepEqual(problems, [], `px font sizes do not follow the student's text-size setting (WCAG 1.4.4):\n${problems.join('\n')}`);
});

test('the allow-list is exact: an exception that is gone is removed', () => {
  const found = scanPxFontSizes();
  for (const [file, allowed] of Object.entries(ALLOWED)) {
    assert.ok(allowed.why && allowed.why.length > 20, `${file}: say why`);
    const entry = found.get(file) || {};
    for (const key of ['skipped', 'pattern', 'pragma']) {
      assert.equal(entry[key] || 0, allowed[key] || 0, `${file}: allow-list says ${allowed[key] || 0} ${key}, the source has ${entry[key] || 0}`);
    }
  }
});

test('the residual patterns catch what they are for', () => {
  const hits = (source) => RESIDUAL.filter(({ re }) => [...source.matchAll(re)].length).map(({ name }) => name);
  assert.deepEqual(hits('<div style={{ fontSize: `${size}px` }} />'), ['a template-literal px font size']);
  assert.deepEqual(hits("const promptSize = long ? 'clamp(20px, 3vh, 30px)' : '24px';"), ['a px size held in a *Size variable']);
  assert.deepEqual(hits("node.style.fontSize = '12px';"), ['a px font size set on .style']);
  assert.deepEqual(hits("ctx.font = 'bold 12px sans-serif'; const s = { font: '12px Inter' };"), ['a px font shorthand']);
  assert.deepEqual(hits("padding: size === 'small' ? '2px 8px' : '4px 10px',"), [], 'a comparison is not a size');
  assert.deepEqual(hits("const promptSize = 'clamp(calc(20 * var(--mm-px)), 3vh, calc(30 * var(--mm-px)))';"), []);
  assert.deepEqual(hits('<div style={{ fontSize: `calc(${size} * var(--mm-px))` }} />'), []);
  const looks = (size) => `const LOOKS = { student: { size: ${size}, rowHeight: 40 } };\nconst Row = ({ style }) => <li style={{ fontSize: style.size }} />;`;
  assert.equal(sizeKeysInPx(looks('15')), 1);
  assert.equal(sizeKeysInPx(looks("'clamp(16px, 1.7vw, 24px)'")), 1);
  assert.equal(sizeKeysInPx(looks("'calc(15 * var(--mm-px))'")), 0);
  assert.equal(sizeKeysInPx('const pill = { size: 15 };'), 0, 'a size not read as a font size');
});

test('CI measures every swept surface at 200% text', () => {
  // The browser check is what proves the sizes actually grow; it must run in
  // CI (accessibility-certification.yml) and keep the surfaces job N added.
  const workflow = readFileSync(path.join(root, '.github/workflows/accessibility-certification.yml'), 'utf8');
  const runs = [...workflow.matchAll(/run: node tests\/browser\/studentShellLargeText\.mjs --check=([\w,]+)/g)].map((match) => match[1].split(','));
  assert.ok(runs.some((checks) => checks.includes('text')), 'a CI step runs studentShellLargeText --check=text');
  const harness = readFileSync(path.join(root, 'tests/browser/studentShellLargeText.mjs'), 'utf8');
  const screens = harness.slice(harness.indexOf('export const LARGE_TEXT_SCREENS'), harness.indexOf('const runScenes'));
  for (const id of ['more-tools', 'recovery', 'teacher']) assert.match(screens, new RegExp(`id: '${id}'`), `the ${id} screen is measured`);
  assert.match(screens, /^\s*\.\.\.SCREENS,/m, "the certification's student screens are measured too");
  assert.match(harness, /for \(const screen of LARGE_TEXT_SCREENS\)/, 'runScenes walks the extended list');
});
