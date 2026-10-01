import { useState } from 'react';
import { db } from '../../firebase.js';
import { quickActions } from '../../../functions/shared/supportCatalog.mjs';
import { NOTE_AFTER_WINDOW_MINUTES } from '../../../functions/shared/supportEvidenceModel.mjs';
import {
  addNoteToStaffSupportEvidence,
  recordStaffSupportEvidence,
  voidStaffSupportEvidence,
} from '../../platform/supportEvidence/supportEvidenceStore.js';
import './teacherWorkspace.css';
import './supportEvidence.css';

/*
 * ONE CLICK, ONE TIMESTAMPED RECORD.
 *
 * "Checked understanding", "Re-explained directions"… are things only an adult
 * can do and only a staff record can prove. With thirty students in the room a
 * teacher has one second: the click writes the record immediately (server
 * time, the teacher's name, this student, this assignment when there is one).
 * A note is never required; it can be added once, within a few minutes, by the
 * same teacher. A mis-click is withdrawn with a correction record — the
 * original is never edited or deleted.
 */

const timeOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function SupportQuickActions({
  student,
  teacherEmail = '',
  assignmentId = null,
  activityRole = null,
  profileRevisionId = null,
  compact = false,
  onRecorded = null,
}) {
  const [busyId, setBusyId] = useState(null);
  const [last, setLast] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteState, setNoteState] = useState('idle');
  const [error, setError] = useState('');
  const actions = quickActions();

  if (!student?.id) return null;

  const record = async (supportId) => {
    setBusyId(supportId);
    setError('');
    setNoteState('idle');
    setNoteDraft('');
    try {
      const saved = await recordStaffSupportEvidence({
        db,
        event: {
          studentId: student.id,
          classId: student.classId || null,
          assignmentId,
          activityRole,
          supportId,
          actorEmail: teacherEmail,
          profileRevisionId,
          // The teacher is the one documenting — even "inclusion support
          // present", which records WHO was present in `providerRole`, not a
          // claim that the provider wrote it.
          eventType: 'teacher-documented',
          actorType: 'teacher',
          providerRole: supportId === 'inclusion-support' ? 'inclusion-teacher' : null,
        },
      });
      setLast(saved);
      onRecorded?.(saved);
    } catch (recordError) {
      setError(recordError?.message || 'Could not record that. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const withinNoteWindow = last && Date.now() - last.occurredAtMs < NOTE_AFTER_WINDOW_MINUTES * 60000;

  const saveNote = async () => {
    if (!last || !noteDraft.trim()) return;
    setNoteState('saving');
    try {
      await addNoteToStaffSupportEvidence({ db, studentId: last.studentId, eventId: last.id, note: noteDraft });
      setNoteState('saved');
      onRecorded?.({ ...last, note: noteDraft.trim() });
    } catch (noteError) {
      setNoteState('idle');
      setError(noteError?.message || 'The note could not be added.');
    }
  };

  const withdraw = async () => {
    if (!last) return;
    setBusyId('withdraw');
    try {
      const correction = await voidStaffSupportEvidence({ db, original: last, teacherEmail });
      onRecorded?.(correction);
      setLast(null);
    } catch (voidError) {
      setError(voidError?.message || 'The correction could not be recorded.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="se-stack" style={{ gap: 6 }} data-support-quick-actions={student.id}>
      <div className="se-quick" role="group" aria-label={`Record classroom support for ${student.name || 'this student'}`}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`tw-btn ${compact ? 'tw-btn--sm' : ''}`}
            disabled={Boolean(busyId)}
            onClick={() => record(action.id)}
            title={action.label}
          >
            {busyId === action.id ? 'Recording…' : action.quickAction}
          </button>
        ))}
      </div>
      {last && (
        <div className="tw-notice" data-tone="success" role="status">
          <div className="tw-row" style={{ justifyContent: 'space-between' }}>
            <span><strong>{actions.find((action) => action.id === last.supportId)?.quickAction || 'Recorded'}</strong> · recorded {timeOf(last.occurredAtMs)}</span>
            <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" disabled={Boolean(busyId)} onClick={withdraw}>Entered in error</button>
          </div>
          {withinNoteWindow && noteState !== 'saved' && (
            <div className="tw-row" style={{ marginTop: 6 }}>
              <label className="tw-sr-only" htmlFor={`support-note-${last.id}`}>Optional note</label>
              <input
                id={`support-note-${last.id}`}
                className="tw-input"
                style={{ flex: '1 1 220px' }}
                maxLength={280}
                placeholder="Optional note (not required)"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
              <button type="button" className="tw-btn tw-btn--sm" disabled={!noteDraft.trim() || noteState === 'saving'} onClick={saveNote}>
                {noteState === 'saving' ? 'Adding…' : 'Add note'}
              </button>
            </div>
          )}
          {noteState === 'saved' && <div className="tw-small" style={{ marginTop: 4 }}>Note added.</div>}
        </div>
      )}
      {error && <div className="tw-notice" data-tone="danger" role="alert">{error}</div>}
    </div>
  );
}
