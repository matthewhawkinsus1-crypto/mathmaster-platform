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
 * lessons, the Algebra I Module 3 Topic 2 Lessons 4 and 5 (regular and
 * Honors) and ten Algebra II lessons on matrices, polynomials and radicals
 * have none. The Algebra I lessons in ALGEBRA1 have none but the ones named
 * there, each kept for a reason written beside it. Every other lesson's count
 * is a ratchet: it may go down, never up, and a lesson not listed has none.
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
 * The four Algebra I Module 3 Topic 2 Lesson 4 and 5 files held 44 of them;
 * their rewrite took every one to 0, so they left the ratchet and are held
 * to none by the test after the radicals'. The ten Algebra II files on
 * matrices, polynomials and radicals held 27, and theirs did the same. Each
 * Algebra I file in ALGEBRA1 left the ratchet when its rewrite took it to 0;
 * one that keeps an offender keeps its number here, and ALGEBRA1 names what
 * it keeps (54 in 9 files now).
 */
const RATCHET = Object.freeze({
  'algebra1-dol3/Algebra1_DOL3_Review_Honors.json': 1,
  'algebra1-module3/T1_L1_Solving_Linear_Equations.json': 1,
  'algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json': 1,
  'algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json': 4,
  'algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json': 5,
  'algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json': 8,
  'algebra1-module3/T2_L1_Solving_Systems_by_Graphing_Honors.json': 9,
  'algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json': 13,
  'algebra1-module3/T2_L2_Solving_Systems_by_Substitution_Honors.json': 12,
});

const RADICALS = ['L1_nth_Roots.json', 'L2_Operations_with_Radical_Expressions.json', 'L3_Rational_Exponents.json']
  .map((name) => `algebra2-honors-radicals/${name}`);
// Algebra I M3 T2 L4 and L5: 44 offenders in all before their rewrite.
const INEQUALITIES = [
  'T2_L4_Graphing_Inequalities_in_Two_Variables.json', 'T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json',
  'T2_L5_Systems_of_Linear_Inequalities.json', 'T2_L5_Systems_of_Linear_Inequalities_Honors.json',
].map((name) => `algebra1-module3/${name}`);
// Ten Algebra II lessons on matrices, polynomials and radicals: 27 offenders
// in all before their rewrite.
const ALGEBRA2 = [
  'algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json',
  'algebra2-honors-module2/L1_Operations_on_Polynomials.json',
  'algebra2-honors-module2/L2_Dividing_Polynomials.json',
  'algebra2-polynomials-radicals/1_Factoring_Polynomials.json',
  'algebra2-polynomials-radicals/3_Radical_Expressions.json',
  ...['1_Factoring_Polynomials', '2_Remainder_and_Factor_Theorems', '3_Radical_Expressions', '4_Rational_Exponents', '5_Solving_Radical_Equations']
    .map((name) => `algebra2-polynomials-radicals-honors/${name}_Honors.json`),
];
/*
 * The Algebra I lessons rewritten next, each with the offenders it keeps, by
 * name, so a fix in one place cannot hide a new one in another. What is kept:
 *   - dol3-honors-q15 is the bank's audited TSIA2 item
 *     (mm_tsia2_psr_analysis_8_v21), carried as the bank wrote it;
 *   - m3l1-pr-8 and m3l1h-cw-5 name the property behind each of five steps
 *     from one shared list, and every option in it but one is another
 *     step's key, so rewording an option there changes a key. Step 2's key,
 *     "Combine like terms (Commutative and Associative Properties)", is the
 *     longest name on the list.
 */
const ALGEBRA1 = Object.freeze({
  'algebra1-dol3/Algebra1_DOL3_Review_Honors.json': ['dol3-honors-q15 answer'],
  'algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json': [],
  'algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json': [],
  'algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json': [],
  'algebra1-module3/T1_L1_Solving_Linear_Equations.json': ['m3l1-pr-8 r2'],
  'algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json': ['m3l1h-cw-5 j2'],
});

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

test('Algebra I M3 T2 Lessons 4 and 5: no reasoning choice gives its key away by length', () => {
  // Each distractor is a claim with a reason, wrong in one way ("No — it is
  // below the line, because 6.5 + 5.5 is less than 20"), so the key, which
  // carries a reason, no longer stands out among bare claims.
  INEQUALITIES.forEach((file) => {
    const prose = choicesOf(JSON.parse(readFileSync(path.join(LESSONS, file), 'utf8'))).filter(isProse);
    assert.ok(prose.length >= 16, `${file}: ${prose.length} prose choices read`);
    assert.deepEqual(offenders(file), [], file);
    assert.equal(RATCHET[file], undefined, `${file} is held to none, not to a ratchet`);
  });
});

test('ten Algebra II lessons on matrices, polynomials and radicals: no reasoning choice gives its key away by length', () => {
  // Only the distractors were rewritten, never a key. Each is a claim with a
  // reason, wrong in one way: a false reason that leads to a wrong claim
  // ("There is no error: x + 2 = 0 when x = 2, so P(2) = 0 makes x + 2 a
  // factor"), or the right claim for a wrong reason ("No — 16 is not a
  // perfect square, so it fails the second check").
  ALGEBRA2.forEach((file) => {
    const prose = choicesOf(JSON.parse(readFileSync(path.join(LESSONS, file), 'utf8'))).filter(isProse);
    assert.ok(prose.length >= 1, `${file}: ${prose.length} prose choices read`);
    assert.deepEqual(offenders(file), [], file);
    assert.equal(RATCHET[file], undefined, `${file} is held to none, not to a ratchet`);
  });
});

test('the Algebra I lessons in ALGEBRA1: no reasoning choice gives its key away by length, but the ones named', () => {
  // Each distractor is a claim with a reason, wrong in one way ("No — their
  // slopes differ, so they cross once" beside "No — they are parallel lines
  // 2 units apart"), so the key no longer stands out among bare claims.
  Object.entries(ALGEBRA1).forEach(([file, kept]) => {
    const prose = choicesOf(JSON.parse(readFileSync(path.join(LESSONS, file), 'utf8'))).filter(isProse);
    assert.ok(prose.length > 0, `${file}: its prose choices are read`);
    assert.deepEqual(offenders(file), kept, file);
    assert.equal(RATCHET[file], kept.length || undefined, `${file}: in the ratchet only for what it keeps, at that number`);
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
