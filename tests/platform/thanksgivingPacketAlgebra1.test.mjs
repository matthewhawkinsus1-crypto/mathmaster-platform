/*
 * ALGEBRA I · THANKSGIVING BREAK PACKET, REGULAR AND HONORS, AS A TEACHER
 * IMPORTS THEM.
 *
 * teacher-import-jsons/thanksgiving-packet/ holds a cumulative review of the
 * year so far, for a student working alone over the break: ten Classwork
 * sections, one for each unit in the order taught, each going from the
 * building block to grade level. The Honors file is the regular file's
 * questions with the Honors questions of each unit after them. Both are
 * written by scripts/content/build-algebra1-thanksgiving-packet.mjs.
 *
 * What this holds:
 *   - each committed file is exactly what the builder writes;
 *   - both pass the teacher import's Pre-Flight with no error and no warning,
 *     hide none of their hints, and get no advice but the note every lesson
 *     gets (no Spanish version is written);
 *   - the unit structure and the counts: 54 questions and 65;
 *   - every question is taught before it is asked: a worked example the lesson
 *     writes, an earlier question on its skill, or the platform's own — the
 *     platform's coverage rule finds none uncovered, and the first question on
 *     each skill carries the example and the guided notes Classwork shows today;
 *   - every question has three hints, a "Let's back up" step, a worked solution
 *     with steps and the usual mistake;
 *   - no item is an item of a taught lesson;
 *   - EVERY KEY, worked out here from what the student is shown (the points,
 *     the rows, the equation in the prompt, the numbers of the story) and never
 *     read back from the question's key, graded right by the graders the server
 *     runs, with one wrong response per question graded wrong;
 *   - for an Honors class, Pre-Flight changes nothing in the Honors file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fraction from 'fraction.js';
import { all, create } from 'mathjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { reviewImportForHonors } from '../../scripts/lib/honorsImportReview.mjs';
import {
  HONORS_FILE,
  PACKET_UNITS,
  REGULAR_FILE,
  THANKSGIVING_PACKET_FILES,
  expectedFileText,
} from '../../scripts/content/build-algebra1-thanksgiving-packet.mjs';
import { ADVISORY_FINDING_GROUPS } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { HONORS_CCMR_STATUS } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { classworkExampleCoverage, exampleSkillOf } from '../../src/platform/supports/workedExample/classworkCoverage.js';
import { lessonExampleContext, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { validateLessonSupportsV5 } from '../../src/platform/contract/lessonSupportsV5.js';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { auditAssignmentSolutionReviews, hasAuthoredCommonError } from '../../src/platform/preflight/solutionReviewPreflight.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import * as followThrough from '../../functions/shared/followThrough.mjs';
import { gradeServerResponse, gradeToolWork, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { equationWorkspaceWork, relationWorkspaceWork, stepAlgebraWorkGrader } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { parseRelationSource, relationSolutionSummary } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { keyProcessLog } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { deriveLinearMultipleRepresentations, resolveRequiredCards } from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { referenceLineOf } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { correctFunctionChoice } from '../../functions/shared/relationFunctionChoice.mjs';
import { openSortSettings } from '../../functions/shared/toolMath/openSortBoard/openSortMath.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const load = (file) => {
  const text = read(file);
  return { text, raw: JSON.parse(text), ...compileTeacherImport(text) };
};
const REGULAR = load(REGULAR_FILE);
const HONORS = load(HONORS_FILE);
const PACKETS = [['regular', REGULAR], ['Honors', HONORS]];

// Every question is graded as the Honors file compiles it: its questions are
// the regular file's, unchanged (held below), and the Honors ones.
const item = (id) => {
  const question = HONORS.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the packet compiles ${id}`);
  return question;
};
const authored = (id) => HONORS.raw.sections.flatMap((section) => section.questions).find((question) => question.questionId === id);
const failing = (result) => JSON.stringify((result.parts || []).filter((part) => !part.isCorrect).map((part) => part.id || part.label));

// Later questions whose borrowed example meets their own answers (a term of
// the sequence is 2, an image coordinate is 3 or 7): the player gives them the
// platform's own sibling instead.
const BORROWED_BUILT_IN = ['tg-u3-q2', 'tg-u4-h1'];
const REGULAR_COUNTS = [5, 8, 4, 4, 4, 7, 6, 5, 5, 6];
const HONORS_COUNTS = [6, 9, 5, 5, 5, 8, 7, 6, 6, 8];
const UNIT_TEKS = [
  ['A.2A', 'A.12A', 'A.3C'],
  ['A.2B', 'A.2C', 'A.3B', 'A.3C'],
  ['A.4B', 'A.4C', 'A.12C'],
  ['A.3E'],
  ['A.2F', 'A.2G'],
  ['A.5A'],
  ['A.5B'],
  ['A.3F', 'A.3G', 'A.2I'],
  ['A.5C', 'A.2I'],
  ['A.3D', 'A.2H', 'A.3H'],
];

/* ------------------------------------------------- mathematics, done here */

