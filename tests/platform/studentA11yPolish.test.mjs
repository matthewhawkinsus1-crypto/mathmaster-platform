/*
 * STUDENT PASS 3, A11Y-10 / A11Y-11 / A11Y-12 (docs/qa/student-experience-pass-3/
 * 04-tools-and-accessibility.md).
 *
 *   A11Y-10  On a phone, beside Submit, the work bar is icons only, and Undo (↶)
 *            and Reset (↺) were two near-identical arrows side by side. They
 *            keep their word as a caption (tests/browser/figureDescriptions.mjs
 *            measures it at 390x844).
 *   A11Y-11  The scrolls the platform starts, and the Scratchpad's slide-up,
 *            respect "reduce motion"; the small targets named in the report
 *            are 44px.
 *   A11Y-12  Instructions say "choose" or "plot", and name the keyboard route,
 *            instead of "click".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('A11Y-10: Undo and Reset keep their word under the icon where the bar drops words', () => {
  const undo = executableSource(read('src/components/common/UniversalUndoButton.jsx'));
  assert.match(undo, /<span aria-hidden="true">↶<\/span><span className="mathmaster-action-label mathmaster-action-label--kept"> Undo<\/span>/);
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /<span aria-hidden="true">↺<\/span><span className="mathmaster-action-label mathmaster-action-label--kept"> Reset<span className="mathmaster-action-label-long"> Question<\/span><\/span>/);
  // No other bar tool keeps its word: ✎, the calculator and 💡 are distinct.
  assert.equal((engine.match(/mathmaster-action-label--kept/g) || []).length, 1, 'Reset only, in the engine');
  const css = executableSource(read('src/components/student/MathToolMobileLayout.css'));
  const phone = region(css, '@media (max-width: 768px) and (orientation: portrait) {', '\n}\n', 'the phone portrait rules');
  // Beside Submit, and below 385px: the two places the words are hidden.
  for (const scope of ['.portrait-action-bar[data-has-primary="true"] .mathmaster-action-label.mathmaster-action-label--kept {', '.portrait-action-bar .mathmaster-action-label.mathmaster-action-label--kept {']) {
    const rule = region(phone, scope, '}', scope);
    assert.match(rule, /position:\s*static;[\s\S]*clip:\s*auto;/, `${scope} is shown`);
  }
});

test('A11Y-11: platform scrolls and the Scratchpad slide follow "reduce motion"', async () => {
  const { scrollMotion } = await import('../../src/motionPreference.js');
  const original = globalThis.window;
  try {
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    assert.equal(scrollMotion(), 'auto');
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(scrollMotion(), 'smooth');
  } finally {
    globalThis.window = original;
  }
  for (const [file, count] of [['src/QuestionEngine.jsx', 1], ['src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', 2], ['src/tools/systemsWorkspace/EliminationReductionMode.jsx', 1]]) {
    const source = executableSource(read(file));
    assert.equal((source.match(/behavior: scrollMotion\(\)/g) || []).length, count, `${file}: every platform-started scroll`);
    assert.doesNotMatch(source, /behavior: 'smooth'/, `${file}: no unconditional smooth scroll`);
    assert.match(source, /^import \{[^}]*\bscrollMotion\b[^}]*\} from '(?:\.\/|\.\.\/\.\.\/)motionPreference\.js';$/m, `${file} imports it`);
  }
  const scratchpad = executableSource(read('src/ScratchpadOverlay.jsx'));
  assert.match(scratchpad, /^import \{ prefersReducedMotion \} from '\.\/motionPreference\.js';$/m);
  assert.match(scratchpad, /animation: prefersReducedMotion\(\) \? 'none' : 'scratchpadSlideUp 220ms ease-out',/);
});

test('A11Y-11: the small targets the report named are 44px', () => {
  const table = executableSource(read('src/tools/linearTableWorkbench/LinearTableWorkbench.jsx'));
  assert.match(table, /onClick=\{\(\) => editEvidence\(index\)\}[^\n]*minHeight: 44,/);
  assert.match(table, /onClick=\{\(\) => removeEvidence\(index\)\}[^\n]*minHeight: 44,/);
  const sort = executableSource(read('src/tools/openSortBoard/OpenSortBoard.jsx'));
  assert.match(sort, /onClick=\{\(\) => returnItem\(id\)\}[^\n]*minHeight: 44,/);
  const relation = executableSource(read('src/tools/relationMapping/RelationMapping.jsx'));
  assert.match(relation, /onClick=\{\(\) => togglePlottedPoint\(x, y\)\} style=\{\{ \.\.\.secondaryButton, padding: '7px 10px', minHeight: 44 \}\}/);
  assert.match(relation, />Clear plot<\/button>/);
  assert.doesNotMatch(relation, /minHeight: 3\d\b/);
  const scratchpad = executableSource(read('src/ScratchpadOverlay.jsx'));
  for (const name of ["setTool('pen')} aria-pressed", "setTool('eraser')} aria-pressed", 'onClick={clearAll}']) {
    assert.match(scratchpad, new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*style=\\{\\{ minHeight: 44,`), `${name}: 44px`);
  }
  assert.match(region(scratchpad, 'aria-label={`${item.label} ink`}', '/>', 'an ink swatch'), /width: '44px',\s*height: '44px',/);
});

test('A11Y-12: instructions name the action, not the mouse, and the keyboard route', () => {
  const relation = executableSource(read('src/tools/relationMapping/RelationMapping.jsx'));
  assert.match(relation, /'No arrows drawn yet\. Choose a value on the left, then the value on the right it maps to\.'/);
  assert.match(relation, /'Choose a value in the left column, then the value on the right it maps to \(click or tap, or Tab to a value and press Enter\)\.'/);
  assert.match(relation, /'Move the pointer over the grid, or focus it and use the arrow keys, to see the exact coordinate before you plot\.'/);
  const steps = region(relation, '<TaskCard', '/>', 'the mapping steps');
  assert.doesNotMatch(steps, /\bClick\b|before you click/, 'the steps do not assume a mouse');
  const graphing = executableSource(read('src/tools/graphing2/Graphing2.jsx'));
  assert.match(region(graphing, 'const nextInstruction = (', ');\n', 'the next instruction'), /'Plot your first point: click or tap the grid, or focus it and use the arrow keys and Enter\.'/);
  // The changed feedback sentence keeps its Spanish (Translate offers it).
  const spanish = read('src/platform/language/packs/esSupport.js');
  assert.match(spanish, /\['No arrows drawn yet\.', '[^']+'\],/);
  assert.match(spanish, /\['Choose a value on the left, then the value on the right it maps to\.', '[^']+'\],/);
  assert.match(spanish, /export const supportSentences = \[[^\]]*\.\.\.toolChecks,/);
});
