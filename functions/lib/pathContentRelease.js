"use strict";

const RELEASE_CHANGE_REASON = "ccmr-content-release-changed";
const RELEASE_UPDATE_REASON = "ccmr-content-release-updating";

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function recordFramework(record = {}) {
  return clean(record?.assessmentContext?.framework);
}

function cleanReleaseMap(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([framework, release]) => [clean(framework), clean(release)])
    .filter(([framework, release]) => framework && release));
}

function resolveAssessmentContentRelease(records = [], frameworkValue = null) {
  const framework = clean(frameworkValue);
  if (!framework) {
    return { framework: null, tracked: false, release: null, matchingFamilies: 0 };
  }

  const matching = (Array.isArray(records) ? records : [])
    .filter((record) => record?.active !== false)
    .filter((record) => recordFramework(record) === framework);

  if (!matching.length) {
    return { framework, tracked: false, release: null, matchingFamilies: 0 };
  }

  const marked = matching
    .map((record) => clean(record?.ccmrContentRelease))
    .filter(Boolean);
  const releases = [...new Set(marked)];

  if (!releases.length) {
    return { framework, tracked: false, release: null, matchingFamilies: matching.length };
  }

  if (marked.length !== matching.length) {
    throw new Error(`${framework} assessment families are partially release-marked; refusing to mix tracked and untracked content.`);
  }
  if (releases.length !== 1) {
    throw new Error(`${framework} assessment families contain mixed content release values: ${releases.join(", ")}.`);
  }

  return {
    framework,
    tracked: true,
    release: releases[0],
    matchingFamilies: matching.length,
  };
}

function resolveManifestAssessmentContentRelease(manifest = null, frameworkValue = null) {
  const framework = clean(frameworkValue);
  if (!framework) {
    return {
      framework: null,
      authoritative: false,
      tracked: false,
      available: true,
      release: null,
      pendingRelease: null,
      reason: null,
    };
  }

  const activeReleases = cleanReleaseMap(manifest?.activeReleases);
  const pendingReleases = cleanReleaseMap(manifest?.pendingReleases);
  const activeRelease = activeReleases[framework] || null;
  const pendingRelease = pendingReleases[framework] || null;
  const authoritative = Boolean(activeRelease || pendingRelease);
  if (!authoritative) {
    return {
      framework,
      authoritative: false,
      tracked: false,
      available: true,
      release: null,
      pendingRelease: null,
      reason: null,
    };
  }

  const status = clean(manifest?.status) || "active";
  if (status === "updating") {
    return {
      framework,
      authoritative: true,
      tracked: true,
      available: false,
      release: activeRelease || pendingRelease,
      pendingRelease,
      reason: RELEASE_UPDATE_REASON,
    };
  }
  if (status !== "active") {
    throw new Error(`Assessment content release manifest has unsupported status ${status}.`);
  }
  if (!activeRelease) {
    throw new Error(`${framework} is tracked by the assessment release manifest but has no active release.`);
  }

  return {
    framework,
    authoritative: true,
    tracked: true,
    available: true,
    release: activeRelease,
    pendingRelease: null,
    reason: null,
  };
}

function resolveAssessmentContentReleaseAuthority(records = [], frameworkValue = null, manifest = null) {
  const manifestState = resolveManifestAssessmentContentRelease(manifest, frameworkValue);
  if (manifestState.authoritative) return manifestState;
  const legacy = resolveAssessmentContentRelease(records, frameworkValue);
  return {
    ...legacy,
    authoritative: false,
    available: true,
    pendingRelease: null,
    reason: null,
  };
}

function collectAssessmentContentReleases(records = []) {
  const active = (Array.isArray(records) ? records : []).filter((record) => record?.active !== false);
  const frameworks = [...new Set(active.map(recordFramework).filter(Boolean))].sort();
  const releases = {};
  for (const framework of frameworks) {
    const state = resolveAssessmentContentRelease(active, framework);
    if (state.tracked) releases[framework] = state.release;
  }
  return releases;
}

