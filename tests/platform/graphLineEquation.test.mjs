/*
 * GRAPHLINE SHOWS AN EQUATION ONLY WHEN THE QUESTION GIVES ONE.
 *
 * A graphing question that gives a graph and no m, b or equationLatex showed
 * "y = undefinedx - NaN" in its equation box, and its details for the grade
 * record read "Identify the slope and y-intercept for y = undefinedx - NaN".
 * Now there is no equation box, and the details use the plain instruction. An
 * authored m and b still write the equation as before, and equationLatex still
 * wins over them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const source = readFileSync(new URL('../../src/GraphLine.jsx', import.meta.url), 'utf8');
// The helper is plain JavaScript at the top of the module: read it without a JSX build.
const helper = source.slice(source.indexOf('export const graphLineEquation'), source.indexOf('export default function GraphLine'));
const graphLineEquation = new Function(`${helper.replace('export const graphLineEquation', 'const graphLineEquation')}; return graphLineEquation;`)();

test('a question with no m, b or equationLatex has no equation to show', () => {
  for (const question of [{}, { m: undefined, b: undefined }, { m: null, b: null }, { m: '', b: '' }, { m: 2 }, { b: -3 }, { m: 'x', b: 1 }]) {
    const equation = graphLineEquation(question);
    assert.deepEqual([equation.authored, equation.generated, equation.displayed], [false, '', ''], JSON.stringify(question));
  }
});

test('an authored m and b write the equation as before, and equationLatex wins', () => {
  assert.equal(graphLineEquation({ m: 2, b: -3 }).displayed, 'y = 2x - 3');
  assert.equal(graphLineEquation({ m: '0.5', b: '4' }).displayed, 'y = 0.5x + 4');
  assert.equal(graphLineEquation({ m: -1, b: 0 }).displayed, 'y = -1x + 0');
  assert.equal(graphLineEquation({ m: 2, b: -3, equationLatex: 'y=2x-3' }).displayed, 'y=2x-3');
  assert.equal(graphLineEquation({ equationLatex: 'y=\\frac{1}{2}x' }).displayed, 'y=\\frac{1}{2}x');
});

test('GraphLine draws the equation box, the generated graph and the details only from an equation it has', () => {
  const code = executableSource(source);
  assert.match(code, /\{showEquation && displayedEquation && <div/);
  assert.match(code, /if \(showGraph && authoredLine\) return \{/);
  assert.match(code, /generatedEquation \? `Identify the slope and y-intercept for \$\{generatedEquation\}` : 'Identify the slope and the y-intercept\.'/);
  assert.doesNotMatch(code, /`y = \$\{m\}x \$\{b >= 0/, 'the old unguarded template is gone');
});
