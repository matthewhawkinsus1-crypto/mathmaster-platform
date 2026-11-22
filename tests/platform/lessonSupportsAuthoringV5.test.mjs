/*
 * LEARNING SUPPORTS IN ASSIGNMENT V5: THE AUTHORING CONTRACT (AG-1).
 *
 * New assignments can name their worked examples and reference cards
 * (`lessonSupports`, a question's `example`), and an answer part can build on
 * an earlier part (`followThrough`) or require a checked step (`checkpoint`).
 * The rules are in src/platform/contract/lessonSupportsV5.js and the author's
 * guide, docs/assignments/AUTHORING_LEARNING_SUPPORTS.md.
 *
 * What these tests hold:
 *   1. the guide's example lesson compiles, passes the validator and
 *      Pre-Flight, and every field reaches the compiled assignment unchanged;
 *   2. each malformed field is refused, with the message an author acts on;
 *   3. an example is never accepted on a DOL, quiz or test question, by the
 *      compiler or by Pre-Flight (the owner's decision, 2026-11-20);
 *   4. no existing assignment changes: every teacher-import-jsons lesson
 *      compiles byte for byte as it did, and carrying the new fields changes
 *      nothing else about it, its grading fields included.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { validateQuestionsSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateAssignmentV5 } from '../../src/platform/contract/assignmentSchemaV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { followThroughPlaceholders, validateLessonSupportsV5 } from '../../src/platform/contract/lessonSupportsV5.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = path.join(ROOT, 'tests/platform/fixtures/learningSupportsLessonFragment.json');
const GUIDE_PATH = path.join(ROOT, 'docs/assignments/AUTHORING_LEARNING_SUPPORTS.md');
const fixtureText = readFileSync(FIXTURE_PATH, 'utf8');
const fixture = () => JSON.parse(fixtureText);
const compile = (source) => parseAssignmentBlueprintText(JSON.stringify(source));
const sectionOf = (source, id) => source.sections.find((section) => section.id === id);
const questionOf = (source, questionId) => source.sections
  .flatMap((section) => section.questions)
  .find((question) => question.questionId === questionId);
const refusal = (source) => {
  try {
    compile(source);
  } catch (error) {
    return String(error?.message || error);
  }
  return null;
};

// ---------------------------------------------------------------- 1. accepted

test('the guide\'s example lesson compiles with no error from the compiler, the validator or Pre-Flight', () => {
  const parsed = compile(fixture());
  validateAssignmentQuestions(parsed.questions);
  assert.deepEqual(validateQuestionsSemantics(parsed.questions).errors, []);
  assert.deepEqual(validateAssignmentV5(parsed.assignmentV5).errors, []);
  assert.deepEqual(buildAssignmentV5PreflightModel(parsed.assignmentV5).errors, []);
});

test('every learning-support field reaches the compiled assignment unchanged', () => {
  const source = fixture();
  const { assignmentV5, questions } = compile(source);
  assert.deepEqual(assignmentV5.lessonSupports, source.lessonSupports);

  const authored = source.sections.flatMap((section) => section.questions);
  assert.equal(questions.length, authored.length);
  authored.forEach((question, index) => {
    const compiled = questions[index];
    assert.equal(compiled.questionId, question.questionId);
    assert.deepEqual(compiled.example, question.example, `${question.questionId}: example`);
    (question.responses || []).forEach((part) => {
      const out = compiled.answerFields.find((field) => field.id === part.id);
      assert.deepEqual(out.followThrough, part.followThrough, `${question.questionId} ${part.id}: followThrough`);
      assert.deepEqual(out.checkpoint, part.checkpoint, `${question.questionId} ${part.id}: checkpoint`);
    });
  });
  // The fixture uses every field, so the loop above is not vacuous.
  assert.ok(authored.some((question) => typeof question.example === 'string'));
  assert.ok(authored.some((question) => question.example?.none === 'setup'));
  assert.ok(authored.some((question) => question.example?.none === 'explain'));
  assert.ok(questions.some((question) => question.answerFields?.some((field) => field.followThrough)));
  assert.ok(questions.some((question) => question.answerFields?.some((field) => field.checkpoint)));
});

test('the guide shows the fixture itself as its example lesson', () => {
  const guide = readFileSync(GUIDE_PATH, 'utf8');
  const heading = guide.indexOf('## A complete example lesson');
  assert.ok(heading >= 0, 'the guide has its example-lesson section');
  const block = guide.slice(heading).match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, 'the example lesson is a ```json block');
  assert.deepEqual(JSON.parse(block[1]), fixture(), 'the guide and tests/platform/fixtures/learningSupportsLessonFragment.json are the same lesson');
});

test('the specs\' JSON sections link the guide', () => {
  ['docs/platform/WORKED_EXAMPLES.md', 'docs/platform/SHOWING_THE_PROCESS.md'].forEach((spec) => {
    assert.match(readFileSync(path.join(ROOT, spec), 'utf8'), /docs\/assignments\/AUTHORING_LEARNING_SUPPORTS\.md/, spec);
  });
});

// ---------------------------------------------------------------- 2. refused

/*
 * Each case breaks one thing in the guide's lesson. The compiler refuses it,
 * naming the field; Pre-Flight, judging the stored (compiled) assignment,
 * refuses the same thing wherever the field survives compiling.
 */
