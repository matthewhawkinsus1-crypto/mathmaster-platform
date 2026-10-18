/*
 * THE AUTHORING STATES, ON THEIR OWN.
 *
 * A student's Home reads them (assignments/assignmentAvailability.js: a draft
 * is not live work), and nothing else of the authoring and repair logic in
 * ./assignmentAuthoringState.js, which re-exports this same object. Importing
 * the constant from there put that logic in every student's first load
 * (scripts/check-first-load-budget.mjs).
 */
export const AUTHORING_STATES = Object.freeze({
  INCOMPLETE: 'incomplete',
  NEEDS_REVIEW: 'needsReview',
  READY: 'ready',
  PUBLISHED: 'published',
});