const exact = create(all, { number: 'Fraction' });
const ascii = (text) => String(text).replace(/−/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/·/g, '*');
const frac = (value) => new Fraction(ascii(value));
const fractionText = (value) => {
  const fraction = exact.fraction(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const num = (value) => Number(exact.number(exact.fraction(value)));
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=' };

/**
 * A linear relation in two letters, read from its text by evaluating each side:
 * "4x − 2y = 6" is { a: 4, b: −2, c: −6, relation: '=' }, meaning a·u + b·v + c (relation) 0.
 */
const linearOf = (text, [u, v] = ['x', 'y']) => {
  const [, left, relation, right] = /^(.*?)(<=|>=|<|>|=)(.*)$/.exec(ascii(text).replace(/\$/g, '').replace(/\\le\b/g, '<=').replace(/\\ge\b/g, '>='));
  const gap = (uValue, vValue) => exact.subtract(
    exact.fraction(exact.evaluate(left, { [u]: exact.fraction(uValue), [v]: exact.fraction(vValue) })),
    exact.fraction(exact.evaluate(right, { [u]: exact.fraction(uValue), [v]: exact.fraction(vValue) })),
  );
  const c = gap(0, 0);
  return { a: num(exact.subtract(gap(1, 0), c)), b: num(exact.subtract(gap(0, 1), c)), c: num(c), relation };
};
/** The same relation with v alone: v (relation) m·u + k, or a vertical line u (relation) value. */
const solvedForV = ({ a, b, c, relation }) => (b === 0
  ? { vertical: true, at: -c / a, relation: a < 0 ? FLIP[relation] : relation }
  : { m: -a / b, k: -c / b, relation: b < 0 ? FLIP[relation] : relation });
/** Where two lines a·u + b·v + c = 0 meet, or the kind of system they are. */
const meet = (p, q) => {
  const determinant = p.a * q.b - q.a * p.b;
  // "+ 0" writes a zero coordinate as 0, never −0.
  if (determinant !== 0) return { type: 'one', x: (p.b * q.c - q.b * p.c) / determinant + 0, y: (q.a * p.c - p.a * q.c) / determinant + 0 };
  return { type: p.a * q.c === q.a * p.c && p.b * q.c === q.b * p.c ? 'infinite' : 'none' };
};
/** The solution of a linear equation or inequality in one letter, from its two sides. */
const solveOneVariable = (source, variable = 'x') => {
  const { a, c, relation } = linearOf(source, [variable, '_unused']);
  if (a === 0) {
    const holds = { '=': c === 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[relation];
    return { special: holds ? 'allReals' : 'noSolution' };
  }
  return { relation: relation === '=' || a > 0 ? relation : FLIP[relation], boundary: exact.divide(exact.unaryMinus(exact.fraction(c)), exact.fraction(a)) };
};
const lineThrough = ([x1, y1], [x2, y2]) => {
  const m = frac(y2).sub(y1).div(frac(x2).sub(x1));
  return { m, b: frac(y1).sub(m.mul(x1)) };
};
const onLine = ({ m, b }, [x, y]) => m.mul(x).add(b).equals(y);
const pairsAreFunction = (xs, ys) => xs.every((x, i) => xs.every((other, j) => other !== x || ys[j] === ys[i]));
const signed = (value) => `${value < 0 ? '-' : '+'} ${Math.abs(value)}`;

/* -------------------------------------------------------------- the files */

test('each committed file is exactly what the builder writes', () => {
  assert.deepEqual(THANKSGIVING_PACKET_FILES.map((entry) => entry.file), [REGULAR_FILE, HONORS_FILE]);
  THANKSGIVING_PACKET_FILES.forEach((entry) => {
    assert.equal(read(entry.file), expectedFileText(entry), `rebuild it: node scripts/content/build-algebra1-thanksgiving-packet.mjs (${entry.file})`);
  });
});

// The one note every lesson in teacher-import-jsons/ gets: none writes translations.es.
const NO_SPANISH_WRITTEN = /^(?:Question \d+|\d+ questions — [\d, ]+(?: and \d+ more)?) (?:has|have) (?:hints|a worked solution) with no Spanish version, so a student who reads in Spanish sees (?:them|it) in English only\./;

for (const [name, packet] of PACKETS) {
  test(`${name}: Pre-Flight finds no error and no warning, hides no hint, and gives no advice but the Spanish note`, () => {
    assert.deepEqual(packet.model.errors, []);
    assert.deepEqual(packet.model.warnings || [], []);
    assert.equal(packet.model.isValid, true);
    assert.deepEqual(packet.parsed.warnings || [], []);
    assert.deepEqual(packet.semantic.errors, []);
    assert.deepEqual(packet.semantic.warnings, []);
    assert.ok(ADVISORY_FINDING_GROUPS.length >= 10);
    ADVISORY_FINDING_GROUPS.forEach(({ id }) => {
      const found = packet.model[id]?.warnings || [];
      if (id === 'spanishVersions') {
        assert.ok(found.every((note) => NO_SPANISH_WRITTEN.test(note)), `${id}: ${JSON.stringify(found)}`);
        return;
      }
      assert.deepEqual(found, [], id);
    });
    assert.deepEqual(auditAssignmentSolutionReviews(packet.questions).warnings, []);
  });

  test(`${name}: one review assignment of ten Classwork sections, one for each unit in the order taught`, () => {
    const { raw } = packet;
    assert.equal(raw.schemaVersion, 5);
    assert.deepEqual(
      [raw.assignment.courseId, raw.assignment.instructionalPurpose, raw.assignment.gradingPurpose, raw.assignment.folder],
      ['algebra1', 'review', 'classwork', 'Algebra I/Thanksgiving Packet'],
    );
    assert.deepEqual(raw.variantPolicy, { mode: 'shared' });
    assert.equal(/Honors/.test(raw.assignment.title), name === 'Honors');
    assert.equal(raw.sections.length, 10);
    const counts = name === 'Honors' ? HONORS_COUNTS : REGULAR_COUNTS;
    raw.sections.forEach((section, index) => {
      assert.equal(section.id, `unit-${index + 1}`);
      // Classwork on purpose: a worked example opens by itself only there.
      assert.equal(section.role, 'classwork');
      assert.match(section.title, new RegExp(`^Unit ${index + 1} — \\S`));
      assert.deepEqual([section.feedbackMode, section.hintsAllowed, section.attemptsAllowed], ['immediate', true, undefined]);
      assert.equal(section.questions.length, counts[index], section.title);
      section.questions.forEach((question) => {
        const primary = question.alignments.filter((alignment) => alignment.role === 'primary');
        assert.equal(primary.length, 1, question.questionId);
        assert.equal(primary[0].code, question.standard, question.questionId);
        assert.ok(UNIT_TEKS[index].includes(question.standard), `${question.questionId}: ${question.standard} is a standard of unit ${index + 1}`);
      });
      // Every standard the unit names is practised in it.
      assert.deepEqual([...new Set(section.questions.map((question) => question.standard))].sort(), [...UNIT_TEKS[index]].sort(), section.title);
    });
    const total = counts.reduce((sum, count) => sum + count, 0);
    assert.equal(total, name === 'Honors' ? 65 : 54);
    assert.equal(packet.questions.length, total, 'every question survives the import');
    const ids = packet.questions.map((question) => question.questionId);
    assert.equal(new Set(ids).size, ids.length, 'every question has its own id');
  });

  test(`${name}: each unit goes from the building block to grade level`, () => {
    packet.raw.sections.forEach((section) => {
      const regular = section.questions.filter((question) => !/-h\d+$/.test(question.questionId));
      const bands = regular.map((question) => question.difficultyBand);
      assert.deepEqual(bands, [...bands].sort((a, b) => a - b), `${section.title}: easier questions come first`);
      assert.ok(bands[0] <= 2 && bands[bands.length - 1] === 3, `${section.title}: from easy (${bands[0]}) to grade level (${bands[bands.length - 1]})`);
      section.questions.forEach((question) => {
        assert.ok([1, 2, 3].includes(question.dok), `${question.questionId} has a DOK`);
        assert.ok(question.prompt.length <= 420, `${question.questionId}: a short prompt (${question.prompt.length})`);
      });
    });
  });

  test(`${name}: nearly every question is worked in a rich tool the server can mark`, () => {
    const boxes = packet.questions.filter((question) => question.type === 'multiAnswer').map((question) => question.questionId);
    // Writing a system from words (and, in Honors, the equation of a
    // perpendicular line) is the one thing here no tool produces.
    assert.deepEqual(boxes, name === 'Honors' ? ['tg-u5-h1', 'tg-u8-q4', 'tg-u9-q4'] : ['tg-u8-q4', 'tg-u9-q4']);
    packet.questions.forEach((question) => {
      const support = serverResponseGradingSupport(deliveredQuestionForGrading(question));
      assert.equal(support.supported, true, `${question.questionId}: ${support.reason}`);
      // No answer box is made of choices alone.
      if (question.type === 'multiAnswer') assert.ok(question.answerFields.some((field) => field.type !== 'choice'), question.questionId);
    });
    assert.ok(new Set(packet.questions.map((question) => question.type)).size >= 12, 'a dozen different tools');
  });

  test(`${name}: every question has three hints, a "Let's back up" step, a worked solution with steps, and the usual mistake`, () => {
    packet.raw.sections.flatMap((section) => section.questions).forEach((question) => {
      const id = question.questionId;
      assert.equal(question.hints.length, 3, `${id}: three hints`);
      assert.match(question.scaffold.prompt, /^Let’s back up\. /, id);
      assert.equal(question.scaffold.options.length, 2, id);
      assert.ok(question.scaffold.options.includes(question.scaffold.correct), id);
      assert.ok(question.solutionReview.reasoning.length >= 2, `${id}: worked steps`);
      assert.ok(question.solutionReview.commonError, `${id}: the usual mistake`);
      assert.ok(Number.isInteger(question.dok) && Number.isInteger(question.difficultyBand), id);
      // Rule 6: an answer box of three or more parts carries a follow-through or a checkpoint.
      if ((question.responses || []).length >= 3) {
        assert.ok(question.responses.some((part) => part.followThrough || part.checkpoint), `${id}: a follow-through or a checkpoint`);
        // A label is shown as written until follow-through ships, so none holds a {placeholder}.
        question.responses.forEach((part) => assert.doesNotMatch(part.label, /[{}]/, `${id}.${part.id}`));
      }
    });
    packet.questions.forEach((question) => {
      const step = backUpStepFor(question);
      assert.ok(backUpStepWritten(step) && step.source === 'authored', `${question.questionId}: its back-up step is the one written for it`);
      assert.ok(hasAuthoredCommonError(question), question.questionId);
    });
  });

  test(`${name}: every question is taught before it is asked, and the first question on each skill opens a worked example`, () => {
    const { raw } = packet;
    assert.deepEqual(validateLessonSupportsV5(raw).errors, []);
    assert.equal(raw.lessonSupports.referenceCards, undefined);
    const examples = raw.lessonSupports.examples;
    const byId = new Map(examples.map((example) => [example.id, example]));
    assert.equal(byId.size, examples.length);

    // The platform's own coverage rule (WORKED_EXAMPLES.md section 6).
    const coverage = classworkExampleCoverage(packet.model);
    assert.equal(coverage.summary.total, packet.questions.length);
    assert.equal(coverage.summary.uncovered, 0, JSON.stringify(coverage.questions.filter((entry) => entry.status === 'uncovered')));
    assert.equal(coverage.summary.exempt, 0, 'no question asks to go without');

    // The first question on each skill names an example the lesson writes, and
    // carries the guided notes Classwork shows today.
    const taught = new Set();
    const used = new Set();
    const namedAgain = [];
    packet.questions.forEach((question) => {
      const skill = exampleSkillOf(question);
      const firstOnSkill = !taught.has(skill);
      if (firstOnSkill) assert.ok(byId.has(question.example), `${question.questionId} is the first question on "${skill}": it opens an example`);
      taught.add(skill);
      if (!question.example) return;
      // A later question may name an example a second time. It plays there on
      // request only (it is not the first on its skill), and without the name
      // the platform would offer the skill's FIRST example, which for these
      // questions is another method (one step for a multi-step equation, no
      // reversal for an inequality that reverses). Found in the browser check
      // of 2026-11-21. Such a question needs no notes of its own.
      if (used.has(question.example)) {
        assert.equal(firstOnSkill, false, `${question.questionId} names ${question.example} again, so it is not the first question on its skill`);
        namedAgain.push(`${question.questionId} ${question.example}`);
        return;
      }
      used.add(question.example);
      // The example player is not live yet, so the question that opens an
      // example also says its key idea in the notes Classwork shows today.
      const notes = question.guidedNotes?.steps || [];
      assert.ok(notes.length >= 1 && notes.length <= 2, `${question.questionId}: one or two guided notes`);
      notes.forEach((note) => assert.ok(note.title && note.instruction, question.questionId));
    });
    assert.deepEqual([...used].sort(), [...byId.keys()].sort(), 'every example is opened by a question');
    assert.deepEqual(namedAgain, [
      'tg-u6-q7 ex-multi-step',
      'tg-u7-q6 ex-inequality-reverse',
      ...(name === 'Honors' ? ['tg-u7-h1 ex-inequality-reverse'] : []),
    ], 'the questions that name an example a second time');

    // An example with an equation or inequality of its own never has the
    // answer of the question that opens it.
    let compared = 0;
    packet.raw.sections.flatMap((section) => section.questions).forEach((question) => {
      const sibling = byId.get(question.example)?.sibling;
      const own = question.equation || question.inequality;
      const other = sibling?.equation || sibling?.inequality;
      if (!own || !other) return;
      const [mine, theirs] = [solveOneVariable(own), solveOneVariable(other)];
      // A "no solution" example teaches a "no solution" item: the case is the method.
      if (mine.special || theirs.special) return;
      compared += 1;
      assert.equal(exact.equal(mine.boundary, theirs.boundary), false, `${question.questionId}: its example ${question.example} must not have the same answer`);
    });
    assert.ok(compared >= 8, `${compared} equation and inequality examples compared`);

    // The player's own guard (examplePlayer.js workedExampleFor, guarded by
    // similarExampleIsSafe): an authored example is not played where its
    // problem, a step or a why holds one of the question's answers, and a
    // short answer such as 3 counts wherever it stands alone as a number.
    // Every question that NAMES an example is played that example. A later
    // question that borrows its skill's first example is played it too,
    // except where the borrowed numbers meet its own answers (BORROWED_BUILT_IN):
    // there the player gives the platform's own sibling, never nothing.
    const shown = { own: 0, borrowed: 0, builtIn: [] };
    packet.questions.forEach((question, index) => {
      const context = lessonExampleContext({ questions: packet.questions, index, sectionRole: 'classwork', lessonSupports: raw.lessonSupports });
      const named = typeof question.example === 'string' ? question.example : context.coveringExample;
      if (!named) return;
      const played = workedExampleFor(question, { lessonSupports: raw.lessonSupports, sectionRole: 'classwork', assignmentProblems: context.assignmentProblems, coveringExample: context.coveringExample });
      assert.ok(played?.steps?.length, `${question.questionId}: some example plays`);
      if (typeof question.example === 'string') {
        assert.equal(played.source, 'authored', `${question.questionId}: ${named} is hidden by the player's guard`);
        shown.own += 1;
      } else if (played.source === 'authored') shown.borrowed += 1;
      else shown.builtIn.push(question.questionId);
    });
    assert.equal(shown.own, examples.length + namedAgain.length, 'each example is shown on every question that names it, the ones that name it again included');
    assert.ok(shown.borrowed >= 10, `${shown.borrowed} later questions borrow an example`);
    assert.deepEqual(shown.builtIn, BORROWED_BUILT_IN.filter((id) => packet.questions.some((question) => question.questionId === id)));

    // Each example is a step card of small steps, each with its reason; and a
    // sibling problem, never an item of the packet.
    const itemTexts = new Set(raw.sections.flatMap((section) => section.questions)
      .flatMap((question) => [question.prompt, question.equation, question.inequality, ...(question.equations || [])])
      .filter(Boolean).map((text) => ascii(text).replace(/\s/g, '')));
    examples.forEach((example) => {
      assert.equal(example.source, 'authored', example.id);
      assert.ok(example.steps.length >= 3 && example.steps.length <= 6, `${example.id}: 3 to 6 steps`);
      example.steps.forEach((step) => assert.ok(step.show && step.why, example.id));
      [example.problem, ...Object.values(example.sibling || {})].filter(Boolean).forEach((text) => {
        assert.equal(itemTexts.has(ascii(text).replace(/\s/g, '')), false, `${example.id} is not an item of the packet`);
      });
    });
  });

  test(`${name}: a Step Algebra example's moves, made on its sibling equation, reach the answer its last steps show`, () => {
    const withMoves = packet.raw.lessonSupports.examples.filter((example) => example.moves);
    assert.ok(withMoves.length >= 4, 'the one-step, two-step and both-sides examples carry the tool\'s own moves');
    withMoves.forEach((example) => {
      assert.equal(example.tool, 'stepAlgebra');
      // Only the four balanced moves and a check: nothing invented.
      example.moves.forEach((move) => assert.ok(move.check === true || ['add', 'subtract', 'multiply', 'divide'].includes(move.op), `${example.id}: ${JSON.stringify(move)}`));
      let [left, right] = ascii(example.sibling.equation).split('=');
      const SIGN = { add: '+', subtract: '-', multiply: '*', divide: '/' };
      example.moves.filter((move) => move.op).forEach((move) => {
        left = `(${left}) ${SIGN[move.op]} (${move.operand})`;
        right = `(${right}) ${SIGN[move.op]} (${move.operand})`;
      });
      // After the moves the left side is x alone and the right side is its value.
      const leftAt = (value) => exact.fraction(exact.evaluate(left, { x: exact.fraction(value) }));
      assert.ok(exact.equal(leftAt(0), 0) && exact.equal(leftAt(1), 1), `${example.id}: the moves leave x alone`);
      const value = exact.fraction(exact.evaluate(right, { x: exact.fraction(0) }));
      assert.ok(exact.equal(exact.fraction(exact.evaluate(right, { x: exact.fraction(5) })), value), `${example.id}: and a number on the other side`);
      assert.ok(exact.equal(solveOneVariable(example.sibling.equation).boundary, value), `${example.id}: which is the equation's solution`);
      assert.ok(example.steps.some((step) => ascii(step.show).replace(/\s/g, '') === `x=${fractionText(value)}`), `${example.id}: the step card reaches x = ${fractionText(value)}`);
      assert.equal(example.moves[example.moves.length - 1].check, true, `${example.id}: the replay ends with a check`);
    });
    // An example solved by distributing has no move for it, so it is a step card only.
    packet.raw.lessonSupports.examples.filter((example) => /\(/.test(example.sibling?.equation || '')).forEach((example) => assert.equal(example.moves, undefined, example.id));
  });
}

test('the Honors file is the regular file\'s questions, unchanged, with the Honors questions of each unit after them', () => {
  HONORS.raw.sections.forEach((section, index) => {
    const regular = REGULAR.raw.sections[index];
    assert.deepEqual(section.questions.slice(0, regular.questions.length), regular.questions, section.title);
    const extra = section.questions.slice(regular.questions.length);
    assert.equal(extra.length, PACKET_UNITS[index].honors.length);
    extra.forEach((question) => {
      assert.match(question.questionId, new RegExp(`^tg-u${index + 1}-h\\d$`));
      assert.match(question.prompt, /^Honors\. /, question.questionId);
      assert.equal(question.difficultyBand, 4, `${question.questionId} is harder than the unit's regular questions`);
    });
  });
  // The Honors file has the regular file's examples, then the ones only an Honors question opens.
  const regularExamples = REGULAR.raw.lessonSupports.examples;
  assert.deepEqual(HONORS.raw.lessonSupports.examples.slice(0, regularExamples.length), regularExamples);
  assert.ok(HONORS.raw.lessonSupports.examples.length > regularExamples.length);
});

test('for an Honors class, Pre-Flight keeps every question of the Honors file: nothing is replaced', () => {
  const verdict = reviewImportForHonors(HONORS.model);
  assert.equal(verdict.ready, true, verdict.blockers.join('\n'));
  assert.deepEqual(verdict.blockers, []);
  // There is no Practice section, so the server sets no audited-Practice target
  // and swaps nothing; the four depth areas are all supplied by the packet.
  assert.equal(verdict.status, HONORS_CCMR_STATUS.NOT_REQUIRED);
  assert.equal(verdict.report.isHonorsReady, true);
  assert.equal(verdict.report.depthCount, 4);
  Object.entries(verdict.evidence).forEach(([area, ids]) => assert.ok(ids.length >= 1, `${area} is supplied`));
  // The regular file, assigned to an Honors class by mistake, is not rewritten either.
  assert.equal(reviewImportForHonors(REGULAR.model).status, HONORS_CCMR_STATUS.NOT_REQUIRED);
});

test('no item of the packet is an item of a taught lesson', () => {
  const taughtDirectories = ['algebra1-dol1', 'algebra1-dol3', 'algebra1-module2-topic2', 'algebra1-module3'];
  const mathOf = (question) => [
    question.equation, question.inequality, ...(question.equations ? [question.equations.join(' ; ')] : []),
    ...(question.sourceConstraints ? [question.sourceConstraints.join(' ; ')] : []),
    ...(question.equationLabels ? [question.equationLabels.join(' ; ')] : []),
    question.source?.equation, question.source?.prompt,
    ...(question.source?.points ? [JSON.stringify(question.source.points)] : []),
    ...(question.rows ? [JSON.stringify(question.rows)] : []),
    ...(question.points ? [JSON.stringify(question.points)] : []),
    ...(question.pairs ? [JSON.stringify(question.pairs)] : []),
    ...(question.standardForm ? [JSON.stringify(question.standardForm)] : []),
  ].filter(Boolean).map((text) => ascii(text).replace(/\s/g, ''));
  const taught = { prompts: new Set(), math: new Set() };
  taughtDirectories.forEach((directory) => {
    fs.readdirSync(path.join(ROOT, 'teacher-import-jsons', directory)).filter((file) => file.endsWith('.json')).forEach((file) => {
      JSON.parse(read(`teacher-import-jsons/${directory}/${file}`)).sections.flatMap((section) => section.questions).forEach((question) => {
        taught.prompts.add(String(question.prompt).trim());
        mathOf(question).forEach((text) => taught.math.add(text));
      });
    });
  });
  assert.ok(taught.prompts.size > 300 && taught.math.size > 80, `the taught lessons were read (${taught.prompts.size} prompts, ${taught.math.size} equations, tables and systems)`);
  HONORS.raw.sections.flatMap((section) => section.questions).forEach((question) => {
    assert.equal(taught.prompts.has(question.prompt.trim()), false, `${question.questionId}: a new prompt`);
    mathOf(question).forEach((text) => assert.equal(taught.math.has(text), false, `${question.questionId}: ${text} is new`));
  });
});

/* ================================================================= Unit 1 */

test('Unit 1 (A.12A): the mapping has one arrow for each pair, and the relation is a function although an output repeats', () => {
  const question = item('tg-u1-q1');
  const pairs = authored('tg-u1-q1').pairs.map(({ x, y }) => [x, y]);
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  assert.equal(pairsAreFunction(xs, ys), true);
  assert.ok(new Set(ys).size < ys.length, 'an output repeats, which is the usual reason for a wrong "no"');
  const work = { arrows: pairs, isFunction: correctFunctionChoice(true) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'relationMapping', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ isFunction: correctFunctionChoice(false) }).isCorrect, false, 'a repeated output is not a repeated input');
  assert.equal(grade({ arrows: pairs.slice(1) }).isCorrect, false, 'an arrow missing');
});

test('Unit 1 (A.12A): words, tables, a graph and an equation sort into functions and not functions', () => {
  const question = item('tg-u1-q2');
  const byId = Object.fromEntries(question.items.map((card) => [card.id, card]));
  const verdict = {
    age: true, // each person has one age
    sameAge: false, // an age is paired with several people
    tableRepeatOutput: pairsAreFunction(byId.tableRepeatOutput.table.x, byId.tableRepeatOutput.table.y),
    tableRepeatInput: pairsAreFunction(byId.tableRepeatInput.table.x, byId.tableRepeatInput.table.y),
    vee: byId.vee.graphSpec.type === 'absolute', // y = |x| − 2: one y for each x
    vertical: !/x = −2/.test(byId.vertical.text), // x = −2 pairs one x with every y
  };
  assert.deepEqual(Object.keys(byId).sort(), Object.keys(verdict).sort());
  assert.deepEqual([verdict.tableRepeatOutput, verdict.tableRepeatInput, verdict.vee, verdict.vertical], [true, false, true, false]);
  const settings = openSortSettings(question);
  assert.deepEqual([settings.controlled, settings.requireRationale, settings.minGroups, settings.maxGroups], [false, true, 2, 2]);
  const ids = (wanted) => Object.keys(verdict).filter((id) => verdict[id] === wanted);
  const groups = [
    { id: 'group-1', name: 'Functions', rationale: 'Every input has exactly one output.', itemIds: ids(true) },
    { id: 'group-2', name: 'Not functions', rationale: 'Some input has two different outputs.', itemIds: ids(false) },
  ];
  const grade = (sort) => gradeToolWork({ toolId: 'openSortBoard', question, work: { groups: sort } });
  assert.equal(grade(groups).isCorrect, true, failing(grade(groups)));
  Object.keys(verdict).forEach((card) => {
    const moved = groups.map((group) => ({ ...group, itemIds: group.itemIds.includes(card) ? group.itemIds.filter((id) => id !== card) : [...group.itemIds, card] }));
    assert.equal(grade(moved).isCorrect, false, `${card} in the wrong group`);
  });
  // The worked solution names every card in the group the key puts it in.
  const labelOf = Object.fromEntries(question.items.map((card) => [card.id, card.label]));
  [['Functions', true], ['Not functions', false]].forEach(([label, wanted]) => {
    const step = authored('tg-u1-q2').solutionReview.reasoning.find((line) => line.startsWith(`${label}:`));
    assert.deepEqual(step.match(/Card [A-Z]/g).sort(), ids(wanted).map((id) => labelOf[id]).sort(), label);
  });
});

test('Unit 1 (A.3C): the intercepts and the zero are read from where the line meets the axes', () => {
  const question = item('tg-u1-q3');
  const { m, b } = authored('tg-u1-q3').function;
  const zero = -b / m;
  assert.deepEqual([zero, b], [4, -2]);
  const key = {
    xInterceptExists: 'Yes', xIntercept: `(${zero}, 0)`, xInterceptValue: `(${zero}, 0)`, zeros: `{${zero}}`,
    yInterceptExists: 'Yes', yIntercept: `(0, ${b})`, yInterceptValue: `(0, ${b})`,
  };
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ ...key, xInterceptValue: `(0, ${zero})` }).isCorrect, false, 'the coordinates swapped');
  assert.equal(grade({ ...key, zeros: `{${b}}` }).isCorrect, false, 'the y-intercept is not the zero');
});

