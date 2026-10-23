// TWO SYNTHETIC-DIVISION VIEWS SHARE ONE V5 ACTION.
//
// Dividing Polynomials (ax + b, divide through by a first) and the Remainder
// and Factor Theorems (x − r, then P(r), the quotient, is it a factor) both
// author `studentActions: ["syntheticDivision"]` with no mode. They were built
// on separate branches; merged, the action has to open the view each lesson
// was written for, by how it writes its polynomials: text for the first,
// coefficient arrays or a candidate root for the second.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

// A real lesson (so every required field is there) with one synthetic
// division item's polynomial swapped for the shape under test.
const DIVIDING = 'teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json';
const compiledMode = (polynomial) => {
  const intent = JSON.parse(readFileSync(DIVIDING, 'utf8'));
  const probe = JSON.stringify(intent).includes('"dp-cw-8"') ? 'dp-cw-8' : null;
  assert.ok(probe, 'the Dividing lesson still has dp-cw-8');
  const visit = (node) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      if (node.questionId === probe) node.polynomial = polynomial;
      Object.values(node).forEach(visit);
    }
  };
  visit(intent);
  const compiled = compileAuthoringIntentV5(intent);
  return compiled.package.sections.flatMap((section) => section.questions).find((question) => question.questionId === probe).mode;
};

test('text opens Dividing Polynomials\' view; coefficient arrays or a candidate root open the Remainder and Factor Theorems\' view', () => {
  assert.equal(compiledMode({ dividend: 'x^3-4x^2+6x-4', divisor: 'x-2' }), 'syntheticDivision');
  assert.equal(compiledMode({ dividend: '4y^3-6y^2+4y-1', divisor: '2y-1' }), 'syntheticDivision');
  assert.equal(compiledMode({ dividend: [1, 6, 2], candidateRoot: 4, ask: ['value', 'quotient'] }), 'synthetic');
  assert.equal(compiledMode({ dividend: [1, 8, 17, 10], divisor: [1, 2] }), 'synthetic', 'x + 2 as coefficients (rf-cw-5)');
});

test('every real lesson item lands on the view it was written for', () => {
  const lessons = [
    ['teacher-import-jsons/algebra2-honors-module2', 'syntheticDivision'],
    ['teacher-import-jsons/algebra2-polynomials-radicals', 'synthetic'],
    ['teacher-import-jsons/algebra2-polynomials-radicals-honors', 'synthetic'],
  ];
  lessons.forEach(([folder, expected]) => {
    const modes = readdirSync(folder).filter((name) => name.endsWith('.json')).flatMap((name) => {
      const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(`${folder}/${name}`, 'utf8')));
      return compiled.package.sections.flatMap((section) => section.questions)
        .filter((question) => question.type === 'polynomialWorkshop' && /^synthetic/.test(String(question.mode)))
        .map((question) => `${question.questionId}:${question.mode}`);
    });
    assert.ok(modes.length > 0, `${folder} has synthetic division items`);
    modes.forEach((entry) => assert.ok(entry.endsWith(`:${expected}`), `${folder}: ${entry}`));
  });
});
