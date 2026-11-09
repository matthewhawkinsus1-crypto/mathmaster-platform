#!/usr/bin/env node
/*
 * CHECK A TEACHER-IMPORT JSON THE WAY A TEACHER'S IMPORT READS IT.
 *
 *   node scripts/check-teacher-import.mjs <file.json> [more.json …] [--verbose] [--honors]
 *
 * Runs each file through the same chain the browser harnesses use
 * (tests/browser/linearMultipleRepresentationsMain.jsx): parse the blueprint,
 * build the preflight-reviewed V5 assignment, run the V5 preflight model, then
 * validate the flattened questions and their student-experience semantics.
 * It prints every preflight error and warning, and the tool each question
 * compiled to, so an author sees what a student will actually be given before
 * the file reaches the import screen.
 *
 * An Honors file (its title, folder or name says Honors; --honors checks any
 * file) is also checked the way Review checks it when a teacher selects an
 * Honors class: the Honors version with its audited CCMR Practice, and the
 * blocker Review would show (scripts/lib/honorsImportReview.mjs). It prints
 * which questions supply each depth area and, when it is blocked, how to
 * supply what is missing. Before this, an Honors lesson could pass here and
 * be blocked the first time it was assigned.
 *
 * Exit code 1 when any file has a preflight error, fails validation, or, for
 * an Honors file, would be blocked for an Honors class.
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

// One line for the Honors version's audited CCMR Practice, by its status.
const ccmrSummary = (verdict) => {
  switch (verdict.status) {
    case 'ready': return `audited CCMR Practice ${verdict.sourcedCount} of ${verdict.targetCount}`;
    case 'notRequired': return verdict.narrowCheckpoint ? 'a short checkpoint: only its Core TEKS is required' : 'no audited CCMR Practice needed (short Practice)';
    case 'needsDecision': return 'no audited CCMR Practice item passed: the teacher will have to choose how to continue';
    case 'invalid': return 'the Honors version does not pass Pre-Flight';
    default: return `audited CCMR Practice: ${verdict.status}`;
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const forceHonors = args.includes('--honors');
  const files = args.filter((arg) => !arg.startsWith('--'));
  if (!files.length) {
    console.error('usage: node scripts/check-teacher-import.mjs <file.json> [more.json …] [--verbose] [--honors]');
    process.exit(2);
  }
  // Loaded here, not at the top: tests import compileTeacherImport and do not need it.
  const { HONORS_AREA_LABELS, isHonorsImport, reviewImportForHonors } = await import('./lib/honorsImportReview.mjs');
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

      if (forceHonors || isHonorsImport({ filePath: file, title: model.assignmentV5?.assignment?.title })) {
        const verdict = reviewImportForHonors(model);
        if (!verdict) {
          console.log('honors: not checked until Pre-Flight passes');
        } else {
          const depth = verdict.narrowCheckpoint ? '' : ` · depth ${verdict.report.depthCount} of ${verdict.depthAreaCount}`;
          console.log(`honors: ${verdict.ready ? 'ready' : 'BLOCKED'} for an Honors class${depth} · ${ccmrSummary(verdict)}`);
          verdict.blockers.forEach((message) => console.log(`  HONORS  ${message}`));
          verdict.hints.forEach((hint) => console.log(`  how     ${hint}`));
          if (!verdict.narrowCheckpoint && (verbose || !verdict.ready)) {
            Object.entries(HONORS_AREA_LABELS).forEach(([area, label]) => {
              const ids = verdict.evidence[area];
              console.log(`  ${label.padEnd(28)} ${ids.length ? ids.join(' ') : '—'}`);
            });
          }
          if (!verdict.ready) failed = true;
        }
      }
    } catch (error) {
      failed = true;
      console.log(`  THREW ${error?.stack || error}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
