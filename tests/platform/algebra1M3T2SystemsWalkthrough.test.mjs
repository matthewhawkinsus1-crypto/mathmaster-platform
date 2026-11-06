/*
 * ALGEBRA I · M3 · T2 · LESSONS 1 AND 2 (SYSTEMS BY GRAPHING, BY SUBSTITUTION),
 * WHAT THE 2026-11-06 STUDENT WALKTHROUGH CHECKED, HELD HERE.
 *
 * docs/qa/2026-11-06-a1-m3-t2-walkthrough/walkthrough.md. Each lesson is read
 * the way a teacher's import compiles it, and every number below is re-derived
 * from what the student reads (the cards' own equations), never from a key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra1-module3');
const FILES = {
  'T2 L1': 'T2_L1_Solving_Systems_by_Graphing.json',
  'T2 L1 Honors': 'T2_L1_Solving_Systems_by_Graphing_Honors.json',
  'T2 L2': 'T2_L2_Solving_Systems_by_Substitution.json',
  'T2 L2 Honors': 'T2_L2_Solving_Systems_by_Substitution_Honors.json',
};
const LESSONS = Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, compileTeacherImport(fs.readFileSync(path.join(DIR, name), 'utf8')).questions]));

/* ------------------------------------------- lines read from their text */

// "y = ½x + 4", "x − 2y = −8", "6x + 2y = 4": a·x + b·y = c, read from the text.
const NUMBER = { '½': 0.5, '⅓': 1 / 3, '¼': 0.25, '¾': 0.75 };
const row = (equation) => {
  const [left, right] = equation.replace(/−/g, '-').replace(/\s+/g, '').split('=');
  const out = { a: 0, b: 0, c: 0 };
  const read = (side, sign) => side.replace(/-/g, '+-').split('+').filter(Boolean).forEach((term) => {
    const [, coefficient, letter] = /^(-?[\d.½⅓¼¾]*)([xy]?)$/.exec(term);
    const magnitude = coefficient.replace('-', '');
    const value = magnitude === '' ? 1 : NUMBER[magnitude] ?? Number(magnitude);
    const signed = coefficient.startsWith('-') ? -value : value;
    if (letter === 'x') out.a += sign * signed;
    else if (letter === 'y') out.b += sign * signed;
    else out.c -= sign * signed;
  });
  read(left, 1);
  read(right, -1);
  return out;
};
const line = (equation) => {
  const { a, b, c } = row(equation);
  return { slope: -a / b, intercept: c / b };
};
const caseOf = ([first, second]) => {
  if (first.slope !== second.slope) return 'one';
  return first.intercept === second.intercept ? 'all' : 'none';
};
// "(4 and 4; −1 and −1)" -> [[4, 4], [-1, -1]]; null when the group is not numbers.
const numberPairs = (group) => {
  const pairs = group.split(';').map((pair) => pair.split(/\band\b/).map((value) => value.trim().replace(/−/g, '-')));
  if (!pairs.every((pair) => pair.length === 2 && pair.every((value) => /^-?\d+(\.\d+)?$/.test(value)))) return null;
  return pairs.map((pair) => pair.map(Number));
};
const sameMultiset = (left, right) => JSON.stringify(left.map(String).sort()) === JSON.stringify(right.map(String).sort());

// Each board's cards as they are graded: the stage's items, and the category
// the grading key files each one under.
const SORTS = Object.entries(LESSONS).flatMap(([lesson, questions]) => questions.flatMap((question) => (question.workflow || [])
  .filter((stage) => stage.kind === 'figureMatch' && stage.items?.length && stage.items.every((item) => / and /.test(item.text)))
  .map((stage) => ({
    lesson,
    question,
    cards: stage.items.map((item) => ({ text: item.text, category: question.grading?.[stage.id]?.match?.[item.id] })),
  }))));

test('the "sort each system by its number of solutions" boards are graded on cards whose category is their own case', () => {
  assert.ok(SORTS.length >= 3, `${SORTS.length} sort boards`);
  SORTS.forEach(({ lesson, question, cards }) => {
    cards.forEach((card) => {
      const lines = card.text.split(' and ').map(line);
      assert.equal(card.category, caseOf(lines), `${lesson} ${question.questionId}: ${card.text}`);
    });
  });
});

// The worked solution's numbers in brackets after "slopes" or "y-intercepts"
// are those of the cards in the category the sentence explains: a sentence
// about the parallel pairs that listed their slopes (4 and 4) as their
// "different y-intercepts" told a student the intercepts were equal.
test('every slope and y-intercept a sort board\'s worked solution names belongs to the cards it explains', () => {
  let checked = 0;
  SORTS.forEach(({ lesson, question, cards }) => {
    const byCategory = {};
    cards.forEach((card) => {
      const lines = card.text.split(' and ').map(line);
      (byCategory[card.category] ||= { slopes: [], intercepts: [] });
      byCategory[card.category].slopes.push(lines.map((entry) => entry.slope));
      byCategory[card.category].intercepts.push(lines.map((entry) => entry.intercept));
    });
    (question.solutionReview?.reasoning || []).forEach((sentence) => {
      const category = /exactly one solution/.test(sentence) ? 'one' : /no solution/.test(sentence) ? 'none' : /infinitely many/.test(sentence) ? 'all' : null;
      if (!category) return;
      for (const [, noun, group] of sentence.matchAll(/\b(slopes?|y-intercepts?)\s*\(([^)]*)\)/g)) {
        const pairs = numberPairs(group);
        if (!pairs) continue;
        const named = noun.startsWith('slope') ? byCategory[category].slopes : byCategory[category].intercepts;
        assert.ok(sameMultiset(pairs, named), `${lesson} ${question.questionId}: "${sentence}" names ${noun} ${JSON.stringify(pairs)}, the cards have ${JSON.stringify(named)}`);
        checked += 1;
      }
    });
  });
  assert.ok(checked >= 4, `${checked} bracketed lists checked`);
});
