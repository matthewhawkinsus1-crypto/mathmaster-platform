import { useEffect, useState } from 'react';
import { db } from '../../firebase.js';
import { HELP_ACK_STATUS, acknowledgementFor } from '../../platform/supports/askTeacher.js';
import { acknowledgeHelpRequest, watchHelpAcknowledgement } from '../../platform/supports/askTeacherStore.js';

/*
 * ANSWERING A RAISED HAND FROM THE LIVE MONITOR (student pass 3, HELP-5, D6).
 *
 * Beside "Hand raised", two buttons: "Seen" and "On my way". Either one writes
 * the student's helpAcknowledgements document for THIS hand (it names the
 * hand by the presence `helpRequestedAt`), and the student reads it beside
 * their raised hand. The pressed button is what the student currently sees,
 * read back from that document, so a second teacher screen agrees.
 *
 * Never on the projector (Large room tiles): the room does not need to know
 * who asked.
 */
const ACK_LABEL = {
  [HELP_ACK_STATUS.SEEN]: 'Seen',
  [HELP_ACK_STATUS.ON_MY_WAY]: 'On my way',
};

const buttonStyle = {
  padding: '5px 9px', borderRadius: 7, border: '1px solid #b06000', background: 'var(--mm-surface)',
  color: 'var(--mm-warning-text)', fontWeight: 800, fontSize: 'calc(11.5 * var(--mm-px))', cursor: 'pointer',
};

export default function HelpAcknowledgeControls({ studentId, live, teacherEmail }) {
  const helpRequestedAt = Number(live?.helpRequestedAt);
  const raised = Boolean(studentId && live?.assignmentId && Number.isInteger(helpRequestedAt) && helpRequestedAt > 0);
  const [stored, setStored] = useState(null);
  const [busy, setBusy] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStored(null);
    if (!raised) return undefined;
    return watchHelpAcknowledgement(db, studentId, setStored, () => setStored(null));
  }, [raised, studentId]);

  if (!raised || !teacherEmail) return null;
  const current = acknowledgementFor({ assignmentId: live.assignmentId, at: helpRequestedAt }, stored);

  const send = async (status) => {
    setBusy(status);
    setFailed(false);
    try {
      await acknowledgeHelpRequest(db, { studentId, assignmentId: live.assignmentId, helpRequestedAt, status, teacherEmail });
    } catch {
      setFailed(true);
    } finally {
      setBusy('');
    }
  };

  return (
    <div
      role="group"
      aria-label="Answer this raised hand"
      data-help-acknowledge=""
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}
    >
      {Object.values(HELP_ACK_STATUS).map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={current === status}
          disabled={Boolean(busy)}
          onClick={() => send(status)}
          style={{ ...buttonStyle, background: current === status ? 'var(--mm-warning-bg)' : buttonStyle.background }}
        >
          {busy === status ? 'Sending…' : `${current === status ? '✓ ' : ''}${ACK_LABEL[status]}`}
        </button>
      ))}
      {failed && <span role="alert" style={{ fontSize: 'calc(11 * var(--mm-px))', color: 'var(--mm-danger)' }}>Not sent. Try again.</span>}
    </div>
  );
}
