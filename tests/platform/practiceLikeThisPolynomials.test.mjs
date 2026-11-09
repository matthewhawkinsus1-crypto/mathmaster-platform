/*
 * "PRACTISE ONE LIKE THIS" FOR ALGEBRA II HONORS OPERATIONS ON POLYNOMIALS
 * (2026-11-06 walkthrough of module 2: none of the lesson's Classwork and
 * Practice items offered one, so a student who missed an item's last try got
 * the worked solution and nothing to try again).
 *
 * Its arithmetic items now get the item itself with new numbers
 * (src/platform/supports/workedExample/polynomialVariant.js, numericVariant.js's
 * second kind). Every variant is checked here independently of how it was made,
 * from the item's own expressions written out below (the lesson's text), with
 * the platform's own polynomial reader:
 *   - which items get one, and why the others do not (a word problem, an error
 *     analysis, a sort, a degree, a choice; Dividing Polynomials, which open
 *     pull request #540 changes, gets none);
 *   - the same terms, letters, exponents, signs and order, a leading 1 kept,
 *     never easier, the same terms in the answer with the same signs, and a
 *     polynomial the item writes twice written twice;
 *   - never one of the item's answers, nor anything with a key's value;
 *   - every "=" its steps write is true, and each answer is its expression's value;
 *   - the item's own grader (a typed box's, the Workshop's) agrees with its key;
 *   - a student's answer is checked by value, in any equivalent form;
 *   - only after the item closes (the Hint panel offers none), in Spanish too;
 *   - and the item's own hints, back-up step and worked solution are exactly
 *     as they were (tests/platform/fixtures/module2SupportSurfaces.json).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  PRACTICE_LIKE_THIS_ROLES,
  PRACTICE_SOURCE,
  PRACTICE_VERDICT,
  buildPracticeLikeThis,
  checkPracticeAnswers,
  checkPracticePart,
  readPracticeAnswer,
} from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { NUMERIC_VARIANT_KIND, buildNumericVariant } from '../../src/platform/supports/workedExample/numericVariant.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { parsePolynomial, samePolynomial } from '../../functions/shared/algebraicForm.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { addSubtractKey, areaModelKey } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import polynomialWorkshopGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { supportSurfacesOf } from './helpers/supportSurfaces.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OPERATIONS = 'teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json';
const DIVIDING = 'teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json';
const MATRICES = 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';
const DOL2 = 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json';

/*
 * Each varied item's work, written out from the lesson (its prompt, its box
 * labels, its Workshop fields), one expression per answer box, in order.
 */
