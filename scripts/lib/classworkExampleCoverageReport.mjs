/*
 * THE CLASSWORK WORKED-EXAMPLE COVERAGE OF THE REAL LESSONS (WE-B).
 *
 *   measureClassworkExampleCoverage({ root }) → { lessons, summary, lessonsWithClasswork, lessonsWithNoBuiltIn }
 *
 * Read-only and local: it reads the lesson files in teacher-import-jsons/ and
 * nothing else (no Firestore, no network), compiles each with the V5 compiler,
 * and checks every Classwork question as QuestionEngine receives it
 * (compileAuthoringIntentV5 → prepareQuestionForRuntimeRouting →
 * generateQuestion → normalizeContextualQuestion), the way
 * WORKED_EXAMPLES.md section 8 measured it. The rules are the module's
 * (src/platform/supports/workedExample/classworkCoverage.js); this only feeds
 * it the lessons. Used by scripts/report-classwork-example-coverage.mjs and its
 * test (tests/platform/classworkExampleCoverage.test.mjs).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import {
  EXAMPLE_COVERAGE_STATUS,
  classworkExampleCoverage,
  summarizeClassworkExampleCoverage,
} from '../../src/platform/supports/workedExample/classworkCoverage.js';

export const LESSONS_DIRECTORY = 'teacher-import-jsons';

/** The question as QuestionEngine receives it. */
export const asQuestionEngineReceivesIt = (stored) => normalizeContextualQuestion(
  generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null),
);

/** Every lesson file under teacher-import-jsons/, as repo-relative paths, sorted. */
export const lessonFiles = (root) => {
  const directory = path.join(root, LESSONS_DIRECTORY);
  const found = [];
  const walk = (relative) => {
    for (const name of readdirSync(path.join(directory, relative)).sort()) {
      const child = relative ? `${relative}/${name}` : name;
      if (statSync(path.join(directory, child)).isDirectory()) walk(child);
      else if (name.endsWith('.json')) found.push(`${LESSONS_DIRECTORY}/${child}`);
    }
  };
  walk('');
  return found;
};

export const measureClassworkExampleCoverage = ({ root, prepareQuestion = asQuestionEngineReceivesIt } = {}) => {
  const lessons = lessonFiles(root).map((file) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(root, file), 'utf8')));
    const coverage = classworkExampleCoverage(compiled, { prepareQuestion });
    return { file, title: compiled?.package?.assignment?.title || '', ...coverage };
  });
  const withClasswork = lessons.filter((lesson) => lesson.questions.length > 0);
  return {
    lessons: withClasswork,
    summary: summarizeClassworkExampleCoverage(withClasswork.flatMap((lesson) => lesson.questions)),
    lessonsWithClasswork: withClasswork.length,
    lessonsWithNoBuiltIn: withClasswork.filter((lesson) => lesson.summary.byStatus[EXAMPLE_COVERAGE_STATUS.BUILT_IN] === 0).length,
    lessonsWithNoneCovered: withClasswork.filter((lesson) => lesson.summary.covered === 0).length,
  };
};
