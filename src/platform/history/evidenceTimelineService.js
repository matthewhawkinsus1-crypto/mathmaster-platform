import { classifyAttemptEvidence } from '../mastery/evidenceClassification.js';
import { getEffectiveActivityPolicy } from '../policies/activityPolicies.js';
import { sameTeks, uniqueDisplayTeks } from '../../utils/teksUtils.js';

const toMillis = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const telemetryTypes = (event, stage) => {
  const fromTelemetry = (Array.isArray(event.supportTelemetry) ? event.supportTelemetry : [])
    .filter((entry) => entry?.stage === stage)
    .map((entry) => entry?.supportType)
    .filter(Boolean);
  if (fromTelemetry.length) return [...new Set(fromTelemetry)];
  if (stage === 'presented') {
    return [...new Set([
      ...(event.supportUsage?.accommodations || []),
      ...(event.supportUsage?.modifications || []).map((item) => `modification:${item}`),
    ])];
  }
  const mapping = [
    ['hintUsed', 'hint'],
    ['teacherAssisted', 'teacherAssistance'],
    ['scaffoldUsed', 'mathScaffold'],
    ['contextScaffoldUsed', 'contextScaffold'],
    ['remediationUsed', 'remediation'],
    ['workedExampleUsed', 'workedExample'],
    ['calculatorUsed', 'calculator'],
  ];
  return mapping.filter(([key]) => event.supportUsage?.[key]).map(([, label]) => label);
};

const displayKeysForEvent = (event) => uniqueDisplayTeks(
  event.masteryEvidenceKeys?.length ? event.masteryEvidenceKeys : event.alignmentKeys || [],
);

export const buildStudentEvidenceTimeline = (evidenceEvents = [], targetTeksFilter = null) => {
  const filteredEvents = targetTeksFilter
    ? evidenceEvents.filter((event) => displayKeysForEvent(event).some((code) => sameTeks(code, targetTeksFilter)))
    : evidenceEvents;

  const timeline = [...filteredEvents]
    .sort((left, right) => toMillis(right.occurredAt) - toMillis(left.occurredAt))
    .map((event) => {
      const questionSnapshot = event.questionSnapshot || event.question || {};
      const activityRole = event.source?.activityRole || event.activityRole || 'practice';
      const policy = getEffectiveActivityPolicy(activityRole);
      const timestamp = toMillis(event.occurredAt);
      const allTeks = displayKeysForEvent(event);
      const score = Number(event.performance?.score ?? event.score ?? 0);
      return {
        eventKey: event.eventKey,
        timestamp,
        dateFormatted: timestamp ? new Date(timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
        }) : 'Unknown time',
        primaryTeks: allTeks[0] || 'Unaligned',
        allTeks,
        questionInstanceId: questionSnapshot.questionInstanceId || event.questionInstanceId || '',
        familyId: questionSnapshot.familyId || event.familyId || '',
        difficultyBand: Number(questionSnapshot.difficultyBand ?? event.difficultyBand) || null,
        dok: Number(questionSnapshot.dok ?? event.dok) || null,
        activityRole,
        activityRoleName: policy.name,
        activitySessionId: event.source?.activitySessionId || event.source?.assignmentId || '',
        score: Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0)),
        isCorrect: Boolean(event.performance?.isCorrect ?? event.isCorrect),
        attemptNumber: Math.max(1, Number(event.performance?.attemptNumber ?? event.attemptNumber) || 1),
        classification: classifyAttemptEvidence(event),
        supportsPresented: telemetryTypes(event, 'presented'),
        supportsUsed: telemetryTypes(event, 'used'),
        rawEvent: event,
      };
    });

  const groupedByDate = {};
  timeline.forEach((item) => {
    const dateKey = item.timestamp
      ? new Date(item.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'Unknown date';
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(item);
  });

  return {
    totalEvents: timeline.length,
    correctEvents: timeline.filter((item) => item.isCorrect).length,
    independentEvents: timeline.filter((item) => item.classification.isIndependent).length,
    timeline,
    groupedByDate,
  };
};

export const getTimelineTeksOptions = (evidenceEvents = []) => uniqueDisplayTeks(
  evidenceEvents.flatMap((event) => event.masteryEvidenceKeys?.length ? event.masteryEvidenceKeys : event.alignmentKeys || []),
).sort();
