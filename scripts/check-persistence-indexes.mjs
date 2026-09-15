#!/usr/bin/env node
/*
 * IS THE COMPOSITE INDEX THE FINAL-GRADE CHECK NEEDS ACTUALLY ENABLED?
 *
 * `firebase deploy --only firestore:indexes` returns as soon as the build has
 * been REQUESTED. On a collection with production volume the index can then
 * spend minutes in CREATING, during which every query that needs it fails
 * exactly as though the index had never been declared.
 *
 * So this is a gate, not a wait. It asks Firestore what state the index is in
 * right now and answers one question: may the functions that query it be
 * deployed? It never sleeps and never polls, because a script that appears to
 * wait for readiness and silently gives up is worse than one that stops and
 * says so.
 *
 * Exit 0  — every required index is ENABLED. Deploy the functions.
 * Exit 1  — a required index is missing or still building, OR readiness could
 *           not be determined. Both are STOP, and for the same reason: nothing
 *           here may guess that an index is ready.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { REQUIRED_PERSISTENCE_INDEXES, assessRequiredIndexes } from './persistence-deploy-surface.mjs';

export const listCompositeIndexes = (project) => {
  const output = execFileSync('gcloud', [
    'firestore', 'indexes', 'composite', 'list',
    '--project', project, '--format=json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [];
};

const main = () => {
  const project = process.env.FIREBASE_PROJECT || 'mathmaster-aleks';
  let live;
  try {
    live = listCompositeIndexes(project);
  } catch (error) {
    // Could not ask. That is NOT "probably fine" — it is unknown, and unknown
    // is treated as not ready.
    throw new Error(
      `Could not read Firestore composite indexes for ${project} (${error.message}). `
      + 'Index readiness is UNKNOWN, so the index-dependent functions must not be deployed yet.',
    );
  }
  const results = assessRequiredIndexes(live);
  results.forEach((result) => {
    const status = result.ready ? 'ENABLED' : (result.found ? result.state : 'MISSING');
    console.log(
      `${result.ready ? 'PASS' : 'STOP'} ${result.collectionGroup}(${result.fields.join(', ')}) — ${status}`
      + `  [queried by ${result.queriedBy.join(', ')}]`,
    );
  });
  const blocked = results.filter((result) => !result.ready);
  if (blocked.length) {
    throw new Error(
      `${blocked.length} required composite index(es) are not ENABLED yet. `
      + 'Deploying the functions that query them now would break the final-grade safety check.',
    );
  }
  console.log(`All ${REQUIRED_PERSISTENCE_INDEXES.length} required persistence index(es) are ENABLED.`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
