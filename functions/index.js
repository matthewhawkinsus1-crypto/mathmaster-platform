// THE DEFAULT CODEBASE'S FUNCTIONS, BY DOMAIN.
//
// This file sets the options every function shares, starts the Admin SDK, and
// loads one module per domain. Each module defines its functions with
// `exports.NAME = ...`; their names, triggers and options are what they were
// when all of this was one file (tests/platform/functionsDomainModules.test.mjs).
//
// ORDER MATTERS. Global options apply to functions defined after
// setGlobalOptions runs, so it runs before any domain module is loaded.
// entry.js, platformEntry.js and the Classroom section entry load this file
// first for the same reason.
//
// A new function goes in the module of its domain. A helper two domains need
// goes in functionsCommon.js. A domain module never loads another domain module.

const { initializeApp } = require("firebase-admin/app");
const { setGlobalOptions } = require("firebase-functions/v2");
const { deployProvenanceLabels } = require("./lib/deployProvenance");

// HTTPS/callable transport must be reachable by the Firebase client SDK.
// MathMaster authorization still happens INSIDE each callable through
// requireStudent/requireTeacher/requireRootAdmin. Source-controlling this
// prevents a redeploy from silently returning an onRequest function's Cloud
// Run service to "Require authentication": the CLI re-applies it every deploy.
//
// It does NOT reach callables. firebase-functions leaves `invoker` out of an
// onCall endpoint, and the Firebase CLI grants a callable allUsers ->
// roles/run.invoker once, when it creates it, never on a later deploy. A
// callable whose grant failed at create is deployed and healthy, and every
// browser call gets a 403 the Firebase client reports as "internal". So every
// functions release checks and repairs callable access before Hosting ships
// (scripts/verify-callable-access.mjs, run by scripts/release-firebase.mjs).
//
// Every function this codebase deploys also carries the commit it was built
// from, as the Cloud labels mm-git-sha and mm-tree (`gcloud functions list`;
// `node scripts/release-firebase.mjs --whats-live`). The values come from the
// deploy-provenance.json the first predeploy step writes (firebase.json), read
// while the CLI discovers the functions. Global options apply to functions
// defined AFTER this call, which is every function in this codebase: entry.js,
// platformEntry.js and the Classroom section entry all load this file first.
//
// MEMORY. Every function in this codebase loads the whole of it, and that
// alone costs about 260–330 MiB once a handler has pulled in what it needs
// (measured from production: 14 different functions were killed at the old
// 256 MiB default with 257–334 MiB in use). A function left at the default
// therefore dies part-way through a request, which the browser reports as a
// bare "internal" with no CORS headers, a trigger drops its event, and a
// scheduler never finishes: the Classroom section-grade checkpoint job ran out
// of memory on every five-minute run for a week, and the callable that records
// students' submitted answers thousands of times a school day. So 512 MiB is
// the floor for all of them; a function that needs more says so itself
// (TEST_CYCLE_PANEL_OPTIONS, the Path bank builders). Nothing may ask for less
// (tests/platform/functionsMemoryFloor.test.mjs reads the real endpoints).
const FUNCTION_MEMORY_FLOOR = "512MiB";
setGlobalOptions({ invoker: "public", memory: FUNCTION_MEMORY_FLOOR, labels: deployProvenanceLabels });

initializeApp();

// The domain modules. Loaded after the global options above are set.
Object.assign(
  exports,
  require("./gradingFunctions"),
  require("./rewardsFunctions"),
  require("./accountsFunctions"),
  require("./classroomFunctions"),
  require("./mathPathFunctions"),
  require("./authoringFunctions"),
  require("./liveChallengeFunctions"),
  require("./testCycleFunctions"),
  require("./platformFunctions"),
  require("./disciplineFunctions"),
);
