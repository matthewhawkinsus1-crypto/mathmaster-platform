/*
 * KEYS A STUDENT CAN WRITE (GR10).
 *
 * Five Path families keyed the generator's own text on some draws: `x^1`,
 * `(x-(0))`, `+ 0`, `1x`, `+(-2)`, and `*` before a cube root, which the
 * expression reader does not take as a product. The natural simplified
 * answer was refused on Path and on secure tests: 6x√x for 6*x^1*sqrt(x),
 * y=x²−2 for y=(x-(0))^2- 2, 4x(x−2) for 4*x*(1*x+(-2)), and 3x²∛(x²) on
 * every draw of the cube-root family. The keys now use the zero- and
 * one-aware filters (`pow`, `xshift`, `coef`, `xterm`, `term`), and each old
 * template stays an accepted form, so every verdict a student already has
 * stands. These tests draw every variant of the five families and pin:
 *
 *   - the natural answer, in the spellings a student's surface sends, is
 *     right under both graders (the assignment matcher and the Path server);
 *   - a near miss is still wrong;
 *   - no drawn key carries the bookkeeping any more;
 *   - the old template is still an accepted form.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { generatePathInstance, effectivePathVariants } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');
const { gradeResponse } = require('../../functions/lib/mathPath.js');

const seedDocs = (course) => {
  const data = JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${course}_pathQuestionBank_seed.json`, import.meta.url), 'utf8'));
  return Array.isArray(data) ? data : (data.documents || data.items || data.questions);
};
const power = (base, exponent) => (exponent === 1 ? base : `${base}^${exponent}`);
const leading = (coefficient, term) => (coefficient === 1 ? term : coefficient === -1 ? `-${term}` : `${coefficient}${term}`);
const signed = (coefficient, term = '') => (coefficient === 0 ? '' : `${coefficient < 0 ? '-' : '+'}${Math.abs(coefficient) === 1 && term ? '' : Math.abs(coefficient)}${term}`);
const shifted = (h) => (h === 0 ? 'x' : `(x${h < 0 ? '+' : '-'}${Math.abs(h)})`);

const FAMILIES = [
  ['algebra2', 'mm_A2_7G_v2_square-root-variable-power', { answer: (p) => `${p.k}${power('x', p.m)}\\sqrt{x}` }],
  ['algebra2', 'mm_A2_7G_v2_cube-root-variable-power', { answer: (p) => `${p.k}${power('x', p.m)}\\sqrt[3]{${power('x', p.r)}}` }],
  ['algebra2', 'mm_A2_3A_v2_graph-linear-quadratic-system', {
    line: (p) => `y=${leading(p.m, 'x')}${signed(p.b)}`,
    quadratic: (p) => `y=${shifted(p.h)}^2${signed(p.k)}`,
  }],
  ['algebra2', 'mm_A2_3C_v2_tangent-repeated-root', {
    reduced: (p) => `x^2${signed(p.C, 'x')}${signed(p.D)}=0`,
    factor: (p) => `${shifted(p.u)}^2=0`,
  }],
  ['algebra1', 'mm_A_10D_v2_reverse-factor-from-expanded', {
    answer: (p) => (p.c === undefined
      ? `${p.g}x(${leading(p.a, 'x')}${signed(p.b)})`
      : `${p.g}x(${leading(p.a, 'x^2')}${signed(p.b, 'x')}${signed(p.c)})`),
  }],
];
const OLD_TEMPLATES = [
  '{{k}}*x^{{m}}*sqrt(x)', '{{k}}*x^{{m}}*\\sqrt[3]{x^{{r}}}', 'y={{m}}x{{b|signed}}', 'y=(x-({{h}}))^2{{k|signed}}',
  'x^2{{C|signed}}x{{D|signed}}=0', '(x-({{u}}))^2=0', '{{g}}x({{a}}x^2{{b|signed}}x{{c|signed}})',
  '{{g}}*x*({{a}}*x+({{b}}))', '{{g}}*x*({{a}}*x^2+({{b}})*x+({{c}}))',
];
const pathGrade = async (answer, field) => (await gradeResponse({ fields: [field] }, { responses: { [field.id]: answer } })).isCorrect;

test('every variant of the five families: the natural answer is right under both graders, a near miss is not', async () => {
  let graded = 0;
  for (const [course, id, fields] of FAMILIES) {
    const document = compilePathRecordForStorage({ ...seedDocs(course).find((doc) => doc.id === id), active: true }).document;
    for (const { template, variant } of effectivePathVariants(document)) {
      for (let draw = 0; draw < 40; draw += 1) {
        const { question, parameters } = generatePathInstance(template, `gr10-${variant?.coverageKey || 'base'}-${draw}`);
        assert.ok(question, `${id}: draw ${draw}`);
        for (const [fieldId, natural] of Object.entries(fields)) {
          const field = question.responseFields.find((entry) => entry.id === fieldId);
          if (!field) continue;
          const answer = natural(parameters);
          const label = `${id} ${variant?.coverageKey || 'base'} ${fieldId}: ${answer} for ${field.expected}`;
          assert.equal(matchesFieldAnswer(answer, field), true, label);
          assert.equal(matchesFieldAnswer(answer.replace(/\^(\d+)/g, '^{$1}'), field), true, `${label} (MathLive braces)`);
          assert.equal(await pathGrade(answer, field), true, `${label} (Path)`);
          assert.doesNotMatch(field.expected, /\^1(?!\d)|\(x-\(|\+ 0(?!\.)|(?:^|[^\d])1x|\+\(|\*\\sqrt/, `${label}: no generator bookkeeping`);
          const nearMiss = answer.replace(/^(y=)?(-?\d+)/, (whole, y = '', n) => `${y}${Number(n) + 1}`);
          if (nearMiss !== answer) {
            assert.equal(matchesFieldAnswer(nearMiss, field), false, `${label}: ${nearMiss} is wrong`);
            assert.equal(await pathGrade(nearMiss, field), false, `${label}: ${nearMiss} is wrong (Path)`);
          }
          graded += 1;
        }
      }
    }
  }
  assert.ok(graded >= 400, `graded ${graded}`);
});

test('each old key template is still an accepted form, so a verdict a student already has stands', () => {
  const accepted = new Set();
  for (const [course, id] of FAMILIES) {
    const family = seedDocs(course).find((doc) => doc.id === id);
    [family, ...(family.variants || [])].forEach((owner) => (owner.responseFields || []).forEach((field) => (field.accepted || []).forEach((form) => accepted.add(form))));
  }
  OLD_TEMPLATES.forEach((template) => assert.ok(accepted.has(template), template));
});
