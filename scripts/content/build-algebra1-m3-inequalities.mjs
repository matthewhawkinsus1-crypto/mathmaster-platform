#!/usr/bin/env node
/*
 * ALGEBRA I · MODULE 3 · TOPIC 2 — LESSONS 4 AND 5, REGULAR AND HONORS.
 *
 *   node scripts/content/build-algebra1-m3-inequalities.mjs
 *
 * Writes four teacher-import files in teacher-import-jsons/algebra1-module3/
 * from the lesson modules in scripts/content/algebra1M3Inequalities/:
 * Graphing Inequalities in Two Variables (A.2H, A.3D) and Systems of Linear
 * Inequalities (A.3H), each as a regular and an Honors assignment. Edit a
 * lesson module, then run this again: tests/platform/
 * algebra1Module3InequalityLessons.test.mjs fails when a committed file is not
 * exactly what this script writes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonText, writeLessonFile } from './lib/lessonKit.mjs';
import { L4_HONORS, L4_REGULAR } from './algebra1M3Inequalities/l4GraphingInequalities.mjs';
import { L5_HONORS, L5_REGULAR } from './algebra1M3Inequalities/l5SystemsOfInequalities.mjs';

export const ALGEBRA1_M3_INEQUALITY_LESSONS = Object.freeze([L4_REGULAR, L4_HONORS, L5_REGULAR, L5_HONORS]);
/** Each Honors file beside the regular file it extends. */
export const ALGEBRA1_M3_INEQUALITY_PAIRS = Object.freeze([
  Object.freeze({ regular: L4_REGULAR, honors: L4_HONORS }),
  Object.freeze({ regular: L5_REGULAR, honors: L5_HONORS }),
]);
export const expectedFileText = (entry) => lessonText(entry.lesson);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  ALGEBRA1_M3_INEQUALITY_LESSONS.forEach((entry) => {
    const file = writeLessonFile(entry.file, entry.lesson);
    console.log(`wrote ${path.relative(process.cwd(), file)}`);
  });
}