const WORK = Object.freeze({
  'opp-cw-3': ['(2a^3+5a-7)-(a^3-3a+2)'],
  'opp-cw-4': ['(4x^2-9x+3)+(-2x^2-5x-6)'],
  'opp-cw-5': ['(3x^2+2x-3)-(4x^2+x-5)', '(-3x^2-4x+1)-(4x^2+x-5)'],
  'opp-cw-7': ['-y(4y^2+2y-3)'],
  'opp-cw-8': ['-x(3x^3-2x+5)', '3x^2(2xy-3xy^2+4x^2y^3)'],
  'opp-cw-10': ['(a^2+3a-4)(a+2)'],
  'opp-cw-11': ['(x^2+3x-2)(x+4)'],
  'opp-pr-1': ['(x^2-5x+2)-(3x^2+x-1)', '(7b^2+6b-7)-(4b^2-2)'],
  'opp-pr-2': ['4(a^2+5a-6)-3(2a^3+4a-5)'],
  'opp-pr-3': ['(n-9)(n+7)', '2a(4b+5)', '3p(np-z)'],
  'opp-pr-4': ['5c(2c^2-3c+4)+2c(7c-8)'],
  'opp-pr-7': ['(m^2-m+1)(m+1)'],
  'opp-pr-11': ['(x-y)(x^2+2xy+y^2)'],
  'opp-pr-12': ['(4n-5)^2', '(4n-5)^3'],
});
const WORKSHOP = new Set(['opp-cw-3', 'opp-cw-4', 'opp-cw-7', 'opp-cw-10', 'opp-pr-7', 'opp-pr-11']);
// Each box's name, as the practice labels it.
const LABELS = Object.freeze({
  'opp-cw-3': ['Difference ='],
  'opp-cw-4': ['Sum ='],
  'opp-cw-5': ['First difference =', 'Second difference ='],
  'opp-cw-7': ['Product ='],
  'opp-cw-8': ['First product =', 'Second product ='],
  'opp-cw-10': ['Product ='],
  'opp-cw-11': ['Product ='],
  'opp-pr-1': ['First difference =', 'Second difference ='],
  'opp-pr-2': ['Simplified expression ='],
  'opp-pr-3': ['First product =', 'Second product =', 'Third product ='],
  'opp-pr-4': ['Simplified expression ='],
  'opp-pr-7': ['Product ='],
  'opp-pr-11': ['Product ='],
  'opp-pr-12': ['Square =', 'Cube ='],
});
// The lesson's other Classwork and Practice items, and why each is not varied.
const NOT_VARIED = Object.freeze({
  'opp-cw-1': 'a sort: its answer is words',
  'opp-cw-2': 'degrees: number boxes, not polynomial arithmetic',
  'opp-cw-6': 'an error analysis: its prompt quotes Jordan\'s work',
  'opp-cw-9': 'a word problem (E-SALES)',
  'opp-pr-5': 'choices, and a sum asked in words',
  'opp-pr-6': 'a word problem: the two balls, and "subtract" in words',
  'opp-pr-8': 'a word problem (PAINTING)',
  'opp-pr-9': 'a word problem (INTEREST)',
  'opp-pr-10': 'a word problem (bachelor\'s degrees), in decimals',
  'opp-pr-13': 'a word problem (the box), a choice and a number',
  'opp-pr-14-ccmr': 'exam practice: an unknown coefficient and a number',
  'opp-pr-15': 'a sort: its answer is words',
});

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
const operationsItem = (id) => itemById(OPERATIONS, id);

/* ------------------------------------------------ reading mathematics, independently */

const plain = (math) => String(math).replace(/\\left|\\right/g, '').replace(/\\cdot/g, '*').replace(/\^\{(\d+)\}/g, '^$1')
  .replace(/[−–]/g, '-').replace(/\s+/g, '');
const valueOf = (math) => {
  const value = parsePolynomial(plain(math));
  assert.ok(value, `${math} reads as a polynomial`);
  return value;
};
const same = (left, right) => samePolynomial(valueOf(left), valueOf(right), 1e-9);
const mathOf = (line) => (String(line).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1));
// One term as a student types it: "-y^3", "4y", "-5", "0".
const typedTerm = (term) => {
  if (!term || term.coefficient === 0) return '0';
  const letters = Object.entries(term.powers).filter(([, power]) => power > 0).map(([letter, power]) => (power === 1 ? letter : `${letter}^${power}`)).join('');
  if (!letters) return String(term.coefficient);
  return `${term.coefficient === -1 ? '-' : term.coefficient === 1 ? '' : term.coefficient}${letters}`;
};
const typedTerms = (terms) => terms.map(typedTerm).join('+').replace(/\+-/g, '-');
// The item's own answers: its boxes' keys, or the Workshop's key for its own polynomials.
const keysOf = (question, id) => {
  if (!WORKSHOP.has(id)) return question.answerFields.filter((field) => field.answerForm === 'simplifiedPolynomial').map((field) => field.answer);
  return [typedTerms(question.mode === 'multiplyArea' ? areaModelKey(question).product : addSubtractKey(question).result)];
};

/*
 * An expression's layout: every coefficient a "#" (an exponent stays), a "#"
 * where a 1 is understood ("x" is "#x"), letters, signs and brackets as written.
 */
