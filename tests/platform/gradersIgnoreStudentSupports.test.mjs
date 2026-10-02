/*
 * A STUDENT SUPPORT NEVER CHANGES A SHARED VERDICT.
 *
 * The browser grades the question as the student sees it, after supports are
 * applied (src/studentSupport.js applyStudentSupportToQuestion): a translated
 * prompt and title, multiple-choice options trimmed for `reduce-complexity`,
 * `prefillFirstStep`, `visualChunking`, presentation flags. The server grades
 * the question as authored — it does not know the student's profile. The two
 * agree only if no shared grader reads a field a support can change.
 *
 * This holds every shared grader to that:
 *
 *   1. a STRUCTURAL check: each support-sensitive field is planted as a
 *      non-enumerable getter that records being read. Spreading or cloning
 *      the question does not trigger it; only a grader actually reading the
 *      field does. Every registry tool mode, structured type and question
 *      grader is run with empty and with filled work.
 *   2. a DIFFERENTIAL check on real supports: the same work graded against
 *      the authored question and against the supported one gives one verdict.
 *
 * A grader that needs the wording reads `authoredPrompt ?? prompt`:
 * applyStudentSupportToQuestion keeps the authored prompt there whenever it
 * substitutes a translation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { QUESTION_GRADERS } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { applyStudentSupportToQuestion } from '../../src/studentSupport.js';

// Every field applyStudentSupportToQuestion can add or change.
const SUPPORT_FIELDS = Object.freeze({
  prompt: 'Build a parabola whose vertex is in Quadrant IV.',
  title: 'Translated title',
  choices: ['a', 'b', 'c', 'd'],
  translations: { es: { prompt: 'Construye una parábola.' } },
  supportPresentation: { visualChunking: true },
  supportEntitlements: { prefillFirstStep: true },
  prefillFirstStep: true,
  visualChunking: true,
  formulaAnchor: 'A = bh',
});

const tainted = (base, reads) => {
  const question = { ...base };
  Object.entries(SUPPORT_FIELDS).forEach(([key, value]) => {
    Object.defineProperty(question, key, {
      enumerable: false,
      configurable: true,
      get() {
        reads.add(key);
        return value;
      },
    });
  });
  return question;
};

// Work shaped enough to drive most graders past their "empty" early exits.
const SAMPLE_WORKS = [
  {},
  { a: '1', b: '2', real: '1', imaginary: '1', points: [[0, 1], [2, 5]], answer: '3', value: '3', choice: 'a', selected: ['a'] },
];

test('no registry-tool or structured grader reads a field a student support can change', () => {
  const offenders = {};
  Object.entries(TOOL_GRADERS).forEach(([surfaceId, grader]) => {
    Object.entries(grader.declaration.modes).forEach(([mode, entry]) => {
      if (entry.authority !== GRADING_AUTHORITY.SHARED_SERVER) return;
      const reads = new Set();
      // The authored wording is available exactly as a support leaves it.
      const base = { type: surfaceId, toolId: surfaceId, mode, authoredPrompt: SUPPORT_FIELDS.prompt };
      SAMPLE_WORKS.forEach((work) => {
        try {
          grader.grade(tainted(base, reads), work);
        } catch {
          // A grader that throws is caught by bindToolGrader in production;
          // what matters here is only what it read.
        }
      });
      if (reads.size) offenders[`${surfaceId}.${mode}`] = [...reads];
    });
  });
  assert.deepEqual(offenders, {}, 'a grader reads a support-changed field; read the authored value instead');
});

test('no question-kind grader reads a field a student support can change', () => {
  const offenders = {};
  Object.entries(QUESTION_GRADERS).forEach(([surfaceId, grader]) => {
    const reads = new Set();
    const base = { type: surfaceId, authoredPrompt: SUPPORT_FIELDS.prompt, equation: '2x + 3 = 11', solveFor: 'x' };
    [
      { kind: 'opaque', type: surfaceId, value: 'x = 4|{}', fields: [] },
      { kind: 'scalar', type: surfaceId, value: '4', fields: [] },
    ].forEach((response) => {
      try {
        grader.grade(tainted(base, reads), response);
      } catch {
        // see above
      }
    });
    if (reads.size) offenders[surfaceId] = [...reads];
  });
  assert.deepEqual(offenders, {}, 'a question grader reads a support-changed field');
});

const PROFILES = Object.freeze({
  translation: { translationLanguage: 'es' },
  reduceComplexity: { modifications: ['reduce-complexity'] },
  prefill: { modifications: ['prefill-first-step'] },
  chunking: { accommodations: ['visual-chunking', 'large-text'] },
  inclusion: { inclusionStatus: true },
});

const verdict = (result) => ({ graded: result.graded, isCorrect: result.isCorrect, score: result.score });

test('real supports leave real verdicts unchanged', () => {
  const cases = [
    {
      toolId: 'complexPlaneLab',
      question: { type: 'complexPlaneLab', toolId: 'complexPlaneLab', mode: 'operations', operation: 'add', z: { re: 3, im: 1 }, w: { re: 2, im: -1 }, prompt: 'Add the numbers.', translations: { es: { prompt: 'Suma los números.' } } },
      works: [{ real: '5', imaginary: '0' }, { real: '4', imaginary: '0' }],
    },
    {
      toolId: 'graphing2',
      question: { type: 'graphing2', toolId: 'graphing2', mode: 'slopeIntercept', line: { m: 2, b: -1 }, prompt: 'Graph y = 2x - 1.', translations: { es: { prompt: 'Grafica y = 2x - 1.' } } },
      works: [{ points: [[0, -1], [1, 1]] }, { points: [[0, 1], [1, 3]] }],
    },
    {
      toolId: 'constraintFunctionBuilder',
      question: {
        type: 'constraintFunctionBuilder',
        toolId: 'constraintFunctionBuilder',
        prompt: 'Build a parabola that opens up with its vertex in Quadrant IV.',
        translations: { es: { prompt: 'Construye una parábola que abra hacia arriba con su vértice en el cuarto cuadrante.' } },
        constraints: [{ kind: 'family', value: 'quadratic' }, { kind: 'vertex', value: [2, -3] }],
      },
      works: [{ family: 'quadratic', a: '1', h: '3', k: '-2' }, { family: 'quadratic', a: '1', h: '2', k: '-3' }],
    },
  ];
  cases.forEach(({ toolId, question, works }) => {
    Object.entries(PROFILES).forEach(([profileName, profile]) => {
      const supported = applyStudentSupportToQuestion(question, profile).question;
      works.forEach((work) => {
        const authored = gradeToolWork({ toolId, question, work });
        const asSeen = gradeToolWork({ toolId, question: supported, work });
        assert.deepEqual(verdict(asSeen), verdict(authored), `${toolId} under ${profileName} with ${JSON.stringify(work)}`);
        // ...and the server, grading the authored question from the response
        // the supported browser built, agrees with both.
        if (asSeen.toolResponse) {
          assert.deepEqual(verdict(gradeServerResponse({ question, response: asSeen.toolResponse })), verdict(authored), `${toolId} server under ${profileName}`);
        }
      });
    });
  });
});

test('a translation keeps the authored prompt for graders, and only then', () => {
  const question = { type: 'literal', prompt: 'Solve for h.', translations: { es: { prompt: 'Resuelve para h.' } } };
  const translated = applyStudentSupportToQuestion(question, { translationLanguage: 'es' }).question;
  assert.equal(translated.prompt, 'Resuelve para h.');
  assert.equal(translated.authoredPrompt, 'Solve for h.');
  assert.equal(applyStudentSupportToQuestion(question, { accommodations: ['large-text'] }).question.authoredPrompt, undefined);

  // An authored question with no prompt keeps an empty authored prompt, so
  // `authoredPrompt ?? prompt` reads '' (what the server reads), never the
  // translation.
  const unprompted = { type: 'literal', translations: { es: { prompt: 'Construye una parábola con vértice en el cuadrante IV.' } } };
  const seen = applyStudentSupportToQuestion(unprompted, { translationLanguage: 'es' }).question;
  assert.equal(seen.authoredPrompt, '');
  assert.equal(seen.authoredPrompt ?? seen.prompt, '');
});