test('Unit 1 (A.2A): the domain and range of each segment come from its ends, open or closed', () => {
  const EXPECTED = {
    'tg-u1-q4': ['-1 <= x <= 3', '-2 <= y <= 6'],
    'tg-u1-q5': ['0 <= x <= 8', '10 <= y <= 50'],
    'tg-u1-h1': ['-4 < x <= 6', '0 <= y < 5'],
  };
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    const { m, b, domain } = authored(id).function;
    const f = (x) => m * x + b;
    const ends = [
      { x: domain.min, y: f(domain.min), closed: domain.minClosed },
      { x: domain.max, y: f(domain.max), closed: domain.maxClosed },
    ];
    const sign = (closed) => (closed ? '<=' : '<');
    const [low, high] = [...ends].sort((p, q) => p.y - q.y);
    const key = {
      domain: `${ends[0].x} ${sign(ends[0].closed)} x ${sign(ends[1].closed)} ${ends[1].x}`,
      range: `${low.y} ${sign(low.closed)} y ${sign(high.closed)} ${high.y}`,
    };
    assert.deepEqual([key.domain, key.range], expected, id);
    const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
    assert.equal(grade(key).isCorrect, true, `${id}: ${failing(grade(key))}`);
    // The range written with the ends the other way round, as the graph is drawn.
    const drawn = `${ends[0].y} ${sign(ends[0].closed)} y ${sign(ends[1].closed)} ${ends[1].y}`;
    if (drawn !== key.range) assert.equal(grade({ ...key, range: drawn }).isCorrect, false, `${id}: ${drawn}`);
    assert.equal(grade({ ...key, domain: key.domain.replace('<=', '<') }).isCorrect, false, `${id}: a closed end written open`);
    assert.equal(grade({ ...key, range: key.range.replace(/^-?\d+/, '-99') }).isCorrect, false, `${id}: a range that starts too low`);
  });
  // The pool: the hose runs for the 8 minutes the story says, and the pool does not start empty.
  const pool = authored('tg-u1-q5');
  assert.match(pool.prompt, /for 8 minutes/);
  assert.equal(pool.function.domain.max, 8);
  assert.ok(pool.function.b > 0);
  assert.ok(pool.graph.xAxisLabel && pool.graph.yAxisLabel);
});

/* ================================================================= Unit 2 */

const boardGrade = (question, work) => gradeToolWork({ toolId: 'representationBridge', question, work });

