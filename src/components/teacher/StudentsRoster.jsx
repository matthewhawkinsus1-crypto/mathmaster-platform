import { useEffect, useMemo, useState } from 'react';
import { deriveDomainReadiness, resolveAdaptiveRigor } from '../../platform/rigor/courseRigor.js';
import { collectStudentEvidence } from '../../masteryEngine.js';
import { evidenceRowsToEvents } from '../../platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from '../../platform/profile/studentLearningProfile.js';
import { adaptLegacyMasteryToPhase5 } from '../../platform/profile/legacyMasteryAdapter.js';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import StudentLearningProfileView from './StudentLearningProfileView.jsx';
import AdaptationReport from './AdaptationReport.jsx';
import { fetchStudentEvidenceEvents } from '../../platform/history/evidencePersistence.js';
import { buildWeeklyPathPlan } from '../../platform/path/weeklyPathPlan.js';
import { compareStudentsByName, formatStudentName, studentSearchText } from '../../platform/studentName';
import MyMathPathApp from '../student/MyMathPathApp.jsx';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions.js';
import { overridesForClassContext, storedPacingForClassContext } from '../../platform/path/pathStore.js';

const tabButton = (active) => ({
  padding: '8px 11px', border: active ? '1px solid #1a73e8' : '1px solid #dadce0', borderRadius: 8,
  background: active ? '#e8f0fe' : '#fff', color: active ? '#174ea6' : '#3c4043', fontWeight: 800, cursor: 'pointer',
});

const pill = (background, color) => ({ display: 'inline-block', padding: '3px 7px', borderRadius: 999, background, color, fontSize: 10, fontWeight: 900 });

