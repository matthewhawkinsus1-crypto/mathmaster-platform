import { useEffect, useMemo, useState } from 'react';
import {
  authoritativeSisStudentId,
  createExportSnapshot,
  teamsCsv,
  TRANSFER_STATE,
  transferFileName,
  transferSnapshotId,
  validSisStudentId,
} from '../../platform/gradeTransfer/gradeTransferModel.js';
import { buildGradebookZip } from '../../platform/gradeTransfer/gradeTransferPackage.js';
import {
  confirmTransferUploaded,
  loadTeacherGradeTransferState,
  persistTransferSnapshot,
  setStudentSisId,
} from '../../platform/gradeTransfer/gradeTransferStore.js';
import { resolveStudentFinalDeadlineFromAssignment } from '../../platform/gradeTransfer/studentDeadlineResolver.js';
import { newestFirst, projectGradeTransferUnits } from '../../platform/gradeTransfer/gradeTransferProjection.js';

const downloadable = new Set([TRANSFER_STATE.READY_TO_EXPORT, TRANSFER_STATE.UPDATE_REQUIRED]);
const download = (bytes, fileName, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const id = (prefix) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID()}`;

const unitsForPackage = (unit) => {
  if (!Array.isArray(unit.sectionUnits) || !unit.sectionUnits.length) {
    return downloadable.has(unit.state) ? [unit] : [];
  }
  if (unit.state === TRANSFER_STATE.UPDATE_REQUIRED) {
    return unit.sectionUnits.filter((section) => section.state === TRANSFER_STATE.UPDATE_REQUIRED);
  }
  if (unit.state === TRANSFER_STATE.READY_TO_EXPORT) {
    return unit.sectionUnits.filter((section) => [
      TRANSFER_STATE.READY_TO_EXPORT,
      TRANSFER_STATE.NO_TRANSFER_REQUIRED,
    ].includes(section.state));
  }
  return [];
};

const snapshotMatchesUnit = (snapshot, unit) => (
  snapshot.classId === unit.classId
  && snapshot.assignmentId === unit.assignmentId
  && String(snapshot.sectionKey || '') === String(unit.sectionKey || '')
);

export default function GradeTransferCenter({
  classes,
  assignments,
  students,
  teacherUid,
  teacherEmail,
  isRootAdmin = false,
  resolveStudentFinalDeadline = resolveStudentFinalDeadlineFromAssignment,
}) {
  const [snapshots, setSnapshots] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [practicePasses, setPracticePasses] = useState(new Set());
  const [sisOverrides, setSisOverrides] = useState({});
  const [sisDrafts, setSisDrafts] = useState({});

  const authorizedClasses = useMemo(
    () => projectGradeTransferUnits({ classes, teacherEmail, isRootAdmin }).authorizedClasses,
    [classes, teacherEmail, isRootAdmin],
  );
  const authorizedClassIds = useMemo(
    () => authorizedClasses.map((entry) => entry.classId),
    [authorizedClasses],
  );

  const projectedStudents = useMemo(
    () => (students || []).map((student) => (
      sisOverrides[student.id]
        ? { ...student, sisStudentId: sisOverrides[student.id] }
        : student
    )),
    [students, sisOverrides],
  );

  const refreshTransferState = async () => {
    const state = await loadTeacherGradeTransferState({ classIds: authorizedClassIds });
    setSnapshots(state.snapshots);
    setPracticePasses(state.practicePasses);
    return state;
  };

  useEffect(() => {
    let cancelled = false;
    loadTeacherGradeTransferState({ classIds: authorizedClassIds })
      .then((state) => {
        if (cancelled) return;
        setSnapshots(state.snapshots);
        setPracticePasses(state.practicePasses);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message);
      });
    return () => { cancelled = true; };
  }, [authorizedClassIds]);

  const units = useMemo(
    () => projectGradeTransferUnits({
      classes,
      assignments,
      students: projectedStudents,
      teacherEmail,
      isRootAdmin,
      snapshots,
      practicePasses,
      resolveStudentFinalDeadline,
    }).units,
    [
      classes,
      assignments,
      projectedStudents,
      teacherEmail,
      isRootAdmin,
      snapshots,
      practicePasses,
      resolveStudentFinalDeadline,
    ],
  );

  const sisProblems = useMemo(() => {
    const authorized = new Set(authorizedClassIds);
    return projectedStudents
      .filter((student) => authorized.has(student.classId))
      .filter((student) => !validSisStudentId(authoritativeSisStudentId(student)))
      .map((student) => ({
        studentId: student.id,
        name: student.displayName || student.name || student.id,
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base', numeric: true }));
  }, [authorizedClassIds, projectedStudents]);

  const prepare = async (chosen) => {
    const readyGroups = chosen.filter((unit) => downloadable.has(unit.state));
    const packageUnits = readyGroups.flatMap(unitsForPackage);
    if (!packageUnits.length) {
      setMessage(
        sisProblems.length
          ? 'Fix the missing/non-numeric SIS Student IDs before exporting this grade package.'
          : 'No selected transfer has finalized section grades ready to export.',
      );
      return;
    }
    setBusy(true);
    try {
      const packageId = id('package');
      for (const unit of packageUnits.filter((entry) => entry.rows.length)) {
        const snapshot = createExportSnapshot({
          unit,
          transferId: transferSnapshotId(unit),
          teacherUid,
          teacherEmail,
          packageId,
        });
        await persistTransferSnapshot(snapshot);
      }
      download(buildGradebookZip(packageUnits), `${packageId}.zip`, 'application/zip');
      await refreshTransferState();
      setSelected(new Set());
      setMessage('Package downloaded. Each lesson assignment is a folder with separate Warm-Up, Classwork, Practice, and DOL grade files when those sections exist. Upload is not recorded until you mark the export uploaded.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSisId = async (studentId) => {
    const sisStudentId = String(sisDrafts[studentId] || '').trim();
    if (!/^\d{1,20}$/.test(sisStudentId)) {
      setMessage('SIS Student ID must contain 1–20 digits with no letters, spaces, or punctuation.');
      return;
    }
    setBusy(true);
    try {
      const result = await setStudentSisId({ studentId, sisStudentId });
      setSisOverrides((current) => ({ ...current, [studentId]: result.sisStudentId || sisStudentId }));
      setSisDrafts((current) => ({ ...current, [studentId]: '' }));
      setMessage(`Saved TEAMS SIS ID ${result.sisStudentId || sisStudentId} for this student. Their MathMaster account key and existing work were not changed.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = units.filter((unit) => downloadable.has(unit.state) && unitsForPackage(unit).length);

  return <section aria-labelledby="grade-transfer-heading">
    <h2 id="grade-transfer-heading" style={{ marginTop: 0 }}>Grade Transfer Center</h2>
    <p>Prepare finalized MathMaster grades for Frontline/Prologic TEAMS. Lesson assignments export as one folder containing separate two-column, no-header CSVs for Warm-Up, Classwork, Practice, and DOL. Secure/non-sectioned assessments keep their single assignment-grade file.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      <button type="button" onClick={() => setSelected(new Set(ready.map((unit) => unit.key)))}>Select all ready</button>
      <button type="button" disabled={busy || !selected.size} onClick={() => prepare(units.filter((unit) => selected.has(unit.key)))} style={{ background: '#174ea6', color: '#fff', border: 0, borderRadius: 7, padding: '9px 14px', fontWeight: 800 }}>Prepare Gradebook Package</button>
      <button type="button" disabled={busy || !units.some((unit) => unit.state === TRANSFER_STATE.UPDATE_REQUIRED)} onClick={() => prepare(units.filter((unit) => unit.state === TRANSFER_STATE.UPDATE_REQUIRED))}>Prepare Update Package</button>
    </div>

    {sisProblems.length > 0 && (
      <section style={{ marginBottom: 14, padding: 14, border: '1px solid #f0c36d', borderRadius: 9, background: '#fff8e1' }}>
        <h3 style={{ margin: '0 0 6px' }}>Fix TEAMS Student IDs before export</h3>
        <p style={{ margin: '0 0 12px', color: '#5f6368' }}>
          Keep each student&apos;s existing MathMaster account and work exactly where it is. Add the official district/SIS number here; TEAMS exports use that digits-only value instead of the MathMaster account key.
        </p>
        <div style={{ display: 'grid', gap: 9 }}>
          {sisProblems.map((problem) => (
            <div key={problem.studentId} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(150px, 220px) auto', gap: 8, alignItems: 'center' }}>
              <div>
                <strong>{problem.name}</strong>
                <div style={{ color: '#5f6368', fontSize: 11 }}>MathMaster account: {problem.studentId}</div>
              </div>
              <input
                aria-label={`SIS Student ID for ${problem.name}`}
                value={sisDrafts[problem.studentId] || ''}
                onChange={(event) => setSisDrafts((current) => ({
                  ...current,
                  [problem.studentId]: event.target.value.replace(/\D/g, '').slice(0, 20),
                }))}
                inputMode="numeric"
                placeholder="District student ID"
                style={{ minHeight: 36, padding: '0 9px', border: '1px solid #c7cdd6', borderRadius: 6 }}
              />
              <button type="button" disabled={busy || !sisDrafts[problem.studentId]} onClick={() => saveSisId(problem.studentId)}>Save ID</button>
            </div>
          ))}
        </div>
      </section>
    )}

    {message && <div role="status" style={{ padding: 10, marginBottom: 12, background: '#e8f0fe', borderRadius: 7 }}>{message}</div>}
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th></th><th>Assignment</th><th>Class / period</th><th>Final deadline</th><th>Finalized</th><th>Extensions</th><th>Status</th><th>Changed</th><th>Next action</th></tr></thead><tbody>
      {units.map((unit) => {
        const transferUnits = Array.isArray(unit.sectionUnits) && unit.sectionUnits.length ? unit.sectionUnits : [unit];
        const latestByUnit = transferUnits
          .map((entry) => snapshots.filter((item) => snapshotMatchesUnit(item, entry)).sort(newestFirst)[0])
          .filter(Boolean);
        const pendingUploads = latestByUnit.filter((snapshot) => !snapshot.uploadConfirmedAt);
        const sectionLabels = transferUnits.filter((entry) => entry.sectionKey).map((entry) => entry.sectionLabel);
        return <tr key={unit.key} style={{ borderTop: '1px solid #dadce0' }}>
          <td><input type="checkbox" aria-label={`Select ${unit.assignmentTitle} for ${unit.classLabel}`} checked={selected.has(unit.key)} disabled={!downloadable.has(unit.state) || !unitsForPackage(unit).length} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(unit.key); else next.delete(unit.key); return next; })} /></td>
          <td style={{ padding: 10 }}>
            <strong>{unit.assignmentTitle}</strong>
            {sectionLabels.length > 0 && <div style={{ color: '#5f6368', fontSize: 12 }}>{sectionLabels.join(' • ')}</div>}
            {(unit.withheld.length || unit.problems.length || unit.excused?.length) > 0 && <details>
              <summary>Inspect withheld/problem/excused students</summary>
              {[...unit.withheld, ...unit.problems, ...(unit.excused || [])].map((item) => <div key={`${item.studentId}-${item.reason}`}>{item.name}: {item.reason}</div>)}
            </details>}
          </td>
          <td>{unit.classLabel}</td><td>{unit.ordinaryDeadline ? new Date(unit.ordinaryDeadline).toLocaleString() : 'Needs review'}</td><td>{unit.finalizedCount}</td><td>{unit.extensionCount}</td><td><strong>{unit.state.replaceAll('_', ' ')}</strong></td><td>{unit.changedCount}</td>
          <td style={{ padding: 8 }}>
            <button type="button" disabled={busy || !downloadable.has(unit.state) || !unitsForPackage(unit).length} onClick={() => prepare([unit])}>{unit.sectionUnits?.length ? 'Export assignment folder' : 'Individual export'}</button>
            {pendingUploads.length > 0 && <button type="button" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                for (const snapshot of pendingUploads) {
                  await confirmTransferUploaded({ transferId: snapshot.transferId || snapshot.id });
                }
                await refreshTransferState();
                setMessage(`Marked ${pendingUploads.length} grade file${pendingUploads.length === 1 ? '' : 's'} uploaded to TEAMS.`);
              } catch (error) {
                setMessage(error.message);
              } finally {
                setBusy(false);
              }
            }}>Mark Uploaded to TEAMS</button>}
          </td>
        </tr>;
      })}
    </tbody></table></div>
    <p style={{ color: '#5f6368', fontSize: 12 }}>TEAMS files contain only the verified numeric SIS Student ID and grade. Student names and MathMaster account keys stay teacher-facing and never appear in the CSV.</p>
  </section>;
}

export { teamsCsv, transferFileName };
