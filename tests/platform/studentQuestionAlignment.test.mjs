import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildQuestionAlignmentInfo,
  questionAssessmentFramework,
} from '../../src/platform/student/questionAlignmentInfo.js';
import { normalizeQuestionStandards } from '../../src/questionMetadata.js';

const engineSource = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const pathSource = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');
const badgeSource = readFileSync(new URL('../../src/components/common/StandardBadge.jsx', import.meta.url), 'utf8');
const toolShellSource = readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8');
const secureExamAdapter = readFileSync(new URL('../../src/components/assessment/SecureExamQuestionPlayer.jsx', import.meta.url), 'utf8');
// The secure exam renders through the shared Rich Question Runtime.
const secureExamSource = readFileSync(new URL('../../src/components/question/RichQuestionRuntime.jsx', import.meta.url), 'utf8');

test('Assignment V5 singular standard fields survive runtime metadata normalization', () => {
  const direct = normalizeQuestionStandards({
    standard: 'A.12C',
    secondaryStandards: ['A.12A'],
    prerequisiteStandards: ['8.5I'],
  });
  assert.deepEqual(direct.primary.map((entry) => entry.code), ['A.12C']);
  assert.deepEqual(direct.secondary.map((entry) => entry.code), ['A.12A']);
  assert.deepEqual(direct.prerequisite.map((entry) => entry.code), ['8.5I']);

  const primaryStandard = normalizeQuestionStandards({ primaryStandard: 'A.12D' });
  assert.deepEqual(primaryStandard.primary.map((entry) => entry.code), ['A.12D']);

  const info = buildQuestionAlignmentInfo({ code: direct.primary[0].code });
  assert.equal(info.displayCode, 'A.12C');
  assert.equal(info.connections.some((entry) => entry.framework === 'digitalSAT'), true);
});

test('ordinary aligned questions expose TEKS meaning and CCMR connections without claiming exam style', () => {
  const info = buildQuestionAlignmentInfo({ code: 'A.2B' });
  assert.equal(info.displayCode, 'A.2B');
  assert.match(info.description, /linear equations/i);
  assert.equal(info.studentLabel, 'Writing linear equations from a point and slope');
  assert.equal(info.isExamStyle, false);
  assert.equal(info.activeFramework, null);
  assert.equal(info.connections.length, 4);
  assert.equal(info.connections.some((entry) => entry.framework === 'digitalSAT' && entry.domainId === 'algebra'), true);
});

test('direct exam-style questions identify the active framework and assessment domain', () => {
  const info = buildQuestionAlignmentInfo({ code: 'A.2B', framework: 'digitalSAT', examStyle: true });
  assert.equal(info.isExamStyle, true);
  assert.equal(info.activeFramework, 'digitalSAT');
  assert.equal(info.activeFrameworkLabel, 'Digital SAT');
  const active = info.connections.find((entry) => entry.active);
  assert.equal(active.domainId, 'algebra');
  assert.equal(active.domainTitle, 'Algebra');
});

test('direct audited CCMR items use their authored SAT skill family instead of a broad TEKS inference', () => {
  const info = buildQuestionAlignmentInfo({
    code: 'A2.2A',
    framework: 'digitalSAT',
    domainId: 'advancedMath',
    examStyle: true,
    assessmentSkillLabel: 'nonlinear functions',
  });
  assert.equal(info.activeSkillLabel, 'Nonlinear functions');
  const active = info.connections.find((entry) => entry.active);
  assert.equal(active.references[0]?.title, 'Nonlinear functions');
});

test('partial crosswalks expose the allowed overlap instead of implying the whole TEKS is tested', () => {
  const info = buildQuestionAlignmentInfo({ code: 'A.2A', framework: 'asvab', examStyle: true });
  const asvab = info.connections.find((entry) => entry.framework === 'asvab');
  assert.equal(asvab.coverage, 'partial');
  assert.equal(asvab.allowedAspects.length > 0, true);
  assert.equal(asvab.excludedAspects.length > 0, true);
});


test('direct exam-style display uses the item authored domain when a TEKS maps to several domains', () => {
  // Grade 6-8 TEKS are intentionally excluded from direct Digital SAT evidence
  // in the V2.1 scope correction. Use a high-school TEKS that legitimately maps
  // to more than one SAT domain so this test exercises the authored-domain
  // override without contradicting the current assessment scope policy.
  const defaultInfo = buildQuestionAlignmentInfo({ code: 'A.9B', framework: 'digitalSAT', examStyle: true });
  const defaultActive = defaultInfo.connections.find((entry) => entry.active);
  assert.equal(defaultActive.domainId, 'advancedMath');

  const info = buildQuestionAlignmentInfo({ code: 'A.9B', framework: 'digitalSAT', domainId: 'problemSolvingData', examStyle: true });
  const active = info.connections.find((entry) => entry.active);
  assert.equal(active.domainId, 'problemSolvingData');
  assert.equal(active.domainTitle, 'Problem-Solving and Data Analysis');
});
test('assessment style label requires direct framework/domain alignment for authored assignment questions', () => {
  const fake = questionAssessmentFramework({
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
    alignments: [{ framework: 'teks', code: 'A.2B', primary: true }],
  });
  assert.deepEqual(fake, { framework: null, domainId: '', examStyle: false });

  const direct = questionAssessmentFramework({
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
    alignments: [
      { framework: 'teks', code: 'A.2B', primary: true },
      { framework: 'digitalSAT', domainId: 'algebra', alignmentType: 'direct' },
    ],
  });
  assert.deepEqual(direct, { framework: 'digitalSAT', domainId: 'algebra', examStyle: true });

  // A secure framework Path session is already server-filtered to a direct bank,
  // so its explicit session context can supply the visible framework label.
  const securePath = questionAssessmentFramework({}, { framework: 'act', examStyle: true });
  assert.deepEqual(securePath, { framework: 'act', domainId: '', examStyle: true });
});

