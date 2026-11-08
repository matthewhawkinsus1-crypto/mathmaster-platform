/*
 * "PRACTISE ONE LIKE THIS" FOR AN nTH ROOT OF A MONOMIAL (practice coverage,
 * 2026-11: Algebra II's radicals lessons — Radical Expressions, its Honors twin,
 * nth Roots, Operations with Radical Expressions — offered a practice for none
 * of their Classwork and Practice items).
 *
 * Their product-property items now get the item itself with new numbers
 * (src/platform/supports/workedExample/radicalVariant.js, numericVariant.js's
 * fifth kind). Every variant is checked here independently of how it was made,
 * from the item's roots written out below (the lesson's text), with mathjs:
 *   - which items get one, and why some others do not;
 *   - the same index, letters, what stays under the root, bars and signs, a 1
 *     kept, never easier, and every key in simplest radical form;
 *   - each key has its root's value, at positive letters and, where a bar is
 *     written, at a negative one;
 *   - never one of the item's answers, nor anything with a key's value;
 *   - every "=" its steps write is true;
 *   - the item's own boxes grade every key right, and the root unsimplified, a
 *     number off by one, the bars left off or the item's own key wrong;
 *   - the student's answer is checked by that same box;
 *   - only after the item closes (the Hint panel offers none), in Spanish too;
 *   - and the items' own hints, back-up steps and worked solutions are exactly as
 *     they were (tests/platform/fixtures/radicalSupportSurfaces.json, saved from
 *     the commit before this kind).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create, all } from 'mathjs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  PRACTICE_LIKE_THIS_ROLES,
  PRACTICE_SOURCE,
  PRACTICE_VERDICT,
  buildPracticeLikeThis,
  checkPracticeAnswers,
  checkPracticePart,
} from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { NUMERIC_VARIANT_KIND, buildNumericVariant } from '../../src/platform/supports/workedExample/numericVariant.js';
import { readRadicalItem } from '../../src/platform/supports/workedExample/radicalVariant.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { supportSurfacesOf } from './helpers/supportSurfaces.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const math = create(all);
const EXPRESSIONS = 'teacher-import-jsons/algebra2-polynomials-radicals/3_Radical_Expressions.json';
const EXPRESSIONS_HONORS = 'teacher-import-jsons/algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json';
const NTH_ROOTS = 'teacher-import-jsons/algebra2-honors-radicals/L1_nth_Roots.json';
const OPERATIONS = 'teacher-import-jsons/algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json';

/*
 * Each varied item's boxes, written out from the lesson: the root each box is
 * about (outside · ⁿ√(c · letters)), what the box asks — its simplest form
 * ('root'), the radicand's largest perfect nth-power factor ('factor') or the
 * radicand as a perfect power ('base') — and whether its letters may be
 * negative (the key's bars say so).
 */
