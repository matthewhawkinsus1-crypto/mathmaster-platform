import { useEffect, useMemo, useState } from 'react';
import {
  authoritativeSisStudentId,
  createExportSnapshot,
  gradePackageFileName,
  sharedSisStudentIds,
  sisStudentIdIsShared,
  teamsCsv,
  transferFileName,
  transferSnapshotId,
  transferStudentLabel,
  TRANSFER_STATE,
  validSisStudentId,
} from '../../platform/gradeTransfer/gradeTransferModel.js';
import {
  compareStudentsByName, formatStudentLabel, formatStudentName, studentIdentityIndexFor, studentSearchText,
} from '../../platform/studentName.js';
import {
  DISTRICT_ID_COPY,
  DISTRICT_ID_STATUS,
  describeStudentDistrictId,
  districtIdSavedMessage,
  validateDistrictIdDraft,
} from '../../platform/teacher/studentDistrictIdModel.js';
import Dialog from '../../ui/Dialog.jsx';
import DistrictIdEditor from './DistrictIdEditor.jsx';
import { buildGradebookZip } from '../../platform/gradeTransfer/gradeTransferPackage.js';
import {
  confirmTransferUploaded,
  loadTeacherGradeTransferState,
  persistTransferSnapshot,
  setStudentSisId,
} from '../../platform/gradeTransfer/gradeTransferStore.js';
import { resolveStudentFinalDeadlineFromAssignment } from '../../platform/gradeTransfer/studentDeadlineResolver.js';
import { projectGradeTransferUnits } from '../../platform/gradeTransfer/gradeTransferProjection.js';
import {
  buildExportPlan,
  buildSnapshotDownloadUnits,
  describeUnitExport,
  EXPORT_STATUS,
  exportStatusLabel,
  lastFileRowsWithOutdatedDistrictId,
  pendingUploadIds,
} from '../../platform/gradeTransfer/gradeTransferHistory.js';
import { resolveAssignmentGradingPeriod } from '../../platform/student/gradingPeriods.js';
import './teacherWorkspace.css';

/*
 * GRADE EXPORT — ONE ENGINE, ANY SCOPE, ALWAYS REPEATABLE.
 *
 * Every route into exporting lands here: the sidebar, an assignment's hub, a
 * class's gradebook, an Action Center row. The route only chooses the starting
 * scope (`initialScope`); the export itself is always the same projection
 * (projectGradeTransferUnits), the same immutable snapshots and the same ZIP.
 *
 * What changed for teachers (see docs/TEACHER_UX_AUDIT.md, "Grade Export"):
 *   - scope first: one class, several classes, one assignment, this marking
 *     period — instead of one flat list of every assignment in every class;
 *   - "Exported" is history, never a lock. Export again, export only what
 *     changed, or download the exact file that went out last time;
 *   - a review step says exactly what is in the file before it is made;
 *   - a failed save is reported per file and retried safely (snapshot ids are
 *     content hashes, so a retry never duplicates anything).
 */

const STATUS_GROUPS = [
  { id: 'toExport', label: 'To export', statuses: [EXPORT_STATUS.READY, EXPORT_STATUS.CHANGED] },
  { id: 'needsFixing', label: 'Needs fixing', statuses: [EXPORT_STATUS.ID_PROBLEM, EXPORT_STATUS.NEEDS_REVIEW] },
  { id: 'exported', label: 'Exported', statuses: [EXPORT_STATUS.EXPORTED, EXPORT_STATUS.UPLOADED] },
  { id: 'notReady', label: 'Not ready yet', statuses: [EXPORT_STATUS.NOT_DUE, EXPORT_STATUS.WAITING_EXTENSION, EXPORT_STATUS.NOTHING_TO_SEND] },
];
const groupOf = (status) => STATUS_GROUPS.find((group) => group.statuses.includes(status))?.id || 'notReady';
const GROUP_ORDER = Object.fromEntries(STATUS_GROUPS.map((group, index) => [group.id, index]));

