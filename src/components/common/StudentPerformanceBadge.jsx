import React from 'react';
import {
  BASELINE, ENGAGEMENT, INSTRUCTIONAL_BAND, PERFORMANCE_PROJECTION,
} from '../../platform/profile/studentLearningProfile.js';

// ONE badge. Used on the roster, the class monitor, the analytics table, the
// simulator and the student profile view.
//
// WHY THIS FILE EXISTS. The repository already carried four independently
// written tables mapping the same mastery statuses to the same labels and
// colours, and two same-named `resolveAdaptiveRigor` functions with different
// return shapes. The visible consequence was that a student could read as
// "Developing" on one screen and "Needs Attention" on another in the same
// minute, and a teacher had no way to tell which was right. There is now one
// derived profile, and this is its one rendering.
//
// It renders exactly what the profile asserts and never re-derives anything.
// If a label looks wrong, the profile is wrong, and there is a single place to
// go and fix it.

const BAND_TONE = {
  [INSTRUCTIONAL_BAND.BELOW]: { bg: '#fdf1ec', fg: '#9a3412', border: '#f6d4c4' },
  [INSTRUCTIONAL_BAND.ON]: { bg: '#eef3fb', fg: '#174ea6', border: '#c9daf8' },
  [INSTRUCTIONAL_BAND.ABOVE]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
  [BASELINE]: { bg: '#f3f4f6', fg: '#4b5563', border: '#dcdfe4' },
};

const PROJECTION_TONE = {
  [PERFORMANCE_PROJECTION.DID_NOT_MEET]: { bg: '#fdecec', fg: '#9f1239', border: '#f6cdcd' },
  [PERFORMANCE_PROJECTION.APPROACHES]: { bg: '#fdf6e3', fg: '#854d0e', border: '#f0e0b4' },
  [PERFORMANCE_PROJECTION.MEETS]: { bg: '#eef3fb', fg: '#174ea6', border: '#c9daf8' },
  [PERFORMANCE_PROJECTION.MASTERS]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
  [BASELINE]: { bg: '#f3f4f6', fg: '#4b5563', border: '#dcdfe4' },
};

// Engagement is deliberately a DIFFERENT visual family. A student can be Above
// Level and Needs Follow-Up at the same time, and the two facts must not be
// legible as one combined verdict.
const ENGAGEMENT_TONE = {
  [ENGAGEMENT.ON_TRACK]: { bg: '#fff', fg: '#3c4043', border: '#dcdfe4' },
  [ENGAGEMENT.INCONSISTENT]: { bg: '#fff', fg: '#854d0e', border: '#f0e0b4' },
  [ENGAGEMENT.NEEDS_FOLLOW_UP]: { bg: '#fff', fg: '#9f1239', border: '#f6cdcd' },
};

const chip = (tone, size) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: size === 'small' ? '2px 8px' : '4px 10px',
  borderRadius: 999,
  fontSize: size === 'small' ? 10.5 : 11.5,
  fontWeight: 900,
  letterSpacing: '.02em',
  lineHeight: 1.55,
  whiteSpace: 'nowrap',
  background: tone.bg,
  color: tone.fg,
  border: `1px solid ${tone.border}`,
});

/**
 * The badge.
 *
 * `profile` is a Student Learning Profile. Anything else — a raw mastery
 * number, a status string, a percentage — is deliberately NOT accepted: taking
 * one would recreate the second opinion this component exists to eliminate.
 */
export default function StudentPerformanceBadge({
  profile,
  size = 'normal',
  showEngagement = true,
  onClick = null,
  studentName = null,
}) {
  if (!profile) {
    return (
      <span style={chip(BAND_TONE[BASELINE], size)} title="No profile has been built for this student yet.">
        Establishing Baseline
      </span>
    );
  }

  const band = profile.instructionalBand;
  const projection = profile.performanceProjection;
  const established = Boolean(profile.baseline?.established);

  // BEFORE BASELINE, NOTHING IS ASSERTED. Four questions is not a judgement
  // about a child, and a provisional label shown once becomes the label a
  // teacher remembers.
  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={chip(BAND_TONE[band] || BAND_TONE[BASELINE], size)}>
        {profile.instructionalBandLabel}
      </span>
      {established && (
        <span style={chip(PROJECTION_TONE[projection] || PROJECTION_TONE[BASELINE], size)}>
          {profile.performanceProjectionLabel}
        </span>
      )}
      {showEngagement && profile.engagementLabel && profile.engagement !== ENGAGEMENT.ON_TRACK && (
        <span style={chip(ENGAGEMENT_TONE[profile.engagement] || ENGAGEMENT_TONE[ENGAGEMENT.ON_TRACK], size)}>
          {profile.engagementLabel}
        </span>
      )}
    </span>
  );

  if (!established) {
    return (
      <span title={`${profile.baseline?.events || 0} of ${profile.baseline?.requirement?.events || 12} pieces of evidence so far. MathMaster does not classify a student before it has enough to be right.`}>
        {content}
      </span>
    );
  }

  if (!onClick) return content;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={studentName ? `Open the learning profile for ${studentName}` : 'Open this learning profile'}
      style={{
        appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
        border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
      }}
    >
      {content}
    </button>
  );
}
