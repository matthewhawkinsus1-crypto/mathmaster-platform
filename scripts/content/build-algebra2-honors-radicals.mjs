#!/usr/bin/env node
/*
 * ALGEBRA II HONORS — RADICALS AND RATIONAL EXPONENTS, LESSONS 1–3.
 *
 *   node scripts/content/build-algebra2-honors-radicals.mjs
 *
 * Writes the three teacher-import files in
 * teacher-import-jsons/algebra2-honors-radicals/ from the lesson modules in
 * scripts/content/algebra2HonorsRadicals/ (nth Roots, Operations with Radical
 * Expressions, Rational Exponents; TEKS A2.7G). Edit a lesson module, then run
 * this again: tests/platform/algebra2HonorsRadicalsLessons.test.mjs fails when
 * a committed file is not exactly what this script writes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonText, writeLessonFile } from './lib/lessonKit.mjs';
import { L1_NTH_ROOTS } from './algebra2HonorsRadicals/l1NthRoots.mjs';
import { L2_RADICAL_OPERATIONS } from './algebra2HonorsRadicals/l2RadicalOperations.mjs';
import { L3_RATIONAL_EXPONENTS } from './algebra2HonorsRadicals/l3RationalExponents.mjs';

export const ALGEBRA2_HONORS_RADICALS_LESSONS = Object.freeze([L1_NTH_ROOTS, L2_RADICAL_OPERATIONS, L3_RATIONAL_EXPONENTS]);
export const expectedFileText = (entry) => lessonText(entry.lesson);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  ALGEBRA2_HONORS_RADICALS_LESSONS.forEach((entry) => {
    const file = writeLessonFile(entry.file, entry.lesson);
    console.log(`wrote ${path.relative(process.cwd(), file)}`);
  });
}