const download = (bytes, fileName, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const id = (prefix) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID()}`;
const formatDue = (value) => (value
  ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'No final deadline');

export default function GradeTransferCenter({
  classes,
  assignments,
  students,
  teacherUid,
  teacherEmail,
  isRootAdmin = false,
  resolveStudentFinalDeadline = resolveStudentFinalDeadlineFromAssignment,
  gradingPeriodSettings = null,
  initialScope = null,
  onOpenGrades = null,
  onOpenAssignment = null,
  // (classIds) => void. The classes this screen can export right now (the
  // class filter, or every authorized class), so each student's own controls
  // — a reopen holds the row, an individual cutoff withholds it — are read for
  // exactly those classes (platform/teacher/teacherClassControls.js).
  onClassScopeChange = null,
}) {
  const [snapshots, setSnapshots] = useState([]);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [practicePasses, setPracticePasses] = useState(new Set());
  const [sisOverrides, setSisOverrides] = useState({});
  const [sisDrafts, setSisDrafts] = useState({});
  // The district ID list: which student's ID is being corrected
  // ({ studentId, error }), and the list's own search.
  const [districtEditor, setDistrictEditor] = useState(null);
  const [districtSearch, setDistrictSearch] = useState('');
  const [classFilter, setClassFilter] = useState(() => new Set(initialScope?.classIds || []));
  const [assignmentFilter, setAssignmentFilter] = useState(() => initialScope?.assignmentId || null);
  const [periodFilter, setPeriodFilter] = useState(() => (initialScope?.assignmentId ? 'all' : 'current'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState(null);

  // A new hand-off (another assignment's "Export grades") replaces the scope.
  const scopeKey = initialScope ? `${(initialScope.classIds || []).join(',')}|${initialScope.assignmentId || ''}|${initialScope.nonce || ''}` : '';
  useEffect(() => {
    if (!scopeKey) return;
    setClassFilter(new Set(initialScope.classIds || []));
    setAssignmentFilter(initialScope.assignmentId || null);
    setPeriodFilter(initialScope.assignmentId ? 'all' : 'current');
    setStatusFilter('all');
    setSelected(new Set());
  }, [scopeKey]);

  const authorizedClasses = useMemo(
    () => projectGradeTransferUnits({ classes, teacherEmail, isRootAdmin }).authorizedClasses,
    [classes, teacherEmail, isRootAdmin],
  );
  const authorizedClassIds = useMemo(
    () => authorizedClasses.map((entry) => entry.classId),
    [authorizedClasses],
  );
  const exportableClassKey = (classFilter.size ? authorizedClassIds.filter((classId) => classFilter.has(classId)) : authorizedClassIds).join('|');
  useEffect(() => {
    if (typeof onClassScopeChange === 'function') onClassScopeChange(exportableClassKey ? exportableClassKey.split('|') : []);
  }, [exportableClassKey, onClassScopeChange]);
  useEffect(() => () => {
    if (typeof onClassScopeChange === 'function') onClassScopeChange([]);
  }, [onClassScopeChange]);

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
    setStateLoaded(true);
    return state;
  };

  useEffect(() => {
    let cancelled = false;
    loadTeacherGradeTransferState({ classIds: authorizedClassIds })
      .then((state) => {
        if (cancelled) return;
        setSnapshots(state.snapshots);
        setPracticePasses(state.practicePasses);
        setStateLoaded(true);
      })
      .catch((error) => {
        if (!cancelled) setMessage({ tone: 'danger', text: `Export history could not load: ${error.message}. Nothing is exported until it does, so a file is never made without knowing what was sent before.` });
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

  const assignmentsById = useMemo(() => new Map((assignments || []).map((assignment) => [assignment.id, assignment])), [assignments]);
  const periodOf = (unit) => resolveAssignmentGradingPeriod(assignmentsById.get(unit.assignmentId) || null, gradingPeriodSettings || {});
  const periodLabelOf = (unit) => periodOf(unit).label;

  const summaries = useMemo(() => new Map(units.map((unit) => [unit.key, describeUnitExport({ unit, snapshots })])), [units, snapshots]);

  const periodOptions = useMemo(() => {
    const seen = new Map();
    units.forEach((unit) => {
      const period = resolveAssignmentGradingPeriod(assignmentsById.get(unit.assignmentId) || null, gradingPeriodSettings || {});
      if (!seen.has(period.id)) seen.set(period.id, period);
    });
    return [...seen.values()].sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || (right.order || 0) - (left.order || 0));
  }, [units, assignmentsById, gradingPeriodSettings]);

  const inScope = (unit, { ignoreStatus = false } = {}) => {
    if (classFilter.size && !classFilter.has(unit.classId)) return false;
    if (assignmentFilter && unit.assignmentId !== assignmentFilter) return false;
    if (periodFilter === 'current' && !periodOf(unit).isCurrent) return false;
    if (periodFilter !== 'current' && periodFilter !== 'all' && periodOf(unit).id !== periodFilter) return false;
    const needle = search.trim().toLowerCase();
    if (needle && !`${unit.assignmentTitle} ${unit.classLabel}`.toLowerCase().includes(needle)) return false;
    if (!ignoreStatus && statusFilter !== 'all' && groupOf(summaries.get(unit.key)?.status) !== statusFilter) return false;
    return true;
  };

  const scopedIgnoringStatus = units.filter((unit) => inScope(unit, { ignoreStatus: true }));
  const statusCounts = STATUS_GROUPS.reduce((counts, group) => ({
    ...counts,
    [group.id]: scopedIgnoringStatus.filter((unit) => groupOf(summaries.get(unit.key)?.status) === group.id).length,
  }), {});
  const visible = scopedIgnoringStatus
    .filter((unit) => statusFilter === 'all' || groupOf(summaries.get(unit.key)?.status) === statusFilter)
    .sort((left, right) => (GROUP_ORDER[groupOf(summaries.get(left.key)?.status)] - GROUP_ORDER[groupOf(summaries.get(right.key)?.status)])
      || ((right.ordinaryDeadline || 0) - (left.ordinaryDeadline || 0))
      || String(left.assignmentTitle).localeCompare(String(right.assignmentTitle)));

  const classGroups = useMemo(() => {
    const byClass = new Map();
    visible.forEach((unit) => {
      if (!byClass.has(unit.classId)) byClass.set(unit.classId, { classId: unit.classId, label: unit.classLabel, units: [] });
      byClass.get(unit.classId).units.push(unit);
    });
    const order = new Map(authorizedClasses.map((entry, index) => [entry.classId, index]));
    return [...byClass.values()].sort((left, right) => (order.get(left.classId) ?? 0) - (order.get(right.classId) ?? 0));
  }, [visible, authorizedClasses]);

  // Held-back/problem rows carry studentId + a real name or null; they are
  // named from the roster the screen already holds (no extra read), so a name
  // corrected since is shown, and a nameless student reads "Name unavailable ·
  // ID 101410" rather than the bare id.
  const identityIndex = useMemo(() => studentIdentityIndexFor(students || []), [students]);
  const personLabel = (row) => transferStudentLabel(row, identityIndex);

  // District IDs more than one student carries: their rows are held back
  // (gradeTransferModel.js), so they are listed for repair here too.
  const sharedDistrictIds = useMemo(() => sharedSisStudentIds(projectedStudents), [projectedStudents]);

  const sisProblems = useMemo(() => {
    const scopeClasses = classFilter.size ? classFilter : new Set(authorizedClassIds);
    return projectedStudents
      .filter((student) => scopeClasses.has(student.classId))
      .filter((student) => !validSisStudentId(authoritativeSisStudentId(student))
        || sisStudentIdIsShared(sharedDistrictIds, authoritativeSisStudentId(student)))
      .sort(compareStudentsByName)
      .map((student) => ({
        studentId: student.id,
        // The name, or "Name unavailable · ID x": two nameless students in this
        // list must still be told apart, and the id is never shown AS the name.
        name: formatStudentLabel(student),
        shared: validSisStudentId(authoritativeSisStudentId(student)),
      }));
  }, [authorizedClassIds, projectedStudents, classFilter, sharedDistrictIds]);

  // Every student in scope, for checking or correcting a district ID that
  // looks valid but is wrong — the case the repair list above cannot see.
  const districtRoster = useMemo(() => {
    const scopeClasses = classFilter.size ? classFilter : new Set(authorizedClassIds);
    return projectedStudents
      .filter((student) => scopeClasses.has(student.classId))
      .sort(compareStudentsByName)
      .map((student) => ({ student, district: describeStudentDistrictId(student) }));
  }, [authorizedClassIds, projectedStudents, classFilter]);
  const differingDistrictIds = districtRoster.filter((entry) => entry.district.status === DISTRICT_ID_STATUS.DIFFERS).length;
  const districtNeedle = districtSearch.trim().toLowerCase();
  const visibleDistrictRoster = districtNeedle
    ? districtRoster.filter(({ student }) => studentSearchText(student).includes(districtNeedle))
    : districtRoster;

  const selectable = (unit) => Boolean(summaries.get(unit.key)?.canExport) && stateLoaded;
  const selectedUnits = units.filter((unit) => selected.has(unit.key));
  const toggleSelected = (unit, checked) => setSelected((current) => {
    const next = new Set(current);
    if (checked) next.add(unit.key); else next.delete(unit.key);
    return next;
  });
  const selectAll = (list) => setSelected((current) => {
    const next = new Set(current);
    list.filter(selectable).forEach((unit) => next.add(unit.key));
    return next;
  });

  const openReview = (entries, title) => {
    const built = buildExportPlan({ entries, snapshots, periodFor: periodLabelOf });
    if (built.empty) {
      setMessage({ tone: 'warning', text: sisProblems.length
        ? 'Add the missing district student IDs before exporting this grade package.'
        : 'Nothing in this selection has a finalized grade to export yet.' });
      return;
    }
    // One package id per reviewed export: a retry after a partial save failure
    // is the same export, so it must not be counted as a second one.
    setPlan({ ...built, title, packageId: id('package') });
  };

  const runExport = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const packageId = plan.packageId || id('package');
      const toPersist = plan.packageUnits.filter((unit) => unit.rows.length);
      // Every file is saved before anything downloads, and each save is
      // idempotent (the id is a hash of the rows). A partial failure therefore
      // stops the download, names what failed, and a retry cannot duplicate.
      const results = await Promise.allSettled(toPersist.map((unit) => persistTransferSnapshot(createExportSnapshot({
        unit,
        transferId: transferSnapshotId(unit),
        teacherUid,
        teacherEmail,
        packageId,
      }))));
      const failed = results
        .map((result, index) => (result.status === 'rejected' ? { unit: toPersist[index], error: result.reason } : null))
        .filter(Boolean);
      if (failed.length) {
        setMessage({
          tone: 'danger',
          text: `The export record could not be saved for ${failed.length} of ${toPersist.length} file${toPersist.length === 1 ? '' : 's'} (${failed.map((entry) => `${entry.unit.classLabel} · ${entry.unit.assignmentTitle}${entry.unit.sectionLabel ? ` · ${entry.unit.sectionLabel}` : ''}`).join('; ')}). Nothing was downloaded. Try again — files that did save are not duplicated. ${failed[0].error?.message || ''}`,
        });
        return;
      }
      download(buildGradebookZip(plan.packageUnits), gradePackageFileName(plan.packageUnits), 'application/zip');
      await refreshTransferState();
      setSelected(new Set());
      setPlan(null);
      setMessage({
        tone: 'success',
        text: `Downloaded ${plan.fileCount} grade file${plan.fileCount === 1 ? '' : 's'} (${plan.gradeCount} grade${plan.gradeCount === 1 ? '' : 's'}). Each lesson is one folder with its Warm-Up, Classwork, Practice and DOL files. Mark it uploaded after it is in TEAMS — you can export it again at any time either way.`,
      });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const downloadAgain = (unit) => {
    const copies = buildSnapshotDownloadUnits({ unit, snapshots });
    if (!copies.length) return;
    download(buildGradebookZip(copies), gradePackageFileName(copies).replace(/\.zip$/, '_COPY.zip'), 'application/zip');
    // An exact copy keeps the district IDs it was made with. If one has been
    // corrected since, say so: uploading the copy would send the old number.
    const outdated = lastFileRowsWithOutdatedDistrictId({ unit, snapshots });
    const students = new Set(outdated.map((entry) => entry.studentId)).size;
    setMessage(outdated.length
      ? { tone: 'warning', text: `Downloaded an exact copy of the last file sent for ${unit.assignmentTitle} · ${unit.classLabel}. Nothing new was recorded. This copy still uses the district ID it was made with for ${students} student${students === 1 ? '' : 's'} whose district ID has been corrected since (${outdated.map((entry) => `district ID ${entry.previousSisStudentId} → ${entry.sisStudentId}`).join(', ')}) — use Export again to send their grades under the corrected ID.` }
      : { tone: 'success', text: `Downloaded an exact copy of the last file sent for ${unit.assignmentTitle} · ${unit.classLabel}. Nothing new was recorded.` });
  };

  const markUploaded = async (unit, summary) => {
    const ids = pendingUploadIds(summary);
    if (!ids.length) return;
    setBusy(true);
    try {
      for (const transferId of ids) await confirmTransferUploaded({ transferId });
      await refreshTransferState();
      setMessage({ tone: 'success', text: `Marked ${ids.length} file${ids.length === 1 ? '' : 's'} for ${unit.assignmentTitle} · ${unit.classLabel} as uploaded. Future “changes only” files start from this upload.` });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const saveSisId = async (studentId) => {
    const checked = validateDistrictIdDraft(sisDrafts[studentId]);
    if (!checked.ok) {
      setMessage({ tone: 'warning', text: checked.error });
      return;
    }
    const sisStudentId = checked.value;
    setBusy(true);
    try {
      const result = await setStudentSisId({ studentId, sisStudentId });
      setSisOverrides((current) => ({ ...current, [studentId]: result.sisStudentId || sisStudentId }));
      setSisDrafts((current) => ({ ...current, [studentId]: '' }));
      const student = projectedStudents.find((entry) => entry.id === studentId);
      setMessage({
        tone: 'success',
        text: districtIdSavedMessage({
          studentName: student ? formatStudentLabel(student, { includeId: true }) : '',
          previousDistrictId: result.previousSisStudentId,
          districtId: result.sisStudentId || sisStudentId,
        }),
      });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  // Correcting a district ID that looks valid but is wrong, from the district
  // ID list: the same callable, so the same checks — digits only, this
  // student's teacher, no other student already using the number.
  const saveDistrictId = async (student, sisStudentId) => {
    const studentId = student.id;
    setBusy(true);
    setDistrictEditor((current) => (current?.studentId === studentId ? { ...current, error: '' } : current));
    try {
      const result = await setStudentSisId({ studentId, sisStudentId });
      setSisOverrides((current) => ({ ...current, [studentId]: result.sisStudentId || sisStudentId }));
      setDistrictEditor(null);
      setMessage({
        tone: 'success',
        text: districtIdSavedMessage({
          studentName: formatStudentLabel(student, { includeId: true }),
          previousDistrictId: result.previousSisStudentId,
          districtId: result.sisStudentId || sisStudentId,
        }),
      });
    } catch (error) {
      setDistrictEditor((current) => (current?.studentId === studentId ? { ...current, error: error.message } : current));
    } finally {
      setBusy(false);
    }
  };

  const toggleClass = (classId) => {
    setSelected(new Set());
    setClassFilter((current) => {
      const next = new Set(current);
      if (next.has(classId)) next.delete(classId); else next.add(classId);
      return next;
    });
  };

  const assignmentScopeTitle = assignmentFilter ? (assignmentsById.get(assignmentFilter)?.title || 'This assignment') : null;
  const selectedGradeCount = selectedUnits.reduce((sum, unit) => sum + (summaries.get(unit.key)?.fullRowCount || 0), 0);

  return <section aria-labelledby="grade-transfer-heading" className="tw-stack" style={{ textAlign: 'left' }}>
    <div>
      <h2 id="grade-transfer-heading" style={{ margin: 0 }}>Grade Export</h2>
      <p className="tw-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
        Final grades as Frontline TEAMS files: one folder per lesson with separate two-column CSVs for Warm-Up, Classwork, Practice and DOL.
        Exporting never locks anything — the same grades can be exported again at any time.
      </p>
    </div>

    <div className="tw-card tw-stack" style={{ gap: 10 }} aria-label="Export scope">
      <div className="tw-row" role="group" aria-label="Classes">
        <span className="tw-small tw-strong">Classes</span>
        <button type="button" className="tw-chip" aria-pressed={classFilter.size === 0} onClick={() => { setSelected(new Set()); setClassFilter(new Set()); }}>All classes</button>
        {authorizedClasses.map((entry) => (
          <button key={entry.classId} type="button" className="tw-chip" aria-pressed={classFilter.has(entry.classId)} onClick={() => toggleClass(entry.classId)}>
            {entry.name || entry.period || entry.classId}
          </button>
        ))}
      </div>
      <div className="tw-row">
        <label className="tw-row tw-small tw-strong" style={{ gap: 6 }}>
          Marking period
          <select className="tw-select" value={periodFilter} onChange={(event) => { setSelected(new Set()); setPeriodFilter(event.target.value); }}>
            <option value="current">Current marking period</option>
            {periodOptions.filter((period) => !period.isCurrent).map((period) => <option key={period.id} value={period.id}>{period.label}{period.archived ? ' (closed)' : ''}</option>)}
            <option value="all">All marking periods</option>
          </select>
        </label>
        <input className="tw-input" type="search" aria-label="Search assignments to export" placeholder="Search assignment or class…" value={search} onChange={(event) => setSearch(event.target.value)} style={{ flex: '1 1 220px', maxWidth: 360 }} />
        {assignmentScopeTitle && (
          <span className="tw-pill" data-tone="primary">
            Assignment: {assignmentScopeTitle}
            <button type="button" className="tw-link" aria-label="Show every assignment" onClick={() => { setAssignmentFilter(null); setPeriodFilter('current'); }} style={{ marginLeft: 4 }}>✕</button>
          </span>
        )}
      </div>
      <div className="tw-row" role="group" aria-label="Show">
        <button type="button" className="tw-chip" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All <span className="tw-chip__count">{scopedIgnoringStatus.length}</span></button>
        {STATUS_GROUPS.map((group) => (
          <button key={group.id} type="button" className="tw-chip" aria-pressed={statusFilter === group.id} onClick={() => setStatusFilter(group.id)}>
            {group.label} <span className="tw-chip__count">{statusCounts[group.id] || 0}</span>
          </button>
        ))}
      </div>
    </div>

    {sisProblems.length > 0 && (
      <details className="tw-disclosure">
        <summary>
          <span className="tw-pill" data-tone="danger">{sisProblems.length}</span>
          student{sisProblems.length === 1 ? ' in this scope needs' : 's in this scope need'} a district student ID before their grades can export
        </summary>
        <div className="tw-disclosure__body tw-stack" style={{ gap: 9 }}>
          <p className="tw-small tw-muted" style={{ margin: 0 }}>
            Their MathMaster account and work stay exactly where they are. TEAMS files use this digits-only district number instead of the MathMaster account key.
          </p>
          {sisProblems.map((problem) => (
            <div key={problem.studentId} className="tw-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ minWidth: 180 }}>
                <span className="tw-strong">{problem.name}</span>
                {problem.shared && <span className="tw-small tw-muted" style={{ display: 'block' }}>Another student has the same district ID. Enter this student&apos;s correct one.</span>}
              </span>
              <span className="tw-row">
                <input
                  className="tw-input"
                  aria-label={`District student ID for ${problem.name}`}
                  value={sisDrafts[problem.studentId] || ''}
                  onChange={(event) => setSisDrafts((current) => ({
                    ...current,
                    [problem.studentId]: event.target.value.replace(/\D/g, '').slice(0, 20),
                  }))}
                  inputMode="numeric"
                  placeholder="District student ID"
                />
                <button type="button" className="tw-btn tw-btn--sm" disabled={busy || !sisDrafts[problem.studentId]} onClick={() => saveSisId(problem.studentId)}>Save ID</button>
              </span>
            </div>
          ))}
        </div>
      </details>
    )}

    {districtRoster.length > 0 && (
      <details className="tw-disclosure" data-district-id-list>
        <summary>
          Check or correct district student IDs
          <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>
            {districtRoster.length} student{districtRoster.length === 1 ? '' : 's'} in this scope
            {differingDistrictIds > 0 && <> · {differingDistrictIds} with a district ID different from their MathMaster ID</>}
          </span>
        </summary>
        <div className="tw-disclosure__body tw-stack" style={{ gap: 9 }}>
          <p className="tw-small tw-muted" style={{ margin: 0 }}>
            TEAMS files use each student&apos;s district ID, never their MathMaster ID. If a district ID is wrong — even one that looks
            like a valid number — correct it here or in Student Access. The student&apos;s MathMaster account, work, grades and sign-in stay
            exactly as they are; only future exports change.
          </p>
          {districtRoster.length > 8 && (
            <input
              className="tw-input"
              type="search"
              aria-label="Find a student's district ID"
              placeholder="Find a student by name or ID…"
              value={districtSearch}
              onChange={(event) => setDistrictSearch(event.target.value)}
              style={{ maxWidth: 320 }}
            />
          )}
          {visibleDistrictRoster.map(({ student, district }) => {
            const label = formatStudentLabel(student, { includeId: true });
            const editing = districtEditor?.studentId === student.id;
            return (
              <div key={student.id} className="tw-row" data-district-id-row={student.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <span className="tw-strong">{formatStudentName(student)}</span>
                  <span className="tw-small tw-muted"> · MathMaster ID {student.id}</span>
                  <span className="tw-small" data-district-id-status={district.status} style={{ display: 'block', color: district.tone === 'warning' ? 'var(--mm-warning-text)' : 'var(--mm-text-muted)' }}>
                    {district.status === DISTRICT_ID_STATUS.SAME && <>District ID: same as the MathMaster ID</>}
                    {district.status === DISTRICT_ID_STATUS.DIFFERS && <><strong>District ID {district.districtId}</strong> · {district.note}</>}
                    {(district.status === DISTRICT_ID_STATUS.MISSING || district.status === DISTRICT_ID_STATUS.INVALID) && <>{district.note}</>}
                  </span>
                </span>
                <button
                  type="button"
                  className="tw-btn tw-btn--sm"
                  aria-expanded={editing}
                  aria-label={`${district.actionLabel} for ${label}`}
                  disabled={busy && !editing}
                  onClick={() => setDistrictEditor(editing ? null : { studentId: student.id, error: '' })}
                >
                  {district.actionLabel}
                </button>
                {editing && (
                  <DistrictIdEditor
                    student={student}
                    studentLabel={label}
                    saving={busy}
                    error={districtEditor.error}
                    onSave={(value) => saveDistrictId(student, value)}
                    onCancel={() => setDistrictEditor(null)}
                  />
                )}
              </div>
            );
          })}
          {districtNeedle && visibleDistrictRoster.length === 0 && (
            <p className="tw-small tw-muted" style={{ margin: 0 }}>No student in this scope matches “{districtSearch.trim()}”.</p>
          )}
          <p className="tw-small tw-muted" style={{ margin: 0 }}>Student Access has the same {DISTRICT_ID_COPY.editAction} control for every student you teach.</p>
        </div>
      </details>
    )}

    {message && <div role="status" className="tw-notice" data-tone={message.tone}>{message.text}</div>}
    {!stateLoaded && !message && <div role="status" className="tw-notice">Loading export history…</div>}

    {classGroups.length === 0 && stateLoaded && (
      <div className="tw-card tw-card--muted">
        <strong>Nothing matches this scope.</strong>
        <div className="tw-small tw-muted">Try “All marking periods”, another class, or clear the search.</div>
      </div>
    )}

    {classGroups.map((group) => {
      const exportable = group.units.filter(selectable);
      return (
        <section key={group.classId} className="tw-class-group" aria-label={`${group.label} grade export`}>
          <div className="tw-class-group__header">
            <strong style={{ color: 'var(--mm-text-strong)' }}>{group.label}</strong>
            <span className="tw-small tw-muted">{group.units.length} assignment{group.units.length === 1 ? '' : 's'}</span>
            <span className="tw-spacer" />
            <button type="button" className="tw-btn tw-btn--sm" disabled={!exportable.length || busy} onClick={() => selectAll(exportable)}>
              {exportable.length ? `Select all ${exportable.length} exportable` : 'Nothing ready to export'}
            </button>
          </div>
          {group.units.map((unit) => {
            const summary = summaries.get(unit.key);
            const status = exportStatusLabel(summary);
            const sections = (unit.sectionUnits || []).map((part) => part.sectionLabel).filter(Boolean);
            // "Changes only" is the established update file: it exists only
            // where a confirmed upload is the baseline and a grade moved since.
            const hasBaselineDelta = (unit.sectionUnits?.length ? unit.sectionUnits : [unit])
              .some((part) => part.state === TRANSFER_STATE.UPDATE_REQUIRED && (part.rows || []).length > 0);
            const people = [...unit.withheld, ...unit.problems, ...(unit.excused || [])];
            return (
              <div key={unit.key} className="tw-export-row" data-export-status={summary?.status}>
                <input
                  type="checkbox"
                  aria-label={`Select ${unit.assignmentTitle} for ${unit.classLabel}`}
                  checked={selected.has(unit.key)}
                  disabled={!selectable(unit) || busy}
                  onChange={(event) => toggleSelected(unit, event.target.checked)}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="tw-row" style={{ gap: 6 }}>
                    {onOpenAssignment
                      ? <button type="button" className="tw-link tw-export-row__title" onClick={() => onOpenAssignment(unit.assignmentId, unit.classId)}>{unit.assignmentTitle}</button>
                      : <span className="tw-export-row__title">{unit.assignmentTitle}</span>}
                    <span className="tw-pill" data-tone={status.tone}>{status.label}</span>
                  </div>
                  <div className="tw-export-row__meta">
                    Final deadline {formatDue(unit.ordinaryDeadline)} · {periodLabelOf(unit)}
                    {sections.length > 0 && <> · {sections.join(' • ')}</>}
                  </div>
                  <div className="tw-export-row__meta">
                    {summary?.fullRowCount || 0} finalized grade{summary?.fullRowCount === 1 ? '' : 's'}
                    {unit.extensionCount > 0 && <> · {unit.extensionCount} held for extensions</>}
                    {summary?.exportCount > 0 && <> · exported {summary.exportCount} time{summary.exportCount === 1 ? '' : 's'}</>}
                    {' · '}{status.detail}
                  </div>
                  {people.length > 0 && (
                    <details style={{ marginTop: 4 }}>
                      <summary className="tw-small tw-link" style={{ display: 'inline' }}>Held back, excused or needing review ({people.length})</summary>
                      <ul className="tw-small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {people.map((item) => <li key={`${item.studentId}-${item.reason}`}>{personLabel(item)}: {item.reason}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="tw-export-row__actions">
                  {hasBaselineDelta && (
                    <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" disabled={busy || !stateLoaded} onClick={() => openReview([{ unit, mode: 'changes' }], 'Export changed grades')}>
                      Export changes ({summary.changedCount})
                    </button>
                  )}
                  {summary?.canExport && (
                    <button
                      type="button"
                      className={`tw-btn tw-btn--sm${hasBaselineDelta ? '' : ' tw-btn--primary'}`}
                      disabled={busy || !stateLoaded}
                      onClick={() => openReview([{ unit, mode: 'full' }], summary.exported ? 'Export again' : 'Export grades')}
                    >
                      {summary.exported ? (hasBaselineDelta ? 'Export all again' : 'Export again') : 'Export'}
                    </button>
                  )}
                  {summary?.pendingUploads?.length > 0 && (
                    <button type="button" className="tw-btn tw-btn--sm" disabled={busy} onClick={() => markUploaded(unit, summary)}>Mark uploaded</button>
                  )}
                  {summary?.canDownloadAgain && (
                    <button
                      type="button"
                      className="tw-btn tw-btn--sm tw-btn--quiet"
                      disabled={busy}
                      onClick={() => downloadAgain(unit)}
                      title={summary.reidentifiedCount
                        ? 'An exact copy of the last file exported — it keeps the district IDs it was made with, including one corrected since. Use Export again for the corrected ID.'
                        : 'An exact copy of the last file exported — nothing new is recorded'}
                    >
                      Download last file
                    </button>
                  )}
                  {onOpenGrades && (
                    <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => onOpenGrades(unit.classId, unit.assignmentId)}>Open grades</button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      );
    })}

    {selected.size > 0 && (
      <div className="tw-selection-bar" role="region" aria-label="Selected exports">
        <strong>{selected.size} selected</strong>
        <span className="tw-small">{new Set(selectedUnits.map((unit) => unit.classId)).size} class{new Set(selectedUnits.map((unit) => unit.classId)).size === 1 ? '' : 'es'} · {selectedGradeCount} grades</span>
        <span className="tw-spacer" />
        <button type="button" className="tw-btn tw-btn--sm" onClick={() => setSelected(new Set())}>Clear</button>
        <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" disabled={busy || !stateLoaded} onClick={() => openReview(selectedUnits.map((unit) => ({ unit, mode: 'full' })), 'Export selected grades')}>Review export…</button>
      </div>
    )}

    {plan && (
      <Dialog className="tw-review" onClose={() => setPlan(null)} closeOnEscape={!busy} aria-labelledby="grade-export-review-title">
        <div className="tw-review__panel">
          <h3 id="grade-export-review-title" style={{ margin: 0 }}>{plan.title}</h3>
          <dl>
            <dt>Classes</dt><dd>{plan.classLabels.join(', ')}</dd>
            <dt>Assignments</dt><dd>{plan.assignmentTitles.length === 1 ? plan.assignmentTitles[0] : `${plan.assignmentTitles.length} assignments`}</dd>
            {plan.periodLabels.length > 0 && <><dt>Marking period</dt><dd>{plan.periodLabels.join(', ')}</dd></>}
            <dt>Files</dt><dd>{plan.fileCount} CSV file{plan.fileCount === 1 ? '' : 's'} · {plan.gradeCount} student grade{plan.gradeCount === 1 ? '' : 's'}</dd>
            <dt>Held back</dt><dd>{plan.withheld.length ? `${plan.withheld.length} with an active extension (${plan.withheld.map(personLabel).join(', ')})` : 'None'}</dd>
            {plan.excused.length > 0 && <><dt>Excused</dt><dd>{plan.excused.length} (no numeric grade is sent)</dd></>}
            <dt>In TEAMS</dt><dd>{!plan.overwrite
              ? 'Answer NO to “Overwrite existing grades?” — first export for these files.'
              : plan.overwriteFileCount === plan.fileCount
                ? 'Answer YES to “Overwrite existing grades?” — this replaces grades already sent.'
                : `Answer YES to “Overwrite existing grades?” for the ${plan.overwriteFileCount} file${plan.overwriteFileCount === 1 ? '' : 's'} sent before and NO for the ${plan.fileCount - plan.overwriteFileCount} new one${plan.fileCount - plan.overwriteFileCount === 1 ? '' : 's'}. MANIFEST.txt in the ZIP says which is which.`}</dd>
            <dt>File name</dt><dd>{gradePackageFileName(plan.packageUnits)}</dd>
            {plan.reidentified.length > 0 && <>
              <dt>District IDs</dt>
              <dd data-reidentified={plan.reidentified.length}>
                Corrected since the last export for {plan.reidentified.length} student{plan.reidentified.length === 1 ? '' : 's'}:{' '}
                {plan.reidentified.map((entry) => `${personLabel(entry)} (district ID ${entry.previousSisStudentId} → ${entry.sisStudentId})`).join(', ')}.
                {' '}This file sends their grades under the corrected ID. A grade TEAMS already accepted under the old ID stays there until you remove it in TEAMS.
              </dd>
            </>}
          </dl>
          {plan.assignmentTitles.length > 1 && (
            <details>
              <summary className="tw-small tw-link" style={{ display: 'inline' }}>Show the {plan.entries.length} assignment files</summary>
              <ul className="tw-small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {plan.entries.map((entry) => <li key={entry.unit.key}>{entry.unit.classLabel} · {entry.unit.assignmentTitle}{entry.mode === 'changes' ? ' (changes only)' : ''}</li>)}
              </ul>
            </details>
          )}
          <div className="tw-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="tw-btn" disabled={busy} onClick={() => setPlan(null)}>Cancel</button>
            <button type="button" className="tw-btn tw-btn--primary" disabled={busy} onClick={runExport} autoFocus>{busy ? 'Saving…' : 'Download ZIP'}</button>
          </div>
        </div>
      </Dialog>
    )}

    <p className="tw-small tw-muted" style={{ margin: 0 }}>TEAMS files contain only the verified numeric district student ID and grade. Student names and MathMaster account keys stay on this screen and never appear in a CSV.</p>
  </section>;
}

export { teamsCsv, transferFileName };
