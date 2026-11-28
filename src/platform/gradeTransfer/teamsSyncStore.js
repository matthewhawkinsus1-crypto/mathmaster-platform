// Browser calls for the TEAMS sync (#613). Every one goes through a callable
// that checks the teacher of record; the TEAMS sync collections are
// server-only (firestore.rules).
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

const call = async (name, data) => (await httpsCallable(functions, name)(data)).data || {};

/** Link a class to its TEAMS section(s): an inclusion class is two, e.g. 15001/05 and 15001/55. */
export const setTeamsSyncSections = ({ classId, sections, capabilities = null }) => (
  call('setTeamsSyncSections', { classId, sections, ...(capabilities ? { capabilities } : {}) })
);

/** Publish what the sync should send for a class (buildTeamsSyncTargets). */
export const publishTeamsSyncTargets = ({ classId, targets }) => call('publishTeamsSyncTargets', { classId, targets });

export const getTeamsSyncState = ({ classId }) => call('getTeamsSyncState', { classId });

/**
 * Remove one lesson section from TEAMS (it stays in MathMaster), confirm how
 * many TEAMS grades go with it, or send it to TEAMS again.
 * `action`: 'remove' | 'confirm' (with `confirmGradeCount`) | 'restore'.
 */
export const setTeamsSyncRemoval = ({ classId, targetKey, action, confirmGradeCount }) => (
  call('setTeamsSyncRemoval', { classId, targetKey, action, ...(action === 'confirm' ? { confirmGradeCount } : {}) })
);

/** What a sync would do against these read-backs, recording nothing. */
export const previewTeamsSync = ({ classId, readbacks = {} }) => call('teamsSyncStep', { classId, readbacks, dryRun: true });

/** One round trip for the TEAMS-side runner (the Chrome extension). */
export const teamsSyncStep = ({ classId, runnerId, readbacks, outcomes = [] }) => (
  call('teamsSyncStep', { classId, runnerId, readbacks, outcomes })
);
