import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildQuestionAlignmentInfo,
  questionAssessmentFramework,
} from '../../src/platform/student/questionAlignmentInfo.js';

const engineSource = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const pathSource = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');
const badgeSource = readFileSync(new URL('../../src/components/common/StandardBadge.jsx', import.meta.url), 'utf8');
const toolShellSource = readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8');
const secureExamSource = readFileSync(new URL('../../src/components/assessment/SecureExamQuestionPlayer.jsx', import.meta.url), 'utf8');

test('ordinary aligned questions expose TEKS meaning and CCMR connections without claiming exam style', () => {
  const info = buildQuestionAlignmentInfo({ code: 'A.2B' });
  assert.equal(info.displayCode, 'A.2B');
  assert.match(info.description, /linear equations/i);
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

test('partial crosswalks expose the allowed overlap instead of implying the whole TEKS is tested', () => {
  const info = buildQuestionAlignmentInfo({ code: 'A.2A', framework: 'asvab', examStyle: true });
  const asvab = info.connections.find((entry) => entry.framework === 'asvab');
  assert.equal(asvab.coverage, 'partial');
  assert.equal(asvab.allowedAspects.length > 0, true);
  assert.equal(asvab.excludedAspects.length > 0, true);
});


test('direct exam-style display uses the item authored domain when a TEKS maps to several domains', () => {
  const defaultInfo = buildQuestionAlignmentInfo({ code: '7.4C', framework: 'digitalSAT', examStyle: true });
  const defaultActive = defaultInfo.connections.find((entry) => entry.active);
  assert.equal(defaultActive.domainId, 'algebra');

  const info = buildQuestionAlignmentInfo({ code: '7.4C', framework: 'digitalSAT', domainId: 'problemSolvingData', examStyle: true });
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
  assert.match(pathSource, /showStandardBadge=\{false\}/);
  assert.match(pathSource, /<StandardBadge[^>]*framework=\{directFramework\}/s);
  assert.doesNotMatch(toolShellSource, /StandardBadge/);
  assert.doesNotMatch(toolShellSource, /Skill focus/);
  assert.match(badgeSource, /role="dialog"/);
  assert.match(badgeSource, /What this question is building/);
  assert.match(badgeSource, /This is a course question/);
  assert.match(badgeSource, /This is \{info\.activeFrameworkLabel\}-style practice/);
  assert.match(badgeSource, /CCMR connection/);
  assert.match(badgeSource, /event\.key === 'Escape'/);
  assert.match(badgeSource, /autoFocus aria-label="Close standards details"/);
});

test('secure exam mode withholds instructional metadata that could cue the assessed domain', () => {
  assert.match(secureExamSource, /Secure exam question/);
  assert.doesNotMatch(secureExamSource, /DOK \{question\.dok/);
  assert.doesNotMatch(secureExamSource, /StandardBadge/);
  assert.doesNotMatch(secureExamSource, /CCMR connection/);
});
