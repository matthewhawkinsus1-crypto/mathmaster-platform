// The teacher's Supports & evidence surfaces are wired INTO the PR #400
// workflow — the student drawer and the assignment hub — not a separate
// dashboard, and every write goes through the evidence store's builders.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { supportShortLabel } from '../../functions/shared/supportCatalog.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const drawer = read('src/components/teacher/StudentProfileDrawer.jsx');
const hub = read('src/components/teacher/AssignmentHub.jsx');
const panel = read('src/components/teacher/StudentSupportEvidencePanel.jsx');
const layer = read('src/components/teacher/AssignmentSupportLayer.jsx');
const quick = read('src/components/teacher/SupportQuickActions.jsx');
const service = read('src/components/teacher/ServiceLogDialog.jsx');

test('the student drawer carries Supports & evidence, given the signed-in teacher', () => {
  assert.match(drawer, /import StudentSupportEvidencePanel from '\.\/StudentSupportEvidencePanel\.jsx';/);
  const mount = region(drawer, '<StudentSupportEvidencePanel', '/>', 'panel mount');
  assert.match(mount, /teacherEmail=\{teacherEmail\}/);
  assert.match(mount, /onOpenReport=\{onOpenSupportReport\}/);
  assert.match(region(drawer, '{teacherEmail && studentId && (', '<StudentSupportEvidencePanel', 'panel guard'), /teacherEmail && studentId/);
  const drawerMount = executableSource(region(app, '<StudentProfileDrawer', '/>', 'drawer mount in App'));
  assert.match(drawerMount, /teacherEmail=\{user\?\.role === 'teacher' \? user\.email \|\| '' : ''\}/);
  assert.match(drawerMount, /studentSupportProfile=\{profileDrawerStudent\?\.profile \|\| null\}/);
  assert.match(drawerMount, /onSupportProfileSaved=\{handleSupportProfileSaved\}/);
});

test('Escape closes only the top layer of the drawer (a service or profile dialog first)', () => {
  // The drawer, the service log and the profile editor are all the shared
  // modal Dialog, which answers Escape only for the topmost Dialog and skips a
  // key something above already handled.
  const dialog = read('src/ui/Dialog.jsx');
  // Topmost Dialog, not covered by a later non-Dialog modal, key not handled.
  assert.match(dialog, /const onTop = \(\) => isTopDialog\(token\) && !coveredByForeignModal\(dialog\);/);
  assert.match(dialog, /if \(event\.defaultPrevented \|\| !onTop\(\)\) return;/);
  const shell = region(drawer, '<Dialog as="aside"', '\n', 'drawer dialog');
  assert.match(shell, /ref=\{panelRef\}/);
  assert.match(shell, /onClose=\{closeIfTopLayer\}/);
  // …and a modal above it that is not a Dialog (a Toast confirmation) by DOM order.
  const guard = region(drawer, 'const closeIfTopLayer = () => {', '\n  };', 'drawer top-layer guard');
  assert.match(guard, /if \(modals\.length && modals\[modals\.length - 1\] !== panelRef\.current\) return;\n\s*onCloseRef\.current\?\.\(\);/);
  assert.match(region(service, '<Dialog as="section"', '\n', 'service log dialog'), /onClose=\{onClose\}/);
  assert.match(region(panel, '<Dialog className="tw-review__panel"', '\n', 'profile editor dialog'), /onClose=\{\(\) => setEditorOpen\(false\)\}/);
});

test('the assignment hub carries the Supports layer after progress, filed under the signed-in teacher', () => {
  assert.match(hub, /import AssignmentSupportLayer from '\.\/AssignmentSupportLayer\.jsx';/);
  const mount = region(hub, '<AssignmentSupportLayer', '/>', 'layer mount');
  assert.match(mount, /teacherEmail=\{teacherEmail\}/);
  assert.match(mount, /gradeRecordsById=\{gradeRecordsById\}/);
  assert.match(hub, /: <>\{controls\}\{liveSection\}\{progressSection\}\{supportsSection\}<\/>;/);
  const hubMount = executableSource(region(app, '<AssignmentHub', '/>', 'hub mount in App'));
  assert.match(hubMount, /teacherEmail=\{user\?\.email \|\| ''\}/);
});

test('the hub layer and the drawer build rows with the one shared builder', () => {
  assert.match(layer, /import \{ buildAssignmentEvidenceRow \} from '\.\.\/\.\.\/platform\/supportEvidence\/evidenceAggregation\.js';/);
  assert.match(region(layer, 'const loadEvidence = async () => {', '\n  };', 'loadEvidence'), /buildAssignmentEvidenceRow\(\{/);
  assert.match(panel, /activeEvidence\(evidence\)/, 'the drawer counts only non-withdrawn records');
});

test('one-click actions write at once, notes are optional and after, mistakes are corrected not deleted', () => {
  const record = region(quick, 'const record = async (supportId) => {', '\n  };', 'record');
  assert.match(record, /recordStaffSupportEvidence\(\{/);
  assert.match(record, /actorEmail: teacherEmail,/);
  assert.match(record, /eventType: 'teacher-documented',/);
  assert.doesNotMatch(record, /note:/, 'the click never asks for a note');
  assert.match(region(quick, 'const saveNote = async () => {', '\n  };', 'saveNote'), /addNoteToStaffSupportEvidence\(\{/);
  assert.match(region(quick, 'const withdraw = async () => {', '\n  };', 'withdraw'), /voidStaffSupportEvidence\(\{ db, original: last, teacherEmail \}\)/);
  assert.doesNotMatch(executableSource(quick), /deleteDoc|updateDoc/);
});

test('the service log records minutes, corrects by voiding, and states what it is not', () => {
  assert.match(region(service, 'const save = async (event) => {', '\n  };', 'save'), /recordServiceLogEntry\(\{/);
  const correct = region(service, 'const correct = async (entry) => {', '\n  };', 'correct');
  assert.match(correct, /minutes: 0,/);
  assert.match(correct, /voidsEntryId: entry\.id,/);
  assert.match(service, /MathMaster does not independently measure services or determine compliance\./);
});

test('compact chips use short labels; unknown ids stay visible', () => {
  assert.equal(supportShortLabel('calculator'), 'Calculator');
  assert.equal(supportShortLabel('text-to-speech'), 'Read aloud');
  assert.equal(supportShortLabel('something-new'), 'something-new');
});
