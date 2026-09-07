import fs from 'node:fs';

const path = new URL('../src/App.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

function replaceOne(oldText, newText, label) {
  const first = source.indexOf(oldText);
  const last = source.lastIndexOf(oldText);
  if (first < 0) throw new Error(`Could not find App seam: ${label}`);
  if (first !== last) throw new Error(`App seam is ambiguous (${label}); refusing to rewrite App.jsx.`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

function replaceRegex(pattern, replacement, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not find App seam: ${label}`);
  source = source.replace(pattern, replacement);
}

replaceOne(
  "import { COMPARABILITY, describeDeliveredRigor, explainGrade, rigorComparability, splitGrade } from './platform/teacher/gradeEvidence.js';",
  "import { COMPARABILITY, describeDeliveredRigor, explainGrade, rigorComparability, splitGrade, splitGradesBySection } from './platform/teacher/gradeEvidence.js';\nimport { classroomLaunchTarget, parseClassroomLaunchSearch } from './platform/classroom/classroomLaunchRoute.js';",
  'canonical section-grade and Classroom-launch imports',
);

replaceOne(
`  // Google Classroom launch link: ?launch=<assignmentId> drops a student
  // straight into that assignment once they log in.
  const [launchAssignment, setLaunchAssignment] = useState(null);
  const [pendingLaunchAssignmentId, setPendingLaunchAssignmentId] = useState(null);

  useEffect(() => {
    const assignmentId = new URLSearchParams(window.location.search).get('launch');
    if (!assignmentId) return;
    setPendingLaunchAssignmentId(assignmentId);
    getAssignmentByLaunchId({ assignmentId })
      .then((assignment) => setLaunchAssignment(assignment))
      .catch((err) => console.error('Failed to resolve Classroom launch link:', err));
  }, []);`,
`  // Google Classroom launches preserve the server-verified publication and
  // section identity all the way into the browser. Legacy whole-assignment
  // links still parse as sectionKey="whole" and follow the original behavior.
  const [launchAssignment, setLaunchAssignment] = useState(null);
  const [pendingClassroomLaunch, setPendingClassroomLaunch] = useState(null);
  const [classroomSectionReport, setClassroomSectionReport] = useState(null);
  const [activeClassroomSectionKey, setActiveClassroomSectionKey] = useState(null);

  useEffect(() => {
    let launch = null;
    try {
      launch = parseClassroomLaunchSearch(window.location.search);
    } catch (error) {
      console.error('Rejected invalid Classroom launch link:', error);
      return;
    }
    if (!launch) return;
    setPendingClassroomLaunch(launch);
    getAssignmentByLaunchId({ assignmentId: launch.assignmentId })
      .then((assignment) => setLaunchAssignment(assignment))
      .catch((err) => console.error('Failed to resolve Classroom launch link:', err));
  }, []);`,
  'initial Classroom launch state and parser',
);

replaceRegex(
  /  useEffect\(\(\) => \{\n    if \(!pendingLaunchAssignmentId\) return;[\s\S]*?\n  \}, \[pendingLaunchAssignmentId, user, assignments\]\);/,
`  useEffect(() => {
    if (!pendingClassroomLaunch) return;
    if (user?.role !== 'student') return;
    const targetAssignment = assignments.find(
      (assignment) => assignment.id === pendingClassroomLaunch.assignmentId,
    );
    if (!targetAssignment) return;

    // A Classroom link is a doorway, not authorization. The signed-in student
    // must still belong to the MathMaster class that owns this assignment.
    if (!assignmentIsForStudent(targetAssignment, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning(
        'Assignment not available',
        'This Google Classroom assignment is not assigned to your MathMaster class.',
      );
      setPendingClassroomLaunch(null);
      return;
    }

    try {
      const target = classroomLaunchTarget({
        assignment: targetAssignment,
        launch: pendingClassroomLaunch,
        nowValue: Date.now(),
      });

      // A permanently closed split post is an official grade/report link first.
      // Starting voluntary practice is a separate action so opening Classroom
      // can never silently replace the frozen record with an ungraded tracker.
      if (target.showFrozenReportFirst) {
        setClassroomSectionReport(target);
        setActiveClassroomSectionKey(target.sectionKey);
        setActiveAssignmentId(target.assignmentId);
        setCurrentQuestionIndex(target.questionIndex);
        setActiveView('classroomSectionReport');
      } else {
        startAssignment(target.assignmentId, target.questionIndex, {
          sectionKey: target.isSectionLaunch ? target.sectionKey : null,
        });
      }
    } catch (error) {
      console.error('Could not open Classroom section link:', error);
      toastWarning('Classroom link unavailable', error?.message || 'This Classroom section could not be opened.');
    } finally {
      setPendingClassroomLaunch(null);
    }
    // startAssignment intentionally reads the latest assignment/tracker state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClassroomLaunch, user, assignments, tracker]);`,
  'pending Classroom launch routing effect',
);

replaceOne(
  '  const startAssignment = (assignmentId, requestedQuestionIndex = 0) => {',
  '  const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {',
  'startAssignment optional section scope',
);

replaceOne(
`    const safeQuestionIndex = includedQuestionIndices.includes(requested)
      ? requested
      : includedQuestionIndices[0];
    setActiveAssignmentId(assignmentId);`,
`    const safeQuestionIndex = includedQuestionIndices.includes(requested)
      ? requested
      : includedQuestionIndices[0];
    const requestedSectionKey = String(options?.sectionKey || '').trim().toLowerCase();
    const scopedSectionKey = ['warmup', 'classwork', 'practice', 'dol'].includes(requestedSectionKey)
      ? requestedSectionKey
      : null;
    setActiveClassroomSectionKey(scopedSectionKey);
    setClassroomSectionReport(null);
    setActiveAssignmentId(assignmentId);`,
  'startAssignment section scope state',
);

replaceOne(
`    const questions = getStoredAssignmentQuestions(assignment);
    const includedQuestionIndices = getIncludedQuestionIndices(questions);`,
`    const questions = getStoredAssignmentQuestions(assignment);
    const allIncludedQuestionIndices = getIncludedQuestionIndices(questions);
    const includedQuestionIndices = activeClassroomSectionKey
      ? allIncludedQuestionIndices.filter((index) => (
          resolveQuestionActivityRole({ question: questions[index], assignment }) === activeClassroomSectionKey
        ))
      : allIncludedQuestionIndices;`,
  'assignment workspace section-scoped navigation',
);

replaceOne(
`    const currentSectionRemainingCount = Math.max(0, currentSectionQuestionCount - currentSectionCompletedCount);
    const warmupCanBeViewed = ['active', 'closed', 'ended'].includes(warmupState.status);`,
`    const currentSectionRemainingCount = Math.max(0, currentSectionQuestionCount - currentSectionCompletedCount);
    const currentSectionGrades = splitGradesBySection({ tracker: workingTracker, assignment });
    const currentSectionOfficialGrades = splitGradesBySection({ tracker: recordedTracker, assignment });
    const currentSectionGrade = currentSectionGrades[activeQuestionRole] || null;
    const currentSectionOfficialGrade = currentSectionOfficialGrades[activeQuestionRole] || null;
    const warmupCanBeViewed = ['active', 'closed', 'ended'].includes(warmupState.status);`,
  'current student section grade calculation',
);

replaceOne(
`                  <small style={{ marginTop: 2, fontWeight: 850, color: assignmentFeedbackHeld ? '#174ea6' : '#3c4043' }}>`,
`                  <small style={{ marginTop: 2, fontWeight: 900, color: currentSectionMeta.color }}>
                    {preview
                      ? \`${'${currentSectionMeta.label}'} section score ${'${currentSectionGrade?.score ?? 0}'}% · ${'${currentSectionGrade?.attempted ?? 0}'}/${'${currentSectionGrade?.total ?? 0}'} answered\`
                      : assignmentFeedbackHeld
                        ? \`${'${currentSectionMeta.label}'} section score available after teacher release\`
                        : lifecycle.isPracticeOnly
                          ? \`${'${currentSectionMeta.label}'} section score ${'${currentSectionOfficialGrade?.score ?? 0}'}% · official grade frozen · practice score ${'${currentSectionGrade?.score ?? 0}'}%\`
                          : \`${'${currentSectionMeta.label}'} section score ${'${currentSectionGrade?.score ?? 0}'}% · ${'${currentSectionGrade?.attempted ?? 0}'}/${'${currentSectionGrade?.total ?? 0}'} answered\`}
                  </small>
                  <small style={{ marginTop: 2, fontWeight: 850, color: assignmentFeedbackHeld ? '#174ea6' : '#3c4043' }}>`,
  'student current-section score display',
);

replaceOne(
`<thead><tr style={{ background: '#f8f9fa' }}><th style={{ padding: '12px' }}>Student</th><th>Score</th><th>Instructional condition</th><th>Activity</th><th>DOL / Classwork</th><th></th></tr></thead>`,
`<thead><tr style={{ background: '#f8f9fa' }}><th style={{ padding: '12px' }}>Student</th><th>Overall</th><th>Warm-Up</th><th>Classwork</th><th>Practice</th><th>DOL</th><th>Instructional condition</th><th>Activity</th><th></th></tr></thead>`,
  'teacher gradebook section headers',
);

replaceOne(
`const grades = student.gradesByAssignment?.[selectedAssignment.id]; const score = grades ? calculateGrade(grades, selectedAssignment) : null; const gradeSplit = splitGrade({ tracker: grades, assignment: selectedAssignment });`,
`const grades = student.gradesByAssignment?.[selectedAssignment.id]; const score = grades ? calculateGrade(grades, selectedAssignment) : null; const sectionGrades = splitGradesBySection({ tracker: grades, assignment: selectedAssignment }); const gradeSplit = splitGrade({ tracker: grades, assignment: selectedAssignment });`,
  'teacher gradebook section calculation',
);

replaceRegex(
  / const dolEntries = Object\.entries\(student\.dolGradesByAssignment\?\.\[selectedAssignment\.id\] \|\| \{\}\)\.sort\(\(\[a\], \[b\]\) => a\.localeCompare\(b\)\); const latestDol = dolEntries\.at\(-1\)\?\.\[1\]; const latestDolScore = latestDol \? calculateDOLSectionScore\(grades \|\| \{\}, latestDol\.questionIndices \|\| \[latestDol\.questionIndex\]\.filter\(Number\.isInteger\), selectedAssignment\) : null; const classwork = student\.classworkGradesByAssignment\?\.\[selectedAssignment\.id\];/,
  '',
  'retired gradebook DOL/Classwork-only calculations',
);

replaceOne(
`<td style={{ fontSize: '12px' }}>DOL: {latestDolScore !== null ? \`${'${latestDolScore}'}%\` : '—'}<br />Classwork: {classwork?.score ? \`${'${classwork.score}'}%\` : '—'}</td><td><button`,
`<td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.warmup.total ? \`${'${sectionGrades.warmup.score}'}%\` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.classwork.total ? \`${'${sectionGrades.classwork.score}'}%\` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.practice.total ? \`${'${sectionGrades.practice.score}'}%\` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.dol.total ? \`${'${sectionGrades.dol.score}'}%\` : '—'}</td><td><button`,
  'teacher gradebook section score cells',
);

replaceOne(
`  if (isStudentAssignment) {
    return renderAssignmentWorkspace(false);
  }`,
`  if (user.role === 'student' && activeView === 'classroomSectionReport' && classroomSectionReport) {
    const reportAssignment = assignments.find((assignment) => assignment.id === classroomSectionReport.assignmentId) || null;
    const reportSections = splitGradesBySection({
      tracker: tracker[classroomSectionReport.assignmentId] || {},
      assignment: reportAssignment,
    });
    const reportGrade = reportSections[classroomSectionReport.sectionKey] || null;
    return (
      <>
        {renderStudentPackUpBanner()}
        {renderStudentWarmupBanner()}
        <main style={{ minHeight: '100vh', background: '#f5f7fb', padding: '28px 18px', fontFamily: '\"Segoe UI\", sans-serif' }}>
          <section style={{ maxWidth: 760, margin: '0 auto', padding: 24, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6', boxShadow: '0 6px 20px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368' }}>Google Classroom · official frozen report</div>
            <h1 style={{ margin: '8px 0 4px', fontSize: 24, color: '#202124' }}>{reportAssignment?.title || 'MathMaster Assignment'}</h1>
            <h2 style={{ margin: '0 0 18px', fontSize: 18, color: '#174ea6' }}>{classroomSectionReport.sectionLabel} section</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
              <div style={{ padding: 14, borderRadius: 10, background: '#e8f0fe' }}><div style={{ fontSize: 11, fontWeight: 900, color: '#5f6368' }}>SECTION GRADE</div><strong style={{ display: 'block', marginTop: 4, fontSize: 28, color: '#174ea6' }}>{reportGrade?.score ?? 0}%</strong></div>
              <div style={{ padding: 14, borderRadius: 10, background: '#f8f9fa' }}><div style={{ fontSize: 11, fontWeight: 900, color: '#5f6368' }}>ANSWERED</div><strong style={{ display: 'block', marginTop: 4, fontSize: 22, color: '#202124' }}>{reportGrade?.attempted ?? 0} / {reportGrade?.total ?? classroomSectionReport.questionIndices?.length ?? 0}</strong></div>
              <div style={{ padding: 14, borderRadius: 10, background: '#e6f4ea' }}><div style={{ fontSize: 11, fontWeight: 900, color: '#5f6368' }}>STATUS</div><strong style={{ display: 'block', marginTop: 4, fontSize: 16, color: '#137333' }}>Official grade frozen</strong></div>
            </div>
            <p style={{ color: '#5f6368', lineHeight: 1.55 }}>This is the recorded {classroomSectionReport.sectionLabel} grade tied to this Google Classroom post. Practice after the final late deadline is separate and cannot change this frozen grade, evidence, mastery, or Classroom score.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <button type="button" onClick={() => startAssignment(classroomSectionReport.assignmentId, classroomSectionReport.questionIndex, { sectionKey: classroomSectionReport.sectionKey })} style={{ padding: '10px 15px', border: 0, borderRadius: 8, background: '#174ea6', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Practice this section</button>
              <button type="button" onClick={() => { setClassroomSectionReport(null); setActiveClassroomSectionKey(null); setActiveAssignmentId(null); setActiveView('dashboard'); }} style={{ padding: '10px 15px', border: '1px solid #c9ced6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}>Return to dashboard</button>
            </div>
          </section>
        </main>
      </>
    );
  }

  if (isStudentAssignment) {
    return renderAssignmentWorkspace(false);
  }`,
  'closed Classroom section report screen',
);

// Reset section/report scope when an assignment is forcibly abandoned or a
// user signs out, so a later normal dashboard launch cannot inherit a Classroom scope.
replaceOne(
`  const leaveUnavailableAssignment = () => {
    setActiveAssignmentId(null);
    setActiveView('dashboard');`,
`  const leaveUnavailableAssignment = () => {
    setActiveAssignmentId(null);
    setActiveClassroomSectionKey(null);
    setClassroomSectionReport(null);
    setActiveView('dashboard');`,
  'unavailable assignment clears Classroom section scope',
);

replaceOne(
`    setTeacherWorkspaceMode('teacher');
    setActiveAssignmentId(null);
    setPracticeTracker({});`,
`    setTeacherWorkspaceMode('teacher');
    setActiveAssignmentId(null);
    setActiveClassroomSectionKey(null);
    setClassroomSectionReport(null);
    setPendingClassroomLaunch(null);
    setPracticeTracker({});`,
  'logout clears Classroom launch state',
);

fs.writeFileSync(path, source);
console.log('Applied checked Classroom section App wiring to src/App.jsx');
