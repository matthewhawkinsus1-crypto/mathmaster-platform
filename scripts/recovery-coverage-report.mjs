#!/usr/bin/env node
/*
 * RECOVERY COVERAGE — WHICH LESSONS' WARM-UP AND DOL QUESTIONS HAVE RECOVERY (RC01).
 *
 *   node scripts/recovery-coverage-report.mjs              a table per lesson, then every question without Recovery, by shape
 *   node scripts/recovery-coverage-report.mjs --json       the same measurement as JSON
 *   node scripts/recovery-coverage-report.mjs --preflight  read each lesson through Pre-Flight's model as well (about a minute)
 *
 * WHAT IT MEASURES. Every lesson file in teacher-import-jsons/ and
 * docs/assignments/, read the way a teacher's import reads it
 * (parseAssignmentBlueprintText; with --preflight, then through Pre-Flight's
 * model, as the import screen does), planned by the one Recovery planner every
 * surface runs (functions/shared/recoveryContentPlan.mjs) with the server's
 * full answer-key check (recoveryCertificationGrading.mjs). For the Warm-Up
 * and the DOL of each lesson:
 *
 *   questions   the delivered Warm-Up or DOL questions
 *   now         how many have Recovery with nothing prepared: Question Family
 *               slots, which recover themselves
 *   prepared    how many have it once Recovery is prepared: a certified family
 *               recognizes the static question. Pre-Flight stores those
 *               bindings when an assignment is created; on a live copy a
 *               teacher's "Prepare Recovery" does.
 *   status      the section once prepared: a Warm-Up is ready when any of its
 *               questions is, a DOL only when every one is
 *
 * and every question still without Recovery, with its shape (its tool, mode,
 * and what it asks), so the next family can be chosen by count.
 *
 * WHAT IT DOES NOT MEASURE. The live copies in Firestore, which a teacher may
 * have edited, given Recovery-off or a Live Challenge Warm-Up, or already
 * prepared: the assignment details and scripts/recovery-v2-upgrade.mjs
 * --project read those documents.
 *
 * Read-only: it writes nothing. tests/platform/recoveryCoverageReport.test.mjs
 * pins its counts, so any change in which questions have Recovery is a
 * reviewed change to that pin.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  RECOVERY_PLAN_ROW,
  liveRecoverySections,
  planAssignmentRecoveryContent,
} from '../functions/shared/recoveryContentPlan.mjs';
import { serverRecoveryKeyCheck } from '../functions/shared/recoveryCertificationGrading.mjs';
import { RECOVERY_SECTIONS_WITH_CONTENT } from '../functions/shared/recoveryContent.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const RECOVERY_COVERAGE_ROOTS = Object.freeze(['teacher-import-jsons', 'docs/assignments']);

/** Every lesson file under the roots, relative to the repository, sorted. */
export const recoveryCoverageLessonFiles = (root = repoRoot) => {
  const files = [];
  const visit = (target) => {
    if (statSync(target).isDirectory()) readdirSync(target).sort().forEach((name) => visit(path.join(target, name)));
    else if (target.endsWith('.json')) files.push(path.relative(root, target).split(path.sep).join('/'));
  };
  RECOVERY_COVERAGE_ROOTS.forEach((relative) => visit(path.join(root, relative)));
  return files.sort();
};

/** The stored assignment a lesson file becomes: the import's parse, or (preflight) Pre-Flight's model of it. */
export const lessonAssignmentForCoverage = (text, { preflight = false } = {}) => {
  const { assignmentV5 } = parseAssignmentBlueprintText(text);
  if (!preflight) return assignmentV5;
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(assignmentV5, {}));
  if (!model.isValid) throw new Error(`Pre-Flight refuses it: ${list(model.errors).slice(0, 2).join('; ')}`);
  return model.assignmentV5;
};

/*
 * A question's shape: its tool and mode, and — for a tool whose task is a
 * list of asks — what it asks ("intervalNumberLine · graph + interval",
 * "graphAnalysis · domain + range"): the tool's `ask`, a recipe's `ask`
 * (functionCharacteristics), or the kinds of its `analysisRequests`. A
 * typed-and-chosen board (multiAnswer) is a container for a hand-written
 * task, so its shape is the tool alone and its prompt says what it asks.
 */
export const questionShape = (question = {}) => {
  const tool = `${clean(question?.type) || 'unknown'}${clean(question?.mode) ? `/${clean(question.mode)}` : ''}`;
  const named = (values) => list(values).map(clean).filter(Boolean);
  const asks = [
    named(question?.ask),
    named(question?.recipe?.ask),
    list(question?.analysisRequests).map((request) => clean(request?.kind)).filter(Boolean),
  ].find((entry) => entry.length) || [];
  return asks.length ? `${tool} · ${asks.join(' + ')}` : tool;
};

const READY_ROWS = new Set([RECOVERY_PLAN_ROW.FAMILY, RECOVERY_PLAN_ROW.KEPT]);
const PREPARED_ROWS = new Set([...READY_ROWS, RECOVERY_PLAN_ROW.ADD, RECOVERY_PLAN_ROW.REPLACE]);

/**
 * One lesson's Warm-Up and DOL, planned. `families` are the candidate
 * families (the planner's own default: every registered family that can
 * recognize a static question).
 */
