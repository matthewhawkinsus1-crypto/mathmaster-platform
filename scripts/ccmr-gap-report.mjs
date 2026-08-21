// Which CCMR standards a student cannot actually practise.
//
//   node scripts/ccmr-gap-report.mjs            # summary
//   node scripts/ccmr-gap-report.mjs --list     # every gap, by course
//   node scripts/ccmr-gap-report.mjs --json     # machine-readable
//
// TWO DIFFERENT THINGS GET CONFUSED HERE, so this reports them separately.
//
//   ALIGNMENT is whether the crosswalk says a standard appears on an exam.
//   That is a table, it is authored per standard, and it is nearly complete.
//
//   CONTENT is whether the secure bank holds a question the server would issue
//   for that standard. A pathway with alignment and no content sends a student
//   to a dead end — the CCMR hub offers it, and nothing comes back.
//
// And a third thing, which is the one that decides whether CCMR practice is
// really CCMR practice: whether any item declares `assessmentContext.framework`,
// i.e. was actually written in an exam's style. The authoring contract has
// supported that field all along. Nothing uses it yet, so every pathway today
// routes to an ordinary course question with an exam's name on the button.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runCcmrCoverageAudit } from '../src/platform/ccmr/ccmrCoverageAudit.js';
import { FRAMEWORK_LABELS, getSkillCrosswalk } from '../src/platform/ccmr/assessmentCrosswalk.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(here, '../functions/seeds/pathQuestionBank');

const showList = process.argv.includes('--list');
const asJson = process.argv.includes('--json');

// --- what the bank actually holds ---------------------------------------------

const bankByStandard = new Map();
let examStyleItems = 0;
let totalItems = 0;

for (const name of readdirSync(SEED_DIR).filter((entry) => entry.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
  for (const question of (Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []))) {
    totalItems += 1;
    const framework = question?.assessmentContext?.framework;
    if (framework && framework !== 'course') examStyleItems += 1;
    for (const key of (question.alignmentKeys || [])) {
      const code = String(key).replace(/^texas:/i, '').toUpperCase();
      bankByStandard.set(code, (bankByStandard.get(code) || 0) + 1);
    }
  }
}

// --- alignment against content -------------------------------------------------

const audit = runCcmrCoverageAudit({});
const courses = audit.courses.map((course) => {
  const rows = course.skills || course.rows || [];
  const aligned = [];
  for (const row of rows) {
    const code = String(row.code || row.teksCode || '').toUpperCase();
    if (!code) continue;
    const frameworks = Object.keys(getSkillCrosswalk(code).frameworks || {});
    if (!frameworks.length) continue;
    aligned.push({ code, frameworks, items: bankByStandard.get(code) || 0 });
  }
  return {
    courseId: course.courseId,
    aligned: aligned.length,
    withContent: aligned.filter((entry) => entry.items > 0).length,
    gaps: aligned.filter((entry) => entry.items === 0).map((entry) => entry.code),
  };
});

const totals = courses.reduce((carry, course) => ({
  aligned: carry.aligned + course.aligned,
  withContent: carry.withContent + course.withContent,
  gaps: carry.gaps + course.gaps.length,
}), { aligned: 0, withContent: 0, gaps: 0 });

const report = {
  generatedAt: new Date().toISOString(),
  bank: { totalItems, standardsCovered: bankByStandard.size, examStyleItems },
  crosswalk: audit.totals,
  totals,
  courses,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('CCMR readiness — alignment vs content\n');
console.log(`Crosswalk alignment : ${audit.totals.covered}/${audit.totals.skills} skills map to at least one assessment`);
console.log(`Bank                : ${totalItems} items covering ${bankByStandard.size} standards`);
console.log(`Exam-style items    : ${examStyleItems}`);
if (examStyleItems === 0) {
  console.log('                      ^ nothing declares assessmentContext.framework, so every CCMR');
  console.log('                        pathway currently serves an ordinary course question.');
}
console.log('\nCCMR-aligned standards that have a question in the bank:\n');
courses.forEach((course) => {
  const bar = course.aligned ? Math.round((course.withContent / course.aligned) * 20) : 0;
  console.log(
    `  ${course.courseId.padEnd(9)} ${String(course.withContent).padStart(3)}/${String(course.aligned).padEnd(3)}  ${'█'.repeat(bar)}${'·'.repeat(20 - bar)}`,
  );
});
console.log(`\n  TOTAL     ${totals.withContent}/${totals.aligned} — ${totals.gaps} aligned standards have no practice content.`);

if (showList) {
  courses.filter((course) => course.gaps.length).forEach((course) => {
    console.log(`\n${course.courseId} — ${course.gaps.length} with no content:`);
    console.log(`  ${course.gaps.join(', ')}`);
  });
} else if (totals.gaps) {
  console.log('\nRun with --list to see which standards.');
}

const frameworkNames = Object.values(FRAMEWORK_LABELS).join(', ');
console.log(`\nFrameworks: ${frameworkNames}.`);
console.log('Alignment is authored per standard in src/platform/assessment/teksExamCrosswalk.js.');
console.log('This report never fills a gap; it makes the hole visible so a human can.');
