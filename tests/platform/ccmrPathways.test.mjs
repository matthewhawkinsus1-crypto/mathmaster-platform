import test from 'node:test';
import assert from 'node:assert/strict';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { staticMapProvider } from '../../src/platform/path/curriculumPacing.js';
import { normalizeAssessmentContext, normalizeQuestionAlignments } from '../../src/platform/contract/alignments.js';
import {
  ASSESSMENT_FRAMEWORKS, FRAMEWORK_SCOPE_EXCLUSIONS,
  getDirectAlignmentIndex, getSkillCrosswalk, resolveAlignment,
} from '../../src/platform/ccmr/assessmentCrosswalk.js';
import { asvabExclusionReason } from '../../src/platform/assessment/teksExamCrosswalk.js';
import { runCcmrCoverageAudit } from '../../src/platform/ccmr/ccmrCoverageAudit.js';
import {
  EVIDENCE_BASIS, buildAssessmentEvidence, getEvidence, hasPractised, withSimulatedEvidence,
} from '../../src/platform/ccmr/assessmentEvidence.js';
import {
  CCMR_REASON, READINESS,
  getAssessmentPathOptions, getAssessmentRecommendations,
} from '../../src/platform/ccmr/assessmentPathways.js';
import { describeItemAuthenticity, getAssessmentProfile, listAssessmentProfiles } from '../../src/platform/ccmr/assessmentProfiles.js';

const evidenceEntry = (mastery) => ({ mastery, attempts: 12, recentAccuracy: mastery, evidenceStrength: 1 });

const pathFor = (masteryBySkill = {}) => getStudentPathOptions({
  courseId: 'algebra1',
  masteryBySkill,
  pacing: { currentWindow: 1, windowCount: 1 },
  pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
});

const directIndexFor = (assignments) => getDirectAlignmentIndex(assignments, {
  normalizeAlignments: (question) => normalizeQuestionAlignments(question, { includeCrosswalks: false }),
  normalizeContext: normalizeAssessmentContext,
});

// An SAT-style item about A.5A, plus the student's record for it.
const satAssignment = (correctCount, total = 5) => ({
  id: 'sat-1',
  title: 'SAT practice',
  questions: Array.from({ length: total }, (unused, index) => ({
    questionId: `sat-q${index}`,
    type: 'algebra',
    prompt: 'SAT-style linear equation',
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
    alignments: [
      { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
      { framework: 'digitalSAT', domainId: 'algebra', role: 'secondary', evidenceMode: 'direct' },
    ],
  })),
  _records: Array.from({ length: total }, (unused, index) => ({
    status: index < correctCount ? 'correct' : 'incorrect',
    totalAttempts: 3,
    attemptCount: 3,
    bestPartialCredit: 0,
    lastAttemptAt: '2026-09-01T10:00:00.000Z',
  })),
});

const studentWith = (assignment) => ({
  id: 'student-1',
  gradesByAssignment: { [assignment.id]: Object.fromEntries(assignment._records.map((record, index) => [index, record])) },
});

// ---------------------------------------------------------------------------
// 9A — the audit, and the honesty rules it enforces
// ---------------------------------------------------------------------------

test('every course now has crosswalk coverage, and the audit clears the UI gate', () => {
  const audit = runCcmrCoverageAudit();
  assert.equal(audit.totals.skills, 237);
  ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2'].forEach((courseId) => {
    const course = audit.courses.find((entry) => entry.courseId === courseId);
    assert.ok(course.coveredSkillCount > 0, `${courseId} must have coverage now that the crosswalk is authored`);
  });
  assert.equal(audit.readyForStudentUi, true, 'no course is left uncovered');
  assert.ok(!audit.findings.some((finding) => finding.code === 'course_has_no_alignment'));
  // The exclusions stay flagged: the mechanism is approved, the code list is not.
  assert.ok(audit.findings.some((finding) => finding.code === 'authored_scope_exclusion'));
});

