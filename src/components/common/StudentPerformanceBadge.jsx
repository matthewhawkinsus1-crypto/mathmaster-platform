import React from 'react';
import {
  BASELINE, ENGAGEMENT, INSTRUCTIONAL_BAND, PERFORMANCE_PROJECTION,
} from '../../platform/profile/studentLearningProfile.js';
import {
  BAND_TONE, ENGAGEMENT_TONE, PROJECTION_TONE, toneChip as chip,
} from '../../platform/profile/performanceTone.js';

// ONE badge, and the only place a student's academic status is rendered.
//
// CURRENTLY MOUNTED ON: the Students roster (rows and Overview), the Student
// Learning Profile view and drawer, the teacher Weekly Path table, the
// Gradebook, the Live Class grid, the class overview, and the analytics groups.
//
// NOT YET MOUNTED ON: the Path simulator and the CCMR views, which still derive
// their own status locally. That is tracked work, not an oversight, and this
// comment says so plainly rather than claiming coverage this component does not
// have — an earlier version of this header listed five screens, four of which
// had never imported it, which is precisely the kind of quiet inaccuracy that
// let four parallel colour tables survive in the first place.
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

// The tone tables live in `platform/profile/performanceTone.js` rather than
// here, because a table cell, a heat-map square and a dashboard chip all need
// the same colour for the same meaning without borrowing this badge's shape —
// and the alternative, which this repository has already lived through, is each
// of them writing its own table.

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
