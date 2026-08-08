import React, { useMemo } from 'react';
import DistrictAnalyticsView from './DistrictAnalyticsView.jsx';
import { calculateMultiStakeholderAnalytics, USER_ROLES } from '../../platform/analytics/multiStakeholderAnalytics.js';

export const TeacherAnalyticsDashboard = ({ students = [], masteryProfilesByStudentId = {} }) => {
  const profiles = useMemo(() => students.map((student) => {
    const mastery = masteryProfilesByStudentId[student.id] || {};
    return { studentId: student.id, studentName: student.displayName || student.id, profile: student.profile || {}, programEligibility: student.programEligibility, teks: mastery.teks || {}, retentionSchedulesByTEKS: student.retentionSchedulesByTEKS || {} };
  }), [students, masteryProfilesByStudentId]);
  const analytics = useMemo(() => calculateMultiStakeholderAnalytics({ role: USER_ROLES.TEACHER, studentProfiles: profiles }), [profiles]);
  const tiers = analytics.tierGroupings || { tier1: [], tier2: [], tier3: [] };
  return <div><DistrictAnalyticsView analytics={analytics} title="Class analytics & readiness" /><h2 style={{ marginTop: 30 }}>Instructional groupings</h2><p style={{ color: '#5f6368' }}>Retention concerns move a student into targeted follow-up even when recent averages look secure.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>{[['Tier 1 · On track', tiers.tier1, '#e6f4ea'], ['Tier 2 · Targeted', tiers.tier2, '#fff4ce'], ['Tier 3 · Intensive', tiers.tier3, '#fce8e6']].map(([label, rows, background]) => <section key={label} style={{ padding: 15, borderRadius: 11, background }}><strong>{label}</strong><div style={{ marginTop: 10, display: 'grid', gap: 6 }}>{rows.map((row) => <div key={row.id} style={{ background: 'rgba(255,255,255,.72)', padding: 8, borderRadius: 7 }}>{row.name}{row.retentionConcern ? ' · retention check' : ''}</div>)}{!rows.length && <span style={{ color: '#5f6368', fontSize: 12 }}>No students in this group.</span>}</div></section>)}</div></div>;
};

export default TeacherAnalyticsDashboard;