function finiteTimestamp(value, label) {
  const now = Number(value);
  if (!Number.isFinite(now)) throw new Error(`A finite ${label} timestamp is required.`);
  return now;
}

function beginAssessmentContentReleaseUpdate(manifest = {}, pendingReleaseValue = {}, nowValue = Date.now()) {
  const pendingReleases = cleanReleaseMap(pendingReleaseValue);
  if (!Object.keys(pendingReleases).length) throw new Error("At least one pending assessment content release is required.");
  const now = finiteTimestamp(nowValue, "release update");
  return {
    ...manifest,
    schemaVersion: 1,
    status: "updating",
    activeReleases: cleanReleaseMap(manifest?.activeReleases),
    pendingReleases,
    updateStartedAt: now,
    updatedAt: now,
  };
}

function completeAssessmentContentReleaseUpdate(manifest = {}, activeReleaseValue = null, nowValue = Date.now()) {
  const activeReleases = cleanReleaseMap(activeReleaseValue || manifest?.pendingReleases);
  if (!Object.keys(activeReleases).length) throw new Error("At least one active assessment content release is required.");
  const now = finiteTimestamp(nowValue, "release activation");
  return {
    ...manifest,
    schemaVersion: 1,
    status: "active",
    activeReleases,
    pendingReleases: {},
    activatedAt: now,
    updatedAt: now,
  };
}

function assessSessionContentRelease(session = {}, current = {}) {
  const framework = clean(session?.assessmentFramework);
  const tracked = Boolean(framework && current?.tracked && clean(current?.release));
  if (!tracked) {
    return {
      tracked: false,
      stale: false,
      currentRelease: null,
      sessionRelease: null,
      reason: null,
    };
  }

  const currentRelease = clean(current.release);
  const sessionRelease = clean(session?.assessmentContentRelease);
  const stale = sessionRelease !== currentRelease;
  return {
    tracked: true,
    stale,
    currentRelease,
    sessionRelease,
    reason: stale ? RELEASE_CHANGE_REASON : null,
  };
}

function planSessionContentReleaseAction(session = {}, current = {}) {
  if (current?.tracked && current?.available === false) {
    return {
      action: session?.currentQuestion ? "finish-open-question" : "hold-release-update",
      tracked: true,
      stale: false,
      currentRelease: clean(current?.release),
      reason: clean(current?.reason) || RELEASE_UPDATE_REASON,
    };
  }

  const state = assessSessionContentRelease(session, current);
  if (!state.tracked || !state.stale) {
    return {
      action: "continue",
      tracked: state.tracked,
      stale: state.stale,
      currentRelease: state.currentRelease,
      reason: state.reason,
    };
  }

  return {
    action: session?.currentQuestion ? "finish-open-question" : "supersede",
    tracked: true,
    stale: true,
    currentRelease: state.currentRelease,
    reason: state.reason,
  };
}

function supersedeSessionForContentRelease(session = {}, currentReleaseValue, nowValue = Date.now()) {
  if (session?.currentQuestion) {
    throw new Error("Cannot supersede a session while it has an open current question.");
  }
  const currentRelease = clean(currentReleaseValue);
  if (!currentRelease) throw new Error("A current assessment content release is required to supersede a session.");
  const now = Number(nowValue);
  if (!Number.isFinite(now)) throw new Error("A finite superseded timestamp is required.");

  return {
    ...session,
    status: "superseded",
    supersededReason: RELEASE_CHANGE_REASON,
    supersededAt: now,
    supersededByContentRelease: currentRelease,
    updatedAt: now,
  };
}

module.exports = {
  RELEASE_CHANGE_REASON,
  RELEASE_UPDATE_REASON,
  resolveAssessmentContentRelease,
  resolveManifestAssessmentContentRelease,
  resolveAssessmentContentReleaseAuthority,
  collectAssessmentContentReleases,
  beginAssessmentContentReleaseUpdate,
  completeAssessmentContentReleaseUpdate,
  assessSessionContentRelease,
  planSessionContentReleaseAction,
  supersedeSessionForContentRelease,
};