test('Unit 2 (A.3B): the slope is rise over run between two marked points, and the y-intercept is where x = 0', () => {
  const question = item('tg-u2-q1');
  const points = question.source.points.map(({ x, y }) => [x, y]);
  const line = lineThrough(points[0], points[points.length - 1]);
  points.forEach((point) => assert.ok(onLine(line, point), `(${point}) is on the line`));
  assert.deepEqual([line.m.valueOf(), line.b.valueOf()], [2, -1]);
  assert.ok(points.some(([x]) => x === 0), 'the y-intercept is a marked point');
  assert.deepEqual(resolveRequiredCards(question).sort(), ['slope', 'yIntercept']);
  assert.equal(question.interactionMode, 'process', 'the slope is established on the graph, not typed');
  const log = keyProcessLog(question);
  const rise = log.entries.find((entry) => entry.target === 'slope');
  assert.ok(['riseRun', 'twoPointFormula'].includes(rise.strategy));
  assert.equal(boardGrade(question, { processLog: log }).isCorrect, true, failing(boardGrade(question, { processLog: log })));
  // The work the grader credits is this line's: the rise over the run it records is 2.
  if (rise.ev?.rise) assert.ok(frac(rise.ev.rise).div(rise.ev.run).equals(line.m));
  assert.equal(boardGrade(question, { processLog: { ...log, entries: [] } }).isCorrect, false, 'no work, no credit');
  assert.equal(boardGrade(question, { processLog: { ...log, entries: log.entries.filter((entry) => entry.target !== 'slope') } }).isCorrect, false, 'the slope was never found');
});

test('Unit 2 (A.3B): three pairs of rows of the savings table each give $15 a week', () => {
  const question = item('tg-u2-q2');
  const rows = question.rows.map(({ x, y }) => [x, y]);
  const line = lineThrough(rows[0], rows[1]);
  rows.forEach((row) => assert.ok(onLine(line, row), `(${row}) is on the line`));
  assert.equal(line.m.valueOf(), 15);
  assert.ok(rows.slice(1).some(([x], index) => x - rows[index][0] !== 1), 'the weeks do not step by 1');
  const intervals = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => ({ i, j, dx: String(rows[j][0] - rows[i][0]), dy: String(rows[j][1] - rows[i][1]), rate: '15' }));
  const work = { intervals, classification: 'linear', m: '', b: '', equation: '', repairRowIndex: null, repairedValue: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'linearTableWorkbench', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ classification: 'nonlinear' }).isCorrect, false, 'the rate is constant');
  assert.equal(grade({ intervals: intervals.map((entry) => ({ ...entry, rate: entry.dy })) }).isCorrect, false, 'Δy alone is not the rate');
});

test('Unit 2 (A.3C): y = 2x − 3 is graphed from its y-intercept and its slope; 2x + 3y = 12 from its intercepts', () => {
  const slopeIntercept = item('tg-u2-q3');
  const [, mText, sign, bText] = /Graph y = (\d+)x ([+−]) (\d+)\./.exec(slopeIntercept.prompt);
  const m = Number(mText);
  const b = (sign === '−' ? -1 : 1) * Number(bText);
  assert.deepEqual([m, b], [2, -3]);
  const graded = (question, points) => gradeToolWork({ toolId: 'graphing2', question, work: { points } });
  assert.equal(graded(slopeIntercept, [[0, b], [1, b + m]]).isCorrect, true, failing(graded(slopeIntercept, [[0, b], [1, b + m]])));
  assert.equal(graded(slopeIntercept, [[0, m], [1, m + b]]).isCorrect, false, 'the slope plotted as the y-intercept');
  assert.equal(graded(slopeIntercept, [[0, b], [1, b + 1]]).isCorrect, false, 'a slope of 1');

  const standard = item('tg-u2-q6');
  const [, A, B, C] = /graph (\d+)x \+ (\d+)y = (\d+)\./.exec(standard.prompt).map(Number);
  assert.deepEqual([A, B, C], [2, 3, 12]);
  const intercepts = [[C / A, 0], [0, C / B]];
  assert.deepEqual(intercepts, [[6, 0], [0, 4]]);
  assert.equal(graded(standard, intercepts).isCorrect, true, failing(graded(standard, intercepts)));
  assert.equal(graded(standard, [[A, 0], [0, B]]).isCorrect, false, 'the coefficients read as the intercepts');
  assert.equal(graded(standard, [[3, 2], [9, -2]]).isCorrect, false, 'two points of the line that are not its intercepts');
});

test('Unit 2 (A.2C): the bowling story\'s $4 for shoes and $3 a game become y = 3x + 4 and its graph', () => {
  const question = item('tg-u2-q4');
  const [, fee, perGame] = /charges \$(\d+) to rent shoes plus \$(\d+) for each game/.exec(question.source.prompt).map(Number);
  assert.deepEqual([fee, perGame], [4, 3]);
  const facts = deriveLinearMultipleRepresentations(question);
  assert.deepEqual([facts.slopeNumber, facts.yInterceptNumber], [perGame, fee], 'the board\'s line is the story\'s');
  const context = {
    contextIndependent: 'games bowled',
    contextDependent: 'total cost (dollars)',
    contextSlopeMeaning: `The total cost goes up $${perGame} for each game.`,
    contextYInterceptMeaning: `The cost is $${fee} before any game is bowled.`,
  };
  const work = { slopeInterceptEquation: `y = ${perGame}x + ${fee}`, graph2Points: [[0, fee], [1, fee + perGame]], ...context, processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => boardGrade(question, { ...work, ...overrides });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ slopeInterceptEquation: `y = ${fee}x + ${perGame}` }).isCorrect, false, 'the fee and the rate traded places');
  assert.equal(grade({ graph2Points: [[0, fee], [1, fee + perGame + 1]] }).isCorrect, false, 'a graph that misses the line');
  const FIELDS = { independentQuantity: 'contextIndependent', dependentQuantity: 'contextDependent', slopeMeaning: 'contextSlopeMeaning', yInterceptMeaning: 'contextYInterceptMeaning' };
  Object.entries(FIELDS).forEach(([name, field]) => {
    question.context[name].choices.forEach((choice) => assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${field}: "${choice}"`));
  });
  const { xMin, xMax, yMin, yMax } = question.graphBounds;
  [[0, fee], [1, fee + perGame], [2, fee + 2 * perGame]].forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `(${x}, ${y}) is on the grid`));
});

test('Unit 2 (A.2C): three pairs of rows prove the constant rate, and m, b and y = 2x + 3 come from the rows', () => {
  const question = item('tg-u2-q5');
  const rows = question.rows.map(({ x, y }) => [x, y]);
  const line = lineThrough(rows[0], rows[rows.length - 1]);
  rows.forEach((row) => assert.ok(onLine(line, row), `(${row}) is on the line`));
  assert.deepEqual([line.m.valueOf(), line.b.valueOf()], [2, 3]);
  assert.ok(rows.some(([x, y]) => x === 0 && y === line.b.valueOf()), 'the y-intercept can be read from the x = 0 row');
  const intervals = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => ({ i, j, dx: String(rows[j][0] - rows[i][0]), dy: String(rows[j][1] - rows[i][1]), rate: line.m.toFraction() }));
  const work = { intervals, classification: 'linear', m: '2', b: '3', equation: 'y = 2x + 3', repairRowIndex: null, repairedValue: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'linearTableWorkbench', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ intervals: intervals.map((entry) => ({ ...entry, rate: entry.dy })) }).isCorrect, false, 'Δy alone is not the rate');
  assert.equal(grade({ b: '-1', equation: 'y = 2x - 1' }).isCorrect, false, 'the first y-value is not the y-intercept');
});

test('Unit 2 (A.2B): the line through two points in point-slope, slope-intercept and (Honors) standard form', () => {
  const CASES = {
    'tg-u2-q7': { slope: '-2', intercept: 3, standard: null },
    'tg-u2-h1': { slope: '2/3', intercept: 1, standard: '2x - 3y = -3' },
  };
  Object.entries(CASES).forEach(([id, expected]) => {
    const question = item(id);
    const [p1, p2] = question.source.points.map(({ x, y }) => [x, y]);
    // The points in the prompt are the points on the board.
    [p1, p2].forEach(([x, y]) => assert.ok(ascii(question.prompt).includes(`(${x}, ${y})`), `${id}: (${x}, ${y})`));
    const line = lineThrough(p1, p2);
    assert.equal(line.m.toFraction(), expected.slope, id);
    assert.equal(line.b.valueOf(), expected.intercept, id);
    const m = line.m.toFraction();
    const work = {
      pointSlopeEquation: `y - ${p1[1] < 0 ? `(${p1[1]})` : p1[1]} = ${m}(x - ${p1[0] < 0 ? `(${p1[0]})` : p1[0]})`,
      slopeInterceptEquation: `y = ${m}x + ${line.b.valueOf()}`,
      processLog: keyProcessLog(question),
    };
    if (expected.standard) {
      // 2x − 3y = −3 holds at both points.
      const { a, b, c } = linearOf(expected.standard);
      [p1, p2].forEach(([x, y]) => assert.equal(a * x + b * y + c, 0, id));
      work.standardFormEquation = expected.standard;
    }
    const grade = (overrides = {}) => boardGrade(question, { ...work, ...overrides });
    assert.equal(grade().isCorrect, true, `${id}: ${failing(grade())}`);
    assert.equal(grade({ pointSlopeEquation: `y - ${p2[1] < 0 ? `(${p2[1]})` : p2[1]} = ${m}(x - ${p2[0]})` }).isCorrect, true, `${id}: point-slope through the other point`);
    assert.equal(grade({ slopeInterceptEquation: `y = ${line.m.neg().toFraction()}x + ${line.b.valueOf()}` }).isCorrect, false, `${id}: the slope with the wrong sign`);
    if (expected.standard) assert.equal(grade({ standardFormEquation: '2x - 3y = -1' }).isCorrect, false, `${id}: only one term multiplied by 3`);
  });
});

test('Unit 2 (A.3B, melting ice): rise over run gives −2 centimeters an hour, and each meaning has one right choice', () => {
  const question = item('tg-u2-q8');
  const points = question.source.points.map(({ x, y }) => [x, y]);
  const line = lineThrough(points[0], points[1]);
  points.forEach((point) => assert.ok(onLine(line, point), `(${point}) is on the line`));
  assert.deepEqual([line.m.valueOf(), line.b.valueOf()], [-2, 12]);
  assert.match(question.xAxisLabel, /hours/);
  assert.match(question.yAxisLabel, /centimeters/);
  const context = {
    contextSlopeMeaning: 'The ice gets 2 centimeters shorter each hour.',
    contextYInterceptMeaning: 'The ice starts 12 centimeters tall.',
  };
  const work = { slopeInterceptEquation: 'y = -2x + 12', ...context, processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => boardGrade(question, { ...work, ...overrides });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ slopeInterceptEquation: 'y = 2x + 12' }).isCorrect, false, 'the height going up');
  [['slopeMeaning', 'contextSlopeMeaning'], ['yInterceptMeaning', 'contextYInterceptMeaning']].forEach(([name, field]) => {
    question.context[name].choices.forEach((choice) => assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${field}: "${choice}"`));
  });
  const { xMin, xMax, yMin, yMax } = question.graphBounds;
  points.forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `(${x}, ${y}) is on the grid`));
});

/* ================================================================= Unit 3 */

