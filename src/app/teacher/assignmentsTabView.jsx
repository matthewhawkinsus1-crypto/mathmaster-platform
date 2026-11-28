/*
 * THE ASSIGNMENTS SCREEN'S JSX (the teacher's first load, third pass).
 *
 * Moved out of ./TeacherWorkspace.jsx verbatim. The screen reads two checks
 * from the authoring code on each card, so the workspace already waited for
 * that code (./authoringKitLoader.js) before drawing it. It now waits for
 * this module too (./teacherPanels.js's assignmentsView), asked for alongside
 * the authoring code and fetched while the browser is idle, instead of
 * carrying it in its own chunk, which every teacher downloaded before Home
 * drew.
 *
 * A render function, not a component: the workspace calls it where the JSX
 * was, with what the JSX read there by name (`scope`), so React sees the
 * same elements in the same place, and every handler, state and ref is still
 * the workspace's own. The lazy screen it draws (AssignmentIntake) comes in
 * `scope` too: ../lazyScreens.js imported here as well would leave App's chunk
 * for a chunk of its own on every student's first load.
 */
import { getAssignmentLifecycle, getCurrentContentQuestionIndices } from '../../assignmentLifecycle';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies';
import { SMART_VIEWS } from '../../assignmentSmartViews';
import { isLibraryAssignment } from '../../assignmentDestinations';
import { getStoredAssignmentQuestions, getStoredAssignmentTypeProjection, getStoredAssignmentVariantMode, getStoredSectionVariantModes } from '../../platform/contract/storedAssignmentV5.js';
import { contentVersionOf, contentVersionLabel, latestCurrentLibraryRelease } from '../../platform/assignments/assignmentContentVersion.js';
import { formatDueDate, formatLateDueDate } from '../student/assignmentRuntimeHelpers.js';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import AssignmentCardMenu from '../../AssignmentCardMenu';
import { groupAssignmentList } from '../../platform/teacher/assignmentListGroups.js';
import { EmptyState, SearchField } from '../../ui/primitives';

