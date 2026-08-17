import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Google OAuth requests the narrow Drive file scope', () => {
  const src = fs.readFileSync('functions/lib/classroom.js', 'utf8');
  assert.match(src, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(src, /async function getDriveClient/);
  assert.match(src, /getDriveClient,/);
});

test('Classroom can build native Drive file materials', () => {
  const src = fs.readFileSync('functions/lib/classroom.js', 'utf8');
  assert.match(src, /function toClassroomMaterial/);
  assert.match(src, /driveFile:\s*\{/);
  assert.match(src, /shareMode:\s*"VIEW"/);
});

test('notes PDF storage also attempts teacher-owned Drive storage', () => {
  const src = fs.readFileSync('functions/index.js', 'utf8');
  const start = src.indexOf('exports.storeLessonNotesPdf');
  const end = src.indexOf('exports.publishClassroomMaterial', start);
  const section = src.slice(start, end);
  assert.match(section, /getDriveClient/);
  assert.match(section, /upsertLessonNotesPdf/);
  assert.match(section, /driveAsset/);
  assert.match(section, /driveStatus/);
});

test('publishing prefers native Drive notes when a ready Drive asset exists', () => {
  const src = fs.readFileSync('functions/index.js', 'utf8');
  assert.match(src, /function preferDriveNotesMaterial/);
  assert.match(src, /driveFileId/);
  assert.match(src, /preferDriveNotesMaterial\(materials, resourceAssignment\.data\(\)\)/);
  assert.match(src, /preferDriveNotesMaterial\(cleanMaterials\(materials\), assignment\)/);
});
