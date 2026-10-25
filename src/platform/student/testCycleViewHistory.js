/*
 * THE TEST CYCLE CARD'S OWN SCREENS, AS BROWSER ENTRIES (NV14).
 *
 * Corrections and the released Test's review open inside the card
 * (TestCycleCard.jsx), so they had no history entry: browser Back from
 * Corrections left the whole card, and a reload put the student back on the
 * card. Each is now an entry over the card's, at the same address
 * (/test-cycle/<id>), naming its screen:
 *
 *   card                    the card (and the secure sitting it opens)
 *   corrections             Corrections
 *   testReview              "Review my Test", opened from the card
 *   correctionsTestReview   "Review my Test", opened from Corrections: Back
 *                           returns to them, as the review's own Back does
 *   review                  "Review Test" or "Review Retest" once the cycle is done
 *
 * The secure Test or Retest is never an entry of its own. Back is refused
 * while it runs (App.jsx), and nothing may resume it unasked: its full screen
 * needs the student's own tap (SecureExamContainer).
 *
 * WHAT AN ENTRY MAY OPEN. Back, Forward or a reload onto an entry opens its
 * screen only if the card's own button would open it now
 * (testCycleViewOffered), judged on the server's latest card as a tap is. A
 * screen no longer offered (corrections finished, a Retest opened, a review
 * withdrawn) leaves the student on the card, and the entry says so.
 *
 * WHOSE ENTRY. The view is entry-only (browserHistory.js), carries the test's
 * id, and is read only from an entry that is this card's (its student route
 * names this test) and this account's (ROUTE_OWNER_STATE_KEY).
 */
import { TEST_CYCLE_VIEW_STATE_KEY, readRouteOwner, readStudentRouteState, writeTestCycleViewState } from './browserHistory.js';
import { TEST_CYCLE_STAGE, stageIsSecure } from '../assessment/testCycle.js';
import { testReviewSessionIdFor } from './testCycleDiscovery.js';

export const TEST_CYCLE_VIEW = Object.freeze({
  CARD: 'card',
  CORRECTIONS: 'corrections',
  TEST_REVIEW: 'testReview',
  CORRECTIONS_TEST_REVIEW: 'correctionsTestReview',
  REVIEW: 'review',
});
const VIEWS = new Set(Object.values(TEST_CYCLE_VIEW));
const clean = (value) => String(value ?? '').trim();

/** The card's screen, as an entry: its `mode`, and where its Test review was opened from. */
export const testCycleViewFor = ({ mode = 'card', testReviewReturn = 'card' } = {}) => {
  if (mode === 'corrections') return TEST_CYCLE_VIEW.CORRECTIONS;
  if (mode === 'testReview') return testReviewReturn === 'corrections' ? TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW : TEST_CYCLE_VIEW.TEST_REVIEW;
  if (mode === 'review') return TEST_CYCLE_VIEW.REVIEW;
  return TEST_CYCLE_VIEW.CARD;
};

/** The card's { mode, testReviewReturn } for an entry's screen. */
export const testCycleModeFor = (view) => {
  if (view === TEST_CYCLE_VIEW.CORRECTIONS) return { mode: 'corrections', testReviewReturn: 'card' };
  if (view === TEST_CYCLE_VIEW.TEST_REVIEW) return { mode: 'testReview', testReviewReturn: 'card' };
  if (view === TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW) return { mode: 'testReview', testReviewReturn: 'corrections' };
  if (view === TEST_CYCLE_VIEW.REVIEW) return { mode: 'review', testReviewReturn: 'card' };
  return { mode: 'card', testReviewReturn: 'card' };
};

/*
 * Would the card's own buttons open this screen now (TestCycleCard `enter`
 * and "Review my Test")? Corrections while they are the stage and their plan
 * is ready; "Review my Test" while the server offers the released Test
 * (testReviewSessionIdFor); a finished cycle's review while its button is
 * live. The card itself always.
 */
export const testCycleViewOffered = (view, card) => {
  if (view === TEST_CYCLE_VIEW.CARD) return true;
  if (!card || typeof card !== 'object') return false;
  const corrections = card.stage === TEST_CYCLE_STAGE.CORRECTIONS && card.canEnter === true && Boolean(card.corrections);
  const testReview = Boolean(testReviewSessionIdFor(card));
  if (view === TEST_CYCLE_VIEW.CORRECTIONS) return corrections;
  if (view === TEST_CYCLE_VIEW.TEST_REVIEW) return testReview;
  if (view === TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW) return corrections && testReview;
  if (view === TEST_CYCLE_VIEW.REVIEW) {
    return card.canEnter === true && Boolean(card.reviewExamSessionId)
      && card.stage !== TEST_CYCLE_STAGE.REVIEW && card.stage !== TEST_CYCLE_STAGE.CORRECTIONS
      && !stageIsSecure(card.stage);
  }
  return false;
};

/**
 * The screen an entry records for THIS card: null when the entry is not this
 * card's (another screen, another test, another account); the card when it
 * names no screen of its own.
 */
export const readTestCycleView = (state, { assignmentId, owner } = {}) => {
  const id = clean(assignmentId);
  if (!id || !owner || !state || typeof state !== 'object') return null;
  if (readRouteOwner(state) !== owner) return null;
  const route = readStudentRouteState(state);
  if (route?.surface !== 'dashboard' || route.dashboardMode !== 'testCycle' || route.testCycleAssignmentId !== id) return null;
  const recorded = state[TEST_CYCLE_VIEW_STATE_KEY];
  if (!recorded || typeof recorded !== 'object' || clean(recorded.assignmentId) !== id) return TEST_CYCLE_VIEW.CARD;
  return VIEWS.has(recorded.view) ? recorded.view : TEST_CYCLE_VIEW.CARD;
};

/** This card's screen as an entry: a new one over the current, or (`replace`) the current one rewritten. */
export const writeTestCycleView = (view, { assignmentId, owner, replace = false } = {}) => {
  const id = clean(assignmentId);
  if (!id || !owner) return;
  writeTestCycleViewState({ assignmentId: id, view: VIEWS.has(view) ? view : TEST_CYCLE_VIEW.CARD }, { owner, replace });
};
