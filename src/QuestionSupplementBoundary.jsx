import { Component } from 'react';
import { isChunkLoadError } from './platform/runtime/chunkLoadRecovery.js';
import { describeErrorDetail, recordQuestionResolutionDiagnostic } from './QuestionResolutionBoundary.jsx';

/*
 * A PANEL BESIDE A QUESTION MUST NOT TAKE THE QUESTION WITH IT.
 *
 * A question renders in three layers. QuestionModuleBoundary contains the
 * response module (the board the student works on); QuestionResolutionBoundary
 * contains everything that prepares the question and, as a last resort,
 * replaces the whole of it with "This question did not load". Between them sit
 * the panels that accompany a question — its solution review, its Guided Notes
 * coach — rendered from the same question data but outside the module.
 *
 * Those panels are where a question's data meets the screen in a state
 * ordinary use rarely reaches. The solution review appears only once a
 * question is CLOSED: Warm-Up Question 1 (lmr-wu-1) worked for every student
 * until a card sort ran out of attempts — typically at the Warm-Up deadline,
 * when the server auto-submitted the last one — and then its review put a
 * table spec object into the page. React threw, nothing nearer than the outer
 * boundary caught it, and the closed question became "This question did not
 * load" on every reload and every Chromebook, after the teacher reopened the
 * Warm-Up. "Try again" re-rendered the same throw.
 *
 * So each such panel is contained here. When one cannot render, the question
 * stays — its closed board, its attempt strip, its navigation, its
 * "Request New Question" — and only that panel is replaced (by `fallback`,
 * or nothing). The failure is recorded with the same scrubbed context as every
 * question failure, naming the panel (`stage`). Nothing here submits, grades,
 * spends an attempt or touches saved work, and the error is not hidden: it is
 * logged, recorded, and the fallback says what is missing.
 */
export default class QuestionSupplementBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const stage = this.props.stage || 'supplement';
    const context = { ...this.props.context, stage };
    console.error('Question panel could not be shown:', context, error, info);
    recordQuestionResolutionDiagnostic({
      kind: isChunkLoadError(error) ? 'chunk-load' : 'question-supplement-error',
      context,
      failure: {
        classification: 'supplement-render-failed',
        recovery: 'contained',
        diagnostics: { detail: describeErrorDetail(error) },
      },
      draftKey: this.props.draftKey || null,
      source: 'question-supplement',
    });
  }

  componentDidUpdate(previousProps) {
    // Another question (or another state of this one) gets a fresh chance.
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return this.props.fallback ?? null;
  }
}