test('Unit 3 (A.12C): each recursive rule, applied term by term, fills the table and the discrete graph', () => {
  const ARITHMETIC = /f\(1\) = (−?\d+) and f\(n\) = f\(n − 1\) ([+−]) (\d+) for n ≥ 2/;
  const GEOMETRIC = /f\(1\) = (\d+) and f\(n\) = \((\d+)\/(\d+)\)·f\(n − 1\) for n ≥ 2/;
  const CASES = {
    'tg-u3-q1': { terms: [3, 8, 13, 18, 23], kind: 'arithmetic', change: 5 },
    'tg-u3-q2': { terms: [20, 17, 14, 11, 8], kind: 'arithmetic', change: -3, tenth: -7 },
    'tg-u3-h1': { terms: [48, 24, 12, 6, 3], kind: 'geometric', change: 0.5 },
  };
  Object.entries(CASES).forEach(([id, expected]) => {
    const question = item(id);
    const added = ARITHMETIC.exec(question.prompt);
    const multiplied = GEOMETRIC.exec(question.prompt);
    assert.ok(added || multiplied, `${id}: a recursive rule in function form`);
    const first = Number(ascii((added || multiplied)[1]));
    const next = added
      ? (term) => term + (added[2] === '−' ? -1 : 1) * Number(added[3])
      : (term) => (term * Number(multiplied[2])) / Number(multiplied[3]);
    const terms = [first];
    while (terms.length < question.displayCount) terms.push(next(terms[terms.length - 1]));
    assert.deepEqual(terms, expected.terms, id);
    // The kind, from the terms: equal differences or equal ratios.
    const differences = terms.slice(1).map((term, index) => term - terms[index]);
    const kind = differences.every((difference) => difference === differences[0]) ? 'arithmetic' : 'geometric';
    const change = kind === 'arithmetic' ? differences[0] : terms[1] / terms[0];
    assert.deepEqual([kind, change], [expected.kind, expected.change], id);
    assert.doesNotMatch(question.prompt.replace(/arithmetic or geometric/, ''), /arithmetic|geometric/i, `${id}: the prompt does not give the kind away`);
    assert.equal(question.notation, 'f(n)');
    let tenth = '';
    if (expected.tenth !== undefined) {
      const run = [...terms];
      while (run.length < question.targetN) run.push(next(run[run.length - 1]));
      tenth = String(run[question.targetN - 1]);
      assert.equal(tenth, String(expected.tenth));
      assert.match(question.prompt, /find f\(10\)/);
    }
    const work = { tableValues: terms.map(String), plottedPoints: terms.map((value, index) => [index + 1, value]), kindAnswer: kind, changeAnswer: String(change), explicitRule: '', recursiveFirst: '', recursiveRule: '', termAnswer: tenth };
    const grade = (overrides = {}) => gradeToolWork({ toolId: 'sequenceExplorer', question, work: { ...work, ...overrides } });
    assert.equal(grade().isCorrect, true, `${id}: ${failing(grade())}`);
    assert.equal(grade({ tableValues: terms.map((value, index) => String(index === 3 ? value + 1 : value)) }).isCorrect, false, `${id}: a slip in one term`);
    assert.equal(grade({ plottedPoints: terms.map((value, index) => [index, value]) }).isCorrect, false, `${id}: points plotted at n − 1`);
    assert.equal(grade({ kindAnswer: kind === 'arithmetic' ? 'geometric' : 'arithmetic' }).isCorrect, false, `${id}: the other kind`);
    assert.equal(grade({ changeAnswer: String(-change) }).isCorrect, false, `${id}: the change with the wrong sign`);
    if (tenth) assert.equal(grade({ termAnswer: String(first + 10 * change) }).isCorrect, false, `${id}: ten steps instead of nine`);
  });
});

// Causation: the first quantity directly makes the second change. Association
// only: a lurking variable moves both.
const CAUSE = { tickets: 'each ticket adds $8', faucet: 'running water fills the bucket', driving: 'driving burns gas' };
const LURKING = { umbrellas: 'rain', height: 'age', shorts: 'hot weather' };

test('Unit 3 (A.4B): the cards sort into causation and association only, and each sort is named and explained', () => {
  const question = item('tg-u3-q3');
  assert.deepEqual(question.items.map((card) => card.id).sort(), [...Object.keys(CAUSE), ...Object.keys(LURKING)].sort());
  const settings = openSortSettings(question);
  assert.deepEqual([settings.controlled, settings.requireRationale, settings.minGroups, settings.maxGroups], [false, true, 2, 2]);
  const groups = [
    { id: 'group-1', name: 'Causation', rationale: 'Changing the first quantity directly changes the second.', itemIds: Object.keys(CAUSE) },
    { id: 'group-2', name: 'Association only', rationale: 'Something else makes both quantities change together.', itemIds: Object.keys(LURKING) },
  ];
  const grade = (sort) => gradeToolWork({ toolId: 'openSortBoard', question, work: { groups: sort } });
  assert.equal(grade(groups).isCorrect, true, failing(grade(groups)));
  [...Object.keys(CAUSE), ...Object.keys(LURKING)].forEach((card) => {
    const moved = groups.map((group) => ({ ...group, itemIds: group.itemIds.includes(card) ? group.itemIds.filter((id) => id !== card) : [...group.itemIds, card] }));
    assert.equal(grade(moved).isCorrect, false, `${card} in the wrong group`);
  });
  assert.equal(grade(groups.map((group) => ({ ...group, rationale: '' }))).isCorrect, false, 'an unexplained sort');
  // The cards are not listed group by group.
  const order = question.items.map((card) => (card.id in CAUSE ? 'c' : 'a')).join('');
  assert.ok(!/^c+a+$|^a+c+$/.test(order), order);
});

test('Unit 3 (A.4C): the bean plant\'s line is fitted by regression and predicts the height at week 10', () => {
  const question = item('tg-u3-q4');
  assert.equal(question.mode, 'lineFit');
  const points = question.points.map(({ x, y }) => [x, y]);
  const n = points.length;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
  const m = points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  const b = meanY - m * meanX;
  const prediction = Math.round(m * question.predictionX + b);
  assert.match(question.prompt, /at week 10/);
  assert.deepEqual([question.predictionX, prediction], [10, 22]);
  // The worked solution states this regression line and this prediction.
  const steps = authored('tg-u3-q4').solutionReview.reasoning.join(' ');
  assert.ok(steps.includes(`y = ${m.toFixed(2)}x + ${b.toFixed(2)}`), steps);
  assert.ok(steps.includes(`about ${prediction} centimeters`), steps);
  const round3 = (value) => Math.round(value * 1000) / 1000;
  const work = { m: round3(m), b: round3(b), predictionX: question.predictionX, predictionY: String(prediction), regressionTechnologyRun: true };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'dataModelingLab', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ predictionY: String(points[n - 1][1]) }).isCorrect, false, 'the last data point is not the prediction');
  assert.equal(grade({ m: 1, b: 10 }).isCorrect, false, 'a line that does not fit the data');
});

/* ================================================================= Unit 4 */

// g(x) = a·f(x + c) + d, read from the prompt: "(1/2)f(x)", "3f(x + 2) − 1", "f(x − 4)".
const transformationOf = (prompt) => {
  const match = /g\(x\) = ((?:−?\d+|\(\d+\/\d+\))?)f\(x(?: ([+−]) (\d+))?\)(?: ([+−]) (\d+))?/.exec(prompt);
  assert.ok(match, prompt);
  const [, front, insideSign, inside, outsideSign, outside] = match;
  const a = front === '' ? 1 : front.startsWith('(') ? frac(front.slice(1, -1)).valueOf() : Number(ascii(front));
  const c = inside ? (insideSign === '−' ? -1 : 1) * Number(inside) : 0;
  const d = outside ? (outsideSign === '−' ? -1 : 1) * Number(outside) : 0;
  // A point (x, y) of f(x) = x lands where the input x + c gives the old one: (x − c, a·y + d).
  return ([x, y]) => [x - c, a * y + d];
};

test('Unit 4 (A.3E): each image is the parent point moved or stretched as the rule in the prompt says', () => {
  const EXPECTED = {
    'tg-u4-q1': [[-2, 2], [0, 4], [2, 6]],
    'tg-u4-q2': [[2, -2], [4, 0], [6, 2]],
    'tg-u4-q3': [[-4, -2], [0, 0], [4, 2]],
    'tg-u4-h1': [[-2, 7], [0, 3], [2, -1]],
  };
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    assert.match(question.prompt, /parent function is f\(x\) = x/);
    const sourcePoints = authored(id).sourcePoints;
    sourcePoints.forEach(([x, y]) => assert.equal(x, y, `${id}: the labeled points are on f(x) = x`));
    const images = sourcePoints.map(transformationOf(question.prompt));
    assert.deepEqual(images, expected, id);
    const { xMin, xMax, yMin, yMax } = question.graphBounds;
    images.forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `${id}: (${x}, ${y}) is on the grid`));
    const grade = (plottedPoints) => gradeToolWork({ toolId: 'transformationsLab', question, work: { plottedPoints } });
    assert.equal(grade(images).isCorrect, true, `${id}: ${failing(grade(images))}`);
    // The inside and the outside traded: what was done to y is done to x.
    assert.equal(grade(images.map(([x, y], index) => [sourcePoints[index][0] + (y - sourcePoints[index][1]), sourcePoints[index][1] + (x - sourcePoints[index][0])])).isCorrect, false, `${id}: the change made to the other coordinate`);
    assert.equal(grade(sourcePoints).isCorrect, false, `${id}: the points left where they were`);
  });
});

test('Unit 4 (A.3E): under g(x) = 3f(x + 2) − 1 the point (1, 1) lands at (−1, 2)', () => {
  const question = item('tg-u4-q4');
  const [, px, py] = /the point \((\d+), (\d+)\) on f\(x\)/.exec(question.prompt).map(Number);
  assert.equal(px, py, 'a point of f(x) = x');
  const [x, y] = transformationOf(question.prompt)([px, py]);
  assert.deepEqual([x, y], [-1, 2]);
  const grade = (mappedX, mappedY) => gradeToolWork({ toolId: 'transformationsLab', question, work: { mappedX: String(mappedX), mappedY: String(mappedY) } });
  assert.equal(grade(x, y).isCorrect, true, failing(grade(x, y)));
  assert.equal(grade(px + 2, y).isCorrect, false, 'moved right instead of left');
  assert.equal(grade(x, 3 * (py - 1)).isCorrect, false, 'the 1 subtracted before multiplying');
});

/* ================================================================= Unit 5 */

test('Unit 5 (A.2G): y = 4 is horizontal and x = −5 is vertical', () => {
  const graded = (question, points) => gradeToolWork({ toolId: 'graphing2', question, work: { points } });
  const horizontal = item('tg-u5-q1');
  const y = Number(ascii(/horizontal line y = (−?\d+)\./.exec(horizontal.prompt)[1]));
  assert.equal(graded(horizontal, [[0, y], [3, y]]).isCorrect, true);
  assert.equal(graded(horizontal, [[y, 0], [y, 3]]).isCorrect, false, 'x = 4 is not y = 4');
  const vertical = item('tg-u5-q2');
  const x = Number(ascii(/vertical line x = (−?\d+)\./.exec(vertical.prompt)[1]));
  assert.deepEqual([y, x], [4, -5]);
  assert.equal(graded(vertical, [[x, 0], [x, 3]]).isCorrect, true);
  assert.equal(graded(vertical, [[0, x], [3, x]]).isCorrect, false, 'y = −5 is not x = −5');
});

// The slope of "y = 2x + 5" or "y = −(1/3)x + 2", as written in a prompt.
const GIVEN_LINE = /(?:parallel|perpendicular) to (y = [^ ]+ [+−] \d+)/;
const slopeOfGiven = (prompt) => solvedForV(linearOf(GIVEN_LINE.exec(prompt)[1])).m;
const pointOf = (prompt) => /the point \((−?\d+), (−?\d+)\)/.exec(prompt).slice(1).map((value) => Number(ascii(value)));