const r = (role, outside, n, c, powers, anyReal = false) => ({ role, outside, n, c, powers, anyReal });
const WORK = Object.freeze({
  [EXPRESSIONS]: {
    'rx-cw-1': [r('factor', 1, 2, 25, { a: 4, b: 9 }), r('root', 1, 2, 25, { a: 4, b: 9 })],
    'rx-cw-2': [r('factor', 1, 3, 125, { m: 30, p: 20 }), r('root', 1, 3, 125, { m: 30, p: 20 })],
    'rx-cw-3': [r('root', 1, 4, 625, { b: 28, k: 23 }, true)],
    'rx-p-2': [r('root', 1, 2, 16, { x: 4, y: 11 }), r('root', 1, 2, 240, { a: 3, b: 4 })],
    'rx-p-3': [r('root', 2, 2, 75, { x: 2, y: 3 }, true)],
  },
  [EXPRESSIONS_HONORS]: {
    'rxh-cw-1': [r('factor', 1, 4, 162, { x: 9, y: 12 }), r('root', 1, 4, 162, { x: 9, y: 12 }, true)],
    'rxh-cw-2': [r('root', 1, 5, -64, { a: 11, b: 5 })],
    'rxh-p-6': [r('root', 1, 6, 64, { x: 8, y: 13 }, true), r('root', 1, 3, -54, { a: 7 })],
  },
  [NTH_ROOTS]: {
    'a2r1-cw-5': [r('base', 1, 5, 243, { a: 10, b: 15 }), r('root', 1, 5, 32, { x: 5, y: 10 })],
    'a2r1-cw-10': [r('base', 1, 2, 9, { x: 4, y: 10, z: 4 }), r('root', 1, 2, 9, { x: 4, y: 10, z: 4 }, true)],
    'a2r1-p-12': [r('root', 1, 6, 1, { x: 18 }, true), r('root', 1, 6, 1, { x: 12 })],
  },
  [OPERATIONS]: {
    'a2r2-cw-2': [r('factor', 1, 2, 25, { a: 4, b: 9 }), r('root', 1, 2, 25, { a: 4, b: 9 }), r('factor', 1, 3, 125, { m: 30, p: 20 }), r('root', 1, 3, 125, { m: 30, p: 20 })],
    'a2r2-cw-12': [r('root', 1, 2, 16, { x: 4, y: 11 }), r('root', 1, 3, 27, { x: 9, y: 14 })],
    'a2r2-cw-3': [r('root', 1, 4, 625, { b: 28, k: 23 }, true)],
  },
});
// Some of the lessons' other items, and why they are not varied (the first test names every varied one).
const NOT_VARIED = Object.freeze([
  [NTH_ROOTS, 'a2r1-cw-9', 'its keys are the small squares 4 and 9, which every variant\'s own work writes'],
  [NTH_ROOTS, 'a2r1-cw-7', '⁶√(t⁶) and ⁴√(x⁴) have no number to change'],
  [NTH_ROOTS, 'a2r1-cw-3', 'a negative square root asked apart'],
  [EXPRESSIONS, 'rx-cw-4', 'a fraction under the root'],
  [EXPRESSIONS, 'rx-cw-7', 'a sum of roots'],
  [EXPRESSIONS, 'rx-p-1', 'a family slot'],
  [EXPRESSIONS_HONORS, 'rxh-p-3', 'a quotient with a binomial denominator'],
  [OPERATIONS, 'a2r2-cw-8', 'a product of two roots'],
]);
const VARIED = Object.entries(WORK).flatMap(([file, items]) => Object.keys(items).map((id) => [file, id]));

const lessonFiles = () => {
  const files = [];
  readdirSync(join(ROOT, 'teacher-import-jsons')).forEach((folder) => readdirSync(join(ROOT, 'teacher-import-jsons', folder))
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => files.push(`teacher-import-jsons/${folder}/${name}`)));
  readdirSync(join(ROOT, 'docs/assignments')).filter((name) => name.endsWith('.json')).forEach((name) => files.push(`docs/assignments/${name}`));
  files.push('SAMPLE_AUTHORING_INTENT_V5.json');
  return files;
};
const compiled = new Map();
const itemsOf = (file) => {
  if (!compiled.has(file)) {
    const lesson = compileAuthoringIntentV5(JSON.parse(readFileSync(join(ROOT, file), 'utf8')));
    compiled.set(file, lesson.package.sections.flatMap((section) => section.questions.map((question) => ({ role: section.role, question }))));
  }
  return compiled.get(file);
};
const itemById = (file, id) => {
  const found = itemsOf(file).find((entry) => entry.question.questionId === id);
  assert.ok(found, `${id} is in ${file}`);
  return found.question;
};

/* ------------------------------------------------ reading mathematics, independently */

