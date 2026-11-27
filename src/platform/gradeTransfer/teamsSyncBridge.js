// What Grade Transfer offers the MathMaster TEAMS Sync Chrome extension
// (extensions/teams-sync, route E of #612): `window.mathmasterTeamsSync`,
// present only while a teacher has Grade Transfer open.
//
// The extension has no MathMaster sign-in of its own. It runs these calls in
// the teacher's MathMaster tab, so each one goes through the same callables,
// with the same teacher-of-record check, as the rest of Grade Transfer
// (teamsSyncStore.js). It publishes the targets Grade Transfer itself builds
// (GradeTransferCenter's buildSyncTargets): the set "Send now" and the
// 30-minute scheduled publish send. Each publish replaces the class's set, so
// a second rule here would undo theirs every half hour, and theirs this one.
//
// The bridge only reaches classes Grade Transfer itself may export; the
// server checks every call again.

// The callables load with Firebase only when the extension first calls.
const loadStore = () => import('./teamsSyncStore.js');

export const TEAMS_SYNC_BRIDGE_VERSION = 1;

/**
 * `getContext()` returns Grade Transfer's current state: { ready,
 * authorizedClasses: [{ classId, name?, period? }], buildTargets(classId) }.
 */
export const createTeamsSyncBridge = ({ getContext, api = null }) => {
  let calls = api ? Promise.resolve(api) : null;
  const callables = () => { calls = calls || loadStore(); return calls; };
  const authorized = (classId) => {
    const id = String(classId || '');
    const entry = (getContext().authorizedClasses || []).find((item) => item.classId === id);
    if (!entry) throw new Error('That class is not one Grade Transfer can sync for you.');
    return entry;
  };
  // As Grade Transfer labels a class (gradeTransferModel.js classLabel).
  const labelOf = (entry) => String(entry.name || entry.period || entry.classId).slice(0, 80);

  return Object.freeze({
    version: TEAMS_SYNC_BRIDGE_VERSION,

    /** The classes this teacher can sync, with their linked TEAMS sections. */
    async listClasses() {
      const entries = getContext().authorizedClasses || [];
      return Promise.all(entries.map(async (entry) => {
        const state = await (await callables()).getTeamsSyncState({ classId: entry.classId });
        return {
          classId: entry.classId,
          label: labelOf(entry),
          sections: state.sections || [],
          targetCount: Number(state.targetCount || 0),
          targetsPublishedAt: state.targetsPublishedAt || null,
          lastStep: state.lastStep || null,
        };
      }));
    },

    /** Link a class to its TEAMS section(s); an inclusion class has two. */
    async linkSections({ classId, sections }) {
      authorized(classId);
      return (await callables()).setTeamsSyncSections({ classId, sections });
    },

    /**
     * Publish what the sync should send for one class: Grade Transfer's own
     * targets for the current marking period. Version 0.2.0 of the extension
     * also sends `dueOnOrAfter`; it is ignored, so every publisher agrees.
     */
    async publish({ classId }) {
      authorized(classId);
      const context = getContext();
      if (!context.ready) throw new Error('Grade Transfer is still loading the export history. Try again in a moment.');
      if (typeof context.buildTargets !== 'function') throw new Error('Grade Transfer cannot build TEAMS sync grades yet. Reload Grade Export and try again.');
      const targets = context.buildTargets(String(classId));
      const result = await (await callables()).publishTeamsSyncTargets({ classId, targets });
      return { targetCount: targets.length, ...result };
    },

    /** One round trip of the sync, or a preview that records nothing. */
    async step({ classId, runnerId, readbacks = {}, outcomes = [], dryRun = false }) {
      authorized(classId);
      const api = await callables();
      return dryRun
        ? api.previewTeamsSync({ classId, readbacks })
        : api.teamsSyncStep({ classId, runnerId, readbacks, outcomes });
    },
  });
};

/** Expose the bridge on `target` (the window); returns the undo. */
export const installTeamsSyncBridge = (bridge, target = globalThis) => {
  target.mathmasterTeamsSync = bridge;
  return () => {
    if (target.mathmasterTeamsSync === bridge) delete target.mathmasterTeamsSync;
  };
};
