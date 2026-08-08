import { normalizeStudentSupportProfile } from './supportProfileResolver.js';

/*
 * Phase 4 — the artifact a case manager brings to an ARD / 504 annual review.
 *
 * It answers "was this accommodation actually delivered?" with counts rather
 * than assertions, and separates modified-curriculum students so their scores
 * are never silently averaged into grade-level mastery reporting.
 */

export const generateStudentSupportAuditReport = ({ studentProfile, evidenceEvents = [] } = {}) => {
  const profile = normalizeStudentSupportProfile(studentProfile);

  const accommodationsSummary = {};
  Object.entries(profile.accommodations).forEach(([key, value]) => {
    // Numeric accommodations (time multiplier, extra attempts) are settings
    // rather than events, so they are reported separately below.
    const isToggle = typeof value === 'boolean';
    if (isToggle && value) {
      accommodationsSummary[key] = { authorized: true, timesPresented: 0, timesUsed: 0, usageRatePercentage: 0 };
    }
  });

  let unauthorizedDeliveries = 0;

  evidenceEvents.forEach((event) => {
    const telemetry = event?.supportTelemetry?.supportEvents || event?.supportTelemetry || [];
    (Array.isArray(telemetry) ? telemetry : []).forEach((item) => {
      const entry = accommodationsSummary[item?.supportType];
      if (!entry) {
        // A support delivered that the profile does not authorize is itself an
        // audit finding, so it is counted rather than ignored.
        if (item?.supportType) unauthorizedDeliveries += 1;
        return;
      }
      if (item.stage === 'presented') entry.timesPresented += 1;
      if (item.stage === 'used') entry.timesUsed += 1;
    });
  });

  Object.values(accommodationsSummary).forEach((entry) => {
    entry.usageRatePercentage = entry.timesPresented > 0
      ? Math.round((entry.timesUsed / entry.timesPresented) * 100)
      : 0;
  });

  const neverDelivered = Object.entries(accommodationsSummary)
    .filter(([, entry]) => entry.timesPresented === 0)
    .map(([key]) => key);

  return {
    studentId: profile.studentId,
    generatedAt: new Date().toISOString(),
    eligibility: profile.programEligibility,
    totalAssignedActivities: evidenceEvents.length,
    accommodationsSummary,
    pacingAccommodations: {
      extendedTimeMultiplier: profile.accommodations.extendedTimeMultiplier,
      extraAttempts: profile.accommodations.extraAttempts,
    },
    modifiedCurriculum: {
      isModified: profile.modification.isModifiedCurriculum,
      modifiedTeksCode: profile.modification.modifiedTeksCode,
      maxDokCap: profile.modification.maxDokCap,
      note: profile.modification.isModifiedCurriculum
        ? 'Scores are reported against modified expectations and are excluded from grade-level mastery aggregation.'
        : 'Student is held to full grade-level expectations; accommodations change access only.',
    },
    // The two fields a compliance reviewer looks at first.
    complianceFlags: {
      authorizedButNeverDelivered: neverDelivered,
      deliveredWithoutAuthorization: unauthorizedDeliveries,
    },
  };
};
