import { useEffect, useMemo, useState } from 'react';
import {
  ensureClassroomTopics,
  getClassroomConnectionStatus,
  getGoogleAuthUrl,
  getGoogleClassroomDiagnostics,
  linkClassroomRosterBatch,
  listClassroomCourseMappings,
  listClassroomRosterLinks,
  listClassroomGradeSyncs,
  listGoogleCourses,
  listClassroomStudents,
  listPublishedAssignments,
  inspectClassroomPublication,
  repairClassroomAssignmentPublications,
  forceRepublishAssignmentToClassrooms,
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
  applyRosterIdentityRows,
  buildRosterMatchPlan,
  buildTopicPlan,
  mathMasterStudentLabel,
  parseRosterIdentityText,
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
  const assignedClassIds = new Set((assignment?.assignedClassIds || []).map(clean).filter(Boolean));
  const assignedPeriods = new Set((assignment?.assignedClassPeriods || []).map(clean).filter(Boolean));
  if (!assignedClassIds.size && !assignedPeriods.size) return [];
  const byId = new Map(classes.map((record) => [classIdOf(record), record]));
  return mappings
    .filter((mapping) => (
      assignedClassIds.size
        ? assignedClassIds.has(clean(mapping?.classId))
        : assignedPeriods.has(classPeriodOf(byId.get(clean(mapping?.classId))))
          || assignedPeriods.has(clean(mapping?.classPeriod))
    ))
    .map((mapping) => String(mapping.courseId));
}

