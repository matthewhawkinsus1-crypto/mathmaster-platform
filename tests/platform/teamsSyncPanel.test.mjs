// Grade Export's "Automatic TEAMS sync" panel (#612). The words and checks
// are the pure model (teamsSyncPanelModel.js), tested directly. The screen is
// .jsx, which node cannot render, so its wiring is pinned by region: it loads
// only when opened (and then each class once, including one added later),
// sends only after the export history loaded, and sends
// what an export of this marking period would.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeTeamsSyncState,
  formatTeamsSections,
  groupTeamsExceptions,
  parseTeamsSectionsDraft,
  publishResultMessage,
  relativeTime,
} from '../../src/platform/gradeTransfer/teamsSyncPanelModel.js';
import { TEAMS_EXCEPTION } from '../../functions/shared/teamsSyncEngine.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-11-27T15:00:00Z');
const minutesAgo = (minutes) => new Date(NOW - minutes * 60000).toISOString();

test('a teacher types one TEAMS section, or both sections of an inclusion class', () => {
  assert.deepEqual(parseTeamsSectionsDraft('15001/05').sections, [{ sectionRef: '15001/05', label: '' }]);
  assert.deepEqual(parseTeamsSectionsDraft(' 15001/05 , 15001/55 ').sections.map((entry) => entry.sectionRef), ['15001/05', '15001/55']);
  assert.deepEqual(parseTeamsSectionsDraft('15001/05\n15001/55').sections.length, 2);
  assert.deepEqual(parseTeamsSectionsDraft('').sections, [], 'empty unlinks');
  assert.match(parseTeamsSectionsDraft('15001/05, 15001/05').error, /twice/);
  assert.match(parseTeamsSectionsDraft('15001/05; 1; 2; 3').error, /at most 3/);
  assert.match(parseTeamsSectionsDraft('period 5!').error, /TEAMS section/);
  assert.equal(formatTeamsSections([{ sectionRef: '15001/05' }, { sectionRef: '15001/55' }]), '15001/05, 15001/55');
});

