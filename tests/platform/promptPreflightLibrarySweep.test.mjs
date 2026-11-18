// THE LIBRARY SWEEP FOR #554 ITEM 6'S TWO PRE-FLIGHT NOTES: a prompt that
// needs another question's answer (otherQuestionReferencePreflight.js), and a
// prompt that names a graphing calculator the question does not give
// (graphingCalculatorPromptPreflight.js).
//
// A note on a correct prompt teaches teachers to ignore Pre-Flight, so every
// note these give on the repository's content was read by hand, and the list
// below is the result. A detector change that notes anything else fails here.
//
//   THE LESSONS. The 53 V5 files the repository's audits and import sweeps read
//   (teacher-import-jsons/**, docs/assignments, the root SAMPLE_*.json and
//   drafts/district-dol2: the files S8's sweep imported), compiled the way a
//   teacher's import is (scripts/check-teacher-import.mjs compileTeacherImport,
//   which builds Pre-Flight's model): 52 compile, 1381 questions.
//   THE WORDS ALONE. Every question in the repository's content (drafts, the
//   Path and secure seeds, the demo bank, docs and the lessons), read by the
//   two detectors as text, and every platform Question Family's generated
//   versions: what Recovery deals and a family slot shows.
//
// The one note in the library is a true problem, left for its author: no
// lesson content changes with this platform check.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { auditAssignmentGraphingCalculatorPrompts, graphingCalculatorPrompt } from '../../src/platform/preflight/graphingCalculatorPromptPreflight.js';
import { otherQuestionReference } from '../../src/platform/preflight/otherQuestionReferencePreflight.js';
import { ASSIGNMENT_CALCULATOR_SETTINGS } from '../../src/components/teacher/preflightV5Review.js';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const jsonFiles = (directory) => (existsSync(directory) ? readdirSync(directory).sort().flatMap((name) => {
  const full = path.join(directory, name);
  if (statSync(full).isDirectory()) return jsonFiles(full);
  return name.endsWith('.json') ? [full] : [];
}) : []);
const rootSamples = () => readdirSync(ROOT).filter((name) => /^SAMPLE_.*\.json$/.test(name)).sort().map((name) => path.join(ROOT, name));

const LESSON_FILES = [
  ...jsonFiles(path.join(ROOT, 'teacher-import-jsons')),
  ...jsonFiles(path.join(ROOT, 'docs/assignments')),
  ...rootSamples(),
  ...jsonFiles(path.join(ROOT, 'drafts/district-dol2')),
];

// Compiled once: every lesson as Pre-Flight sees it after a teacher's import.
const LESSONS = LESSON_FILES.flatMap((file) => {
  let compiled;
  try {
    compiled = compileTeacherImport(readFileSync(file, 'utf8'));
  } catch {
    return []; // Not an Assignment V5 a teacher can import (a raw array, schemaVersion 1).
  }
  return compiled.questions.length ? [{ file: relative(file), model: compiled.model }] : [];
});

/*
 * THE NOTES IN THE LIBRARY, READ BY HAND.
 *
 * T2 L2 Classwork 18 asks what Mia charges the next customer and says only
 * "Use the prices you found": the prices are Classwork 17's answer (a student
 * ticket $8, an adult $16). A student who meets it first, or after Classwork 17
 * is left out of a shorter assignment, has no prices (only the second box's
 * options give them away). A TRUE PROBLEM. Its Practice twin, Practice 16, is
 * the fix this note asks for: "Use the snack prices you found: a hot dog costs
 * $2 and a drink costs $3." Left for the content's author.
 */
const KNOWN_REFERENCES = Object.freeze([
  Object.freeze({ file: 'teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json', questionId: 'm3t2l2-cw-18', field: 'prompt', quote: 'Use the prices you found' }),
]);

test('the sweep reads the whole library', () => {
  const questions = LESSONS.reduce((sum, lesson) => sum + lesson.model.questions.length, 0);
  assert.ok(LESSON_FILES.length >= 53, `${LESSON_FILES.length} lesson files`);
  assert.ok(LESSONS.length >= 52 && questions >= 1381, `${LESSONS.length} lessons compile, ${questions} questions`);
});

