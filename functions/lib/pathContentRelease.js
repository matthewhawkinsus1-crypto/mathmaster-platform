"use strict";

const RELEASE_CHANGE_REASON = "ccmr-content-release-changed";

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function recordFramework(record = {}) {
  return clean(record?.assessmentContext?.framework);
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
  resolveAssessmentContentRelease,
  assessSessionContentRelease,
  supersedeSessionForContentRelease,
};
