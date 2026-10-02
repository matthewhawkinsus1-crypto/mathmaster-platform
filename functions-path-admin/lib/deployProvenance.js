"use strict";

// The commit this path-admin deployment was built from (F-REL-3).
//
// The first predeploy step of this codebase (firebase.json) writes
// functions-path-admin/deploy-provenance.json. The reader and the label rules
// are the one implementation in functions/lib/deployProvenance.js, which
// scripts/sync-path-admin-runtime.mjs vendors into this bundle; this file only
// points it at THIS codebase's record.
//
// Loaded while the Firebase CLI discovers this codebase, so it must stay as
// cheap as the rest of discovery: `path`, the runtime resolver and a reader
// that needs only `fs` and `path` — never the release engine.

const path = require("path");
const { requireRuntime } = require("./runtime");

const { readDeployProvenance, provenanceLabels } = requireRuntime("lib/deployProvenance.js");

const provenanceFile = path.join(__dirname, "..", "deploy-provenance.json");
const deployProvenance = readDeployProvenance(provenanceFile, { codebase: "path-admin" });
const deployProvenanceLabels = Object.freeze(provenanceLabels(deployProvenance));

module.exports = { provenanceFile, deployProvenance, deployProvenanceLabels };
