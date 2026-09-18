import { useEffect, useMemo, useState } from 'react';
import { formatStudentName } from '../../platform/studentName.js';
import {
  CONTACT_CATEGORIES, CONTACT_METHODS, buildStudentProgressBrief, contactsCsv, groupContactsByStudent, progressBriefText, projectProgressBriefGrades, validateContactDraft,
} from '../../platform/teacher/parentContactCenter.js';
import { resolveReturnCheckIns } from '../../platform/attendance/returnCheckIn.js';
import { localDateKeyOf } from '../../platform/attendance/classMeetings.js';

const labels = { missingWork: 'Missing work', academicIntegrity: 'Academic integrity', positiveContact: 'Positive contact', cellphone: 'Cellphone' };
const label = (value) => labels[value] || value.charAt(0).toUpperCase() + value.slice(1);
const localNow = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const button = { padding: '9px 12px', border: '1px solid #c7ccd4', borderRadius: 8, background: '#fff', fontWeight: 800, cursor: 'pointer' };

export default function ParentContactCenter({ students = [], classes = [], assignments = [], contacts = [], supportEvents = [], sessionSummaries = [], masteryProfilesByStudentId = {}, classSchedule = null, nonInstructionalKeys = null, nowValue = Date.now(), sourceAction = null, onRecordContact, onCompleteFollowUp, onExportContacts }) {
  const [studentId, setStudentId] = useState('');
  const [draft, setDraft] = useState({ occurredAt: localNow(), method: 'phone', category: 'academics', notes: '', outcome: '', followUpDate: '' });
  const [error, setError] = useState('');
  const [briefText, setBriefText] = useState('');
  const groups = useMemo(() => groupContactsByStudent({ contacts, students }), [contacts, students]);
  const student = students.find((entry) => String(entry.id || entry.studentId) === studentId) || null;
  useEffect(() => {
    if (!sourceAction?.studentId) return;
    setStudentId(String(sourceAction.studentId));
    const integrityFollowUp = sourceAction.context?.includes('Confirmed academic-integrity incident');
    setDraft((current) => ({
      ...current,
      category: integrityFollowUp ? 'academicIntegrity' : current.category,
      outcome: current.outcome || 'Parent contact completed.',
    }));
  }, [sourceAction]);
  // This is the PR 263 attendance authority, not a second reminder engine.
  const returnCheckIns = useMemo(() => classes.flatMap((classRecord) => resolveReturnCheckIns({
    roster: students.filter((entry) => entry.classId === (classRecord.classId || classRecord.id)), supportEvents, assignments,
    classId: classRecord.classId || classRecord.id, classPeriod: classRecord.period || classRecord.classPeriod,
    schedule: classSchedule, nonInstructionalKeys, todayDateKey: localDateKeyOf(nowValue),
  })), [classes, students, supportEvents, assignments, classSchedule, nonInstructionalKeys, nowValue]);

  const save = async (event) => {
    event.preventDefault();
    const payload = { ...draft, studentId, studentName: student ? formatStudentName(student) : '', classId: student?.classId || null, classPeriod: student?.classPeriod || null, sourceEventId: sourceAction?.sourceId || null };
    const errors = validateContactDraft(payload);
    if (errors.length) return setError(errors.join(' '));
    setError('');
    try { await onRecordContact(payload); setDraft((current) => ({ ...current, notes: '', outcome: '', followUpDate: '' })); } catch (reason) { setError(reason.message); }
  };

  const buildBrief = () => {
    if (!student) return setError('Choose a student first.');
    const gradeMap = student.gradesByAssignment || {};
    const gradeEntries = projectProgressBriefGrades({ student, assignments });
    const mine = (rows) => rows.filter((entry) => String(entry.studentId) === studentId);
    const brief = buildStudentProgressBrief({
      student, gradeEntries, attendance: mine(supportEvents).filter((event) => /Attendance/i.test(event.kind)),
      extensions: assignments.flatMap((assignment) => assignment.studentOverrides?.[studentId]?.extension ? [{ assignment: assignment.title, ...assignment.studentOverrides[studentId] }] : []),
      overrideActions: Object.values(gradeMap).filter((entry) => entry?.teacherOverride || entry?.academicIntegrityAction), supportHistory: mine(supportEvents), contacts: mine(contacts),
      masteryEvidence: Object.values(masteryProfilesByStudentId[studentId]?.profiles || {}).slice(0, 12), returnCheckIns,
      sessionSummaries: mine(sessionSummaries),
    });
    setBriefText(progressBriefText(brief));
  };

  const exportAll = async () => {
    setError('');
    let completeHistory;
    try { completeHistory = await onExportContacts(); } catch (reason) { setError(reason.message); return; }
    const blob = new Blob([contactsCsv({ contacts: completeHistory, students, classes })], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `parent-contact-history-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <section aria-labelledby="contact-center-heading" style={{ padding: 22 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h2 id="contact-center-heading" style={{ margin: 0 }}>Parent Contact Center</h2><p style={{ color: '#5f6368' }}>All classes · records stay connected by canonical student ID.</p></div><button type="button" style={button} onClick={exportAll}>Export all contact history (CSV)</button></div>
    {returnCheckIns.length > 0 && <aside style={{ padding: 12, marginBottom: 16, borderRadius: 9, background: '#fff8e1' }}><strong>Return-from-absence follow-up</strong><div>{returnCheckIns.map((item) => `${item.studentName} (${item.classPeriod})`).join(', ')}</div></aside>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 18 }}>
      <form onSubmit={save} style={{ padding: 16, border: '1px solid #dadce0', borderRadius: 12 }}><h3 style={{ marginTop: 0 }}>Record contact</h3>
        <label>Student<select required value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8 }}><option value="">Choose student</option>{students.map((entry) => <option key={entry.id} value={entry.id}>{formatStudentName(entry)} — {entry.classPeriod || entry.classId}</option>)}</select></label>
        <label>Date and time<input required type="datetime-local" value={draft.occurredAt} onChange={(e) => setDraft({ ...draft, occurredAt: e.target.value })} style={{ display: 'block', width: '100%', padding: 8 }} /></label>
        <label>Method<select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} style={{ display: 'block', width: '100%', padding: 8 }}>{CONTACT_METHODS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label>Reason<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={{ display: 'block', width: '100%', padding: 8 }}>{CONTACT_CATEGORIES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label>Notes (do not include student answer content)<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={2000} style={{ display: 'block', width: '100%', minHeight: 70 }} /></label>
        <label>Outcome<textarea required value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })} maxLength={1000} style={{ display: 'block', width: '100%', minHeight: 55 }} /></label>
        <label>Optional follow-up date<input type="date" value={draft.followUpDate} onChange={(e) => setDraft({ ...draft, followUpDate: e.target.value })} style={{ display: 'block', width: '100%', padding: 8 }} /></label>
        {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}<div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button style={{ ...button, background: '#1a73e8', color: '#fff' }}>Save contact</button><button type="button" style={button} onClick={buildBrief}>Generate progress brief</button></div>
      </form>
      <div><h3 style={{ marginTop: 0 }}>History by student</h3>{!groups.length && <p>No contacts recorded yet.</p>}{groups.map((group) => <details key={group.studentId} open={group.studentId === studentId} style={{ borderBottom: '1px solid #e8eaed', padding: 10 }}><summary><strong>{group.studentName}</strong> · {group.contacts.length} contact{group.contacts.length === 1 ? '' : 's'}</summary>{group.contacts.map((entry) => <article key={entry.id || `${entry.occurredAt}:${entry.method}`} style={{ margin: '10px 0', paddingLeft: 12, borderLeft: '3px solid #d2e3fc' }}><strong>{new Date(entry.occurredAt).toLocaleString()} · {label(entry.method)} · {label(entry.category)}</strong><div>{entry.outcome}</div>{entry.notes && <div>{entry.notes}</div>}{entry.followUpDate && <div>Follow up: {entry.followUpDate} {entry.followUpCompleted ? '· Completed' : <button type="button" style={button} onClick={() => onCompleteFollowUp(entry)}>Mark complete</button>}</div>}</article>)}</details>)}</div>
    </div>
    {briefText && <div style={{ marginTop: 20 }}><h3>Student Progress Brief</h3><p style={{ color: '#5f6368' }}>Clear factual context for the teacher to review or copy into a drafting tool.</p><textarea readOnly value={briefText} aria-label="Student progress brief" style={{ width: '100%', minHeight: 260, padding: 12, boxSizing: 'border-box' }} /><button type="button" style={button} onClick={() => navigator.clipboard.writeText(briefText)}>Copy brief</button></div>}
  </section>;
}
