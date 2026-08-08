import React, { useMemo, useState } from 'react';
import DistrictAnalyticsView from './DistrictAnalyticsView.jsx';
import { calculateMultiStakeholderAnalytics, USER_ROLES } from '../../platform/analytics/multiStakeholderAnalytics.js';
import { generateParentSummaryReport } from '../../platform/analytics/parentSummaryGenerator.js';

const demoStudents = [
  { studentId: 'Demo A', profile: { inclusionStatus: true, accommodations: ['extra-time'] }, masteryProfilesByTEKS: { 'A.2C': { mastery: { estimate: 88, status: 'Mastered' } }, 'A.4A': { mastery: { estimate: 72, status: 'Secure' } }, 'A.6A': { mastery: { estimate: 77, status: 'Secure' } }, 'A.10A': { mastery: { estimate: 68, status: 'Developing' } } } },
  { studentId: 'Demo B', profile: {}, masteryProfilesByTEKS: { 'A.2C': { mastery: { estimate: 62, status: 'Developing' } }, 'A.4A': { mastery: { estimate: 49, status: 'Needs Attention' }, signals: { retention: 'concern' } }, 'A.6A': { mastery: { estimate: 55, status: 'Developing' } }, 'A.10A': { mastery: { estimate: 51, status: 'Developing' } } } },
  { studentId: 'Demo C', profile: { translationLanguage: 'es' }, masteryProfilesByTEKS: { 'A.2C': { mastery: { estimate: 94, status: 'Mastered' } }, 'A.4A': { mastery: { estimate: 89, status: 'Mastered' } }, 'A.6A': { mastery: { estimate: 83, status: 'Secure' } }, 'A.10A': { mastery: { estimate: 86, status: 'Mastered' } } } },
];

export const ShowcaseClassroomDashboard = () => {
  const [view, setView] = useState('teacher');
  const analytics = useMemo(() => calculateMultiStakeholderAnalytics({ role: view === 'district' ? USER_ROLES.DISTRICT_ADMIN : view === 'principal' ? USER_ROLES.PRINCIPAL : USER_ROLES.TEACHER, studentProfiles: demoStudents }), [view]);
  const parent = generateParentSummaryReport({ studentName: 'Demo C', masteryProfilesByTEKS: demoStudents[2].masteryProfilesByTEKS, studentProfile: demoStudents[2].profile });
  return <section style={{ padding: 20, border: '2px dashed #aeb8c6', borderRadius: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>Showcase classroom</h2><p style={{ color: '#5f6368' }}>Synthetic demonstration data only; this does not grant district, principal, or parent authorization.</p></div><select value={view} onChange={(event) => setView(event.target.value)}><option value="district">District demo</option><option value="principal">Principal demo</option><option value="teacher">Teacher demo</option><option value="parent">Parent demo</option></select></div>{view === 'parent' ? <div style={{ background: '#fff', padding: 18, borderRadius: 10 }}><h3>{parent.headline}</h3><p>{parent.overallAssessment}</p><p>{parent.strengthsText}</p><p>{parent.focusText}</p><p>{parent.collegeReadinessNote}</p></div> : <DistrictAnalyticsView analytics={analytics} title={`${view.charAt(0).toUpperCase()}${view.slice(1)} synthetic view`} />}</section>;
};

export default ShowcaseClassroomDashboard;
