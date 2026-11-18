/*
 * SIMPLIFY ANSWERS AS IT DID BEFORE ITS RULES WERE KEPT: A SWEEP.
 *
 * Both of the platform's mathjs instances read simplify's default rules from
 * text once (functions/shared/algebra/simplifyRulesParsedOnce.mjs); before,
 * mathjs read them on every call. This simplifies every expression the
 * platform simplifies that the sweep collects, with mathjs's own simplify on
 * a fresh instance (the platform's before) and with the platform's, and
 * compares the answers: the text, the text as the platform prints it, and the
 * node structure, or the error's message.
 *
 *   fixtures/simplifySweepCorpus.json
 *     recorded    what the platform's own code simplified while the tests
 *                 that name safeMath, simplify, answerEquivalence, a grader
 *                 or Step Algebra ran (643 files: Step Algebra's readings and
 *                 its sweeps over the banks, the graders' equivalence checks,
 *                 the tools' workspaces), recorded at each instance's simplify
 *     answerKeys  every answer key and accepted answer in the lesson banks,
 *                 the Path banks (their generators drawn four times), the demo
 *                 bank and the question families (each dealt), as simplify
 *                 reads it: the text, LaTeX read the way the platform reads
 *                 it, and the two sides of an equation or inequality and
 *                 their difference
 *   helpers/simplifySweepExpressions.mjs
 *     generated fractions, radicals, exponents, logarithms, inequalities
 *     and implicit products
 *
 * The graders' instance (safeMath.mjs) simplifies everything an answer may
 * contain; the client's (src/platform/math/mathjs.js) what safeMath refuses
 * to read, and every fourth expression besides. Nothing may differ, and no
 * answer may hold a node simplify kept.
 *
 * Every run sweeps one expression of each shape the fixture holds (the same
 * text with other numbers is the same shape: 1,672 recorded, 3,338 answer
 * keys) and 1,000 generated ones, about a minute's work less than all of it.
 * SIMPLIFY_SWEEP=full sweeps every expression and 3,000 generated: run it
 * when simplify, its rules or mathjs change (20,784 expressions, nothing
 * differed, on 2026-11-16).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, create } from 'mathjs';

import { safeMathInstance, parse as safeParse, simplify as safeSimplify } from '../../functions/shared/algebra/safeMath.mjs';
import { math as clientMath, simplify as clientSimplify } from '../../src/platform/math/mathjs.js';
import { generatedExpressions } from './helpers/simplifySweepExpressions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = JSON.parse(readFileSync(path.join(HERE, 'fixtures/simplifySweepCorpus.json'), 'utf8'));

// mathjs's own simplify, as both instances had it before.
const before = create(all);

// The answer as a caller can tell it apart, and the node it came in.
const simplified = (run) => {
  try {
    const node = run();
    return { node, answer: { text: node.toString(), printed: node.toString({ parenthesis: 'auto', implicit: 'hide' }), structure: JSON.stringify(node) } };
  } catch (error) {
    return { node: null, answer: { error: String(error?.message || error) } };
  }
};

// A node the platform built in code (its text would not give it back), built
// again from its structure with each instance's own node classes.
const nodeFor = (instance, structure) => JSON.parse(JSON.stringify(structure), (key, value) => (
  value && typeof value === 'object' && typeof value.mathjs === 'string' && instance[value.mathjs]?.fromJSON ? instance[value.mathjs].fromJSON(value) : value));

// What safeMath refuses to read (a name an answer may not use, a power past
// 1e308) is not simplified there; the client's instance answers for it.
const safeMathReads = (text) => {
  if (typeof text !== 'string') return true;
  try {
    safeParse(text);
    return true;
  } catch {
    try {
      before.parse(text);
      return false;
    } catch {
      return true;
    }
  }
};

const sweep = (expressions) => {
  const differences = [];
  let throughSafeMath = 0;
  let throughClient = 0;
  expressions.forEach((entry, index) => {
    const text = typeof entry === 'string' ? entry : entry.node;
    const input = (instance) => (typeof entry === 'string' ? entry : nodeFor(instance, entry.node));
    const expected = simplified(() => before.simplify(input(before))).answer;
    const afters = [];
    if (safeMathReads(entry)) {
      afters.push(['safeMath', simplified(() => safeSimplify(input(safeMathInstance)))]);
      throughSafeMath += 1;
    }
    if (!afters.length || index % 4 === 0 || typeof entry !== 'string') {
      afters.push(['client', simplified(() => clientSimplify(input(clientMath)))]);
      throughClient += 1;
    }
    for (const [instance, { node, answer }] of afters) {
      if (node && node.filter((child) => Object.isFrozen(child)).length) differences.push(`${instance}: ${JSON.stringify(text)} holds a kept rule node`);
      try {
        assert.deepEqual(answer, expected);
      } catch {
        differences.push(`${instance}: ${JSON.stringify(text)}\n    before ${JSON.stringify(expected).slice(0, 300)}\n    after  ${JSON.stringify(answer).slice(0, 300)}`);
      }
    }
  });
  return { differences, throughSafeMath, throughClient };
};

const check = (name, expressions, minimum) => {
  test(`${name}: ${expressions.length} expressions simplify exactly as before`, () => {
    assert.ok(expressions.length >= minimum, `the sweep has ${expressions.length} of them`);
    const { differences, throughSafeMath, throughClient } = sweep(expressions);
    assert.deepEqual(differences.slice(0, 20), [], `${differences.length} of ${expressions.length} differ`);
    assert.ok(throughSafeMath > expressions.length / 2 && throughClient >= expressions.length / 4);
  });
};

// One of each shape: the first expression (the fixture is sorted) with each
// text that differs from it only in its numbers.
const FULL = process.env.SIMPLIFY_SWEEP === 'full';
const shapes = (expressions) => {
  if (FULL) return expressions;
  const seen = new Set();
  return expressions.filter((entry) => {
    const shape = (typeof entry === 'string' ? entry : JSON.stringify(entry)).replace(/\d+(\.\d+)?/g, '#');
    if (seen.has(shape)) return false;
    seen.add(shape);
    return true;
  });
};

check('what the platform\'s own code simplified while its tests ran', shapes(CORPUS.recorded), FULL ? 6000 : 1500);
check('the banks\' and families\' answer keys and accepted answers', shapes(CORPUS.answerKeys), FULL ? 10000 : 3000);
check('generated fractions, radicals, exponents, logs, inequalities and implicit products', generatedExpressions(FULL ? 3000 : 1000), FULL ? 3000 : 1000);