const MALFORMED = [
  {
    name: 'an example id that names no example',
    edit: (s) => { questionOf(s, 'ls-cw-2').example = 'ex-missing'; },
    message: 'Section 1 Question 2 example "ex-missing" names no lessonSupports.examples entry.',
  },
  {
    name: 'an example id on an assignment with no lessonSupports',
    edit: (s) => { delete s.lessonSupports; },
    message: 'Section 1 Question 2 example "ex-both-sides" names no lessonSupports.examples entry. Add lessonSupports.examples with',
  },
  {
    name: 'an exemption that is neither setup nor explain',
    edit: (s) => { questionOf(s, 'ls-cw-1').example = { none: 'review' }; },
    message: 'Section 1 Question 1 example.none must be "setup"',
  },
  {
    name: 'an example that is neither an id nor an exemption',
    edit: (s) => { questionOf(s, 'ls-cw-1').example = 3; },
    message: 'Section 1 Question 1 example must be an example id (text) or { "none": "setup" } or { "none": "explain" }, not 3.',
  },
  {
    name: 'an exemption with an extra key',
    edit: (s) => { questionOf(s, 'ls-cw-1').example = { none: 'setup', reason: 'intro' }; },
    message: 'Section 1 Question 1 example must be an example id (text) or { "none": "setup" } or { "none": "explain" }; reason is not part of it.',
  },
  {
    name: 'an example on a section its roles leave out',
    edit: (s) => { s.lessonSupports.examples[0].roles = ['practice']; },
    message: 'Section 1 Question 2 example "ex-both-sides" is for practice only (lessonSupports.examples[0].roles), and this question is on a classwork section.',
  },
  {
    name: 'lessonSupports that is not an object',
    edit: (s) => { s.lessonSupports = []; },
    message: 'lessonSupports must be an object',
  },
  {
    name: 'lessonSupports inside assignment',
    edit: (s) => { s.assignment.lessonSupports = s.lessonSupports; },
    message: 'assignment.lessonSupports is in the wrong place: lessonSupports goes at the top level of the assignment JSON, beside sections.',
  },
  {
    name: 'an unknown lesson support',
    edit: (s) => { s.lessonSupports.cards = []; },
    message: 'lessonSupports.cards is not a lesson support. Use referenceCards or examples.',
  },
  {
    name: 'examples that are not a list',
    edit: (s) => { s.lessonSupports.examples = { id: 'x' }; },
    message: 'lessonSupports.examples must be an array of examples',
  },
  {
    name: 'an example with no id',
    edit: (s) => { delete s.lessonSupports.examples[1].id; delete questionOf(s, 'ls-cw-4').example; },
    message: 'lessonSupports.examples[1].id is required',
  },
  {
    name: 'two examples with one id',
    edit: (s) => { s.lessonSupports.examples[1].id = 'ex-both-sides'; questionOf(s, 'ls-cw-4').example = 'ex-both-sides'; },
    message: 'lessonSupports.examples[1].id "ex-both-sides" is used by another example.',
  },
  {
    name: 'an unknown example source',
    edit: (s) => { s.lessonSupports.examples[0].source = 'teacher'; },
    message: 'lessonSupports.examples[0].source must be "builtIn", "authored" or "generated" (it is "teacher").',
  },
  {
    name: 'a misspelt example field',
    edit: (s) => { s.lessonSupports.examples[1].step = s.lessonSupports.examples[1].steps; },
    message: 'lessonSupports.examples[1].step is not an example field.',
  },
  {
    name: 'an authored example with nothing to play',
    edit: (s) => { delete s.lessonSupports.examples[1].steps; delete s.lessonSupports.examples[1].fade; },
    message: 'lessonSupports.examples[1] is authored but has nothing to play',
  },
  {
    name: 'an authored example with no problem',
    edit: (s) => { delete s.lessonSupports.examples[1].problem; },
    message: 'lessonSupports.examples[1] is authored but names no problem',
  },
  {
    name: 'a built-in example that names no skill or tool',
    edit: (s) => { s.lessonSupports.examples.push({ id: 'ex-built-in', source: 'builtIn' }); },
    message: 'lessonSupports.examples[2] is builtIn but names neither skill nor tool',
  },
  {
    name: 'a step with no why',
    edit: (s) => { delete s.lessonSupports.examples[1].steps[0].why; },
    message: 'lessonSupports.examples[1].steps[0].why is required: every step says why it is done.',
  },
  {
    name: 'a move with neither op nor check',
    edit: (s) => { s.lessonSupports.examples[0].moves[1] = { why: 'then this' }; },
    message: 'lessonSupports.examples[0].moves[1] needs an op',
  },
  {
    name: 'a check that is neither true nor "each"',
    edit: (s) => { s.lessonSupports.examples[0].moves[3].check = 'all'; },
    message: 'lessonSupports.examples[0].moves[3].check must be true, or "each" to check every root.',
  },
  {
    name: 'a fade past the last step',
    edit: (s) => { s.lessonSupports.examples[1].fade.fromStep = 9; },
    message: 'lessonSupports.examples[1].fade.fromStep is 9, but the example has 4 steps.',
  },
  {
    name: 'a fade that is not a whole number',
    edit: (s) => { s.lessonSupports.examples[0].fade.handOverAfter = 0; },
    message: 'lessonSupports.examples[0].fade.handOverAfter must be a whole number of 1 or more.',
  },
  {
    name: 'an example on a DOL role',
    edit: (s) => { s.lessonSupports.examples[0].roles = ['classwork', 'dol']; },
    message: 'lessonSupports.examples[0].roles[1] is "dol". Examples are never shown on a DOL, quiz or test.',
  },
  {
    name: 'an example that is an item on the assignment',
    edit: (s) => { s.lessonSupports.examples[0].sibling = { equation: '6x - 5 = 2x + 11' }; },
    message: 'lessonSupports.examples[0] is the same problem as Section 1 Question 3. An example is a sibling problem with different numbers, never an item on this assignment.',
  },
  {
    name: 'a reference card with no skill',
    edit: (s) => { delete s.lessonSupports.referenceCards[0].skill; },
    message: 'lessonSupports.referenceCards[0].skill is required',
  },
  {
    name: 'a reference card on a section that does not exist',
    edit: (s) => { s.lessonSupports.referenceCards[0].sections = ['classwork', 'homework']; },
    message: 'lessonSupports.referenceCards[0].sections[1] "homework" names no section of this assignment.',
  },
  {
    name: 'a followThrough that is not an object',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[2].followThrough = 'slope'; },
    message: 'Section 1 Question 4 responses[2].followThrough must be an object',
  },
  {
    name: 'a followThrough from a part that does not exist',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[2].followThrough.from = ['slope', 'yIntercept']; },
    message: 'Section 1 Question 4 responses[2].followThrough.from[1] "yIntercept" names no part of this question.',
  },
  {
    name: 'a followThrough from a later part',
    edit: (s) => {
      const parts = questionOf(s, 'ls-cw-4').responses;
      parts[1].followThrough = { from: ['equation'], answer: '-2' };
    },
    message: 'Section 1 Question 4 responses[1].followThrough.from[0] "equation" is a later part.',
  },
  {
    name: 'a followThrough from the part itself',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[2].followThrough.from = ['equation']; },
    message: 'Section 1 Question 4 responses[2].followThrough.from[0] "equation" is this part itself.',
  },
  {
    name: 'a followThrough with no from',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[2].followThrough.from = []; },
    message: 'Section 1 Question 4 responses[2].followThrough.from must be a non-empty list',
  },
  {
    name: 'a followThrough with no answer',
    edit: (s) => { delete questionOf(s, 'ls-cw-4').responses[2].followThrough.answer; },
    message: 'Section 1 Question 4 responses[2].followThrough.answer must be this part\'s answer',
  },
  {
    name: 'a label placeholder that from does not list',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[2].followThrough.from = ['slope']; questionOf(s, 'ls-cw-4').responses[2].followThrough.answer = 'y = {slope}x - 2'; },
    message: 'Section 1 Question 4 responses[2].label uses {intercept}, which followThrough.from does not list.',
  },
  {
    name: 'an answer placeholder that from does not list',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[2].followThrough.answer = 'y = {slope}x + {b}'; },
    message: 'Section 1 Question 4 responses[2].followThrough.answer uses {b}, which followThrough.from does not list.',
  },
  {
    name: 'two parts with one id under a followThrough',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[1].id = 'slope'; questionOf(s, 'ls-cw-4').responses[2].followThrough = { from: ['slope'], answer: 'y = {slope}x - 2' }; questionOf(s, 'ls-cw-4').responses[2].label = 'Using your slope of {slope}, write the equation'; },
    message: 'Section 1 Question 4 responses has more than one part with id "slope".',
  },
  {
    name: 'an unknown checkpoint kind',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[0].checkpoint.kind = 'plotPoints'; },
    message: 'Section 1 Question 4 responses[0].checkpoint.kind "plotPoints" is not a checkpoint. Use "pickPoints", "factorPair", "stepMoves" or "tableRow".',
  },
  {
    name: 'a checkpoint with no kind',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[0].checkpoint = { count: 2 }; },
    message: 'Section 1 Question 4 responses[0].checkpoint.kind is missing.',
  },
  {
    name: 'a checkpoint count that is not a whole number',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[0].checkpoint.count = 1.5; },
    message: 'Section 1 Question 4 responses[0].checkpoint.count must be a whole number of 1 or more.',
  },
  {
    name: 'a count on a kind that counts nothing',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[0].checkpoint = { kind: 'factorPair', count: 2 }; },
    message: 'Section 1 Question 4 responses[0].checkpoint.count applies to "pickPoints" or "tableRow" only, not "factorPair".',
  },
  {
    name: 'a checkpoint that is not an object',
    edit: (s) => { questionOf(s, 'ls-cw-4').responses[0].checkpoint = 'pickPoints'; },
    message: 'Section 1 Question 4 responses[0].checkpoint must be an object',
  },
  {
    name: 'a followThrough on the question instead of a part',
    edit: (s) => { questionOf(s, 'ls-cw-4').followThrough = { from: ['slope'], answer: '{slope}' }; },
    message: 'Section 1 Question 4 followThrough belongs on one of the question\'s responses[] parts, not on the question itself.',
  },
  {
    name: 'a checkpoint on a question whose tool keeps no answer parts',
    edit: (s) => { questionOf(s, 'ls-cw-2').responses = [{ id: 'x', label: 'x', answer: '-5', checkpoint: { kind: 'stepMoves', of: '4x + 7 = x - 8' } }]; },
    message: 'Section 1 Question 2 responses[0].checkpoint did not reach the compiled question: MathMaster compiled it as stepAlgebra with no answer part "x" to carry it.',
  },
];

