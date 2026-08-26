#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'functions', 'index.js');
let source = fs.readFileSync(target, 'utf8');

const beforeHold = `  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);\n  const manifestSnapshot = await manifestRef.get();\n  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};\n  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(\n    currentManifest,\n    pendingReleases,\n    Date.now(),\n  );\n  await manifestRef.set({ ...updatingManifest, updatedBy: actor.uid });\n`;

const afterHold = `  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);\n  const manifestSnapshot = await manifestRef.get();\n  const currentManifest = manifestSnapshot.exists ? manifestSnapshot.data() : {};\n  const retryingCoordinatedRefresh = currentManifest?.status === "updating"\n    && currentManifest?.updateOperation === "coordinated-refresh";\n  if (currentManifest?.status === "updating" && !retryingCoordinatedRefresh) {\n    throw new HttpsError(\n      "failed-precondition",\n      "Another assessment-bank update is already in progress. Finish or recover that operation before starting the coordinated CCMR refresh.",\n    );\n  }\n\n  const normalizeReleaseEntries = (value) => Object.entries(value || {})\n    .map(([framework, release]) => [String(framework).trim(), String(release || "").trim()])\n    .filter(([framework, release]) => framework && release)\n    .sort(([left], [right]) => left.localeCompare(right));\n  const samePendingRelease = JSON.stringify(normalizeReleaseEntries(currentManifest?.pendingReleases))\n    === JSON.stringify(normalizeReleaseEntries(pendingReleases));\n  if (retryingCoordinatedRefresh && !samePendingRelease) {\n    throw new HttpsError(\n      "failed-precondition",\n      "The held CCMR refresh targets a different pending content release. Redeploy the matching release package or recover the held update before retrying.",\n    );\n  }\n\n  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(\n    currentManifest,\n    pendingReleases,\n    Date.now(),\n  );\n  await manifestRef.set({\n    ...updatingManifest,\n    updateOperation: "coordinated-refresh",\n    updatedBy: actor.uid,\n  });\n`;

const beforeActivate = `  await manifestRef.set({ ...activeManifest, updatedBy: actor.uid });`;
const afterActivate = `  await manifestRef.set({\n    ...activeManifest,\n    updateOperation: "coordinated-refresh",\n    updatedBy: actor.uid,\n  });`;

const count = (text, needle) => text.split(needle).length - 1;
if (count(source, beforeHold) !== 1) {
  throw new Error(`Expected exactly one coordinated manifest hold block, found ${count(source, beforeHold)}.`);
}
if (count(source, beforeActivate) !== 1) {
  throw new Error(`Expected exactly one coordinated manifest activation write, found ${count(source, beforeActivate)}.`);
}

source = source.replace(beforeHold, afterHold).replace(beforeActivate, afterActivate);
fs.writeFileSync(target, source);
console.log('Patched coordinated CCMR refresh retry identity and same-release protection.');