test('Unit 5 (A.2F): a parallel line keeps the slope, and a perpendicular line takes its negative reciprocal', () => {
  const graded = (question, points) => gradeToolWork({ toolId: 'graphing2', question, work: { points } });
  const parallel = item('tg-u5-q3');
  const m = slopeOfGiven(parallel.prompt);
  const [px, py] = pointOf(parallel.prompt);
  assert.deepEqual([m, px, py], [2, 1, -3]);
  assert.doesNotMatch(parallel.prompt, /slope/, 'the slope is the student\'s to find');
  assert.equal(graded(parallel, [[px, py], [px + 1, py + m]]).isCorrect, true);
  assert.equal(graded(parallel, [[0, 5], [1, 7]]).isCorrect, false, 'the given line itself');
  assert.equal(graded(parallel, [[px, py], [px + 2, py - 1]]).isCorrect, false, 'a perpendicular line');

  const perpendicular = item('tg-u5-q4');
  const given = slopeOfGiven(perpendicular.prompt);
  const [qx, qy] = pointOf(perpendicular.prompt);
  const turned = -1 / given;
  assert.ok(Math.abs(given + 1 / 3) < 1e-12 && Math.abs(turned - 3) < 1e-12);
  assert.deepEqual([qx, qy], [-1, -2]);
  assert.doesNotMatch(perpendicular.prompt, /slope/);
  assert.equal(graded(perpendicular, [[qx, qy], [qx + 1, qy + 3]]).isCorrect, true);
  assert.equal(graded(perpendicular, [[qx, qy], [qx + 3, qy + 1]]).isCorrect, false, 'the sign changed but the fraction not flipped');
  assert.equal(graded(perpendicular, [[qx, qy], [qx + 3, qy - 1]]).isCorrect, false, 'a parallel line');

  // The tool draws the given line and names it, and so never prints the slope
  // it grades ("Graph the line through (1, −3) with slope 2" would answer the
  // question). The line it draws is the line the prompt names.
  [[parallel, 'parallel', m], [perpendicular, 'perpendicular', given]].forEach(([question, relation, slope]) => {
    const reference = referenceLineOf(question);
    assert.ok(reference, `${question.questionId}: the given line is drawn`);
    assert.equal(reference.relation, relation);
    assert.ok(Math.abs(reference.m - slope) < 1e-12, question.questionId);
    assert.equal(reference.b, solvedForV(linearOf(GIVEN_LINE.exec(question.prompt)[1])).k, question.questionId);
  });
});

test('Unit 5 Honors (A.2F): the perpendicular line through (4, 1) is y = (3/2)x − 5, and its parts follow through', () => {
  const question = item('tg-u5-h1');
  // The slope as the fraction the prompt writes, −(2/3), not its decimal.
  const given = new Fraction(slopeOfGiven(question.prompt)).simplify(1e-9);
  assert.equal(given.toFraction(), '-2/3');
  const [px, py] = pointOf(question.prompt);
  const m = given.inverse().neg();
  const b = frac(py).sub(m.mul(px));
  assert.deepEqual([m.toFraction(), b.valueOf()], ['3/2', -5]);
  const key = { slope: m.toFraction(), intercept: String(b.valueOf()), equation: `y = ${m.toFraction()}x - ${Math.abs(b.valueOf())}` };
  const grade = (answers) => gradeMultiAnswerResponse(question, answers, { followThrough });
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ ...key, equation: 'y = 1.5x - 5' }).isCorrect, true, 'the decimal slope');
  assert.equal(grade({ ...key, slope: '2/3' }).isCorrect, false, 'the sign changed but the fraction not flipped');
  assert.equal(grade({ ...key, intercept: '7' }).isCorrect, false);
  assert.equal(grade({ ...key, equation: 'y = -2/3x - 5' }).isCorrect, false);
  // A slope with the sign changed but the fraction not flipped (2 for 3/2
  // here): the intercept and the equation worked from it are marked right
  // (functions/shared/followThrough.mjs), so the slip costs one part.
  const carried = grade({ slope: '2', intercept: '-7', equation: 'y = 2x - 7' });
  assert.deepEqual(carried.parts.map((part) => [part.id, part.isCorrect]), [['slope', false], ['intercept', true], ['equation', true]]);
  assert.equal(grade({ slope: '2', intercept: '-7', equation: 'y = 2x + 7' }).parts.at(-1).isCorrect, false, 'a wrong equation from the slip is still wrong');
  // Each later part names the earlier parts it is built from.
  const parts = Object.fromEntries(authored('tg-u5-h1').responses.map((part) => [part.id, part]));
  assert.deepEqual(parts.intercept.followThrough.from, ['slope']);
  assert.deepEqual(parts.equation.followThrough.from, ['slope', 'intercept']);
  // With the right slope, the follow-through formula gives the key.
  assert.ok(exact.equal(exact.fraction(exact.evaluate(parts.intercept.followThrough.answer.replace('{slope}', `(${key.slope})`))), exact.fraction(key.intercept)));
});

/* ============================================================ Units 6 and 7 */

const stepAlgebraVerdict = (question, work) => {
  const browser = gradeToolCheck(stepAlgebraWorkGrader, question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, `${question.questionId}: browser and server agree`);
  return browser.isCorrect;
};
const relationWork = (question, state) => relationWorkspaceWork({
  relationState: state,
  representation: state.special || question.representSolution === false ? null : { intervals: relationSolutionSummary(state).intervals, notation: '', inequality: '' },
});
// The equation or inequality as the prompt shows it: "Solve 3(2x + 1) = 4x − 9."
const shownRelation = (prompt) => /Solve (.+?)\.(?: |$)/.exec(prompt.replace(/^Honors\. /, ''))[1];

test('Unit 6 (A.5A): every equation is solved from the equation the prompt shows, right at its solution and wrong one unit off', () => {
  const EXPECTED = {
    'tg-u6-q1': '19', 'tg-u6-q2': '-7', 'tg-u6-q3': '7', 'tg-u6-q4': '8', 'tg-u6-q5': '5', 'tg-u6-q6': '-6', 'tg-u6-q7': '-5',
  };
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    const shown = shownRelation(question.prompt);
    assert.equal(ascii(shown).replace(/\s/g, ''), authored(id).equation.replace(/\s/g, ''), `${id}: the tool holds the equation the prompt shows`);
    const solved = solveOneVariable(shown);
    assert.equal(fractionText(solved.boundary), expected, id);
    assert.notEqual(resolveStepAlgebraMode(question), 'relation', `${id} opens the equation workspace`);
    const at = (value) => equationWorkspaceWork({ equation: { left: 'x', right: fractionText(value) } });
    assert.equal(stepAlgebraVerdict(question, at(solved.boundary)), true, `${id}: x = ${expected}`);
    assert.equal(stepAlgebraVerdict(question, at(exact.add(solved.boundary, 1))), false, `${id}: one unit off`);
    assert.equal(stepAlgebraVerdict(question, at(exact.unaryMinus(solved.boundary))), false, `${id}: the sign dropped`);
    // The worked solution ends at this value.
    assert.ok(authored(id).solutionReview.reasoning.some((line) => ascii(line).includes(`x = ${expected}`)), `${id}: the worked solution reaches x = ${expected}`);
  });
  // No two of the unit's equations share an answer a student could carry over.
  assert.equal(new Set(Object.values(EXPECTED)).size, Object.keys(EXPECTED).length);
});

test('Unit 6 Honors (A.5A): 5(x + 2) − 3 = 5x + 4 loses its variable and leaves a false statement: no solution', () => {
  const question = item('tg-u6-h1');
  const shown = shownRelation(question.prompt);
  assert.equal(ascii(shown).replace(/\s/g, ''), authored('tg-u6-h1').equation.replace(/\s/g, ''));
  assert.deepEqual(solveOneVariable(shown), { special: 'noSolution' });
  assert.equal(resolveStepAlgebraMode(question), 'relation', 'the workspace that can record "no solution"');
  assert.equal(stepAlgebraVerdict(question, relationWork(question, { special: 'noSolution', branches: [] })), true);
  assert.equal(stepAlgebraVerdict(question, relationWork(question, { special: 'allReals', branches: [] })), false, 'not every value works');
  assert.equal(stepAlgebraVerdict(question, relationWork(question, parseRelationSource('x = 0', 'x'))), false, 'x = 0 is not "no solution"');
});

test('Unit 7 (A.5B): x ≥ −2 is a closed circle at −2 shaded to the right', () => {
  const question = item('tg-u7-q1');
  const [, symbol, value] = /Graph x (≥|≤|<|>) (−?\d+) on the number line/.exec(question.prompt);
  const boundary = Number(ascii(value));
  assert.deepEqual([symbol, boundary], ['≥', -2]);
  const ray = { min: boundary, max: null, minClosed: true, maxClosed: false };
  const grade = (intervals) => {
    const browser = gradeToolWork({ toolId: 'intervalNumberLine', question, work: { intervals, notation: '', inequality: '' } });
    assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, browser.isCorrect);
    return browser.isCorrect;
  };
  assert.equal(grade([ray]), true);
  assert.equal(grade([{ ...ray, minClosed: false }]), false, 'an open circle leaves −2 out');
  assert.equal(grade([{ min: null, max: boundary, minClosed: false, maxClosed: true }]), false, 'shaded to the left');
});

test('Unit 7 (A.5B): every inequality is solved from the one the prompt shows, with the symbol reversed only for a negative divisor', () => {
  const EXPECTED = {
    'tg-u7-q2': 'x < 7', 'tg-u7-q3': 'x >= 5', 'tg-u7-q4': 'x > -4', 'tg-u7-q5': 'x <= 4', 'tg-u7-q6': 'x < -3', 'tg-u7-h1': 'x <= -9',
  };
  let reversals = 0;
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    const shown = shownRelation(question.prompt);
    assert.equal(ascii(shown).replace(/\s/g, ''), authored(id).inequality.replace(/\s/g, ''), `${id}: the tool holds the inequality the prompt shows`);
    const solved = solveOneVariable(shown);
    assert.equal(`x ${solved.relation} ${fractionText(solved.boundary)}`, expected, id);
    if (solved.relation !== linearOf(shown, ['x', '_unused']).relation) reversals += 1;
    assert.equal(resolveStepAlgebraMode(question), 'relation', id);
    const final = (relation, boundary) => relationWork(question, parseRelationSource(`x ${relation} ${fractionText(boundary)}`, 'x'));
    assert.equal(stepAlgebraVerdict(question, final(solved.relation, solved.boundary)), true, `${id}: ${expected}`);
    assert.equal(stepAlgebraVerdict(question, final(FLIP[solved.relation], solved.boundary)), false, `${id}: the symbol the wrong way`);
    assert.equal(stepAlgebraVerdict(question, final(solved.relation, exact.add(solved.boundary, 1))), false, `${id}: one unit off`);
    // A number on the shaded side makes the ORIGINAL inequality true, and one on the other side does not.
    const inside = exact.add(solved.boundary, solved.relation.startsWith('<') ? -1 : 1);
    const holds = (value) => {
      const { a, c, relation } = linearOf(shown, ['x', '_unused']);
      const left = a * num(value) + c;
      return { '<': left < 0, '>': left > 0, '<=': left <= 0, '>=': left >= 0 }[relation];
    };
    assert.equal(holds(inside), true, id);
    assert.equal(holds(exact.subtract(exact.multiply(2, solved.boundary), inside)), false, id);
  });
  assert.equal(reversals, 3, 'three of them divide by a negative number');
});

/* ================================================================= Unit 8 */

