import { useEffect, useMemo, useState } from 'react';
import { buildTransferUnit, createExportSnapshot, teamsCsv, TRANSFER_STATE, transferFileName, transferSnapshotId } from '../../platform/gradeTransfer/gradeTransferModel.js';
import { buildGradebookZip } from '../../platform/gradeTransfer/gradeTransferPackage.js';
import { confirmTransferUploaded, listTeacherTransferSnapshots, persistTransferSnapshot } from '../../platform/gradeTransfer/gradeTransferStore.js';
import { listTeacherPracticePassRedemptions } from '../../platform/gradeTransfer/gradeTransferStore.js';
import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { canonicalPresentedAssignmentGrade } from '../../platform/grading/canonicalGradeProjection.js';
import { noStudentSpecificFinalDeadline } from '../../platform/gradeTransfer/studentDeadlineResolver.js';
import { authorizedGradeTransferClasses, gradeTransferRoster } from '../../platform/gradeTransfer/gradeTransferScope.js';

const downloadable = new Set([TRANSFER_STATE.READY_TO_EXPORT, TRANSFER_STATE.UPDATE_REQUIRED, TRANSFER_STATE.ROSTER_ID_PROBLEM]);
const download = (bytes, fileName, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const id = (prefix) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID()}`;
const snapshotTime = (value) => typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value || 0).getTime();
const newestFirst = (left, right) => snapshotTime(right.createdAt) - snapshotTime(left.createdAt);

export default function GradeTransferCenter({ classes, assignments, students, teacherUid, teacherEmail, isRootAdmin = false, resolveStudentFinalDeadline = noStudentSpecificFinalDeadline }) {
  const [snapshots, setSnapshots] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [practicePasses, setPracticePasses] = useState(new Set());
  const authorizedClasses = useMemo(() => authorizedGradeTransferClasses({ classes, teacherEmail, isRootAdmin }), [classes, teacherEmail, isRootAdmin]);
  const authorizedClassIds = useMemo(() => authorizedClasses.map((entry) => entry.classId), [authorizedClasses]);
  useEffect(() => { listTeacherTransferSnapshots({ teacherUid, classIds: authorizedClassIds, isRootAdmin }).then(setSnapshots).catch((error) => setMessage(error.message)); }, [teacherUid, authorizedClassIds, isRootAdmin]);
  useEffect(() => { listTeacherPracticePassRedemptions(authorizedClassIds).then(setPracticePasses).catch((error) => setMessage(error.message)); }, [authorizedClassIds]);
  const units = useMemo(() => authorizedClasses.flatMap((classRecord) => (assignments || [])
    .filter((assignment) => assignmentIsForStudent(assignment, { classId: classRecord.classId, classPeriod: classRecord.period }))
    .map((assignment) => {
      const eligible = gradeTransferRoster({ students, classes: authorizedClasses, classId: classRecord.classId });
      const history = snapshots.filter((item) => item.classId === classRecord.classId && item.assignmentId === assignment.id).sort(newestFirst);
      return buildTransferUnit({
        classRecord, assignment, students: eligible,
        projectCanonicalGrade: canonicalPresentedAssignmentGrade,
        hasAuthoritativePracticePass: ({ student }) => practicePasses.has(`${student.id}__${classRecord.classId}__${assignment.id}`),
        resolveStudentFinalDeadline,
        confirmedSnapshot: history.find((item) => item.uploadConfirmedAt), latestExport: history[0],
      });
    })), [authorizedClasses, assignments, students, snapshots, practicePasses, resolveStudentFinalDeadline]);

  const prepare = async (chosen) => {
    const ready = chosen.filter((unit) => unit.rows.length && downloadable.has(unit.state));
    if (!ready.length) return setMessage('No selected transfer has finalized, valid rows to export.');
    setBusy(true);
    try {
      const packageId = id('package');
      for (const unit of ready) {
        const snapshot = createExportSnapshot({ unit, transferId: transferSnapshotId(unit), teacherUid, teacherEmail, packageId });
        await persistTransferSnapshot(snapshot);
      }
      download(buildGradebookZip(ready), `${packageId}.zip`, 'application/zip');
      setSnapshots(await listTeacherTransferSnapshots({ teacherUid, classIds: authorizedClassIds, isRootAdmin })); setSelected(new Set());
      setMessage('Package downloaded. Upload is not recorded until you mark each export uploaded.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const ready = units.filter((unit) => unit.rows.length && downloadable.has(unit.state));

  return <section aria-labelledby="grade-transfer-heading">
    <h2 id="grade-transfer-heading" style={{ marginTop: 0 }}>Grade Transfer Center</h2>
    <p>Prepare finalized MathMaster grades for Frontline/Prologic TEAMS. Every assignment remains a separate two-column, no-header CSV.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      <button type="button" onClick={() => setSelected(new Set(ready.map((unit) => unit.key)))}>Select all ready</button>
      <button type="button" disabled={busy || !selected.size} onClick={() => prepare(units.filter((unit) => selected.has(unit.key)))} style={{ background: '#174ea6', color: '#fff', border: 0, borderRadius: 7, padding: '9px 14px', fontWeight: 800 }}>Prepare Gradebook Package</button>
      <button type="button" disabled={busy || !units.some((unit) => unit.state === TRANSFER_STATE.UPDATE_REQUIRED)} onClick={() => prepare(units.filter((unit) => unit.state === TRANSFER_STATE.UPDATE_REQUIRED))}>Prepare Update Package</button>
    </div>
    {message && <div role="status" style={{ padding: 10, marginBottom: 12, background: '#e8f0fe', borderRadius: 7 }}>{message}</div>}
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th></th><th>Assignment</th><th>Class / period</th><th>Final deadline</th><th>Finalized</th><th>Extensions</th><th>Status</th><th>Changed</th><th>Next action</th></tr></thead><tbody>
      {units.map((unit) => { const latest = snapshots.filter((item) => item.classId === unit.classId && item.assignmentId === unit.assignmentId).sort(newestFirst)[0]; return <tr key={unit.key} style={{ borderTop: '1px solid #dadce0' }}>
        <td><input type="checkbox" aria-label={`Select ${unit.assignmentTitle} for ${unit.classLabel}`} checked={selected.has(unit.key)} disabled={!unit.rows.length || !downloadable.has(unit.state)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(unit.key); else next.delete(unit.key); return next; })} /></td>
        <td style={{ padding: 10 }}><strong>{unit.assignmentTitle}</strong>{(unit.withheld.length || unit.problems.length) > 0 && <details><summary>Inspect withheld/problem students</summary>{[...unit.withheld, ...unit.problems].map((item) => <div key={`${item.studentId}-${item.reason}`}>{item.name}: {item.reason}</div>)}</details>}</td>
        <td>{unit.classLabel}</td><td>{unit.ordinaryDeadline ? new Date(unit.ordinaryDeadline).toLocaleString() : 'Needs review'}</td><td>{unit.finalizedCount}</td><td>{unit.extensionCount}</td><td><strong>{unit.state.replaceAll('_', ' ')}</strong></td><td>{unit.changedCount}</td>
        <td style={{ padding: 8 }}><button type="button" disabled={busy || !unit.rows.length || !downloadable.has(unit.state)} onClick={() => prepare([unit])}>Individual export</button>{latest && !latest.uploadConfirmedAt && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await confirmTransferUploaded({ transferId: latest.transferId || latest.id, actorUid: teacherUid, actorEmail: teacherEmail }); setSnapshots(await listTeacherTransferSnapshots({ teacherUid, classIds: authorizedClassIds, isRootAdmin })); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}>Mark Uploaded to TEAMS</button>}</td>
      </tr>; })}
    </tbody></table></div>
    <p style={{ color: '#5f6368', fontSize: 12 }}>TEAMS files contain only SIS Student ID and grade. Student names appear here for review but never in the CSV.</p>
  </section>;
}

export { teamsCsv, transferFileName };
