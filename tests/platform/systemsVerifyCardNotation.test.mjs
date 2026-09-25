import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { substituteIntoEquation, substitutedEquationLatex } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Live QA round 2: the verify card read "2 * (20/9) - (-(23/9)) = 7" — the
// machine string, asterisk and all. Round 1 saw "(2·(1)) = 2·(1)".
test('the verify card shows the substituted equation in classroom notation', () => {
  const substituted = substituteIntoEquation(substituteIntoEquation('2x - y = 7', 'x', '20/9'), 'y', '-(23/9)');
  const latex = substitutedEquationLatex(substituted).replace(/\s+/g, '');
  assert.doesNotMatch(latex, /\*|\\cdot/);
  assert.equal(latex, '2\\left(\\frac{20}{9}\\right)-\\left(-\\frac{23}{9}\\right)=7');
  assert.equal(substitutedEquationLatex('not an equation'), null);

  for (const path of ['src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', 'src/tools/systemsWorkspace/SubstitutionReductionMode.jsx']) {
    const source = read(path);
    const card = source.slice(source.indexOf('<span>Values substituted</span>'), source.indexOf('mathmaster-systems-verification-arithmetic') > 0 ? source.indexOf('Left side simplifies to', source.indexOf('<span>Values substituted</span>')) : undefined);
    assert.match(card, /const latex = substitutedEquationLatex\(substituted\);\s*return <MathDisplay value=\{latex \|\| substituted\} format=\{latex \? 'latex' : 'ascii-math'\} \/>;/, path);
  }
});