const mathOf = (line) => (String(line).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1));
const BRACED = '((?:[^{}]|\\{[^{}]*\\})*)';
/* LaTeX or a typed key ("5a^2b^4√b", "cbrt(2a)", "root(6)(x^2y)", "|x^3|") → mathjs. */
const toMathjs = (raw) => String(raw)
  .replace(/\\left|\\right/g, '')
  .replace(new RegExp(`\\\\sqrt\\[(\\d+)\\]\\{${BRACED}\\}`, 'g'), 'nthRoot(($2), $1)')
  .replace(new RegExp(`\\\\sqrt\\{${BRACED}\\}`, 'g'), 'sqrt($1)')
  .replace(/root\((\d+)\)\(([^()]+)\)/g, 'nthRoot(($2), $1)')
  .replace(/cbrt\(([^()]+)\)/g, 'nthRoot(($1), 3)')
  .replace(/∛\(([^()]+)\)/g, 'nthRoot(($1), 3)')
  .replace(/∜\(([^()]+)\)/g, 'nthRoot(($1), 4)')
  .replace(/√\(([^()]+)\)/g, 'sqrt($1)')
  .replace(/√([A-Za-z0-9])/g, 'sqrt($1)')
  .replace(/\|([^|]+)\|/g, 'abs($1)')
  .replace(/\^\{([^{}]+)\}/g, '^($1)')
  .replace(/\\cdot/g, '*')
  .replace(/[−–]/g, '-')
  // A run of letters is a product of letters ("ab" is a·b), not one name; function names stay, set apart.
  .replace(/(sqrt|nthRoot|abs)\(/g, ' $1(')
  .replace(/[A-Za-z]+/g, (run) => (/^(?:sqrt|nthRoot|abs)$/.test(run) ? run : run.split('').join('*')));
const POSITIVE = { a: 1.3, b: 1.7, k: 1.9, m: 1.2, p: 1.4, t: 1.6, x: 1.15, y: 1.45, z: 1.25 };
const valueOf = (raw, scope = POSITIVE) => {
  // An odd root of a negative number is real: nthRoot takes it; mathjs's own power would not.
  const value = math.evaluate(toMathjs(raw), { ...scope });
  return typeof value === 'number' ? value : Number.NaN;
};
const close = (left, right) => Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right));
/* The root a box is about, as LaTeX to evaluate. */
const rootLatex = ({ outside, n, c, powers }) => `${outside === 1 ? '' : outside}${n === 2 ? '\\sqrt' : `\\sqrt[${n}]`}{${c === 1 ? '' : c === -1 ? '-' : c}${Object.entries(powers).map(([letter, power]) => `${letter}^{${power}}`).join('')}}`;
/* The roots a prompt writes: [{ outside, n, c, powers }]. */
const promptRoots = (prompt) => mathOf(prompt).map((piece) => {
  const match = new RegExp(`^(\\d*)\\\\sqrt(?:\\[(\\d+)\\])?\\{${BRACED}\\}$`).exec(piece);
  assert.ok(match, `${piece} is a root`);
  const inner = /^(-?)(\d*)((?:[a-z](?:\^\{\d+\}|\^\d)?)*)$/.exec(match[3]);
  assert.ok(inner, `${match[3]} is a monomial`);
  const powers = Object.fromEntries([...inner[3].matchAll(/([a-z])(?:\^\{?(\d+)\}?)?/g)].map(([, letter, power]) => [letter, power ? Number(power) : 1]));
  return { outside: match[1] ? Number(match[1]) : 1, n: match[2] ? Number(match[2]) : 2, c: (inner[1] ? -1 : 1) * (inner[2] ? Number(inner[2]) : 1), powers };
});
const largestPower = (m, n) => {
  let k = 1;
  for (let d = 2; d ** n <= m; d += 1) if (m % (d ** n) === 0) k = d;
  return k;
};
const sizeOf = ({ outside, n, c, powers }) => {
  const k = largestPower(Math.abs(c), n);
  return outside + k + Math.abs(c) / k ** n + Object.values(powers).reduce((sum, power) => sum + power, 0);
};
/* What a typed key leaves under its root: { n, c, powers }, or null when no root is left. */
const insideOf = (key) => {
  const match = /(?:√\(([^()]+)\)|√([A-Za-z0-9])|cbrt\(([^()]+)\)|∛\(([^()]+)\)|∜\(([^()]+)\)|root\((\d+)\)\(([^()]+)\))/.exec(key);
  if (!match) return null;
  const [, sq1, sq2, cb1, cb2, fourth, index, other] = match;
  const n = sq1 || sq2 ? 2 : cb1 || cb2 ? 3 : fourth ? 4 : Number(index);
  const body = sq1 || sq2 || cb1 || cb2 || fourth || other;
  const inner = /^(\d*)((?:[a-z](?:\^\d+)?)*)$/.exec(body);
  assert.ok(inner, `${body} is a monomial`);
  return { n, c: inner[1] ? Number(inner[1]) : 1, powers: Object.fromEntries([...inner[2].matchAll(/([a-z])(?:\^(\d+))?/g)].map(([, letter, power]) => [letter, power ? Number(power) : 1])) };
};
const keysOf = (question) => question.answerFields.filter((field) => field.type !== 'choice').map((field) => field.answer);

