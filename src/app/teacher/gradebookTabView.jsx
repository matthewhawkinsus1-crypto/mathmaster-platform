/*
 * THE GRADEBOOK'S JSX (the teacher's first load, third pass).
 *
 * Moved out of ./TeacherWorkspace.jsx verbatim: everything under the
 * Gradebook and Evidence heading, which only the Grades screen draws and
 * every teacher downloaded before Home drew. The workspace asks for it when
 * the Grades screen opens, and while the browser is idle once it has drawn
 * (./teacherPanelPrefetch.js), so after that the gradebook draws at once, as
 * before; until it is here the heading stands, with a short status under it
 * marked busy.
 *
 * A render function, not a component: the workspace calls it where the JSX
 * was, with what the JSX read there by name (`scope`), so React sees the same
 * elements in the same place, and every handler and state is still the
 * workspace's own. The lazy screens it draws come in `scope` too:
 * ../lazyScreens.js imported here as well would leave App's chunk for a
 * chunk of its own on every student's first load.
 */
import { db } from '../../firebase';
import { normalizeQuestionRecord, getQuestionCredit } from '../../attemptPolicy';
import { CLASS_PERIODS, questionIsIncluded, studentRequiredQuestions } from '../../assignmentLifecycle';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { normalizeQuestionWeight } from '../../platform/grading/questionWeights.js';
import { splitGrade, splitGradesBySection, COMPARABILITY, describeDeliveredRigor, explainGrade } from '../../platform/teacher/gradeEvidence.js';
import { assignmentGradeOverrideFor, canonicalPresentedAssignmentGrade, projectedAssignmentTrackerFor } from '../../platform/grading/canonicalGradeProjection.js';
import { assignmentFeedbackWasReleased, assignmentUsesTeacherReleasePolicy, formatTimeStamp } from '../student/assignmentRuntimeHelpers.js';
import { QuestionSignalNotes, WorkedExamplesBySkill } from './teacherPanels.js';
import { formatStudentName } from '../../platform/studentName';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import { describeWorkloadSummary } from '../../../functions/shared/reducedWorkload.mjs';
import StudentNameLink from '../../components/common/StudentNameLink.jsx';
import { completedRecoverySections, heldRecoverySections, warmupChallengeCounts } from '../../platform/recovery/gradebookRecoveryMarks.js';
import StudentPerformanceBadge from '../../components/common/StudentPerformanceBadge.jsx';

