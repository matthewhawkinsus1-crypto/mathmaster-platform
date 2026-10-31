import assert from 'node:assert/strict';
import http from 'node:http';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Local Firestore emulator is required.');
const { db, fns, teacherRequest } = await import('../integration/canonicalPersistenceHarness.mjs');
const studentId = 'synthetic-review-student';
const classId = 'synthetic-review-class';
const teacherEmail = 'review.teacher@example.test';
const makeAssignment = (id, dueAt, title) => ({ id, title, schemaVersion: 5, assignedClassIds: [classId], releaseAt: '2026-08-01', dueAt, lateDueAt: dueAt, sections: [{ id: 'cw', role: 'classwork', questions: Array.from({ length: 20 }, (_, i) => ({ questionId: `${id}-q${i}`, type: 'numeric', prompt: 'Synthetic question', standard: 'A.5A' })) }] });
const assignments = [makeAssignment('synthetic-history', '2026-09-15T18:00:00Z', 'Synthetic historical assignment'), makeAssignment('synthetic-future', '2099-01-01T18:00:00Z', 'Synthetic new assignment'), { ...makeAssignment('synthetic-secure', '2026-09-15T18:00:00Z', 'Synthetic secure assignment'), secure: true }];
const gradeRef = db.collection('grades').doc(studentId);
const read = async () => ({ student: { ...(await gradeRef.get()).data(), id: studentId }, assignments });
const seed = async () => {
  await db.collection('classes').doc(classId).set({ teacherOfRecord: teacherEmail });
  for (const assignment of assignments) await db.collection('assignments').doc(assignment.id).set(assignment);
  const events = await gradeRef.collection('accommodationAdjustments').get();
  for (const event of events.docs) await event.ref.delete();
  await gradeRef.set({ classId, assignedTeacherEmail: teacherEmail, profile: { supportPlan: { itemReductionHistory: [{ configured: true, status: 'active', effectiveStart: '2026-10-29', revisionId: 'synthetic-r1', percent: 20, appliesTo: [] }] } }, gradesByAssignment: { 'synthetic-history': { 0: { status: 'correct', totalAttempts: 1 } } } });
  return read();
};
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5199');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  try {
    if (req.url === '/seed') { res.end(JSON.stringify(await seed())); return; }
    if (req.url === '/state') { res.end(JSON.stringify(await read())); return; }
    if (req.url !== '/review' || req.method !== 'POST') { res.writeHead(404).end('{}'); return; }
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) throw new Error('Request too large'); }
    const result = await fns.reviewRetroactiveAccommodation.run(teacherRequest({ ...JSON.parse(body), studentId }, teacherEmail));
    res.end(JSON.stringify(result));
  } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message })); }
});
server.listen(5197, '127.0.0.1', () => console.log('Synthetic correction bridge ready'));