export default function ClassroomManagerV2({
  assignments = [],
  classes = [],
  students = [],
  teacherEmail = '',
  initialAssignmentId = '',
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
  const [rosterLinks, setRosterLinks] = useState([]);
  const [manualMatches, setManualMatches] = useState({});
  const [identityText, setIdentityText] = useState('');
  const [identityRows, setIdentityRows] = useState([]);
  const [identityRejected, setIdentityRejected] = useState([]);
  const [assignmentId, setAssignmentId] = useState(() => String(initialAssignmentId || ''));
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
    () => studentsForClass(students, mappedClass, classes),
    [students, mappedClass, classes],
  );
  const identityAugmentedStudents = useMemo(
    () => applyRosterIdentityRows(classStudents, identityRows),
    [classStudents, identityRows],
  );
  const matchPlan = useMemo(
    () => buildRosterMatchPlan({ classroomStudents: roster, mathMasterStudents: identityAugmentedStudents }),
    [roster, identityAugmentedStudents],
  );
  const rosterLinkByGoogleUserId = useMemo(
    () => new Map(rosterLinks.map((link) => [String(link.googleUserId || ''), link])),
    [rosterLinks],
  );
  const topicPlan = useMemo(() => buildTopicPlan(assignments.filter((a) => !a.archived)), [assignments]);
  const syncByAssignment = useMemo(
    () => assignments
      .map((assignment) => ({ assignment, sync: summarizeAssignmentSync(assignment, links) }))
      .filter((entry) => entry.sync.publishedCount > 0),
    [assignments, links],
  );

  const refreshManagerData = async () => {
    // The Classroom manager is a dashboard, not one giant transaction. One
    // auxiliary read (for example stale course mappings) must not hide the
    // teacher's Google connection status, published links, or grade-sync data.
    const results = await Promise.allSettled([
      getClassroomConnectionStatus(),
      listClassroomCourseMappings(),
      listPublishedAssignments(),
      listClassroomGradeSyncs(),
    ]);
    const [connectionResult, mappingResult, linksResult, gradeResult] = results;

    if (connectionResult.status === 'fulfilled') {
      setConnection(connectionResult.value || { connected: false });
    }
    if (mappingResult.status === 'fulfilled') {
      setMappings(mappingResult.value?.mappings || []);
    }
    if (linksResult.status === 'fulfilled') {
      setLinks(linksResult.value?.links || []);
    }
    if (gradeResult.status === 'fulfilled') {
      setGradeSyncs(gradeResult.value?.syncs || []);
    }

    const failures = [
      ['Connection status', connectionResult],
      ['Saved course mappings', mappingResult],
      ['Published assignments', linksResult],
      ['Grade passback monitor', gradeResult],
    ].filter(([, result]) => result.status === 'rejected');

    if (failures.length) {
      const details = failures
        .map(([label, result]) => `${label}: ${result.reason?.message || String(result.reason)}`)
        .join(' | ');
      setError(details);
    }
    return { failures: failures.length };
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('classroomConnected')) setStatus('Google Classroom reconnected successfully.');
    if (params.get('classroomError')) setError(`Google Classroom connection failed: ${params.get('classroomError')}`);
    refreshManagerData().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!initialAssignmentId) return;
    setAssignmentId(String(initialAssignmentId));
  }, [initialAssignmentId]);

  // Opening Classroom Manager from an assignment card should be ready to act,
  // not require a second "Load Active Courses" click.
  useEffect(() => {
    if (!connection.connected || connection.needsReconnect || courses.length) return;
    let cancelled = false;
    listGoogleCourses()
      .then((response) => {
        if (cancelled) return;
        const loaded = response?.courses || [];
        setCourses(loaded);
        if (!rosterCourseId && loaded[0]) setRosterCourseId(String(loaded[0].id));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || String(err));
      });
    return () => { cancelled = true; };
  }, [connection.connected, connection.needsReconnect]);

  // One authoritative assignment-selection effect serves both the dropdown and
  // the assignment-card shortcut. As mappings arrive, the correct destination
  // courses become selected automatically.
  useEffect(() => {
    if (!selectedAssignment) return;
    const classroom = selectedAssignment?.classroomPackage || {};
    const notes = selectedAssignment?.lessonResources?.notesPdf || null;
    setTopicName(classroom?.topic?.name || suggestClassroomTopic(selectedAssignment));
    setInstructions(classroom?.assignmentPost?.instructions
      || `Complete "${selectedAssignment.title}" in MathMaster. Use the Open in MathMaster link below.`);
    const postingMode = classroom?.resourcesPost?.postingMode;
    setResourceMode(postingMode === 'attachToAssignment' ? 'attach' : postingMode === 'none' ? 'none' : 'separate');
    setMaterialTitle(classroom?.resourcesPost?.title || `${selectedAssignment.title} — Notes & Resources`);
    setMaterialDescription(classroom?.resourcesPost?.description || `Reference materials for ${selectedAssignment.title}.`);
    const authoredLinks = Array.isArray(classroom?.additionalLinks) ? classroom.additionalLinks : [];
    setMaterials(authoredLinks.length ? authoredLinks.map((item) => ({ title: item.title || '', url: item.url || '' })) : [{ title: '', url: '' }]);
    setSelectedCourseIds(matchingCoursesForAssignment(selectedAssignment, mappings, classes));
    if (notes?.enabled) {
      setStatus(`AI prepared ${notes.title || 'student notes'} (${Number(notes.targetPages) === 1 ? 1 : 2} page target) and Classroom publishing information.`);
    }
  }, [selectedAssignment?.id, mappings, classes]);


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
    const [response, linkResponse] = await Promise.all([
      listClassroomStudents({ courseId: rosterCourseId }),
      listClassroomRosterLinks({ courseId: rosterCourseId }),
    ]);
    setRoster(response.students || []);
    setRosterLinks(linkResponse.links || []);
    setManualMatches({});
    setStatus(`Loaded ${(response.students || []).length} Google Classroom students and ${(linkResponse.links || []).length} existing MathMaster link${(linkResponse.links || []).length === 1 ? '' : 's'}.`);
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
    const refreshed = await listClassroomRosterLinks({ courseId: rosterCourseId });
    setRosterLinks(refreshed.links || []);
    setStatus(`Linked ${exact.length} exact school-email match${exact.length === 1 ? '' : 'es'} for grade passback.`);
  });

  const handleLinkOne = (item) => run(async () => {
    if (!rosterMapping) throw new Error('Map this course first.');
    const linked = rosterLinkByGoogleUserId.get(String(item.classroomStudent.googleUserId));
    const selectedId = manualMatches[item.classroomStudent.googleUserId]
      || linked?.studentId
      || item.suggestedStudent?.id;
    if (!selectedId) throw new Error('Type or choose the MathMaster student ID.');
    const validStudent = classStudents.some((student) => String(student.id) === String(selectedId));
    if (!validStudent) throw new Error(`MathMaster ID ${selectedId} is not in the mapped class.`);

    const result = await linkClassroomRosterBatch({
      courseId: rosterCourseId,
      classId: rosterMapping.classId,
      links: [{
        studentId: String(selectedId),
        googleUserId: String(item.classroomStudent.googleUserId),
        email: item.classroomStudent.email || null,
        name: item.classroomStudent.name || null,
      }],
    });
    const refreshed = await listClassroomRosterLinks({ courseId: rosterCourseId });
    setRosterLinks(refreshed.links || []);
    setStatus(
      result.replaced
        ? `Changed the Classroom link for ${item.classroomStudent.name} to MathMaster ID ${selectedId}. The old grade-passback route was removed.`
        : `Linked ${item.classroomStudent.name} to MathMaster ID ${selectedId}. Google name/email are now attached to that MathMaster student for identification and grade passback.`
    );
  });

  const handleApplyIdentityBridge = () => {
    const parsed = parseRosterIdentityText(identityText);
    const classIds = new Set(classStudents.map((student) => String(student.id)));
    const accepted = parsed.rows.filter((row) => classIds.has(String(row.studentId)));
    const outsideClass = parsed.rows
      .filter((row) => !classIds.has(String(row.studentId)))
      .map((row) => ({ ...row, reason: 'ID is not in the mapped MathMaster class' }));
    setIdentityRows(accepted);
    setIdentityRejected([...parsed.rejected, ...outsideClass]);
    setManualMatches({});
    setStatus(
      `Applied ${accepted.length} ID/name/email row${accepted.length === 1 ? '' : 's'} to this roster.`
      + (outsideClass.length || parsed.rejected.length
        ? ` ${outsideClass.length + parsed.rejected.length} row${outsideClass.length + parsed.rejected.length === 1 ? '' : 's'} need review.`
        : '')
    );
  };

  const handleLinkSuggested = () => run(async () => {
    if (!rosterMapping) throw new Error('Map this course first.');
    const proposals = matchPlan
      .filter((item) => ['exact-email', 'exact-name'].includes(item.status) && item.suggestedStudent)
      .map((item) => ({
        studentId: String(item.suggestedStudent.id),
        googleUserId: String(item.classroomStudent.googleUserId),
        email: item.classroomStudent.email || null,
        name: item.classroomStudent.name || null,
      }));

    const countsByStudent = proposals.reduce((map, item) => {
      map.set(item.studentId, (map.get(item.studentId) || 0) + 1);
      return map;
    }, new Map());
    const safe = proposals.filter((item) => countsByStudent.get(item.studentId) === 1);
    if (!safe.length) throw new Error('There are no unique suggested matches to link.');

    const result = await linkClassroomRosterBatch({
      courseId: rosterCourseId,
      classId: rosterMapping.classId,
      links: safe,
    });
    const refreshed = await listClassroomRosterLinks({ courseId: rosterCourseId });
    setRosterLinks(refreshed.links || []);
    setStatus(
      `Linked ${safe.length} teacher-reviewed roster suggestion${safe.length === 1 ? '' : 's'}.`
      + (result.replaced ? ` Replaced ${result.replaced} older incorrect link${result.replaced === 1 ? '' : 's'}.` : '')
    );
  });

  const handleAssignmentChange = (value) => {
    setAssignmentId(value);
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


  const handleForceRepublish = () => run(async () => {
    assertPublishable(selectedAssignment);
    if (!selectedCourseIds.length) throw new Error('Select at least one mapped Google Classroom course.');

    const selectedNames = courses
      .filter((course) => selectedCourseIds.includes(String(course.id)))
      .map((course) => courseLabel(course));
    const confirmed = window.confirm(
      'FORCE A NEW GOOGLE CLASSROOM POST?\n\n'
      + 'MathMaster will create a brand-new assignment post even if an older post still exists.\n\n'
      + 'Selected: ' + (selectedNames.join(', ') || selectedCourseIds.join(', ')) + '\n\n'
      + 'Student MathMaster progress will NOT be reset. Grade passback will move to the newly created post. '
      + 'If Google is already showing the old post, students may see both.'
    );
    if (!confirmed) return;

    const classroom = selectedAssignment?.classroomPackage || {};
    const response = await forceRepublishAssignmentToClassrooms({
      assignmentId: selectedAssignment.id,
      courseIds: selectedCourseIds,
      forceRequestId: typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : 'force-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      classroomTitle: classroom?.assignmentPost?.title || selectedAssignment.title,
      maxPoints: Number(classroom?.assignmentPost?.maxPoints) || 100,
      gradePassbackEnabled: classroom?.gradePassback?.enabled !== false,
      topicName,
      instructions,
      materials: cleanMaterials(),
    });
    const summary = response?.summary || {};
    const created = Number(summary.forcedReposted || 0) + Number(summary.alreadyForced || 0);
    const failed = Number(summary.failed || 0);
    const queuedGrades = Number(summary.queuedGrades || 0);

    if (!created && failed) {
      const details = (response?.results || [])
        .filter((item) => item.status === 'failed')
        .map((item) => (item.courseName || item.courseId) + ': ' + (item.error || 'failed'))
        .join(' | ');
      throw new Error(details || 'Google Classroom did not create the forced repost.');
    }

    setStatus(
      'Forced ' + created + ' new Classroom assignment post' + (created === 1 ? '' : 's')
      + ' and made the new post the grade-passback destination. Queued '
      + queuedGrades + ' linked student grade record' + (queuedGrades === 1 ? '' : 's')
      + ' for passback review.'
      + (failed ? ' ' + failed + ' selected destination' + (failed === 1 ? '' : 's') + ' failed.' : '')
    );
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
              <select style={input} value={rosterCourseId} onChange={(event) => { setRosterCourseId(event.target.value); setRoster([]); setRosterLinks([]); setManualMatches({}); setIdentityRows([]); setIdentityRejected([]); }} disabled={busy}>
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
          {rosterCourseId && rosterMapping && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid #d8dee6', borderRadius: 10, background: '#f8fafc' }}>
              <strong style={{ fontSize: 13 }}>ID-only students: paste an identity list (optional)</strong>
              <p style={{ margin: '6px 0 9px', color: '#5f6368', fontSize: 12, lineHeight: 1.45 }}>
                Google already supplies the name, school email, and Google user ID shown below. If MathMaster only knows district IDs,
                paste one student per line as <code>ID, Name, Email</code> or <code>ID, Name</code>. You can copy rows from a spreadsheet
                or have an AI convert a roster picture into that text first. MathMaster only links students after teacher confirmation.
              </p>
              <textarea
                value={identityText}
                onChange={(event) => setIdentityText(event.target.value)}
                placeholder={'123456, Jane Doe, jane.doe@district.org\n123457, John Smith'}
                rows={5}
                style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" style={secondary} disabled={busy || !identityText.trim()} onClick={handleApplyIdentityBridge}>Apply ID/name list</button>
                <button type="button" style={primary} disabled={busy || !matchPlan.some((item) => ['exact-email', 'exact-name'].includes(item.status) && item.suggestedStudent)} onClick={handleLinkSuggested}>Link unique suggestions</button>
                {(identityRows.length > 0 || identityRejected.length > 0) && (
                  <button type="button" style={secondary} disabled={busy} onClick={() => { setIdentityText(''); setIdentityRows([]); setIdentityRejected([]); setManualMatches({}); }}>Clear list</button>
                )}
              </div>
              {identityRows.length > 0 && <div style={{ marginTop: 7, color: '#137333', fontSize: 12, fontWeight: 800 }}>{identityRows.length} MathMaster ID{identityRows.length === 1 ? '' : 's'} enriched for matching.</div>}
              {identityRejected.length > 0 && <div style={{ marginTop: 7, color: '#a50e0e', fontSize: 12 }}>{identityRejected.length} pasted row{identityRejected.length === 1 ? '' : 's'} could not be used for this mapped class.</div>}
            </div>
          )}
          {matchPlan.length > 0 && (
            <>
              <p style={{ margin: '12px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.45 }}>
                Confirming a link copies the Google Classroom name and school email onto that MathMaster ID. That identity is then used for teacher/student names and the Google user ID becomes the grade-passback route.
              </p>
              <datalist id="mathmaster-roster-id-options">
                {identityAugmentedStudents.map((student) => <option key={student.id} value={student.id}>{mathMasterStudentLabel(student)} · ID {student.id}</option>)}
              </datalist>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: '#5f6368' }}>
                  <th style={{ padding: 8 }}>Google Classroom</th><th style={{ padding: 8 }}>MathMaster match</th><th style={{ padding: 8 }}>Match</th><th></th>
                </tr></thead>
                <tbody>
                  {matchPlan.map((item) => {
                    const google = item.classroomStudent;
                    const linked = rosterLinkByGoogleUserId.get(String(google.googleUserId));
                    const selected = manualMatches[google.googleUserId] || linked?.studentId || item.suggestedStudent?.id || '';
                    const alreadyLinked = Boolean(linked && String(linked.studentId) === String(selected));
                    return (
                      <tr key={google.googleUserId} style={{ borderTop: '1px solid #edf0f2' }}>
                        <td style={{ padding: 8 }}>
                          <strong>{google.name}</strong>
                          <div style={{ color: '#5f6368' }}>{google.email}</div>
                          <div style={{ color: '#80868b', fontSize: 11 }}>Google ID {google.googleUserId}</div>
                        </td>
                        <td style={{ padding: 8, minWidth: 220 }}>
                          <input
                            list="mathmaster-roster-id-options"
                            style={input}
                            value={selected}
                            placeholder="Type MathMaster ID…"
                            onChange={(event) => setManualMatches((current) => ({ ...current, [google.googleUserId]: event.target.value.trim() }))}
                          />
                          <div style={{ marginTop: 4, color: '#5f6368', fontSize: 11 }}>
                            {selected
                              ? (identityAugmentedStudents.find((student) => String(student.id) === String(selected))
                                ? mathMasterStudentLabel(identityAugmentedStudents.find((student) => String(student.id) === String(selected)))
                                : 'ID must belong to the mapped class')
                              : 'Type or choose the exact district/MathMaster ID.'}
                          </div>
                        </td>
                        <td style={{ padding: 8 }}>
                          <span style={alreadyLinked ? okPill : item.status === 'exact-email' ? okPill : item.status === 'exact-name' ? warnPill : item.status === 'ambiguous' ? warnPill : badPill}>
                            {alreadyLinked ? 'LINKED' : item.status === 'exact-email' ? 'EXACT EMAIL' : item.status === 'exact-name' ? 'NAME — REVIEW' : item.status === 'ambiguous' ? 'AMBIGUOUS' : 'NO MATCH'}
                          </span>
                          {linked && <div style={{ marginTop: 4, color: '#5f6368', fontSize: 11 }}>Current ID {linked.studentId}</div>}
                        </td>
                        <td style={{ padding: 8 }}>
                          <button
                            style={secondary}
                            disabled={busy || !selected || alreadyLinked}
                            onClick={() => handleLinkOne(item)}
                          >
                            {linked && !alreadyLinked ? 'Change link' : alreadyLinked ? 'Linked' : 'Confirm link'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
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
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: '#fff4ce', border: '2px solid #f9ab00', color: '#5f4400' }}>
            <strong>Post missing but MathMaster says it exists?</strong>
            <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5 }}>
              Select the exact Google Classroom course(s) above, then force a new post. This intentionally bypasses duplicate protection. Your MathMaster assignment and student progress stay intact; the newly created post becomes the grade-passback destination.
            </div>
            <button
              style={{ ...danger, marginTop: 10, background: '#fff', borderColor: '#b06000', color: '#8a4b00' }}
              disabled={busy || !selectedAssignment || !selectedCourseIds.length}
              onClick={handleForceRepublish}
            >
              Force NEW post to selected Classroom{selectedCourseIds.length === 1 ? '' : 's'}
            </button>
          </div>
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
                      const response = await repairClassroomAssignmentPublications({
                        assignmentId: assignment.id,
                      });
                      const summary = response?.summary || {};
                      const reposted = Number(summary.reposted || 0);
                      const healthy = Number(summary.healthy || 0);
                      const failed = Number(summary.failed || 0);
                      const queuedGrades = Number(summary.queuedGrades || 0);
                      setLinks((await listPublishedAssignments()).links || []);
                      setGradeSyncs((await listClassroomGradeSyncs()).syncs || []);

                      if (reposted > 0) {
                        setStatus(
                          `Reposted ${reposted} missing Google Classroom assignment post${reposted === 1 ? '' : 's'} without changing the MathMaster assignment or student work. Queued ${queuedGrades} linked student grade record${queuedGrades === 1 ? '' : 's'} for passback review.`
                        );
                      } else if (healthy > 0 && failed === 0) {
                        setStatus(
                          `Google Classroom confirmed ${healthy} assignment post${healthy === 1 ? '' : 's'} still exist. Nothing needed reposting.`
                        );
                      }

                      if (failed > 0) {
                        const failures = (response?.results || [])
                          .filter((item) => ['failed', 'changed'].includes(item.status))
                          .map((item) => `${item.courseName || item.courseId}: ${item.error || 'repair failed'}`)
                          .join(' | ');
                        setError(
                          `Classroom repost check had ${failed} destination failure${failed === 1 ? '' : 's'}.`
                          + (failures ? ` ${failures}` : '')
                        );
                      }
                    })}>Check / repost missing assignment</button>

                    <button style={secondary} disabled={busy} onClick={() => run(async () => {
                      const inspection = await inspectClassroomPublication({
                        assignmentId: assignment.id,
                        repairAudience: true,
                      });
                      const summary = inspection?.summary || {};
                      const failed = Number(summary.failed || 0);
                      const rosterStudents = Number(summary.rosterStudents || 0);
                      if (failed) {
                        const details = (inspection?.results || [])
                          .filter((item) => item.status !== 'ok')
                          .map((item) => `${item.courseName || item.courseId}: ${item.error || item.status || 'check failed'}`)
                          .join(' | ');
                        throw new Error(
                          `Classroom publication check had ${failed} failure${failed === 1 ? '' : 's'}.`
                          + (details ? ` ${details}` : '')
                        );
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
          MathMaster sends progress checkpoints while students work, a due-date checkpoint, and a final grade at completion or the final cutoff. Failures stay visible instead of disappearing silently.
        </p>
        {gradeSyncs.length === 0 ? (
          <div style={{ color: '#5f6368', fontSize: 13 }}>No grade-sync events yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ textAlign: 'left', color: '#5f6368' }}>
                <th style={{ padding: 7 }}>Student</th><th style={{ padding: 7 }}>Assignment</th><th style={{ padding: 7 }}>Course</th><th style={{ padding: 7 }}>Grade / progress</th><th style={{ padding: 7 }}>Stage</th><th style={{ padding: 7 }}>Status</th><th></th>
              </tr></thead>
              <tbody>
                {gradeSyncs.slice(0, 100).map((sync) => (
                  <tr key={sync.syncId || `${sync.publicationId}-${sync.studentId}`} style={{ borderTop: '1px solid #edf0f2' }}>
                    <td style={{ padding: 7 }}>{sync.studentId}</td>
                    <td style={{ padding: 7 }}>{sync.assignmentId}</td>
                    <td style={{ padding: 7 }}>{sync.courseId}</td>
                    <td style={{ padding: 7 }}>
                      <strong>{sync.grade ?? '—'}{sync.grade != null ? '%' : ''}</strong>
                      {Number.isFinite(Number(sync.attempted)) && Number.isFinite(Number(sync.total)) && (
                        <div style={{ marginTop: 3, color: '#5f6368' }}>{sync.attempted}/{sync.total} attempted{sync.creditOnAttempted != null ? ` · ${sync.creditOnAttempted}% on attempted` : ''}</div>
                      )}
                    </td>
                    <td style={{ padding: 7 }}>
                      <span style={sync.isFinal ? okPill : warnPill}>
                        {sync.isFinal ? 'FINAL' : String(sync.stage || 'progress').replaceAll('-', ' ').toUpperCase()}
                      </span>
                      <div style={{ marginTop: 4, color: sync.studentVisible ? '#137333' : '#5f6368', fontSize: 10.5, fontWeight: 900 }}>
                        {sync.studentVisible ? 'RELEASED TO STUDENT' : 'TEACHER DRAFT'}
                      </div>
                    </td>
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
