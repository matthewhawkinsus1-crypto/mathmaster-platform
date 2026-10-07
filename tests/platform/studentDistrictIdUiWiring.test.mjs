// THE TEACHER SCREENS THAT CORRECT A DISTRICT ID, WIRED TO THE ONE SERVER PATH.
//
// node cannot render .jsx, so these contracts bind each screen to the logic it
// must run (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md): every assertion is
// anchored to the function or block that does the work, never to a word that
// merely appears somewhere in a large file. The behaviour itself — the
// callable, the export, the words a teacher reads — is run for real in
// studentDistrictIdCorrection.test.mjs, gradeTransferDistrictIdCorrection
// .test.mjs and tests/browser/teacherWorkflow/districtIdJourneys.mjs.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  DISTRICT_ID_COPY,
  DISTRICT_ID_STATUS,
  describeStudentDistrictId,
  districtIdChangePreview,
  districtIdSavedMessage,
  sanitizeDistrictIdDraft,
} from '../../src/platform/teacher/studentDistrictIdModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const code = (relative) => executableSource(read(relative));
const importsFrom = (source, name, specifierPattern) => new RegExp(
  `import\\s*(?:\\w+\\s*,\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]${specifierPattern}['"]`,
).test(source);
const importsDefault = (source, name, specifierPattern) => new RegExp(`import\\s+${name}\\s+from\\s*['"]${specifierPattern}['"]`).test(source);