const systemOf = (question) => question.equationLabels.map((label) => linearOf(label));
// Two grid points of a line the student can plot in the window.
const gridPoints = (line, graph, snap = 1) => {
  const { m, k } = solvedForV(line);
  const points = [];
  for (let x = Math.ceil(graph.xMin / snap) * snap; x <= graph.xMax && points.length < 2; x += snap) {
    const y = m * x + k;
    if (y >= graph.yMin && y <= graph.yMax && Math.abs(y / snap - Math.round(y / snap)) < 1e-9) points.push({ x, y });
  }
  assert.equal(points.length, 2, 'two grid points on the line');
  return { points };
};
const graphedSystemGrade = (question, work) => {
  const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
  assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, browser.isCorrect, question.questionId);
  return browser;
};

test('Unit 8 (A.3F, A.3G): each system is graphed from the student\'s own points, and its crossing, or the lack of one, is worked out from the two equations', () => {
  const EXPECTED = {
    'tg-u8-q1': { type: 'one', x: 2, y: 4 },
    'tg-u8-q2': { type: 'one', x: 2, y: 0 },
    'tg-u8-q3': { type: 'none' },
    'tg-u8-q5': { type: 'one', x: 4, y: 14 },
    'tg-u8-h1': { type: 'infinite' },
  };
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    assert.equal(question.interaction, 'construct', `${id}: the student draws both lines`);
    const lines = systemOf(question);
    // Both equations are in the prompt as the tool labels them.
    question.equationLabels.forEach((label) => assert.ok(question.prompt.includes(label), `${id}: ${label}`));
    const solution = meet(...lines);
    assert.deepEqual(solution, expected, id);
    const construction = lines.map((line) => gridPoints(line, question.graph, Number(question.snapStep) || 1));
    const work = { construction, classification: solution.type, x: solution.type === 'one' ? String(solution.x) : '', y: solution.type === 'one' ? String(solution.y) : '' };
    assert.equal(graphedSystemGrade(question, work).isCorrect, true, `${id}: ${failing(graphedSystemGrade(question, work))}`);
    if (solution.type === 'one') {
      const { xMin, xMax, yMin, yMax } = question.graph;
      assert.ok(solution.x > xMin && solution.x < xMax && solution.y > yMin && solution.y < yMax, `${id}: the crossing is on the graph`);
      assert.equal(graphedSystemGrade(question, { ...work, x: work.y, y: work.x }).isCorrect, false, `${id}: the coordinates swapped`);
      assert.equal(graphedSystemGrade(question, { ...work, classification: 'none' }).isCorrect, false, id);
    } else {
      assert.equal(graphedSystemGrade(question, { ...work, classification: solution.type === 'none' ? 'infinite' : 'none' }).isCorrect, false, `${id}: the other special case`);
      assert.equal(graphedSystemGrade(question, { ...work, classification: 'one', x: '0', y: String(solvedForV(lines[0]).k) }).isCorrect, false, `${id}: a y-intercept is not the solution`);
    }
    // A line drawn through a point that is not on it is not credited.
    const off = [{ points: [construction[0].points[0], { x: construction[0].points[1].x, y: construction[0].points[1].y + 1 }] }, construction[1]];
    assert.equal(graphedSystemGrade(question, { ...work, construction: off }).isCorrect, false, `${id}: a line that misses`);
  });
});

test('Unit 8 (A.2I, A.3G): the two climbing passes are written as y = 2x + 6 and y = 3x + 2 from the story, the system the next question graphs', () => {
  const question = item('tg-u8-q4');
  const story = /Pass A costs \$(\d+) to join plus \$(\d+) for each visit\. Pass B costs \$(\d+) to join plus \$(\d+) for each visit\./.exec(question.prompt);
  assert.ok(story, question.prompt);
  const [joinA, visitA, joinB, visitB] = story.slice(1).map(Number);
  assert.deepEqual([joinA, visitA, joinB, visitB], [6, 2, 2, 3]);
  const key = { passA: `y = ${visitA}x + ${joinA}`, passB: `y = ${visitB}x + ${joinB}` };
  const grade = (answers) => {
    const browser = gradeMultiAnswerResponse(question, answers, { followThrough });
    const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } });
    assert.equal(server.isCorrect, browser.isCorrect);
    return browser.isCorrect;
  };
  assert.equal(grade(key), true);
  assert.equal(grade({ ...key, passA: `y = ${joinA} + ${visitA}x` }), true, 'the terms in the other order');
  assert.equal(grade({ ...key, passA: `y = ${joinA}x + ${visitA}` }), false, 'the joining cost as the rate');
  assert.equal(grade({ ...key, passB: key.passA }), false, 'Pass A\'s equation for Pass B');
  // The next question restates the system, so it does not depend on this
  // answer; the passes cost the same, $14, after 4 visits.
  const graphing = item('tg-u8-q5');
  assert.deepEqual(graphing.equationLabels, [key.passA, key.passB]);
  assert.match(graphing.prompt, /x is the number of visits and y is the total cost in dollars/);
  const same = meet(...systemOf(graphing));
  assert.deepEqual(same, { type: 'one', x: 4, y: 14 });
  assert.equal(visitA * same.x + joinA, same.y);
  assert.equal(visitB * same.x + joinB, same.y);
  assert.ok(authored('tg-u8-q5').solutionReview.reasoning.some((line) => line.includes('After 4 visits, both passes cost $14')));
});

/* ================================================================= Unit 9 */

const sidesAt = (equation, values) => {
  const [left, right] = ascii(equation).split('=');
  const scope = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, exact.fraction(value)]));
  return { left: fractionText(exact.evaluate(left, scope)), right: fractionText(exact.evaluate(right, scope)) };
};
const substitutionWork = (question, values) => ({
  dimension: 2,
  method: 'substitution',
  values,
  verification: Object.fromEntries(question.equations.map((equation, index) => [`E${index + 1}`, sidesAt(equation, values)])),
  reducedStatement: null,
  specialCase: { statementTruth: '', solutionCount: '', classification: '' },
});

test('Unit 9 (A.5C): each system solves by substitution to the pair worked out from its equations, checked in both', () => {
  const EXPECTED = {
    'tg-u9-q1': [4, 8], 'tg-u9-q2': [3, 1], 'tg-u9-q3': [5, 2], 'tg-u9-q5': [25, 15],
  };
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    assert.deepEqual([question.mode, question.method, question.requireVerification], ['algebraic', 'substitution', true], id);
    const [u, v] = question.variables;
    question.equations.forEach((equation) => assert.ok(ascii(question.prompt).includes(equation), `${id}: ${equation} is in the prompt`));
    const solution = meet(...question.equations.map((equation) => linearOf(equation, [u, v])));
    assert.deepEqual([solution.type, solution.x, solution.y], ['one', ...expected], id);
    const values = { [u]: solution.x, [v]: solution.y };
    const work = substitutionWork(question, values);
    Object.values(work.verification).forEach((sides) => assert.equal(sides.left, sides.right, `${id}: the pair checks`));
    assert.equal(graphedSystemGrade(question, work).isCorrect, true, `${id}: ${failing(graphedSystemGrade(question, work))}`);
    assert.equal(graphedSystemGrade(question, { ...work, values: { [u]: solution.y, [v]: solution.x } }).isCorrect, false, `${id}: the values swapped`);
    assert.equal(graphedSystemGrade(question, { ...work, values: { [u]: solution.x + 1, [v]: solution.y } }).isCorrect, false, `${id}: one unit off`);
  });
});

test('Unit 9 (A.2I): the food truck\'s 40 items and $150 become t + b = 40 and 3t + 5b = 150, the system the next question solves', () => {
  const question = item('tg-u9-q4');
  const [, items, taco, burrito, money] = /sold (\d+) items at lunch\. Tacos cost \$(\d+) and burritos cost \$(\d+), and the truck collected \$(\d+)\./.exec(question.prompt).map(Number);
  assert.deepEqual([items, taco, burrito, money], [40, 3, 5, 150]);
  const key = { items: `t + b = ${items}`, money: `${taco}t + ${burrito}b = ${money}` };
  const grade = (answers) => {
    const browser = gradeMultiAnswerResponse(question, answers, { followThrough });
    const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } });
    assert.equal(server.isCorrect, browser.isCorrect);
    return browser.isCorrect;
  };
  assert.equal(grade(key), true);
  assert.equal(grade({ ...key, items: `b = ${items} - t` }), true, 'any form of the same equation');
  assert.equal(grade({ ...key, money: `${burrito}t + ${taco}b = ${money}` }), false, 'the prices on the wrong items');
  assert.equal(grade({ ...key, items: `t + b = ${money}` }), false);
  // The next question restates this system, so it does not depend on this answer, and its solution fits the story.
  const solving = item('tg-u9-q5');
  assert.deepEqual(solving.equations, [key.items, key.money]);
  assert.deepEqual(solving.variables, ['t', 'b']);
  const sold = meet(...solving.equations.map((equation) => linearOf(equation, ['t', 'b'])));
  assert.equal(sold.x + sold.y, items);
  assert.equal(taco * sold.x + burrito * sold.y, money);
  assert.ok(Number.isInteger(sold.x) && Number.isInteger(sold.y) && sold.x > 0 && sold.y > 0, 'whole numbers of tacos and burritos');
});

test('Unit 9 Honors (A.5C): substituting y = 3x − 2 into 6x − 2y = 10 leaves 4 = 10: no solution', () => {
  const question = item('tg-u9-h1');
  const lines = question.equations.map((equation) => linearOf(equation));
  assert.deepEqual(meet(...lines), { type: 'none' });
  // 6x − 2(3x − 2) with the x-terms gone: the left side is the constant 4.
  const first = solvedForV(lines[0]);
  const left = lines[1].b * first.k;
  assert.equal(lines[1].a + lines[1].b * first.m, 0, 'the x-terms cancel');
  assert.deepEqual([left, -lines[1].c], [4, 10]);
  const work = { dimension: 2, method: 'substitution', values: {}, verification: {}, reducedStatement: `${left} = ${-lines[1].c}`, specialCase: { statementTruth: 'false', solutionCount: 'none', classification: 'inconsistent' } };
  assert.equal(graphedSystemGrade(question, work).isCorrect, true, failing(graphedSystemGrade(question, work)));
  assert.equal(graphedSystemGrade(question, { ...work, specialCase: { statementTruth: 'true', solutionCount: 'infinite', classification: 'consistent-dependent' } }).isCorrect, false, 'not the same line');
  assert.equal(graphedSystemGrade(question, { ...work, reducedStatement: '4 = 4' }).isCorrect, false, 'a statement the system does not reach');
});

/* ================================================================ Unit 10 */

