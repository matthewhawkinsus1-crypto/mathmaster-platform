const MATH_SUPPORT_FLAGS = [
  'hintUsed',
  'teacherAssisted',
  'scaffoldUsed',
  'remediationUsed',
  'workedExampleUsed',
];

export const classifyAttemptEvidence = (event = {}) => {
  const usage = event.supportUsage || event.performance?.supportUsage || {};
  const telemetry = Array.isArray(event.supportTelemetry) ? event.supportTelemetry : [];
  const telemetryMathHelp = telemetry.some((entry) => (
    entry?.stage === 'used'
    && entry?.reducesMathematicalIndependence !== false
    && ['hint', 'teacherAssistance', 'mathScaffold', 'remediation', 'workedExample'].includes(entry?.supportType)
  ));
  const mathHelpUsed = usage.isMathematicallyIndependent === false
    || MATH_SUPPORT_FLAGS.some((key) => Boolean(usage[key]))
    || telemetryMathHelp;
  const modified = Boolean(usage.modified)
    || (Array.isArray(usage.modifications) && usage.modifications.length > 0);
  const attemptNumber = Math.max(1, Number(event.performance?.attemptNumber ?? event.attemptNumber) || 1);

  if (modified) return { key: 'modified', label: 'Modified evidence', isIndependent: false };
  if (mathHelpUsed) return { key: 'supported', label: 'Supported attempt', isIndependent: false };
  if (attemptNumber === 1) return { key: 'independentFirstAttempt', label: 'Independent first attempt', isIndependent: true };
  return { key: 'independentRetry', label: 'Independent retry', isIndependent: true };
};