export const measureLessonRecovery = ({ file = '', assignment = {}, gradeSample = serverRecoveryKeyCheck, families = null } = {}) => {
  const plan = planAssignmentRecoveryContent({ assignment: { ...assignment, id: 'recovery-coverage' }, gradeSample, families });
  const sections = liveRecoverySections(plan);
  const byId = new Map();
  list(assignment?.sections).forEach((section) => list(section?.questions).forEach((question) => {
    const id = clean(question?.questionId || question?.id);
    if (id && !byId.has(id)) byId.set(id, question);
  }));
  const record = { file, title: clean(assignment?.assignment?.title || assignment?.title) || null };
  RECOVERY_SECTIONS_WITH_CONTENT.forEach((section) => {
    const entry = sections[section] || {};
    const rows = list(entry.rows);
    record[section] = {
      questions: rows.length,
      now: rows.filter((row) => READY_ROWS.has(row.status)).length,
      prepared: rows.filter((row) => PREPARED_ROWS.has(row.status)).length,
      status: entry.statusAfterApproval || entry.status || 'notPresent',
    };
  });
  record.withoutRecovery = plan.rows
    .filter((row) => !PREPARED_ROWS.has(row.status))
    .map((row) => {
      const question = byId.get(clean(row.questionId)) || { type: row.type, mode: row.mode };
      return {
        questionId: row.questionId,
        section: row.section,
        label: row.label,
        shape: questionShape(question),
        reason: row.issues?.[0]?.code || null,
        prompt: clean(question?.prompt).replace(/\s+/g, ' ').slice(0, 90),
      };
    });
  return record;
};

/** Every lesson file, measured; totals; and the questions without Recovery grouped by shape, most first. */
export const measureRecoveryCoverage = ({ root = repoRoot, files = null, preflight = false, gradeSample = serverRecoveryKeyCheck, families = null } = {}) => {
  const lessons = (files || recoveryCoverageLessonFiles(root)).map((file) => {
    try {
      const assignment = lessonAssignmentForCoverage(readFileSync(path.join(root, file), 'utf8'), { preflight });
      return measureLessonRecovery({ file, assignment, gradeSample, families });
    } catch (error) {
      return { file, error: clean(error?.message) || 'could not be read' };
    }
  });
  const totals = {};
  RECOVERY_SECTIONS_WITH_CONTENT.forEach((section) => {
    const measured = lessons.filter((lesson) => lesson[section]);
    totals[section] = {
      questions: measured.reduce((sum, lesson) => sum + lesson[section].questions, 0),
      now: measured.reduce((sum, lesson) => sum + lesson[section].now, 0),
      prepared: measured.reduce((sum, lesson) => sum + lesson[section].prepared, 0),
      lessonsWithSection: measured.filter((lesson) => lesson[section].questions > 0).length,
      lessonsReady: measured.filter((lesson) => lesson[section].status === 'ready').length,
    };
  });
  const shapes = new Map();
  lessons.forEach((lesson) => list(lesson.withoutRecovery).forEach((question) => {
    const entry = shapes.get(question.shape) || { shape: question.shape, questions: 0, lessons: new Set() };
    entry.questions += 1;
    entry.lessons.add(lesson.file);
    shapes.set(question.shape, entry);
  }));
  const withoutRecoveryByShape = [...shapes.values()]
    .map((entry) => ({ shape: entry.shape, questions: entry.questions, lessons: entry.lessons.size }))
    .sort((a, b) => b.questions - a.questions || b.lessons - a.lessons || a.shape.localeCompare(b.shape));
  return { lessons, totals, withoutRecoveryByShape };
};

const cell = ({ questions, prepared, status }) => (questions ? `${prepared}/${questions} ${status}` : '—');

/** The report a person reads. */
export const renderRecoveryCoverageText = (report) => {
  const lines = ['Recovery coverage — Warm-Up and DOL questions with Recovery once prepared (prepared/questions, section status)', ''];
  const width = Math.max(...report.lessons.map((lesson) => lesson.file.length));
  report.lessons.forEach((lesson) => {
    if (lesson.error) {
      lines.push(`${lesson.file.padEnd(width)}  not read: ${lesson.error}`);
      return;
    }
    lines.push(`${lesson.file.padEnd(width)}  Warm-Up ${cell(lesson.warmup).padEnd(16)}  DOL ${cell(lesson.dol)}`);
  });
  lines.push('');
  RECOVERY_SECTIONS_WITH_CONTENT.forEach((section) => {
    const total = report.totals[section];
    lines.push(`${section === 'dol' ? 'DOL' : 'Warm-Up'}: ${total.prepared} of ${total.questions} questions have Recovery once prepared (${total.now} with nothing prepared); ${total.lessonsReady} of ${total.lessonsWithSection} lessons ready.`);
  });
  lines.push('', 'Without Recovery, by shape:');
  report.withoutRecoveryByShape.forEach((entry) => {
    lines.push(`  ${String(entry.questions).padStart(3)}  ${entry.shape}  (${entry.lessons} lesson${entry.lessons === 1 ? '' : 's'})`);
  });
  lines.push('', 'Each question without Recovery:');
  report.lessons.forEach((lesson) => list(lesson.withoutRecovery).forEach((question) => {
    lines.push(`  ${lesson.file.split('/').pop()}  ${question.label}  ${question.shape}  ${question.reason || ''}  "${question.prompt}"`);
  }));
  return `${lines.join('\n')}\n`;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !['--json', '--preflight'].includes(arg));
  if (unknown.length) {
    console.error(`Unknown option ${unknown[0]}. Usage: node scripts/recovery-coverage-report.mjs [--json] [--preflight]`);
    process.exit(2);
  }
  const report = measureRecoveryCoverage({ preflight: args.includes('--preflight') });
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : renderRecoveryCoverageText(report));
  process.exit(report.lessons.some((lesson) => lesson.error) ? 1 : 0);
}