const SEEDS = 12;
const practicesOf = (question) => {
  const found = [];
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const practice = buildPracticeLikeThis(question, { seed });
    if (practice) found.push(practice);
  }
  return found;
};
const inTurn = (question, count = 3) => {
  const seen = [];
  for (let index = 0; index < count; index += 1) {
    const practice = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: seen.map((entry) => entry.prompt) });
    if (!practice) break;
    seen.push(practice);
  }
  return seen;
};
/* Each box's root in a practice: the prompt's roots, matched to the boxes by radicand in the item's order. */
const boxRoots = (practice, boxes) => {
  const asked = promptRoots(practice.prompt);
  const radicands = [...new Set(boxes.map((box) => JSON.stringify([box.n, box.c, box.powers])))];
  return boxes.map((box) => {
    const root = asked[radicands.indexOf(JSON.stringify([box.n, box.c, box.powers]))];
    return box.role === 'root' ? root : { ...root, outside: 1 };
  });
};

/* ------------------------------------------------------------------- tests */

test('the radicals lessons: exactly their product-property items get a radical variant, in no other lesson', () => {
  const varied = [];
  let read = 0;
  lessonFiles().forEach((file) => itemsOf(file).forEach(({ role, question }) => {
    if (!PRACTICE_LIKE_THIS_ROLES.includes(role)) return;
    read += 1;
    if (buildNumericVariant(question, { seed: 0 })?.kind === NUMERIC_VARIANT_KIND.RADICAL) varied.push(`${file}::${question.questionId}`);
  }));
  assert.ok(read >= 1024, `the real lessons are read (${read})`);
  assert.deepEqual(varied.sort(), VARIED.map(([file, id]) => `${file}::${id}`).sort());
  VARIED.forEach(([file, id]) => {
    const practice = buildPracticeLikeThis(itemById(file, id), { seed: 0 });
    assert.equal(practice?.source, PRACTICE_SOURCE.NUMERIC_VARIANT, `${id}: a variant of the item`);
    assert.equal(practice.kind, NUMERIC_VARIANT_KIND.RADICAL);
  });
  NOT_VARIED.forEach(([file, id, why]) => assert.equal(buildNumericVariant(itemById(file, id), { seed: 0 }), null, `${id}: ${why}`));
  assert.ok(readRadicalItem(itemById(NTH_ROOTS, 'a2r1-cw-9')), 'a2r1-cw-9 is read: it has no variant only because of its small keys');
});

test('the work written out here is the item\'s: each key has its root\'s value', () => {
  Object.entries(WORK).forEach(([file, items]) => Object.entries(items).forEach(([id, boxes]) => {
    const keys = keysOf(itemById(file, id));
    assert.equal(keys.length, boxes.length, `${id}: one root per box`);
    boxes.forEach((box, index) => {
      const k = largestPower(Math.abs(box.c), box.n);
      const target = box.role === 'root' ? valueOf(rootLatex(box))
        : box.role === 'factor' ? valueOf(`${k ** box.n}${Object.entries(box.powers).map(([letter, power]) => `${letter}^{${box.n * Math.floor(power / box.n)}}`).join('')}`)
          : valueOf(`\\sqrt[${box.n}]{${rootLatex(box).replace(/^\\sqrt(\[\d+\])?\{|\}$/g, '')}}`);
      assert.ok(close(valueOf(keys[index]), target), `${id}: ${keys[index]} is the ${box.role} of ${rootLatex(box)}`);
    });
  }));
});

