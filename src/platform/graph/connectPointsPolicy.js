/*
 * WHO IS OFFERED "CONNECT MY POINTS" (pass 3, TOOL-1; the owner, 2026-10-23,
 * C1-120).
 *
 * The button draws the curve, or the inverse, through the student's OWN placed
 * points, so a student who cannot draw with a mouse or a finger can still
 * finish a graph (src/graphConnectPoints.js). Where outcomes are shown at once
 * (warm-up, classwork, practice) every student has it, as before.
 *
 * On an exit ticket, quiz or test the curve is marked at submission through
 * the student's own points, so right points connected make a right curve: the
 * button would let the points stand in for the curve. There it is offered only
 * to a student whose support plan has the keyboard-access accommodation
 * (functions/shared/supportCatalog.mjs), which reaches the workspace as
 * `supportPresentation.keyboardAccess` (src/studentSupport.js).
 */
export const KEYBOARD_ACCESS_SUPPORT_ID = 'keyboard-access';

/** Is "Connect my points" (and "Connect my reflected points") offered here? */
export const connectPointsOffered = ({ outcomesWithheld = false, keyboardAccess = false } = {}) => (
  outcomesWithheld !== true || keyboardAccess === true
);

/**
 * Is it offered here only because of the support plan? Then the button on
 * screen is the accommodation being provided, and that is what is recorded
 * (studentSupportTelemetry.js records it from the question, not at launch).
 */
export const connectPointsProvidedByPlan = ({ outcomesWithheld = false, keyboardAccess = false } = {}) => (
  outcomesWithheld === true && keyboardAccess === true
);
