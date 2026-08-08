// Server-side course/readiness policy for secure My Math Path question choice.
// Course rigor belongs to the class; readiness is recalculated from evidence.

function normalizeCourseLevel(value) {
  return String(value || "").trim().toLowerCase() === "honors" ? "honors" : "standard";
}

function evidenceReadiness(profile = {}) {
  const estimate = Number(profile?.mastery?.estimate ?? profile?.score ?? 0);
  const status = String(profile?.mastery?.status || profile?.performance?.key || "");
  const confidence = String(profile?.mastery?.confidence || profile?.confidence || "Low");
  const evidenceCount = Number(profile?.dimensions?.eligibleGradeLevelEvents ?? profile?.itemCount ?? 0);
  const advanced = status === "Mastered"
    || status === "masters"
    || (estimate >= 88 && confidence !== "Low" && evidenceCount >= 4);
  const developing = ["Needs Attention", "Developing", "didNotMeet", "approaches"].includes(status)
    || (estimate > 0 && estimate < 70);
  return advanced ? "advanced" : developing ? "developing" : "onTrack";
}

function resolveAdaptiveRigor({ courseLevel = "standard", profile = {} } = {}) {
  const level = normalizeCourseLevel(courseLevel);
  const readiness = evidenceReadiness(profile);
  if (level === "honors" && readiness === "developing") {
    return { courseLevel: level, readiness, mode: "honorsRepair", preferredDifficultyBand: 2, returnTargetBand: 4 };
  }
  if (level === "honors" && readiness === "advanced") {
    return { courseLevel: level, readiness, mode: "honorsExtension", preferredDifficultyBand: 5, returnTargetBand: 5 };
  }
  if (level === "honors") {
    return { courseLevel: level, readiness, mode: "honors", preferredDifficultyBand: 4, returnTargetBand: 4 };
  }
  if (readiness === "advanced") {
    return { courseLevel: level, readiness, mode: "individualEnrichment", preferredDifficultyBand: 4, returnTargetBand: 4 };
  }
  if (readiness === "developing") {
    return { courseLevel: level, readiness, mode: "repair", preferredDifficultyBand: 2, returnTargetBand: 3 };
  }
  return { courseLevel: level, readiness, mode: "standard", preferredDifficultyBand: 3, returnTargetBand: 3 };
}

function nearestDifficultyCandidates(candidates = [], preferredBand = 3) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const distance = (question) => Math.abs((Number(question?.difficultyBand) || 3) - preferredBand);
  const bestDistance = Math.min(...candidates.map(distance));
  return candidates.filter((question) => distance(question) === bestDistance);
}

module.exports = {
  evidenceReadiness,
  nearestDifficultyCandidates,
  normalizeCourseLevel,
  resolveAdaptiveRigor,
};
