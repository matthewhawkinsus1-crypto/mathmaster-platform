import React, { useState } from 'react';
import ProctorLiveMonitor from './ProctorLiveMonitor.jsx';
import { createSecureExamSession } from '../../services/secureExamService.js';
import { EXAM_TYPES } from '../../platform/assessment/examDomainRegistry.js';
import { getExamPolicy } from '../../platform/policies/examPolicyResolver.js';

export const TeacherSecureExamDashboard = ({ students = [] }) => {
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [examType, setExamType] = useState(EXAM_TYPES.DIGITAL_SAT);
  const [questionCount, setQuestionCount] = useState(10);
  const [accommodationsConfirmed, setAccommodationsConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [monitorKey, setMonitorKey] = useState(0);
  const policy = getExamPolicy(examType);
  const create = async (event) => {
    event.preventDefault();
    if (!studentId) return;
    setCreating(true); setMessage('');
    try {
      const result = await createSecureExamSession({ studentId, examType, accommodationsConfirmed, questionCount: Math.min(policy.totalQuestions, Math.max(1, Number(questionCount) || 1)) });
      setMessage(`Secure session created for ${studentId}: ${result.session.examSessionId}`);
      setMonitorKey((value) => value + 1);
    } catch (error) { setMessage(error.message || 'Could not create the secure exam session.'); }
    finally { setCreating(false); }
  };
  return <div><section style={{ padding: 20, border: '1px solid #dadce0', borderRadius: 12, background: '#f8f9fa', marginBottom: 28 }}><h2 style={{ marginTop: 0 }}>Create secure exam session</h2><p style={{ color: '#5f6368', lineHeight: 1.5 }}>Student delivery uses server-held answer keys, one-attempt grading, monitored browser integrity events, timer autosubmit, and teacher-release feedback.</p><form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, alignItems: 'end' }}><label style={{ fontWeight: 800, fontSize: 13 }}>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 42, marginTop: 5 }}><option value="">Choose student…</option>{students.map((student) => <option value={student.id} key={student.id}>{student.id} · {student.classPeriod || 'Unassigned'}</option>)}</select></label><label style={{ fontWeight: 800, fontSize: 13 }}>Simulation<select value={examType} onChange={(event) => { setExamType(event.target.value); setQuestionCount(Math.min(10, getExamPolicy(event.target.value).totalQuestions)); }} style={{ display: 'block', width: '100%', minHeight: 42, marginTop: 5 }}>{Object.values(EXAM_TYPES).map((type) => <option value={type} key={type}>{getExamPolicy(type).title}</option>)}</select></label><label style={{ fontWeight: 800, fontSize: 13 }}>Question count<input type="number" min="1" max={policy.totalQuestions} value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 42, marginTop: 5, boxSizing: 'border-box' }} /></label><button disabled={!studentId || creating} type="submit" style={{ minHeight: 42, border: 0, borderRadius: 8, background: !studentId || creating ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900 }}>{creating ? 'Creating…' : 'Create session'}</button></form><label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 13, color: '#3c4043', fontSize: 13 }}><input type="checkbox" checked={accommodationsConfirmed} onChange={(event) => setAccommodationsConfirmed(event.target.checked)} /><span><strong>Teacher/proctor confirms documented exam accommodations.</strong> This explicit confirmation is required before MathMaster applies a support-plan calculator that would deviate from the base simulation policy.</span></label>{message && <p role="status" style={{ color: message.startsWith('Secure session') ? '#137333' : '#b3261e', fontWeight: 700 }}>{message}</p>}</section><ProctorLiveMonitor key={monitorKey} /></div>;
};

export default TeacherSecureExamDashboard;
