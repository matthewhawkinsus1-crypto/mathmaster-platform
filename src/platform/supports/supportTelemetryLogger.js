/*
 * Phase 4 — support-usage telemetry.
 *
 * District IEP/504 audits ask two different questions, and answering only the
 * first is what gets a district written up:
 *   1. Was the accommodation OFFERED every time it should have been?
 *   2. Did the student actually USE it?
 *
 * So every support records both a `presented` and (if the student engages) a
 * `used` event. A support that is presented and never used is not a compliance
 * failure — it is evidence the student declined it, which is exactly what an
 * ARD committee needs to see.
 */

export class SupportTelemetryLogger {
  constructor(studentId, activityId, questionInstanceId) {
    this.studentId = studentId;
    this.activityId = activityId;
    this.questionInstanceId = questionInstanceId;
    this.events = [];
  }

  /** Stages 1-2: the support was authorized for this student and offered here. */
  logPresented(supportType, details = {}) {
    if (!supportType) return;
    this.events.push({
      stage: 'presented',
      supportType,
      timestamp: Date.now(),
      details,
    });
  }

  /** Stages 3-4: the student actively invoked the support. */
  logUsed(supportType, interactionDetails = {}) {
    if (!supportType) return;
    this.events.push({
      stage: 'used',
      supportType,
      timestamp: Date.now(),
      interactionDetails,
    });
  }

  /** Presents every applicable support from resolveActiveSupports() at once. */
  logAllPresented(applicableSupports = []) {
    applicableSupports.forEach((support) => {
      this.logPresented(support.type, { ...support, type: undefined });
    });
  }

  /** Payload for embedding in the question's EvidenceEvent. */
  exportTelemetry() {
    return {
      studentId: this.studentId,
      activityId: this.activityId,
      questionInstanceId: this.questionInstanceId,
      supportEvents: this.events,
      totalSupportsPresented: this.events.filter((event) => event.stage === 'presented').length,
      totalSupportsUsed: this.events.filter((event) => event.stage === 'used').length,
    };
  }
}
