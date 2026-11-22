import { useMemo, useSyncExternalStore } from 'react';
import { db } from '../../firebase.js';
import { sharedAttemptSignals } from '../../platform/teacher/attemptSignalsStore.js';
import { SIGNALS_NOT_LOADED, WORTH_A_CONVERSATION, questionAttemptSignals } from '../../platform/teacher/attemptSignalsView.js';
import { ReviewSignalControl, SignalFacts, signalWhen } from './WorthAConversation.jsx';

/*
 * A STUDENT'S SIGNALS BESIDE THE QUESTION THEY BELONG TO, in the assignment's
 * results (docs/platform/SHOWING_THE_PROCESS.md, section 7, "Signals as
 * evidence"): what happened, when, and in which part, labelled not
 * conclusive. Reviewed ones stay, with who reviewed them. Draws nothing for a
 * question with none, and says so in a line when the signals could not be read.
 *
 * Every question's note on the screen reads one shared watch of the student's
 * signals on this assignment (attemptSignalsStore.js sharedAttemptSignals).
 */
export default function QuestionSignalNotes({ studentId = '', assignmentId = '', questionIndex = 0, teacherEmail = '' }) {
  const source = useMemo(() => sharedAttemptSignals({ db, studentId, assignmentId }), [studentId, assignmentId]);
  const state = useSyncExternalStore(source.subscribe, source.read, source.read);
  const signals = useMemo(
    () => questionAttemptSignals(state.signals, { assignmentId, questionIndex, formatWhen: signalWhen }),
    [state.signals, assignmentId, questionIndex],
  );
  if (!studentId || !assignmentId) return null;
  // A read that failed is said, in a line: an empty space would read as "no signals".
  if (state.failed) {
    return <p data-question-signals-failed="" role="status" style={{ margin: '10px 0 0', fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', textAlign: 'left' }}>{SIGNALS_NOT_LOADED}</p>;
  }
  if (!signals.length) return null;
  return (
    <div data-question-signals={questionIndex} style={{ marginTop: 10, padding: '8px 9px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', textAlign: 'left' }}>
      <div style={{ fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>{WORTH_A_CONVERSATION}</div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 8 }}>
        {signals.map((signal) => (
          <li key={signal.id} data-attempt-signal={signal.kind} data-reviewed={signal.reviewed ? 'true' : undefined}>
            {/* The question is the article this sits in: the place line gives the try, the time and nothing twice. */}
            <SignalFacts signal={{ ...signal, where: signal.where.split(' · ').filter((part) => /^try /.test(part)).join('') }} />
            <ReviewSignalControl studentId={studentId} signal={signal} teacherEmail={teacherEmail} who={`Question ${signal.questionIndex + 1}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