export function renderAssignmentsTab(scope) {
  const {
    AssignmentIntake,
    activeClass,
    allStudents,
    allVisibleSelected,
    assignmentFolderPaths,
    assignmentGroupOpen,
    assignmentListIsFiltered,
    assignmentListKit,
    assignments,
    assignmentSearch,
    beginEditAssignmentDates,
    beginEditAssignmentSetup,
    beginTeacherWorksheetExport,
    bulkBusy,
    classes,
    classesById,
    clearAssignmentSelection,
    editingAssignmentDates,
    editingAssignmentId,
    gradingPeriodSettings,
    handleAssignmentJsonReady,
    handleBulkArchive,
    handleBulkMoveToFolder,
    handleDuplicateAssignment,
    handleMoveAssignmentToFolder,
    handleRepairAssignmentFromLibrary,
    handleRepairClassroomAssignmentPost,
    handleSaveAssignmentDates,
    handleToggleArchiveAssignment,
    handleTogglePauseAssignment,
    libraryNavigation,
    movingFolderAssignmentId,
    movingFolderValue,
    now,
    openAssignmentHub,
    openDeleteDialog,
    openGradebookFor,
    openGradeExport,
    openQuestionEditor,
    selectedAssignmentIds,
    setAssignmentGroupOpen,
    setAssignmentSearch,
    setClassroomManagerAssignmentId,
    setContentUpgradeRequest,
    setEditingAssignmentDates,
    setEditingAssignmentId,
    setExportJsonAssignment,
    setExportJsonCopied,
    setFocusedTestCycleAssignmentId,
    setLibraryNavigation,
    setMovingFolderAssignmentId,
    setMovingFolderValue,
    setSelectedAssignmentIds,
    setTeacherTab,
    startTeacherPreview,
    teacherStudentDataMode,
    toastError,
    toastInfo,
    toastSuccess,
    toggleAssignmentSelected,
    visibleAssignmentIds,
    visibleAssignments,
  } = scope;
  return (
            <div>
              {/*
                The builder is a destination, not a header. It used to fill
                the first ~1,700px of this screen, pushing the teacher's own
                assignments out of sight. It stays mounted while folded, so a
                half-written plan survives opening and closing it.
              */}
              <details className="tw-disclosure" open={assignments.length === 0} style={{ marginBottom: 8 }}>
                <summary><span style={{ fontSize: 'calc(18 * var(--mm-px))' }}>Create and Assign</span> <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>build a new lesson with MathMaster, or paste/upload one</span></summary>
                <div className="tw-disclosure__body">
                  <AssignmentIntake
                    onJsonReady={handleAssignmentJsonReady}
                    toastSuccess={toastSuccess}
                    toastError={toastError}
                    toastInfo={toastInfo}
                  />
                </div>
              </details>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '30px', marginBottom: '14px' }}>
                <h2 style={{ margin: 0 }}>
                  Assignments
                  <span style={{ marginLeft: '10px', fontSize: 'calc(14 * var(--mm-px))', fontWeight: 600, color: 'var(--mm-ink-muted)' }}>
                    {visibleAssignments.length} {assignmentListIsFiltered ? 'shown' : 'total'}
                  </span>
                </h2>
                <SearchField
                  value={assignmentSearch}
                  onChange={setAssignmentSearch}
                  placeholder="Search assignments by title or folder…"
                  label="Search assignments"
                  style={{ flex: '1 1 280px', maxWidth: '420px' }}
                />
              </div>

              {selectedAssignmentIds.size > 0 && (
                <div className="mm-bulkbar">
                  <span className="mm-bulkbar__count">{selectedAssignmentIds.size} selected</span>
                  <span className="mm-bulkbar__spacer" />
                  <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={() => handleBulkArchive(true)}>Archive</button>
                  <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={() => handleBulkArchive(false)}>Unarchive</button>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700 }}>
                    <span className="mm-sr-only">Move selected assignments to folder</span>
                    <select
                      value=""
                      disabled={bulkBusy}
                      onChange={(event) => { handleBulkMoveToFolder(event.target.value); event.target.value = ''; }}
                      style={{ minHeight: '34px', padding: '0 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700 }}
                    >
                      <option value="" disabled style={{ color: 'var(--mm-text-strong)' }}>Move to folder…</option>
                      <option value="" style={{ color: 'var(--mm-text-strong)' }}>Uncategorized</option>
                      {assignmentFolderPaths.map((path) => <option key={path} value={path} style={{ color: 'var(--mm-text-strong)' }}>{path}</option>)}
                    </select>
                  </label>
                  <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={clearAssignmentSelection}>Clear</button>
                </div>
              )}

              {visibleAssignments.length > 0 && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-ink-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => setSelectedAssignmentIds((current) => {
                      const next = new Set(current);
                      if (allVisibleSelected) visibleAssignmentIds.forEach((id) => next.delete(id));
                      else visibleAssignmentIds.forEach((id) => next.add(id));
                      return next;
                    })}
                  />
                  Select all {visibleAssignmentIds.length}{assignmentListIsFiltered ? ' shown' : ' (including folded groups)'}
                </label>
              )}

              {libraryNavigation && (libraryNavigation.folder || libraryNavigation.smartView) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', marginBottom: '14px', background: 'var(--mm-primary-soft)', border: '1px solid var(--mm-primary-border)', borderRadius: '8px', color: 'var(--mm-primary-text)', fontWeight: 'bold', fontSize: 'calc(13 * var(--mm-px))' }}>
                  <span>Filtered from Library{libraryNavigation.folder ? ` · ${libraryNavigation.folder}` : ''}{libraryNavigation.smartView ? ` · ${SMART_VIEWS.find((view) => view.id === libraryNavigation.smartView)?.label || libraryNavigation.smartView}` : ''}</span>
                  <button type="button" onClick={() => setLibraryNavigation(null)} style={{ padding: '6px 10px', border: '1px solid #1a73e8', borderRadius: '6px', background: 'var(--mm-surface)', color: 'var(--mm-primary)', fontWeight: 'bold', cursor: 'pointer' }}>Clear filter</button>
                </div>
              )}
              {visibleAssignments.length === 0 && (
                <EmptyState
                  icon={assignmentSearch ? '🔍' : '📄'}
                  title={assignmentSearch ? `No assignments match “${assignmentSearch}”` : 'No assignments here yet'}
                  message={assignmentSearch
                    ? 'Try a shorter search, or clear the search to see everything in this view.'
                    : 'Publish one with the form above, or pick a different folder or Smart View in the Library.'}
                  action={assignmentSearch
                    ? <button type="button" className="mm-btn mm-btn--secondary" onClick={() => setAssignmentSearch('')}>Clear search</button>
                    : null}
                />
              )}
              {(() => {
              const { inspectLibraryContentRepair, recoveryPreparationAvailable } = assignmentListKit;
              const renderAssignmentCard = (assignment) => {
                const lifecycle = getAssignmentLifecycle(assignment, now);
                const affectedStudents = teacherStudentDataMode === 'full'
                  ? allStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length
                  : null;
                const isSelected = selectedAssignmentIds.has(assignment.id);
                const canonicalQuestions = getStoredAssignmentQuestions(assignment);
                const includedQuestionIndices = getCurrentContentQuestionIndices(assignment);
                const hasDOL = Boolean(assignment?.dol?.enabled || canonicalQuestions.some((question) => resolveQuestionActivityRole({ question, assignment }) === 'dol'));
                const assignmentType = getStoredAssignmentTypeProjection(assignment);
                const assignmentVariantMode = getStoredAssignmentVariantMode(assignment);
                const hasSectionVersions = Object.keys(getStoredSectionVariantModes(assignment)).length > 0;
                const libraryRepair = inspectLibraryContentRepair(assignment, assignments);
                const contentUpgradeTarget = isLibraryAssignment(assignment)
                  ? null
                  : latestCurrentLibraryRelease(assignments, assignment);
                const hasContentUpgrade = Boolean(
                  contentUpgradeTarget
                  && contentVersionOf(contentUpgradeTarget) > contentVersionOf(assignment)
                );
                // Recovery V2: a static Warm-Up or DOL question that could gain
                // Recovery versions without changing (recognition only; the
                // assignment details run the full check before anything is saved).
                const recoveryCanBeAdded = recoveryPreparationAvailable(assignment);
                return (
                  <article key={assignment.id} data-assignment-card={assignment.id} style={{ scrollMarginTop: '16px', background: 'var(--mm-surface-sunken)', padding: '18px', marginBottom: '12px', borderRadius: '10px', border: `1px solid ${isSelected ? 'var(--mm-primary)' : lifecycle.isLate ? '#f9ab00' : lifecycle.isPracticeOnly ? '#5f6368' : 'var(--mm-border)'}`, boxShadow: isSelected ? '0 0 0 2px var(--mm-primary-soft)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAssignmentSelected(assignment.id)}
                        aria-label={`Select ${assignment.title}`}
                        style={{ flex: '0 0 auto', width: '24px', height: '24px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: '1 1 440px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* The title opens the assignment's world: its classes,
                              live room, controls, grades and export. */}
                          <button type="button" className="tw-link" style={{ fontSize: 'calc(18 * var(--mm-px))' }} onClick={() => openAssignmentHub(assignment.id)}>{assignment.title}</button>
                          <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{contentVersionLabel(assignment)}</span>
                          {hasContentUpgrade && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>V{contentVersionOf(contentUpgradeTarget)} AVAILABLE</span>}
                          {recoveryCanBeAdded && <button type="button" data-recovery-can-be-added={assignment.id} onClick={() => openAssignmentHub(assignment.id)} title="Open the assignment details to review and approve Recovery versions for its Warm-Up and DOL." style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', border: '1px solid var(--mm-info-border)', cursor: 'pointer' }}>RECOVERY CAN BE ADDED</button>}
                          <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: lifecycle.isPracticeOnly ? 'var(--mm-surface-control)' : lifecycle.isLate ? 'var(--mm-warning-soft)' : 'var(--mm-success-bg)', color: lifecycle.isPracticeOnly ? 'var(--mm-text)' : lifecycle.isLate ? 'var(--mm-warning-text)' : 'var(--mm-success-text)' }}>{lifecycle.isPracticeOnly ? 'PRACTICE ONLY' : lifecycle.status.toUpperCase()}</span>
                          <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : assignmentType.toUpperCase()}</span>
                          {hasSectionVersions ? <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>SECTION VERSIONS</span> : assignmentVariantMode === 'shared' && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }}>SHARED VERSION</span>}
                          {assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)' }}>ARCHIVED</span>}
                          {assignment.unpublished && !assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>PAUSED · HIDDEN FROM STUDENTS</span>}
                          {isTestCycleAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>TEST CYCLE</span>}
                          {/* A library item has no audience and no due date. Saying so
                              plainly is the whole point of allowing it to exist. */}
                          {isLibraryAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>NOT ASSIGNED</span>}
                        </div>
                        <div style={{ marginTop: '7px', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.55 }}>{includedQuestionIndices.length} included question{includedQuestionIndices.length === 1 ? '' : 's'}{canonicalQuestions.length !== includedQuestionIndices.length ? ` · ${canonicalQuestions.length - includedQuestionIndices.length} excluded` : ''} · {isLibraryAssignment(assignment) ? 'Not assigned to a class' : `Classes: ${(assignment.assignedClassIds || []).map((classId) => classesById[classId]?.name || classesById[classId]?.period).filter(Boolean).join(', ') || (assignment.assignedClassPeriods || []).join(', ')}`}<br />{isLibraryAssignment(assignment) ? 'No due date yet' : `Due ${formatDueDate(assignment)} · Late close ${formatLateDueDate(assignment)}`} · {affectedStudents === null
                          ? 'progress, grades and live activity in its details'
                          : `${affectedStudents} student record${affectedStudents === 1 ? '' : 's'}`}</div>
                      </div>
                      <AssignmentCardMenu
                        ariaLabel={`More actions for ${assignment.title}`}
                        items={[
                          { key: 'details', label: 'Open assignment details', onClick: () => openAssignmentHub(assignment.id) },
                          ...(!isLibraryAssignment(assignment) && (assignment.assignedClassIds || []).length ? [
                            { key: 'grades', label: 'Grades', onClick: () => openGradebookFor((assignment.assignedClassIds || []).includes(activeClass.classId) ? activeClass.classId : assignment.assignedClassIds[0], assignment.id) },
                            { key: 'export-grades', label: 'Export grades', onClick: () => openGradeExport({ classIds: (assignment.assignedClassIds || []).includes(activeClass.classId) ? [activeClass.classId] : [], assignmentId: assignment.id }) },
                          ] : []),
                          ...(isTestCycleAssignment(assignment) ? [{
                            key: 'test-cycle-results',
                            label: 'Test results, release & retests',
                            onClick: () => { setFocusedTestCycleAssignmentId(assignment.id); setTeacherTab('exams'); },
                          }] : []),
                          { key: 'preview', label: 'View as Student', onClick: () => startTeacherPreview(assignment.id) },
                          { key: 'edit-questions', label: 'Edit Questions', onClick: () => openQuestionEditor(assignment) },
                          { key: 'edit-setup', label: 'Review / Edit Setup', onClick: () => beginEditAssignmentSetup(assignment) },
                          { key: 'export-pdf', label: 'Print / Answer Key', onClick: () => beginTeacherWorksheetExport(assignment) },
                          { key: 'export-json', label: 'Export Assignment', onClick: () => { setExportJsonAssignment(assignment); setExportJsonCopied(false); } },
                          { key: 'dates-classes', label: isLibraryAssignment(assignment) ? 'Assign to Class / Dates' : 'Dates & Classes', onClick: () => beginEditAssignmentDates(assignment) },
                          ...(recoveryCanBeAdded ? [{
                            key: 'prepare-recovery',
                            label: 'Prepare Recovery…',
                            onClick: () => openAssignmentHub(assignment.id),
                          }] : []),
                          ...(hasContentUpgrade ? [{
                            key: 'upgrade-content-version',
                            label: `Upgrade to Content V${contentVersionOf(contentUpgradeTarget)}`,
                            onClick: () => setContentUpgradeRequest({ assignment, targetAssignment: contentUpgradeTarget }),
                          }] : []),
                          ...(!isLibraryAssignment(assignment) ? [{
                            key: 'repair-classroom-post',
                            label: 'Repair / Repost Classroom',
                            onClick: () => handleRepairClassroomAssignmentPost(assignment),
                          }, {
                            key: 'force-classroom-post',
                            label: 'Force New Classroom Post…',
                            onClick: () => {
                              setClassroomManagerAssignmentId(assignment.id);
                              setTeacherTab('classroom');
                            },
                          }] : []),
                          ...(libraryRepair.source && libraryRepair.questionIds.length ? [{
                            key: 'repair-library-content',
                            label: `Repair Corrupted Question${libraryRepair.questionIds.length === 1 ? '' : 's'} from Original`,
                            onClick: () => handleRepairAssignmentFromLibrary(assignment),
                          }] : []),
                          { key: 'move-folder', label: 'Move to Folder', onClick: () => { setMovingFolderAssignmentId(assignment.id); setMovingFolderValue(assignment.folder || ''); } },
                          { key: 'duplicate', label: 'Duplicate', onClick: () => handleDuplicateAssignment(assignment) },
                          ...(!isLibraryAssignment(assignment) && !assignment.archived ? [{
                            key: 'pause',
                            label: assignment.unpublished ? 'Resume for students' : 'Pause (hide from students)',
                            onClick: () => handleTogglePauseAssignment(assignment),
                          }] : []),
                          { key: 'archive', label: assignment.archived ? 'Unarchive' : 'Archive', onClick: () => handleToggleArchiveAssignment(assignment) },
                          { key: 'delete', label: 'Delete', tone: 'danger', onClick: () => openDeleteDialog(assignment) },
                        ]}
                      />
                    </div>
                    {movingFolderAssignmentId === assignment.id && (
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--mm-border)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
                        <label style={{ fontWeight: 'bold', fontSize: 'calc(13 * var(--mm-px))' }}>Folder
                          <select value={movingFolderValue} onChange={(event) => setMovingFolderValue(event.target.value)} style={{ display: 'block', marginTop: '5px', padding: '9px', border: '1px solid var(--mm-border)', borderRadius: '7px', minWidth: '220px' }}>
                            <option value="">Uncategorized</option>
                            {assignmentFolderPaths.map((path) => <option key={path} value={path}>{path}</option>)}
                          </select>
                        </label>
                        <button onClick={async () => { await handleMoveAssignmentToFolder(assignment.id, movingFolderValue); setMovingFolderAssignmentId(null); }} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Folder</button>
                        <button onClick={() => setMovingFolderAssignmentId(null)} style={{ padding: '10px 15px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                      </div>
                    )}
                    {editingAssignmentId === assignment.id && (
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--mm-border)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
                        <label style={{ fontWeight: 'bold' }}>Regular due <input type="datetime-local" value={editingAssignmentDates.dueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                        <label style={{ fontWeight: 'bold' }}>Final late due <input type="datetime-local" value={editingAssignmentDates.lateDueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, lateDueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                        {hasDOL && <label style={{ fontWeight: 'bold' }}>DOL instructional date <input type="date" value={editingAssignmentDates.dolInstructionDate || ''} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dolInstructionDate: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>}
                        <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {classes.filter((entry) => entry?.status !== 'archived' && entry?.classId).map((classRecord) => {
                            const selected = editingAssignmentDates.assignedClassIds?.includes(classRecord.classId);
                            return (
                              <label key={classRecord.classId || classRecord.period} style={{ padding: '5px 8px', borderRadius: '999px', background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)', fontWeight: 'bold', fontSize: 'calc(12 * var(--mm-px))' }}>
                                <input type="checkbox" checked={Boolean(selected)} onChange={() => setEditingAssignmentDates((current) => {
                                  const ids = current.assignedClassIds?.includes(classRecord.classId)
                                    ? current.assignedClassIds.filter((item) => item !== classRecord.classId)
                                    : [...(current.assignedClassIds || []), classRecord.classId];
                                  const periods = [...new Set(classes.filter((entry) => ids.includes(entry.classId)).map((entry) => entry.period).filter(Boolean))];
                                  return { ...current, assignedClassIds: ids, assignedClassPeriods: periods };
                                })} /> {classRecord.name || classRecord.period}{classRecord.name && classRecord.name !== classRecord.period ? ` · ${classRecord.period}` : ''}
                              </label>
                            );
                          })}
                        </div>
                        <button onClick={() => handleSaveAssignmentDates(assignment.id)} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Dates</button>
                        <button onClick={() => setEditingAssignmentId(null)} style={{ padding: '10px 15px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                      </div>
                    )}
                  </article>
                );
              };
              /*
                CURRENT WORK FIRST (platform/teacher/assignmentListGroups.js).
                This list used to be every assignment ever made, oldest due
                date first. Now: what is open, then what is scheduled; closed
                work folds by marking period and library copies fold last.
                Nothing is hidden — a search or Library filter shows one flat,
                current-first list so a match is never folded away.
              */
              const listGroups = groupAssignmentList({
                assignments: visibleAssignments,
                nowValue: now,
                gradingPeriodSettings,
                flat: assignmentListIsFiltered,
              });
              return listGroups.map((group) => {
                const holdsOpenEditor = group.assignments.some((assignment) => assignment.id === editingAssignmentId || assignment.id === movingFolderAssignmentId);
                if (!group.folded) {
                  return (
                    <section key={group.id} aria-label={group.label} data-assignment-group={group.id} style={{ marginBottom: '8px' }}>
                      {listGroups.length > 1 && (
                        <h3 style={{ margin: '4px 0 10px', fontSize: 'calc(15 * var(--mm-px))', textAlign: 'left' }}>
                          {group.label} <span className="tw-pill">{group.assignments.length}</span>
                          {group.hint && <span className="tw-small tw-muted" style={{ fontWeight: 600, marginLeft: 8 }}>{group.hint}</span>}
                        </h3>
                      )}
                      {group.assignments.map(renderAssignmentCard)}
                    </section>
                  );
                }
                const open = holdsOpenEditor || (assignmentGroupOpen[group.id] ?? false);
                return (
                  <details
                    key={group.id}
                    className="tw-disclosure"
                    data-assignment-group={group.id}
                    open={open}
                    onToggle={(event) => {
                      const next = event.currentTarget.open;
                      if (next !== open) setAssignmentGroupOpen((current) => ({ ...current, [group.id]: next }));
                    }}
                    style={{ marginBottom: '10px' }}
                  >
                    <summary>{group.label} <span className="tw-pill">{group.assignments.length}</span>{group.hint && <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{group.hint}</span>}</summary>
                    <div className="tw-disclosure__body">{open && group.assignments.map(renderAssignmentCard)}</div>
                  </details>
                );
              });
              })()}
            </div>
  );
}