// An inequality the student reads, as a half-plane: y (relation) m·x + k, or a vertical or horizontal boundary.
const halfPlaneOf = (text) => {
  const line = linearOf(text);
  const solved = solvedForV(line);
  const strict = !solved.relation.includes('=');
  if (solved.vertical) return { ...line, ...solved, strict, holds: ([x]) => ({ '<': x < solved.at, '>': x > solved.at, '<=': x <= solved.at, '>=': x >= solved.at }[solved.relation]) };
  return {
    ...line,
    ...solved,
    strict,
    holds: ([x, y]) => {
      const edge = solved.m * x + solved.k;
      return { '<': y < edge, '>': y > edge, '<=': y <= edge, '>=': y >= edge }[solved.relation];
    },
  };
};
const builtLine = (x1, y1, x2, y2, extra = {}) => ({
  method: 'points', x1, y1, x2, y2, slope: '', intercept: '', constant: '', point1Plotted: true, point2Plotted: true,
  boundaryAttempts: 1, style: '', styleAttempts: 1, shadePoint: null, shadeAttempts: 1, visible: true, ...extra,
});
/** One constraint built the way the student builds it: two points of the boundary, its style, a point on the shaded side. */
const buildRow = (half, graph) => {
  const style = half.strict ? 'dashed' : 'solid';
  const centre = [(graph.xMin + graph.xMax) / 2, (graph.yMin + graph.yMax) / 2];
  if (half.vertical) {
    const shadePoint = [half.at + (half.relation.startsWith('<') ? -2 : 2), centre[1]];
    return { ...builtLine('', '', '', '', { method: 'vertical', constant: String(half.at), point1Plotted: false, point2Plotted: false }), style, shadePoint };
  }
  if (half.m === 0) {
    const shadePoint = [centre[0], half.k + (half.relation.startsWith('<') ? -2 : 2)];
    return { ...builtLine('', '', '', '', { method: 'horizontal', constant: String(half.k), point1Plotted: false, point2Plotted: false }), style, shadePoint };
  }
  // Two grid points of the boundary inside the window.
  const points = [];
  for (let x = Math.ceil(graph.xMin); x <= graph.xMax && points.length < 2; x += 1) {
    const y = half.m * x + half.k;
    if (Number.isInteger(y) && y >= graph.yMin && y <= graph.yMax) points.push([x, y]);
  }
  assert.equal(points.length, 2, 'two grid points on the boundary');
  const [x0, y0] = points[0];
  const shadePoint = [x0, y0 + (half.relation.startsWith('<') ? -2 : 2)];
  assert.equal(half.holds(shadePoint), true);
  return { ...builtLine(points[0][0], points[0][1], points[1][0], points[1][1]), style, shadePoint };
};
const yesNo = (value) => (value ? 'yes' : 'no');
const pointResponse = (halves, point) => ({ overall: yesNo(halves.every((half) => half.holds(point))), perInequality: halves.map((half) => yesNo(half.holds(point))) });
const flipped = (response) => ({ ...response, overall: response.overall === 'yes' ? 'no' : 'yes' });
const inequalityGrade = (question, work) => {
  const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
  assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, browser.isCorrect, question.questionId);
  return browser;
};
/** The whole build for the inequalities `halves`, with the reasoning the question asks for. */
const inequalityWork = (question, halves, { modelingEntries = null } = {}) => ({
  build: halves.map((half) => buildRow(half, question.graph)),
  ...(question.studentBuild.rewrite ? { rewrite: halves.map((half) => ({ graphingForm: { A: -half.m, B: 1, C: -half.k, relation: half.relation } })) } : {}),
  ...(modelingEntries ? { modelingEntries, modelingSent: true } : {}),
  regionClassification: '',
  ...(question.testPoint ? { teacherPointResponse: pointResponse(halves, [question.testPoint.x, question.testPoint.y]) } : {}),
  vertices: [],
});
// The inequalities as the prompt shows them, in $…$: "$y \le 2x + 1$".
const shownInequalities = (prompt) => [...prompt.matchAll(/\$([^$]+)\$/g)].map(([, text]) => text);

test('Unit 10 (A.3D, A.3H): each graph is built from the inequalities the prompt shows: boundary, solid or dashed, the shaded side, and the test point', () => {
  const EXPECTED = {
    'tg-u10-q1': { halves: ['y <= 2x + 1'], test: [true], solution: true },
    'tg-u10-q2': { halves: ['y > -1x + 3'], test: [false], solution: false },
    'tg-u10-q3': { halves: ['y <= 1x - 3'] },
    'tg-u10-q5': { halves: ['y >= 1x - 2', 'y < -1x + 4'], test: [true, true], solution: true },
    'tg-u10-q6': { halves: ['y <= -2x + 6', 'y > 1x - 3'], test: [false, true], solution: false },
  };
  Object.entries(EXPECTED).forEach(([id, expected]) => {
    const question = item(id);
    const shown = shownInequalities(question.prompt);
    assert.equal(shown.length, expected.halves.length, id);
    // What the tool shows is what the prompt shows.
    shown.forEach((text, index) => {
      const [fromPrompt, fromTool] = [linearOf(text), linearOf(question.sourceConstraints[index])];
      assert.deepEqual(fromTool, fromPrompt, `${id}: ${question.sourceConstraints[index]}`);
    });
    const halves = shown.map(halfPlaneOf);
    assert.deepEqual(halves.map((half) => `y ${half.relation} ${half.m}x ${signed(half.k)}`), expected.halves, id);
    // A rewrite item is one whose symbol or sides really change.
    if (question.studentBuild.rewrite) assert.ok(halves.some((half) => half.b < 0), `${id}: dividing by a negative reverses a symbol`);
    const work = inequalityWork(question, halves);
    if (expected.test) {
      assert.deepEqual(work.teacherPointResponse.perInequality, expected.test.map(yesNo), id);
      assert.equal(work.teacherPointResponse.overall, yesNo(expected.solution), id);
      assert.ok(question.prompt.includes(`(${question.testPoint.x}, ${question.testPoint.y})`), `${id}: the test point is in the prompt`);
      // The test point is off every boundary.
      halves.forEach((half) => assert.notEqual(half.m * question.testPoint.x + half.k, question.testPoint.y, id));
    }
    assert.equal(inequalityGrade(question, work).isCorrect, true, `${id}: ${failing(inequalityGrade(question, work))}`);
    const wrongStyle = { ...work, build: work.build.map((row, index) => (index === 0 ? { ...row, style: row.style === 'solid' ? 'dashed' : 'solid' } : row)) };
    assert.equal(inequalityGrade(question, wrongStyle).isCorrect, false, `${id}: solid and dashed traded`);
    const wrongSide = { ...work, build: work.build.map((row, index) => (index === 0 ? { ...row, shadePoint: [row.shadePoint[0], row.shadePoint[1] + (halves[0].relation.startsWith('<') ? 4 : -4)] } : row)) };
    assert.equal(inequalityGrade(question, wrongSide).isCorrect, false, `${id}: the other side shaded`);
    if (expected.test) assert.equal(inequalityGrade(question, { ...work, teacherPointResponse: flipped(work.teacherPointResponse) }).isCorrect, false, `${id}: the test point judged wrongly`);
    if (question.studentBuild.rewrite) {
      const kept = { ...work, rewrite: work.rewrite.map((row, index) => (halves[index].b < 0 ? { graphingForm: { ...row.graphingForm, relation: FLIP[row.graphingForm.relation] } } : row)) };
      assert.equal(inequalityGrade(question, kept).isCorrect, false, `${id}: the symbol kept after dividing by a negative`);
    }
  });
});

test('Unit 10 (A.2H): the notebooks and pens, and (Honors) the candles, are modelled from the numbers of the story and then graphed', () => {
  // Notebooks: $2 and $1, at most $10.
  const shopping = item('tg-u10-q4');
  const [, notebook, pen, budget] = /Notebooks cost \$(\d+) each and pens cost \$(\d+) each\. Ava can spend at most \$(\d+)\./.exec(shopping.prompt).map(Number);
  assert.deepEqual([notebook, pen, budget], [2, 1, 10]);
  const shoppingModel = [`${notebook}x + ${pen}y <= ${budget}`];
  // Candles: $4 and $8, at most 10 candles, at least $48.
  const candles = item('tg-u10-h1');
  const [, small, large, most, least] = /small candles for \$(\d+) and large candles for \$(\d+)\. It can make at most (\d+) candles, and it wants to collect at least \$(\d+)\./.exec(candles.prompt).map(Number);
  assert.deepEqual([small, large, most, least], [4, 8, 10, 48]);
  const candleModel = [`x + y <= ${most}`, `${small}x + ${large}y >= ${least}`];

  [[shopping, shoppingModel, [true], true], [candles, candleModel, [true, true], true]].forEach(([question, model, test, solution]) => {
    const id = question.questionId;
    const halves = model.map(halfPlaneOf);
    const entries = model.map((text) => {
      const { a, b, c, relation } = linearOf(text);
      return { coeffA: String(a), coeffB: String(b), relation, constant: String(-c) };
    });
    assert.equal(question.modeling.variables.length, 2, id);
    const work = inequalityWork(question, halves, { modelingEntries: entries });
    assert.deepEqual(work.teacherPointResponse, { overall: yesNo(solution), perInequality: test.map(yesNo) }, id);
    // Each boundary's intercepts are inside the first-quadrant window, so it can be drawn from them.
    halves.forEach((half) => {
      const intercepts = [[-half.c / half.a, 0], [0, -half.c / half.b]];
      intercepts.forEach(([x, y]) => assert.ok(Number.isInteger(x) && Number.isInteger(y) && x <= question.graph.xMax && y <= question.graph.yMax, `${id}: (${x}, ${y}) is a grid point of the window`));
    });
    assert.equal(inequalityGrade(question, work).isCorrect, true, `${id}: ${failing(inequalityGrade(question, work))}`);
    const reversed = entries.map((entry, index) => (index === entries.length - 1 ? { ...entry, relation: FLIP[entry.relation] } : entry));
    assert.equal(inequalityGrade(question, { ...work, modelingEntries: reversed }).isCorrect, false, `${id}: "at most" and "at least" confused`);
    const swapped = entries.map((entry, index) => (index === entries.length - 1 ? { ...entry, coeffA: entry.coeffB, coeffB: entry.coeffA } : entry));
    assert.equal(inequalityGrade(question, { ...work, modelingEntries: swapped }).isCorrect, false, `${id}: the prices on the wrong items`);
    assert.equal(inequalityGrade(question, { ...work, teacherPointResponse: flipped(work.teacherPointResponse) }).isCorrect, false, `${id}: the test point judged wrongly`);
  });
});

test('Unit 10 Honors (A.3H): y ≥ −2, x ≤ 3 and y ≤ x + 1 enclose a triangle with corners (3, −2), (3, 4) and (−3, −2)', () => {
  const question = item('tg-u10-h2');
  const shown = shownInequalities(question.prompt);
  assert.equal(shown.length, 3);
  shown.forEach((text, index) => assert.deepEqual(linearOf(question.sourceConstraints[index]), linearOf(text)));
  const halves = shown.map(halfPlaneOf);
  // Each pair of boundaries meets once; a corner is a meeting point every inequality allows.
  const corners = [[0, 1], [1, 2], [0, 2]].map(([i, j]) => meet(halves[i], halves[j])).map(({ x, y }) => [x, y]);
  assert.deepEqual(corners, [[3, -2], [3, 4], [-3, -2]]);
  corners.forEach((corner) => assert.ok(halves.every((half) => half.holds(corner)), `(${corner}) is included: every boundary is solid`));
  assert.ok(halves.every((half) => !half.strict));
  const work = {
    ...inequalityWork(question, halves),
    regionClassification: 'bounded',
    vertices: corners.map(([x, y]) => ({ x, y, includedAnswer: 'yes' })),
  };
  assert.equal(inequalityGrade(question, work).isCorrect, true, failing(inequalityGrade(question, work)));
  assert.equal(inequalityGrade(question, { ...work, regionClassification: 'unbounded' }).isCorrect, false, 'a closed triangle is bounded');
  assert.equal(inequalityGrade(question, { ...work, vertices: [...work.vertices.slice(0, 2), { x: 0, y: 1, includedAnswer: 'yes' }] }).isCorrect, false, 'a y-intercept is not a corner');
  assert.equal(inequalityGrade(question, { ...work, vertices: work.vertices.slice(0, 2) }).isCorrect, false, 'a corner missing');
});

/* ------------------------------------------------- every question is held */

test('every question of both files has its key worked out and graded above', () => {
  const source = read('tests/platform/thanksgivingPacketAlgebra1.test.mjs');
  HONORS.questions.forEach((question) => {
    assert.ok(source.includes(`'${question.questionId}'`), `${question.questionId} is graded by name in this file`);
  });
});
