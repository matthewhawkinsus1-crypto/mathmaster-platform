// THE PX → ROOT-RELATIVE CODEMOD (WCAG 1.4.4; job H item 7).
// scripts/codemods/px-to-rem.mjs rewrites inline px font sizes to
// calc(N * var(--mm-px)), where --mm-px is one CSS pixel at the default text
// size (src/index.css), so nothing moves at default settings and everything
// scales with the student's text size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCLUDED, scaleFluidClamps, convertCssValue, convertJsFontValue, pxExpression, transformCss, transformJs,
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
  assert.equal(output, `.a { font-size: ${pxExpression(14)}; line-height: ${pxExpression(20)}; padding: 4px; }\n.b{font-size:${pxExpression(12)}!important}\n@media (max-width: 480px) { .c { font-size: clamp(${pxExpression(12)}, calc(3vw * var(--mm-text-scale, 1)), ${pxExpression(18)}); } }\n.d { font-size: 1.1rem; }`);
});

test('a stylesheet held in a JS template literal is converted; an interpolated template is not', () => {
  // Live Challenge injects its CSS as <style>{RUSH_CSS}</style> (job N).
  const js = 'const RUSH_CSS = `\n.chip { font-size: 13px; padding: 4px 10px; }\n.clock { font-size: clamp(21px, 4vmin, 34px); line-height: 1; }\n`;\nconst label = `${n}px`;\nconst dynamic = `\n.x { font-size: ${size}px; }\n`;';
  const { output, changes } = transformJs(js);
  assert.equal(changes, 2);
  assert.match(output, new RegExp(`\\.chip \\{ font-size: ${pxExpression(13).replace(/[()*]/g, '\\$&')}; padding: 4px 10px; \\}`));
  assert.match(output, /\.clock \{ font-size: clamp\(calc\(21 \* var\(--mm-px\)\), calc\(4vmin \* var\(--mm-text-scale, 1\)\), calc\(34 \* var\(--mm-px\)\)\); line-height: 1; \}/);
  assert.match(output, /const label = `\$\{n\}px`;/, 'not a stylesheet');
  assert.match(output, /\.x \{ font-size: \$\{size\}px; \}/, 'interpolated: left for a human');
  assert.deepEqual(transformJs(output), { output, changes: 0, skipped: 0 }, 'idempotent');
});

test("a fluid font size's viewport term follows the text setting too (coordinator, #487)", () => {
  // clamp(21px, 4.2vmin, 34px) is 32.3px on a 1366×768 Chromebook; with only
  // its bounds in --mm-px it was clamp(42, 32.3, 68) = 42px at 200% text.
  const scaled = (term) => `calc(${term} * var(--mm-text-scale, 1))`;
  assert.equal(scaleFluidClamps('clamp(calc(21 * var(--mm-px)), 4.2vmin, calc(34 * var(--mm-px)))'), `clamp(calc(21 * var(--mm-px)), ${scaled('4.2vmin')}, calc(34 * var(--mm-px)))`);
  assert.equal(scaleFluidClamps('clamp(1.35rem, 5vw, 2rem)'), `clamp(1.35rem, ${scaled('5vw')}, 2rem)`, 'rem bounds too');
  assert.equal(scaleFluidClamps("a ? 'clamp(1rem,3dvh,2rem)' : 'clamp(1rem, 2cqi, 2rem)'"), `a ? 'clamp(1rem,${scaled('3dvh')},2rem)' : 'clamp(1rem, ${scaled('2cqi')}, 2rem)'`);
  for (const untouched of ['clamp(1rem, 1rem + 2vw, 2rem)', 'clamp(12px, 50%, 20px)', '1.2em', 'min(4vw, 20px)']) assert.equal(scaleFluidClamps(untouched), untouched);
  // Only font sizes: a padding or line-height clamp is not text.
  const js = "const a = { fontSize: 'clamp(1rem, 4vw, 2rem)', padding: 'clamp(18px, 5vw, 30px)' };";
  const { output, changes } = transformJs(js);
  assert.equal(output, `const a = { fontSize: 'clamp(1rem, ${scaled('4vw')}, 2rem)', padding: 'clamp(18px, 5vw, 30px)' };`);
  assert.equal(changes, 1);
  const css = transformCss('.a { font-size: clamp(1rem, 4vw, 2rem); padding: clamp(8px, 2vw, 16px); line-height: clamp(1.2, 1vw, 1.5); }');
  assert.equal(css.output, `.a { font-size: clamp(1rem, ${scaled('4vw')}, 2rem); padding: clamp(8px, 2vw, 16px); line-height: clamp(1.2, 1vw, 1.5); }`);
  assert.deepEqual(transformJs(output), { output, changes: 0, skipped: 0 }, 'idempotent');
  assert.deepEqual(transformCss(css.output).changes, 0, 'idempotent (CSS)');
});

