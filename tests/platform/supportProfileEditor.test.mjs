// The support profile editor: a draft starts from what applies today, saves as
// a NEW revision in exactly the shape the model validates, and the only
// remaining writer of `grades.profile` is the revision store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DUE_DATE_EXTENSION_PRESETS, draftFromCurrent, inputFromDraft, presetKeyForExtension, extensionForPresetKey,
  toggleDraftSupport, setDraftSupportParam, setDraftSupportRoles, editorGroups, describeRevision,
} from '../../src/platform/supportEvidence/supportProfileDraft.js';
import { normalizeSupportRevisionInput } from '../../functions/shared/supportProfileModel.mjs';
import { normalizeStudentProfile } from '../../src/studentSupport.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

test('a first draft from a pre-versioning profile carries its supports forward, with no source yet', () => {
  const draft = draftFromCurrent({ profile: { inclusionStatus: true, accommodations: ['text-to-speech', 'extra-time'], modifications: ['reduce-complexity'] }, todayKey: '2026-09-30' });
  assert.equal(draft.effectiveStart, '2026-09-30');
  assert.equal(draft.sourceLabel, '', 'the teacher must name the document for the new revision');
  assert.equal(draft.inclusionStatus, true);
  assert.deepEqual(Object.keys(draft.accommodations).sort(), ['extra-time', 'text-to-speech']);
  assert.deepEqual(Object.keys(draft.modifications), ['reduce-complexity']);
  const { errors } = normalizeSupportRevisionInput(inputFromDraft(draft));
  assert.ok(errors.some((message) => /source document/.test(message)));
});

test('a draft round-trips into a valid revision with parameters and applicability', () => {
  let draft = draftFromCurrent({ profile: {}, todayKey: '2026-09-30' });
  draft = { ...draft, sourceLabel: 'IEP — annual review' };
  draft = toggleDraftSupport(draft, 'accommodations', 'extra-time');
  draft = setDraftSupportParam(draft, 'accommodations', 'extra-time', 'dueDateExtension', extensionForPresetKey('school-days-1'));
  draft = toggleDraftSupport(draft, 'accommodations', 'calculator');
  draft = setDraftSupportRoles(draft, 'accommodations', 'calculator', ['classwork', 'practice']);
  draft = toggleDraftSupport(draft, 'modifications', 'reduce-complexity');
  draft = toggleDraftSupport(draft, 'accommodations', 'text-to-speech');
  draft = toggleDraftSupport(draft, 'accommodations', 'text-to-speech'); // on, then off again
  draft = { ...draft, serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: '100', note: '' }, { serviceType: '', minutesPerWeek: '', note: '' }] };
  const { revision, errors } = normalizeSupportRevisionInput(inputFromDraft(draft));
  assert.deepEqual(errors, []);
  assert.deepEqual(revision.accommodations.map((entry) => entry.id), ['extra-time', 'calculator']);
  assert.deepEqual(revision.accommodations[0].params.dueDateExtension, { mode: 'school-days', value: 1 });
  assert.deepEqual(revision.accommodations[1].appliesTo, ['classwork', 'practice']);
  assert.deepEqual(revision.modifications.map((entry) => entry.id), ['reduce-complexity']);
  assert.deepEqual(revision.serviceExpectations, [{ serviceType: 'inclusion-support', minutesPerWeek: 100, note: '' }]);
});

test('extension presets round-trip and unknown values fall back to "no change"', () => {
  DUE_DATE_EXTENSION_PRESETS.forEach((preset) => assert.equal(presetKeyForExtension(preset.extension), preset.key));
  assert.equal(presetKeyForExtension({ mode: 'hours', value: 7 }), 'none');
  assert.equal(presetKeyForExtension(null), 'none');
});

test('the editor keeps modifications in their own group and never offers a service as a support', () => {
  const groups = editorGroups();
  const platformIds = groups.platformAccommodations.flatMap((group) => group.items.map((entry) => entry.id));
  const staffIds = groups.staffAccommodations.flatMap((group) => group.items.map((entry) => entry.id));
  assert.ok(platformIds.includes('text-to-speech'));
  assert.ok(staffIds.includes('check-for-understanding'));
  assert.ok(!platformIds.includes('reduce-complexity') && !staffIds.includes('reduce-complexity'));
  assert.ok(groups.modifications.some((entry) => entry.id === 'reduce-complexity'));
  assert.ok(!platformIds.includes('inclusion-support') && !staffIds.includes('inclusion-support'));
  assert.equal(describeRevision({ status: 'inactive' }), 'Supports ended');
});

test('the runtime reads today\'s revision from a versioned profile and passes the plan through', () => {
  const projection = buildSupportProjection({
    revisions: [
      { id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2020-08-17', inclusionStatus: false, accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }], modifications: [] },
      { id: 'r2', revisionId: 'r2', revision: 2, status: 'active', effectiveStart: '2099-01-04', inclusionStatus: false, accommodations: [{ id: 'calculator', params: {}, appliesTo: [] }], modifications: [] },
    ],
    todayKey: '2026-09-30',
  });
  const now = normalizeStudentProfile(projection, { nowValue: Date.parse('2026-09-30T15:00:00Z') });
  assert.deepEqual(now.accommodations, ['text-to-speech']);
  assert.ok(now.supportPlan, 'the plan reaches deadline code untouched');
  const later = normalizeStudentProfile(projection, { nowValue: Date.parse('2099-01-05T15:00:00Z') });
  assert.deepEqual(later.accommodations, ['calculator'], 'a future revision switches on by itself');
  // Legacy flat profiles read exactly as before.
  assert.deepEqual(normalizeStudentProfile({ accommodations: ['text-to-speech'], inclusionStatus: true }), {
    inclusionStatus: true, accommodations: ['text-to-speech'], modifications: [], translationLanguage: null,
  });
});

test('the only client writer of grades.profile is the revision store', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.doesNotMatch(app, /\{\s*profile:\s*nextProfile\s*\}/, 'no flat profile patch is written from App.jsx');
  assert.doesNotMatch(app, /handleUpdateStudentProfile|toggleStudentSupport/);
  const store = readFileSync(new URL('../../src/platform/supportEvidence/supportEvidenceStore.js', import.meta.url), 'utf8');
  assert.match(store, /batch\.update\(doc\(db, 'grades', studentId\), \{ profile: projection \}\);/);
  assert.match(store, /batch\.set\(revisionRef, \{ \.\.\.document, createdAt: serverTimestamp\(\) \}\);/);
  const roster = readFileSync(new URL('../../src/components/teacher/StudentsRoster.jsx', import.meta.url), 'utf8');
  assert.match(roster, /<SupportProfileEditor student=\{selected\} teacherEmail=\{teacherEmail\} onSaved=\{onSupportProfileSaved\} \/>/);
  assert.match(roster, /import SupportProfileEditor from '\.\/SupportProfileEditor\.jsx';/);
});
