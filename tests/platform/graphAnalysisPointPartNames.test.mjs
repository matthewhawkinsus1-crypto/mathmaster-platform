/*
 * A GRAPH-ANALYSIS POINT PART IS NAMED IN WORDS, NEVER BY ITS FEATURE ID
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 2).
 *
 * Algebra II Honors L2 Day 1 CW 1, 2, 6 and 7 ask for a vertex, a minimum and
 * intercepts as points on the graph. Their import gave those parts no name, and
 * the graph workspace falls back to the feature's id
 * (graphWorkspaceModel.mjs: `label: request.label || feature`). A student read
 * "yIntercept", "xIntercepts" and "localMinimum" as the part's heading, in
 * "Active part: yIntercept. Select 1 location(s)" and in "still to fix: …,
 * yIntercept" after a miss. The lesson now names each part in the prompt's own
 * words ("Vertex", "Minimum point", "x-intercept", "y-intercept").
 *
 * Every teacher-import lesson is compiled here as an import compiles it, and
 * each graph-analysis item is read by the same model the student's screen and
 * the grader use. A point part's name must be words: not its feature id, and
 * no camelCase. The four items keep the part ids their import always had,
 * because a student's selections are stored under those ids.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { resolveGraphWorkspaceMode } from '../../functions/shared/serverGrading/declarations/graphWorkspace.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LESSONS = join(ROOT, 'teacher-import-jsons');
const L2_DAY1 = 'algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json';

const lessonFiles = (dir) => readdirSync(dir).sort().flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return lessonFiles(path);
  return name.endsWith('.json') ? [path] : [];
});
const compile = (path) => parseAssignmentBlueprintText(readFileSync(path, 'utf8')).questions;
const partsOf = (question) => graphWorkspaceModelFor(question, { analysisMode: resolveGraphWorkspaceMode(question) === 'analysis' }).analysisParts || [];

test('no graph-analysis point part in a teacher-import lesson is named by its feature id', () => {
  let pointParts = 0;
  const raw = [];
  for (const path of lessonFiles(LESSONS)) {
    let questions;
    try { questions = compile(path); } catch { continue; } // not a lesson document
    questions.filter((question) => question.type === 'graphAnalysis').forEach((question) => {
      partsOf(question).filter((part) => part.kind === 'point').forEach((part) => {
        pointParts += 1;
        const name = String(part.label || '');
        if (!name || name === part.feature || /[a-z][A-Z]/.test(name)) raw.push(`${path.replace(LESSONS, '')} ${question.questionId} ${part.id}: "${name}"`);
      });
    });
  }
  assert.ok(pointParts >= 6, `the sweep reads point parts (${pointParts})`);
  assert.deepEqual(raw, [], 'every point part is named in words a student reads');
});

test('Algebra II Honors L2 Day 1: the four point items keep their part ids and use the prompt\'s words', () => {
  const questions = compile(join(LESSONS, L2_DAY1));
  const named = Object.fromEntries(questions.filter((question) => question.type === 'graphAnalysis')
    .map((question) => [question.questionId, partsOf(question).map((part) => `${part.id}=${part.label}`)]));
  assert.deepEqual(named['q_classwork-2_2_1'], ['domain=Domain in interval notation', 'range=Range in interval notation', 'vertex=Vertex', 'minimum=Minimum point']);
  assert.deepEqual(named['q_classwork-2_2_2'], ['domain=Domain in interval notation', 'range=Range in interval notation', 'x-intercepts=x-intercept', 'y-intercept=y-intercept']);
  assert.deepEqual(named['q_classwork-2_2_6'], ['domain=Domain in interval notation', 'range=Range in interval notation', 'increasing=Increasing interval(s)', 'y-intercept=y-intercept']);
  assert.deepEqual(named['q_classwork-2_2_7'], ['domain=Domain in interval notation', 'range=Range in interval notation', 'increasing=Increasing interval(s)', 'x-intercepts=x-intercept']);
});
