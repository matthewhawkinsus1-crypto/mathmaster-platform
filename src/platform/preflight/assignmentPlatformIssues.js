const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');

const cloneJson = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

export const platformIssueKey = (issue = {}) => [
  normalizedText(issue?.questionId),
  normalizedText(issue?.suspectedComponent),
  normalizedText(issue?.reason),
].join('::');

const normalizeExistingIssue = (issue = {}) => ({
  questionId: clean(issue?.questionId) || null,
  classification: 'platformIssue',
  suspectedComponent: clean(issue?.suspectedComponent) || 'MathMaster platform',
  reason: clean(issue?.reason) || 'A platform issue was reported for this question.',
  repairKey: clean(issue?.repairKey) || null,
  status: clean(issue?.status) || 'open',
  reportedAt: clean(issue?.reportedAt) || null,
  resolvedRepairKey: clean(issue?.resolvedRepairKey) || null,
  resolvedRuntimeVersion: Number.isFinite(Number(issue?.resolvedRuntimeVersion))
    ? Number(issue.resolvedRuntimeVersion)
    : null,
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

/**
 * Resolve only when a runtime repair manifest proves the exact question and
 * exact repair key. A runtime version by itself is intentionally insufficient:
 * otherwise every old report would disappear after any unrelated deployment.
 */
export const resolveAssignmentPlatformIssues = (issues = [], repairManifest = []) => (
  asArray(issues).map((rawIssue) => {
    const issue = normalizeExistingIssue(rawIssue);
    if (issue.status === 'resolvedByPlatformUpdate') return issue;
    if (!issue.questionId || !issue.repairKey) return issue;

    const match = asArray(repairManifest).find((entry) => (
      clean(entry?.questionId) === issue.questionId
      && clean(entry?.repairKey) === issue.repairKey
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
