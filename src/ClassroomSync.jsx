import { useEffect, useMemo, useState } from 'react';
import {
  getGoogleAuthUrl,
  getGoogleClassroomDiagnostics,
  getClassroomConnectionStatus,
  listGoogleCourses,
  listClassroomStudents,
  linkStudentToClassroom,
  publishAssignmentToClassrooms,
  listPublishedAssignments,
} from './classroomApi';
import { assertPublishable, isLibraryAssignment } from './assignmentDestinations';

const card = { background: '#fff', borderRadius: '12px', padding: '5px' };
const label = { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#5f6368', marginBottom: '6px' };
const input = { width: '100%', padding: '10px', fontSize: '14px', borderRadius: '6px', border: '1px solid #dadce0', boxSizing: 'border-box' };
const button = { padding: '10px 18px', fontSize: '14px', fontWeight: 'bold', borderRadius: '8px', border: 'none', cursor: 'pointer' };
const primaryButton = { ...button, background: '#1a73e8', color: '#fff' };
const secondaryButton = { ...button, background: '#f1f3f4', color: '#202124' };
const courseCard = (selected) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '11px',
  borderRadius: '8px',
  border: selected ? '2px solid #1a73e8' : '1px solid #dadce0',
  background: selected ? '#e8f0fe' : '#fff',
  cursor: 'pointer',
});

function courseLabel(course) {
  const details = [course.section, course.room].filter(Boolean).join(' · ');
  return details ? `${course.name} — ${details}` : course.name;
}

function statusColor(status) {
  if (status === 'published' || status === 'already-published') return '#188038';
  if (status === 'failed') return '#c5221f';
  if (status === 'publishing' || status === 'in-progress') return '#b06000';
  return '#5f6368';
}