export function renderGradebookTab(scope) {
  const {
    AssignmentGradeOverrideControls,
    GradebookAssignmentBar,
    GradebookClassChooser,
    MarkingPeriodSettings,
    SectionRecoveryAuditTrail,
    StudentDolRecoveryRow,
    WeeklyPathGradePanel,
    activeClass,
    allStudents,
    assignmentsForSelectedClass,
    bulkBusy,
    calculateGrade,
    classes,
    classesById,
    classEvidenceByStudentId,
    classEvidenceLoading,
    classSchedule,
    dolAttemptGrantBusyKey,
    feedbackReleaseBusyId,
    formatTime,
    gradebookFilter,
    gradebookHasPracticePass,
    gradebookProgress,
    gradebookProgressFilter,
    gradebookRigor,
    gradebookVisibleStudents,
    gradingPeriodBusy,
    gradingPeriodSettings,
    handleCreateGradingPeriod,
    handleGrantDOLAttemptForStudents,
    handleLoadDeliveredRigor,
    handleMoveSelectedAssignmentsToGradingPeriod,
    handleReleaseAssignmentFeedback,
    handleSetCurrentGradingPeriod,
    handleSetGradingPeriodArchived,
    now,
    openAssignmentHub,
    openGradeExport,
    openIEPReport,
    openLiveFor,
    openTeacherScratchpad,
    selectedAssignment,
    selectedClassStudents,
    selectedGradebookClass,
    selectedGradebookPeriod,
    setActiveClass,
    setClassroomSyncProposal,
    setGradebookFilter,
    setGradebookProgressFilter,
    setProfileDrawerStudentId,
    setResponseInspectorTarget,
    teacherLearningProfiles,
    teacherWeeklyGoalsByStudent,
    teacherWeeklyRoster,
    user,
    weeklyPathCompletionsByStudent,
    weeklyPathProgressLoadedFor,
    weeklyPathProgressLoading,
    weeklyPathTruncated,
    weeklyPathWeekComplete,
    weeklyPathWeekKey,
  } = scope;
  return (
    <>
              {classes.length > 0 && !gradebookFilter.classId && !gradebookFilter.student && (
                <GradebookClassChooser classes={classes} schedule={classSchedule} nowValue={now} onChoose={setActiveClass} />
              )}

              {/*
                THE ASSIGNMENT FIRST. The grades used to sit behind a "Select
                assignment" dropdown below the marking-period settings and the
                weekly Path panel. The bar picks the most relevant current
                assignment, and its summary is also the table's filter.
              */}
              <GradebookAssignmentBar
                assignments={assignmentsForSelectedClass}
                selectedAssignmentId={gradebookFilter.assignmentId}
                onSelectAssignment={(assignmentId) => {
                  setGradebookProgressFilter('all');
                  setGradebookFilter((current) => ({ ...current, assignmentId: assignmentId || null, student: null }));
                }}
                gradingPeriodSettings={gradingPeriodSettings}
                nowValue={now}
                disabled={!selectedGradebookPeriod}
                autoSelect={!gradebookFilter.student}
                progress={gradebookProgress}
                progressFilter={gradebookProgressFilter}
                onProgressFilter={setGradebookProgressFilter}
                classLabel={selectedGradebookClass?.name || selectedGradebookPeriod}
                onOpenAssignment={(assignmentId) => openAssignmentHub(assignmentId, gradebookFilter.classId || null)}
                onOpenLive={(assignmentId) => openLiveFor({ classId: gradebookFilter.classId || null, classPeriod: selectedGradebookPeriod || null }, assignmentId)}
                onOpenExport={(assignmentId) => openGradeExport({ classIds: gradebookFilter.classId ? [gradebookFilter.classId] : [], assignmentId })}
              />
              {(!classes.length || gradebookFilter.student) && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {/*
                  The class dropdown that stood here is gone; the class bar
                  above the page owns that choice now. The legacy period
                  picker survives only for a school with no class records at
                  all, which has no classes for the bar to offer.
                */}
                {!classes.length && (
                  <select
                    value={gradebookFilter.classPeriod}
                    onChange={(event) => setGradebookFilter({
                      classId: '', classPeriod: event.target.value, assignmentId: null, student: null,
                    })}
                    style={{ padding: '9px', minWidth: '220px' }}
                  >
                    <option value="">Select class period</option>
                    {CLASS_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
                  </select>
                )}
                {gradebookFilter.student && <button onClick={() => setGradebookFilter((current) => ({ ...current, student: null }))} style={{ padding: '9px 14px' }}>Back to class list</button>}
              </div>
              )}

              {selectedAssignment && assignmentUsesTeacherReleasePolicy(selectedAssignment) && (
                <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px', padding: '15px 17px', borderRadius: '9px', background: assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-bg)' : 'var(--mm-primary-subtle)', border: `1px solid ${assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-border)' : 'var(--mm-primary-border)'}`, textAlign: 'left' }}>
                  <div>
                    <strong style={{ color: assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-text)' : 'var(--mm-primary-text)' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? 'Assessment feedback released' : 'Assessment feedback is held'}</strong>
                    <div style={{ marginTop: '4px', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? `Students can now see correctness and grades.${selectedAssignment.feedbackReleasedAt ? ` Released ${formatTimeStamp(selectedAssignment.feedbackReleasedAt)}.` : ''}` : 'You can review scores here; students see only a neutral submitted state until you release feedback.'}</div>
                  </div>
                  {!assignmentFeedbackWasReleased(selectedAssignment) && (
                    <button type="button" disabled={feedbackReleaseBusyId === selectedAssignment.id} onClick={() => handleReleaseAssignmentFeedback(selectedAssignment)} style={{ padding: '9px 14px', border: 0, borderRadius: '7px', background: feedbackReleaseBusyId === selectedAssignment.id ? '#dadce0' : '#174ea6', color: '#fff', fontWeight: 900, cursor: feedbackReleaseBusyId === selectedAssignment.id ? 'wait' : 'pointer' }}>
                      {feedbackReleaseBusyId === selectedAssignment.id ? 'Releasing…' : 'Release Feedback to Students'}
                    </button>
                  )}
                </section>
              )}

              {/*
                "The teacher should never have to guess whether two students'
                scores came from identical rigor." On an adaptive assignment
                two students can both score 80% having answered genuinely
                different questions. That is the point of adaptation, and it
                makes the two scores incomparable in a way nothing on this
                screen previously admitted. Read from delivered evidence, not
                from the assignment's declared mode.
              */}
              {selectedAssignment && !gradebookFilter.student && (
                <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 9, border: '1px solid var(--mm-border)', background: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-subtle)' : 'var(--mm-surface-sunken)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-soft)' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'var(--mm-success-bg)' : 'var(--mm-surface-control)', color: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-text)' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'var(--mm-success-text)' : 'var(--mm-text-muted)' }}>
                    {gradebookRigor.state === COMPARABILITY.VARIED ? 'RIGOR VARIED' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'SAME RIGOR' : 'RIGOR UNKNOWN'}
                  </span>
                  <span style={{ flex: 1, minWidth: 220, color: 'var(--mm-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.45 }}>{gradebookRigor.note}</span>
                  {gradebookRigor.state === COMPARABILITY.UNKNOWN && (
                    <button
                      type="button"
                      onClick={() => handleLoadDeliveredRigor(selectedClassStudents.map((student) => student.id))}
                      disabled={classEvidenceLoading}
                      style={{ padding: '7px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))', cursor: classEvidenceLoading ? 'wait' : 'pointer' }}
                    >
                      {classEvidenceLoading ? 'Reading delivery history…' : 'Check delivered rigor'}
                    </button>
                  )}
                </div>
              )}

              {selectedGradebookPeriod && selectedAssignment && !gradebookFilter.student && (
                <div role="region" aria-label="Gradebook scores by student" tabIndex={0} style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ background: 'var(--mm-surface-sunken)' }}><th style={{ padding: '12px' }}>Student</th><th>Overall</th><th>Warm-Up</th><th>Classwork</th><th>Practice</th><th>DOL</th><th>Instructional condition</th><th>Activity</th><th></th></tr></thead><tbody>{gradebookVisibleStudents.map((student) => { const grades = projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || undefined; const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const practicePassRedeemed = gradebookHasPracticePass(student, selectedAssignment); const supportProfile = student.profile || null; const testCycleRow = isTestCycleAssignment(selectedAssignment); /* A Test Cycle's grade is its RECORDED grade (released Test, capped retest), not its Review tracker. */ const score = testCycleRow ? canonicalPresentedAssignmentGrade({ student, assignment: selectedAssignment }) : assignmentOverride ? assignmentOverride.score : grades ? calculateGrade(grades, selectedAssignment, { practicePassRedeemed, supportProfile }) : null; const sectionGrades = splitGradesBySection({ tracker: grades, assignment: selectedAssignment, practicePassRedeemed, supportProfile }); const recoveredSections = completedRecoverySections(student, selectedAssignment.id); const heldSections = heldRecoverySections(student, selectedAssignment.id); const challengeWarmup = warmupChallengeCounts(student, selectedAssignment.id); const recoveredMark = (section) => (<>{section === 'warmup' && challengeWarmup ? <span data-warmup-challenge-mark="true" title="The Warm-Up grade is this student's Live Challenge result. Open Details for the rounds." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>LC</span> : null}{recoveredSections.has(section) ? <span data-recovered-section={section} title="Includes a completed Practice-based Recovery. Open Details for Original, Recovery and Final." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>R</span> : null}{heldSections.has(section) ? <span data-held-recovery-section={section} title="A Practice-based Recovery is held for you: MathMaster could not grade one or more of its questions. The original shows until you resolve it in Details; Classroom and Grade Transfer wait." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>Held</span> : null}</>); const gradeSplit = splitGrade({ tracker: grades, assignment: selectedAssignment, practicePassRedeemed, supportProfile }); const gradeExplanation = grades ? explainGrade(gradeSplit) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const modified = Boolean(usage.modified || usage.modifications?.length); const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <tr key={student.id} style={{ borderBottom: '1px solid var(--mm-border-soft)' }}><td style={{ padding: '12px' }}><StudentNameLink studentId={student.id} studentName={formatStudentName(student)} showMissingId={false} profile={teacherLearningProfiles[student.id]} onOpen={setProfileDrawerStudentId} showBadge /><div style={{ marginTop: 3, color: 'var(--mm-text-muted)', fontSize: 'calc(11 * var(--mm-px))' }}>ID {student.id}</div></td><td><strong style={{ color: modified ? 'var(--mm-accent-text)' : score >= 70 ? 'var(--mm-success)' : 'var(--mm-text-strong)' }}>{score === null ? '—' : `${score}%`}</strong>{modified && <span title={`Accommodations: ${(usage.accommodations || []).join(', ') || 'none'}; Modifications: ${(usage.modifications || []).join(', ') || 'none'}`} style={{ marginLeft: '7px', padding: '3px 6px', borderRadius: '999px', background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', fontWeight: 900, fontSize: 'calc(11 * var(--mm-px))' }}>MOD</span>}
                  {/*
                    COMPLETION AND PERFORMANCE, VISUALLY APART.
                    The grade above is unchanged. These two lines are what a
                    teacher previously reconstructed by clicking into each
                    student one at a time: how much was attempted, and how they
                    did on what they attempted. A grey completion chip is
                    deliberately NOT red — a student who missed a week has not
                    failed mathematics.
                  */}
                  {gradeSplit.shape !== 'complete' && (
                    <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 'calc(10.5 * var(--mm-px))', fontWeight: 900 }}>
                        {gradeSplit.attempted}/{gradeSplit.total} ANSWERED
                      </span>
                      {gradeSplit.creditOnAttempted !== null && (
                        <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 'calc(10.5 * var(--mm-px))', fontWeight: 900 }}>
                          {gradeSplit.creditOnAttempted}% ON THOSE
                        </span>
                      )}
                    </div>
                  )}
                  {gradeExplanation && <div style={{ marginTop: 4, fontSize: 'calc(11 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.4, maxWidth: 280 }}>{gradeExplanation}</div>}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.warmup.attempted ? `${sectionGrades.warmup.score}%` : '—'}{recoveredMark('warmup')}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.classwork.attempted ? `${sectionGrades.classwork.score}%` : '—'}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.practice?.excused ? <span title="The student used a Practice Pass: Practice is excused — not scored and not required." style={{ color: 'var(--mm-accent-text)' }}>Excused (Pass)</span> : sectionGrades.practice.attempted ? `${sectionGrades.practice.score}%` : '—'}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionGrades.dol.attempted ? `${sectionGrades.dol.score}%` : '—'}{recoveredMark('dol')}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}` : (usage.accommodations || []).length ? `Accommodated: ${usage.accommodations.join(', ')}` : 'Standard'}</td><td style={{ fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45 }}>{activity.totalTimeSeconds ? <>Total {formatTime(activity.totalTimeSeconds)}<br />On time {formatTime(activity.onTimeSeconds || 0)} · Late {formatTime(activity.lateSeconds || 0)}</> : 'Time not recorded'}<br />Last on-time: {formatTimeStamp(activity.lastActiveBeforeDue)}<br />Last late: {formatTimeStamp(activity.lastActiveLate)}</td><td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', background: '#1a73e8', color: '#fff', fontWeight: 'bold' }}>Details</button></td></tr>; })}</tbody></table></div>
              )}

              {/* Per skill: who opened a worked example, and how the next question on it was marked (WE-G). A name opens that student's results, where the worth-a-conversation notes are. */}
              {selectedGradebookPeriod && selectedAssignment && !gradebookFilter.student && (
                <WorkedExamplesBySkill assignment={selectedAssignment} students={gradebookVisibleStudents.map((student) => ({ id: student.id, name: formatStudentName(student), tracker: projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || {}, omitted: studentRequiredQuestions({ assignment: selectedAssignment, profile: student.profile || null, tracker: student.gradesByAssignment?.[selectedAssignment.id] || null }).omitted }))} onOpenStudent={(studentId) => { const student = gradebookVisibleStudents.find((entry) => entry.id === studentId); if (student) setGradebookFilter((current) => ({ ...current, student })); }} />
              )}

              {gradebookFilter.student && selectedAssignment && (() => { const student = allStudents.find((entry) => entry.id === gradebookFilter.student.id) || gradebookFilter.student; const studentGrades = projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || {}; const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const drillRequired = studentRequiredQuestions({ assignment: selectedAssignment, profile: student.profile || null, tracker: student.gradesByAssignment?.[selectedAssignment.id] || null }); const drillOmitted = new Set(drillRequired.omitted); const displayedAssignmentScore = assignmentOverride ? assignmentOverride.score : Object.keys(studentGrades).length ? calculateGrade(studentGrades, selectedAssignment, { supportProfile: student.profile || null }) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', marginBottom: '18px', background: usage.modified ? 'var(--mm-accent-soft)' : 'var(--mm-primary-soft)', borderRadius: '10px' }}><div><h3 style={{ margin: 0 }}>{formatStudentName(student)} · {selectedAssignment.title}</h3><div style={{ marginTop: 6 }}><StudentPerformanceBadge profile={teacherLearningProfiles[student.id]} size="small" studentName={formatStudentName(student)} /></div><div style={{ marginTop: 3, color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>Student ID {student.id}</div><div style={{ marginTop: '5px' }}>Score: <strong>{displayedAssignmentScore === null ? '—' : `${displayedAssignmentScore}%`}</strong> {usage.modified && <span style={{ marginLeft: '7px', padding: '3px 7px', borderRadius: '999px', background: '#6f2da8', color: '#fff', fontWeight: 900 }}>MOD</span>}</div><div style={{ marginTop: '5px', fontSize: 'calc(13 * var(--mm-px))' }}>{activity.totalTimeSeconds ? `Total engagement ${formatTime(activity.totalTimeSeconds)} · Late engagement ${formatTime(activity.lateSeconds || 0)}` : 'Engagement time not recorded (see the support evidence report for server-timed minutes)'}</div><AssignmentGradeOverrideControls student={student} assignment={selectedAssignment} onChanged={() => setGradebookFilter((current) => ({ ...current, student: null }))} /><SectionRecoveryAuditTrail student={student} assignment={selectedAssignment} />{selectedAssignment?.dol?.enabled && <StudentDolRecoveryRow db={db} assignment={selectedAssignment} student={student} classId={student.classId || activeClass?.classId || null} viewer={{ email: user.email, isRootAdmin: user.isRootAdmin === true }} busy={dolAttemptGrantBusyKey === `${selectedAssignment.id}:students:${student.id}`} onGrant={() => handleGrantDOLAttemptForStudents(selectedAssignment, [student])} />}{(() => { const delivered = describeDeliveredRigor(classEvidenceByStudentId[student.id] || [], selectedAssignment.id); if (!delivered) return null; return <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)' }}><div style={{ fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>What this student was given</div><div style={{ marginTop: 3, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{delivered.summary}</div>{delivered.reasons.map((reason) => <div key={reason} style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.45 }}>{reason}</div>)}</div>; })()}</div><button onClick={() => openIEPReport(student)} style={{ padding: '10px 15px', border: '1px solid #6f2da8', borderRadius: '7px', background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Support evidence report</button></div><WorkedExamplesBySkill single assignment={selectedAssignment} students={[{ id: student.id, name: formatStudentName(student), tracker: studentGrades, omitted: drillRequired.omitted }]} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '14px' }}>{drillRequired.workload?.status === 'applied' && <div data-reduced-workload-summary style={{ gridColumn: '1 / -1', padding: '9px 11px', borderRadius: 8, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 700 }}>Fewer items, same rigor: {describeWorkloadSummary(drillRequired.workload)}</div>}{getStoredAssignmentQuestions(selectedAssignment).map((question, index) => { if (!questionIsIncluded(question)) return null; if (drillOmitted.has(index)) return <article key={index} data-not-required-question={index} style={{ padding: '16px', borderRadius: '9px', background: 'var(--mm-surface)', border: '1px dashed var(--mm-border)', textAlign: 'left', color: 'var(--mm-text-muted)' }}><strong>Question {index + 1} · {question.type}</strong><div style={{ margin: '8px 0', fontSize: 'calc(15 * var(--mm-px))', fontWeight: 800 }}>Not required for this student</div><div style={{ fontSize: 'calc(12 * var(--mm-px))' }}>Fewer items, same rigor — not counted in the score.</div></article>; const record = normalizeQuestionRecord(studentGrades[index]); const credit = Math.round(getQuestionCredit(record) * 100); return <article key={index} style={{ padding: '16px', borderRadius: '9px', background: record.status === 'correct' ? 'var(--mm-success-bg)' : record.status === 'expired' && credit < 50 ? 'var(--mm-error-bg)' : credit >= 50 ? 'var(--mm-warning-soft)' : 'var(--mm-surface-control)', border: '1px solid rgba(0,0,0,.12)', textAlign: 'left' }}><strong>Question {index + 1} · {question.type} · Grade ×{normalizeQuestionWeight(question)}</strong><div style={{ margin: '8px 0', fontSize: 'calc(20 * var(--mm-px))', fontWeight: 900 }}>{record.teacherGradeOverrideDisplay?.active ? (credit >= 100 ? 'Teacher assigned · Correct ✓' : `Teacher assigned · ${credit}%`) : record.status === 'correct' ? 'Correct ✓' : record.status === 'expired' ? credit >= 50 ? `Almost · ${credit}%` : `Incorrect · ${credit}%` : `${credit}% credit`}</div><div style={{ fontSize: 'calc(12 * var(--mm-px))' }}>Attempts: {record.totalAttempts} · Time: {formatTime(record.timeSpent || 0)}</div>{record.partGrades?.length > 0 && <div style={{ marginTop: '10px' }}>{record.partGrades.map((part) => <div key={part.id} style={{ fontSize: 'calc(12 * var(--mm-px))', color: part.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)' }}>{part.isCorrect ? '✓' : '●'} {part.label}</div>)}</div>}<button type="button" onClick={() => openTeacherScratchpad(student.id, selectedAssignment.id, index)} style={{ marginTop: '12px', padding: '8px 11px', border: '1px solid var(--mm-border-strong)', borderRadius: '6px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold' }}>View Student Work</button>{studentGrades[index] && <button type="button" onClick={() => setResponseInspectorTarget({ studentId: student.id, assignmentId: selectedAssignment.id, questionIndex: index })} style={{ marginTop: '8px', marginLeft: '8px', padding: '8px 11px', border: '1px solid #1a73e8', borderRadius: '6px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 'bold' }}>Inspect Response / Override Grade</button>}<QuestionSignalNotes studentId={student.id} assignmentId={selectedAssignment.id} questionIndex={index} teacherEmail={user?.role === 'teacher' ? user.email || '' : ''} /></article>; })}</div></div>; })()}

              {/*
                Settings and the separate weekly Path grade stay one click
                away instead of standing between the teacher and the grades.
              */}
              {activeClass.classId && (
                <details className="tw-disclosure" style={{ marginTop: 22 }}>
                  <summary>Weekly learning path grade <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>a separate grade for this week&apos;s Path practice</span></summary>
                  <div className="tw-disclosure__body">
                    <WeeklyPathGradePanel
                      students={teacherWeeklyRoster}
                      goalsByStudentId={teacherWeeklyGoalsByStudent}
                      completionsByStudentId={weeklyPathCompletionsByStudent}
                      learningProfilesByStudentId={teacherLearningProfiles}
                      weekKey={weeklyPathWeekKey}
                      classId={activeClass.classId}
                      classroomLinked={Boolean(classesById[activeClass.classId]?.classroomCourseId)}
                      progressTruncated={weeklyPathTruncated}
                      weekComplete={weeklyPathWeekComplete}
                      onOpenStudent={setProfileDrawerStudentId}
                      onReviewClassroomSync={(proposal) => setClassroomSyncProposal(proposal)}
                      now={now}
                      progressState={weeklyPathProgressLoadedFor === activeClass.classId ? 'loaded' : weeklyPathProgressLoading ? 'loading' : 'unavailable'}
                    />
                  </div>
                </details>
              )}
              <details className="tw-disclosure" style={{ marginTop: 12 }}>
                <summary>Marking periods <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>add, close, and file assignments into marking periods</span></summary>
                <div className="tw-disclosure__body">
                  <MarkingPeriodSettings
                    settings={gradingPeriodSettings}
                    assignments={assignmentsForSelectedClass}
                    classLabel={selectedGradebookClass?.name || selectedGradebookPeriod}
                    busy={gradingPeriodBusy || bulkBusy}
                    onCreatePeriod={handleCreateGradingPeriod}
                    onSetCurrentPeriod={handleSetCurrentGradingPeriod}
                    onSetPeriodArchived={handleSetGradingPeriodArchived}
                    onMoveSelectedAssignments={handleMoveSelectedAssignmentsToGradingPeriod}
                  />
                </div>
              </details>
    </>
  );
}
