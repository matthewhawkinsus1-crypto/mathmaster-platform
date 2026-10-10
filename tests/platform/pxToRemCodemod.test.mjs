// THE PX → ROOT-RELATIVE CODEMOD (WCAG 1.4.4; job H item 7).
// scripts/codemods/px-to-rem.mjs rewrites inline px font sizes to
// calc(N * var(--mm-px)), where --mm-px is one CSS pixel at the default text
// size (src/index.css), so nothing moves at default settings and everything
// scales with the student's text size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCLUDED, convertCssValue, convertJsFontValue, pxExpression, transformCss, transformJs,
} from '../../scripts/codemods/px-to-rem.mjs';

const px = (n) => `'${pxExpression(n)}'`;

test('numbers and px strings become root-relative', () => {
  const { output, changes } = transformJs("const A = { fontSize: 14, color: 'red' };\nconst B = { fontSize: '13.5px', lineHeight: '20px' };\nconst C = {fontSize:12};");
  assert.equal(output, `const A = { fontSize: ${px(14)}, color: 'red' };\nconst B = { fontSize: ${px(13.5)}, lineHeight: ${px(20)} };\nconst C = {fontSize:${px(12)}};`);
  assert.equal(changes, 4);
});

test('a ternary converts its literal branches, never an operand', () => {
  assert.equal(convertJsFontValue("compact ? 12 : 14"), `compact ? ${px(12)} : ${px(14)}`);
  assert.equal(convertJsFontValue("button.label.length > 3 ? '12px' : '15px'"), `button.label.length > 3 ? ${px(12)} : ${px(15)}`);
  assert.equal(convertJsFontValue("roomMode ? 18 : 'inherit'"), `roomMode ? ${px(18)} : 'inherit'`);
  assert.equal(convertJsFontValue("isTask ? '15px' : isProminent ? '17px' : '13px'"), `isTask ? ${px(15)} : isProminent ? ${px(17)} : ${px(13)}`);
});

test('clamp() keeps its viewport term and converts its px bounds', () => {
  assert.equal(convertJsFontValue("'clamp(12px, 2vw, 16px)'"), `'clamp(${pxExpression(12)}, 2vw, ${pxExpression(16)})'`);
  assert.equal(convertCssValue('calc(12px + 1vw)'), `calc(${pxExpression(12)} + 1vw)`);
  assert.equal(convertCssValue('0px'), '0');
});

test('left alone: unitless line heights, expressions, other units, JSX attributes', () => {
  const source = [
    'const a = { lineHeight: 1.5 };',
    "const b = { fontSize: 'inherit' };",
    "const c = { fontSize: '1.2em' };",
    'const d = { fontSize: style.size };',
    'const e = { fontSize: `${size}px` };',
    "const f = { fontSize: supportPresentation.largeText ? '115%' : undefined };",
    'const g = <text x={1} fontSize={12}>y</text>;',
    'const h = { padding: 12, width: 14 };',
  ].join('\n');
  assert.deepEqual(transformJs(source), { output: source, changes: 0, skipped: 0 });
});

test('a file that draws SVG text converts only style={{}} literals on non-text elements', () => {
  const source = [
    "const LABEL = { fontSize: 11, fill: '#333' };",
    '<g><text style={{ fontSize: 12 }}>A</text><span style={{ fontSize: 13 }}>B</span></g>',
  ].join('\n');
  const { output, changes, skipped } = transformJs(source);
  assert.equal(changes, 1, 'the span');
  assert.equal(skipped, 2, 'the shared object (may be spread onto SVG) and the <text> style');
  assert.match(output, /<span style=\{\{ fontSize: 'calc\(13 \* var\(--mm-px\)\)' \}\}>/);
  assert.match(output, /const LABEL = \{ fontSize: 11,/);
});

test('opt-outs: a line pragma and a file pragma', () => {
  assert.equal(transformJs('const a = { fontSize: 12 }; // px-to-rem-ignore').changes, 0);
  assert.equal(transformJs('/* px-to-rem: off */\nconst a = { fontSize: 12 };').changes, 0);
});

test('CSS: font-size and line-height in px, !important kept, everything else untouched', () => {
  const css = '.a { font-size: 14px; line-height: 20px; padding: 4px; }\n.b{font-size:12px!important}\n@media (max-width: 480px) { .c { font-size: clamp(12px, 3vw, 18px); } }\n.d { font-size: 1.1rem; }';
  const { output, changes } = transformCss(css);
  assert.equal(changes, 4);
  assert.equal(output, `.a { font-size: ${pxExpression(14)}; line-height: ${pxExpression(20)}; padding: 4px; }\n.b{font-size:${pxExpression(12)}!important}\n@media (max-width: 480px) { .c { font-size: clamp(${pxExpression(12)}, 3vw, ${pxExpression(18)}); } }\n.d { font-size: 1.1rem; }`);
});

test('idempotent: a second run changes nothing', () => {
  const js = "const A = { fontSize: compact ? 12 : 14, lineHeight: '18px' };\nconst B = { fontSize: 'clamp(12px, 2vw, 16px)' };";
  const once = transformJs(js).output;
  assert.deepEqual(transformJs(once), { output: once, changes: 0, skipped: 0 });
  const css = '.a { font-size: clamp(12px, 2vw, 16px); line-height: 20px }';
  const onceCss = transformCss(css).output;
  assert.deepEqual(transformCss(onceCss), { output: onceCss, changes: 0, skipped: 0 });
});

test("job G's files are never touched", () => {
  for (const file of ['src/App.jsx', 'src/App.css', 'src/app/shell/Shell.jsx', 'src/main.jsx']) assert.equal(EXCLUDED(file), true, file);
  for (const file of ['src/QuestionEngine.jsx', 'src/components/student/StudentGradeCenter.jsx', 'src/index.css']) assert.equal(EXCLUDED(file), false, file);
});

test('--mm-px is one CSS pixel at the default text size, at both root sizes', () => {
  const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf('@media (max-width: 1024px)', css.indexOf(':root {'))) + 1);
  // The root follows the browser's text size: a percentage, never px.
  assert.match(root, /font: 112\.5%\/145% var\(--sans\);/, '18px at a 16px default');
  assert.match(root, /--mm-px: calc\(1rem \/ 18\);/);
  assert.match(root, /@media \(max-width: 1024px\) \{\s*font-size: 100%;\s*--mm-px: calc\(1rem \/ 16\);\s*\}/);
  assert.doesNotMatch(root, /font(?:-size)?:\s*\d+px/);
});
