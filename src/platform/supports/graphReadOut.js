/*
 * GRAPH READ-OUT — A SUPPORT-PLAN ACCOMMODATION (AX03, G-4).
 *
 * While a question can be answered, a graph's screen-reader description names
 * only the KINDS of marks it draws, never where they are
 * (platform/language/graphDescription.js): "crosses the y-axis at −4" would
 * answer "What is the y-intercept?" for anyone who turns a screen reader on.
 * On a graph-READING item that leaves a blind student nothing to answer from;
 * the district DOL 2 test has seven such items.
 *
 * A student whose plan gives them `graph-read-out` hears the full description
 * while the question is open: each line's direction and the gridlines it
 * crosses, each point's position, read at the grid the graph draws. It is what
 * a sighted classmate reads off the grid, and what a human reader would read
 * aloud. Nothing else changes: the data table, the coordinate readout and
 * hover stay as the question sets them, an axis whose numbers the graph hides
 * stays hidden, and nothing says whether anything is right.
 *
 * It follows the plan like every support: the revision in effect today, and
 * only in the activities the teacher limited it to. Applied by itself wherever
 * a graph is on screen, so it is recorded as `provided` there
 * (functions/shared/supportCatalog.mjs `graph-read-out`).
 */
import React, { createContext, useContext, useEffect } from 'react';
import {
  effectiveFlatSupportProfile, resolveEffectiveSupportPlan, supportAppliesToRole,
} from '../../../functions/shared/supportProfileModel.mjs';

export const GRAPH_READ_OUT_SUPPORT_ID = 'graph-read-out';

/**
 * Does this student's own plan give them the read-out in this activity? From
 * the student's OWN profile: a flattened assessment profile has lost the
 * plan's per-activity limits (studentSupport.js assessmentSupportProfile).
 */
export const graphReadOutEntitled = (profile, { activityRole = null, nowValue = Date.now() } = {}) => {
  if (!profile || typeof profile !== 'object') return false;
  const flat = effectiveFlatSupportProfile(profile, { nowValue });
  if (!flat.accommodations.includes(GRAPH_READ_OUT_SUPPORT_ID)) return false;
  if (!activityRole) return true;
  return supportAppliesToRole(resolveEffectiveSupportPlan(profile, { nowValue }), GRAPH_READ_OUT_SUPPORT_ID, activityRole);
};

/**
 * Whether the read-out is what makes a graph's description full. Not where
 * positions are read anyway (`closed`: the question is finished and its
 * outcome shown), and never over a caller that decided what its graph says
 * (`explicit`: CoordinatePlane's describeFeatures).
 */
export const graphReadOutApplies = ({ enabled = false, closed = false, explicit = null } = {}) => (
  enabled === true && closed !== true && explicit == null
);

const NONE = Object.freeze({ enabled: false, report: null });
const GraphReadOutContext = createContext(NONE);

/**
 * The host (QuestionEngine, the secure field item) says whether the student
 * has the read-out here, and how a graph read out in full is recorded.
 */
export function GraphReadOutProvider({ enabled = false, onReadOut = null, children }) {
  return React.createElement(
    GraphReadOutContext.Provider,
    { value: enabled === true ? { enabled: true, report: typeof onReadOut === 'function' ? onReadOut : null } : NONE },
    children,
  );
}

export const useGraphReadOut = () => useContext(GraphReadOutContext);

/** A graph that was read out in full because of the support says so, once per change. */
export const useReportGraphReadOut = (applied) => {
  const { report } = useGraphReadOut();
  useEffect(() => {
    if (applied === true && report) report();
  }, [applied, report]);
};
