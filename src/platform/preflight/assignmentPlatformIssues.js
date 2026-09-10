import { RUNTIME_REPAIR_KEYS } from '../assignments/assignmentRuntimeRepair.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');

const cloneJson = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

export const platformIssueKey = (issue = {}) => [
  normalizedText(issue?.questionId),
  normalizedText(issue?.suspectedComponent),
  normalizedText(issue?.reason),
].join('::');

const runtimeVersionOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const version = Number(value);
  return Number.isFinite(version) ? version : null;
};

const normalizeExistingIssue = (issue = {}) => ({
  questionId: clean(issue?.questionId) || null,
  classification: 'platformIssue',
  suspectedComponent: clean(issue?.suspectedComponent) || 'MathMaster platform',
  reason: clean(issue?.reason) || 'A platform issue was reported for this question.',
  repairKey: clean(issue?.repairKey) || null,
  status: clean(issue?.status) || 'open',
  reportedAt: clean(issue?.reportedAt) || null,
  resolvedRepairKey: clean(issue?.resolvedRepairKey) || null,
  // Number(null) is 0, and 0 is finite — so coercing first turned "never
  // resolved" into "resolved at runtime version 0" on every round trip through
  // a merge. An issue that has not been resolved has no version, and the
  // difference decides whether a teacher still sees the report.
  resolvedRuntimeVersion: runtimeVersionOrNull(issue?.resolvedRuntimeVersion),
});

export const normalizeReportedPlatformIssue = (
  issue = {},
  { nowIso = new Date().toISOString() } = {},
) => ({
  ...normalizeExistingIssue(issue),
  status: 'open',
  reportedAt: clean(issue?.reportedAt) || String(nowIso || new Date().toISOString()),
  resolvedRepairKey: null,
  resolvedRuntimeVersion: null,
});

/** Merge report-only AI findings without touching assignment content or revision. */
export const mergeAssignmentPlatformIssues = (
  existingIssues = [],
  incomingIssues = [],
  { nowIso = new Date().toISOString() } = {},
) => {
  const merged = asArray(existingIssues).map(normalizeExistingIssue);
  const byKey = new Map(merged.map((issue, index) => [platformIssueKey(issue), index]));

  asArray(incomingIssues).forEach((rawIssue) => {
    const incoming = normalizeReportedPlatformIssue(rawIssue, { nowIso });
    const key = platformIssueKey(incoming);
    if (!key.replace(/:/g, '')) return;
    const existingIndex = byKey.get(key);
    if (existingIndex == null) {
      byKey.set(key, merged.length);
      merged.push(incoming);
      return;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      // A newer report can supply the exact repair key once the platform has
      // learned it, but it never erases the first report timestamp or a
      // resolved state that already has stronger evidence.
      repairKey: existing.repairKey || incoming.repairKey,
      reportedAt: existing.reportedAt || incoming.reportedAt,
    };
  });

  return cloneJson(merged);
};

const issueMatchesRegisteredRepair = (issue = {}, repairKey = '') => {
  const explicit = clean(issue?.repairKey);
  if (explicit) return explicit === clean(repairKey);

  // External repair AIs know the affected question/component, but they should
  // not be expected to invent MathMaster's private repair-key strings. For a
  // report with no key, match only a narrow semantic signature owned by that
  // registered repair. This is metadata resolution only; it never changes the
  // question. An unrelated grading/rendering complaint therefore remains open.
  const component = normalizedText(issue?.suspectedComponent);
  const reason = normalizedText(issue?.reason);
  const combined = `${component} ${reason}`;

  if (repairKey === RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH) {
    return component.includes('functionmodeling') && combined.includes('graph');
  }
  if (repairKey === RUNTIME_REPAIR_KEYS.ACTIVE_WORKFLOW_TASK) {
    return combined.includes('your task') && (combined.includes('workflow') || combined.includes('stage'));
  }
  if (repairKey === RUNTIME_REPAIR_KEYS.AUTHORED_GRAPH_PERSISTENCE) {
    return combined.includes('graph')
      && (combined.includes('disappear') || combined.includes('persist') || combined.includes('visible'));
  }
  if (repairKey === RUNTIME_REPAIR_KEYS.COLLAPSED_WORKFLOW) {
    return combined.includes('workflow')
      && (combined.includes('collapse') || combined.includes('y=x') || combined.includes('free plot'));
  }
  return false;
};

/**
 * Resolve only when a runtime repair manifest proves the exact question and a
 * matching registered repair. A runtime version by itself is intentionally
 * insufficient: otherwise every old report would disappear after any unrelated
 * deployment. AI reports may omit MathMaster's internal repair-key string, but
 * then the component/reason must match the registered repair's narrow signature.
 */
export const resolveAssignmentPlatformIssues = (issues = [], repairManifest = []) => (
  asArray(issues).map((rawIssue) => {
    const issue = normalizeExistingIssue(rawIssue);
    if (issue.status === 'resolvedByPlatformUpdate') return issue;
    if (!issue.questionId) return issue;

    const match = asArray(repairManifest).find((entry) => (
      clean(entry?.questionId) === issue.questionId
      && issueMatchesRegisteredRepair(issue, clean(entry?.repairKey))
      && Number.isFinite(Number(entry?.runtimeVersion))
      && Number(entry.runtimeVersion) >= 1
    ));
    if (!match) return issue;

    return {
      ...issue,
      status: 'resolvedByPlatformUpdate',
      resolvedRepairKey: clean(match.repairKey),
      resolvedRuntimeVersion: Number(match.runtimeVersion),
    };
  })
);

export default {
  mergeAssignmentPlatformIssues,
  normalizeReportedPlatformIssue,
  platformIssueKey,
  resolveAssignmentPlatformIssues,
};
