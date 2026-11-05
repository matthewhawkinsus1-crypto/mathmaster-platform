/*
 * THE RIGHT ANSWER IS NOT THE LONGEST OPTION (PR #537 walkthrough,
 * F-LONGEST-IS-RIGHT).
 *
 * In the reasoning choices of the seven #537 lessons the right option was the
 * single longest in 75 of 97. It carried the qualifications ("x may be
 * negative, but a fourth root is never negative; y² is never negative") and
 * the distractors were bare claims ("x is always negative"), so picking the
 * longest passed most reasoning parts unread. A distractor now has the
 * answer's shape: a claim and a reason, wrong in one specific way.
 *
 * This reads every prose choice in teacher-import-jsons (options that average
 * 25 characters or more, as the file writes them) and flags one whose key is
 * the unique longest option by more than 20%. The Algebra II Honors radicals
 * lessons have none. Every other lesson's count is a ratchet: it may go down,
 * never up, and a lesson not listed has none.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LESSONS = path.join(ROOT, 'teacher-import-jsons');
const lessonFiles = () => {
  const files = [];
  const walk = (directory) => readdirSync(directory).sort().forEach((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.json')) files.push(path.relative(LESSONS, full).split(path.sep).join('/'));
  });
  walk(LESSONS);
  return files;
};

/** Characters as a student counts them: ⁴√ is two, not a code unit count. */
const length = (text) => [...String(text)].length;

/** Every choice a lesson file writes: a choice field's options and key, and a question's own choices. */
const choicesOf = (lesson) => (lesson.sections || []).flatMap((section) => (section.questions || []).flatMap((question) => [
  ...['responses', 'answerFields'].flatMap((key) => (Array.isArray(question[key]) ? question[key] : [])
    .filter((field) => field?.type === 'choice' && Array.isArray(field.options))
    .map((field) => ({ where: `${question.questionId} ${field.id}`, options: field.options.map(String), key: String(field.answer) }))),
  ...(Array.isArray(question.choices) && question.choices.length && question.choices.every((choice) => choice && typeof choice === 'object')
    ? [{
      where: `${question.questionId} choices`,
      options: question.choices.map((choice) => String(choice.label ?? choice.text ?? '')),
      key: String(question.choices.find((choice) => choice.id === question.answer)?.label ?? ''),
    }]
    : []),
]));

const PROSE = 25;
const MARGIN = 1.2;
const isProse = ({ options }) => options.reduce((sum, option) => sum + length(option), 0) / options.length >= PROSE;
/** The key is the unique longest option, by more than MARGIN. */
const keyStandsOut = ({ options, key }) => {
  const others = options.filter((option) => option !== key).map(length);
  return options.includes(key) && others.length > 0 && length(key) > MARGIN * Math.max(...others);
};
const offenders = (file) => choicesOf(JSON.parse(readFileSync(path.join(LESSONS, file), 'utf8')))
  .filter((choice) => isProse(choice) && keyStandsOut(choice))
  .map((choice) => choice.where);

/*
 * THE RATCHET: each other lesson's offenders when this check was written
 * (138 in 26 files). A rewrite lowers its number here; nothing raises one.
 * The four Algebra I Module 3 Topic 2 Lesson 4 and 5 files are being
 * rewritten for this finding by another batch, which lowers their numbers.
 */
