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
const secureExamSource = readFileSync(new URL('../../src/components/assessment/SecureExamQuestionPlayer.jsx', import.meta.url), 'utf8');

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
  assert.match(secureExamSource, /Secure exam question/);
  assert.doesNotMatch(secureExamSource, /DOK \{question\.dok/);
  assert.doesNotMatch(secureExamSource, /StandardBadge/);
  assert.doesNotMatch(secureExamSource, /CCMR connection/);
});
