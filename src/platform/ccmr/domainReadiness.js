// Readiness per assessment domain — the data behind the CCMR wheel.
//
// The course mastery wheel answers "how well do I know the mathematics?".
// This answers a different question: "how well am I transferring that
// mathematics into this assessment's format?". They are not the same, and a
// student can be strong on one and weak on the other — that gap is the single
// most useful thing this screen can show, so it has a state of its own.
//
// One rule governs everything here: no evidence is not zero. A student who has
// never seen an ACT-style item is not 0% ready for the ACT; they are ready to
// try. Rendering that as a percentage would be a lie told in a chart.
//
// Domains come from the assessment registry via the profile. This file never
// invents a domain or a weight.

import { READINESS } from './assessmentPathways.js';
import { getAssessmentProfile } from './assessmentProfiles.js';

export const DOMAIN_STATE = Object.freeze({
  NO_ALIGNMENT: 'no_alignment',
  PREREQUISITE_NEEDED: 'prerequisite_needed',
  TRANSFER_GAP: 'transfer_gap',
  RECOMMENDED: 'recommended',
  READY_NOT_PRACTISED: 'ready_not_practised',
  DEVELOPING: 'developing',
  STRONG: 'strong',
});

export const DOMAIN_STATE_PRESENTATION = Object.freeze({
  [DOMAIN_STATE.NO_ALIGNMENT]: { label: 'No alignment yet', color: '#dadce0', text: '#5f6368' },
  [DOMAIN_STATE.PREREQUISITE_NEEDED]: { label: 'Math prerequisite needed', color: '#f9ab00', text: '#7a4f00' },
  [DOMAIN_STATE.TRANSFER_GAP]: { label: 'Transfer gap', color: '#d93025', text: '#a50e0e' },
  [DOMAIN_STATE.RECOMMENDED]: { label: 'Recommended', color: '#1a73e8', text: '#174ea6' },
  [DOMAIN_STATE.READY_NOT_PRACTISED]: { label: 'Ready — not yet practised', color: '#9aa0a6', text: '#3c4043' },
  [DOMAIN_STATE.DEVELOPING]: { label: 'Developing', color: '#fbbc04', text: '#7a4f00' },
  [DOMAIN_STATE.STRONG]: { label: 'Strong', color: '#1e8e3e', text: '#137333' },
});

// A domain counts as strong when most of what has been practised in it is
// strong. Not all of it: one shaky skill among six does not undo the picture.
export const STRONG_SHARE = 0.6;

const practised = (item) => item?.evidenceBasis === 'direct' && item?.assessmentProficiency != null;

const stateFor = (items) => {
  if (!items.length) return DOMAIN_STATE.NO_ALIGNMENT;
  // Everything in this domain is waiting on the mathematics itself. Practising
  // the format would be practising a skill the student cannot yet do.
  if (items.every((item) => item.status === READINESS.STRENGTHEN)) return DOMAIN_STATE.PREREQUISITE_NEEDED;
  if (items.some((item) => item.status === READINESS.TRANSFER_GAP)) return DOMAIN_STATE.TRANSFER_GAP;
  if (items.some((item) => item.status === READINESS.RECOMMENDED)) return DOMAIN_STATE.RECOMMENDED;

  const practisedItems = items.filter(practised);
  if (!practisedItems.length) return DOMAIN_STATE.READY_NOT_PRACTISED;

  const strong = items.filter((item) => item.status === READINESS.STRONG).length;
  return strong / items.length >= STRONG_SHARE ? DOMAIN_STATE.STRONG : DOMAIN_STATE.DEVELOPING;
};

/**
 * Average proficiency across the items that were actually practised, or null.
 *
 * Null is the point. A caller that wants a number must handle its absence,
 * which is what stops "no evidence" from being drawn as 0%.
 */
export const domainProficiency = (items = []) => {
  const practisedItems = items.filter(practised);
  if (!practisedItems.length) return null;
  const total = practisedItems.reduce((sum, item) => sum + item.assessmentProficiency, 0);
  return total / practisedItems.length;
};

/**
 * One entry per domain the framework actually has, in registry order.
 *
 * `recommendations` is exactly what getAssessmentRecommendations returned, so
 * the wheel and the skill list below it are the same data seen two ways.
 */
export const buildDomainReadiness = (recommendations) => {
  const framework = recommendations?.framework;
  const profile = recommendations?.profile || (framework ? getAssessmentProfile(framework) : null);
  if (!profile) return [];

  const byDomain = new Map((recommendations?.byDomain || []).map((group) => [group.domainId, group.items || []]));

  return profile.domains.map((domain) => {
    const items = byDomain.get(domain.id) || [];
    const state = stateFor(items);
    const presentation = DOMAIN_STATE_PRESENTATION[state];
    return {
      domainId: domain.id,
      title: domain.title,
      // The registry's own weighting, so a wheel can show what the assessment
      // actually emphasises rather than treating every domain as equal.
      weight: domain.weight ?? null,
      state,
      label: presentation.label,
      color: presentation.color,
      textColor: presentation.text,
      skillCount: items.length,
      practisedCount: items.filter(practised).length,
      transferGaps: items.filter((item) => item.status === READINESS.TRANSFER_GAP).length,
      proficiency: domainProficiency(items),
      items,
      // A domain with no aligned skill is shown, greyed, rather than hidden:
      // "the SAT tests geometry and you have not met it yet" is information.
      selectable: items.length > 0,
    };
  });
};

/**
 * One sentence about a domain, in the student's terms.
 */
export const explainDomain = (entry) => {
  if (!entry) return '';
  switch (entry.state) {
    case DOMAIN_STATE.NO_ALIGNMENT:
      return 'None of your current skills are matched to this part of the test yet.';
    case DOMAIN_STATE.PREREQUISITE_NEEDED:
      return 'Strengthen the mathematics here first — the format is not the obstacle yet.';
    case DOMAIN_STATE.TRANSFER_GAP:
      return 'You know this mathematics. It is the way this test asks for it that needs work.';
    case DOMAIN_STATE.RECOMMENDED:
      return 'A good place to spend your next session.';
    case DOMAIN_STATE.READY_NOT_PRACTISED:
      return 'You are ready to try these — you just have not practised them in this format.';
    case DOMAIN_STATE.DEVELOPING:
      return 'Coming along. Keep going in this format.';
    case DOMAIN_STATE.STRONG:
      return 'Going well in this format.';
    default:
      return '';
  }
};
