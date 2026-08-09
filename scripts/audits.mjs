#!/usr/bin/env node
// The three audit artifacts Batch 9 requires before student CCMR branching:
//
//   1. CCMR crosswalk coverage, by course and framework.
//   2. Prerequisite graph audit — hard/soft/reinforcement, orphans, flat skills.
//   3. Instructional-calendar validation — module starts and their computed
//      five-instructional-day early-open dates.
//
// Run with:  node scripts/audits.mjs
// Exits non-zero if any audit fails, so it can gate a deploy.

import { ALL_TEXAS_MATH_STANDARDS } from '../src/texasStandards.js';
import { runCcmrCoverageAudit } from '../src/platform/ccmr/ccmrCoverageAudit.js';
import { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, FRAMEWORK_SCOPE_EXCLUSIONS } from '../src/platform/ccmr/assessmentCrosswalk.js';
import { getSkillGraph, hardPrerequisitesOf, teksCodeFromSkillId } from '../src/platform/path/skillGraph.js';
import { listCourseEdges } from '../src/platform/path/coursePrerequisites.js';
import { validateAllGraphs } from '../src/platform/path/graphValidation.js';
import { STRENGTH } from '../src/platform/path/prerequisiteStrength.js';
import { loadCalendar, isInstructionalDay, toDayKey, countInstructionalDaysBetween } from '../src/platform/path/curriculumCalendar.js';
import ALGEBRA1 from '../src/curriculum/calendars/algebra1-2026-2027.js';
import ALGEBRA2 from '../src/curriculum/calendars/algebra2Honors-2026-2027.js';
import { SCHOOL_YEAR_2026_27 } from '../src/curriculum/calendars/schoolYear2026-2027.js';

const pad = (value, width) => String(value).padEnd(width);
const rule = (char = '─') => console.log(char.repeat(78));
let failures = 0;

const heading = (text) => { console.log(''); rule('═'); console.log(text); rule('═'); };

// ---------------------------------------------------------------------------
heading('AUDIT 1 — CCMR crosswalk coverage');

const coverage = runCcmrCoverageAudit();
console.log(pad('course', 11) + pad('skills', 8) + ASSESSMENT_FRAMEWORKS.map((f) => pad(FRAMEWORK_LABELS[f], 14)).join(''));
rule();
coverage.courses.forEach((course) => {
  const cells = ASSESSMENT_FRAMEWORKS.map((framework) => {
    const counts = course.byFramework[framework];
    const mapped = counts.crosswalk + counts.directCapable;
    return pad(`${mapped}/${course.skillCount}`, 14);
  });
  console.log(pad(course.courseId, 11) + pad(course.skillCount, 8) + cells.join(''));
});
console.log('');
console.log(`Total content standards: ${coverage.totals.skills}. With at least one alignment: ${coverage.totals.covered}.`);
console.log('Process standards are excluded from CCMR content mapping by design.');

const uncovered = coverage.courses.flatMap((course) => course.rows.filter((row) => !row.anyCoverage));
if (uncovered.length) {
  console.log('');
  console.log(`Standards intentionally mapped to nothing (${uncovered.length}):`);
  uncovered.forEach((row) => console.log(`  ${pad(row.code, 8)} ${row.title.slice(0, 62)}`));
}

console.log('');
console.log('Findings:');
coverage.findings.forEach((finding) => console.log(`  [${finding.severity}] ${finding.message}`));
if (!coverage.findings.length) console.log('  none');

if (!coverage.readyForStudentUi) {
  console.log('');
  console.log('RESULT: coverage audit does NOT clear student CCMR branching.');
  failures += 1;
} else {
  console.log('');
  console.log('RESULT: coverage audit clears student CCMR branching.');
}

console.log('');
console.log(`ASVAB exclusions PENDING REVIEW (${FRAMEWORK_SCOPE_EXCLUSIONS.asvab.codes.length} codes):`);
const excludedByCourse = new Map();
FRAMEWORK_SCOPE_EXCLUSIONS.asvab.codes.forEach((code) => {
  const courseId = ALL_TEXAS_MATH_STANDARDS.find((standard) => standard.code === code)?.courseId || 'unknown';
  if (!excludedByCourse.has(courseId)) excludedByCourse.set(courseId, []);
  excludedByCourse.get(courseId).push(code);
});
[...excludedByCourse.entries()].forEach(([courseId, codes]) => {
  console.log(`  ${pad(courseId, 11)} ${codes.join(', ')}`);
});

// ---------------------------------------------------------------------------
heading('AUDIT 2 — prerequisite graph');

