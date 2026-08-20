// Moved to Cloud Functions shared code, and re-exported here.
//
// WHY. My Math Path's routing engine — diagnose, descend, bridge back, extend —
// existed only in the browser bundle, so the SERVER could not run it. Live
// student sessions therefore had no adaptive routing at all: `issueNextQuestion`
// always issued from the session's original target, while the Teacher Path
// Simulator (which runs in the browser) demonstrated the full behaviour. The
// simulator was not wrong; production simply never had the engine.
//
// A second copy inside `functions/` would have been the obvious fix and the
// wrong one: two copies of a routing engine drift, and a drifted engine means
// the simulator stops predicting what a student experiences. So the module MOVED
// to `functions/shared/`, which both the deployed functions and the Vite bundle
// can import, and this file stays as the path every browser caller already uses.

export * from '../../../functions/shared/pathSkillGraph.mjs';