export default function ClassroomSync({ assignments = [] }) {
  const [connected, setConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [courses, setCourses] = useState([]);
  const [rosterCourseId, setRosterCourseId] = useState('');
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterMap, setRosterMap] = useState({});
  const [assignmentId, setAssignmentId] = useState('');
  const [materials, setMaterials] = useState([{ title: '', url: '' }]);
  const [links, setLinks] = useState([]);
  const [publishResults, setPublishResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);

  const selectedCourses = useMemo(
    () => courses.filter((course) => selectedCourseIds.includes(String(course.id))),
    [courses, selectedCourseIds]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('classroomConnected')) setStatusMessage('Google Classroom connected. Load courses to continue.');
    if (params.get('classroomError')) setError(`Google Classroom connection failed: ${params.get('classroomError')}`);

    getClassroomConnectionStatus()
      .then((res) => setConnected(res.connected))
      .catch(() => setConnected(false));

    listPublishedAssignments()
      .then((res) => setLinks(res.links || []))
      .catch(() => {});
  }, []);

  const refreshPublications = async () => {
    const refreshed = await listPublishedAssignments();
    setLinks(refreshed.links || []);
  };

  const handleRunConnectionCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await getGoogleClassroomDiagnostics();
      setDiagnostics(result);
      if (result.ok) {
        setStatusMessage('Google Classroom server configuration passed. You can connect the teacher account.');
      } else {
        setError(result.problems?.join(' ') || 'Google Classroom configuration is incomplete.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const handleLoadCourses = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await listGoogleCourses();
      const loaded = res.courses || [];
      setCourses(loaded);
      if (!rosterCourseId && loaded[0]) setRosterCourseId(String(loaded[0].id));
      setStatusMessage(`Loaded ${loaded.length} active Google Classroom course${loaded.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImportRoster = async () => {
    if (!rosterCourseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await listClassroomStudents({ courseId: rosterCourseId });
      setRoster(res.students || []);
      setRosterMap({});
      setStatusMessage(`Loaded ${(res.students || []).length} students for the selected course.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLinkStudent = async (student) => {
    const studentId = rosterMap[student.googleUserId];
    if (!rosterCourseId || !studentId || !studentId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await linkStudentToClassroom({
        courseId: rosterCourseId,
        studentId: studentId.trim(),
        googleUserId: student.googleUserId,
        email: student.email,
        name: student.name,
      });
      setStatusMessage(`Linked ${student.name} to MathMaster ID "${studentId.trim()}" for this course.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const updateMaterial = (index, field, value) => {
    setMaterials((previous) => previous.map((material, itemIndex) => (
      itemIndex === index ? { ...material, [field]: value } : material
    )));
  };

  const toggleCourse = (courseId) => {
    const value = String(courseId);
    setSelectedCourseIds((previous) => (
      previous.includes(value)
        ? previous.filter((id) => id !== value)
        : [...previous, value]
    ));
  };

  const handlePublish = async () => {
    if (selectedCourseIds.length === 0) {
      setError('Select at least one Classroom course.');
      return;
    }
    if (!assignmentId) {
      setError('Select a MathMaster assignment.');
      return;
    }
    // An unassigned library item has no audience and no due date, so there is
    // nothing coherent to post. Caught here rather than at the server so the
    // teacher gets the reason instead of a failed publish.
    try {
      assertPublishable(assignments.find((assignment) => assignment.id === assignmentId));
    } catch (guardError) {
      setError(guardError.message);
      return;
    }

    setBusy(true);
    setError(null);
    setPublishResults([]);
    try {
      const cleanMaterials = materials.filter((material) => material.title.trim() && material.url.trim());
      const selectedAssignment = assignments.find((assignment) => assignment.id === assignmentId);
      const response = await publishAssignmentToClassrooms({
        courseIds: selectedCourseIds,
        assignmentId,
        materials: cleanMaterials,
      });
      setPublishResults(response.results || []);

      const summary = response.summary || {};
      const successful = Number(summary.published || 0) + Number(summary.alreadyPublished || 0);
      setStatusMessage(
        `"${selectedAssignment?.title || assignmentId}" is connected to ${successful} of ${summary.selected || selectedCourseIds.length} selected course${selectedCourseIds.length === 1 ? '' : 's'}.`
      );
      setMaterials([{ title: '', url: '' }]);
      await refreshPublications();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 5px 0', color: '#202124', fontSize: '20px' }}>Google Classroom Sync</h2>
      <p style={{ margin: '0 0 20px 0', color: '#5f6368', fontSize: '14px' }}>
        Publish one MathMaster assignment to several Classroom courses. Each course receives its own
        publication record, coursework ID, roster links, and grade-passback route.
      </p>

      {statusMessage && (
        <div style={{ marginBottom: '15px', padding: '10px 14px', background: '#e6f4ea', color: '#188038', borderRadius: '8px', fontSize: '14px' }}>
          {statusMessage}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: '15px', padding: '10px 14px', background: '#fce8e6', color: '#c5221f', borderRadius: '8px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {!connected ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button style={secondaryButton} onClick={handleRunConnectionCheck} disabled={busy}>
              Run Connection Check
            </button>
            <button style={primaryButton} onClick={handleConnect} disabled={busy}>
              Connect Google Classroom
            </button>
          </div>

          {diagnostics && (
            <div style={{ marginTop: '16px', padding: '14px', border: '1px solid #dadce0', borderRadius: '10px', textAlign: 'left' }}>
              <strong style={{ color: diagnostics.ok ? '#188038' : '#c5221f' }}>
                {diagnostics.ok ? 'Connection configuration passed' : 'Connection configuration needs attention'}
              </strong>
              <div style={{ marginTop: '10px', display: 'grid', gap: '5px', color: '#5f6368', fontSize: '13px' }}>
                <span>OAuth client ID: {diagnostics.checks?.clientIdConfigured ? 'Configured' : 'Missing'}</span>
                <span>OAuth client secret: {diagnostics.checks?.clientSecretConfigured ? 'Configured' : 'Missing'}</span>
                <span>Redirect URI: {diagnostics.checks?.redirectUri || 'Missing'}</span>
                <span>Functions URL: {diagnostics.checks?.functionsBaseUrl || 'Missing'}</span>
                <span>App URL: {diagnostics.checks?.appBaseUrl || 'Missing'}</span>
                <span>Firestore: {diagnostics.checks?.firestoreAvailable ? 'Available' : 'Unavailable'}</span>
                <span>OAuth URL generation: {diagnostics.checks?.authUrlBuilds ? 'Passed' : 'Failed'}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: '25px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <button style={secondaryButton} onClick={handleLoadCourses} disabled={busy}>Load Active Courses</button>
              <span style={{ color: '#5f6368', fontSize: '13px' }}>
                {courses.length ? `${courses.length} active course${courses.length === 1 ? '' : 's'} loaded` : 'Load courses before publishing.'}
              </span>
            </div>
          </div>

          {courses.length > 0 && (
            <div style={{ marginBottom: '25px', padding: '16px', background: '#f8f9fa', borderRadius: '10px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#202124' }}>Import and Link a Course Roster</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <label style={label}>Roster course</label>
                  <select style={input} value={rosterCourseId} onChange={(event) => {
                    setRosterCourseId(event.target.value);
                    setRoster([]);
                    setRosterMap({});
                  }}>
                    <option value="">Select a course…</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{courseLabel(course)}</option>
                    ))}
                  </select>
                </div>
                <button style={secondaryButton} onClick={handleImportRoster} disabled={busy || !rosterCourseId}>Import Roster</button>
              </div>
            </div>
          )}

          {roster.length > 0 && (
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ fontSize: '15px', color: '#202124' }}>Link This Course Roster to MathMaster IDs</h3>
              <p style={{ color: '#5f6368', fontSize: '13px' }}>
                Roster links are course-specific. Link the same student separately in every Classroom course that should receive grade passback.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#5f6368' }}>
                      <th style={{ padding: '8px' }}>Classroom Student</th>
                      <th style={{ padding: '8px' }}>MathMaster Student ID</th>
                      <th style={{ padding: '8px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((student) => (
                      <tr key={student.googleUserId} style={{ borderTop: '1px solid #f1f3f4' }}>
                        <td style={{ padding: '8px' }}>{student.name} <span style={{ color: '#80868b' }}>({student.email})</span></td>
                        <td style={{ padding: '8px' }}>
                          <input
                            style={input}
                            placeholder="e.g. 12345"
                            value={rosterMap[student.googleUserId] || ''}
                            onChange={(event) => setRosterMap((previous) => ({
                              ...previous,
                              [student.googleUserId]: event.target.value,
                            }))}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <button style={secondaryButton} onClick={() => handleLinkStudent(student)} disabled={busy}>Link</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {courses.length > 0 && (
            <div style={{ marginBottom: '18px', padding: '16px', border: '1px solid #dadce0', borderRadius: '10px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#202124' }}>Publish One Assignment to Multiple Courses</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <label style={label}>MathMaster assignment</label>
                  <select style={input} value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
                    <option value="">Select an assignment…</option>
                    {assignments.map((assignment) => (
                      // A library item is listed but marked, so a teacher sees
                      // why it cannot be posted rather than wondering where it went.
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.title}{isLibraryAssignment(assignment) ? ' — not assigned' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ ...label, margin: 0 }}>Classroom destinations ({selectedCourseIds.length} selected)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ ...secondaryButton, padding: '7px 12px' }} onClick={() => setSelectedCourseIds(courses.map((course) => String(course.id)))} disabled={busy}>Select All</button>
                  <button style={{ ...secondaryButton, padding: '7px 12px' }} onClick={() => setSelectedCourseIds([])} disabled={busy}>Clear</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                {courses.map((course) => {
                  const selected = selectedCourseIds.includes(String(course.id));
                  return (
                    <label key={course.id} style={courseCard(selected)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleCourse(course.id)}
                        style={{ marginTop: '3px' }}
                      />
                      <span>
                        <strong style={{ display: 'block', color: '#202124' }}>{course.name}</strong>
                        <span style={{ color: '#5f6368', fontSize: '12px' }}>{[course.section, course.room].filter(Boolean).join(' · ') || `Course ${course.id}`}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <label style={label}>Supplemental Materials (optional)</label>
              {materials.map((material, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <input style={{ ...input, flex: '1 1 220px' }} placeholder="Title" value={material.title} onChange={(event) => updateMaterial(index, 'title', event.target.value)} />
                  <input style={{ ...input, flex: '2 1 320px' }} placeholder="https://…" value={material.url} onChange={(event) => updateMaterial(index, 'url', event.target.value)} />
                </div>
              ))}
              <button style={secondaryButton} onClick={() => setMaterials((previous) => [...previous, { title: '', url: '' }])}>+ Add Link</button>

              <div style={{ marginTop: '15px' }}>
                <button style={primaryButton} onClick={handlePublish} disabled={busy || selectedCourseIds.length === 0}>
                  Publish to {selectedCourseIds.length || 0} Course{selectedCourseIds.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {publishResults.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ fontSize: '15px', color: '#202124' }}>Latest Publish Results</h3>
          <div style={{ display: 'grid', gap: '8px' }}>
            {publishResults.map((result) => (
              <div key={`${result.courseId}-${result.publicationId || result.status}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', border: '1px solid #e0e3e7', borderRadius: '8px' }}>
                <span>{result.courseName || result.courseId}</span>
                <span style={{ color: statusColor(result.status), fontWeight: 'bold' }}>
                  {result.status}{result.error ? ` — ${result.error}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div style={{ marginTop: '25px' }}>
          <h3 style={{ fontSize: '15px', color: '#202124' }}>Classroom Publications</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#5f6368' }}>
                  <th style={{ padding: '8px' }}>Assignment</th>
                  <th style={{ padding: '8px' }}>Course</th>
                  <th style={{ padding: '8px' }}>Due</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} style={{ borderTop: '1px solid #f1f3f4' }}>
                    <td style={{ padding: '8px' }}>{link.title || link.assignmentId}</td>
                    <td style={{ padding: '8px' }}>{link.courseName || link.courseId || '—'}</td>
                    <td style={{ padding: '8px' }}>{link.dueAt ? new Date(link.dueAt).toLocaleString() : '—'}</td>
                    <td style={{ padding: '8px', color: statusColor(link.status), fontWeight: 'bold' }}>{link.status}</td>
                    <td style={{ padding: '8px' }}>
                      {link.classroomUrl ? (
                        <a href={link.classroomUrl} target="_blank" rel="noreferrer" style={{ color: '#1a73e8', fontWeight: 'bold' }}>Open</a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {connected && courses.length > 0 && selectedCourses.length > 0 && (
        <p style={{ marginTop: '16px', color: '#5f6368', fontSize: '12px' }}>
          Selected destinations: {selectedCourses.map((course) => course.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
