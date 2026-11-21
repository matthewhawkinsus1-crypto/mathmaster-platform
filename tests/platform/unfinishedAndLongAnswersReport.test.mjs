// The read-only count of stored answers that hold an unfinished or an
// over-long entry (#557, #558), for the owner to run against production.
// Grades already given stay as they are: the report counts and writes nothing.
// Here it runs against a database that throws on any write.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource } from './helpers/sourceContract.mjs';
import { readOnlyStore } from './helpers/readOnlyFirestore.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/report-unfinished-and-long-answers.mjs';
const {
  EVIDENCE_FIELDS, EXAM_SESSION_FIELDS, PATH_SUBMISSION_FIELDS, assignmentBoxes, entryKindsOf, parseReportArgs, runUnfinishedAndLongAnswersReport,
} = await import(`../../${SCRIPT}`).catch(() => ({}));

const evidenceDoc = (submittedResponse, isCorrect, extra = {}) => ({
  evidence: { submittedResponse, automaticResult: { isCorrect, graded: true, ...extra }, submittedAt: '2026-11-10T15:00:00.000Z', teacherNote: 'never read' },
});
const fields = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value, isComplete: true })) });
const scalar = (value) => ({ kind: 'scalar', type: 'literal', value, fields: [] });

const seeded = () => {
  const docs = new Map();
  docs.set('grades/S1', { displayName: 'never read' });
  docs.set('grades/S1/responseInspectionEvidence/A1__q0', evidenceDoc(fields({ v: '12 +' }), true));
  docs.set('grades/S1/responseInspectionEvidence/A1__q1', evidenceDoc(fields({ v: '12', w: '4*' }), true));
  docs.set('grades/S1/responseInspectionEvidence/A1__q2', evidenceDoc(fields({ v: '7 -' }), false));
  docs.set('grades/S1/responseInspectionEvidence/A1__q3', evidenceDoc(fields({ v: '12' }), true));
  docs.set('grades/S2/responseInspectionEvidence/A1__q0', evidenceDoc(scalar('w = A/l +'), true));
  docs.set('grades/S2/responseInspectionEvidence/A1__q1', evidenceDoc(fields({ v: `${'+'.repeat(239)}5` }), false));
  docs.set('grades/S2/responseInspectionEvidence/A1__q2', evidenceDoc(fields({ v: `${'+'.repeat(238)}5` }), true));
  docs.set('grades/S2/responseInspectionEvidence/A1__q3', evidenceDoc(fields({ v: '*38' }), true, { graded: false }));
  docs.set('grades/S2/responseInspectionEvidence/A1__q4', evidenceDoc({ kind: 'opaque', type: 'stepAlgebra', value: '{"steps":"x+"}', fields: [] }, true));
  docs.set('grades/S2/responseInspectionEvidence/malformed', evidenceDoc(fields({ v: '12 +' }), true));
  docs.set('grades/S2/responseInspectionEvidence/A1__q5', { evidence: {} });
  docs.set('examSessions/E1', {
    studentId: 'S1', examType: 'never read',
    responses: {
      i1: { responsePayload: { responses: { answer: '5\\cdot' } }, grading: { isCorrect: true } },
      i2: { responsePayload: { responses: { answer: 'x'.repeat(600) } }, grading: { isCorrect: false } },
      i3: { responsePayload: { responses: { answer: '-5' } }, grading: { isCorrect: true } },
      i4: { unanswered: true },
      i5: { responsePayload: { raw: { points: [] } }, grading: { isCorrect: true } },
    },
  });
  docs.set('pathSubmissions/P1', { studentId: 'S3', createdAt: 't', recapJson: JSON.stringify({ response: { kind: 'fields', entries: [{ label: 'Answer', value: 'x=5-' }] }, grading: { isCorrect: true } }) });
  docs.set('pathSubmissions/P2', { studentId: 'S3', createdAt: 't', recapJson: JSON.stringify({ response: { kind: 'fields', entries: [{ label: 'Answer', value: 'x=5' }] }, grading: { isCorrect: true } }) });
  docs.set('pathSubmissions/P3', { studentId: 'S3', createdAt: 't', recapJson: '{not json' });
  docs.set('pathSubmissions/P4', { studentId: 'S3', createdAt: 't' });
  return readOnlyStore(docs);
};

