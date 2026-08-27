import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('teacher assignment intake exposes guided V5 planning rather than raw schema editing', () => {
  const source = fs.readFileSync('src/AssignmentIntake.jsx', 'utf8');
  assert.match(source, /Plan the assignment/);
  assert.match(source, /NO CODE REQUIRED/);
  assert.match(source, /What are students learning or practicing/);
  assert.match(source, /Sections and versions/);
  assert.match(source, /Printable student worksheet PDF/);
  assert.match(source, /Teacher copy PDF with answers\/available solutions/);
  assert.match(source, /Compact answer-key PDF/);
  assert.match(source, /Separate 1–2 page lesson-notes PDF/);
  assert.match(source, /Honors \+ CCMR/);
  assert.match(source, /Copy Complete AI Build Request/);
  assert.match(source, /Paste V5 JSON from Clipboard/);
  assert.doesNotMatch(source, /textarea[^>]+rawJson|Edit raw JSON/i);
});

test('all canonical V5 section roles are available to the creator', () => {
  const source = fs.readFileSync('src/AssignmentIntake.jsx', 'utf8');
  assert.match(source, /warmup.*classwork.*practice.*dol.*quiz.*test/);
});

console.log('assignmentCreatorUiWiring.test.mjs: all assertions passed');