test('student UI has one alignment owner per question and the details are clickable', () => {
  assert.match(engineSource, /showStandardBadge = true/);
  assert.match(engineSource, /showStandardBadge && questionStandardCode/);
  assert.match(engineSource, /assessmentSkillLabel=\{processedQuestion\?\.ccmrAuthenticLanguage\?\.officialSkillFamily/);
  assert.match(badgeSource, /info\.activeSkillLabel/);
  assert.match(pathSource, /showStandardBadge=\{false\}/);
  assert.match(pathSource, /<StandardBadge[^>]*framework=\{directFramework\}/s);
  assert.doesNotMatch(toolShellSource, /StandardBadge/);
  assert.doesNotMatch(toolShellSource, /Skill focus/);
  assert.match(badgeSource, /role="dialog"/);
  assert.match(badgeSource, /What you are learning/);
  assert.match(badgeSource, /Where this math shows up/);
  assert.match(badgeSource, /The skill to remember/);
  assert.match(badgeSource, /Texas learning target/);
  assert.match(badgeSource, /This is still a course-practice question/);
  assert.match(badgeSource, /You are practicing this in \{info\.activeFrameworkLabel\} format right now/);
  assert.match(badgeSource, /CCMR connection/);
  assert.match(badgeSource, /Calculator available throughout math/);
  assert.match(badgeSource, /event\.key === 'Escape'/);
  assert.match(badgeSource, /autoFocus aria-label="Close standards details"/);
});

test('secure exam mode withholds instructional metadata that could cue the assessed domain', () => {
  assert.match(secureExamAdapter, /<RichQuestionRuntime\b/);
  assert.match(secureExamSource, /policy\.secure && <div style=\{[^}]*\}>Secure exam question<\/div>/);
  assert.match(secureExamSource, /showStandardBadge=\{false\}/);
  assert.doesNotMatch(secureExamSource, /DOK \{question\.dok/);
  // It never renders or imports the badge (`showStandardBadge={false}`, which
  // turns the engine's off, is the opposite of rendering one).
  assert.doesNotMatch(secureExamSource, /<StandardBadge\b|import StandardBadge/);
  assert.doesNotMatch(secureExamSource, /CCMR connection/);
});

/*
 * A STUDENT READS "LEARNING GOAL", NOT A REPORTING CODE (student UX pass, R-10).
 *
 * The assignment question showed "TEKS A.3B ›" and "CCMR connection · 4
 * assessments ›" under every task — two codes a student cannot act on, and a
 * second line of a phone's task panel. The student audience shows one chip in
 * plain words that opens the SAME dialog, where the TEKS code (named as the
 * teacher's reporting code) and the SAT/ACT/TSIA2/ASVAB connections still are.
 */
test('the assignment question shows students one plain-language chip that opens everything', () => {
  const chipRow = badgeSource.slice(badgeSource.indexOf('className="mathmaster-question-alignment"'), badgeSource.indexOf('{open && <AlignmentDetailsDialog'));
  // Student: "Learning goal", no reporting codes on the chip row.
  assert.match(chipRow, /\{studentView \? \(\s*<button ref=\{triggerRef\}[^>]*onClick=\{\(\) => openDetails\('skill'\)\}[^>]*>Learning goal <span aria-hidden="true">›<\/span><\/button>/);
  assert.match(chipRow, /\{!studentView && !info\.activeFramework && connectionCount > 0 && \(/, 'the passive CCMR chip is not on the student row');
  assert.match(chipRow, /\{info\.activeFramework && \(/, 'an exam-format practice chip still shows — it tells the student the format');
  // Teacher and Path surfaces keep the codes.
  assert.match(chipRow, />TEKS \{info\.displayCode\} <span aria-hidden="true">›<\/span><\/button>/);
  assert.match(badgeSource, /audience = 'teacher'/, 'the codes remain the default');
  // Nothing is lost: the dialog still names the code and offers the connections.
  assert.match(badgeSource, /TEKS \{info\.displayCode\} is the teacher\/reporting code for this skill/);
  assert.match(badgeSource, /See where this math appears after this course/);
  // The assignment runtime is the student audience, except for a teacher repairing a question.
  const panel = engineSource.slice(engineSource.indexOf('const questionAlignmentPanel'), engineSource.indexOf('const questionReferencePanel'));
  assert.match(panel, /audience=\{executionScope === 'teacherRepairPreview' \? 'teacher' : 'student'\}/);
});