const graphResult = validateAllGraphs();
['algebra1', 'algebra2'].forEach((courseId) => {
  const edges = listCourseEdges(courseId);
  const byStrength = {
    [STRENGTH.HARD]: edges.filter((edge) => edge.strength === STRENGTH.HARD).length,
    [STRENGTH.SOFT]: edges.filter((edge) => edge.strength === STRENGTH.SOFT).length,
    [STRENGTH.REINFORCEMENT]: edges.filter((edge) => edge.strength === STRENGTH.REINFORCEMENT).length,
  };
  const graph = getSkillGraph(courseId);
  // A "flat" skill has no prerequisite of any kind and nothing depends on it —
  // reachable, but disconnected from the rest of the course.
  const dependedOn = new Set(edges.map((edge) => edge.from));
  const flat = graph.filter((skill) => {
    const code = teksCodeFromSkillId(skill.skillId);
    const withinCourse = edges.some((edge) => edge.to === code);
    return !withinCourse && !dependedOn.has(code);
  });

  console.log('');
  console.log(`${courseId}: ${graph.length} skills, ${edges.length} within-course edges`);
  console.log(`  hard ${byStrength.hard}   soft ${byStrength.soft}   reinforcement ${byStrength.reinforcement}`);
  console.log(`  skills with a hard prerequisite: ${graph.filter((skill) => hardPrerequisitesOf(skill).length).length}`);
  console.log(`  skills with no within-course edge either way: ${flat.length}`);
  if (flat.length) console.log(`    ${flat.map((skill) => teksCodeFromSkillId(skill.skillId)).join(', ')}`);
});

console.log('');
console.log('Validation:');
graphResult.courses.forEach((course) => {
  console.log(`  ${pad(course.courseId, 11)} errors ${course.errors.length}, warnings ${course.warnings.length}`);
  course.issues.forEach((issue) => console.log(`    [${issue.severity}] ${issue.message}`));
});
console.log(`  vertical overrides: ${graphResult.vertical.length} issue(s)`);
graphResult.vertical.forEach((issue) => console.log(`    [${issue.severity}] ${issue.message}`));

if (!graphResult.ok) { console.log('\nRESULT: prerequisite graph audit FAILED.'); failures += 1; }
else console.log('\nRESULT: prerequisite graph audit passed.');

// ---------------------------------------------------------------------------
heading('AUDIT 3 — instructional calendar and five-day early open');

const loaded1 = loadCalendar(ALGEBRA1);
const loaded2 = loadCalendar(ALGEBRA2);

console.log(`School year ${SCHOOL_YEAR_2026_27.startDate} → ${SCHOOL_YEAR_2026_27.endDate}`);
console.log(`Breaks: ${SCHOOL_YEAR_2026_27.breaks.length}   PD days: ${SCHOOL_YEAR_2026_27.nonInstructionDays.length}`);
const totalDays = countInstructionalDaysBetween(
  SCHOOL_YEAR_2026_27.startDate, SCHOOL_YEAR_2026_27.endDate, loaded1.nonInstructional,
);
console.log(`Instructional days in the student year: ${totalDays}`);

console.log('');
console.log('Closures must all be non-instructional:');
let calendarOk = true;
const mustBeClosed = [
  ...SCHOOL_YEAR_2026_27.breaks.map((entry) => [entry.start, entry.label]),
  ...SCHOOL_YEAR_2026_27.nonInstructionDays.map((day) => [day, 'Professional development']),
];
mustBeClosed.forEach(([day, label]) => {
  const open = isInstructionalDay(day, loaded1.nonInstructional);
  if (open) { calendarOk = false; console.log(`  FAIL ${day} ${label} is still counted as instructional`); }
});
if (calendarOk) console.log(`  all ${mustBeClosed.length} verified closed`);

console.log('');
console.log('Early-release and testing days must REMAIN instructional:');
SCHOOL_YEAR_2026_27.earlyReleaseDays.forEach((day) => {
  const open = isInstructionalDay(day, loaded1.nonInstructional);
  const inYear = day <= SCHOOL_YEAR_2026_27.endDate;
  if (!open && inYear) { calendarOk = false; console.log(`  FAIL ${day} early release was excluded`); }
});
if (calendarOk) console.log('  verified instructional');

const showWindows = (loaded, label) => {
  console.log('');
  console.log(`${label} — module/unit starts and their five-instructional-day early open:`);
  console.log('  ' + pad('curriculum id', 22) + pad('starts', 12) + pad('opens', 12) + 'gap');
  loaded.windows
    .filter((window) => ['module', 'unit'].includes(window.curriculumType) && window.startDate)
    .forEach((window) => {
      const opens = toDayKey(window.earlyOpenDate);
      const starts = toDayKey(window.startDate);
      const calendarGap = Math.round((window.startDate - window.earlyOpenDate) / 86400000);
      const instructionalGap = countInstructionalDaysBetween(window.earlyOpenDate, window.startDate, loaded.nonInstructional) - 1;
      const flag = window.earlyOpenInstructionalDays > 0 && instructionalGap !== window.earlyOpenInstructionalDays ? '  <-- CHECK' : '';
      if (flag) { calendarOk = false; }
      console.log(`  ${pad(window.curriculumId, 22)}${pad(starts, 12)}${pad(opens, 12)}${instructionalGap} instructional / ${calendarGap} calendar${flag}`);
    });
};
showWindows(loaded1, 'Algebra I');
showWindows(loaded2, 'Algebra II Honors');

if (!calendarOk) { console.log('\nRESULT: calendar audit FAILED.'); failures += 1; }
else console.log('\nRESULT: calendar audit passed.');

// ---------------------------------------------------------------------------
heading(failures ? `${failures} audit(s) did not pass` : 'All three audits passed');
process.exit(failures ? 1 : 0);