const TOKENS = /\d+|[a-z]|[\^+\-()*]/gi;
const layoutOf = (math) => {
  const tokens = plain(math).match(TOKENS);
  return tokens.map((token, index) => {
    const before = tokens[index - 1];
    if (/^\d+$/.test(token)) return before === '^' ? token : '#';
    if (/^[a-z]$/i.test(token) && (!before || ['(', '+', '-'].includes(before))) return `#${token}`;
    return token;
  }).join('');
};
/* Whether each polynomial (each bracket, and the monomial in front) starts with an understood 1. */
const leadingOnes = (math) => {
  const text = plain(math);
  return [/^-?[a-z]/i.test(text), ...[...text.matchAll(/\(-?([0-9]*)[a-z]?/gi)].map((match) => match[1] === '' && /\(-?[a-z]/i.test(match[0]))];
};
/* The sizes of every coefficient, an understood 1 counted as 1. */
const sizeOf = (math) => {
  const tokens = plain(math).match(TOKENS);
  return tokens.reduce((sum, token, index) => {
    const before = tokens[index - 1];
    if (/^\d+$/.test(token)) return before === '^' ? sum : sum + Number(token);
    if (/^[a-z]$/i.test(token) && (!before || ['(', '+', '-'].includes(before))) return sum + 1;
    return sum;
  }, 0);
};
const bracketsOf = (math) => [...plain(math).matchAll(/\(([^()]*)\)/g)].map((match) => match[1]);
/* The sizes of the work's coefficients: each polynomial once however often it is written, and each monomial in front. */
const sizeOfWork = (expressions) => {
  const brackets = [...new Set(expressions.flatMap(bracketsOf))];
  const fronts = expressions.flatMap((math) => [...plain(math).matchAll(/(?:^|[+-])([0-9]*[a-z][a-z0-9^]*|[0-9]+)\(/gi)].map((match) => match[1]));
  return [...brackets, ...fronts].reduce((sum, piece) => sum + sizeOf(piece), 0);
};
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const contentOf = (polynomial) => [...valueOf(polynomial).values()].reduce((g, c) => gcd(g, c), 0);
const signs = (math) => [...valueOf(math)].map(([key, c]) => `${key}${Math.sign(c)}`).sort().join(' ');
const largest = (math) => Math.max(...[...valueOf(math).values()].map(Math.abs));

const SEEDS = 12;
const practicesOf = (question) => {
  const all = [];
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const practice = buildPracticeLikeThis(question, { seed });
    if (practice) all.push(practice);
  }
  return all;
};
// The practices a student meets one after another: the first, then "Another one like this".
const inTurn = (question, count = 3) => {
  const seen = [];
  for (let index = 0; index < count; index += 1) {
    const practice = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: seen.map((entry) => entry.prompt) });
    if (!practice) break;
    seen.push(practice);
  }
  return seen;
};

/* ------------------------------------------------------------------- tests */

test('Operations on Polynomials: exactly its arithmetic items get a polynomial variant, in no other lesson, and none of Dividing Polynomials', () => {
  const varied = [];
  let read = 0;
  lessonFiles().forEach((file) => itemsOf(file).forEach(({ role, question }) => {
    if (!PRACTICE_LIKE_THIS_ROLES.includes(role)) return;
    read += 1;
    const variant = buildNumericVariant(question, { seed: 0 });
    if (variant?.kind === NUMERIC_VARIANT_KIND.POLYNOMIAL) varied.push(`${file}::${question.questionId}`);
  }));
  assert.ok(read >= 859, `the real lessons are read (${read})`);
  assert.deepEqual(varied.sort(), Object.keys(WORK).map((id) => `${OPERATIONS}::${id}`).sort());
  // The practice a closed item offers is that variant (no family sibling comes first).
  Object.keys(WORK).forEach((id) => {
    const practice = buildPracticeLikeThis(operationsItem(id), { seed: 0 });
    assert.equal(practice?.source, PRACTICE_SOURCE.NUMERIC_VARIANT, `${id}: a variant of the item`);
    assert.equal(practice.kind, NUMERIC_VARIANT_KIND.POLYNOMIAL);
  });
  Object.entries(NOT_VARIED).forEach(([id, why]) => assert.equal(buildPracticeLikeThis(operationsItem(id), { seed: 0 }), null, `${id}: ${why}`));
  // Every Classwork and Practice item of the lesson is one or the other.
  const lessonIds = itemsOf(OPERATIONS).filter(({ role }) => PRACTICE_LIKE_THIS_ROLES.includes(role)).map(({ question }) => question.questionId).sort();
  assert.deepEqual(lessonIds, [...Object.keys(WORK), ...Object.keys(NOT_VARIED)].sort());
  // Open pull request #540 changes Dividing Polynomials: none of its items is varied.
  itemsOf(DIVIDING).filter(({ role }) => PRACTICE_LIKE_THIS_ROLES.includes(role)).forEach(({ question }) => {
    assert.equal(buildPracticeLikeThis(question, { seed: 0 }), null, `${question.questionId}: Dividing Polynomials is left as it is`);
  });
});