MALFORMED.forEach(({ name, edit, message }) => {
  test(`refused: ${name}`, () => {
    const source = fixture();
    edit(source);
    const error = refusal(source);
    assert.ok(error, 'the compiler refuses it');
    assert.match(error, /^Assignment V5 validation failed:/);
    assert.ok(error.includes(message), `expected "${message}" in:\n${error}`);
  });
});

test('Pre-Flight refuses a malformed field in a stored assignment, on the question it is about', () => {
  const stored = structuredClone(compile(fixture()).assignmentV5);
  stored.sections[0].questions[3].answerFields[0].checkpoint.kind = 'plotPoints';
  const model = buildAssignmentV5PreflightModel(stored);
  const message = 'Section 1 Question 4 answerFields[0].checkpoint.kind "plotPoints" is not a checkpoint.';
  assert.ok(model.errors.some((error) => error.startsWith(message)), model.errors.join('\n'));
  const diagnostic = model.diagnostics.find((entry) => entry.message.startsWith(message));
  assert.equal(diagnostic?.questionId, 'ls-cw-4', 'the diagnostic lands on the question');
  assert.equal(diagnostic?.fieldPath, 'sections[0].questions[3].answerFields[0].checkpoint.kind');
});

// ------------------------------------------------- 3. never on DOL, quiz or test

