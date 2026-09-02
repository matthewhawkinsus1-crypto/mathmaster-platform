import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BUCKET,
  BUCKET_LABEL,
  BUCKET_OPEN_BY_DEFAULT,
  resolveNextAction,
} from '../../src/studentDashboardModel.js';

const emptyGroups = () => ({
  [BUCKET.IN_PROGRESS]: [],
  [BUCKET.PAST_DUE]: [],
  [BUCKET.DO_NOW]: [],
  [BUCKET.COMING_UP]: [],
  [BUCKET.PRACTICE]: [],
  [BUCKET.COMPLETED]: [],
});

test('future-due assigned class work stays visible and outranks independent Path work', () => {
  const assignment = { id: 'a1', title: 'Functions Practice', dueAt: '2026-09-04T23:59:00' };
  const groups = emptyGroups();
  groups[BUCKET.COMING_UP].push({
    assignment,
    disabled: false,
    isAttempted: false,
  });

  assert.equal(BUCKET_LABEL[BUCKET.COMING_UP], 'Assigned — due later');
  assert.equal(BUCKET_OPEN_BY_DEFAULT[BUCKET.COMING_UP], true);

  const next = resolveNextAction({
    dashboard: { groups },
    weeklyProgress: { required: 5, completed: 1, remaining: 4, overdue: false },
  });

  assert.equal(next.kind, 'assignedLater');
  assert.equal(next.assignment.id, 'a1');
  assert.equal(next.actionLabel, 'Start assignment');
});

test('scheduled assigned work blocks a false caught-up message even when it is not startable yet', () => {
  const groups = emptyGroups();
  groups[BUCKET.COMING_UP].push({
    assignment: { id: 'a2', title: 'Tomorrow DOL' },
    disabled: true,
    isAttempted: false,
  });

  const next = resolveNextAction({
    dashboard: { groups },
    weeklyProgress: { required: 5, completed: 5, remaining: 0, overdue: false },
  });

  assert.equal(next.kind, 'assignedSoon');
  assert.match(next.headline, /assigned work/i);
  assert.equal(next.actionLabel, null);
});

test('caught up is reserved for complete class work plus a confirmed complete weekly Path goal', () => {
  const dashboard = { groups: emptyGroups() };

  const unknownPath = resolveNextAction({ dashboard, weeklyProgress: null });
  assert.equal(unknownPath.kind, 'weeklyPathStatus');
  assert.doesNotMatch(unknownPath.headline, /caught up/i);

  const unfinishedPath = resolveNextAction({
    dashboard,
    weeklyProgress: { required: 5, completed: 3, remaining: 2, overdue: false },
  });
  assert.equal(unfinishedPath.kind, 'weeklyPath');

  const complete = resolveNextAction({
    dashboard,
    weeklyProgress: { required: 5, completed: 5, remaining: 0, overdue: false },
  });
  assert.equal(complete.kind, 'clear');
  assert.match(complete.headline, /caught up/i);
  assert.match(complete.detail, /assigned class work is complete/i);
  assert.match(complete.detail, /Math Path goal is complete/i);
});

test('assignment workspace exposes focus view and a collapsible task without removing navigation', async () => {
  const [app, viewport, css] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/App.css', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /assignmentNavigationCollapsed/);
  assert.match(app, /Focus view/);
  assert.match(app, /Show progress/);
  assert.match(app, /mathmaster-collapsed-current-location/);
  assert.match(viewport, /Hide task/);
  assert.match(viewport, /Show task/);
  assert.match(css, /mathmaster-assignment-unified-nav\.is-collapsed/);
  assert.match(css, /mathmaster-desktop-question-anchor\.is-collapsed/);
});

test('multipart draft state is written during the response change, and composed workflows persist their response map', async () => {
  const [undoHistory, localDraft, workflow] = await Promise.all([
    readFile(new URL('../../src/useUndoHistory.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/useLocalDraftState.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(undoHistory, /writeQuestionDraft\(persistenceKey, saved\);[\s\S]*return saved/);
  assert.match(localDraft, /setPersistedValue[\s\S]*writeQuestionDraft\(storageKey, saved\)/);
  assert.match(workflow, /workflow-responses/);
  assert.match(workflow, /workflow-stage/);
});
