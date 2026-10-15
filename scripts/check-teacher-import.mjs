#!/usr/bin/env node
/*
 * CHECK A TEACHER-IMPORT JSON THE WAY A TEACHER'S IMPORT READS IT.
 *
 *   node scripts/check-teacher-import.mjs <file.json> [more.json …] [--verbose]
 *
 * Runs each file through the same chain the browser harnesses use
 * (tests/browser/linearMultipleRepresentationsMain.jsx): parse the blueprint,
 * build the preflight-reviewed V5 assignment, run the V5 preflight model, then
 * validate the flattened questions and their student-experience semantics.
 * It prints every preflight error and warning, and the tool each question
 * compiled to, so an author sees what a student will actually be given before
 * the file reaches the import screen.
 *
 * Exit code 1 when any file has a preflight error or fails validation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections } from '../src/platform/contract/assignmentSchemaV5.js';
import { validateQuestionsSemantics } from '../src/platform/contract/semanticValidation.js';

export const compileTeacherImport = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  const questions = model.isValid ? validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {}) : [];
  const semantic = questions.length ? validateQuestionsSemantics(questions) : { errors: [], warnings: [] };
  return { parsed, model, questions, semantic };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const files = args.filter((arg) => !arg.startsWith('--'));
  if (!files.length) {
    console.error('usage: node scripts/check-teacher-import.mjs <file.json> [more.json …] [--verbose]');
    process.exit(2);
  }
  let failed = false;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    console.log(`\n== ${file}`);
    try {
      const { model, questions, semantic } = compileTeacherImport(text);
      console.log(`preflight: ${model.isValid ? 'valid' : 'INVALID'} · ${model.errors.length} error(s) · ${(model.warnings || []).length} warning(s)`);
      model.errors.forEach((error) => console.log(`  ERROR   ${error}`));
      (model.warnings || []).forEach((warning) => console.log(`  warning ${warning}`));
      semantic.errors.forEach((error) => console.log(`  SEMANTIC ERROR   ${error}`));
      semantic.warnings.forEach((warning) => console.log(`  semantic warning ${warning}`));
      if (verbose) {
        questions.forEach((question) => {
          const stages = Array.isArray(question.workflow) ? ` [${question.workflow.map((stage) => stage.kind).join(', ')}]` : '';
          console.log(`  ${String(question.questionId || '?').padEnd(14)} ${question.activityRole || question.sectionRole || ''} → ${question.type}${question.mode ? `/${question.mode}` : ''}${stages}`);
        });
      }
      if (!model.isValid || semantic.errors.length) failed = true;
    } catch (error) {
      failed = true;
      console.log(`  THREW ${error?.stack || error}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
