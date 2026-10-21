// THE STUDENT'S RECOVERY DECISIONS ARE NOT IN THE FIRST LOAD (Recovery V2).
//
// Deciding a Warm-Up or DOL Recovery runs the server's own rules
// (functions/shared/sectionRecoveryService.mjs): slot readiness, the
// assignment's certified Recovery content, the mastery gate over Recovery
// Practice and the assignment's own Practice. Recovery V2 made that larger,
// and imported by App it rode in front of every student's Home
// (scripts/check-first-load-budget.mjs). It now loads as the student Recovery
// kit (src/app/student/studentRecoveryKit.js) once a student is signed in, and
// every Recovery surface fills in when it arrives. What Home needs to SHOW and
// announce a list — phases, the toast, the "NEW" marks — stays, in
// src/platform/recovery/studentRecoveryNotices.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const appCode = executableSource(read('src/App.jsx'));
const graph = firstLoadGraph();

test('what Home shows a Recovery with stays in the first load, on purpose', () => {
  for (const file of [
    'src/app/student/studentRecoveryKitLoader.js',
    'src/platform/recovery/studentRecoveryNotices.js',
    'src/platform/student/recoveryStates.js',
    'src/components/student/RecoveryOpportunities.jsx',
  ]) assert.ok(graph.has(path.join(repo, file)), `${file} is no longer reached: the walk or the wiring changed`);
});

for (const [file, why] of [
  ['src/app/student/studentRecoveryKit.js', 'the kit loads for a student (app/student/studentRecoveryKitLoader.js)'],
  ['src/platform/recovery/studentRecoveryModel.js', 'the Results panel\'s summary is decided by the kit'],
  ['src/platform/recovery/studentRecoveryDiscovery.js', 'the Home list is decided by the kit'],
  ['src/platform/student/recoverySummaries.js', 'the dashboard\'s summaries are built by the kit'],
  ['functions/shared/sectionRecoveryService.mjs', 'the server\'s Recovery decision runs only inside the kit'],
  ['functions/shared/assignmentPracticeEvidence.mjs', 'the assignment-Practice evidence is part of that decision'],
  ['functions/shared/recoveryContentPlan.mjs', 'planning Recovery content is a teacher\'s (Pre-Flight, the assignment details)'],
  ['functions/shared/recoveryCertification.mjs', 'certifying a Recovery family is a teacher\'s and the server\'s'],
]) {
  test(`${path.basename(file)} is not in the first load: ${why}`, () => {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

test('the kit loads once, is handed out at once after that, and App uses exactly its members through it', async () => {
  const loader = await import('../../src/app/student/studentRecoveryKitLoader.js');
  assert.equal(loader.loadedStudentRecoveryKit(), null, 'nothing is loaded until a student asks');
  const first = loader.loadStudentRecoveryKit();
  assert.equal(loader.loadStudentRecoveryKit(), first, 'a second caller shares the first request');
  const kit = await first;
  assert.equal(loader.loadedStudentRecoveryKit(), kit);
  // The kit is the real decision, not a copy of it.
  const { buildStudentRecoverySummary } = await import('../../src/platform/recovery/studentRecoveryModel.js');
  const { buildStudentRecoveryDiscovery } = await import('../../src/platform/recovery/studentRecoveryDiscovery.js');
  assert.equal(kit.buildStudentRecoverySummary, buildStudentRecoverySummary);
  assert.equal(kit.buildStudentRecoveryDiscovery, buildStudentRecoveryDiscovery);
  const used = [...new Set([...appCode.matchAll(/studentRecoveryKit\.(\w+)\(/g)].map((match) => match[1]))].sort();
  assert.deepEqual(used, Object.keys(kit).sort(), 'App calls every kit member, and only through the kit');
  for (const name of used) {
    assert.doesNotMatch(appCode, new RegExp(`^import [^;]*\\b${name}\\b[^;]*;$`, 'm'), `App imports ${name} statically again`);
  }
});

test('App loads the kit for a student only, and never hands it to one who has left', () => {
  assert.match(appCode, /const \[studentRecoveryKit, setStudentRecoveryKit\] = useState\(loadedStudentRecoveryKit\);/);
  const effect = region(appCode, 'const [studentRecoveryKit, setStudentRecoveryKit] = useState(loadedStudentRecoveryKit);', '}, [user?.role, user?.id, studentRecoveryKit]);', 'student kit effect');
  assert.match(effect, /if \(user\?\.role !== 'student' \|\| studentRecoveryKit\) return undefined;/, 'only a student loads it');
  assert.match(effect, /let stopped = false;[\s\S]*loadStudentRecoveryKit\(\)\s*\.then\(\(kit\) => \{ if \(!stopped\) setStudentRecoveryKit\(kit\); \}\)/);
  assert.match(effect, /return \(\) => \{ stopped = true; \};/);
  // Every Recovery surface waits for it rather than guessing.
  assert.match(region(appCode, 'const studentRecoverySummary = useMemo(', '}, [recoveryAssignmentId', 'result summary'), /!studentRecoveryKit\) return \[\];/);
  assert.match(region(appCode, 'const studentRecoveryDiscovery = useMemo(', '\n  );\n', 'discovery'), /!studentRecoveryKit\) return NO_RECOVERY_OPPORTUNITIES;/);
});
