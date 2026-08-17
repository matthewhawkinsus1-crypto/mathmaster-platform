import { useEffect, useMemo, useState } from 'react';
import {
  ensureClassroomTopics,
  getClassroomConnectionStatus,
  getGoogleAuthUrl,
  getGoogleClassroomDiagnostics,
  linkClassroomRosterBatch,
  listClassroomCourseMappings,
  listClassroomGradeSyncs,
  listGoogleCourses,
  listClassroomStudents,
  listPublishedAssignments,
  inspectClassroomPublication,
  removeAssignmentClassroomPackage,
  publishAssignmentToClassrooms,
  publishClassroomMaterial,
  storeLessonNotesPdf,
  retryClassroomGradeSync,
  saveClassroomCourseMapping,
  updateAssignmentClassroomPublications,
} from './classroomApi';
import { assertPublishable, isLibraryAssignment } from './assignmentDestinations';
import { summarizeAssignmentSync } from './classroomSyncState';
import {
  buildRosterMatchPlan,
  buildTopicPlan,
  mathMasterStudentLabel,
  studentsForClass,
  suggestClassroomTopic,
} from './classroomRosterMatching';
import { blobToBase64, generateLessonNotesPdfBlob, notesPdfSummary } from './platform/resources/lessonNotesPdf';

