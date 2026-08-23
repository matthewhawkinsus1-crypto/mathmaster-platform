import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { curateStudentPanel } from '../../src/platform/path/studentPanel.js';
import { teksCodeFromSkillId, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { recordQuestionAttempt } from '../../src/attemptPolicy.js';

const PACING = { currentWindow: 3, windowCount: 8, accelerationRadius: 1 };

const studentWith = (code, outcomes) => {
  const assignment = {
    id: 'a1',
    questions: outcomes.map(() => ({
      type: 'algebra', dok: 2,
      alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }],
    })),
  };
  const grades = {};
  outcomes.forEach((isCorrect, index) => {
    let record = recordQuestionAttempt({ record: null, isCorrect }).record;
    if (!isCorrect) {
      record = recordQuestionAttempt({ record, isCorrect: false }).record;
      record = recordQuestionAttempt({ record, isCorrect: false }).record;
    }
    grades[index] = record;
  });
  return { student: { id: 's1', gradesByAssignment: { a1: grades } }, assignments: [assignment] };
};

test('no saved pacing still produces an autonomous path', () => {
  const { student, assignments } = studentWith('A.5A', [true, true]);
  const options = buildStudentPathOptions({ student, assignments, pacing: null });
  assert.ok(options, 'missing teacher pacing must not turn My Math Path off');
  assert.equal(options.pacing?.pacingFramework, 'automatic');
  assert.ok([...options.required, ...options.recommended, ...options.available, ...options.remediation, ...options.future, ...options.locked].length > 0);

  const blank = buildStudentPathOptions();
  assert.ok(blank, 'a valid default course can still build a starter path');
  assert.equal(blank.pacing?.pacingFramework, 'automatic');
});

// A teacher's Open now / Recommend action must work even if they never touched
// curriculum pacing. This is the exact live regression that previously left a
// student on the "your teacher must set pacing" screen.
test('teacher unlocks work without a manual pacing record', () => {
  const { student, assignments } = studentWith('A.5A', [true, true]);
  const late = teksSkillId('A.9D');
  const options = buildStudentPathOptions({
    student,
    assignments,
    pacing: null,
    teacherOverrides: [{ skillId: late, action: 'recommend' }],
  });
  assert.equal(curateStudentPanel(options).best?.skillId, late);
});

test('one assembly serves both surfaces identically', () => {
  const { student, assignments } = studentWith('A.5A', [false, false, true, false]);
  const a = buildStudentPathOptions({ student, assignments, pacing: PACING });
  const b = buildStudentPathOptions({ student, assignments, pacing: PACING });
  // Same inputs must give the same answer, or the panel and My Math Path can
  // show a student two different "next steps" on the same screen.
  assert.deepEqual(
    a.recommended.map((row) => row.skillId),
    b.recommended.map((row) => row.skillId),
  );
  assert.deepEqual(curateStudentPanel(a).best?.skillId, curateStudentPanel(b).best?.skillId);
});

test('the launch target is a real TEKS code My Math Path can start a session on', () => {
  const { student, assignments } = studentWith('A.5A', [false, false, false, true]);
  const panel = curateStudentPanel(buildStudentPathOptions({ student, assignments, pacing: PACING }));
  const chosen = panel.best || panel.strengthen;
  assert.ok(chosen, 'there is something to choose');

  const code = teksCodeFromSkillId(chosen.skillId);
  assert.ok(code, 'the skillId converts back to a TEKS code');
  assert.match(code, /^[A-Z0-9]+\.[0-9]+[A-Z]?$/, `"${code}" must look like a TEKS code`);
  assert.equal(teksSkillId(code), chosen.skillId, 'and the conversion round-trips');
});

test('teacher overrides reach the shared assembly', () => {
  const { student, assignments } = studentWith('A.5A', [true, true]);
  // A late-course skill is FUTURE at window 3, and 'priority' deliberately does
  // NOT lift a pacing lock — only 'open' and 'recommend' do. Both behaviours
  // are worth pinning.
  const late = teksSkillId('A.9D');
  const prioritised = buildStudentPathOptions({
    student, assignments, pacing: PACING,
    teacherOverrides: [{ skillId: late, action: 'priority' }],
  });
  assert.notEqual(curateStudentPanel(prioritised).best?.skillId, late,
    'priority alone must not drag future content into the top slot');

  const recommended = buildStudentPathOptions({
    student, assignments, pacing: PACING,
    teacherOverrides: [{ skillId: late, action: 'recommend' }],
  });
  assert.equal(curateStudentPanel(recommended).best?.skillId, late,
    'an explicit recommend both unlocks and promotes it');
});

test('hostile input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => buildStudentPathOptions({ student: bad, assignments: bad, pacing: PACING }));
  }
});
