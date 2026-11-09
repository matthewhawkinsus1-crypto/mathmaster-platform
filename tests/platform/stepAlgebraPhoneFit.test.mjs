/*
 * P-6: ON A PHONE, A LONG SIDE OF THE EQUATION FITS OR SCROLLS; IT IS NEVER CUT.
 *
 * The student walkthrough of 2026-11-06 found Honors L1 CW 6, CW 9 and PR 7
 * cut off on a 390-px phone ("2(3(x − 1) −" for 2(3(x − 1) − (x + 4))), with
 * nothing to scroll to: 14 of the lessons' 26 boards. Three causes, all fixed:
 *
 *   1. App.css drew every side at 20 px with !important below 720 px, beating
 *      the board's fit. The 20 is now the fit's cap, which a long side shrinks
 *      below.
 *   2. The fit measured once, before the mathematics was typeset, and never
 *      again. It now fits again when the expression's own width changes.
 *   3. Each side had half a phone's board. A long side now borrows the room a
 *      short side does not need.
 *
 * And a side still too wide at the 17-px floor scrolls. The laptop's sizes
 * are unchanged. The browser drivers measure the real layout; this holds the
 * arithmetic and the wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EQUATION_FIT_FLOOR_PX,
  expressionWidthChanged,
  fitEquationSide,
  phoneSideColumnWeight,
} from '../../src/platform/algebra/equationSideFit.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { declared, parseCss } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// The old formula, for the laptop: one estimate at the base size, the floor 17 px.
const laptopSize = ({ available, rendered, units, base, pxPerUnit = 1 }) => {
  const widthAtBase = Math.max(1, rendered * (base / units));
  return Math.max(17 / pxPerUnit, Math.min(base, base * (available / widthAtBase) * 0.975));
};

test('a laptop keeps its sizes: no cap, the same size as before for every side', () => {
  for (const base of [34, 30, 27, 23]) {
    for (const [available, rendered, units] of [[400, 120, base], [400, 300, base], [320, 610, base], [490, 900, 28], [320, 2000, base]]) {
      for (const pxPerUnit of [1, 2]) {
        const fitted = fitEquationSide({ available, rendered, units, base, pxPerUnit });
        assert.ok(Math.abs(fitted.size - laptopSize({ available, rendered, units, base, pxPerUnit })) < 1e-9, `${base}/${available}/${rendered}/${units}/${pxPerUnit}`);
      }
    }
  }
  // A missing or unreadable cap (the laptop: no --algebra-side-max-size) is no cap.
  assert.equal(fitEquationSide({ available: 400, rendered: 100, units: 34, base: 34, cap: Number.NaN }).size, 34);
});

test('a phone draws a short side at 20, as before, and shrinks a long one below it', () => {
  const phone = { available: 109, base: 34, cap: 20, pxPerUnit: 1 };
  // "3x + 5": 60 px at 20 fits, so it stays at 20 (the old !important size).
  assert.deepEqual(fitEquationSide({ ...phone, rendered: 60, units: 20 }), { size: 20, scrolls: false, widthPerUnit: 3 });
  // L1 Honors CW 9's sides, 119 and 122 px at 20, shrink to fit their room.
  for (const rendered of [119, 122]) {
    const fitted = fitEquationSide({ ...phone, rendered, units: 20 });
    assert.ok(fitted.size < 20 && fitted.size >= EQUATION_FIT_FLOOR_PX, `${rendered}: ${fitted.size}`);
    assert.ok(fitted.widthPerUnit * fitted.size <= phone.available, 'it fits');
    assert.equal(fitted.scrolls, false);
  }
});

test('a side too wide even at the floor scrolls instead of being cut, at 100% and 200% text', () => {
  // Honors PR 7's 2(3(x − 1) − (x + 4)): 191 px at 20 units.
  const at100 = fitEquationSide({ available: 109, rendered: 191, units: 20, base: 34, cap: 20, pxPerUnit: 1 });
  assert.equal(at100.size, EQUATION_FIT_FLOOR_PX, 'fitting wins down to the floor');
  assert.equal(at100.scrolls, true);
  // 200% text: one unit is 2 px, the cap 40 px, the floor still 17 px.
  const at200 = fitEquationSide({ available: 109, rendered: 382, units: 20, base: 34, cap: 20, pxPerUnit: 2 });
  assert.equal(at200.size, EQUATION_FIT_FLOOR_PX / 2);
  assert.equal(at200.scrolls, true);
  // Borrowed room is used before anything scrolls.
  assert.equal(fitEquationSide({ available: 170, rendered: 191, units: 20, base: 34, cap: 20 }).scrolls, false);
  // A side that fits never scrolls.
  assert.equal(fitEquationSide({ available: 400, rendered: 300, units: 34, base: 34 }).scrolls, false);
  // Nor one that is wider than the room the fit aims for but not than its box
  // (the 8 px of air): 112 px at the floor in a 109-px room of a 117-px box.
  const inTheAir = { available: 109, rendered: 112 * (20 / 17), units: 20, base: 34, cap: 20 };
  assert.equal(fitEquationSide(inTheAir).scrolls, true, 'measured against the room alone');
  assert.equal(fitEquationSide({ ...inTheAir, box: 117 }).scrolls, false, 'measured against its box');
  assert.equal(fitEquationSide({ ...inTheAir, box: 117 }).size, EQUATION_FIT_FLOOR_PX);
});

test('the fit measures again once the mathematics is typeset, and not on its own change of size', () => {
  // Typeset later (MathLive draws <math-span> once it is on screen): the
  // first fit saw an empty side.
  const empty = fitEquationSide({ available: 109, rendered: 4, units: 20, base: 34, cap: 20 });
  assert.equal(empty.size, 20);
  assert.equal(expressionWidthChanged({ fittedWidthPerUnit: empty.widthPerUnit, rendered: 191, units: 20 }), true, 'the typeset side is fitted again');
  // The fit's own change of size keeps the width per unit: no new fit.
  assert.equal(expressionWidthChanged({ fittedWidthPerUnit: 191 / 20, rendered: 191 * (17 / 20), units: 17 }), false);
  // A few fixed pixels (gaps, borders) are within the tolerance.
  assert.equal(expressionWidthChanged({ fittedWidthPerUnit: (191 + 6) / 20, rendered: 191 * (17 / 20) + 6, units: 17 }), false);
  // Nothing fitted yet: fit.
  assert.equal(expressionWidthChanged({ fittedWidthPerUnit: 0, rendered: 50, units: 20 }), true);
});

test('watching the expression cannot start a loop: the fit settles in a few steps', () => {
  // A side whose width is part proportional to its size, part fixed pixels,
  // fitted and re-fitted as the board does: each fit is drawn, the content
  // resizes, and the gate decides whether to fit again. The board's viewport
  // is 8 px wider than the room the fit aims for.
  const cases = [
    { perUnit: 9.55, fixed: 0, available: 109, base: 34, cap: 20 },
    { perUnit: 6, fixed: 30, available: 109, base: 34, cap: 20 },
    { perUnit: 4, fixed: 60, available: 150, base: 34, cap: null },
    { perUnit: 4, fixed: 90, available: 200, base: 34, cap: null },
    { perUnit: 14, fixed: 12, available: 300, base: 34, cap: null },
    { perUnit: 0, fixed: 186, available: 109, base: 34, cap: 20 },
  ];
  for (const { perUnit, fixed, available, base, cap } of cases) {
    const widthAt = (size) => perUnit * size + fixed;
    let units = cap || base;
    let fitted = fitEquationSide({ available, rendered: widthAt(units), units, base, cap });
    let fits = 1;
    const sizes = [units];
    for (;;) {
      const size = Math.abs(fitted.size - units) > 0.35 ? fitted.size : units;
      if (size === units) break;
      units = size;
      sizes.push(units);
      if (!expressionWidthChanged({ fittedWidthPerUnit: fitted.widthPerUnit, rendered: widthAt(units), units })) break;
      fitted = fitEquationSide({ available, rendered: widthAt(units), units, base, cap });
      fits += 1;
      assert.ok(fits < 12, `no settling: ${sizes.join(' → ')}`);
    }
    const steps = sizes.slice(1).map((size, index) => size - sizes[index]);
    assert.ok(steps.every((step) => step <= 0) || steps.every((step) => step >= 0), `one direction only: ${sizes.join(' → ')}`);
    const settled = fitEquationSide({ available, rendered: widthAt(units), units, base, cap });
    assert.ok(widthAt(units) <= available + 8 || settled.scrolls, `in view or scrolling: ${sizes.join(' → ')} at ${widthAt(units)} px`);
  }
});

test('a side laid out to its room\'s width (wrapped tokens) keeps its size', () => {
  // An open structure tool on a phone wraps its tokens at the room's width
  // (StepByStepAlgebra.css): its width is the room's at any size.
  for (const units of [20, 18, 17]) {
    assert.deepEqual(
      fitEquationSide({ available: 101, rendered: 109, units, base: 34, cap: 20, wraps: true }),
      { size: 20, scrolls: false, widthPerUnit: 109 / units },
    );
  }
});

test('on a phone a long side borrows the room a short side does not need', () => {
  assert.equal(phoneSideColumnWeight(18, 6), 2.4, 'at most 2.4 times the other side');
  assert.equal(phoneSideColumnWeight(6, 18), 1);
  assert.equal(phoneSideColumnWeight(12, 8), 1.5, 'in proportion to the lengths');
  assert.equal(phoneSideColumnWeight(8, 12), 1);
  assert.equal(phoneSideColumnWeight(9, 9), 1, 'equal sides, equal halves');
  assert.equal(phoneSideColumnWeight(1, 2), 1, 'a one-character side counts as four');
});

test('the board, App.css and the phone layout are wired to the fit', () => {
  const core = executableSource(read('src/StepByStepAlgebraCore.jsx'));
  const fit = region(core, 'function AutoFitEquationExpression', 'function OperationChip', 'the fit');
  // The fit's size comes from the shared arithmetic, with the screen's cap and
  // the wrapped-tokens case, and says when the side scrolls.
  assert.match(fit, /const next = fitEquationSide\(\{[\s\S]*?cap: Number\.parseFloat\(window\.getComputedStyle\(viewport\)\.getPropertyValue\('--algebra-side-max-size'\)\),[\s\S]*?wraps: contentStyle\.getPropertyValue\('--algebra-side-wraps'\)\.trim\(\) === '1',[\s\S]*?\}\);/);
  assert.match(fit, /setScrolls\(sideScrolls\(\{ widthPerUnit: next\.widthPerUnit, size, box: viewport\.clientWidth \}\)\);/);
  assert.match(fit, /data-scrolls=\{scrolls \? 'true' : undefined\}/);
  assert.match(fit, /tabIndex=\{focusable \? 0 : undefined\}/);
  // A phone's shares ride the stage; the laptop's columns are as they were.
  const board = region(core, 'const adaptiveBalanceColumns = mobileInteraction.isMobile', 'const balanceStagingSide', 'the columns');
  assert.match(board, /\? undefined\s*: `minmax\(0, \$\{sideColumnWeight\(leftVisualLength\)\}fr\) 56px minmax\(0, \$\{sideColumnWeight\(rightVisualLength\)\}fr\)`;/);
  assert.match(board, /'--algebra-side-left': `minmax\(0, \$\{phoneSideColumnWeight\(leftVisualLength, rightVisualLength\)\}fr\)`/);
  assert.match(board, /'--algebra-side-right': `minmax\(0, \$\{phoneSideColumnWeight\(rightVisualLength, leftVisualLength\)\}fr\)`/);
  assert.match(core, /: adaptiveBalanceColumns \? \{ gridTemplateColumns: adaptiveBalanceColumns \} : phoneBalanceShares\}/);

  // App.css: below 720 px no rule sizes a side over the fit any more; the 20
  // is the fit's cap, and the stage's halves come from the board's shares.
  const app = read('src/App.css');
  const phone = region(app, '@media (max-width: 720px) {\n  .algebra-operation-grid', '@keyframes mathmasterSnapReveal', 'the phone algebra rules');
  assert.doesNotMatch(phone, /\.algebra-equation-side\s*\{[^}]*font-size/, 'no font size on a side: it would beat the fit');
  assert.match(phone, /\.algebra-expression-fit-viewport\s*\{\s*--algebra-side-max-size: 20;\s*\}/);
  assert.match(phone, /\.algebra-equation-stage\s*\{\s*grid-template-columns: var\(--algebra-side-left, minmax\(0, 1fr\)\) 34px var\(--algebra-side-right, minmax\(0, 1fr\)\) !important;/);
  const css = read('src/StepByStepAlgebra.css');
  assert.match(css, /\.is-mobile-tap-layout \.algebra-connected-balance \{[^}]*grid-template-columns: var\(--algebra-side-left, minmax\(0, 1fr\)\) 34px var\(--algebra-side-right, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.algebra-expression-fit-content:has\(> \.is-inline-structure\) \{[^}]*--algebra-side-wraps: 1;/);
  // Only a side the fit says scrolls can scroll, and from its start.
  assert.match(css, /\.algebra-expression-fit-viewport\[data-scrolls="true"\] \{[^}]*justify-content: flex-start;[^}]*overflow-x: auto;/);
  assert.match(css, /\.algebra-expression-fit-viewport \{[^}]*overflow: hidden;/);
});

test('a phone on its side fits a side as an upright phone does: the 18 there is the fit\'s cap', () => {
  // MathToolMobileLayout.css drew every side at 18 px with !important on a
  // landscape phone, which beat the board's fit, the fault P-6 fixed upright.
  const LANDSCAPE = '(orientation: landscape) and (max-height: 500px)';
  const rules = parseCss(read('src/components/student/MathToolMobileLayout.css'));
  const landscape = rules.filter((rule) => rule.atRules.some((atRule) => atRule.includes(LANDSCAPE)));
  assert.ok(landscape.length > 20, 'the landscape rules are read');
  const sizedSides = landscape.filter((rule) => rule.selectors.some((selector) => /\.algebra-(equation|connected)-side(\s|$)/.test(selector)) && 'font-size' in rule.declarations);
  assert.deepEqual(sizedSides.map((rule) => rule.selectors.join(', ')), [], 'no font size on a side: it would beat the fit');
  assert.deepEqual(
    declared(rules, '.mathmaster-question-container.mode-landscape .algebra-expression-fit-viewport', '--algebra-side-max-size', { media: LANDSCAPE }),
    { value: '18', important: false },
  );
  // The stage's two columns take each side's share from the board, as upright.
  assert.deepEqual(
    declared(rules, '.mathmaster-question-container.mode-landscape .algebra-equation-stage', 'grid-template-columns', { media: LANDSCAPE }),
    { value: 'var(--algebra-side-left, minmax(0, 1fr)) 34px var(--algebra-side-right, minmax(0, 1fr))', important: true },
  );
  // The upright phone keeps its 20, and nothing sizes a side for every screen.
  const app = parseCss(read('src/App.css'));
  assert.deepEqual(declared(app, '.algebra-expression-fit-viewport', '--algebra-side-max-size', { media: '(max-width: 720px)' }), { value: '20', important: false });
  assert.equal(declared(rules, '.algebra-expression-fit-viewport', '--algebra-side-max-size', { media: null }), null);

  // With the cap at 18 a side that fits looks as it did: at 844x390 (CI's
  // fonts) Honors PR 7's 2(3(x − 1) − (x + 4)) is 172 px at 18 in a 228-px box.
  assert.deepEqual(fitEquationSide({ available: 220, rendered: 172, units: 18, base: 27, cap: 18 }), { size: 18, scrolls: false, widthPerUnit: 172 / 18 });
  // At 200% text one unit is 2 px: the same side was drawn at 36 px, 344 px
  // wide, and cut by 116 px. With its share of the board (a 331-px box) the
  // fit draws it at about 33 px, and it fits; the floor is still 17 px.
  const at200 = fitEquationSide({ available: 323, rendered: 344, units: 18, base: 27, cap: 18, pxPerUnit: 2 });
  assert.ok(at200.size < 18 && at200.size * 2 >= EQUATION_FIT_FLOOR_PX, `${at200.size}`);
  assert.ok(Math.abs(at200.size * 2 - 33) < 0.5, `${at200.size * 2} px`);
  assert.ok(at200.widthPerUnit * at200.size <= 323, 'it fits');
  assert.equal(at200.scrolls, false);
});