const RATCHET = Object.freeze({
  'algebra1-dol3/Algebra1_DOL3_Review_Honors.json': 1,
  'algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json': 2,
  'algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json': 1,
  'algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json': 1,
  'algebra1-module3/T1_L1_Solving_Linear_Equations.json': 3,
  'algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json': 8,
  'algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json': 4,
  'algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json': 5,
  'algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json': 8,
  'algebra1-module3/T2_L1_Solving_Systems_by_Graphing_Honors.json': 9,
  'algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json': 13,
  'algebra1-module3/T2_L2_Solving_Systems_by_Substitution_Honors.json': 12,
  // Another batch's rewrite (Algebra I M3 T2 L4 and L5, regular and Honors).
  'algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables.json': 10,
  'algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json': 11,
  'algebra1-module3/T2_L5_Systems_of_Linear_Inequalities.json': 11,
  'algebra1-module3/T2_L5_Systems_of_Linear_Inequalities_Honors.json': 12,
  'algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json': 1,
  'algebra2-honors-module2/L1_Operations_on_Polynomials.json': 1,
  'algebra2-honors-module2/L2_Dividing_Polynomials.json': 3,
  'algebra2-polynomials-radicals/1_Factoring_Polynomials.json': 1,
  'algebra2-polynomials-radicals/3_Radical_Expressions.json': 1,
  'algebra2-polynomials-radicals-honors/1_Factoring_Polynomials_Honors.json': 3,
  'algebra2-polynomials-radicals-honors/2_Remainder_and_Factor_Theorems_Honors.json': 3,
  'algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json': 4,
  'algebra2-polynomials-radicals-honors/4_Rational_Exponents_Honors.json': 5,
  'algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors.json': 5,
});

const RADICALS = ['L1_nth_Roots.json', 'L2_Operations_with_Radical_Expressions.json', 'L3_Rational_Exponents.json']
  .map((name) => `algebra2-honors-radicals/${name}`);

test('what counts: a prose choice whose key is the unique longest option by more than 20%', () => {
  const choice = (key, ...others) => ({ options: [key, ...others], key });
  const words = (count) => 'x'.repeat(count);
  assert.equal(keyStandsOut(choice(words(61), words(50), words(40), words(30))), true, '61 against 50 is 22% longer');
  assert.equal(keyStandsOut(choice(words(60), words(50), words(40), words(30))), false, '60 against 50 is 20%: not more');
  assert.equal(keyStandsOut(choice(words(40), words(50), words(40), words(30))), false, 'not the longest');
  assert.equal(isProse(choice(words(70), words(10), words(10), words(10))), true, 'an average of 25 is prose');
  assert.equal(isProse(choice(words(69), words(10), words(10), words(10))), false, '24.75 is not');
  assert.equal(isProse(choice('2xy²', '2|x|y²', 'x', '|x|')), false, 'short mathematics is not');
  // Read as the file writes them, by character: ⁴√ counts two.
  assert.equal(length('⁴√(x⁴)'), 6);
  // A question's own choices are read too ({ id, label } with `answer` the id).
  assert.deepEqual(choicesOf({ sections: [{ questions: [{ questionId: 'q', answer: 'b', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }] }),
    [{ where: 'q choices', options: ['A', 'B'], key: 'B' }]);
});

test('the Algebra II Honors radicals lessons: no reasoning choice gives its key away by length', () => {
  RADICALS.forEach((file) => {
    const prose = choicesOf(JSON.parse(readFileSync(path.join(LESSONS, file), 'utf8'))).filter(isProse);
    assert.ok(prose.length >= 8, `${file}: ${prose.length} prose choices read`);
    assert.deepEqual(offenders(file), [], file);
  });
});

test('every other lesson: its count of keys that stand out by length may go down, never up', () => {
  const files = lessonFiles();
  Object.keys(RATCHET).forEach((file) => assert.ok(files.includes(file), `${file} is in the ratchet but not in teacher-import-jsons`));
  const over = files.flatMap((file) => {
    const found = offenders(file);
    return found.length > (RATCHET[file] ?? 0)
      ? [`${file}: ${found.length}, over its ${RATCHET[file] ?? 0} (${found.join('; ')})`]
      : [];
  });
  assert.deepEqual(over, [], 'give each new distractor the answer\'s shape: a claim and a reason, wrong in one way');
});

test('the ratchet is current: a lesson with fewer now has its lower number written down', () => {
  const lower = Object.entries(RATCHET).flatMap(([file, held]) => {
    const now = offenders(file).length;
    return now < held ? [`${file}: ${now} now; lower its number in RATCHET from ${held} to ${now}`] : [];
  });
  assert.deepEqual(lower, []);
});
