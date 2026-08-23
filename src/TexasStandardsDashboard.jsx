import { useMemo, useState } from 'react';
import {
  ALGEBRA_I_REPORTING_CATEGORIES,
  TEXAS_MATH_ACTIVE_COURSES,
  TEXAS_MATH_COURSES,
  getTexasCourse,
  getTexasCoursePrerequisites,
  getTexasStandard,
  getTexasStandardsForCourse,
  getTexasVerticalAlignment,
  getTexasVerticalPath,
} from './texasStandards.js';
import {
  buildClassMasteryProfiles,
  buildItemAnalytics,
  buildStandardsExportPayload,
} from './masteryEngine.js';
import { legacyPerformanceTone, toneChip } from './platform/profile/performanceTone.js';
import CognitiveDemandView from './components/teacher/CognitiveDemandView.jsx';
import CcmrDashboard from './components/teacher/CcmrDashboard.jsx';

const pct = (value) => `${Math.round(Number(value) || 0)}%`;
const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const csv = (rows) => rows.map((row) => row.map(escapeCsv).join(',')).join('\n');

const download = (filename, content, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

// The colours were written out here, a fifth independent copy of the same
// mapping. The vocabulary was already the profile's — didNotMeet, approaches,
// meets, masters — so only the table was separate, which is the worst version
// of the problem: the labels agreed and the colours did not, and colour is what
// a teacher scanning a table actually reads.
const PerformanceBadge = ({ performance }) => (
  <span style={toneChip(legacyPerformanceTone(performance?.key))}>
    {performance?.shortLabel || performance?.label || 'Insufficient'}
  </span>
);

const standardBadgeTone = (classification) => {
  if (classification === 'readiness') return ['#e6f4ea', '#137333'];
  if (classification === 'supporting') return ['#e8f0fe', '#174ea6'];
  if (classification === 'content') return ['#f3e8fd', '#7b1fa2'];
  return ['#f1f3f4', '#5f6368'];
};

const StandardBadge = ({ standard }) => {
  const [background, color] = standardBadgeTone(standard?.classification);
  return (
    <span style={{ padding: '3px 7px', borderRadius: '999px', background, color, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>
      {standard?.classification || 'TEKS'}
    </span>
  );
};

const CourseTabs = ({ selectedCourseId, onSelect }) => (
  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
    {TEXAS_MATH_ACTIVE_COURSES.map((course) => (
      <button
        key={course.id}
        type="button"
        onClick={() => onSelect(course.id)}
        style={{
          border: selectedCourseId === course.id ? '2px solid #1a73e8' : '1px solid #bdc7d6',
          background: selectedCourseId === course.id ? '#e8f0fe' : '#fff',
          color: selectedCourseId === course.id ? '#174ea6' : '#3c4043',
          borderRadius: '999px',
          padding: '7px 12px',
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        {course.label}
      </button>
    ))}
  </div>
);

const getCourseProfile = (profile, courseId) => {
  if (!profile) return null;
  if (profile.courses?.[courseId]) return profile.courses[courseId];
  const courseTeks = Object.fromEntries(Object.entries(profile.teks || {}).filter(([code]) => getTexasStandard(code)?.courseId === courseId));
  if (!Object.keys(courseTeks).length) return null;
  return {
    courseId,
    course: getTexasCourse(courseId)?.label || courseId,
    overall: profile.overall,
    modifiedOverall: profile.modifiedOverall,
    teks: courseTeks,
  };
};

const PathwayCard = ({ standard, label, emphasis = false, onSelect }) => {
  if (!standard) {
    return (
      <div style={{ minHeight: '118px', padding: '12px', border: '1px dashed #c5ccd5', borderRadius: '10px', background: '#fafbfc' }}>
        <strong style={{ color: '#5f6368' }}>{label}</strong>
        <div style={{ marginTop: '12px', color: '#80868b', fontSize: '12px' }}>No linked TEKS loaded.</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect?.(standard)}
      style={{ minHeight: '118px', width: '100%', textAlign: 'left', padding: '12px', border: emphasis ? '2px solid #1a73e8' : '1px solid #d9e2ef', borderRadius: '10px', background: emphasis ? '#f3f7ff' : '#fff', cursor: onSelect ? 'pointer' : 'default' }}
    >
      <div style={{ color: '#5f6368', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '6px', flexWrap: 'wrap' }}>
        <strong style={{ color: '#174ea6' }}>{standard.code}</strong>
        <span style={{ color: '#5f6368', fontSize: '11px' }}>{standard.course}</span>
      </div>
      <div style={{ marginTop: '7px', fontSize: '11px', color: '#3c4043', lineHeight: 1.35 }}>{standard.description}</div>
    </button>
  );
};

export default function TexasStandardsDashboard({ allStudents = [], assignments = [], classes = [], learningProfilesByStudentId = {}, courseLevelByStudentId = {}, onOpenStudent = null, className = 'this class' }) {
  const [classId, setClassId] = useState('All');
  const [view, setView] = useState('matrix');
  const [search, setSearch] = useState('');
  const [readinessOnly, setReadinessOnly] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('algebra1');
  const initialPathwayCode = getTexasStandardsForCourse('algebra2').find((item) => item.code === 'A2.4F')?.code
    || getTexasStandardsForCourse('algebra2')[0]?.code
    || getTexasStandardsForCourse('algebra1')[0]?.code
    || '';
  const [selectedPathwayCode, setSelectedPathwayCode] = useState(initialPathwayCode);

  const selectedCourse = getTexasCourse(selectedCourseId) || TEXAS_MATH_ACTIVE_COURSES[0];
  const selectedRegistry = useMemo(() => getTexasStandardsForCourse(selectedCourseId), [selectedCourseId]);
  const classOptions = useMemo(() => (Array.isArray(classes) ? classes : [])
    .filter((entry) => entry?.status !== 'archived' && allStudents.some((student) => student?.classId === entry.classId))
    .slice()
    .sort((a, b) => String(a.name || a.period || '').localeCompare(String(b.name || b.period || ''), undefined, { numeric: true })), [classes, allStudents]);
  const students = useMemo(
    () => allStudents.filter((student) => classId === 'All' || String(student.classId || '') === classId),
    [allStudents, classId],
  );
  const profiles = useMemo(() => buildClassMasteryProfiles({ students, assignments }), [students, assignments]);
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.studentId, profile])), [profiles]);
  const itemAnalytics = useMemo(() => buildItemAnalytics({ students, assignments }), [students, assignments]);
  const courseItemAnalytics = useMemo(
    () => itemAnalytics.filter((row) => row.courseIds?.includes(selectedCourseId)),
    [itemAnalytics, selectedCourseId],
  );
  const taggedItems = courseItemAnalytics.filter((row) => row.primaryTeks.length && row.dok).length;
  const coverage = courseItemAnalytics.length ? Math.round(taggedItems / courseItemAnalytics.length * 100) : 0;

  const visibleCodes = useMemo(() => {
    const present = new Set();
    profiles.forEach((profile) => {
      const courseProfile = getCourseProfile(profile, selectedCourseId);
      Object.keys(courseProfile?.teks || {}).forEach((code) => present.add(code));
    });
    return [...present]
      .filter((code) => selectedCourseId !== 'algebra1' || !readinessOnly || getTexasStandard(code)?.classification === 'readiness')
      .sort();
  }, [profiles, selectedCourseId, readinessOnly]);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || students[0] || null;
  const selectedProfile = selectedStudent ? profileMap[selectedStudent.id] : null;
  const selectedCourseProfile = getCourseProfile(selectedProfile, selectedCourseId);

  const filteredRegistry = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return selectedRegistry.filter((standard) => {
      if (selectedCourseId === 'algebra1' && readinessOnly && standard.classification !== 'readiness') return false;
      if (!needle) return true;
      return `${standard.code} ${standard.description} ${standard.classification}`.toLowerCase().includes(needle);
    });
  }, [selectedRegistry, selectedCourseId, readinessOnly, search]);

  const pathwayStandard = getTexasStandard(selectedPathwayCode)
    || selectedRegistry[0]
    || getTexasStandardsForCourse('algebra2')[0]
    || null;
  const pathway = pathwayStandard ? getTexasVerticalAlignment(pathwayStandard.code) : { current: null, prior: [], next: [] };
  const priorPath = pathwayStandard ? getTexasVerticalPath(pathwayStandard.code, { direction: 'prior', maxDepth: 4 }) : [];

  const handleCourseSelect = (courseId) => {
    setSelectedCourseId(courseId);
    setReadinessOnly(false);
    const first = getTexasStandardsForCourse(courseId)[0];
    if (first) setSelectedPathwayCode(first.code);
  };

  const handlePathwayStandardSelect = (standard) => {
    if (!standard) return;
    setSelectedPathwayCode(standard.code);
    if (standard.courseId && getTexasStandardsForCourse(standard.courseId).length) setSelectedCourseId(standard.courseId);
  };

  const exportStudentTeks = () => {
    const rows = [['Student ID', 'Class', 'Course', 'TEKS', 'Classification', 'Reporting Category', 'Items', 'Weighted Score', 'Estimated Instructional Performance', 'Confidence', 'First Attempt Correct', 'Eventual Correct', 'Recommended Band', 'Modified Evidence Items']];
    students.forEach((student) => {
      const profile = profileMap[student.id];
      Object.values(profile?.teks || {}).forEach((summary) => rows.push([
        student.id,
        student.classPeriod || 'Unassigned',
        summary.course || getTexasCourse(summary.courseId)?.label || '',
        summary.code,
        summary.classification,
        summary.reportingCategory ?? '',
        summary.itemCount,
        summary.score,
        summary.performance?.label || 'Insufficient Evidence',
        summary.confidence,
        summary.firstAttemptCorrectRate,
        summary.eventualCorrectRate,
        summary.recommendedGeneratorBand,
        summary.modifiedEvidence?.itemCount || 0,
      ]));
    });
    download('mathmaster_student_texas_math_teks_report.csv', csv(rows), 'text/csv;charset=utf-8');
  };

  const exportMatrix = () => {
    const codes = [...new Set(profiles.flatMap((profile) => Object.keys(getCourseProfile(profile, selectedCourseId)?.teks || {})))].sort();
    const rows = [['Student ID', 'Class', 'Course', 'Course Estimate', 'Confidence', 'Recommended Band', ...codes]];
    students.forEach((student) => {
      const profile = profileMap[student.id];
      const courseProfile = getCourseProfile(profile, selectedCourseId);
      rows.push([
        student.id,
        student.classPeriod || 'Unassigned',
        selectedCourse?.label || selectedCourseId,
        courseProfile?.overall?.performance?.label || 'Insufficient Evidence',
        courseProfile?.overall?.confidence || 'Low',
        courseProfile?.overall?.recommendedGeneratorBand || 3,
        ...codes.map((code) => courseProfile?.teks?.[code]?.performance?.shortLabel || '—'),
      ]);
    });
    download(`mathmaster_${selectedCourseId}_teks_matrix.csv`, csv(rows), 'text/csv;charset=utf-8');
  };

  const exportItems = () => {
    const rows = [['Course', 'Assignment', 'Question', 'Type', 'Primary TEKS', 'DOK', 'Intended Difficulty', 'Generator Band', 'Purpose', 'Responses', 'First Attempt Correct', 'Eventual Correct', 'Average Attempts', 'Average Credit', 'Observed Difficulty', 'Modified Responses']];
    courseItemAnalytics.forEach((row) => rows.push([
      row.primaryCourse || selectedCourse?.label || '',
      row.assignmentTitle,
      row.questionNumber,
      row.type,
      row.primaryTeks.join(' '),
      row.dok || '',
      row.intendedDifficulty,
      row.generatorBand,
      row.purpose,
      row.responseCount,
      row.firstAttemptCorrectRate,
      row.eventualCorrectRate,
      row.averageAttempts,
      row.averageCredit,
      row.observedDifficultyLabel,
      row.modifiedResponses,
    ]));
    download(`mathmaster_${selectedCourseId}_item_analysis.csv`, csv(rows), 'text/csv;charset=utf-8');
  };

  const exportFull = () => {
    const payload = buildStandardsExportPayload({ students, assignments });
    download('mathmaster_texas_math_mastery_export.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  };

  const viewButtons = [
    ['matrix', 'Student Matrix'],
    // The class-level question the standards matrix cannot answer: is this
    // class failing because the numbers are hard, or because they cannot say
    // what the question is asking?
    ['demand', 'Demand & Complexity'],
    // Course knowledge versus transfer. The gap a gradebook cannot show.
    ['ccmr', 'CCMR Readiness'],
    ['items', 'Item Analysis'],
    ['registry', 'TEKS Registry'],
    ['pathway', 'TEKS Pathway'],
  ];

  return (
    <div style={{ padding: '18px', border: '1px solid #e1e5ea', borderRadius: '12px', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>Texas Math TEKS & Mastery</h2>
          <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: '12px', maxWidth: '720px' }}>
            Course-aware TEKS evidence, DOK, instructional difficulty, vertical prerequisite support, and estimated instructional performance. Estimates are not official STAAR scores.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          <button type="button" onClick={exportStudentTeks}>Export TEKS CSV</button>
          <button type="button" onClick={exportMatrix}>Export Matrix</button>
          <button type="button" onClick={exportItems}>Export Items</button>
          <button type="button" onClick={exportFull}>Full JSON</button>
        </div>
      </div>

      <div style={{ marginTop: '15px', padding: '12px', borderRadius: '10px', background: '#f8f9fa', border: '1px solid #e1e5ea' }}>
        <div style={{ color: '#5f6368', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '7px' }}>Active Texas course registry</div>
        <CourseTabs selectedCourseId={selectedCourseId} onSelect={handleCourseSelect} />
        <div style={{ marginTop: '7px', color: '#5f6368', fontSize: '11px' }}>
          {selectedCourse?.label}: {selectedRegistry.length} TEKS expectations loaded
          {selectedCourseId === 'algebra1' ? ' · current STAAR readiness/supporting metadata available' : ' · course TEKS tracked without inventing Algebra I STAAR readiness/supporting labels'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', margin: '14px 0 10px' }}>
        {viewButtons.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setView(key)} style={{ fontWeight: 900, borderColor: view === key ? '#1a73e8' : '#bdc7d6', background: view === key ? '#e8f0fe' : '#fff', color: view === key ? '#174ea6' : '#3c4043' }}>{label}</button>
        ))}
        <select value={classId} onChange={(event) => setClassId(event.target.value)} style={{ marginLeft: 'auto' }}>
          <option value="All">All classes</option>
          {classOptions.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.name || entry.period || entry.classId}{entry.period ? ` · ${entry.period}` : ''}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px', color: '#5f6368', fontSize: '12px' }}>
        <span><strong style={{ color: '#202124' }}>{students.length}</strong> students</span>
        <span><strong style={{ color: '#202124' }}>{courseItemAnalytics.length}</strong> {selectedCourse?.label} question records</span>
        <span><strong style={{ color: '#202124' }}>{coverage}%</strong> TEKS + DOK metadata coverage</span>
        {selectedCourseId === 'algebra1' && (
          <label style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <input type="checkbox" checked={readinessOnly} onChange={(event) => setReadinessOnly(event.target.checked)} /> Readiness only
          </label>
        )}
        {(view === 'registry' || view === 'pathway') && (
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search TEKS…" style={{ minWidth: '220px', padding: '7px 9px', borderRadius: '7px', border: '1px solid #bdc7d6' }} />
        )}
      </div>

      {view === 'matrix' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 370px)', gap: '14px', alignItems: 'start' }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e1e5ea', borderRadius: '10px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: `${650 + visibleCodes.length * 90}px`, fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Student</th>
                  <th style={{ padding: '10px' }}>{selectedCourse?.label} estimate</th>
                  <th style={{ padding: '10px' }}>Confidence</th>
                  <th style={{ padding: '10px' }}>Band</th>
                  {visibleCodes.map((code) => <th key={code} title={getTexasStandard(code)?.description} style={{ padding: '10px' }}>{code}</th>)}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const profile = profileMap[student.id];
                  const courseProfile = getCourseProfile(profile, selectedCourseId);
                  return (
                    <tr key={student.id} onClick={() => setSelectedStudentId(student.id)} style={{ cursor: 'pointer', background: selectedStudent?.id === student.id ? '#f3f7ff' : '#fff', borderTop: '1px solid #eceff3' }}>
                      <td style={{ padding: '10px', fontWeight: 800 }}>{student.id}<div style={{ color: '#5f6368', fontWeight: 400 }}>{student.classPeriod || 'Unassigned'}</div></td>
                      <td style={{ padding: '10px', textAlign: 'center' }}><PerformanceBadge performance={courseProfile?.overall?.performance} /></td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>{courseProfile?.overall?.confidence || 'Low'}</td>
                      <td style={{ padding: '10px', textAlign: 'center', fontWeight: 900 }}>{courseProfile?.overall?.recommendedGeneratorBand || 3}</td>
                      {visibleCodes.map((code) => (
                        <td key={code} style={{ padding: '10px', textAlign: 'center' }}>
                          {courseProfile?.teks?.[code] ? <><div style={{ fontWeight: 900 }}>{pct(courseProfile.teks[code].score)}</div><div style={{ color: '#5f6368', fontSize: '10px' }}>{courseProfile.teks[code].performance?.shortLabel}</div></> : '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside style={{ padding: '14px', border: '1px solid #d9e2ef', borderRadius: '10px', background: '#fbfcff' }}>
            {selectedStudent ? (
              <>
                <h3 style={{ margin: 0 }}>{selectedStudent.id}</h3>
                <div style={{ color: '#5f6368', fontSize: '12px', margin: '4px 0 10px' }}>{selectedStudent.classPeriod || 'Unassigned'} · {selectedCourse?.label}</div>
                <PerformanceBadge performance={selectedCourseProfile?.overall?.performance} />
                <div style={{ marginTop: '11px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', fontSize: '12px' }}>
                  <div><strong>{pct(selectedCourseProfile?.overall?.score)}</strong><br />weighted score</div>
                  <div><strong>{selectedCourseProfile?.overall?.confidence || 'Low'}</strong><br />confidence</div>
                  <div><strong>Band {selectedCourseProfile?.overall?.recommendedGeneratorBand || 3}</strong><br />next recommendation</div>
                  <div><strong>{selectedCourseProfile?.overall?.itemCount || 0}</strong><br />grade-level items</div>
                </div>
                <h4 style={{ marginBottom: '7px' }}>{selectedCourse?.label} TEKS evidence</h4>
                <div style={{ display: 'grid', gap: '7px', maxHeight: '335px', overflowY: 'auto' }}>
                  {Object.values(selectedCourseProfile?.teks || {}).sort((a, b) => a.code.localeCompare(b.code)).map((summary) => (
                    <div key={summary.code} style={{ padding: '8px', borderRadius: '7px', background: '#fff', border: '1px solid #e1e5ea' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><strong>{summary.code} · {pct(summary.score)}</strong><span style={{ textTransform: 'capitalize', color: '#5f6368' }}>{summary.classification}</span></div>
                      <div style={{ fontSize: '11px', color: '#5f6368', marginTop: '3px' }}>{summary.itemCount} grade-level · DOK max {summary.maxDok || '—'} · {summary.confidence} confidence</div>
                      {summary.modifiedEvidence?.itemCount > 0 && <div style={{ fontSize: '11px', color: '#7b1fa2', marginTop: '3px' }}>{summary.modifiedEvidence.itemCount} modified evidence item(s) tracked separately</div>}
                    </div>
                  ))}
                  {!Object.keys(selectedCourseProfile?.teks || {}).length && <div style={{ color: '#5f6368', fontSize: '12px' }}>No {selectedCourse?.label} evidence yet. Insufficient evidence never triggers automatic below-grade-level placement.</div>}
                </div>
              </>
            ) : <p style={{ color: '#5f6368' }}>No student evidence yet.</p>}
          </aside>
        </div>
      )}

      {view === 'demand' && (
        <CognitiveDemandView
          students={students}
          profilesByStudentId={learningProfilesByStudentId}
          className={className}
        />
      )}

      {view === 'ccmr' && (
        <CcmrDashboard
          students={students}
          profilesByStudentId={learningProfilesByStudentId}
          courseLevelByStudentId={courseLevelByStudentId}
          onOpenStudent={onOpenStudent}
        />
      )}

      {view === 'items' && (
        <div style={{ overflowX: 'auto', border: '1px solid #e1e5ea', borderRadius: '10px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1080px', fontSize: '12px' }}>
            <thead><tr style={{ background: '#f8f9fa' }}>{['Course', 'Assignment / question', 'TEKS', 'DOK', 'Intended', 'Purpose', 'Responses', '1st attempt', 'Eventual', 'Avg attempts', 'Observed'].map((header) => <th key={header} style={{ padding: '10px', textAlign: 'left' }}>{header}</th>)}</tr></thead>
            <tbody>
              {courseItemAnalytics.map((row) => (
                <tr key={`${row.assignmentId}-${row.questionIndex}`} style={{ borderTop: '1px solid #eceff3' }}>
                  <td style={{ padding: '10px' }}>{row.primaryCourse || selectedCourse?.label}</td>
                  <td style={{ padding: '10px' }}><strong>{row.assignmentTitle}</strong><br />Q{row.questionNumber} · {row.type}</td>
                  <td style={{ padding: '10px' }}>{row.primaryTeks.join(', ') || 'Unassigned'}</td>
                  <td style={{ padding: '10px' }}>{row.dok ? `DOK ${row.dok}` : '—'}</td>
                  <td style={{ padding: '10px' }}>{row.intendedDifficulty} · B{row.generatorBand}</td>
                  <td style={{ padding: '10px' }}>{row.purpose}</td>
                  <td style={{ padding: '10px' }}>{row.responseCount}</td>
                  <td style={{ padding: '10px' }}>{pct(row.firstAttemptCorrectRate)}</td>
                  <td style={{ padding: '10px' }}>{pct(row.eventualCorrectRate)}</td>
                  <td style={{ padding: '10px' }}>{row.averageAttempts}</td>
                  <td style={{ padding: '10px' }}>{row.observedDifficultyLabel}</td>
                </tr>
              ))}
              {!courseItemAnalytics.length && <tr><td colSpan={11} style={{ padding: '18px', color: '#5f6368' }}>No {selectedCourse?.label} item evidence yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === 'registry' && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {filteredRegistry.map((standard) => (
            <article key={standard.code} style={{ padding: '11px 13px', borderRadius: '9px', border: '1px solid #e1e5ea', background: '#fff' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ color: '#174ea6' }}>{standard.code}</strong>
                <StandardBadge standard={standard} />
                <span style={{ color: '#5f6368', fontSize: '11px' }}>{standard.course}</span>
                {standard.reportingCategory && <span style={{ color: '#5f6368', fontSize: '11px' }}>RC {standard.reportingCategory}: {ALGEBRA_I_REPORTING_CATEGORIES[standard.reportingCategory]}</span>}
              </div>
              <p style={{ margin: '6px 0 0', color: '#3c4043', fontSize: '12px' }}>{standard.description}</p>
            </article>
          ))}
        </div>
      )}

      {view === 'pathway' && (
        <div style={{ display: 'grid', gap: '14px' }}>
          <section style={{ padding: '13px', border: '1px solid #e1e5ea', borderRadius: '10px', background: '#f8f9fa' }}>
            <div style={{ fontWeight: 900, marginBottom: '3px' }}>Texas mathematics course / grade navigator</div><div style={{ color: '#5f6368', fontSize: '11px', marginBottom: '9px' }}>Navigation order is not a prerequisite chain. Course prerequisites are shown on each card.</div>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'stretch', overflowX: 'auto', paddingBottom: '4px' }}>
              {[...TEXAS_MATH_COURSES].sort((a, b) => a.order - b.order).map((course, index, ordered) => (
                <div key={course.id} style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                  <button
                    type="button"
                    disabled={!getTexasStandardsForCourse(course.id).length}
                    onClick={() => handleCourseSelect(course.id)}
                    style={{ minWidth: '112px', padding: '10px', borderRadius: '9px', border: selectedCourseId === course.id ? '2px solid #1a73e8' : '1px solid #cfd7e2', background: selectedCourseId === course.id ? '#e8f0fe' : '#fff', color: course.registryStatus === 'active' ? '#202124' : '#80868b', cursor: course.registryStatus === 'active' ? 'pointer' : 'default' }}
                  >
                    <strong>{course.label}</strong>
                    <div style={{ fontSize: '10px', marginTop: '4px', color: course.registryStatus === 'active' ? '#137333' : '#80868b' }}>{course.registryStatus === 'active' ? 'TEKS loaded' : 'planned registry'}</div>
                    {getTexasCoursePrerequisites(course.id).length > 0 && <div style={{ fontSize: '9px', marginTop: '4px', color: '#5f6368' }}>Prereq: {getTexasCoursePrerequisites(course.id).map((item) => item.shortLabel).join(', ')}</div>}
                  </button>
                  {index < ordered.length - 1 && <span style={{ padding: '0 5px', color: '#9aa0a6', fontWeight: 900 }}>→</span>}
                </div>
              ))}
            </div>
          </section>

          <section style={{ padding: '13px', border: '1px solid #d9e2ef', borderRadius: '10px', background: '#fff' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end' }}>
              <div>
                <div style={{ fontWeight: 900 }}>Trace a TEKS vertically</div>
                <div style={{ color: '#5f6368', fontSize: '11px', marginTop: '3px' }}>Prior TEKS are support targets. They never replace the current-course TEKS being taught.</div>
              </div>
              <select value={pathwayStandard?.code || ''} onChange={(event) => setSelectedPathwayCode(event.target.value)} style={{ minWidth: '320px', maxWidth: '100%' }}>
                {selectedRegistry.filter((standard) => !search.trim() || `${standard.code} ${standard.description}`.toLowerCase().includes(search.trim().toLowerCase())).map((standard) => <option key={standard.code} value={standard.code}>{standard.code} — {standard.description}</option>)}
              </select>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr)', gap: '11px' }}>
            <section>
              <div style={{ fontWeight: 900, marginBottom: '7px', color: '#5f6368' }}>PRIOR-COURSE SUPPORT</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {pathway.prior.length ? pathway.prior.map((standard) => <PathwayCard key={standard.code} standard={standard} label="Prerequisite support" onSelect={handlePathwayStandardSelect} />) : <PathwayCard label="Prerequisite support" />}
              </div>
            </section>

            <section>
              <div style={{ fontWeight: 900, marginBottom: '7px', color: '#174ea6' }}>CURRENT INSTRUCTIONAL TARGET</div>
              <PathwayCard standard={pathway.current || pathwayStandard} label="Keep this TEKS as the grade-level/course target" emphasis />
              <div style={{ marginTop: '9px', padding: '10px', borderRadius: '8px', background: '#e6f4ea', color: '#137333', fontSize: '11px' }}>
                Auto-differentiation may change generator band or recommend prerequisite practice, but MathMaster preserves this current TEKS as the evidence target unless the teacher explicitly changes it.
              </div>
            </section>

            <section>
              <div style={{ fontWeight: 900, marginBottom: '7px', color: '#5f6368' }}>NEXT CONNECTED TEKS</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {pathway.next.length ? pathway.next.map((standard) => <PathwayCard key={standard.code} standard={standard} label="Next connection" onSelect={handlePathwayStandardSelect} />) : <PathwayCard label="Next connection" />}
              </div>
            </section>
          </div>

          {priorPath.length > 1 && (
            <section style={{ padding: '12px', border: '1px solid #d9e2ef', borderRadius: '10px', background: '#fff' }}>
              <div style={{ fontWeight: 900, marginBottom: '5px' }}>Multi-level prerequisite support ladder</div>
              <div style={{ color: '#5f6368', fontSize: '11px', marginBottom: '10px' }}>
                Level 1 is the first support recommendation. Lower levels are a diagnostic roadmap only; MathMaster does not automatically skip a student down multiple grades without evidence from the intervening prerequisite level.
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', overflowX: 'auto', paddingBottom: '4px' }}>
                {priorPath.map((level, index) => (
                  <div key={`${level.depth}-${level.courseId}`} style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                    <div style={{ minWidth: '205px', maxWidth: '280px', padding: '10px', borderRadius: '9px', border: index === 0 ? '2px solid #1a73e8' : '1px solid #cfd7e2', background: index === 0 ? '#f3f7ff' : '#fafbfc' }}>
                      <div style={{ fontSize: '10px', fontWeight: 900, color: index === 0 ? '#174ea6' : '#5f6368' }}>
                        {index === 0 ? 'CURRENT TARGET' : `SUPPORT DEPTH ${level.depth}`} · {getTexasCourse(level.courseId)?.label || level.courseId}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#3c4043', lineHeight: 1.45 }}>
                        {level.standards.map((standard) => standard.code).join(', ')}
                      </div>
                    </div>
                    {index < priorPath.length - 1 && <span style={{ padding: '0 5px', color: '#9aa0a6', fontWeight: 900 }}>→</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section style={{ padding: '12px', border: '1px solid #e1e5ea', borderRadius: '10px', background: '#fbfcff', fontSize: '12px', color: '#3c4043' }}>
            <strong>How MathMaster moves between levels:</strong> insufficient evidence stays at the current course and Band 3; Did Not Meet/Approaches evidence can trigger the immediate prior-course TEKS recommendation; MathMaster only moves deeper when evidence shows that prerequisite level is also weak; successful prerequisite work is stored as support evidence and never masquerades as mastery of the current-course TEKS.
          </section>
        </div>
      )}
    </div>
  );
}