test('idempotent: a second run changes nothing', () => {
  const js = "const A = { fontSize: compact ? 12 : 14, lineHeight: '18px' };\nconst B = { fontSize: 'clamp(12px, 2vw, 16px)' };";
  const once = transformJs(js).output;
  assert.deepEqual(transformJs(once), { output: once, changes: 0, skipped: 0 });
  const css = '.a { font-size: clamp(12px, 2vw, 16px); line-height: 20px }';
  const onceCss = transformCss(css).output;
  assert.deepEqual(transformCss(onceCss), { output: onceCss, changes: 0, skipped: 0 });
});

test("job G's files: skipped unless G's own run asks for them", async () => {
  const { runCodemod } = await import('../../scripts/codemods/px-to-rem.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync: readText } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const root = mkdtempSync(path.join(tmpdir(), 'px-to-rem-'));
  mkdirSync(path.join(root, 'src/app'), { recursive: true });
  writeFileSync(path.join(root, 'src/App.css'), '.a { font-size: 14px; }');
  writeFileSync(path.join(root, 'src/app/Shell.jsx'), 'const a = { fontSize: 12 };');
  writeFileSync(path.join(root, 'src/Other.jsx'), 'const a = { fontSize: 12 };');
  assert.deepEqual(runCodemod({ root, paths: ['src'], write: true }).map((row) => row.file), ['src/Other.jsx']);
  assert.equal(readText(path.join(root, 'src/App.css'), 'utf8'), '.a { font-size: 14px; }', 'untouched by a default run');
  const g = runCodemod({ root, paths: ['src/App.css', 'src/app'], write: true, includeAppShell: true }).map((row) => row.file).sort();
  assert.deepEqual(g, ['src/App.css', 'src/app/Shell.jsx']);
  assert.match(readText(path.join(root, 'src/App.css'), 'utf8'), /font-size: calc\(14 \* var\(--mm-px\)\)/);
});

test("job G's files are never touched by default", () => {
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

// Review of #463: printed PDFs keep their sizes, even in G's run; a path that
// does not exist yet (src/app before G's split) is skipped, not a crash.
test('PDF generators are never rewritten; a missing path is skipped with a note', async () => {
  const { runCodemod, PRINT_ONLY } = await import('../../scripts/codemods/px-to-rem.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync: readText } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const root = mkdtempSync(path.join(tmpdir(), 'px-to-rem-pdf-'));
  mkdirSync(path.join(root, 'src/platform/resources'), { recursive: true });
  for (const file of PRINT_ONLY) writeFileSync(path.join(root, file), 'const s = { fontSize: 11 };');
  for (const includeAppShell of [false, true]) {
    const report = runCodemod({ root, paths: ['src', 'src/app'], write: true, includeAppShell });
    assert.deepEqual(report.map((row) => row.file), [], 'no PDF generator is touched');
    assert.deepEqual(report.missing, ['src/app'], 'the missing path is reported, not thrown');
  }
  for (const file of PRINT_ONLY) assert.equal(readText(path.join(root, file), 'utf8'), 'const s = { fontSize: 11 };');
  assert.ok(PRINT_ONLY.includes('src/platform/resources/assignmentWorksheetPdf.js') && PRINT_ONLY.includes('src/platform/resources/lessonNotesPdf.js'));
});

test("the worksheet visuals are paper: print-only, sized in px, drawn only by the PDF", async () => {
  // A teacher's 200% browser text must not grow the visuals' fixed-layout
  // tables inside a PDF whose other text stays in px (coordinator, #487).
  const { PRINT_ONLY } = await import('../../scripts/codemods/px-to-rem.mjs');
  const { readdirSync, statSync } = await import('node:fs');
  const visuals = 'src/platform/resources/assignmentWorksheetVisuals.js';
  assert.ok(PRINT_ONLY.includes(visuals));
  const source = readFileSync(visuals, 'utf8');
  assert.match(source, /tableLayout: 'fixed', fontSize: '12px'/);
  assert.doesNotMatch(source, /--mm-px/);
  // Whoever renders a visual must itself be print-only.
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => { const file = `${dir}/${name}`; if (statSync(file).isDirectory()) walk(file); else if (/\.jsx?$/.test(name)) files.push(file); });
  walk('src');
  const renderers = files.filter((file) => /import\s*\{[^}]*\brenderWorksheetVisual\b[^}]*\}\s*from\s*'[^']*assignmentWorksheetVisuals\.js'/.test(readFileSync(file, 'utf8')));
  assert.ok(renderers.length > 0, 'found the renderer');
  for (const file of renderers) assert.ok(PRINT_ONLY.includes(file), `${file} renders worksheet visuals but is not print-only`);
});
