import { Component } from 'react';
import RecoveryPanel from './components/common/RecoveryPanel.jsx';
import { isChunkLoadError, recentlyReloadedForChunk, reloadForCurrentBuild } from './platform/runtime/chunkLoadRecovery.js';
import { recordClientDiagnostic } from './platform/runtime/clientDiagnostics.js';
import { questionDraftEnvelopeVersion } from './questionDraftStorage.js';

/*
 * Last line of defence around a single question's response module.
 *
 * The response modules are the most data-driven code in the app: every one of
 * them renders straight from teacher-authored blueprint JSON, and a student can
 * neither fix that JSON nor route around a broken question. Without a boundary
 * here one bad field takes down the entire assignment screen and the student
 * loses access to the questions that *are* fine.
 *
 * Scoped deliberately tight — it wraps only the response module, so the
 * surrounding prompt, attempt counter, scratchpad and navigation all keep
 * working and the student can still move to the next question.
 *
 * A QUESTION THAT CANNOT OPEN ITS OWN SAVED WORK MUST NOT STAY BROKEN.
 *
 * Warm-Up Question 1 (lmr-wu-1) threw while rendering a damaged saved draft.
 * This boundary caught it — and then had nothing to offer: the draft was still
 * saved, so every reload, every remount and every Chromebook threw again, and
 * the student could never reach the question. Two things changed:
 *
 *   - the diagnostic says where: assignment, question id, question family,
 *     the saved draft's envelope version and the question's lifecycle state
 *     (open / section locked / correct / expired) — never the student;
 *   - when the engine passes `onRecover`, the panel offers "Start this
 *     question fresh". The engine sets the question's drafts aside (a copy is
 *     kept, see quarantineQuestionDraftFamily) and remounts it. Recovery is
 *     offered once per question: if the fresh question still throws, the fault
 *     is in the question or the code, and that is what the panel says.
 *
 * Nothing is hidden: the error is logged and shown either way, and recovery
 * never submits, grades or touches the attempt record.
 */
export default class QuestionModuleBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const context = this.props.context || {};
    const draftKey = context.draftKey || null;
    const draftVersion = draftKey
      ? (() => {
        const tool = questionDraftEnvelopeVersion(`${draftKey}:work:tool`);
        return tool !== 'none' ? tool : questionDraftEnvelopeVersion(draftKey);
      })()
      : 'none';
    const where = {
      assignmentId: context.assignmentId || 'none',
      questionId: context.questionId || 'none',
      family: context.family || 'none',
      activityRole: context.activityRole || 'none',
      lifecycle: context.lifecycle || 'unknown',
      draftVersion,
    };
    console.error('Question module crashed:', this.props.questionType, where, error, info);
    recordClientDiagnostic({
      kind: isChunkLoadError(error) ? 'chunk-load' : 'question-module-error',
      message: `${this.props.questionType || 'unknown type'}: ${error?.message || error} | ${where.assignmentId} ${where.questionId} family=${where.family} role=${where.activityRole} lifecycle=${where.lifecycle} draft=v${where.draftVersion}`,
      source: 'question',
    });
  }

  componentDidUpdate(previousProps) {
    // A new question (or a regenerated variant) gets a clean slate, otherwise
    // one broken question would leave the boundary latched for the rest of the
    // assignment.
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    // A tool's code that could not be fetched is not a broken question: the
    // tab outlived a deploy (chunkLoadRecovery.js). Telling the student the
    // question was set up wrong, and to tell their teacher, sent teachers
    // hunting for a content error that did not exist.
    if (isChunkLoadError(this.state.error)) {
      const again = recentlyReloadedForChunk();
      return (
        <RecoveryPanel
          compact
          tone={again ? 'offline' : 'updated'}
          title={again ? 'This tool could not load' : 'MathMaster was just updated'}
          primaryLabel={again ? 'Try again' : 'Load the new version'}
          onPrimary={() => reloadForCurrentBuild()}
          offerReport={again}
          technicalMessage={again ? String(this.state.error?.message || this.state.error) : ''}
        >
          <p style={{ margin: 0 }}>
            {again
              ? 'Check that this device is connected to the internet, then try again. Your work on this question is saved.'
              : 'This tool changed after this tab was opened. Your work on this question is saved — loading the new version brings you right back to it.'}
          </p>
        </RecoveryPanel>
      );
    }

    return (
      <div
        role="alert"
        style={{
          padding: '22px 24px', margin: '0 auto', maxWidth: '640px', textAlign: 'left',
          borderRadius: '12px', background: 'var(--mm-warning-soft, var(--mm-warning-bg))',
          border: '1px solid var(--mm-warning, #f9ab00)',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--mm-warning-text)' }}>This question could not be displayed</h3>
        <p style={{ margin: '10px 0 0', lineHeight: 1.55, color: 'var(--mm-ink, var(--mm-text-strong))' }}>
          Something in how this question was set up stopped it from loading. Nothing you did caused this and your
          grade is not affected. Skip to the next question and let your teacher know.
        </p>
        {typeof this.props.onRecover === 'function' ? (
          <>
            <p style={{ margin: '10px 0 0', lineHeight: 1.55, color: 'var(--mm-ink, var(--mm-text-strong))' }}>
              If you had started this question, your saved work may be what could not be opened. You can start this
              question fresh and keep going. Your recorded attempts and grade do not change, and a copy of the saved
              work is kept for your teacher.
            </p>
            <button
              type="button"
              onClick={() => this.props.onRecover()}
              style={{ marginTop: '12px', minHeight: '44px', padding: '10px 18px', border: 'none', borderRadius: '999px', background: 'var(--mm-primary, #1a73e8)', color: 'var(--mm-on-primary, #ffffff)', fontWeight: 800, cursor: 'pointer' }}
            >
              Start this question fresh
            </button>
          </>
        ) : null}
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--mm-ink-muted, var(--mm-text-muted))' }}>
          Details for your teacher: {this.props.questionType || 'unknown type'} &mdash; {String(this.state.error?.message || this.state.error)}
        </p>
      </div>
    );
  }
}
