/*
 * "WHY RECOMMENDED" NAMES THE EVIDENCE (student push D, item 7).
 *
 * explainForStudent gives a verdict ("This is a good option right now").
 * explainRecommendationEvidence names what drove it — the score and how many
 * questions it rests on, the class unit, what it builds on that the student has
 * mastered, a teacher's priority — read from the engine row or the unified
 * profile it was built from. Never a question, an answer or a code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EVIDENCE_KIND, REASON, STATUS, explainRecommendationEvidence, getStudentPathOptions,
} from '../../src/platform/path/recommendationEngine.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildPathMap } from '../../src/platform/path/pathMap.js';
import { curateStudentPanel } from '../../src/platform/path/studentPanel.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { getMasteryStrands } from '../../src/platform/mastery/strandConfig.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { studentWithAssignmentWork } from './helpers/assignmentWork.mjs';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const texts = (items) => items.map((item) => item.text);

const row = (overrides = {}) => ({
  skillId: teksSkillId('A.3B'),
  status: STATUS.AVAILABLE,
  mastery: null,
  evidenceCount: 0,
  masteryStatus: null,
  masteredPrerequisites: [],
  supportingSkillGaps: [],
  unmetPrerequisites: [],
  remediationTarget: null,
  teacherPriority: false,
  calendarTiming: null,
  calendarDaysUntilStart: 0,
  reasons: [],
  scoreTerms: {},
  ...overrides,
});

test('the score is named with the number of questions it rests on', () => {
  const evidence = explainRecommendationEvidence(row({ mastery: 0.58, evidenceCount: 6, masteryStatus: 'Developing' }));
  assert.ok(texts(evidence).includes('Your score on this is 58% from 6 questions.'), texts(evidence).join(' | '));
  assert.equal(evidence.find((item) => item.kind === EVIDENCE_KIND.SCORE).text, 'Your score on this is 58% from 6 questions.');
  // One question is not yet a score under the shared rule (two events minimum).
  assert.ok(texts(explainRecommendationEvidence(row({ mastery: 1, evidenceCount: 1 }))).includes("You've answered 1 question on this so far."));
  // No evidence at all is said plainly, not dressed up as a recommendation.
  assert.ok(texts(explainRecommendationEvidence(row())).includes("You haven't practised this yet."));
  // A Mastered verdict leads, with its numbers.
  const mastered = explainRecommendationEvidence(row({
    status: STATUS.MASTERED, mastery: 0.91, evidenceCount: 8, masteryStatus: 'Mastered',
    skillId: teksSkillId('A.3A'), calendarTiming: 'current', reasons: [REASON.ALIGNED_CURRENT],
  }));
  assert.equal(mastered[0].text, "You've mastered this: 91% from 8 questions.", 'ahead of the class position');
  assert.equal(mastered[1].kind, EVIDENCE_KIND.CLASS);
});

test('the unified profile wins, so the card matches the skill card the student opens', () => {
  const [profile] = Object.values(buildUnifiedMasteryProfiles({ serverProfiles: {
    'A.3B': { mastery: { estimate: 64 }, accumulator: { eligibleEvents: 9, effectiveWeight: 9, independentSuccesses: 2 }, dimensions: { dokRepresented: [2] } },
  } }));
  const evidence = explainRecommendationEvidence(row({ mastery: 0.58, evidenceCount: 6 }), profile);
  assert.ok(texts(evidence).includes('Your score on this is 64% from 9 questions.'), texts(evidence).join(' | '));
  // An empty profile falls back to the row rather than claiming "not practised".
  assert.ok(texts(explainRecommendationEvidence(row({ mastery: 0.58, evidenceCount: 6 }), {})).includes('Your score on this is 58% from 6 questions.'));
});

test('the class position names the district unit — but only beside a real calendar', () => {
  const current = explainRecommendationEvidence(row({ skillId: teksSkillId('A.3A'), calendarTiming: 'current', reasons: [REASON.ALIGNED_CURRENT] }));
  assert.ok(texts(current).includes('Your class is working on this now (Module 2: Exploring Constant Rate of Change).'), texts(current).join(' | '));
  const early = explainRecommendationEvidence(row({ skillId: teksSkillId('A.5A'), calendarTiming: 'upcoming', calendarDaysUntilStart: 6 }));
  assert.ok(texts(early).includes("You're ready early — your class reaches this in 6 days (Module 3: Modeling Linear Equations and Inequalities)."));
  const review = explainRecommendationEvidence(row({ skillId: teksSkillId('A.12A'), calendarTiming: 'review', reasons: [REASON.REVIEW_WINDOW] }));
  assert.ok(texts(review).includes('Your class covered this earlier (Module 1: Searching for Patterns).'));
  // The provisional spread has no calendarTiming: naming a district unit there
  // would present a guess as the class's position.
  const provisional = explainRecommendationEvidence(row({ skillId: teksSkillId('A.3A'), reasons: [REASON.ALIGNED_CURRENT] }));
  assert.ok(texts(provisional).includes('Your class is working on this now.'));
  assert.ok(!texts(provisional).some((text) => /Module/.test(text)));
});

test('what it builds on is named when the student has mastered it', () => {
  const evidence = explainRecommendationEvidence(row({
    calendarTiming: 'current', reasons: [REASON.ALIGNED_CURRENT],
    masteredPrerequisites: [teksSkillId('8.4B'), teksSkillId('8.4C')],
  }));
  assert.ok(texts(evidence).includes("Builds on Graphing proportional relationships and Rate of change from a table or graph, which you've mastered."), texts(evidence).join(' | '));
  // A challenge says what earned it.
  const challenge = explainRecommendationEvidence(row({ status: STATUS.EXTENSION, masteredPrerequisites: [teksSkillId('A.3A')] }));
  assert.equal(challenge[0].text, "A challenge: it builds on Finding slope, which you've mastered.");
  assert.equal(challenge[0].kind, EVIDENCE_KIND.PREREQUISITE);
  // A remediation row names the repair first.
  const remediation = explainRecommendationEvidence(row({ status: STATUS.REMEDIATION, remediationTarget: teksSkillId('A.3A') }));
  assert.equal(remediation[0].text, 'It builds on Finding slope — strengthening that first will make this easier.');
});

test('a teacher\'s decision leads', () => {
  const priority = explainRecommendationEvidence(row({ teacherPriority: true, reasons: [REASON.TEACHER_PRIORITY], mastery: 0.5, evidenceCount: 4 }));
  assert.equal(priority[0].text, 'Your teacher marked this as a priority.');
  assert.equal(priority[0].kind, EVIDENCE_KIND.TEACHER);
  const required = explainRecommendationEvidence(row({ status: STATUS.REQUIRED }));
  assert.equal(required[0].text, 'Your teacher assigned this.');
});

test('the term that moved the ranking comes first', () => {
  const base = { calendarTiming: 'review', reasons: [REASON.REVIEW_WINDOW], mastery: 0.48, evidenceCount: 5, skillId: teksSkillId('A.12A') };
  const gap = explainRecommendationEvidence(row({ ...base, scoreTerms: { learningGap: 0.14 } }));
  assert.equal(gap[0].kind, EVIDENCE_KIND.SCORE, 'a low recent score is its own ranking term, so it leads');
  const timing = explainRecommendationEvidence(row({ ...base, scoreTerms: { learningGap: 0 } }));
  assert.equal(timing[0].kind, EVIDENCE_KIND.CLASS, 'otherwise the class position put it in front of them');
});

test('engine rows carry the evidence they were decided on', () => {
  const server = {
    'A.3A': { mastery: { estimate: 58 }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 2 }, dimensions: { dokRepresented: [1, 2] } },
    '8.4A': { mastery: { estimate: 92 }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 }, dimensions: { dokRepresented: [2, 3] } },
  };
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', serverMasteryProfiles: server, nowValue: NOW });
  const rows = Object.values(options).filter(Array.isArray).flat();
  const slope = rows.find((entry) => entry.skillId === teksSkillId('A.3A'));
  assert.equal(slope.evidenceCount, 6);
  assert.equal(slope.masteryStatus, 'Developing');
  assert.ok(slope.masteredPrerequisites.includes(teksSkillId('8.4A')), 'a mastered prerequisite is reported');
  assert.ok(!slope.masteredPrerequisites.includes(teksSkillId('8.4C')), 'one with no evidence is not claimed as mastered');
  const evidence = explainRecommendationEvidence(slope);
  assert.ok(texts(evidence).includes('Your score on this is 58% from 6 questions.'));
  assert.ok(texts(evidence).includes('Your class covered this earlier (Module 2: Exploring Constant Rate of Change).'));
  assert.ok(texts(explainRecommendationEvidence(slope, null, { limit: 6 })).some((text) => text.startsWith('Builds on Slope from similar triangles')));
});

test('Recommended cards and map cards carry the named evidence', () => {
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', nowValue: NOW });
  const panel = curateStudentPanel(options);
  const cards = [panel.best, ...panel.choices].filter(Boolean);
  assert.ok(cards.length);
  const rows = Object.values(options).filter(Array.isArray).flat();
  cards.forEach((card) => {
    const source = rows.find((entry) => entry.skillId === card.skillId);
    assert.deepEqual(card.evidence, explainRecommendationEvidence(source), `${card.skillId}: the card's evidence is the engine row's`);
    assert.ok(card.evidence.length > 0);
  });
  const map = buildPathMap(options);
  [...map.focus, ...map.branches].forEach((node) => {
    const source = rows.find((entry) => entry.skillId === node.skillId);
    assert.deepEqual(node.evidence, explainRecommendationEvidence(source));
  });
  // With the unified profiles the map cards quote the same numbers as the wheel.
  const profiles = buildUnifiedMasteryProfiles({ serverProfiles: {
    'A.2E': { mastery: { estimate: 73 }, accumulator: { eligibleEvents: 7, effectiveWeight: 7, independentSuccesses: 2 }, dimensions: { dokRepresented: [2] } },
  } });
  const withProfiles = buildPathMap(options, { masteryProfilesByTEKS: profiles });
  const node = [...withProfiles.focus, ...withProfiles.branches].find((entry) => entry.skillId === teksSkillId('A.2E'));
  assert.ok(node, 'A.2E is current in October');
  assert.ok(texts(node.evidence).includes('Your score on this is 73% from 7 questions.'), texts(node.evidence).join(' | '));
});

test('a Strengthen card for a severe gap names what it opens', () => {
  const server = { 'A.5A': { mastery: { estimate: 15 }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 0 }, dimensions: { dokRepresented: [1] } } };
  // The gap is in the assignment record too: Path evidence alone never locks.
  const work = studentWithAssignmentWork({ 'A.5A': [0, 0, 0, 0, 0, 0] });
  const options = buildStudentPathOptions({ ...work, courseId: 'algebra1', serverMasteryProfiles: server, nowValue: NOW });
  const panel = curateStudentPanel({ ...options, remediation: [] });
  assert.ok(panel.strengthen, 'a severe gap must produce a repair card');
  assert.equal(panel.strengthen.skillId, teksSkillId('A.5A'));
  assert.match(panel.strengthen.evidence[0].text, /^Strengthening this opens .+, which builds on it\.$/);
  assert.ok(texts(panel.strengthen.evidence).includes('Your score on this is 15% from 6 questions.'));
});

test('evidence is plain language: no codes, no reason codes, no answers', () => {
  const options = getStudentPathOptions({ courseId: 'algebra1', masteryBySkill: { [teksSkillId('A.3A')]: { mastery: 0.4, attempts: 5 } } });
  const all = Object.values(options).filter(Array.isArray).flat();
  all.forEach((entry) => explainRecommendationEvidence(entry, null, { limit: 9 }).forEach((item) => {
    assert.doesNotMatch(item.text, /\b(?:A|A2|[678])\.\d+[A-Z]?\b/, `code leaked: ${item.text}`);
    assert.doesNotMatch(item.text, /_/, `reason code leaked: ${item.text}`);
    assert.ok(Object.values(EVIDENCE_KIND).includes(item.kind));
  }));
  // It reads the row and the mastery profile — never an item, an answer or a
  // solution — so it cannot reveal one.
  const engine = executableSource(readFileSync(new URL('../../src/platform/path/recommendationEngine.js', import.meta.url), 'utf8'));
  const evidence = region(engine, 'export const EVIDENCE_KIND', 'export const resolveRemediationSkill', 'evidence explanation');
  // (Property reads only: "You've answered 3 questions" is a sentence, not data.)
  assert.doesNotMatch(evidence, /\.(?:answers?|solutions?|correct\w*|accepted\w*|worked\w*|stimulus)\b|questionInstance|questionSnapshot/);
  assert.deepEqual(explainRecommendationEvidence(null), []);
  assert.equal(explainRecommendationEvidence(row({ mastery: 0.5, evidenceCount: 4, calendarTiming: 'current', reasons: [REASON.ALIGNED_CURRENT, REASON.ASSIGNMENT_RELEVANCE], masteredPrerequisites: [teksSkillId('8.4A')] }), null, { limit: 2 }).length, 2);
});

// --- Item 7.4: grade 6-8 topics are named, not catalogued -------------------------

test('grade 6-8 strand titles are student-facing topic names, with no TEKS reference', () => {
  ['grade6', 'grade7', 'grade8'].forEach((courseId) => {
    const strands = getMasteryStrands(courseId);
    assert.ok(strands.length >= 10, `${courseId} keeps every strand`);
    const titles = strands.map((strand) => strand.title);
    titles.forEach((title) => {
      assert.doesNotMatch(title, /TEKS/i, `${courseId}: "${title}" is a catalogue reference`);
      assert.doesNotMatch(title, /\b[678]\.\d+/, `${courseId}: "${title}" names a code`);
      assert.doesNotMatch(title, /^Grade \d/, `${courseId}: "${title}" is the course, not the topic`);
      assert.ok(title.length >= 6);
    });
    assert.equal(new Set(titles).size, titles.length, `${courseId}: two strands share a name`);
    // Ids still carry the section, so nothing keyed on a strand moves.
    strands.forEach((strand) => assert.match(strand.id, new RegExp(`^${courseId}_strand_\\d+$`)));
  });
  assert.equal(getMasteryStrands('grade8').find((strand) => strand.codes.includes('8.4A')).title, 'Slope and rate of change');
});

// Exactly what updateMyMathPathMasteryFromEvidence writes after six answers on
// an adjusted version (an IEP modification): the rule gives them no weight.
const adjustedOnly = (adjusted = 6, counted = 0) => ({
  mastery: { estimate: counted ? 80 : null },
  accumulator: { eligibleEvents: counted, effectiveWeight: counted, independentSuccesses: counted, modifiedEvents: adjusted },
  dimensions: { eligibleGradeLevelEvents: counted, modifiedEvidenceEvents: adjusted, dokRepresented: counted ? [2] : [] },
});

test('a student who practised only with adjusted questions is never told they have not practised', () => {
  const serverMasteryProfiles = { 'A.2E': adjustedOnly(6) };
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', serverMasteryProfiles, nowValue: NOW });
  const rows = Object.values(options).filter(Array.isArray).flat();
  const source = rows.find((entry) => entry.skillId === teksSkillId('A.2E'));
  assert.ok(source, 'A.2E is part of the course');
  assert.equal(source.modifiedEvidenceCount, 6, 'the row carries the adjusted answers');
  assert.equal(source.evidenceCount, 0, 'and the engine still counts none of them');
  const expected = "You've practised this with 6 adjusted questions. Your score here comes from questions that are not adjusted, so it is not set yet.";

  // The engine row alone (Recommended cards on Home), the map with the unified
  // profiles, and the topic browser all say the same true thing.
  const fromRow = texts(explainRecommendationEvidence(source));
  assert.ok(fromRow.includes(expected), fromRow.join(' | '));
  const profiles = buildUnifiedMasteryProfiles({ serverProfiles: serverMasteryProfiles });
  const fromProfile = texts(explainRecommendationEvidence(source, profiles['A.2E']));
  assert.ok(fromProfile.includes(expected), fromProfile.join(' | '));
  // The profile alone is enough, for a caller holding a row the engine made
  // without the student's server profiles.
  const profileOnly = texts(explainRecommendationEvidence(row({ skillId: teksSkillId('A.2E') }), profiles['A.2E']));
  assert.ok(profileOnly.includes(expected), profileOnly.join(' | '));
  const panel = curateStudentPanel(options);
  const map = buildPathMap(options, { masteryProfilesByTEKS: profiles });
  const shown = [
    ...[panel.best, panel.strengthen, panel.challenge, ...panel.choices].filter(Boolean),
    ...map.focus, ...map.branches, ...map.comingUp, ...map.needsSupport, ...map.challenge,
  ].filter((card) => card.skillId === teksSkillId('A.2E'));
  assert.ok(shown.length, 'A.2E is on a screen in October');
  shown.forEach((card) => {
    const lines = texts(card.evidence || []);
    assert.equal(lines.includes("You haven't practised this yet."), false, lines.join(' | '));
    assert.ok(lines.includes(expected), lines.join(' | '));
  });
  // Students read "adjusted", never the teacher's word for it.
  [...fromRow, ...fromProfile].forEach((line) => assert.doesNotMatch(line, /modif|IEP|504/i));
});

test('adjusted answers count as answered, beside the ones that count toward the score', () => {
  const mixed = { 'A.2E': adjustedOnly(5, 1) };
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', serverMasteryProfiles: mixed, nowValue: NOW });
  const source = Object.values(options).filter(Array.isArray).flat().find((entry) => entry.skillId === teksSkillId('A.2E'));
  const profiles = buildUnifiedMasteryProfiles({ serverProfiles: mixed });
  assert.ok(texts(explainRecommendationEvidence(source, profiles['A.2E'])).includes("You've answered 6 questions on this so far."));
  // A skill with no answers at all still says so plainly.
  assert.ok(texts(explainRecommendationEvidence(row())).includes("You haven't practised this yet."));
  // And a student with no adjusted answers gets rows exactly as the engine made them.
  const plain = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', nowValue: NOW });
  assert.equal(Object.values(plain).filter(Array.isArray).flat().some((entry) => 'modifiedEvidenceCount' in entry), false);
});