[
  ['dol', 'DOL'],
  ['quiz', 'quiz'],
  ['test', 'test'],
].forEach(([role, shown]) => {
  test(`an example on a ${shown} question is refused, by the compiler and by Pre-Flight`, () => {
    const source = fixture();
    const section = sectionOf(source, 'dol');
    section.role = role;
    section.questions[0].example = 'ex-both-sides';
    const message = `Section 3 Question 1 example is on a ${shown} section. Examples are never shown on a DOL, quiz or test: remove the example field.`;
    const error = refusal(source);
    assert.ok(error?.includes(message), error || 'compiled');

    // An exemption is refused there too: there is nothing to exempt.
    section.questions[0].example = { none: 'setup' };
    assert.ok(refusal(source)?.includes(message));

    // A stored assignment edited to carry one is refused by Pre-Flight.
    const clean = fixture();
    sectionOf(clean, 'dol').role = role;
    const stored = structuredClone(compile(clean).assignmentV5);
    stored.sections[2].questions[0].example = 'ex-both-sides';
    assert.ok(validateLessonSupportsV5(stored).errors.includes(message));
    assert.ok(buildAssignmentV5PreflightModel(stored).errors.includes(message));
  });

  test(`a reference card pinned on a ${shown} section is refused`, () => {
    const source = fixture();
    sectionOf(source, 'dol').role = role;
    source.lessonSupports.referenceCards[0].sections = ['classwork', 'dol'];
    const error = refusal(source);
    assert.ok(error?.includes(`lessonSupports.referenceCards[0].sections[1] "dol" is a ${shown} section. Reference cards are never shown on a DOL, quiz or test`), error || 'compiled');
    // Named by role rather than by id, the same.
    source.lessonSupports.referenceCards[0].sections = [role];
    assert.ok(refusal(source)?.includes(`lessonSupports.referenceCards[0].sections[0] "${role}" is a ${shown} section.`));
  });
});

