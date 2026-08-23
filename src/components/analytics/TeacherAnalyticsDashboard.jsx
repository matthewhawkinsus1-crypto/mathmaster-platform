import React, { useMemo } from 'react';
import DistrictAnalyticsView from './DistrictAnalyticsView.jsx';
import { calculateMultiStakeholderAnalytics, USER_ROLES } from '../../platform/analytics/multiStakeholderAnalytics.js';
import { buildInstructionalGroups, GROUP } from '../../platform/teacher/instructionalGroups.js';
import StudentNameLink from '../common/StudentNameLink.jsx';

/*
 * Class analytics, and the groups a teacher would actually teach from.
 *
 * The groupings below used to come from a separate tier calculator with its own
 * thresholds, which meant a student could read as "Tier 1 · On track" here and
 * "Below Level" on the roster in the same minute, with nothing on either screen
 * saying which to believe. They now come from the same Student Learning Profile
 * every other teacher surface reads.
 *
 * Two things changed beyond the plumbing:
 *
 *   A student without enough evidence is no longer swept into Tier 1. The old
 *   code reported a brand-new student with four answered questions as "on
 *   track". They are not on track — they are unknown, and a teacher needs to be
 *   told that instead.
 *
 *   Every placement now shows its reason. A group with no reason is a label,
 *   and a label that persists is tracking.
 */

const TONE = {
  [GROUP.INTENSIVE]: { background: '#fce8e6', accent: '#a50e0e' },
  [GROUP.TARGETED]: { background: '#fff4ce', accent: '#7a5300' },
  [GROUP.CORE]: { background: '#e6f4ea', accent: '#137333' },
  [GROUP.EXTENSION]: { background: '#e8f0fe', accent: '#174ea6' },
  [GROUP.BASELINE]: { background: '#f1f3f4', accent: '#5f6368' },
};

export const TeacherAnalyticsDashboard = ({
  students = [],
  masteryProfilesByStudentId = {},
  learningProfilesByStudentId = {},
  onOpenStudent = null,
}) => {
  const profiles = useMemo(() => students.map((student) => {
    const mastery = masteryProfilesByStudentId[student.id] || {};
    return {
      studentId: student.id,
      studentName: student.displayName || student.id,
      profile: student.profile || {},
      programEligibility: student.programEligibility,
      teks: mastery.teks || {},
      retentionSchedulesByTEKS: student.retentionSchedulesByTEKS || {},
    };
  }), [students, masteryProfilesByStudentId]);

  const analytics = useMemo(
    () => calculateMultiStakeholderAnalytics({ role: USER_ROLES.TEACHER, studentProfiles: profiles }),
    [profiles],
  );

  const groups = useMemo(
    () => buildInstructionalGroups({ students, profilesByStudentId: learningProfilesByStudentId }),
    [students, learningProfilesByStudentId],
  );

  return (
    <div>
      <DistrictAnalyticsView analytics={analytics} title="Class analytics & readiness" />

      <h2 style={{ marginTop: 30, marginBottom: 4 }}>Suggested instructional groups</h2>
      <p style={{ color: '#5f6368', marginTop: 0, maxWidth: '70ch' }}>
        Recomputed from current evidence every time this screen opens. Nothing here is stored on a student,
        so no group follows anyone into next week or next year. Every placement shows the reason behind it —
        change the instruction and the groups change with it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {groups.map(({ group, label, purpose, students: members }) => {
          const tone = TONE[group] || TONE[GROUP.BASELINE];
          return (
            <section key={group} style={{ padding: 16, borderRadius: 12, background: tone.background }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ color: tone.accent }}>{label}</strong>
                <span style={{ fontWeight: 900, color: tone.accent }}>{members.length}</span>
              </div>
              <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#3c4043', lineHeight: 1.45 }}>{purpose}</p>

              <div style={{ display: 'grid', gap: 7 }}>
                {members.map((member) => (
                  <div key={member.studentId} style={{ background: 'rgba(255,255,255,.78)', padding: '9px 10px', borderRadius: 8 }}>
                    <StudentNameLink
                      studentId={member.studentId}
                      studentName={member.studentName}
                      profile={learningProfilesByStudentId[member.studentId]}
                      onOpen={onOpenStudent}
                      style={{ fontSize: 13.5 }}
                    />
                    <div style={{ marginTop: 3, fontSize: 12, color: '#5f6368', lineHeight: 1.45 }}>{member.reason}</div>
                  </div>
                ))}
                {!members.length && (
                  <span style={{ color: '#5f6368', fontSize: 12 }}>No students in this group right now.</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default TeacherAnalyticsDashboard;