const card = { background: '#fff', border: '1px solid #e0e3e7', borderRadius: 12, padding: 16 };
const label = { display: 'block', fontSize: 12, fontWeight: 800, color: '#5f6368', marginBottom: 6 };
const input = { width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #c7cdd4', boxSizing: 'border-box', background: '#fff' };
const btn = { padding: '10px 15px', fontSize: 13, fontWeight: 800, borderRadius: 8, border: 0, cursor: 'pointer' };
const primary = { ...btn, background: '#1a73e8', color: '#fff' };
const secondary = { ...btn, background: '#eef2f7', color: '#202124', border: '1px solid #d8dee6' };
const danger = { ...btn, background: '#fce8e6', color: '#a50e0e', border: '1px solid #f4c7c3' };
const okPill = { display: 'inline-block', padding: '3px 8px', borderRadius: 99, background: '#e6f4ea', color: '#137333', fontSize: 11, fontWeight: 800 };
const warnPill = { ...okPill, background: '#fef7e0', color: '#7a4f00' };
const badPill = { ...okPill, background: '#fce8e6', color: '#a50e0e' };

const clean = (value) => String(value || '').trim();
const classIdOf = (record) => clean(record?.classId || record?.id);
const classNameOf = (record) => clean(record?.name || record?.className || record?.title || record?.period || classIdOf(record));
const classPeriodOf = (record) => clean(record?.period || record?.classPeriod);

function courseLabel(course) {
  const details = [course.section, course.room].filter(Boolean).join(' · ');
  return details ? `${course.name} — ${details}` : course.name;
}

function matchingCoursesForAssignment(assignment, mappings, classes) {
  const assigned = new Set((assignment?.assignedClassPeriods || []).map(String));
  if (!assigned.size) return [];
  const byId = new Map(classes.map((record) => [classIdOf(record), record]));
  return mappings
    .filter((mapping) => assigned.has(classPeriodOf(byId.get(String(mapping.classId)))))
    .map((mapping) => String(mapping.courseId));
}

export default function ClassroomManagerV2({
  assignments = [],
  classes = [],
  students = [],
  teacherEmail = '',
}) {
  const [connection, setConnection] = useState({ connected: false, needsReconnect: false, missingScopes: [] });
  const [diagnostics, setDiagnostics] = useState(null);
  const [courses, setCourses] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [links, setLinks] = useState([]);
  const [gradeSyncs, setGradeSyncs] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [rosterCourseId, setRosterCourseId] = useState('');
  const [roster, setRoster] = useState([]);
  const [manualMatches, setManualMatches] = useState({});
  const [assignmentId, setAssignmentId] = useState('');
  const [topicName, setTopicName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [resourceMode, setResourceMode] = useState('separate');
  const [materials, setMaterials] = useState([{ title: '', url: '' }]);
  const [materialTitle, setMaterialTitle] = useState('Lesson Notes & Resources');
  const [materialDescription, setMaterialDescription] = useState('');
  const [topicNamesText, setTopicNamesText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const classById = useMemo(
    () => new Map(classes.map((record) => [classIdOf(record), record])),
    [classes],
  );
  const mappingByCourse = useMemo(
    () => new Map(mappings.map((mapping) => [String(mapping.courseId), mapping])),
    [mappings],
  );
  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => String(assignment.id) === String(assignmentId)) || null,
    [assignments, assignmentId],
  );
  const rosterMapping = rosterCourseId ? mappingByCourse.get(String(rosterCourseId)) : null;
  const mappedClass = rosterMapping ? classById.get(String(rosterMapping.classId)) : null;
  const classStudents = useMemo(
    () => studentsForClass(students, mappedClass),
    [students, mappedClass],
  );
  const matchPlan = useMemo(
    () => buildRosterMatchPlan({ classroomStudents: roster, mathMasterStudents: classStudents }),
    [roster, classStudents],
  );
  const topicPlan = useMemo(() => buildTopicPlan(assignments.filter((a) => !a.archived)), [assignments]);
  const syncByAssignment = useMemo(
    () => assignments
      .map((assignment) => ({ assignment, sync: summarizeAssignmentSync(assignment, links) }))
      .filter((entry) => entry.sync.publishedCount > 0),
    [assignments, links],
  );

  const refreshManagerData = async () => {
    const [connectionResult, mappingResult, linksResult, gradeResult] = await Promise.all([
      getClassroomConnectionStatus(),
      listClassroomCourseMappings(),
      listPublishedAssignments(),
      listClassroomGradeSyncs(),
    ]);
    setConnection(connectionResult || { connected: false });
    setMappings(mappingResult.mappings || []);
    setLinks(linksResult.links || []);
    setGradeSyncs(gradeResult.syncs || []);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('classroomConnected')) setStatus('Google Classroom reconnected successfully.');
    if (params.get('classroomError')) setError(`Google Classroom connection failed: ${params.get('classroomError')}`);
    refreshManagerData().catch((err) => setError(err.message));
  }, []);

  const run = async (work) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () => run(async () => {
    const { url } = await getGoogleAuthUrl();
    window.location.href = url;
  });

  const handleLoadCourses = () => run(async () => {
    const response = await listGoogleCourses();
    const loaded = response.courses || [];
    setCourses(loaded);
    if (!rosterCourseId && loaded[0]) setRosterCourseId(String(loaded[0].id));
    setStatus(`Loaded ${loaded.length} active Google Classroom course${loaded.length === 1 ? '' : 's'}.`);
  });

  const handleSaveMapping = (course, classId) => run(async () => {
    if (!classId) throw new Error('Choose the MathMaster class first.');
    await saveClassroomCourseMapping({
      courseId: String(course.id),
      courseName: course.name,
      courseSection: course.section || '',
      classId,
    });
    const result = await listClassroomCourseMappings();
    setMappings(result.mappings || []);
    setStatus(`${course.name} is now mapped to ${classNameOf(classById.get(classId))}.`);
  });

  const handleImportRoster = () => run(async () => {
    if (!rosterCourseId) throw new Error('Choose a Google Classroom course.');
    if (!mappingByCourse.get(String(rosterCourseId))) {
      throw new Error('Map this Google Classroom course to a MathMaster class before importing its roster.');
    }
    const response = await listClassroomStudents({ courseId: rosterCourseId });
    setRoster(response.students || []);
    setManualMatches({});
    setStatus(`Loaded ${(response.students || []).length} Google Classroom students.`);
  });

  const handleAutoLink = () => run(async () => {
    if (!rosterMapping) throw new Error('Map this course first.');
    const exact = matchPlan
      .filter((item) => item.status === 'exact-email' && item.suggestedStudent)
      .map((item) => ({
        studentId: String(item.suggestedStudent.id),
        googleUserId: String(item.classroomStudent.googleUserId),
        email: item.classroomStudent.email || null,
        name: item.classroomStudent.name || null,
      }));
    if (!exact.length) throw new Error('There are no unique exact-email matches to auto-link.');
    await linkClassroomRosterBatch({
      courseId: rosterCourseId,
      classId: rosterMapping.classId,
      links: exact,
    });
    setStatus(`Linked ${exact.length} exact school-email match${exact.length === 1 ? '' : 'es'} for grade passback.`);
  });

  const handleLinkOne = (item) => run(async () => {
    if (!rosterMapping) throw new Error('Map this course first.');
    const selectedId = manualMatches[item.classroomStudent.googleUserId]
      || item.suggestedStudent?.id;
    if (!selectedId) throw new Error('Choose the MathMaster student.');
    await linkClassroomRosterBatch({
      courseId: rosterCourseId,
      classId: rosterMapping.classId,
      links: [{
        studentId: String(selectedId),
        googleUserId: String(item.classroomStudent.googleUserId),
        email: item.classroomStudent.email || null,
        name: item.classroomStudent.name || null,
      }],
    });
    setStatus(`Linked ${item.classroomStudent.name} to MathMaster ID ${selectedId}.`);
  });

  const handleAssignmentChange = (value) => {
    setAssignmentId(value);
    const assignment = assignments.find((item) => String(item.id) === String(value));
    const classroom = assignment?.classroomPackage || {};
    const notes = assignment?.lessonResources?.notesPdf || null;
    setTopicName(classroom?.topic?.name || (assignment ? suggestClassroomTopic(assignment) : ''));
    setInstructions(classroom?.assignmentPost?.instructions
      || (assignment ? `Complete "${assignment.title}" in MathMaster. Use the Open in MathMaster link below.` : ''));
    const postingMode = classroom?.resourcesPost?.postingMode;
    setResourceMode(postingMode === 'attachToAssignment' ? 'attach' : postingMode === 'none' ? 'none' : 'separate');
    setMaterialTitle(classroom?.resourcesPost?.title || (assignment ? `${assignment.title} — Notes & Resources` : 'Lesson Notes & Resources'));
    setMaterialDescription(classroom?.resourcesPost?.description || (assignment ? `Reference materials for ${assignment.title}.` : ''));
    const authoredLinks = Array.isArray(classroom?.additionalLinks) ? classroom.additionalLinks : [];
    setMaterials(authoredLinks.length ? authoredLinks.map((item) => ({ title: item.title || '', url: item.url || '' })) : [{ title: '', url: '' }]);
    const suggested = assignment ? matchingCoursesForAssignment(assignment, mappings, classes) : [];
    setSelectedCourseIds(suggested);
    if (notes?.enabled) {
      setStatus(`AI prepared ${notes.title || 'student notes'} (${Number(notes.targetPages) === 1 ? 1 : 2} page target) and Classroom publishing information.`);
    }
  };

  const cleanMaterials = () => materials
    .map((item) => ({ title: item.title.trim(), url: item.url.trim() }))
    .filter((item) => item.title && item.url);

  const handlePublishAssignment = () => run(async () => {
    assertPublishable(selectedAssignment);
    if (!selectedCourseIds.length) throw new Error('Select at least one mapped Google Classroom course.');

    const classroom = selectedAssignment?.classroomPackage || {};
    const notesPdf = selectedAssignment?.lessonResources?.notesPdf || null;
    const resourceLinks = cleanMaterials();

    // The V5 JSON contains structured notes, not a binary file. Generate the
    // 1–2 page PDF only when the teacher actually publishes, then store it once
    // and reuse its public-by-token Firebase Storage link in Classroom.
    if (notesPdf?.enabled && !notesPdf?.asset?.url) {
      setStatus(`Generating ${notesPdf.title || 'student notes'}…`);
      const generated = await generateLessonNotesPdfBlob({ assignment: selectedAssignment, notesPdf });
      const base64 = await blobToBase64(generated.blob);
      const stored = await storeLessonNotesPdf({
        assignmentId: selectedAssignment.id,
        fileName: notesPdf.fileName,
        title: notesPdf.title,
        pageCount: generated.pageCount,
        base64,
      });
      resourceLinks.unshift({
        title: notesPdf.title || `${selectedAssignment.title} — Student Notes`,
        url: stored.url,
      });
    } else if (notesPdf?.asset?.url) {
      resourceLinks.unshift({
        title: notesPdf.title || `${selectedAssignment.title} — Student Notes`,
        url: notesPdf.asset.url,
      });
    }

    const dedupedLinks = [...new Map(resourceLinks.map((item) => [item.url, item])).values()];
    const resourcesEnabled = classroom?.resourcesPost?.enabled !== false && resourceMode !== 'none';
    if (resourcesEnabled && resourceMode === 'separate' && dedupedLinks.length) {
      await publishClassroomMaterial({
        courseIds: selectedCourseIds,
        materialKey: `assignment:${selectedAssignment.id}:resources`,
        title: classroom?.resourcesPost?.title || materialTitle || `${selectedAssignment.title} — Notes & Resources`,
        description: classroom?.resourcesPost?.description || materialDescription || `Reference materials for ${selectedAssignment.title}.`,
        topicName,
        materials: dedupedLinks,
      });
    }
    const response = await publishAssignmentToClassrooms({
      courseIds: selectedCourseIds,
      assignmentId: selectedAssignment.id,
      classroomTitle: classroom?.assignmentPost?.title || selectedAssignment.title,
      maxPoints: Number(classroom?.assignmentPost?.maxPoints) || 100,
      gradePassbackEnabled: classroom?.gradePassback?.enabled !== false,
      topicName,
      instructions,
      materials: resourcesEnabled && resourceMode === 'attach' ? dedupedLinks : [],
    });
    const summary = response.summary || {};
    setStatus(`Published/connected ${Number(summary.published || 0) + Number(summary.alreadyPublished || 0)} Classroom assignment post(s)${dedupedLinks.length ? ' with the AI-prepared resources package' : ''}.`);
    setLinks((await listPublishedAssignments()).links || []);
    setGradeSyncs((await listClassroomGradeSyncs()).syncs || []);
  });

  const handlePublishMaterial = () => run(async () => {
    const resourceLinks = cleanMaterials();
    if (!selectedCourseIds.length) throw new Error('Select at least one Classroom destination.');
    if (!materialTitle.trim()) throw new Error('Give the material post a title.');
    if (!resourceLinks.length) throw new Error('Add at least one link for the notes/material post.');
    const response = await publishClassroomMaterial({
      courseIds: selectedCourseIds,
      materialKey: `manual:${Date.now()}`,
      title: materialTitle.trim(),
      description: materialDescription.trim(),
      topicName: topicName.trim(),
      materials: resourceLinks,
    });
    setStatus(`Published material to ${(response.results || []).filter((r) => r.status !== 'failed').length} course(s).`);
  });

  const handleCreateTopics = () => run(async () => {
    const names = topicNamesText
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!selectedCourseIds.length) throw new Error('Select at least one Google Classroom course.');
    if (!names.length) throw new Error('Enter at least one topic name.');
    await ensureClassroomTopics({ courseIds: selectedCourseIds, topicNames: names });
    setStatus(`Ensured ${names.length} topic${names.length === 1 ? '' : 's'} across ${selectedCourseIds.length} selected course(s).`);
  });

  const toggleCourse = (courseId) => {
    const id = String(courseId);
    setSelectedCourseIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  };

  const mappedCourseCards = courses.map((course) => ({
    course,
    mapping: mappingByCourse.get(String(course.id)),
  }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>Google Classroom Manager</h2>
        <p style={{ color: '#5f6368', marginBottom: 0 }}>
          Map classes once, link rosters once, publish organized Classroom posts, and monitor grade passback.
        </p>
      </div>

      {status && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#e6f4ea', color: '#137333' }}>{status}</div>}
      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <strong>1. Classroom connection</strong>
            <div style={{ color: '#5f6368', fontSize: 13, marginTop: 4 }}>
              {connection.connected ? 'Connected' : 'Not connected'}
              {connection.needsReconnect ? ' · reconnect required for current permissions' : ''}
            </div>
          </div>
          <span style={connection.connected && !connection.needsReconnect ? okPill : warnPill}>
            {connection.connected && !connection.needsReconnect ? 'READY' : 'ACTION NEEDED'}
          </span>
        </div>
        {connection.missingScopes?.length > 0 && (
          <p style={{ fontSize: 12, color: '#7a4f00' }}>
            Reconnect once to grant the new Topics / Materials permissions used by Classroom V2.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button style={secondary} disabled={busy} onClick={() => run(async () => {
            const value = await getGoogleClassroomDiagnostics();
            setDiagnostics(value);
            setStatus(value.ok ? 'Server configuration passed.' : '');
            if (!value.ok) setError((value.problems || []).join(' '));
          })}>Connection Check</button>
          <button style={primary} disabled={busy} onClick={handleConnect}>
            {connection.connected ? 'Reconnect Google Classroom' : 'Connect Google Classroom'}
          </button>
          <button style={secondary} disabled={busy || !connection.connected} onClick={handleLoadCourses}>Load Active Courses</button>
        </div>
        {diagnostics && (
          <div style={{ marginTop: 10, fontSize: 12, color: diagnostics.ok ? '#137333' : '#a50e0e' }}>
            {diagnostics.ok ? 'OAuth configuration, Firestore and launch-link configuration passed.' : (diagnostics.problems || []).join(' ')}
          </div>
        )}
      </section>

      {courses.length > 0 && (
        <section style={card}>
          <strong>2. Map Google Classroom courses to MathMaster classes</strong>
          <p style={{ color: '#5f6368', fontSize: 13 }}>
            This mapping is the guardrail that keeps Algebra I students, assignments and grades out of an Algebra II Classroom.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {mappedCourseCards.map(({ course, mapping }) => (
              <div key={course.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(240px,1fr) auto', gap: 10, alignItems: 'center' }}>
                <div>
                  <strong>{course.name}</strong>
                  <div style={{ color: '#5f6368', fontSize: 12 }}>{[course.section, course.room].filter(Boolean).join(' · ')}</div>
                </div>
                <select
                  style={input}
                  value={mapping?.classId || ''}
                  onChange={(event) => handleSaveMapping(course, event.target.value)}
                  disabled={busy}
                >
                  <option value="">Choose MathMaster class…</option>
                  {classes.map((record) => (
                    <option key={classIdOf(record)} value={classIdOf(record)}>
                      {classNameOf(record)}{classPeriodOf(record) ? ` · ${classPeriodOf(record)}` : ''}
                    </option>
                  ))}
                </select>
                <span style={mapping ? okPill : warnPill}>{mapping ? 'MAPPED' : 'NOT MAPPED'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {courses.length > 0 && (
        <section style={card}>
          <strong>3. Link the Google roster for grade passback</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 12 }}>
            <div style={{ flex: '1 1 320px' }}>
              <label style={label}>Google Classroom course</label>
              <select style={input} value={rosterCourseId} onChange={(event) => { setRosterCourseId(event.target.value); setRoster([]); }} disabled={busy}>
                <option value="">Choose a course…</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{courseLabel(course)}</option>)}
              </select>
            </div>
            <button style={secondary} disabled={busy || !rosterCourseId} onClick={handleImportRoster}>Import Roster</button>
            <button style={primary} disabled={busy || !matchPlan.some((m) => m.status === 'exact-email')} onClick={handleAutoLink}>
              Auto-link exact emails
            </button>
          </div>
          {rosterCourseId && !rosterMapping && <p style={{ color: '#a50e0e', fontSize: 12 }}>Map this course to a MathMaster class first.</p>}
          {matchPlan.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: '#5f6368' }}>
                  <th style={{ padding: 8 }}>Google Classroom</th><th style={{ padding: 8 }}>MathMaster match</th><th style={{ padding: 8 }}>Match</th><th></th>
                </tr></thead>
                <tbody>
                  {matchPlan.map((item) => {
                    const google = item.classroomStudent;
                    const selected = manualMatches[google.googleUserId] || item.suggestedStudent?.id || '';
                    return (
                      <tr key={google.googleUserId} style={{ borderTop: '1px solid #edf0f2' }}>
                        <td style={{ padding: 8 }}><strong>{google.name}</strong><div style={{ color: '#5f6368' }}>{google.email}</div></td>
                        <td style={{ padding: 8 }}>
                          <select style={input} value={selected} onChange={(event) => setManualMatches((current) => ({ ...current, [google.googleUserId]: event.target.value }))}>
                            <option value="">Choose student…</option>
                            {classStudents.map((student) => <option key={student.id} value={student.id}>{mathMasterStudentLabel(student)} · ID {student.id}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 8 }}>
                          <span style={item.status === 'exact-email' ? okPill : item.status === 'exact-name' ? warnPill : item.status === 'ambiguous' ? warnPill : badPill}>
                            {item.status === 'exact-email' ? 'EXACT EMAIL' : item.status === 'exact-name' ? 'NAME — REVIEW' : item.status === 'ambiguous' ? 'AMBIGUOUS' : 'NO MATCH'}
                          </span>
                        </td>
                        <td style={{ padding: 8 }}><button style={secondary} disabled={busy || !selected} onClick={() => handleLinkOne(item)}>Confirm link</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {courses.length > 0 && (
        <section style={card}>
          <strong>4. Classroom destinations and organization</strong>
          <p style={{ color: '#5f6368', fontSize: 13 }}>Choose where the next assignment/material should go. Mapped courses are safer than “select all.”</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {courses.map((course) => {
              const selected = selectedCourseIds.includes(String(course.id));
              const mapping = mappingByCourse.get(String(course.id));
              return (
                <label key={course.id} style={{ border: selected ? '2px solid #1a73e8' : '1px solid #d8dee6', borderRadius: 8, padding: '9px 11px', minWidth: 220 }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleCourse(course.id)} />{' '}
                  <strong>{course.name}</strong>
                  <div style={{ fontSize: 11, color: mapping ? '#137333' : '#a50e0e', marginLeft: 18 }}>{mapping ? `→ ${classNameOf(classById.get(String(mapping.classId)))}` : 'Not mapped'}</div>
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={label}>Topic names, one per line</label>
              <textarea style={{ ...input, minHeight: 90 }} value={topicNamesText} onChange={(e) => setTopicNamesText(e.target.value)} placeholder="Module 1 • Functions&#10;Module 2 • Linear Functions" />
            </div>
            <button style={secondary} disabled={busy} onClick={handleCreateTopics}>Create / ensure topics</button>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Smart organization plan from the MathMaster library</summary>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {topicPlan.slice(0, 40).map((entry) => (
                <div key={entry.topic} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{entry.topic}</span><span>{entry.count} assignment{entry.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
            <button style={{ ...secondary, marginTop: 10 }} onClick={() => setTopicNamesText(topicPlan.map((entry) => entry.topic).join('\n'))}>Use this topic plan</button>
          </details>
        </section>
      )}

      {courses.length > 0 && (
        <section style={card}>
          <strong>5. Publish a MathMaster assignment</strong>
          <div style={{ marginTop: 12 }}>
            <label style={label}>MathMaster assignment</label>
            <select style={input} value={assignmentId} onChange={(e) => handleAssignmentChange(e.target.value)}>
              <option value="">Choose an assignment…</option>
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.title}{isLibraryAssignment(assignment) ? ' — library / not assigned' : ''}
                </option>
              ))}
            </select>
          </div>
          {selectedAssignment && (selectedAssignment.classroomPackage || selectedAssignment.lessonResources?.notesPdf) && (() => {
            const notes = notesPdfSummary(selectedAssignment.lessonResources?.notesPdf || {});
            return (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: '#eef6ff', border: '1px solid #c5d9f7', fontSize: 12, lineHeight: 1.5 }}>
                <strong style={{ color: '#174ea6' }}>AI-prepared publishing package</strong>
                <div>Topic: {selectedAssignment.classroomPackage?.topic?.name || topicName || 'MathMaster will infer it'}</div>
                <div>Classroom instructions: {selectedAssignment.classroomPackage?.assignmentPost?.instructions ? 'prepared' : 'MathMaster default'}</div>
                <div>Student notes PDF: {notes.enabled ? `${notes.title || 'prepared'} · ${notes.targetPages} page target · ${notes.sectionCount} section${notes.sectionCount === 1 ? '' : 's'}` : 'not requested'}</div>
                <div>Destination courses are selected automatically from the assignment's MathMaster class periods and your saved class mappings.</div>
              </div>
            );
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(220px,1fr)', gap: 10, marginTop: 10 }}>
            <div><label style={label}>Classroom topic</label><input style={input} value={topicName} onChange={(e) => setTopicName(e.target.value)} /></div>
            <div>
              <label style={label}>Notes/material delivery</label>
              <select style={input} value={resourceMode} onChange={(e) => setResourceMode(e.target.value)}>
                <option value="separate">Separate Notes & Resources post (recommended)</option>
                <option value="attach">Attach links inside the graded assignment post</option>
                <option value="none">Do not publish a resources post</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={label}>Student instructions</label>
            <textarea style={{ ...input, minHeight: 80 }} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={label}>Links / notes / resources</label>
            {materials.map((material, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 7 }}>
                <input style={input} placeholder="Title" value={material.title} onChange={(e) => setMaterials((current) => current.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} />
                <input style={input} placeholder="https://…" value={material.url} onChange={(e) => setMaterials((current) => current.map((item, i) => i === index ? { ...item, url: e.target.value } : item))} />
              </div>
            ))}
            <button style={secondary} onClick={() => setMaterials((current) => [...current, { title: '', url: '' }])}>+ Add resource link</button>
          </div>
          <button style={{ ...primary, marginTop: 12 }} disabled={busy || !selectedAssignment} onClick={handlePublishAssignment}>Publish assignment package</button>
        </section>
      )}

      {courses.length > 0 && (
        <section style={card}>
          <strong>6. Publish a standalone notes/material post</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <input style={input} value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} placeholder="Lesson 3 — Notes & Resources" />
            <textarea style={{ ...input, minHeight: 70 }} value={materialDescription} onChange={(e) => setMaterialDescription(e.target.value)} placeholder="What students should know about these resources…" />
          </div>
          <button style={{ ...primary, marginTop: 10 }} disabled={busy} onClick={handlePublishMaterial}>Publish material post</button>
        </section>
      )}

      {syncByAssignment.length > 0 && (
        <section style={card}>
          <strong>7. Published assignment health</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {syncByAssignment.map(({ assignment, sync }) => (
              <div key={assignment.id} style={{ border: '1px solid #edf0f2', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span><strong>{assignment.title}</strong><div style={{ color: '#5f6368', fontSize: 12 }}>{sync.message}</div></span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={secondary} disabled={busy} onClick={() => run(async () => {
                      const inspection = await inspectClassroomPublication({
                        assignmentId: assignment.id,
                        repairAudience: true,
                      });
                      const summary = inspection?.summary || {};
                      const failed = Number(summary.failed || 0);
                      const rosterStudents = Number(summary.rosterStudents || 0);
                      if (failed) {
                        throw new Error(`Classroom audience check had ${failed} failure${failed === 1 ? '' : 's'}.`);
                      }
                      setStatus(
                        rosterStudents > 0
                          ? `Google Classroom reports ${rosterStudents} enrolled student${rosterStudents === 1 ? '' : 's'}. The MathMaster post is assigned to ALL_STUDENTS.`
                          : 'Google Classroom reports 0 enrolled students for this destination. The post is set to ALL_STUDENTS, but students must first be enrolled in that Google Classroom course.'
                      );
                    })}>Check / repair students</button>

                    {sync.needsUpdate && <button style={secondary} disabled={busy} onClick={() => run(async () => {
                      await updateAssignmentClassroomPublications({ assignmentId: assignment.id });
                      setLinks((await listPublishedAssignments()).links || []);
                      setStatus('Google Classroom due date updated.');
                    })}>Update Classroom due date</button>}

                    <button style={danger} disabled={busy} onClick={() => {
                      const confirmed = window.confirm(
                        `Remove "${assignment.title}" and its linked Notes & Resources post from Google Classroom?

The MathMaster assignment, student work, and MathMaster grades will remain.`
                      );
                      if (!confirmed) return;
                      run(async () => {
                        const response = await removeAssignmentClassroomPackage({
                          assignmentId: assignment.id,
                        });
                        const failed = Number(response?.summary?.failed || 0);
                        if (failed) {
                          throw new Error(`Classroom removal finished with ${failed} failure${failed === 1 ? '' : 's'}.`);
                        }
                        setLinks((await listPublishedAssignments()).links || []);
                        setGradeSyncs((await listClassroomGradeSyncs()).syncs || []);
                        setStatus('Removed the MathMaster-created assignment and Notes & Resources post from Google Classroom. The MathMaster assignment remains.');
                      });
                    }}>Remove from Classroom</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={card}>
        <strong>8. Grade passback monitor</strong>
        <p style={{ color: '#5f6368', fontSize: 13 }}>
          Finalized MathMaster grades sync to linked Google Classroom submissions. Failures stay visible instead of disappearing silently.
        </p>
        {gradeSyncs.length === 0 ? (
          <div style={{ color: '#5f6368', fontSize: 13 }}>No grade-sync events yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ textAlign: 'left', color: '#5f6368' }}>
                <th style={{ padding: 7 }}>Student</th><th style={{ padding: 7 }}>Assignment</th><th style={{ padding: 7 }}>Course</th><th style={{ padding: 7 }}>Grade</th><th style={{ padding: 7 }}>Status</th><th></th>
              </tr></thead>
              <tbody>
                {gradeSyncs.slice(0, 100).map((sync) => (
                  <tr key={sync.syncId || `${sync.publicationId}-${sync.studentId}`} style={{ borderTop: '1px solid #edf0f2' }}>
                    <td style={{ padding: 7 }}>{sync.studentId}</td>
                    <td style={{ padding: 7 }}>{sync.assignmentId}</td>
                    <td style={{ padding: 7 }}>{sync.courseId}</td>
                    <td style={{ padding: 7 }}>{sync.grade ?? '—'}</td>
                    <td style={{ padding: 7 }}><span style={sync.status === 'synced' ? okPill : sync.status?.startsWith('skipped') ? warnPill : badPill}>{sync.status || 'unknown'}</span></td>
                    <td style={{ padding: 7 }}>
                      {sync.status !== 'synced' && sync.assignmentId && sync.studentId && (
                        <button style={secondary} disabled={busy} onClick={() => run(async () => {
                          await retryClassroomGradeSync({
                            publicationId: sync.publicationId,
                            studentId: sync.studentId,
                            assignmentId: sync.assignmentId,
                          });
                          setStatus('Grade retry queued. The passback trigger will run again.');
                        })}>Retry</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p style={{ color: '#80868b', fontSize: 11, margin: 0 }}>
        Signed-in teacher: {teacherEmail || 'teacher'}. Classroom V2 keeps each teacher's Google connection separate.
      </p>
    </div>
  );
}
