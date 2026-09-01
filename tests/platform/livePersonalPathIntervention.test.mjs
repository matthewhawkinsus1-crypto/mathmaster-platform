import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getStudentPathOptions, STATUS } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph } from '../../src/platform/path/skillGraph.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Live Class exposes a one-student current-TEKS Path recommendation, not a class-wide override', () => {
  const live = read('src/components/teacher/LiveClassMonitor.jsx');
  const app = read('src/App.jsx');

  assert.match(live, /Recommend \$\{live\.currentTeksCode\} in Path/);
  assert.match(live, /onRecommendPersonalPath/);
  assert.match(live, /pathInterventionBusyStudentId === row\.id/);
  assert.match(app, /currentTeksCode = getQuestionPrimaryTeksCodes/);
  assert.match(app, /setStudentPathIntervention\(\{/);
  assert.match(app, /durationHours: 48/);
  assert.match(app, /personal My Math Path priority for 48 hours/);
});

test('student Path reads the personal intervention after class-wide overrides so only that learner changes', () => {
  const app = read('src/App.jsx');
  const store = read('src/platform/path/pathStore.js');

  assert.match(app, /subscribeStudentPathIntervention/);
  assert.match(app, /const personal = interventionAsOverride\(studentPathIntervention\)/);
  assert.match(app, /\[\.\.\.classOverrides, personal\]/);
  assert.match(store, /STUDENT_PATH_INTERVENTION_COLLECTION = 'studentPathInterventions'/);
  assert.match(store, /action: 'recommend'/);
  assert.match(store, /expiresAt/);
});

test('server authorizes personal Path changes and keeps normal content/course safeguards', () => {
  const server = read('functions/index.js');
  const start = server.indexOf('exports.setStudentPathIntervention');
  const end = server.indexOf('/** Start or resume one server-owned learning-path session', start);
  assert.ok(start >= 0 && end > start);
  const block = server.slice(start, end);

  assert.match(block, /await requireTeacher\(request\)/);
  assert.match(block, /assignedTeacherEmail !== teacherEmail/);
  assert.match(block, /resolveSkillAnywhere/);
  assert.match(block, /skill\.courseId !== studentCourseId/);
  assert.match(block, /livePathSkillIsLaunchable/);
  assert.match(block, /durationHours = Math\.max\(1, Math\.min\(168/);
  assert.match(block, /studentPathInterventionAudit/);

  // Private teacher concern data belongs in studentSupportEvents, not in the
  // student-readable instructional record.
  const interventionObject = block.slice(
    block.indexOf('const intervention = {'),
    block.indexOf('await interventionRef.set', block.indexOf('const intervention = {')),
  );
  assert.doesNotMatch(interventionObject, /teacherEmail|note|concern|integrity/i);
});

test('a personal recommend never overrules a severe prerequisite gap', () => {
  const courseId = 'algebra1';
  const graph = getSkillGraph(courseId);
  const gated = graph.find((skill) => skill.prerequisites.some((edge) => edge.strength === 'hard'));
  assert.ok(gated, 'Algebra I should contain at least one genuinely gated skill');
  const hard = gated.prerequisites.find((edge) => edge.strength === 'hard');

  const result = getStudentPathOptions({
    courseId,
    masteryBySkill: {
      [hard.skillId]: { mastery: 0.05, attempts: 12, recentAccuracy: 0.1 },
    },
    teacherOverrides: [{
      skillId: gated.skillId,
      action: 'recommend',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }],
  });

  const row = result.locked.find((entry) => entry.skillId === gated.skillId);
  assert.ok(row);
  assert.equal(row.status, STATUS.LOCKED);
});

test('personal Path records are server-write-only and leave with the student lifecycle', () => {
  const rules = read('firestore.rules');
  const admin = read('functions/lib/admin.js');
  const server = read('functions/index.js');

  assert.match(rules, /match \/studentPathInterventions\/\{studentId\}/);
  assert.match(rules, /allow create, update, delete: if false/);
  assert.match(admin, /"studentPathInterventions"/);
  assert.match(admin, /"studentPathInterventionAudit"/);
  assert.match(server, /clear it on a roster\/teacher move/i);
  assert.match(server, /db\.collection\("studentPathInterventions"\)\.doc\(studentId\)/);
});
