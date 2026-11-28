// What MathMaster offers its Chrome extension's TEAMS sync
// (extensions/teams-sync, extensions/mathmaster; route E of #612):
// `window.mathmasterTeamsSync`, present on every teacher screen
// (TeacherWorkspace installs it), so the extension's 30-minute timer can sync
// with any MathMaster screen open. From any screen it lists the linked
// classes and runs sync steps on the grades the server publishes every 30
// minutes. While Grade Transfer is open it adds its own context
// (registerGradeTransferTeamsContext): publishing its current targets.
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

// Through the projection, already in a teacher's first load: imported from
// gradeTransferScope.js directly it would become a first-load file of its own.
import { authorizedGradeTransferClasses } from './gradeTransferProjection.js';

// The callables load with Firebase only when the extension first calls.
const loadStore = () => import('./teamsSyncStore.js');

export const TEAMS_SYNC_BRIDGE_VERSION = 1;

// Grade Transfer's context while it is open, else none.
let gradeTransferContext = null;

/** Grade Transfer, while open: the bridge reads its context first. Returns the undo. */
export const registerGradeTransferTeamsContext = (getContext) => {
  const entry = { getContext };
  gradeTransferContext = entry;
  return () => { if (gradeTransferContext === entry) gradeTransferContext = null; };
};

/**
 * Any teacher screen: the classes Grade Transfer may export, and no targets
 * of its own (`workspace`): publishing waits for Grade Transfer, and the
 * server's 30-minute publish keeps the sync's grades current meanwhile.
 */
export const workspaceTeamsSyncContext = ({ classes = [], teacherEmail = '', isRootAdmin = false } = {}) => ({
  ready: false,
  workspace: true,
  authorizedClasses: authorizedGradeTransferClasses({ classes, teacherEmail, isRootAdmin }),
});

/** Grade Transfer's context while it is open, else the workspace's. */
export const layeredTeamsSyncContext = (getWorkspaceContext) => () => gradeTransferContext?.getContext?.() || getWorkspaceContext();

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
      if (context.workspace) throw new Error('Open Grade Export in MathMaster to send grades now. MathMaster also sends them to the sync every 30 minutes.');
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