test('follow-through placeholders are part ids in words, never the braces of mathematics or a family template', () => {
  assert.deepEqual(followThroughPlaceholders('Using your slope of {slope} and {b-value}, write it'), ['slope', 'b-value']);
  assert.deepEqual(followThroughPlaceholders('y = {slope}x + {intercept}'), ['slope', 'intercept']);
  assert.deepEqual(followThroughPlaceholders('\\sqrt{x} + \\frac{a}{b} + x^{2} + x_{n} + {{k}} + ${x}$'), []);
  assert.deepEqual(followThroughPlaceholders('The set {1, 2, 3} and {x | x > 2}'), []);
});

// ------------------------------------------- 4. existing assignments unchanged

const LESSON_FILES = (() => {
  const files = [];
  const walk = (directory) => readdirSync(directory).sort().forEach((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.json')) files.push(full);
  });
  walk(path.join(ROOT, 'teacher-import-jsons'));
  return files;
})();

const NEW_FIELDS = new Set(['lessonSupports', 'example', 'followThrough', 'checkpoint']);
const keysFound = (value, found = new Set()) => {
  if (Array.isArray(value)) value.forEach((entry) => keysFound(entry, found));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      if (NEW_FIELDS.has(key)) found.add(key);
      keysFound(entry, found);
    });
  }
  return found;
};
const withoutNewFields = (value) => {
  if (Array.isArray(value)) return value.map(withoutNewFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !NEW_FIELDS.has(key))
    .map(([key, entry]) => [key, withoutNewFields(entry)]));
};
// Everything a compile hands on: the assignment, its questions, the stored
// text, and what the compiler reported doing.
const compiledView = (parsed) => ({
  assignmentV5: parsed.assignmentV5,
  questions: parsed.questions,
  normalizedText: JSON.parse(parsed.normalizedText),
  repairs: parsed.repairs,
  warnings: parsed.warnings,
});