test('a stored box is read with the grader\'s own rule', () => {
  assert.deepEqual(entryKindsOf('12 +'), ['unfinished']);
  assert.deepEqual(entryKindsOf('*38'), ['unfinished']);
  assert.deepEqual(entryKindsOf('12'), []);
  assert.deepEqual(entryKindsOf('x'.repeat(239)), []);
  assert.deepEqual(entryKindsOf('x'.repeat(240)), ['atTheLimit'], 'a box cut to the record\'s 240 was 240 or longer when typed');
  assert.deepEqual(entryKindsOf(`${'x'.repeat(239)}+`), ['unfinished', 'atTheLimit']);
  assert.deepEqual(entryKindsOf(null), []);
  assert.deepEqual(entryKindsOf({ steps: 'x+' }), []);
  assert.deepEqual(assignmentBoxes(fields({ a: '1', b: '2' })), [{ box: 'a', value: '1' }, { box: 'b', value: '2' }]);
  assert.deepEqual(assignmentBoxes(scalar('x+')), [{ box: 'value', value: 'x+' }]);
  assert.deepEqual(assignmentBoxes({ kind: 'opaque', value: '{"a":"x+"}' }), [], 'a tool\'s work is not a typed box');
});

test('the report counts such answers by surface and by the verdict they were given; masked reads; never a write', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runUnfinishedAndLongAnswersReport({ db, pageSize: 2, now: () => Date.UTC(2026, 10, 21, 12) });
  assert.equal(report.readOnly, true);
  assert.equal(report.lengthLimit, 240);
  assert.deepEqual(report.totals.assignments, {
    answersRead: 9,
    notReadable: 2,
    unfinished: { answers: 5, recordedRight: 3, recordedWrong: 1, verdictNotStored: 1 },
    atTheLimit: { answers: 1, recordedRight: 0, recordedWrong: 1, verdictNotStored: 0 },
  });
  assert.deepEqual(report.totals.secure, {
    answersRead: 3,
    notReadable: 1,
    unfinished: { answers: 1, recordedRight: 1, recordedWrong: 0, verdictNotStored: 0 },
    atTheLimit: { answers: 1, recordedRight: 0, recordedWrong: 1, verdictNotStored: 0 },
  });
  assert.deepEqual(report.totals.path, {
    answersRead: 2,
    notReadable: 1,
    unfinished: { answers: 1, recordedRight: 1, recordedWrong: 0, verdictNotStored: 0 },
    atTheLimit: { answers: 0, recordedRight: 0, recordedWrong: 0, verdictNotStored: 0 },
  });
  // The detail names the student by id, the place and the entry, and nothing else.
  const first = report.found.find((entry) => entry.surface === 'assignments' && entry.questionIndex === 1);
  assert.deepEqual(first, {
    surface: 'assignments', studentId: 'S1', assignmentId: 'A1', questionIndex: 1, submittedAt: '2026-11-10T15:00:00.000Z',
    kind: 'unfinished', recorded: 'right', entries: [{ box: 'w', entry: '4*', length: 2 }],
  });
  assert.equal(report.found.length, 9);
  assert.doesNotMatch(JSON.stringify(report), /never read/);
  assert.match(JSON.stringify(report.notCountable), /liveChallenge/);

  assert.deepEqual(attempts, [], 'no write was attempted');
  assert.deepEqual([...new Set(reads)].sort(), ['examSessions', 'group:responseInspectionEvidence', 'pathSubmissions']);
  const maskOf = (label) => JSON.stringify(masks.find(([name]) => name === label)?.[1]);
  assert.equal(maskOf('group:responseInspectionEvidence'), JSON.stringify(EVIDENCE_FIELDS));
  assert.equal(maskOf('examSessions'), JSON.stringify(EXAM_SESSION_FIELDS));
  assert.equal(maskOf('pathSubmissions'), JSON.stringify(PATH_SUBMISSION_FIELDS));

  const one = await runUnfinishedAndLongAnswersReport({ db, surfaces: ['path'] });
  assert.deepEqual(one.surfaces, ['path']);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, SCRIPT), 'utf8')).replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /export const REPORT_DIR = 'release-reports';/);
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports$/m);
  // It re-grades nothing: no grader is loaded, only the entry rule.
  assert.doesNotMatch(source, /answerEquivalence|ordinaryResponseGrading|secureItems|gradeResponse|sameValue/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--surface', 'path']), /--project is required/);
  assert.deepEqual(parseReportArgs(['--project', 'p']).surfaces, ['assignments', 'secure', 'path']);
});
