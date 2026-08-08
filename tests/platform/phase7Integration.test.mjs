import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  buildHonorsEnrichmentQuestion,
  defaultCourseProfiles,
  deriveDomainReadiness,
  inspectHonorsRigor,
  normalizeCourseProfiles,
  resolveAdaptiveRigor,
  summarizeRigorSequence,
  splitClassPeriodsByRigor,
} from '../../src/platform/rigor/courseRigor.js';
import { createDemoSeed, DEMO_STORAGE_KEY } from '../../src/demo/demoExperienceData.js';

const require = createRequire(import.meta.url);
const serverRigor = require('../../functions/lib/rigorPolicy.js');
const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../../src/TeacherSidebar.jsx', import.meta.url), 'utf8');
const adminUiSource = readFileSync(new URL('../../src/SignInAccess.jsx', import.meta.url), 'utf8');
const librarySource = readFileSync(new URL('../../src/AssignmentLibrary.jsx', import.meta.url), 'utf8');
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const firestoreRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('course rigor is class-level and defaults safely to Standard', () => {
  const periods = ['Period 1', 'Period 2', 'Period 3'];
  const defaults = defaultCourseProfiles(periods);
  assert.equal(defaults['Period 1'].courseLevel, 'standard');
  const profiles = normalizeCourseProfiles({
    'Period 2': { course: 'algebra1', courseLevel: 'honors' },
    'Period 3': { course: 'algebra2', courseLevel: 'standard' },
  }, periods);
  assert.deepEqual(splitClassPeriodsByRigor(periods, profiles), {
    standard: ['Period 1', 'Period 3'],
    honors: ['Period 2'],
  });
  assert.equal(profiles['Period 3'].courseLabel, 'Algebra II');
});

test('Honors contract catches shallow imports and deterministic enrichment satisfies the missing depth/CCMR contract', () => {
  const source = [{ type: 'algebra', teks: ['A.5A'], dok: 1, prompt: 'Solve 3x + 4 = 40.', generator: { kind: 'linear' } }];
  const before = inspectHonorsRigor(source);
  assert.equal(before.isHonorsReady, false);
  assert.equal(before.checks.ccmrEnrichment, false);
  const enrichment = buildHonorsEnrichmentQuestion({ questions: source, course: 'algebra1' });
  assert.equal(enrichment.type, 'graphStory');
  assert.equal(enrichment.ccmr, true);
  assert.equal(enrichment.variants.length >= 2, true);
  const after = inspectHonorsRigor([...source, enrichment]);
  assert.equal(after.isHonorsReady, true);

  const narrowDol = inspectHonorsRigor([
    { type: 'algebra', activityRole: 'dol', teks: ['A.5A'], dok: 1, prompt: 'Solve 3x + 4 = 40.' },
    { type: 'algebra', activityRole: 'dol', teks: ['A.5A'], dok: 2, prompt: 'Check your solution.' },
  ], { allowNarrowCheckpoint: true });
  assert.equal(narrowDol.isHonorsReady, true);
  assert.equal(narrowDol.scope, 'narrowCheckpoint');

  const mix = summarizeRigorSequence([{ assignedClassPeriods: ['Period 2'], dueDate: '2026-08-08', questions: [
    { teks: ['A.5A'], prompt: 'Core' },
    { teks: ['A.5A'], prerequisite: true, prompt: 'Foundation' },
    { teks: ['A.5A'], ccmr: true, prompt: 'SAT model' },
  ] }], 'Period 2');
  assert.deepEqual(mix.counts, { core: 1, prerequisite: 1, ccmr: 1 });
  assert.deepEqual(mix.target, { core: 75, prerequisite: 10, ccmr: 15 });
});

test('advanced readiness is evidence-driven and remains distinct from Honors placement', () => {
  const mastery = {
    teks: {
      'A.3B': { score: 94, confidence: 'High', itemCount: 8, performance: { key: 'masters' }, courseId: 'algebra1' },
      'A.4A': { score: 91, confidence: 'High', itemCount: 6, performance: { key: 'masters' }, courseId: 'algebra1' },
    },
  };
  const domains = deriveDomainReadiness(mastery);
  assert.equal(domains.some((domain) => domain.readiness === 'advanced'), true);
  assert.equal(resolveAdaptiveRigor({ courseLevel: 'standard', readiness: 'advanced' }).mode, 'individualEnrichment');
  assert.equal(resolveAdaptiveRigor({ courseLevel: 'honors', readiness: 'developing' }).mode, 'honorsRepair');
});