test('the work written out here is the item\'s: each expression has its box\'s key', () => {
  Object.entries(WORK).forEach(([id, expressions]) => {
    const question = operationsItem(id);
    if (WORKSHOP.has(id)) {
      assert.equal(question.type, 'polynomialWorkshop');
      const key = question.mode === 'multiplyArea' ? areaModelKey(question).product : addSubtractKey(question).result;
      const fromTool = key.map((term) => `(${term.coefficient})*${Object.entries(term.powers).map(([letter, power]) => `${letter}^${power}`).join('*') || 1}`).join('+');
      assert.ok(same(expressions[0], fromTool), `${id}: ${expressions[0]} is the Workshop's own problem`);
      return;
    }
    const keys = keysOf(question, id);
    assert.equal(keys.length, expressions.length, `${id}: one expression per box`);
    expressions.forEach((expression, index) => assert.ok(same(expression, keys[index]), `${id}: ${expression} = ${keys[index]}`));
  });
});

test('a variant keeps the item\'s shape and is never easier', () => {
  Object.entries(WORK).forEach(([id, expressions]) => {
    const question = operationsItem(id);
    const practices = practicesOf(question);
    assert.ok(practices.length >= 1, `${id}: a variant`);
    const itemBrackets = expressions.flatMap(bracketsOf);
    practices.forEach((practice) => {
      const written = mathOf(practice.prompt);
      assert.equal(written.length, expressions.length, `${id}: the prompt writes one expression per box — ${practice.prompt}`);
      written.forEach((math, index) => {
        const own = expressions[index];
        assert.equal(layoutOf(math), layoutOf(own), `${id}: ${math} is laid out as ${own}`);
        assert.deepEqual(leadingOnes(math), leadingOnes(own), `${id}: a polynomial that starts with 1 still does — ${math}`);
        // The answer has the item's terms, with the item's signs: the same cancel, no other does.
        assert.equal(signs(math), signs(own), `${id}: ${math} has the terms and signs of ${own}`);
        assert.ok(largest(math) <= Math.max(2 * largest(own), largest(own) + 20), `${id}: ${math} stays the item's size`);
        assert.ok(!same(math, own), `${id}: new numbers`);
      });
      assert.ok(sizeOfWork(written) >= sizeOfWork(expressions), `${id}: its coefficients are as large overall (${sizeOfWork(written)} ≥ ${sizeOfWork(expressions)})`);
      // A polynomial the item writes twice is one polynomial twice; different ones stay different.
      const brackets = written.flatMap(bracketsOf);
      assert.equal(brackets.length, itemBrackets.length);
      itemBrackets.forEach((own, i) => itemBrackets.forEach((other, j) => assert.equal(brackets[i] === brackets[j], own === other, `${id}: brackets ${i} and ${j}`)));
      // No polynomial divides through by a common factor unless the item's does.
      brackets.forEach((bracket, index) => assert.ok(contentOf(bracket) === 1 || contentOf(itemBrackets[index]) > 1, `${id}: ${bracket} has no common factor`));
    });
  });
});