/*
 * The new fields written onto a real lesson the way an author would: one
 * example and one card, the example on each eligible section's first
 * question and an exemption on the rest, a checkpoint on every first part and
 * a follow-through from it on every later part. DOL, quiz and test get none.
 */
const NO_EXAMPLE_ROLES = ['dol', 'quiz', 'test'];
const withNewFields = (source) => {
  const out = structuredClone(source);
  const eligible = out.sections.filter((section) => !NO_EXAMPLE_ROLES.includes(String(section.role || 'classwork').toLowerCase()));
  out.lessonSupports = {
    referenceCards: [{ id: 'inert-card', skill: 'inert.skill', ...(eligible[0]?.id ? { sections: [eligible[0].id] } : {}) }],
    examples: [{ id: 'inert-example', skill: 'inert.skill', source: 'builtIn' }],
  };
  let parts = 0;
  out.sections.forEach((section) => {
    const showsExamples = eligible.includes(section);
    (section.questions || []).forEach((question, index) => {
      if (showsExamples) question.example = index === 0 ? 'inert-example' : { none: 'setup' };
      const list = question.responses || question.answerFields || question.response?.fields;
      if (!Array.isArray(list) || !list.length) return;
      const ids = list.map((part, partIndex) => String(part?.id || '').trim() || `part-${partIndex + 1}`);
      if (new Set(ids).size !== ids.length) return;
      list.forEach((part, partIndex) => {
        if (!part || typeof part !== 'object') return;
        if (partIndex === 0) {
          part.checkpoint = { kind: 'tableRow', count: 1, of: 'y = 2x + 1' };
        } else if (followThroughPlaceholders(part.label ?? part.prompt).every((name) => name === ids[0])) {
          part.followThrough = { from: [ids[0]], answer: `{${ids[0]}}` };
        } else return;
        parts += 1;
      });
    });
  });
  return { source: out, parts };
};

/*
 * No lesson in teacher-import-jsons carries a new field, so each compiles to
 * exactly what it compiled to before them (checked byte for byte against the
 * compile of main before AG-1, 43 lessons, when this was written). What
 * proves it here without pinning today's output: the same lesson compiled
 * again with the fields written in, then taken out, is byte for byte the
 * lesson compiled without them.
 */
test('on every existing assignment, the new fields pass through unchanged and change nothing else, byte for byte', () => {
  assert.ok(LESSON_FILES.length >= 40, `found ${LESSON_FILES.length} lessons`);
  let carried = 0;
  LESSON_FILES.forEach((file) => {
    const name = path.relative(ROOT, file);
    const original = JSON.parse(readFileSync(file, 'utf8'));
    const before = compiledView(parseAssignmentBlueprintText(JSON.stringify(original)));
    // The lesson as it stands carries none of the fields, before or after
    // compiling, so taking them out below removes only what was written in.
    assert.deepEqual([...keysFound(original)], [], `${name}: authored`);
    assert.deepEqual([...keysFound(before)], [], `${name}: compiled`);
    const { source, parts } = withNewFields(original);
    const parsedAfter = parseAssignmentBlueprintText(JSON.stringify(source));
    const after = compiledView(parsedAfter);

    // Byte for byte, once the new fields are taken out again: the grading
    // fields, the renderer contracts and the compiler's own report included.
    assert.equal(JSON.stringify(withoutNewFields(after)), JSON.stringify(before), `${name}: compiled output`);

    // And the fields themselves arrived as written.
    assert.deepEqual(parsedAfter.assignmentV5.lessonSupports, source.lessonSupports, `${name}: lessonSupports`);
    const authored = source.sections.flatMap((section) => section.questions || []);
    authored.forEach((question, index) => {
      assert.deepEqual(parsedAfter.questions[index].example, question.example, `${name} question ${index + 1}: example`);
    });
    const carriedParts = parsedAfter.questions
      .flatMap((question) => [...(question.answerFields || []), ...(question.fields || [])])
      .filter((part) => part?.checkpoint || part?.followThrough).length;
    assert.equal(carriedParts, parts, `${name}: every part's checkpoint or followThrough`);
    carried += parts;

    // Judged again as a stored assignment (Pre-Flight's check), it is accepted.
    assert.deepEqual(validateLessonSupportsV5(parsedAfter.assignmentV5).errors, [], `${name}: stored`);
  });
  assert.ok(carried > 100, `parts carrying a field across the lessons: ${carried}`);
});