test('a variant keeps the item\'s roots, its keys are in simplest form, and it is never easier', () => {
  Object.entries(WORK).forEach(([file, items]) => Object.entries(items).forEach(([id, boxes]) => {
    const practices = practicesOf(itemById(file, id));
    assert.ok(practices.length >= 1, `${id}: a variant`);
    practices.forEach((practice) => {
      const roots = boxRoots(practice, boxes);
      boxes.forEach((own, index) => {
        const root = roots[index];
        const key = practice.parts[index].field.answer;
        assert.equal(root.n, own.n, `${id}: the same index`);
        assert.deepEqual(Object.keys(root.powers).sort(), Object.keys(own.powers).sort(), `${id}: the same letters`);
        Object.entries(own.powers).forEach(([letter, power]) => {
          assert.equal(root.powers[letter] % own.n, power % own.n, `${id}: ${letter} leaves what it left under the root`);
          assert.equal(Math.floor(root.powers[letter] / own.n) % 2, Math.floor(power / own.n) % 2, `${id}: ${letter}'s power out of the root keeps its parity`);
        });
        const k = largestPower(Math.abs(root.c), root.n);
        const ownK = largestPower(Math.abs(own.c), own.n);
        assert.equal(Math.sign(root.c), Math.sign(own.c), `${id}: the sign under the root`);
        assert.equal(k === 1, ownK === 1, `${id}: a perfect power in the number where the item has one`);
        assert.equal(Math.abs(root.c) / k ** root.n === 1, Math.abs(own.c) / ownK ** own.n === 1, `${id}: a number left under the root where the item leaves one`);
        assert.equal(root.outside === 1, own.outside === 1, `${id}: a number in front where the item has one`);
        assert.ok(sizeOf(root) >= sizeOf(own), `${id}: ${rootLatex(root)}'s numbers are as large as ${rootLatex(own)}'s`);
        assert.notEqual(rootLatex(root), rootLatex(own), `${id}: new numbers`);
        // The key: the root's value, and nothing left under its root that could come out.
        if (own.role === 'root') {
          assert.ok(close(valueOf(key), valueOf(rootLatex(root))), `${id}: ${key} is ${rootLatex(root)}`);
          const inside = insideOf(key);
          if (inside) {
            assert.equal(inside.n, root.n, `${id}: ${key} keeps the index`);
            assert.equal(largestPower(inside.c, inside.n), 1, `${id}: ${key} has no perfect power left under its root`);
            Object.values(inside.powers).forEach((power) => assert.ok(power < inside.n, `${id}: ${key} has no letter left to take out`));
          }
          // A bar where a letter may be negative: the key is the root there too.
          if (own.anyReal) {
            Object.entries(root.powers).filter(([, power]) => power % 2 === 0).forEach(([letter]) => {
              const scope = { ...POSITIVE, [letter]: -POSITIVE[letter] };
              assert.ok(close(valueOf(key, scope), valueOf(rootLatex(root), scope)), `${id}: ${key} is ${rootLatex(root)} when ${letter} is negative`);
            });
          }
        }
      });
    });
  }));
});

test('a variant never gives the item away', () => {
  VARIED.forEach(([file, id]) => {
    const question = itemById(file, id);
    const keys = keysOf(question);
    practicesOf(question).forEach((practice) => {
      practice.parts.forEach((part) => keys.forEach((key) => assert.ok(!close(valueOf(part.field.answer), valueOf(key)), `${id}: ${part.field.answer} is not the item's ${key}`)));
      [practice.prompt, ...practice.steps, practice.answer].flatMap(mathOf).flatMap((piece) => piece.split(/=|\\cdot/)).map((side) => side.trim()).filter(Boolean)
        .forEach((side) => {
          let value;
          try { value = valueOf(side); } catch { return; }
          keys.forEach((key) => assert.ok(!close(value, valueOf(key)), `${id}: "${side}" is not ${key}`));
        });
      const everything = [practice.prompt, ...practice.steps, practice.answer].join('\n').replace(/\s+/g, '');
      keys.forEach((key) => assert.ok(!everything.includes(key.replace(/\s+/g, '')), `${id}: ${key} is not written`));
    });
  });
});

