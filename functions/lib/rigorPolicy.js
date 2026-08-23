// Server-side course/readiness policy for secure My Math Path question choice.
// Course rigor belongs to the class; readiness is recalculated from evidence.
//
// TWO THINGS THIS POLICY GOT WRONG, both found by auditing the actual content.
//
// 1. IT ASKED FOR A DIFFICULTY THAT DOES NOT EXIST. `honorsExtension` requested
//    band 5, and NOTHING in the 5,186-template bank is authored above band 4.
//    Selection degrades to the nearest band so no session broke, but the policy
//    was reaching past the end of the content on every extension session, and
//    the "preferred" band it reported to teachers was one nobody could serve.
//
// 2. IT NEVER EXPRESSED A COGNITIVE DEMAND. Difficulty and DOK are tracked as
//    independent axes everywhere else in the platform, and then the one place
//    that chooses a student's actual question considered only difficulty. A
//    student who had earned deeper thinking got the same complexity with
//    whatever demand happened to be attached to the family that won.
//
// The DOK preference is decided HERE, on the server, from server-authoritative
// evidence — never sent up from the browser. A client that could name its own
// difficulty could name band 1 forever.

// What the content actually authors. Pinned to the bank by
// tests/platform/authoredCeiling.test.mjs, which fails in both directions.
const MAX_AUTHORED_BAND = 4;
const MAX_AUTHORED_DOK = 3;

const clampBand = (band) => Math.max(1, Math.min(MAX_AUTHORED_BAND, band));

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
  // A student being REPAIRED gets steady demand while the complexity comes
  // down. Moving both axes at once makes the next result uninterpretable —
  // you cannot tell which change the student responded to.
  const rigor = (mode, band, returnBand, dok) => ({
    courseLevel: level,
    readiness,
    mode,
    preferredDifficultyBand: clampBand(band),
    returnTargetBand: clampBand(returnBand),
    preferredDok: Math.max(1, Math.min(MAX_AUTHORED_DOK, dok)),
  });

  if (level === "honors" && readiness === "developing") {
    return rigor("honorsRepair", 2, 4, 2);
  }
  if (level === "honors" && readiness === "advanced") {
    // Was band 5, which does not exist. An Honors student already at the
    // authored ceiling is stretched by DEPTH instead — which is what the
    // recommendation engine concluded independently for the same case.
    return rigor("honorsExtension", MAX_AUTHORED_BAND, MAX_AUTHORED_BAND, 3);
  }
  if (level === "honors") {
    return rigor("honors", 4, 4, 3);
  }
  if (readiness === "advanced") {
    return rigor("individualEnrichment", 4, 4, 3);
  }
  if (readiness === "developing") {
    return rigor("repair", 2, 3, 2);
  }
  return rigor("standard", 3, 3, 2);
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