test('secure My Math Path applies class rigor separately from target-TEKS evidence', () => {
  const advancedEvidence = { mastery: { estimate: 93, status: 'Mastered', confidence: 'High' }, dimensions: { eligibleGradeLevelEvents: 8 } };
  const developingEvidence = { mastery: { estimate: 58, status: 'Developing', confidence: 'Medium' }, dimensions: { eligibleGradeLevelEvents: 6 } };
  assert.equal(serverRigor.resolveAdaptiveRigor({ courseLevel: 'standard', profile: advancedEvidence }).preferredDifficultyBand, 4);
  const honorsRepair = serverRigor.resolveAdaptiveRigor({ courseLevel: 'honors', profile: developingEvidence });
  assert.equal(honorsRepair.mode, 'honorsRepair');
  assert.equal(honorsRepair.returnTargetBand, 4);
  const selected = serverRigor.nearestDifficultyCandidates([{ difficultyBand: 2 }, { difficultyBand: 4 }, { difficultyBand: 5 }], 4);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].difficultyBand, 4);
  assert.match(functionsSource, /studentMasteryProfiles/);
  assert.match(functionsSource, /settings"\)\.doc\("courseProfiles"\)/);
});

test('demo seed is populated, imperfect, resettable by design, and isolated from production collection names', () => {
  const seed = createDemoSeed();
  assert.equal(seed.classes.length, 4);
  assert.equal(seed.students.length >= 6, true);
  assert.equal(seed.assignments.length >= 10, true);
  assert.equal(seed.students.some((student) => student.id === 'morgan' && student.classId.includes('standard') && Object.values(student.domainReadiness).includes('advanced')), true);
  assert.equal(seed.students.some((student) => student.id === 'riley' && student.classId.includes('honors') && Object.values(student.domainReadiness).includes('developing')), true);
  assert.equal(seed.students.every((student) => student.mathPath.current && student.mathPath.history.length > 0), true);
  assert.equal(seed.classes.every((demoClass) => seed.students.some((student) => student.classId === demoClass.id)), true);
  assert.match(DEMO_STORAGE_KEY, /demoData/);
  assert.doesNotMatch(DEMO_STORAGE_KEY, /grades|studentMasteryProfiles/);
});

test('root Administration is visible only from the root-aware app and permanent deletion stays callable-only', () => {
  assert.match(appSource, /user\.isRootAdmin/);
  assert.match(appSource, /MathMaster Administration/);
  assert.match(adminUiSource, /Permanently delete/);
  assert.match(adminUiSource, /teacherAdmin\.permanentlyDeleteStudent/);
  const gradesBlock = firestoreRules.match(/match \/grades\/\{studentId\}[\s\S]*?match \/scratchpads/);
  assert.ok(gradesBlock);
  assert.match(gradesBlock[0], /allow delete: if false/);
  assert.match(firestoreRules, /match \/adminAuditLog\/\{docId\} \{ allow read, write: if false; \}/);
});

test('mixed Standard/Honors publication creates destination variants and keeps private lab definitions assignment-scoped', () => {
  assert.match(appSource, /rigorVariantGroupId/);
  assert.match(appSource, /honorsContractVersion/);
  assert.match(appSource, /destinationGroups/);
  assert.match(appSource, /labSuffix/);
  assert.match(appSource, /assignmentId: assignmentRef\.id/);
});

test('teacher navigation exposes Demo/Student Access and Library exposes remembered collapse state', () => {
  assert.match(sidebarSource, /Demo Experience/);
  assert.match(sidebarSource, /Student Access/);
  assert.match(appSource, /<DemoExperience \/>/);
  assert.match(librarySource, /folder-pane-collapsed/);
  assert.match(librarySource, /expanded-folders/);
  assert.match(librarySource, /Folder actions/);
});
