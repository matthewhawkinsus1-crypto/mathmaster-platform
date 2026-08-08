import { finalizeSecureExam, recordSecureExamIntegrityEvent, submitSecureExamResponse } from '../../services/secureExamService.js';

export const EXAM_RUNTIME_STATES = Object.freeze({
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  LOCKED_INTEGRITY: 'locked_integrity',
  LOCKED_PROCTOR: 'locked_proctor',
  TIME_EXPIRED: 'time_expired',
  SUBMITTED: 'submitted',
  FORCE_SUBMITTED: 'force_submitted',
});

export class ExamRuntimeController {
  constructor({ examSessionId, initialState = EXAM_RUNTIME_STATES.NOT_STARTED, onStateChange = null }) {
    this.examSessionId = examSessionId;
    this.state = initialState;
    this.onStateChange = onStateChange;
  }
  setState(state) { this.state = state; this.onStateChange?.(state); return state; }
  async recordIntegrityEvent(event) {
    const result = await recordSecureExamIntegrityEvent({ examSessionId: this.examSessionId, ...event });
    if (result.status) this.setState(result.status);
    return result;
  }
  async saveResponse(payload) {
    const result = await submitSecureExamResponse({ examSessionId: this.examSessionId, ...payload });
    if (result.session?.status) this.setState(result.session.status);
    return result;
  }
  async finalize(reason = 'studentSubmit') {
    const result = await finalizeSecureExam({ examSessionId: this.examSessionId, reason });
    if (result.session?.status) this.setState(result.session.status);
    return result;
  }
}

export default ExamRuntimeController;