test('the crosswalk says no where the mathematics says no', () => {
  const audit = runCcmrCoverageAudit();
  // Consumer-finance standards are not mathematics content on any of the four.
  ['6.14D', '7.13C', '8.12F'].forEach((code) => {
    assert.equal(Object.keys(getSkillCrosswalk(code).frameworks).length, 0, `${code} must map to nothing`);
  });
  // No framework claims every standard in every course.
  const overclaiming = audit.courses.flatMap((course) => ASSESSMENT_FRAMEWORKS
    .filter((framework) => {
      const counts = course.byFramework[framework];
      return counts.crosswalk + counts.directCapable === course.skillCount;
    })
    .map((framework) => `${course.courseId}/${framework}`));
  assert.ok(!overclaiming.includes('grade6/asvab'), 'the ASVAB must not claim all of grade 6');
  assert.ok(!overclaiming.includes('algebra2/asvab'), 'the ASVAB must not claim all of Algebra II');
});

test('a standard may map to several domains of the same framework', () => {
  // Rate of change of a linear function is SAT Algebra and SAT Problem-Solving
  // and Data Analysis at the same time, and the crosswalk must be able to say so.
  //
  // This used 7.4C. CCMR V2.1 stopped treating grade 6-8 TEKS as direct SAT
  // evidence — College Board's Texas report aligns middle school to PSAT 8/9,
  // not the SAT — so 7.4C now correctly offers no SAT pathway at all and could
  // not demonstrate multi-domain mapping. A.3B is in scope and maps to the same
  // pair.
  const sat = getSkillCrosswalk('A.3B').frameworks.digitalSAT;
  assert.deepEqual(sat.domainIds, ['algebra', 'problemSolvingData']);
  // And the middle-school exclusion itself is the behaviour, not an accident.
  assert.equal(getSkillCrosswalk('7.4C').frameworks.digitalSAT, undefined);
});

// Test 2 — no fake alignment
test('Test 2 — a skill outside a framework\'s scope offers no pathway', () => {
  // A.9E is "write exponential functions that fit data using technology". The
  // ASVAB has no calculator and does not test regression.
  const excluded = FRAMEWORK_SCOPE_EXCLUSIONS.asvab.codes;
  assert.ok(excluded.includes('A.9E'));
  assert.equal(getSkillCrosswalk('A.9E').frameworks.asvab, undefined);

  const options = getAssessmentPathOptions({
    skillId: teksSkillId('A.9E'),
    pathOptions: pathFor({ [teksSkillId('A.9E')]: evidenceEntry(0.95) }),
  });
  const asvab = options.pathways.find((entry) => entry.framework === 'asvab');
  assert.equal(asvab.available, false);
  assert.ok(asvab.reasonCodes.includes(CCMR_REASON.NO_ALIGNMENT));
  assert.ok(asvab.reasonCodes.includes(CCMR_REASON.NO_ASVAB_ALIGNMENT));
  assert.ok(!options.availablePathways.some((entry) => entry.framework === 'asvab'));
});

// Test 1 — legitimate branching
test('Test 1 — a skill offers exactly the frameworks it is aligned to', () => {
  const options = getAssessmentPathOptions({
    skillId: teksSkillId('A.9D'),
    pathOptions: pathFor({ [teksSkillId('A.9D')]: evidenceEntry(0.9) }),
  });
  const available = options.availablePathways.map((entry) => entry.framework).sort();
  assert.deepEqual(available, ['act', 'digitalSAT', 'tsia2']);
  assert.ok(!available.includes('asvab'), 'graphing exponential functions is not ASVAB content');
});

// Test 3 — mastered skills stay branchable
test('Test 3 — course mastery opens transfer rather than closing the skill', () => {
  const skillId = teksSkillId('A.5A');
  const options = getAssessmentPathOptions({
    skillId,
    pathOptions: pathFor({ [skillId]: evidenceEntry(0.95) }),
  });
  assert.equal(options.masteredAndBranchable, true, 'the core engine calls this mastered');
  assert.ok(options.availablePathways.length >= 3, 'a mastered skill must still offer CCMR branches');
  options.availablePathways.forEach((entry) => {
    assert.notEqual(entry.status, READINESS.NOT_AVAILABLE);
  });
});

// Test 4 — core skill not ready
test('Test 4 — a missing hard prerequisite keeps CCMR practice closed', () => {
  const skillId = teksSkillId('A.5C');
  const options = getAssessmentPathOptions({
    skillId,
    // A.5A is a hard prerequisite of A.5C, and it is severely weak.
    pathOptions: pathFor({ [teksSkillId('A.5A')]: evidenceEntry(0.1) }),
  });
  assert.equal(options.coreReady, false);
  assert.equal(options.availablePathways.length, 0);
  options.pathways.forEach((entry) => {
    if (entry.reasonCodes.includes(CCMR_REASON.NO_ALIGNMENT)) return;
    assert.ok(entry.reasonCodes.includes(CCMR_REASON.CORE_NOT_READY), `${entry.framework} should cite the core gap`);
  });
});