test('a prompt that needs another question\'s answer: the one true problem in the library, and nothing else', () => {
  const found = LESSONS.flatMap(({ file, model }) => model.otherQuestionReferences.findings.map(({ questionId, field, quote }) => ({ file, questionId, field, quote })));
  assert.deepEqual(found, KNOWN_REFERENCES);
  // The note a teacher reads for it.
  const lesson = LESSONS.find(({ file }) => file === KNOWN_REFERENCES[0].file);
  assert.deepEqual(lesson.model.otherQuestionReferences.warnings, [
    'Question 21 says "Use the prices you found", which needs an answer from another question. A student who meets this question first, or without that one, has nothing to use. Repeat the value in this prompt, or make the two questions one multi-part question.',
  ]);
});

test('a graphing calculator named in a prompt: none in the library, so no note under any Calculator setting Review offers', () => {
  // No prompt in the library tells students to use a graphing calculator (the
  // DOL #2 wording #383 saw is not in the repository), so every setting must
  // stay silent: a note here would be a detector reading something else.
  const settings = [...new Set([...ASSIGNMENT_CALCULATOR_SETTINGS.map(({ value }) => value), 'teacherChoice', 'questionSpecific'])];
  let audits = 0;
  for (const { file, model } of LESSONS) {
    assert.deepEqual(model.graphingCalculatorPrompts.warnings, [], file);
    assert.equal(model.questions.filter((question) => graphingCalculatorPrompt(question)).length, 0, file);
    for (const calculator of settings) {
      audits += 1;
      const audit = auditAssignmentGraphingCalculatorPrompts({ ...model.assignmentV5, toolPolicy: { ...model.assignmentV5.toolPolicy, calculator } }, model.questions);
      assert.deepEqual(audit.warnings, [], `${file} with "${calculator}"`);
    }
  }
  assert.ok(audits >= 52 * 7, `${audits} lesson-setting audits`);
});

test('the words alone: every question in the repository\'s content reads as the library does', () => {
  const files = [...new Set([
    ...['drafts', 'seed', 'functions/seeds', 'src/demo', 'docs', 'teacher-import-jsons'].flatMap((directory) => jsonFiles(path.join(ROOT, directory))),
    ...rootSamples(),
  ])];
  let read = 0;
  const references = [];
  const calculators = [];
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const visit = (node) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== 'object') return;
      if (typeof node.prompt === 'string') {
        read += 1;
        // Its own words: a family slot's generated words are read below.
        const words = { ...node };
        delete words.questionFamily;
        const reference = otherQuestionReference(words);
        if (reference) references.push(`${relative(file)} ${node.questionId || node.id}: ${reference.quote}`);
        if (graphingCalculatorPrompt(words)) calculators.push(`${relative(file)} ${node.questionId || node.id}`);
      }
      Object.values(node).forEach(visit);
    };
    visit(data);
  }
  assert.ok(files.length >= 300 && read >= 20000, `${files.length} files, ${read} questions`);
  assert.deepEqual(references, KNOWN_REFERENCES.map(({ file, questionId, quote }) => `${file} ${questionId}: ${quote}`));
  assert.deepEqual(calculators, []);
});

test('the platform\'s own Question Families never trip either note', () => {
  let built = 0;
  const noted = [];
  for (const family of allRegisteredQuestionFamilies()) {
    // Each choice a teacher can make, one at a time, with the defaults.
    const constraintSets = [{}, ...Object.entries(family.constraints || {}).flatMap(([name, spec]) => (
      spec?.kind === 'choice' && Array.isArray(spec.values) ? spec.values.map((value) => ({ [name]: value })) : []
    ))];
    for (const constraints of constraintSets) {
      const sequence = cachedFamilyInstanceSequence(family, constraints, `prompt-preflight-sweep|${family.id}|${JSON.stringify(constraints)}`);
      for (const tool of Object.keys(family.tools || {})) {
        for (let index = 0; index < 6; index += 1) {
          const instance = sequence.instanceAt(index);
          if (!instance) break;
          const question = buildFamilyQuestion({ family, instance, constraintValues: constraints, authored: { prompt: '' }, tool });
          built += 1;
          if (otherQuestionReference(question) || graphingCalculatorPrompt(question)) noted.push(`${family.id}@${family.version} ${tool}`);
        }
      }
    }
  }
  assert.ok(built >= 400, `${built} generated versions`);
  assert.deepEqual(noted, []);
});