test('a variant never gives the item away', () => {
  Object.entries(WORK).forEach(([id]) => {
    const question = operationsItem(id);
    const keys = keysOf(question, id);
    practicesOf(question).forEach((practice) => {
      practice.parts.forEach((part) => keys.forEach((key) => assert.ok(!same(part.expected, key), `${id}: ${part.expected} is not the item's ${key}`)));
      // Nothing the variant writes — prompt, step or answer — has the value of one of the item's keys.
      [practice.prompt, ...practice.steps, practice.answer].flatMap(mathOf)
        .flatMap((math) => math.split(/,\s*\\;\s*/)).flatMap((math) => math.split('='))
        .forEach((side) => keys.forEach((key) => assert.ok(!same(side, key), `${id}: "${side}" is not ${key}`)));
      // Nor is a key written inside a longer line ("… = x^3+7x^2+10x-8"), spaced or not.
      const everything = [practice.prompt, ...practice.steps, practice.answer].join('\n').replace(/\s+/g, '');
      keys.forEach((key) => {
        const escaped = plain(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.doesNotMatch(everything, new RegExp(`(?<![\\w^.])${escaped}(?![\\w.^])`), `${id}: ${key} is not written`);
      });
    });
  });
});

test('every "=" in a variant\'s worked solution is true, and each answer is its expression\'s value', () => {
  Object.entries(WORK).forEach(([id]) => {
    const question = operationsItem(id);
    practicesOf(question).forEach((practice) => {
      let equations = 0;
      practice.steps.forEach((step) => {
        mathOf(step).flatMap((math) => math.split(/,\s*\\;\s*/)).filter((math) => math.includes('=')).forEach((chain) => {
          const sides = chain.split('=');
          sides.slice(1).forEach((side) => assert.ok(same(sides[0], side), `${id}: "${chain}" in "${step}"`));
          equations += 1;
        });
        // "the opposite of B is −B".
        const opposite = /the opposite of \$([^$]+)\$ is \$([^$]+)\$/.exec(step);
        if (opposite) assert.ok(same(`-(${plain(opposite[1])})`, opposite[2]), `${id}: ${step}`);
      });
      assert.ok(equations >= practice.parts.length, `${id}: it writes its work (${equations} equations)`);
      const written = mathOf(practice.prompt);
      practice.parts.forEach((part, index) => {
        assert.ok(same(part.expected, written[index]), `${id}: ${part.label} ${part.expected} is ${written[index]}`);
        // The steps arrive at it.
        assert.ok(practice.steps.some((step) => mathOf(step).some((math) => math.includes('=') && same(math.split('=').at(-1), part.expected))), `${id}: the steps end at ${part.expected}`);
      });
    });
  });
});

test('the item\'s own grader agrees with a variant\'s key: a typed box\'s, and the Workshop\'s Check', () => {
  Object.entries(WORK).forEach(([id]) => {
    const question = operationsItem(id);
    practicesOf(question).forEach((practice) => {
      const written = mathOf(practice.prompt);
      const typed = practice.parts.map((part) => plain(part.expected));
      const moved = (value) => `${value}+1`;
      if (!WORKSHOP.has(id)) {
        const fields = question.answerFields.filter((field) => field.answerForm === 'simplifiedPolynomial')
          .map((field, index) => ({ ...field, answer: typed[index] }));
        const asked = { ...question, answerFields: fields };
        const grade = (answers) => gradeMultiAnswerResponse(asked, Object.fromEntries(fields.map((field, index) => [field.id, answers[index]]))).parts;
        assert.ok(grade(typed).every((part) => part.isCorrect), `${id}: its keys are graded right`);
        typed.forEach((value, index) => {
          assert.equal(grade(typed.map((other, at) => (at === index ? moved(value) : other)))[index].isCorrect, false, `${id}: an answer off by one is wrong`);
          assert.equal(grade(typed.map((other, at) => (at === index ? keysOf(question, id)[index] : other)))[index].isCorrect, false, `${id}: the item's own key is wrong`);
        });
        return;
      }
      // The Workshop, through its own Check: the work a student who multiplied
      // or combined correctly sends, ending in the variant's answer.
      const math = plain(written[0]);
      let asked;
      let work;
      if (question.mode === 'multiplyArea') {
        const factors = /^(?:\(([^()]+)\)|(-?[^()]+))\(([^()]+)\)$/.exec(math);
        asked = { ...question, leftFactor: factors[1] || factors[2], rightFactor: factors[3] };
        const key = areaModelKey(asked);
        work = (product) => ({ terms: key.cells.map(typedTerm), product });
      } else {
        const [, first, operation, second] = /^\(([^()]+)\)([+-])\(([^()]+)\)$/.exec(math);
        asked = { ...question, firstPolynomial: first, secondPolynomial: second, operation: operation === '-' ? 'subtract' : 'add' };
        const key = addSubtractKey(asked);
        work = (result) => ({ opposites: key.added.map(typedTerm), sums: key.sums.map(typedTerm), result });
      }
      assert.equal(gradeToolCheck(polynomialWorkshopGrader, asked, work(typed[0])).isCorrect, true, `${id}: ${written[0]} = ${typed[0]}, by the Workshop's Check`);
      assert.equal(gradeToolCheck(polynomialWorkshopGrader, asked, work(moved(typed[0]))).isCorrect, false, `${id}: off by one is wrong`);
    });
  });
});

test('the student answers each box, checked by value: any equivalent form is right, a slip is wrong', () => {
  Object.entries(WORK).forEach(([id]) => {
    const question = operationsItem(id);
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    assert.deepEqual(practice.parts.map((part) => part.label), LABELS[id], `${id}: the boxes`);
    practice.parts.forEach((part) => {
      assert.equal(part.checkable, true, `${id}: ${part.label} is checked`);
      const terms = plain(part.expected).match(/[+-]?[^+-]+/g);
      const asTyped = plain(part.expected).replace(/\^(\d+)/g, '^{$1}');
      const reversed = [...terms].reverse().map((term, index) => (index === 0 ? term.replace(/^\+/, '') : /^[+-]/.test(term) ? term : `+${term}`)).join('');
      const firstChanged = plain(part.expected).replace(/^(-?)(\d*)/, (match, sign, digits) => `${sign}${(Number(digits || 1) + 1)}`);
      assert.equal(checkPracticePart(part, part.expected), PRACTICE_VERDICT.CORRECT, `${id}: ${part.expected} as written`);
      assert.equal(checkPracticePart(part, asTyped), PRACTICE_VERDICT.CORRECT, `${id}: ${asTyped}, as MathLive sends it`);
      assert.equal(checkPracticePart(part, reversed), PRACTICE_VERDICT.CORRECT, `${id}: ${reversed}, the terms in another order`);
      assert.equal(checkPracticePart(part, firstChanged), PRACTICE_VERDICT.INCORRECT, `${id}: ${firstChanged}, a coefficient off`);
    });
    // The item's own answers, typed into the variant, are wrong in every box.
    const keys = keysOf(question, id);
    const result = checkPracticeAnswers(practice, Object.fromEntries(practice.parts.map((part, index) => [part.id, keys[index]])));
    assert.deepEqual(result.parts.map((part) => part.verdict), practice.parts.map(() => PRACTICE_VERDICT.INCORRECT), `${id}: the item's answers do not answer it`);
  });
});

test('products of letters are read as products: the letters in any order are right, an exponent on the wrong letter is wrong', () => {
  const [part] = readPracticeAnswer('Product = $4np^2 - 8pz$').parts;
  assert.equal(part.checkable, true, 'a value written whole as mathematics is mathematics, not the words "np" and "pz"');
  assert.equal(checkPracticePart(part, '4np^{2}-8pz'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(part, '4p^{2}n-8zp'), PRACTICE_VERDICT.CORRECT, 'the letters of a term in another order');
  assert.equal(checkPracticePart(part, '4p\\cdot n\\cdot p-8zp'), PRACTICE_VERDICT.CORRECT, 'written as a product');
  assert.equal(checkPracticePart(part, '4p\\left(np-2z\\right)'), PRACTICE_VERDICT.CORRECT, 'not multiplied out: the same value');
  // Only checking by value can tell this one: p·n·p is n·p².
  assert.equal(checkPracticePart(part, '4pnp-8zp'), PRACTICE_VERDICT.CORRECT, 'p twice, side by side');
  assert.equal(checkPracticePart(part, '4pn^{2}-8zp'), PRACTICE_VERDICT.INCORRECT, 'the square on n, not p');
  assert.equal(checkPracticePart(part, '4np^{2}-8p'), PRACTICE_VERDICT.INCORRECT, 'a letter lost');
  const [three] = readPracticeAnswer('Product = $x^3 + 2x^2y - 7xy^2 - 2y^3$').parts;
  assert.equal(checkPracticePart(three, 'x^{3}+2yx^{2}-7y^{2}x-2y^{3}'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(three, 'x^{3}+2x^{2}y-7yx^{2}-2y^{3}'), PRACTICE_VERDICT.INCORRECT, '7x²y is not 7xy²');
  // Prose is still prose: a value written in words is never judged.
  assert.equal(readPracticeAnswer('Product = 6 units to the left').parts[0].checkable, false);
});

test('only once the item has closed: the Hint panel offers no sibling, and "another one" is a new problem', () => {
  Object.keys(WORK).forEach((id) => {
    const question = operationsItem(id);
    assert.equal(familyFor(question), null, `${id}: no question family speaks to it`);
    assert.equal(buildSimilarWorkedExample(question), null, `${id}: no "Try a similar one" while it is open`);
  });
  const question = operationsItem('opp-cw-10');
  const first = buildPracticeLikeThis(question, { seed: 3 });
  assert.deepEqual(buildPracticeLikeThis(question, { seed: 3 }), first, 'the same seed, the same problem');
  assert.equal(new Set(inTurn(question).map((practice) => practice.prompt)).size, 3, 'another one, and another');
  // PR 7's cancellation is kept: (m² − m + 1)(m + 1) = m³ + 1 has one variant with whole numbers up to 4.
  const [only, ...rest] = inTurn(operationsItem('opp-pr-7'));
  assert.equal(plain(mathOf(only.prompt)[0]), '(m^2-2m+4)(m+2)');
  assert.equal(only.parts[0].expected, 'm^3 + 8');
  assert.deepEqual(rest, []);
});

test('a variant reads in Spanish, every sentence of it', async () => {
  const pack = await loadLanguagePack('es');
  let texts = 0;
  Object.keys(WORK).forEach((id) => inTurn(operationsItem(id)).forEach((practice) => {
    [practice.prompt, ...practice.steps, `Answer: ${practice.answer}`].forEach((text) => {
      const result = translateWithPack(text, pack);
      assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${id}: ${text}\n→ ${result.sentences.filter((sentence) => !sentence.translated && !sentence.mathOnly).map((sentence) => sentence.source).join(' | ')}`);
      texts += 1;
    });
  }));
  assert.ok(texts > 150, `${texts} texts`);
  const [practice] = inTurn(operationsItem('opp-cw-5'));
  assert.match(translateWithPack(practice.steps[0], pack).text, /^Restar un polinomio es sumar su opuesto: el opuesto de \$/);
});

test('the hints, back-up steps and worked solutions of module 2, the matrices lesson and the DOL #2 review are exactly as they were', () => {
  const before = JSON.parse(readFileSync(join(ROOT, 'tests/platform/fixtures/module2SupportSurfaces.json'), 'utf8'));
  const files = [OPERATIONS, DIVIDING, MATRICES, DOL2];
  assert.deepEqual(Object.keys(before), files);
  files.forEach((file) => {
    const now = supportSurfacesOf(file);
    assert.equal(now.length, before[file].length, `${file}: every item`);
    now.forEach((row, index) => assert.deepEqual(row, before[file][index], `${file} ${row.questionId} (${row.instance})`));
  });
  // The snapshot holds what it says: every item's authored hints (an exit
  // ticket has none: its hints are withheld), and a back-up step and a review
  // where the item has them.
  const operations = before[OPERATIONS];
  assert.equal(operations.length, 32);
  assert.ok(operations.filter((row) => row.section !== 'dol')
    .every((row) => row.hints.length >= 3 && row.hints.every((hint) => hint.startsWith('authored: '))), 'the authored hint ladders');
  assert.equal(operations.find((row) => row.questionId === 'opp-cw-5').backUp.source, 'authored');
  assert.ok(operations.find((row) => row.questionId === 'opp-pr-2').review.reasoning.length >= 3);
  assert.ok(before[DOL2].some((row) => row.instance === 'dealt'), 'a family item is read as it is dealt too');
});
