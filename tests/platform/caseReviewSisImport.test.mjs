// Importing an official gradebook snapshot: read-only, tolerant of the shapes
// a gradebook export comes in, and minimal — only the selected student's row
// survives the parse. Every fixture here is synthetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRADEBOOK_LAYOUT, detectGradebookLayout, extractStudentGradebook, parseDelimitedText, parseScoreCell,
} from '../../src/platform/caseReview/sisGradebookImport.js';

const student = { id: 'S910201', sisStudentId: '910201', firstName: 'Avery', lastName: 'Sample', displayName: 'Avery Sample' };

test('the parser handles quotes, embedded delimiters, CRLF, a BOM and other delimiters', () => {
  const comma = parseDelimitedText('﻿Student ID,Name,"Lesson 4, DOL"\r\n910201,"Sample, Avery",80\r\n');
  assert.equal(comma.delimiter, ',');
  assert.deepEqual(comma.rows, [['Student ID', 'Name', 'Lesson 4, DOL'], ['910201', 'Sample, Avery', '80']]);
  assert.equal(parseDelimitedText('Student ID\tLesson 1\n910201\t95\n').delimiter, '\t');
  assert.equal(parseDelimitedText('Student ID;Lesson 1\n910201;95\n').delimiter, ';');
  assert.deepEqual(parseDelimitedText('a,"say ""hi""",c\n').rows, [['a', 'say "hi"', 'c']]);
});

test('score cells: numbers, percents, points, excused and blank are told apart', () => {
  assert.deepEqual(parseScoreCell('85'), { value: 85, kind: 'number', text: '85' });
  assert.deepEqual(parseScoreCell('85%'), { value: 85, kind: 'percent', text: '85%' });
  assert.deepEqual(parseScoreCell('17/20'), { value: 85, kind: 'points', earned: 17, possible: 20, text: '17/20' });
  assert.equal(parseScoreCell('EX').kind, 'excused');
  assert.equal(parseScoreCell('').kind, 'blank');
  assert.equal(parseScoreCell('M').kind, 'missing-mark');
  assert.equal(parseScoreCell('abc').kind, 'text');
});

const WIDE = [
  'Gradebook export (synthetic),,,,,',
  'Course: Algebra I (synthetic),,,,,',
  'Student ID,Student Name,Lesson 4 - Classwork,Lesson 4 - DOL,Quiz 2,Cycle Average',
  'Category,,Daily,Daily,Major,',
  'Points Possible,,100,100,100,',
  '910201,"Sample, Avery",85,40,72,66.5',
  '910299,"Other, Student",100,100,100,100',
].join('\n');

test('a wide gradebook (one row per student) is detected past a preamble, with category and points rows', () => {
  const parsed = parseDelimitedText(WIDE);
  const layout = detectGradebookLayout(parsed.rows);
  assert.equal(layout.layout, GRADEBOOK_LAYOUT.WIDE);
  assert.equal(layout.headerIndex, 2);
  assert.equal(layout.columns.studentId, 0);
  assert.deepEqual(layout.itemColumns.map((column) => column.name), ['Lesson 4 - Classwork', 'Lesson 4 - DOL', 'Quiz 2']);
  assert.equal(layout.columns.officialAverage, 5, 'a column named like an average is the official average, not an item');
  assert.deepEqual(Object.keys(layout.metadataRows).sort(), ['category', 'pointsPossible']);
});

test('only the selected student\'s row is kept; everyone else is counted and discarded', () => {
  const parsed = parseDelimitedText(WIDE);
  const result = extractStudentGradebook({ rows: parsed.rows, layout: detectGradebookLayout(parsed.rows), student });
  assert.equal(result.matchedBy, 'sis-id');
  assert.equal(result.otherStudentRowsDiscarded, 1);
  assert.deepEqual(result.items.map((item) => [item.name, item.category, item.score, item.pointsPossible]), [
    ['Lesson 4 - Classwork', 'Daily', 85, 100],
    ['Lesson 4 - DOL', 'Daily', 40, 100],
    ['Quiz 2', 'Major', 72, 100],
  ]);
  assert.equal(result.officialAverage, 66.5);
  assert.ok(!JSON.stringify(result).includes('Other, Student'), 'no other student\'s name survives');
  assert.ok(!JSON.stringify(result).includes('910299'), 'no other student\'s id survives');
});

const LONG = [
  'Student ID,Student,Assignment,Category,Score,Max Points,Category Weight,Due Date',
  '910201,"Sample, Avery",Lesson 4 Classwork,Daily,85,100,40,2026-09-10',
  '910201,"Sample, Avery",Lesson 4 DOL,Daily,40,100,40,2026-09-10',
  '910201,"Sample, Avery",Quiz 2,Major,72,100,60,2026-09-12',
  '910201,"Sample, Avery",Lab notebook,Daily,EX,100,40,2026-09-11',
  '910299,"Other, Student",Quiz 2,Major,100,100,60,2026-09-12',
].join('\r\n');

test('a long gradebook (one row per item) keeps category, points, weight and due date', () => {
  const parsed = parseDelimitedText(LONG);
  const layout = detectGradebookLayout(parsed.rows);
  assert.equal(layout.layout, GRADEBOOK_LAYOUT.LONG);
  const result = extractStudentGradebook({ rows: parsed.rows, layout, student });
  assert.equal(result.items.length, 4);
  const lab = result.items.find((item) => item.name === 'Lab notebook');
  assert.equal(lab.excused, true);
  assert.equal(lab.score, null);
  assert.deepEqual(result.categories, [{ name: 'Daily', weight: 40 }, { name: 'Major', weight: 60 }]);
  assert.equal(result.items[0].dueDate, '2026-09-10');
  assert.equal(result.officialAverage, null);
});

test('MathMaster\'s own TEAMS file (two columns, no header) is recognised as an export, not a gradebook', () => {
  const parsed = parseDelimitedText('910201,85\r\n910299,100\r\n');
  const layout = detectGradebookLayout(parsed.rows, { fileName: 'Classwork.csv' });
  assert.equal(layout.layout, GRADEBOOK_LAYOUT.MATHMASTER_TEAMS);
  const result = extractStudentGradebook({ rows: parsed.rows, layout, student, fileName: 'Classwork.csv' });
  assert.deepEqual(result.items.map((item) => [item.name, item.score]), [['Classwork.csv', 85]]);
  assert.match(result.notes.join(' '), /MathMaster grade export/);
});

test('a student is matched by SIS id or MathMaster id only; a name match must be confirmed by the teacher', () => {
  const rows = parseDelimitedText('Student,Lesson 1\n"Sample, Avery",90\n').rows;
  const layout = detectGradebookLayout(rows);
  const proposed = extractStudentGradebook({ rows, layout, student });
  assert.equal(proposed.matchedBy, null);
  assert.equal(proposed.items.length, 0);
  assert.equal(proposed.nameCandidates.length, 1, 'the name match is offered, not applied');
  const confirmed = extractStudentGradebook({ rows, layout, student, confirmedRowIndex: proposed.nameCandidates[0].rowIndex });
  assert.equal(confirmed.matchedBy, 'teacher-confirmed-row');
  assert.equal(confirmed.items[0].score, 90);
});

test('an unrecognisable file is refused with a reason, never half-read', () => {
  const layout = detectGradebookLayout(parseDelimitedText('hello\nworld\n').rows);
  assert.equal(layout.layout, GRADEBOOK_LAYOUT.UNKNOWN);
  assert.match(layout.reason, /student/i);
});
