import { Component } from 'react';

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
    console.error('Question module crashed:', this.props.questionType, error, info);
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
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          padding: '22px 24px', margin: '0 auto', maxWidth: '640px', textAlign: 'left',
          borderRadius: '12px', background: 'var(--mm-warning-soft, #fef7e0)',
          border: '1px solid var(--mm-warning, #f9ab00)',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--mm-warning-text, #7a4f00)' }}>This question could not be displayed</h3>
        <p style={{ margin: '10px 0 0', lineHeight: 1.55, color: 'var(--mm-ink, #202124)' }}>
          Something in how this question was set up stopped it from loading. Nothing you did caused this and your
          grade is not affected. Skip to the next question and let your teacher know.
        </p>
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--mm-ink-muted, #5f6368)' }}>
          Details for your teacher: {this.props.questionType || 'unknown type'} &mdash; {String(this.state.error?.message || this.state.error)}
        </p>
      </div>
    );
  }
}