test('the words a teacher reads: what each ID is for, what a change does not do, and no database language', () => {
  const words = [
    ...Object.values(DISTRICT_ID_COPY).flat(),
    districtIdSavedMessage({ studentName: 'Testerling, Marisol · ID 111111', previousDistrictId: '111111', districtId: '222222' }),
    districtIdChangePreview({ currentDistrictId: '111111', draft: '222222' }),
  ].join('\n');
  // The four promises, every time a teacher is about to change one.
  assert.deepEqual(DISTRICT_ID_COPY.effects, [
    'does not create a new MathMaster student;',
    'does not move, copy or delete any work, grades or history;',
    'does not change the student’s MathMaster account ID or how they sign in;',
    'changes only the number future grade exports use.',
  ]);
  assert.equal(DISTRICT_ID_COPY.differsNote, 'MathMaster account ID and district ID differ. Grade exports use the verified district ID.');
  assert.doesNotMatch(words, /Firestore|firebase|document|\bfield\b|\bSIS\b|sisStudentId|grades\//i, 'teacher copy uses no technical language');
  // The confirmation the teacher asked for, with the student named.
  assert.match(
    districtIdSavedMessage({ studentName: 'Testerling, Marisol · ID 111111', previousDistrictId: '111111', districtId: '222222' }),
    /^District ID updated for Testerling, Marisol · ID 111111\. The student’s MathMaster account, work, and grades were not changed\. Future grade exports will use 222222\./,
  );
  assert.equal(
    districtIdSavedMessage({ previousDistrictId: '222222', districtId: '222222' }),
    'District ID updated. The student’s MathMaster account, work, and grades were not changed. Future grade exports will use 222222.',
  );
  // The preview makes a change deliberate, with every number labelled.
  assert.equal(districtIdChangePreview({ currentDistrictId: '111111', draft: '222222' }), 'Future grade exports will use district ID 222222 instead of district ID 111111.');
  assert.equal(districtIdChangePreview({ currentDistrictId: '111111', draft: '22a' }), '');
  assert.equal(sanitizeDistrictIdDraft(' 222-222 '), '222222');
  assert.equal(sanitizeDistrictIdDraft('1'.repeat(25)).length, 20);
});

test('each student reads as same, differs (a calm note), or cannot export (a warning)', () => {
  const cases = [
    [{ id: '444444' }, DISTRICT_ID_STATUS.SAME, 'neutral', true, 'Edit district ID'],
    [{ id: '444444', sisStudentId: '444444' }, DISTRICT_ID_STATUS.SAME, 'neutral', true, 'Edit district ID'],
    [{ id: '111111', sisStudentId: '222222' }, DISTRICT_ID_STATUS.DIFFERS, 'info', true, 'Edit district ID'],
    [{ id: 'ada.legacy@students.example' }, DISTRICT_ID_STATUS.MISSING, 'warning', false, 'Add district ID'],
    [{ id: '111111', sisStudentId: 'S-1' }, DISTRICT_ID_STATUS.INVALID, 'warning', false, 'Edit district ID'],
  ];
  cases.forEach(([student, status, tone, exportable, actionLabel]) => {
    const described = describeStudentDistrictId(student);
    assert.deepEqual(
      [described.status, described.tone, described.exportable, described.actionLabel],
      [status, tone, exportable, actionLabel],
      JSON.stringify(student),
    );
  });
});

test('Student Access corrects a district ID through teacherAdmin.setStudentSisId, reloads, then tells the app', () => {
  const file = 'src/SignInAccess.jsx';
  const source = read(file);
  const save = region(source, 'const saveStudentDistrictId = async', '\n  };', 'saveStudentDistrictId');
  const call = save.indexOf('teacherAdmin.setStudentSisId({ studentId, sisStudentId: districtId })');
  const reload = save.indexOf('await refresh()');
  const notify = save.indexOf('onStudentIdentityChanged?.()');
  assert.ok(call > 0, 'the save goes through the callable wrapper');
  assert.ok(reload > call && notify > reload, 'the screen reloads, then the app is told — only after the server saved');
  assert.match(save, /setStatus\(districtIdSavedMessage\(\{/);
  assert.match(save, /previousDistrictId: saved\.previousSisStudentId/);

  // Every row offers it, and the editor saves through that function.
  const row = region(source, 'filteredStudents.map((student) => {', '\n          })}', 'student row');
  assert.match(row, /const district = describeStudentDistrictId\(student\);/);
  assert.match(row, /aria-label=\{`\$\{district\.actionLabel\} for \$\{studentLabel\}`\}/);
  assert.match(row, /<DistrictIdEditor[\s\S]*?onSave=\{\(districtId\) => saveStudentDistrictId\(student, districtId\)\}/);
  // The row says which ID is which, and the calm note when they differ.
  assert.match(row, / · MathMaster ID \{student\.studentId\}/);
  assert.match(row, /district\.status === DISTRICT_ID_STATUS\.DIFFERS && <><strong[^>]*>District ID \{district\.districtId\}<\/strong> · \{district\.note\}/);

  // A call with no import is a runtime ReferenceError the build does not catch.
  assert.ok(importsDefault(source, 'DistrictIdEditor', '\\./components/teacher/DistrictIdEditor\\.jsx'));
  ['DISTRICT_ID_STATUS', 'describeStudentDistrictId', 'districtIdSavedMessage'].forEach((name) => {
    assert.ok(importsFrom(source, name, '\\./platform/teacher/studentDistrictIdModel\\.js'), `${name} is imported`);
  });
  assert.match(code('src/auth/authService.js'), /setStudentSisId:\s*\(\{[^)]*\}\)\s*=>\s*callable\('setStudentSisId'\)/);
});

test('the editor validates like the server before it saves, and explains the change', () => {
  const file = 'src/components/teacher/DistrictIdEditor.jsx';
  const source = read(file);
  const submit = region(source, 'const submit = (event) => {', '\n  };', 'submit');
  const validate = submit.indexOf('validateDistrictIdDraft(draft)');
  const refuse = submit.indexOf('if (!checked.ok)');
  const save = submit.indexOf('onSave?.(checked.value)');
  assert.ok(validate > 0 && refuse > validate && save > refuse, 'only a validated, digits-only ID reaches onSave');
  assert.match(source, /onChange=\{\(event\) => \{ setDraft\(sanitizeDistrictIdDraft\(event\.target\.value\)\)/);
  assert.match(source, /DISTRICT_ID_COPY\.effects\.map\(/);
  assert.match(source, /districtIdChangePreview\(\{ currentDistrictId: described\.districtId, draft \}\)/);
  assert.match(source, /\{DISTRICT_ID_COPY\.accountIdLabel\} \{described\.accountId\}/);
  assert.doesNotMatch(code(file), /firebase|setDoc|updateDoc|httpsCallable/, 'the form never writes; its caller saves through the callable');
});

test('Grade Export lists EVERY student in scope for correction — not only invalid IDs — and saves through the callable', () => {
  const file = 'src/components/teacher/GradeTransferCenter.jsx';
  const source = read(file);
  const roster = region(source, 'const districtRoster = useMemo(', '}, [authorizedClassIds', 'district roster');
  assert.doesNotMatch(roster, /validSisStudentId|exportable/, 'a valid-looking district ID is listed too — that is the case being fixed');
  assert.match(roster, /\.map\(\(student\) => \(\{ student, district: describeStudentDistrictId\(student\) \}\)\)/);

  const save = region(source, 'const saveDistrictId = async', '\n  };', 'saveDistrictId');
  assert.match(save, /await setStudentSisId\(\{ studentId, sisStudentId \}\)/);
  assert.match(save, /setSisOverrides\(/);
  assert.match(save, /text: districtIdSavedMessage\(\{/);

  const list = region(source, '{visibleDistrictRoster.map(', '{districtNeedle && visibleDistrictRoster.length === 0', 'district ID list');
  assert.match(list, /<DistrictIdEditor[\s\S]*?onSave=\{\(value\) => saveDistrictId\(student, value\)\}/);
  assert.match(list, /aria-label=\{`\$\{district\.actionLabel\} for \$\{label\}`\}/);

  // The repair list also catches a district ID two students share.
  assert.match(region(source, 'const sisProblems = useMemo(', '}, [authorizedClassIds', 'SIS problem list'), /sisStudentIdIsShared\(sharedDistrictIds, authoritativeSisStudentId\(student\)\)/);
  // The review step names corrected IDs; "Download last file" warns about them.
  assert.match(region(source, '{plan && (', '\n    )}', 'review dialog'), /plan\.reidentified\.map\(/);
  assert.match(region(source, 'const downloadAgain = (unit) => {', '\n  };', 'downloadAgain'), /lastFileRowsWithOutdatedDistrictId\(\{ unit, snapshots \}\)/);

  assert.ok(importsFrom(source, 'setStudentSisId', '\\.\\./\\.\\./platform/gradeTransfer/gradeTransferStore\\.js'));
  assert.ok(importsDefault(source, 'DistrictIdEditor', '\\./DistrictIdEditor\\.jsx'));
  ['describeStudentDistrictId', 'districtIdSavedMessage', 'validateDistrictIdDraft'].forEach((name) => {
    assert.ok(importsFrom(source, name, '\\.\\./\\.\\./platform/teacher/studentDistrictIdModel\\.js'), `${name} is imported`);
  });
  assert.ok(importsFrom(source, 'lastFileRowsWithOutdatedDistrictId', '\\.\\./\\.\\./platform/gradeTransfer/gradeTransferHistory\\.js'));
});

test('opening a student says which number is which; the drawer only reads it', () => {
  const file = 'src/components/teacher/StudentProfileDrawer.jsx';
  const source = read(file);
  assert.match(source, /const district = describeStudentDistrictId\(\{ \.\.\.studentRecord, id: studentId \|\| studentRecord\?\.id \}\);/);
  const header = region(source, '{classRecord?.name || courseContext?.classPeriod', '</header>', 'drawer header');
  assert.match(header, /` · MathMaster ID \$\{studentId\}`/);
  assert.match(header, /district\.status === DISTRICT_ID_STATUS\.DIFFERS \? ` · District ID \$\{district\.districtId\}` : ''/);
  ['DISTRICT_ID_STATUS', 'describeStudentDistrictId'].forEach((name) => {
    assert.ok(importsFrom(source, name, '\\.\\./\\.\\./platform/teacher/studentDistrictIdModel\\.js'), `${name} is imported`);
  });
  assert.doesNotMatch(code(file), /setStudentSisId|DistrictIdEditor/, 'the drawer is read-only; Student Access manages the district ID');
});

test('no browser code can write a district ID itself: only the setStudentSisId callable changes it', () => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(?:js|jsx|mjs)$/.test(entry)) files.push(full);
  });
  walk(path.join(ROOT, 'src'));
  const mentioning = files.filter((file) => /sisStudentId/.test(executableSource(readFileSync(file, 'utf8'))));
  assert.ok(mentioning.length >= 5, 'the scan sees the files that read the district ID');
  mentioning.forEach((file) => {
    const source = executableSource(readFileSync(file, 'utf8'));
    assert.doesNotMatch(source, /from\s*['"]firebase\/firestore['"]/, `${path.relative(ROOT, file)} reads the district ID and must not hold a Firestore client`);
  });
  // The two client wrappers are the only callers of the callable.
  const callers = files.filter((file) => /callable\('setStudentSisId'\)/.test(readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file)).sort();
  assert.deepEqual(callers, ['src/auth/authService.js', 'src/platform/gradeTransfer/gradeTransferStore.js']);
  // And the rules refuse a client write that changes any district ID field.
  const rules = read('firestore.rules');
  const pinned = region(rules, 'function sisIdentityUnchanged() {', '}', 'sisIdentityUnchanged');
  ['sisStudentId', 'sisStudentIdVerifiedAt', 'sisStudentIdVerifiedBy'].forEach((field) => assert.match(pinned, new RegExp(`get\\('${field}', null\\) == resource\\.data\\.get\\('${field}', null\\)`)));
});