// Test 5 — transfer gap
test('Test 5 — strong core plus weak SAT evidence is a transfer gap, and is recommended', () => {
  const skillId = teksSkillId('A.5A');
  const assignment = satAssignment(1, 5);
  const evidence = buildAssessmentEvidence({ student: studentWith(assignment), assignments: [assignment] });
  const entry = getEvidence(evidence, skillId, 'digitalSAT');
  assert.equal(entry.basis, EVIDENCE_BASIS.DIRECT);
  assert.equal(entry.directItemsAttempted, 5);
  assert.ok(entry.proficiency < 0.3);

  const recommendations = getAssessmentRecommendations({
    framework: 'digitalSAT',
    pathOptions: pathFor({ [skillId]: evidenceEntry(0.95) }),
    assessmentEvidence: evidence,
    directIndex: directIndexFor([assignment]),
  });
  const row = recommendations.recommended.find((item) => item.skillId === skillId);
  assert.ok(row, 'the transfer gap must surface in the recommended bucket');
  assert.equal(row.status, READINESS.TRANSFER_GAP);
  assert.ok(row.reasons.includes(CCMR_REASON.TRANSFER_GAP));
  assert.ok(row.reasons.includes(CCMR_REASON.CONTEXT_BELOW_CORE));
  assert.equal(recommendations.summary.transferGaps, 1);
});

// Test 6 — not practised is not zero
test('Test 6 — an unpractised framework reports not_practiced, never 0%', () => {
  const skillId = teksSkillId('A.5A');
  const options = getAssessmentPathOptions({
    skillId,
    pathOptions: pathFor({ [skillId]: evidenceEntry(0.95) }),
  });
  const act = options.pathways.find((entry) => entry.framework === 'act');
  assert.equal(act.available, true);
  assert.equal(act.practised, false);
  assert.equal(act.proficiency, null, 'proficiency must be null, not 0');
  assert.equal(act.status, READINESS.NOT_PRACTICED);
  assert.ok(act.reasonCodes.includes(CCMR_REASON.NOT_PRACTISED));
});

// Test 7 — framework switching
test('Test 7 — switching frameworks leaves core mastery and the other context alone', () => {
  const skillId = teksSkillId('A.5A');
  const assignment = satAssignment(1, 5);
  const evidence = buildAssessmentEvidence({ student: studentWith(assignment), assignments: [assignment] });
  const pathOptions = pathFor({ [skillId]: evidenceEntry(0.95) });

  const sat = getAssessmentRecommendations({ framework: 'digitalSAT', pathOptions, assessmentEvidence: evidence });
  const act = getAssessmentRecommendations({ framework: 'act', pathOptions, assessmentEvidence: evidence });

  const satRow = [...sat.recommended, ...sat.strengthen, ...sat.available].find((item) => item.skillId === skillId);
  const actRow = [...act.recommended, ...act.strengthen, ...act.available].find((item) => item.skillId === skillId);
  assert.equal(satRow.coreMastery, actRow.coreMastery, 'core mastery is one number across frameworks');
  assert.ok(satRow.assessmentProficiency < 0.3);
  assert.equal(actRow.assessmentProficiency, null, 'ACT context evidence is untouched by SAT practice');
});