test('every "=" in a variant\'s worked solution is true, and its steps end at each root\'s answer', () => {
  VARIED.forEach(([file, id]) => {
    practicesOf(itemById(file, id)).forEach((practice) => {
      let equations = 0;
      practice.steps.forEach((step) => mathOf(step).filter((piece) => piece.includes('=')).forEach((chain) => {
        const sides = chain.split('=');
        sides.slice(1).forEach((side) => assert.ok(close(valueOf(sides[0]), valueOf(side)), `${id}: "${chain}" in "${step}"`));
        equations += 1;
      }));
      assert.ok(equations >= practice.parts.length, `${id}: it writes its work (${equations} equations)`);
      practice.parts.forEach((part) => assert.ok(practice.steps.some((step) => mathOf(step).some((piece) => piece.split('=').at(-1).trim() === part.expected || piece.split(/[=:]/).some((side) => side.trim() === part.expected) || new RegExp(`\\(${part.expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\^`).test(piece))), `${id}: the steps arrive at ${part.label} ${part.expected}`));
    });
  });
});

test('the item\'s own boxes grade every key right, and the root unsimplified, a number off by one, the bars left off or the item\'s key wrong', () => {
  Object.entries(WORK).forEach(([file, items]) => Object.entries(items).forEach(([id, boxes]) => {
    const question = itemById(file, id);
    const typedBoxes = question.answerFields.filter((field) => field.type !== 'choice');
    practicesOf(question).forEach((practice) => {
      assert.deepEqual(practice.parts.map((part) => [part.field.id, part.field.gradingMode || null]), typedBoxes.map((field) => [field.id, field.gradingMode || null]));
      // The answer shown is the key its box grades.
      practice.parts.forEach((part) => assert.ok(close(valueOf(part.expected), valueOf(part.field.answer)), `${id}: ${part.label} shows ${part.expected}, its box grades ${part.field.answer}`));
      const roots = boxRoots(practice, boxes);
      const fields = typedBoxes.map((field, index) => ({ ...field, answer: practice.parts[index].field.answer }));
      const asked = { ...question, answerFields: fields };
      const grade = (answers) => gradeMultiAnswerResponse(asked, Object.fromEntries(fields.map((field, index) => [field.id, answers[index]]))).parts;
      const keys = fields.map((field) => field.answer);
      assert.ok(grade(keys).every((part) => part.isCorrect), `${id}: its keys are graded right`);
      keys.forEach((key, index) => {
        const wrong = [keysOf(question)[index]];
        const nearMiss = key.replace(/(?<![\^\d(])(\d+)/, (digits) => String(Number(digits) + 1));
        if (nearMiss !== key) wrong.push(nearMiss);
        if (boxes[index].role === 'root') {
          wrong.push(rootLatex(roots[index]));
          if (key.includes('|')) wrong.push(key.replace(/\|/g, ''));
        }
        wrong.forEach((answer) => assert.equal(grade(keys.map((other, at) => (at === index ? answer : other)))[index].isCorrect, false, `${id}: ${answer} is wrong for ${key}`));
      });
    });
  }));
});

test('the student answers each box, checked by the item\'s own box', () => {
  VARIED.forEach(([file, id]) => {
    const question = itemById(file, id);
    const boxes = WORK[file][id];
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    const roots = boxRoots(practice, boxes);
    practice.parts.forEach((part, index) => {
      assert.equal(part.checkable, true, `${id}: ${part.label} is checked`);
      // As the answer line writes it (LaTeX, as MathLive sends it), and with MathLive's sized bars.
      assert.equal(checkPracticePart(part, part.expected), PRACTICE_VERDICT.CORRECT, `${id}: ${part.expected}`);
      if (part.expected.includes('|')) assert.equal(checkPracticePart(part, part.expected.replace(/\|([^|]+)\|/g, '\\left|$1\\right|')), PRACTICE_VERDICT.CORRECT, `${id}: with \\left| \\right|`);
      // Any arrangement in simplest form is the box's to take: the letters out front in the other order.
      const front = /^(-?\d*)((?:[a-z](?:\^\{\d+\})?){2,})(.*)$/.exec(part.expected);
      if (front && !part.expected.includes('|')) {
        const reordered = `${front[1]}${front[2].match(/[a-z](?:\^\{\d+\})?/g).reverse().join('')}${front[3]}`;
        assert.equal(checkPracticePart(part, reordered), PRACTICE_VERDICT.CORRECT, `${id}: ${reordered}, the letters in another order`);
      }
      if (boxes[index].role === 'root') assert.equal(checkPracticePart(part, rootLatex(roots[index])), PRACTICE_VERDICT.INCORRECT, `${id}: the root retyped is not simplified`);
    });
    const keys = keysOf(question);
    const result = checkPracticeAnswers(practice, Object.fromEntries(practice.parts.map((part, index) => [part.id, keys[index]])));
    assert.deepEqual(result.parts.map((part) => part.verdict), practice.parts.map(() => PRACTICE_VERDICT.INCORRECT), `${id}: the item's answers do not answer it`);
  });
});

test('only once the item has closed: the Hint panel offers no sibling, and "another one" is a new problem', () => {
  VARIED.forEach(([file, id]) => {
    const question = itemById(file, id);
    assert.equal(familyFor(question), null, `${id}: no question family speaks to it`);
    assert.equal(buildSimilarWorkedExample(question), null, `${id}: no "Try a similar one" while it is open`);
  });
  const question = itemById(EXPRESSIONS, 'rx-p-3');
  const first = buildPracticeLikeThis(question, { seed: 3 });
  assert.deepEqual(buildPracticeLikeThis(question, { seed: 3 }), first, 'the same seed, the same problem');
  assert.equal(new Set(inTurn(question).map((practice) => practice.prompt)).size, 3, 'another one, and another');
});

test('a variant reads in Spanish, every sentence of it', async () => {
  const pack = await loadLanguagePack('es');
  let texts = 0;
  VARIED.forEach(([file, id]) => inTurn(itemById(file, id)).forEach((practice) => {
    [practice.prompt, ...practice.steps, `Answer: ${practice.answer}`].forEach((value) => {
      const result = translateWithPack(value, pack);
      assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${id}: ${value}\n→ ${result.sentences.filter((sentence) => !sentence.translated && !sentence.mathOnly).map((sentence) => sentence.source).join(' | ')}`);
      texts += 1;
    });
  }));
  assert.ok(texts > 120, `${texts} texts`);
});

test('the hints, back-up steps and worked solutions of the four radicals lessons are exactly as they were', () => {
  const before = JSON.parse(readFileSync(join(ROOT, 'tests/platform/fixtures/radicalSupportSurfaces.json'), 'utf8'));
  const files = [EXPRESSIONS, EXPRESSIONS_HONORS, NTH_ROOTS, OPERATIONS];
  assert.deepEqual(Object.keys(before), files);
  files.forEach((file) => {
    const now = supportSurfacesOf(file);
    assert.equal(now.length, before[file].length, `${file}: every item`);
    now.forEach((row, index) => assert.deepEqual(row, before[file][index], `${file} ${row.questionId} (${row.instance})`));
  });
  // The saved copy holds what it says: every varied item's authored hints and its worked solution.
  VARIED.forEach(([file, id]) => {
    const row = before[file].find((entry) => entry.questionId === id && entry.instance === 'template');
    assert.ok(row.hints.length >= 1 && row.hints.every((hint) => hint.startsWith('authored: ')), `${id}: its authored hints`);
    assert.ok(row.review?.reasoning?.length >= 1, `${id}: its worked solution`);
  });
});
