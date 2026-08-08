export class AttemptContext {
  constructor(attemptNumber = 1, initialAssistance = {}) {
    this.attemptNumber = Math.max(1, Number(attemptNumber) || 1);
    this.instructionalAssistance = {
      hintUsed: false,
      teacherAssisted: false,
      scaffoldUsed: false,
      contextScaffoldUsed: false,
      remediationUsed: false,
      workedExampleUsed: false,
      calculatorUsed: false,
      ...initialAssistance,
    };
  }

  mark(type, used = true) {
    if (!Object.prototype.hasOwnProperty.call(this.instructionalAssistance, type)) {
      throw new Error(`Unknown assistance type: ${type}.`);
    }
    this.instructionalAssistance[type] = Boolean(used);
    return this;
  }

  exportState() {
    const assistance = { ...this.instructionalAssistance };
    const mathematicalHelpUsed = assistance.hintUsed
      || assistance.teacherAssisted
      || assistance.scaffoldUsed
      || assistance.remediationUsed
      || assistance.workedExampleUsed;
    return {
      attemptNumber: this.attemptNumber,
      firstAttempt: this.attemptNumber === 1,
      isMathematicallyIndependent: !mathematicalHelpUsed,
      instructionalAssistance: assistance,
    };
  }
}

export default AttemptContext;
