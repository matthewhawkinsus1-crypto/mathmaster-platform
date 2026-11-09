/*
 * THE ASSIGNMENT RUNTIME REPAIR VERSION, AS THE BUILD INFO READS IT.
 *
 * buildInfo.js reports which repair version this build runs (when the Hosting
 * build has not injected it) and what an issue requires by default. main.jsx
 * publishes that info before the sign-in screen draws, so whatever buildInfo.js
 * imports is downloaded before every sign-in. The number lives in the repair
 * itself (functions/shared/runtime/assignmentRuntimeRepair.mjs, shared with
 * server grading), and importing it from there put the whole repair and the
 * relation routing it reads on the sign-in path for this one number.
 *
 * So the runtime keeps its own copy, and
 * tests/platform/firstLoadSignInRepairVersion.test.mjs fails whenever it
 * differs from the repair's: when the repair's version moves, move this one
 * with it.
 */
export const ASSIGNMENT_RUNTIME_REPAIR_VERSION = 7;
