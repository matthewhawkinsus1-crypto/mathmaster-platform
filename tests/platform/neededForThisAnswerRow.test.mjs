/*
 * THE PHONE'S "NEEDED FOR THIS ANSWER" ROW SAYS WHAT THE KEY SAYS
 * (2026-11-06 walkthrough of Algebra I M3 T1, L3 CW 8: "0 ≤ b < 540 is refused";
 * docs/qa/2026-11-06-a1-m3-t1-walkthrough/walkthrough.md).
 *
 * L3 CW 8 part b is keyed b < 540. Accepting the bounded 0 ≤ b < 540 as well, as
 * W3 did for CW 4, waited on this row: MultiAnswerGrader read it from every
 * accepted answer, so the box would have shown ≤, a key its answer never uses.
 * Now a relation or a letter is in the row only when the box's key needs it;
 * a key that only spells an answer (a⁄b, brackets, a power) stays whichever
 * accepted form needs it (neededAnswerSymbols, answerEntryTools.js). Read from
 * the key alone, one box in the lessons would have lost a key: the District
 * DOL2 review's "s = 3c" box, which also takes "c = s/3", keeps its a⁄b.
 *
 * Across every lesson file, every typed box's row is exactly what it was, in
 * every version a student is dealt. The bounded answer is not added to CW 8
 * here; the last test shows it now can be.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { versionsOf } from './helpers/lessonFileChecks.mjs';
import { fieldKeyValues, inferRequiredAnswerSymbols, neededAnswerSymbols } from '../../src/platform/interaction/answerEntryTools.js';
import { answerCandidatesForField, matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lessonFiles = () => {
  const files = [];
  const walk = (directory) => readdirSync(directory).sort().forEach((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.json')) files.push(full);
  });
  walk(path.join(ROOT, 'teacher-import-jsons'));
  walk(path.join(ROOT, 'docs/assignments'));
  readdirSync(ROOT).filter((name) => /^SAMPLE_.*\.json$/.test(name)).sort().forEach((name) => files.push(path.join(ROOT, name)));
  return files;
};

/** The row as the box shows it now, and as it was read before: from every accepted answer. */
const rowNow = (field) => {
  const accepted = answerCandidatesForField(field);
  return neededAnswerSymbols({ key: fieldKeyValues(field, accepted), accepted });
};
const rowBefore = (field) => inferRequiredAnswerSymbols(answerCandidatesForField(field));
const rowOfKeyAlone = (field) => inferRequiredAnswerSymbols(fieldKeyValues(field, answerCandidatesForField(field)));

test('across every lesson file, in every version a student is dealt, no box\'s row changes', () => {
  let files = 0;
  let fields = 0;
  let alternatives = 0;
  const changed = [];
  const keyAloneChanges = new Set();
  lessonFiles().forEach((file) => {
    let questions = [];
    try { ({ questions } = compileTeacherImport(readFileSync(file, 'utf8'))); } catch { return; }
    if (!questions.length) return;
    files += 1;
    questions.forEach((question) => (question.questionFamily ? versionsOf(question, 8) : [question]).forEach((version) => {
      (version.answerFields || []).forEach((field) => {
        fields += 1;
        if (answerCandidatesForField(field).length > fieldKeyValues(field).length) alternatives += 1;
        const where = `${path.relative(ROOT, file)} ${version.questionId}.${field.id}`;
        if (JSON.stringify(rowNow(field)) !== JSON.stringify(rowBefore(field))) changed.push(`${where}: [${rowBefore(field)}] → [${rowNow(field)}]`);
        if (JSON.stringify(rowOfKeyAlone(field)) !== JSON.stringify(rowBefore(field))) keyAloneChanges.add(`${path.relative(ROOT, file)} ${version.questionId}.${field.id}`);
      });
    }));
  });
  // The sweep reads the lessons, and the boxes that take more than their key.
  assert.ok(files >= 45 && fields >= 4000 && alternatives >= 40, `${files} files, ${fields} fields, ${alternatives} with other accepted answers`);
  assert.deepEqual(changed, []);
  // Read from the key alone, exactly one box would have changed: the reason spelling keys stay.
  assert.deepEqual([...keyAloneChanges], ['teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json dol2r-wu-4.compare']);
});

test('a relation or a letter only an accepted form needs is left out; a key that only spells one stays', () => {
  // The bounded form of an inequality: ≤ is not this answer's relation.
  const bounded = { id: 'b', answer: 'b<540', acceptedAnswers: ['0<=b<540'], inputProfile: 'inequality' };
  assert.ok(rowBefore(bounded).includes('≤'), 'read from every accepted answer, the row showed ≤');
  assert.deepEqual(rowNow(bounded), inferRequiredAnswerSymbols(['b<540']));
  // A number keyed alone: x and = belong to "x = 5", which says the same thing another way.
  assert.deepEqual(rowNow({ id: 'n', answer: '5', acceptedAnswers: ['x = 5'] }), []);
  // The DOL2 review's box: s = 3c also takes c = s/3, and the fraction key stays.
  const compare = { id: 'compare', answer: 's=3c', acceptedAnswers: ['s-3c=0', 'c=s/3'] };
  assert.ok(rowNow(compare).includes('a⁄b'));
  assert.deepEqual(rowNow(compare), rowBefore(compare));
  // The key's own relations and letters are always there.
  assert.deepEqual(rowNow({ id: 'k', answer: 'y >= 1/2x - 3' }), inferRequiredAnswerSymbols(['y >= 1/2x - 3']));
});

test('L3 CW 8 part b can now take 0 ≤ b < 540: graded right in the browser and on the server, with the key\'s own row', () => {
  const { questions } = compileTeacherImport(readFileSync(path.join(ROOT, 'teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json'), 'utf8'));
  const question = questions.find((candidate) => candidate.questionId === 'm3l3-cw-8');
  const field = question.answerFields.find((candidate) => candidate.id === 'b');
  assert.equal(field.answer, 'b<540');
  assert.equal((field.acceptedAnswers || []).length, 0, 'the lesson file is not changed here');
  // With the bounded form accepted, as W3 did for CW 4 (in this test only):
  const withBounded = { ...field, acceptedAnswers: ['0<=b<540'] };
  const asked = { ...question, answerFields: question.answerFields.map((candidate) => (candidate.id === 'b' ? withBounded : candidate)) };
  const right = Object.fromEntries(asked.answerFields.map((candidate) => [candidate.id, String(candidate.answer)]));
  ['0 <= b < 540', '0\\le b<540', 'b < 540'].forEach((typed) => {
    const answers = { ...right, b: typed };
    assert.equal(gradeMultiAnswerResponse(asked, answers).isCorrect, true, typed);
    assert.equal(gradeServerResponse({ question: asked, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } }).isCorrect, true, `${typed} on the server`);
  });
  assert.equal(matchesFieldAnswer('0 <= b <= 540', withBounded), false, 'the boundary itself is still refused');
  // The row is the key's: no ≤ for an answer that uses only <.
  assert.deepEqual(rowNow(withBounded), rowNow(field));
  assert.equal(rowNow(withBounded).includes('≤'), false);
});
