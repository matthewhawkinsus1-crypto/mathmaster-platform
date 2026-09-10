import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contentVersionLabel,
  contentVersionOf,
  groupCurrentLibraryReleases,
  latestFamilyRelease,
  sameContentFamily,
} from '../../functions/shared/assignmentContentVersion.mjs';

test('legacy assignment is Content V1 without backfill', () => {
  const assignment = { id: 'a1', schemaVersion: 5, title: 'Regression' };
  assert.equal(contentVersionOf(assignment), 1);
  assert.equal(contentVersionLabel(assignment), 'Content V1');
});

test('lineage version is human-facing and independent of schemaVersion', () => {
  const assignment = {
    schemaVersion: 5,
    contentLineage: { familyId: 'fam-1', version: 2, releaseStatus: 'current' },
  };
  assert.equal(contentVersionOf(assignment), 2);
  assert.equal(contentVersionLabel(assignment), 'Content V2');
  assert.equal(assignment.schemaVersion, 5);
});

test('family equality requires the same nonempty lineage family id', () => {
  assert.equal(sameContentFamily(
    { contentLineage: { familyId: 'fam-1', version: 1 } },
    { contentLineage: { familyId: 'fam-1', version: 2 } },
  ), true);
  assert.equal(sameContentFamily(
    { title: 'Same title' },
    { title: 'Same title' },
  ), false);
});

test('latest family release returns the highest version in the same family', () => {
  const v1 = { id: 'v1', contentLineage: { familyId: 'fam', version: 1, releaseStatus: 'superseded' } };
  const v2 = { id: 'v2', contentLineage: { familyId: 'fam', version: 2, releaseStatus: 'current' } };
  const other = { id: 'other', contentLineage: { familyId: 'other-fam', version: 7, releaseStatus: 'current' } };
  assert.equal(latestFamilyRelease([v1, other, v2], v1)?.id, 'v2');
});

test('current release is visible and superseded sibling is hidden by default', () => {
  const legacy = { id: 'legacy', title: 'Standalone', assignedClassIds: [] };
  const v1 = { id: 'v1', assignedClassIds: [], contentLineage: { familyId: 'fam', version: 1, releaseStatus: 'superseded' } };
  const v2 = { id: 'v2', assignedClassIds: [], contentLineage: { familyId: 'fam', version: 2, releaseStatus: 'current' } };
  const { visible, families } = groupCurrentLibraryReleases([legacy, v1, v2]);
  assert.deepEqual(visible.map((item) => item.id), ['legacy', 'v2']);
  assert.deepEqual(families.get('fam').map((item) => item.id), ['v2', 'v1']);
});