export default function StudentsRoster({
  students = [],
  classes = [],
  classPeriods = [],
  courseProfiles = {},
  masteryProfilesByStudentId = {},
  supportOptions = {},
  assignments = [],
  pacingByClass = {},
  skillOverrides = [],
  onChangeClassPeriod,
  onUpdateStudentProfile,
  onToggleStudentSupport,
  onGenerateIEPReport,
  isRootAdmin = false,
  onOpenAdministration,
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [selectedId, setSelectedId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  // Delivered-question evidence for the open student. Loaded only when the
  // Assignments tab is actually opened — the roster itself must stay free of
  // per-student reads, or a class of 150 costs 150 fetches to render a list.
  const [detailEvidence, setDetailEvidence] = useState({ studentId: null, events: [], loading: false, error: null });

  useEffect(() => {
    if (detailTab !== 'assignments' || !selectedId) return undefined;
    if (detailEvidence.studentId === selectedId && !detailEvidence.error) return undefined;
    let cancelled = false;
    setDetailEvidence({ studentId: selectedId, events: [], loading: true, error: null });
    fetchStudentEvidenceEvents(selectedId)
      .then((events) => {
        if (!cancelled) setDetailEvidence({ studentId: selectedId, events, loading: false, error: null });
      })
      .catch((error) => {
        // A missing history is not a broken screen. The rest of the tab still
        // has something useful to say.
        if (!cancelled) {
          setDetailEvidence({
            studentId: selectedId, events: [], loading: false,
            error: error?.message || 'Delivery history is temporarily unavailable.',
          });
        }
      });
    return () => { cancelled = true; };
  }, [detailTab, selectedId, detailEvidence.studentId, detailEvidence.error]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = needle
      ? students.filter((student) => studentSearchText(student).includes(needle))
      : students;
    return matches.slice().sort((a, b) => {
      if (sort === 'period') {
        // Unassigned students sort last rather than under "U".
        const periodA = a.classPeriod || 'zzz';
        const periodB = b.classPeriod || 'zzz';
        if (periodA !== periodB) return periodA.localeCompare(periodB, undefined, { numeric: true });
      }
      if (sort === 'inclusion') {
        const flagA = a.profile?.inclusionStatus ? 0 : 1;
        const flagB = b.profile?.inclusionStatus ? 0 : 1;
        if (flagA !== flagB) return flagA - flagB;
      }
      if (sort === 'id') return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      return compareStudentsByName(a, b);
    });
  }, [students, search, sort]);
  const selected = students.find((student) => student.id === selectedId) || null;

  // ONE PROFILE PER STUDENT, AND NO NEW FIRESTORE READS.
  //
  // The roster already derives every student's mastery synchronously from the
  // `grades` documents in memory. The same rows convert into evidence events,
  // so the honest Student Learning Profile can appear on the screen teachers
  // actually use rather than only in a detail pane nobody opens. A per-student
  // server fetch here would be 150 extra reads on a screen that currently makes
  // none, which in practice would mean the profile never got shown at all.
  const learningProfiles = useMemo(() => {
    const byId = {};
    students.forEach((student) => {
      const rows = collectStudentEvidence({ student, assignments });
      const { events } = evidenceRowsToEvents(rows);
      const legacy = masteryProfilesByStudentId[student.id] || null;
      byId[student.id] = buildStudentLearningProfile({
        courseId: courseProfiles?.[student.classPeriod]?.course || 'algebra1',
        evidenceEvents: events,
        // The legacy summaries speak in `score`; the profile reads the Phase 5
        // `mastery.estimate` contract. One shared adapter converts between them,
        // rather than this screen inventing a second mapping table — which is
        // how the repository acquired four of them in the first place.
        masteryProfilesByTeks: legacy
          ? adaptLegacyMasteryToPhase5({ legacyProfile: legacy, evidenceRows: rows })
          : {},
      });
    });
    return byId;
  }, [students, assignments, masteryProfilesByStudentId, courseProfiles]);

  const masterySummary = (student) => masteryProfilesByStudentId[student.id] || {};
  const pathLabel = (student) => {
    const domains = deriveDomainReadiness(masterySummary(student));
    const advanced = domains.find((domain) => domain.readiness === 'advanced');
    const developing = domains.find((domain) => domain.readiness === 'developing');
    const level = courseProfiles?.[student.classPeriod]?.courseLevel || 'standard';
    const readiness = advanced ? 'advanced' : developing ? 'developing' : 'onTrack';
    return resolveAdaptiveRigor({ courseLevel: level, readiness }).label;
  };

  if (selected) {
    const mastery = masterySummary(selected);
    const domains = deriveDomainReadiness(mastery);
    const classRecord = classes.find((entry) => entry.classId === selected.classId) || null;
    const legacyProfile = courseProfiles?.[selected.classPeriod] || null;
    const classProfile = classRecord || legacyProfile || { courseLabel: 'Algebra I', course: 'algebra1', courseLevel: 'standard' };
    const courseId = classProfile.course || 'algebra1';
    const selectedAssignments = (Array.isArray(assignments) ? assignments : []).filter((assignment) => {
      const periods = Array.isArray(assignment?.assignedClassPeriods) ? assignment.assignedClassPeriods : [];
      return selected.classPeriod ? periods.includes(selected.classPeriod) : false;
    });
    const pacing = storedPacingForClassContext(pacingByClass, {
      classId: selected.classId,
      classPeriod: selected.classPeriod,
    });
    const selectedPathOptions = buildStudentPathOptions({
      student: selected,
      assignments: selectedAssignments,
      courseId,
      pacing,
      teacherOverrides: overridesForClassContext(skillOverrides, {
        classId: selected.classId,
        classPeriod: selected.classPeriod,
      }),
    });
    return (
      <div style={{ textAlign: 'left' }}>
        <button type="button" onClick={() => setSelectedId(null)} style={{ border: 0, background: 'transparent', color: '#1a73e8', fontWeight: 900, padding: 0, cursor: 'pointer' }}>← All students</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', margin: '10px 0 16px' }}>
          <div><h2 style={{ margin: 0 }}>{formatStudentName(selected)}</h2><div style={{ marginTop: 5, color: '#5f6368' }}>ID {selected.id} · {classRecord?.name || selected.classPeriod || 'Unassigned'} · {classProfile.courseLabel || classProfile.course || 'Algebra I'} · <strong>{classProfile.courseLevel === 'honors' ? 'Honors' : 'Standard'}</strong></div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><label style={{ fontSize: 12, fontWeight: 800 }}>Class <select value={selected.classPeriod || 'Unassigned'} onChange={(event) => onChangeClassPeriod(selected.id, event.target.value)} style={{ marginLeft: 5, padding: '8px 9px', border: '1px solid #c7cdd6', borderRadius: 7 }}><option value="Unassigned">Unassigned</option>{classPeriods.map((period) => <option key={period} value={period}>{period}</option>)}</select></label><button type="button" onClick={() => onGenerateIEPReport(selected)} style={{ padding: '9px 13px', border: '1px solid #6f2da8', borderRadius: 8, background: '#fff', color: '#6f2da8', fontWeight: 900 }}>Generate IEP Report</button></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {['overview', 'profile', 'progress', 'assignments', 'path', 'supports', 'account'].map((tab) => <button type="button" key={tab} onClick={() => setDetailTab(tab)} style={tabButton(detailTab === tab)}>{tab === 'path' ? 'My Math Path' : tab === 'profile' ? 'Learning Profile' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}
        </div>

        {detailTab === 'overview' && <section style={{ padding: 18, border: '1px solid #d8dde6', borderRadius: 10 }}><h3 style={{ marginTop: 0 }}>Overview</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}><div><div style={{ color: '#5f6368', fontSize: 12 }}>Estimated performance</div><strong>{mastery.overall?.performance?.shortLabel || 'Insufficient evidence'}</strong></div><div><div style={{ color: '#5f6368', fontSize: 12 }}>Confidence</div><strong>{mastery.overall?.confidence || 'Low'}</strong></div><div><div style={{ color: '#5f6368', fontSize: 12 }}>Supports</div><strong>{selected.profile?.inclusionStatus ? 'Active' : 'None flagged'}</strong></div><div><div style={{ color: '#5f6368', fontSize: 12 }}>Adaptive path</div><strong>{pathLabel(selected)}</strong></div></div></section>}

        {detailTab === 'profile' && (
          <StudentLearningProfileView
            studentName={formatStudentName(selected)}
            profile={learningProfiles[selected.id]}
            // The SAME plan the student's own screen is built from. If the two
            // ever disagree, a teacher is being shown a recommendation the
            // student never received, which is worse than showing nothing.
            plan={buildWeeklyPathPlan({
              options: selectedPathOptions,
              courseId,
              profile: learningProfiles[selected.id],
              sessions: classProfile.courseLevel === 'honors' ? 5 : 4,
              honors: classProfile.courseLevel === 'honors',
            })}
          />
        )}

        {detailTab === 'progress' && <section style={{ padding: 18, border: '1px solid #d8dde6', borderRadius: 10 }}><h3 style={{ marginTop: 0 }}>Domain readiness</h3><p style={{ color: '#5f6368' }}>Advanced is evidence-driven by domain and never changes this student&apos;s Standard/Honors enrollment.</p>{domains.length === 0 ? <p>Not enough tagged evidence yet.</p> : domains.map((domain) => <div key={domain.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #eef0f2' }}><span>{domain.title}</span><strong>{domain.readiness === 'advanced' ? 'Advanced' : domain.readiness === 'developing' ? 'Developing' : 'On Track'}{domain.score ? ` · ${domain.score}%` : ''}</strong></div>)}</section>}

        {detailTab === 'assignments' && (
          <div>
            <section style={{ padding: 18, border: '1px solid #d8dde6', borderRadius: 10, marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Assignment evidence</h3>
              <p style={{ color: '#5f6368' }}>{Object.keys(selected.gradesByAssignment || {}).length} assignment record(s). Use Grades for question-level evidence and saved work.</p>
            </section>
            {detailEvidence.loading && <p style={{ color: '#5f6368' }}>Loading delivery history…</p>}
            {detailEvidence.error && <p style={{ color: '#9a3412' }}>{detailEvidence.error}</p>}
            {!detailEvidence.loading && !detailEvidence.error && (
              <AdaptationReport events={detailEvidence.events} studentName={formatStudentName(selected)} />
            )}
          </div>
        )}

        {detailTab === 'path' && <section style={{ padding: 18, border: '1px solid #d8dde6', borderRadius: 10 }}><h3 style={{ marginTop: 0 }}>My Math Path</h3><p style={{ color: '#5f6368' }}>Current adaptive posture: <strong>{pathLabel(selected)}</strong>. The panel below is the student&apos;s real Path and mastery view in teacher read-only mode.</p>{classProfile.courseLevel === 'honors' && domains.some((domain) => domain.readiness === 'developing') && <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: '#fff4ce', color: '#6b4c00' }}><strong>Honors target preserved.</strong> Prerequisite repair can run before the student returns to Honors-level work.</div>}{classProfile.courseLevel !== 'honors' && domains.some((domain) => domain.readiness === 'advanced') && <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: '#e6f4ea', color: '#137333' }}><strong>Individual enrichment active.</strong> This student can receive CCMR/deeper work without being relabeled as Honors.</div>}<div style={{ marginTop: 14, overflow: 'hidden', border: '1px solid #e1e5ea', borderRadius: 12 }}><MyMathPathApp key={selected.id} readOnly initialTab="dashboard" studentId={selected.id} studentName={formatStudentName(selected)} studentProfile={{ ...(selected.profile || {}), course: courseId, courseLevel: classProfile.courseLevel || 'standard' }} assignments={selectedAssignments} pathOptions={selectedPathOptions} courseId={courseId} studentRecord={selected} /></div></section>}

        {detailTab === 'supports' && <section style={{ padding: 18, border: '1px solid #d8dde6', borderRadius: 10 }}><h3 style={{ marginTop: 0 }}>Supports</h3><label style={{ display: 'inline-flex', gap: 7, alignItems: 'center', padding: '8px 11px', borderRadius: 999, background: selected.profile?.inclusionStatus ? '#efe4ff' : '#f1f3f4', fontWeight: 900 }}><input type="checkbox" checked={Boolean(selected.profile?.inclusionStatus)} onChange={(event) => onUpdateStudentProfile(selected.id, { inclusionStatus: event.target.checked })} /> Inclusion</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginTop: 15 }}>{Object.entries(supportOptions).map(([group, options]) => <fieldset key={group} style={{ border: '1px solid #d8dde6', borderRadius: 8, padding: 12 }}><legend style={{ fontWeight: 900, textTransform: 'capitalize' }}>{group}</legend>{options.map(([value, label]) => <label key={value} style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={(selected.profile?.[group] || []).includes(value)} onChange={() => onToggleStudentSupport(selected, group, value)} /> {label}</label>)}</fieldset>)}</div></section>}

        {detailTab === 'account' && <section style={{ padding: 18, border: '1px solid #d8dde6', borderRadius: 10 }}><h3 style={{ marginTop: 0 }}>Account</h3><p style={{ color: '#5f6368' }}>Student PIN and Google-link support is available from Student Access.</p>{isRootAdmin && <div style={{ marginTop: 18, padding: 14, border: '1px solid #f1a5a0', borderRadius: 9, background: '#fce8e6' }}><strong style={{ color: '#a50e0e' }}>Danger Zone</strong><p style={{ color: '#5f6368' }}>Permanent account and data erasure requires the protected Administration workspace and typed confirmation.</p><button type="button" onClick={onOpenAdministration} style={{ padding: '9px 13px', border: 0, borderRadius: 7, background: '#b3261e', color: '#fff', fontWeight: 900 }}>Open Administration</button></div>}</section>}
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}><div><h2 style={{ margin: 0 }}>Students</h2><p style={{ margin: '5px 0 0', color: '#5f6368' }}>Compact roster first. Open a student only when you need details.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or class" style={{ width: 'min(360px, 100%)', padding: '10px 12px', border: '1px solid #c7cdd6', borderRadius: 8 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5f6368', fontWeight: 700 }}>
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value)} style={{ padding: '9px 10px', border: '1px solid #c7cdd6', borderRadius: 8 }}>
            <option value="name">Last name</option>
            <option value="id">Student ID</option>
            <option value="period">Class period</option>
            <option value="inclusion">Inclusion first</option>
          </select>
        </label>
      </div></div>
      <div style={{ overflowX: 'auto', border: '1px solid #d8dde6', borderRadius: 10 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ textAlign: 'left', padding: 11 }}>Student</th><th style={{ textAlign: 'left' }}>Class</th><th>Mastery</th><th>Supports</th><th style={{ textAlign: 'left' }}>Math Path</th><th></th></tr></thead><tbody>{filtered.map((student) => { const mastery = masterySummary(student); const classProfile = courseProfiles?.[student.classPeriod] || {}; return <tr key={student.id} style={{ borderTop: '1px solid #eef0f2' }}><td style={{ padding: 11 }}><div style={{ fontWeight: 900 }}>{formatStudentName(student)}</div><div style={{ color: '#5f6368', fontSize: 11 }}>ID {student.id}</div></td><td><div>{student.classPeriod || 'Unassigned'}</div><div style={{ color: '#5f6368', fontSize: 11 }}>{classProfile.courseLabel || 'Algebra I'} {classProfile.courseLevel === 'honors' ? '· Honors' : ''}</div></td><td style={{ textAlign: 'center' }}><StudentPerformanceBadge profile={learningProfiles[student.id]} size="small" studentName={formatStudentName(student)} onClick={() => { setSelectedId(student.id); setDetailTab('profile'); }} /></td><td style={{ textAlign: 'center' }}>{student.profile?.inclusionStatus ? <span style={pill('#efe4ff', '#6f2da8')}>Active</span> : '—'}</td><td style={{ fontSize: 12 }}>{pathLabel(student)}</td><td style={{ textAlign: 'right', paddingRight: 10 }}><button type="button" onClick={() => { setSelectedId(student.id); setDetailTab('overview'); }} style={{ padding: '8px 11px', border: '1px solid #1a73e8', borderRadius: 7, background: '#fff', color: '#174ea6', fontWeight: 900 }}>Open</button></td></tr>; })}</tbody></table></div>
      {!filtered.length && <p style={{ color: '#5f6368' }}>No students match that search.</p>}
    </div>
  );
}