test('each class says plainly where its sync stands', () => {
  const linked = { sections: [{ sectionRef: '15001/05' }, { sectionRef: '15001/55' }] };
  const said = (state) => describeTeamsSyncState(state, { now: NOW });
  assert.equal(said(null).headline, 'Checking…');
  assert.equal(said({ sections: [] }).headline, 'Not linked to TEAMS');
  assert.equal(said(linked).headline, 'Linked, nothing sent yet');
  assert.match(said(linked).details[0], /15001\/05 and 15001\/55: each student's grade goes to the section TEAMS lists them in/);
  const sent = { ...linked, targetCount: 12, targetsPublishedAt: minutesAgo(5) };
  assert.equal(said(sent).headline, 'Waiting for TEAMS');
  assert.match(said(sent).details[1], /12 lesson sections in the sync, last changed 5 min ago/);
  assert.match(said(sent).details[2], /automatically every 30 minutes from 6 am to 10 pm\.$/);
  assert.match(said({ ...sent, targetsCheckedBy: 'schedule', targetsCheckedAt: minutesAgo(12) }).details[2], /automatically every 30 minutes .*; last checked 12 min ago\./);
  assert.match(said(linked).details.at(-1), /No grades sent to the sync yet\. MathMaster sends current grades automatically .*, or press Send now\./);
  assert.equal(said({ ...sent, batchLeasedUntil: new Date(NOW + 60000).toISOString() }).headline, 'Syncing in a TEAMS tab now');
  const done = { ...sent, lastStep: { at: minutesAgo(90), status: 'done', exceptionCount: 0, unreadSections: [] } };
  assert.deepEqual([said(done).tone, said(done).headline], ['success', 'Last sync 2 hours ago: TEAMS matches MathMaster']);
  assert.equal(said({ ...done, lastStep: { ...done.lastStep, exceptionCount: 3 } }).headline, 'Last sync 2 hours ago: 3 need your decision');
  assert.equal(said({ ...done, lastStep: { ...done.lastStep, status: 'work' } }).headline, 'Last sync 2 hours ago: not finished');
  const unread = said({ ...done, lastStep: { ...done.lastStep, unreadSections: ['15001/55'] } });
  assert.equal(unread.tone, 'warning');
  assert.match(unread.details.at(-1), /15001\/55 could not be read .* nothing in this class was written/);
  assert.equal(relativeTime(minutesAgo(60 * 50), NOW), '2 days ago');
});

test('what needs a decision is grouped and names the student, lesson and TEAMS section', () => {
  const names = { 'u-ada': 'Ada Lovelace', 'u-ben': 'Ben Ortiz' };
  const groups = groupTeamsExceptions([
    { code: TEAMS_EXCEPTION.MANUAL_GRADE_DIFFERS, studentId: 'u-ben', sisStudentId: '1500102', lesson: 'Nth Roots - Warm-Up', sectionRef: '15001/05', teams: 75, mathmaster: 80 },
    { code: TEAMS_EXCEPTION.TEACHER_OVERRIDE, studentId: 'u-ada', sisStudentId: '1500101', lesson: 'Nth Roots - Classwork', sectionRef: '15001/05', teams: 95, mathmaster: 72 },
    { code: TEAMS_EXCEPTION.ENROLLED_IN_SEVERAL, studentId: 'u-ada', sisStudentId: '1500101', lesson: 'Nth Roots - DOL', sectionRef: null },
    { code: TEAMS_EXCEPTION.AMBIGUOUS_COLUMN, lesson: 'Review', sectionRef: '15001/55', message: 'More than one TEAMS assignment has this name.' },
    { code: 'SOMETHING_NEW', message: 'A future case.' },
  ], (row) => names[row.studentId] || row.sisStudentId);
  assert.deepEqual(groups.map((group) => group.title), [
    'Grades changed in TEAMS after MathMaster sent them',
    'Grades already in TEAMS that differ from MathMaster',
    'Students not on exactly one of this class\'s TEAMS sections',
    'TEAMS assignments to check',
    'Other',
  ]);
  assert.deepEqual(groups[0].items[0], { code: TEAMS_EXCEPTION.TEACHER_OVERRIDE, who: 'Ada Lovelace', where: 'Nth Roots - Classwork · TEAMS 15001/05', values: 'TEAMS 95 · MathMaster 72', message: '' });
  assert.equal(groups[3].items[0].who, '', 'a column problem names no student');
  assert.equal(groups[4].items[0].message, 'A future case.', 'an unknown code is still shown');
});

test('every exception the engine raises has its own heading, and the #Count hold is shown as waiting', () => {
  // A code renamed in the engine would otherwise fall to "Other" without a
  // failing test (#617 replaced PROVISIONAL_SCORE_WILL_COUNT with the hold).
  for (const code of Object.values(TEAMS_EXCEPTION)) {
    const [group] = groupTeamsExceptions([{ code }]);
    assert.notEqual(group.title, 'Other', `${code} has a heading`);
  }
  const [held] = groupTeamsExceptions([
    { code: TEAMS_EXCEPTION.COUNT_HELD_FOR_FINAL_GRADE, studentId: 'u-ada', sisStudentId: '1500101', lesson: 'Nth Roots - DOL', sectionRef: '15001/05', message: 'This student has no final grade yet.' },
  ], () => 'Ada Lovelace');
  assert.equal(held.title, '#Count waiting for a final grade');
  assert.deepEqual(held.items[0], { code: TEAMS_EXCEPTION.COUNT_HELD_FOR_FINAL_GRADE, who: 'Ada Lovelace', where: 'Nth Roots - DOL · TEAMS 15001/05', values: '', message: 'This student has no final grade yet.' });
});

test('sending grades reports what the server kept and what it left out', () => {
  assert.deepEqual(publishResultMessage({ published: 4, droppedRows: 0 }, 'Algebra I - 5'), {
    tone: 'success', text: 'Sent 4 lesson sections for Algebra I - 5 to the sync. The MathMaster extension in your TEAMS tab applies them on its next run.',
  });
  const partial = publishResultMessage({ published: 1, droppedRows: 2 }, 'Algebra I - 5');
  assert.equal(partial.tone, 'warning');
  assert.match(partial.text, /2 grades were left out because the student is not in this class under that district ID/);
});

const center = () => componentSource('src/components/teacher/GradeTransferCenter.jsx');
const panel = () => componentSource('src/components/teacher/TeamsSyncPanel.jsx');

test('Grade Export shows the panel and builds targets exactly as an export of this marking period would', () => {
  const source = executableSource(center());
  const rendered = region(source, '<TeamsSyncPanel', '/>', 'the panel element');
  assert.match(rendered, /classes=\{syncClasses\}/);
  assert.match(rendered, /buildTargets=\{buildSyncTargets\}/);
  assert.match(rendered, /ready=\{stateLoaded\}/, 'nothing is sent before the export history loads');
  const build = region(source, 'const buildSyncTargets = (classId) => buildTeamsSyncTargets({', '});', 'buildSyncTargets');
  for (const input of ['students: projectedStudents', 'snapshots', 'practicePasses', 'resolveStudentFinalDeadline', 'teacherEmail', 'isRootAdmin']) {
    assert.ok(build.includes(input), `targets use the export's ${input}`);
  }
  assert.match(build, /includeAssignment: \(assignment\) => resolveAssignmentGradingPeriod\(assignment, gradingPeriodSettings \|\| \{\}\)\.isCurrent/);
  assert.match(region(source, 'const syncClasses =', ';', 'syncClasses'), /authorizedClasses\.filter/, 'only classes this teacher may export');
});

test('the panel loads only when opened, validates sections first, and sends only when linked and ready', () => {
  const source = executableSource(panel());
  const toggle = region(source, 'const onToggle = (event) => {', '};', 'onToggle');
  assert.match(toggle, /if \(!event\.currentTarget\.open \|\| opened\) return;/);
  assert.match(toggle, /setOpened\(true\)/);
  assert.doesNotMatch(toggle, /load\(/, 'opening only marks the panel open; the effect below loads');
  // The one effect loads nothing until the panel is open, then each class
  // once, including a class that joins the list afterwards.
  assert.equal(source.match(/useEffect\(/g)?.length, 1);
  const effect = region(source, 'useEffect(() => {', '}, [opened, classIds]);', 'the load effect');
  assert.ok(effect.indexOf('if (!opened) return;') >= 0 && effect.indexOf('if (!opened) return;') < effect.indexOf('load(classId)'), 'no load on mount');
  assert.match(effect, /if \(requested\.current\.has\(classId\)\) return;\s*requested\.current\.add\(classId\);\s*load\(classId\);/);
  assert.match(source, /const classIds = classes\.map\(\(entry\) => entry\.classId\)\.join\('\|'\);/);
  assert.match(region(source, '<details', '>', 'the disclosure'), /onToggle=\{onToggle\}/);
  const save = region(source, 'const saveSections = async (entry) => {', 'const sendGrades', 'saveSections');
  assert.ok(save.indexOf('parseTeamsSectionsDraft(') < save.indexOf('setTeamsSyncSections('), 'checked before it is sent');
  assert.match(save, /if \(!parsed\.ok\) \{[\s\S]*return;/);
  assert.match(region(source, 'const sendGrades = async (entry) => {', 'return (', 'sendGrades'), /publishTeamsSyncTargets\(\{ classId: entry\.classId, targets: buildTargets\(entry\.classId\) \}\)/);
  const sendButton = region(source, 'disabled={!linked', '\n', 'the send button');
  assert.match(sendButton, /!ready/);
  assert.match(sendButton, /isWorking/);
});

// ------------------------------------------------------------------ Remove from TEAMS (the owner, 2026-11-27)

test('Remove from TEAMS: each removed lesson says where it stands in each TEAMS section, and what to confirm', async () => {
  const { describeTeamsRemovals, removableTeamsTargets, removalConfirmationMatches } = await import('../../src/platform/gradeTransfer/teamsSyncPanelModel.js');
  const targets = [
    { key: 'c__nth__classwork', name: 'Nth Roots - Classwork' },
    { key: 'c__nth__dol', name: 'Nth Roots - DOL' },
    { key: 'c__radicals__warmup', name: 'Radicals - Warm-Up' },
  ];
  const state = {
    removals: {
      c__nth__classwork: { requestedAt: '2026-11-18T10:00:00Z' },
      c__nth__dol: { requestedAt: '2026-11-18T10:00:00Z', confirmedGradeCount: 2 },
      c__radicals__warmup: { requestedAt: '2026-11-18T13:00:00Z' },
    },
    lastStep: {
      at: '2026-11-18T12:00:00Z',
      removals: [
        { targetKey: 'c__nth__classwork', sectionRef: '15001/05', state: 'confirm', gradeCount: 20 },
        { targetKey: 'c__nth__classwork', sectionRef: '15001/55', state: 'confirm', gradeCount: 4 },
        { targetKey: 'c__nth__dol', sectionRef: '15001/05', state: 'removed', gradeCount: 2 },
        { targetKey: 'c__nth__dol', sectionRef: '15001/55', state: 'left' },
      ],
    },
  };
  const [classwork, dol, warmup] = describeTeamsRemovals(state, targets);
  assert.equal(classwork.lesson, 'Nth Roots - Classwork');
  assert.deepEqual(classwork.lines.map((line) => [line.sectionRef, line.state, line.tone]), [['15001/05', 'confirm', 'warning'], ['15001/55', 'confirm', 'warning']]);
  assert.equal(classwork.confirmCount, 20, 'the confirmation covers the largest section');
  assert.equal(classwork.totalGrades, 24);
  assert.equal(classwork.done, false);
  assert.equal(dol.done, true);
  assert.match(dol.lines[1].text, /left there/);
  assert.deepEqual(warmup.lines.map((line) => line.state), ['waiting'], 'asked after the last sync: not seen yet');
  assert.deepEqual(removableTeamsTargets(state, [...targets, { key: 'c__x__practice', name: 'X - Practice' }]).map((item) => item.key), ['c__x__practice']);
  assert.equal(removalConfirmationMatches('20', 20), true);
  assert.equal(removalConfirmationMatches(' 20 ', 20), true);
  assert.equal(removalConfirmationMatches('2', 20), false);
  assert.equal(removalConfirmationMatches('', 0), false);
});

test('the panel removes a lesson only after a second press, and confirms grades only with the typed count', () => {
  const panel = executableSource(componentSource('src/components/teacher/TeamsSyncPanel.jsx'));
  assert.match(panel, /removalArmed === `\$\{entry\.classId\}\|\$\{choice\}` && chosen \? \([\s\S]*?Yes, remove from TEAMS/);
  assert.match(panel, /disabled=\{isWorking \|\| !removalConfirmationMatches\(typed, item\.confirmCount\)\}[\s\S]*?changeRemoval\(entry, item\.targetKey, 'confirm', item\.confirmCount\)/);
  assert.match(panel, /changeRemoval\(entry, item\.targetKey, 'restore'\)/);
  assert.match(panel, /await setTeamsSyncRemoval\(\{ classId: entry\.classId, targetKey, action, confirmGradeCount \}\)/);
});