// Test 8 — direct vs crosswalk preserved
test('Test 8 — evidence records keep the alignment type they came from', () => {
  const skillId = teksSkillId('A.5A');
  const direct = satAssignment(5, 5);
  const course = {
    id: 'course-1',
    questions: [{
      questionId: 'c1',
      type: 'algebra',
      prompt: 'Ordinary course item',
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
    _records: [{ status: 'correct', totalAttempts: 1, attemptCount: 1, bestPartialCredit: 0 }],
  };
  const student = {
    id: 's',
    gradesByAssignment: {
      [direct.id]: Object.fromEntries(direct._records.map((record, index) => [index, record])),
      [course.id]: { 0: course._records[0] },
    },
  };
  const evidence = buildAssessmentEvidence({ student, assignments: [direct, course] });

  const sat = getEvidence(evidence, skillId, 'digitalSAT');
  assert.equal(sat.directItemsAttempted, 5);
  // The ordinary item crosswalks to SAT too — it is counted, and kept apart.
  assert.equal(sat.crosswalkItemsAttempted, 1);
  assert.equal(sat.basis, EVIDENCE_BASIS.DIRECT);
  // The five SAT items were all correct and the course item was too, but what
  // matters is that proficiency is computed from the direct items alone. Mixing
  // course performance into an SAT score is exactly what hides a transfer gap.
  assert.equal(sat.proficiency, 1);

  // The ordinary course item crosswalks to the other frameworks, and is marked
  // as the weaker evidence it is.
  const act = getEvidence(evidence, skillId, 'act');
  assert.equal(act.directItemsAttempted, 0);
  assert.equal(act.crosswalkItemsAttempted, 1);
  assert.equal(act.basis, EVIDENCE_BASIS.CROSSWALK);
  assert.equal(act.provisional, true);
  assert.equal(hasPractised(act), false, 'crosswalk evidence is not assessment practice');
});

test('crosswalk-derived proficiency never claims a transfer gap', () => {
  const skillId = teksSkillId('A.5A');
  // A course item answered badly: core mastery high but crosswalk proficiency
  // low. Comparing those would be comparing course performance to itself.
  const course = {
    id: 'course-2',
    questions: [{
      questionId: 'c1',
      type: 'algebra',
      prompt: 'Ordinary course item',
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  };
  const student = { id: 's', gradesByAssignment: { 'course-2': { 0: { status: 'incorrect', totalAttempts: 3, attemptCount: 3, bestPartialCredit: 0 } } } };
  const evidence = buildAssessmentEvidence({ student, assignments: [course] });
  const recommendations = getAssessmentRecommendations({
    framework: 'act',
    pathOptions: pathFor({ [skillId]: evidenceEntry(0.95) }),
    assessmentEvidence: evidence,
  });
  const row = [...recommendations.recommended, ...recommendations.strengthen, ...recommendations.available, ...recommendations.challenge]
    .find((item) => item.skillId === skillId);
  assert.notEqual(row.status, READINESS.TRANSFER_GAP);
  assert.equal(row.evidenceBasis, EVIDENCE_BASIS.CROSSWALK);
});

// Test 9 — course evidence safety
test('Test 9 — one wrong assessment item does not demolish established core mastery', () => {
  const skillId = teksSkillId('A.5A');
  const before = pathFor({ [skillId]: evidenceEntry(0.92) });
  const assignment = satAssignment(0, 1);
  const evidence = buildAssessmentEvidence({ student: studentWith(assignment), assignments: [assignment] });

  // The CCMR layer reads core mastery; it never writes it.
  const options = getAssessmentPathOptions({ skillId, pathOptions: before, assessmentEvidence: evidence });
  assert.equal(options.coreMastery, 0.92, 'core mastery is unchanged by assessment-context evidence');
  const sat = options.pathways.find((entry) => entry.framework === 'digitalSAT');
  assert.equal(sat.proficiency, 0, 'the assessment context records the miss');
  assert.ok(sat.reasonCodes.includes(CCMR_REASON.LOW_EVIDENCE), 'and marks it as thin evidence');
});

// Test 10 — teacher priority
test('Test 10 — teacher priority raises weighting without hiding other frameworks', () => {
  const skillId = teksSkillId('A.5A');
  const pathOptions = pathFor({ [skillId]: evidenceEntry(0.95) });
  const plain = getAssessmentPathOptions({ skillId, pathOptions });
  const focused = getAssessmentPathOptions({ skillId, pathOptions, teacherPriorities: ['tsia2'] });

  const scoreOf = (result, framework) => result.pathways.find((entry) => entry.framework === framework).score;
  assert.ok(scoreOf(focused, 'tsia2') > scoreOf(plain, 'tsia2'), 'the prioritised framework ranks higher');
  assert.equal(scoreOf(focused, 'digitalSAT'), scoreOf(plain, 'digitalSAT'), 'the others are untouched');
  assert.equal(focused.availablePathways.length, plain.availablePathways.length, 'nothing is hidden');
  assert.ok(focused.pathways.find((entry) => entry.framework === 'tsia2').reasonCodes.includes(CCMR_REASON.TEACHER_PRIORITY));
});

// Test 11 — student goals
test('Test 11 — student goals raise weighting for every framework selected', () => {
  const skillId = teksSkillId('A.5A');
  const pathOptions = pathFor({ [skillId]: evidenceEntry(0.95) });
  const plain = getAssessmentPathOptions({ skillId, pathOptions });
  const withGoals = getAssessmentPathOptions({ skillId, pathOptions, goals: ['digitalSAT', 'act'] });

  const scoreOf = (result, framework) => result.pathways.find((entry) => entry.framework === framework).score;
  ['digitalSAT', 'act'].forEach((framework) => {
    assert.ok(scoreOf(withGoals, framework) > scoreOf(plain, framework), `${framework} should be weighted up`);
    assert.ok(withGoals.pathways.find((entry) => entry.framework === framework).reasonCodes.includes(CCMR_REASON.GOAL_SELECTED));
  });
  assert.equal(scoreOf(withGoals, 'tsia2'), scoreOf(plain, 'tsia2'), 'unselected frameworks keep their weighting');
  assert.ok(withGoals.availablePathways.some((entry) => entry.framework === 'tsia2'), 'and stay available');
});

// Test 12 — simulated/demo evidence isolation
test('Test 12 — simulated assessment evidence is a separate map, not a write-back', () => {
  const skillId = teksSkillId('A.5A');
  const real = buildAssessmentEvidence({ student: { id: 's', gradesByAssignment: {} }, assignments: [] });
  const simulated = withSimulatedEvidence(real, { skillId, framework: 'digitalSAT', proficiency: 0.4 });
  assert.equal(getEvidence(real, skillId, 'digitalSAT'), null, 'the real map is untouched');
  assert.equal(getEvidence(simulated, skillId, 'digitalSAT').proficiency, 0.4);
  assert.equal(getEvidence(simulated, skillId, 'digitalSAT').basis, EVIDENCE_BASIS.DIRECT);
});

// ---------------------------------------------------------------------------
// Profiles and labelling
// ---------------------------------------------------------------------------

test('every framework has a profile built from real policy data', () => {
  const profiles = listAssessmentProfiles();
  assert.equal(profiles.length, ASSESSMENT_FRAMEWORKS.length);
  profiles.forEach((profile) => {
    assert.ok(profile.displayName);
    assert.ok(profile.domains.length > 0);
    assert.ok(profile.calculatorPolicy);
    assert.equal(profile.itemSpecification, null, 'no invented item specifications');
    assert.equal(profile.directAlignmentRequiredForAuthenticLabel, true);
  });
  // The profiles must actually differ, or "the same skill feels different"
  // cannot be true.
  assert.notEqual(getAssessmentProfile('digitalSAT').calculatorPolicy, getAssessmentProfile('asvab').calculatorPolicy);
  assert.equal(getAssessmentProfile('tsia2').pacingMode, 'untimed');
  assert.equal(getAssessmentProfile('act').pacingMode, 'timed');
});

test('a crosswalk-derived item is never labelled authentic', () => {
  const authentic = describeItemAuthenticity({ framework: 'digitalSAT', alignmentType: 'direct' });
  assert.equal(authentic.authentic, true);
  assert.match(authentic.studentLabel, /Digital SAT-Style Practice/);
  assert.match(authentic.teacherLabel, /Alignment: Direct/);

  const derived = describeItemAuthenticity({ framework: 'digitalSAT', alignmentType: 'crosswalk' });
  assert.equal(derived.authentic, false);
  assert.ok(!derived.studentLabel.includes('Style'), 'no false authenticity claim to the student');
  assert.match(derived.teacherLabel, /Crosswalk-derived practice/);
});

test('a directly authored item makes a skill direct-capable', () => {
  const assignment = satAssignment(3, 3);
  const index = directIndexFor([assignment]);
  const alignment = resolveAlignment({ skillId: teksSkillId('A.5A'), framework: 'digitalSAT', directIndex: index });
  assert.equal(alignment.alignmentType, 'direct');
  assert.equal(alignment.directCapable, true);
  // Another framework on the same skill stays a crosswalk.
  const act = resolveAlignment({ skillId: teksSkillId('A.5A'), framework: 'act', directIndex: index });
  assert.equal(act.alignmentType, 'crosswalk');
});

test('no CCMR skill id is ever minted — pathways reuse canonical skills', () => {
  const recommendations = getAssessmentRecommendations({
    framework: 'digitalSAT',
    pathOptions: pathFor({}),
  });
  const all = [...recommendations.recommended, ...recommendations.strengthen, ...recommendations.available,
    ...recommendations.challenge, ...recommendations.unavailable];
  assert.ok(all.length > 0);
  all.forEach((item) => {
    assert.ok(item.skillId.startsWith('teks:'), `${item.skillId} is not a canonical skill id`);
    assert.ok(!item.skillId.includes('sat.') && !item.skillId.includes('act.'));
  });
});

// ---------------------------------------------------------------------------
// Partial ASVAB coverage — a TEKS broader than the slice the exam can reach
// ---------------------------------------------------------------------------

test('a broad standard can be partially in scope rather than all-or-nothing', () => {
  // A.7A is graphing and analysing quadratics. Zeros, intercepts, the vertex
  // and the axis of symmetry are conventional Mathematics Knowledge; the
  // transformation analysis in the same standard is not. Excluding the whole
  // standard would have been wrong about half of it.
  const asvab = getSkillCrosswalk('A.7A').frameworks.asvab;
  assert.ok(asvab, 'A.7A must no longer be excluded outright');
  assert.equal(asvab.coverage, 'partial');
  assert.ok(asvab.allowedAspects.includes('vertex'));
  assert.ok(asvab.excludedAspects.includes('advanced transformation analysis'));
  assert.equal(asvab.domainId, 'mathematicsKnowledge');
});

test('a partial alignment still opens the pathway', () => {
  const options = getAssessmentPathOptions({
    skillId: teksSkillId('A.7A'),
    pathOptions: pathFor({ [teksSkillId('A.7A')]: evidenceEntry(0.9) }),
  });
  const asvab = options.pathways.find((entry) => entry.framework === 'asvab');
  assert.equal(asvab.available, true, 'partial coverage is real coverage');
  assert.ok(!asvab.reasonCodes.includes(CCMR_REASON.NO_ASVAB_ALIGNMENT));
});

test('full coverage is still distinguishable from partial', () => {
  // Solving quadratic equations is squarely Mathematics Knowledge, whole.
  assert.equal(getSkillCrosswalk('A2.4F').frameworks.asvab.coverage, 'full');
  assert.equal(getSkillCrosswalk('A.7A').frameworks.asvab.coverage, 'partial');
});

test('the codes kept excluded on review stay excluded', () => {
  ['A.3D', 'A.3G', 'A.3H', 'A.6B', 'A.6C'].forEach((code) => {
    assert.equal(getSkillCrosswalk(code).frameworks.asvab, undefined, `${code} must stay excluded`);
  });
});

test('Algebra II is no longer excluded down to three standards', () => {
  const audit = runCcmrCoverageAudit();
  const algebra2 = audit.courses.find((course) => course.courseId === 'algebra2');
  const asvab = algebra2.byFramework.asvab;
  const mapped = asvab.crosswalk + asvab.partial + asvab.directCapable;
  assert.ok(mapped >= 12, `expected meaningful ASVAB coverage in Algebra II, got ${mapped}`);
  // Factoring, polynomial division, radicals and ordinary equation solving.
  ['A2.7D', 'A2.7E', 'A2.7C', 'A2.7F', 'A2.7H', 'A2.6E', 'A2.6I'].forEach((code) => {
    assert.ok(getSkillCrosswalk(code).frameworks.asvab, `${code} should have an ASVAB slice`);
  });
  // But the advanced function-family work stays out.
  ['A2.2B', 'A2.5C', 'A2.5D', 'A2.6K', 'A2.8B'].forEach((code) => {
    assert.equal(getSkillCrosswalk(code).frameworks.asvab, undefined, `${code} must stay excluded`);
  });
});

test('every ASVAB exclusion carries a reason', () => {
  const unexplained = FRAMEWORK_SCOPE_EXCLUSIONS.asvab.codes
    .filter((code) => !asvabExclusionReason(code).key);
  assert.deepEqual(unexplained, [], 'an exclusion without a recorded reason cannot be reviewed');
});

test('the exclusion list is derived, so it cannot drift from the table', () => {
  const derived = FRAMEWORK_SCOPE_EXCLUSIONS.asvab.codes;
  derived.forEach((code) => {
    assert.equal(getSkillCrosswalk(code).frameworks.asvab, undefined,
      `${code} is listed as excluded but the table still maps it`);
  });
  // And nothing mapped is on the list.
  ['A.5A', 'A2.4F', 'A.7A'].forEach((code) => {
    assert.ok(!derived.includes(code), `${code} is mapped and must not appear in the exclusion list`);
  });
});
