// The extension's sync loop (route E, #612/#614): read each linked TEAMS
// section back, hand the read-backs and the last batch's outcomes to
// MathMaster's `teamsSyncStep`, apply the batch it returns through TEAMS's own
// pages, and repeat until the server says done.
//
// It holds no state of its own between runs: the server's ledger does. A run
// cut off part-way (a closed tab, a lost reply) is safe to start again: the
// server recorded each operation's intent before handing it out, and the next
// read-back shows what landed.
//
// Two adapters, so the loop is the same in Chrome and in a test:
//   mathmaster.step({ readbacks, outcomes, dryRun }) → the callable's reply
//   teams.readSection(sectionRef) → read-back (readback.js)
//   teams.createColumn(sectionRef, op) → TEAMS id of the new column
//   teams.setCount(sectionRef, columnId, count)
//   teams.importFile(sectionRef, columnId, { body, overwrite, rows }) → { errors }

export const RUN_LIMITS = Object.freeze({ rounds: 25, busyWaits: 4 });

const message = (error) => String(error?.message || error || 'Unknown error').slice(0, 300);

/** Apply one operation from the server; never throws. */
export const applyTeamsOp = async (teams, op) => {
  try {
    if (op.type === 'createColumn') {
      const columnId = await teams.createColumn(op.sectionRef, op);
      if (!columnId) return { opId: op.opId, ok: false, error: 'The new TEAMS assignment was not found after saving.' };
      return { opId: op.opId, ok: true, columnId };
    }
    if (op.type === 'setWeight') {
      if (op.teamsField !== '#Count') throw new Error(`Unexpected weight field ${op.teamsField}.`);
      await teams.setCount(op.sectionRef, op.columnId, op.weight);
      return { opId: op.opId, ok: true };
    }
    if (op.type === 'importScores' || op.type === 'clearScores') {
      if (!op.importFile || typeof op.importFile.body !== 'string') throw new Error('The operation has no import file.');
      const receipt = await teams.importFile(op.sectionRef, op.columnId, op.importFile);
      return { opId: op.opId, ok: true, errors: receipt?.errors || [] };
    }
    return { opId: op.opId, ok: false, error: `Unknown operation ${op.type}.` };
  } catch (error) {
    return { opId: op.opId, ok: false, error: message(error) };
  }
};

/**
 * One sync (or, with `dryRun`, one preview). `sections` are the class's linked
 * TEAMS section refs. `log(line)` gets progress lines with no student names.
 * Returns { status, rounds, applied, failed, response }.
 */
export const runTeamsSync = async ({
  mathmaster, teams, sections, dryRun = false, initialReadbacks = null, log = () => {},
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) => {
  if (!sections?.length) throw new Error('This class is not linked to a TEAMS section yet.');
  let outcomes = [];
  let response = null;
  let applied = 0;
  let failed = 0;
  let busy = 0;
  // Read-backs taken just before (while the targets were published) serve the
  // first round; every later round reads TEAMS again, so
  // what the last batch did is seen as TEAMS kept it.
  let fresh = initialReadbacks && sections.every((ref) => initialReadbacks[ref]) ? initialReadbacks : null;
  for (let round = 1; round <= RUN_LIMITS.rounds; round += 1) {
    const readbacks = fresh || {};
    if (!fresh) {
      for (const sectionRef of sections) {
        log(`Reading TEAMS section ${sectionRef}…`);
        readbacks[sectionRef] = await teams.readSection(sectionRef);
      }
    }
    fresh = null;
    response = await mathmaster.step({ readbacks, outcomes, dryRun });
    if (response.status === 'busy') {
      busy += 1;
      if (busy > RUN_LIMITS.busyWaits) return { status: 'busy', rounds: round, applied, failed, response };
      const ms = Math.min(Math.max(Number(response.retryAfterMs) || 5000, 1000), 60000);
      log(`Another TEAMS tab is syncing this class. Waiting ${Math.round(ms / 1000)} s…`);
      outcomes = [];
      await wait(ms);
      continue;
    }
    if (dryRun || response.status !== 'work') {
      return { status: dryRun ? 'preview' : response.status, rounds: round, applied, failed, response };
    }
    log(`Applying ${response.ops.length} change(s) in TEAMS${response.remainingOps ? `, ${response.remainingOps} more after these` : ''}…`);
    outcomes = [];
    for (const op of response.ops) {
      const outcome = await applyTeamsOp(teams, op);
      outcomes.push(outcome);
      if (outcome.ok) applied += 1;
      else {
        failed += 1;
        log(`Stopped this batch: ${outcome.error}`);
        // The rest of the batch waits: TEAMS is read back first, so nothing
        // is applied on top of a page in an unknown state.
        break;
      }
    }
  }
  return { status: 'unfinished', rounds: RUN_LIMITS.rounds, applied, failed, response };
};
