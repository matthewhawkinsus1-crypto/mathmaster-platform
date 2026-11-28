// Chrome glue: find the teacher's tabs and run one function in each. Only
// this file, background.js and panel.js touch chrome.*; the rest is plain
// modules that node tests import.

import { teamsPage } from './teams/teamsPage.js';
import { schoolStatusPage } from './schoolstatus/schoolStatusPage.js';

export const MATHMASTER_URLS = ['https://mathmaster-aleks.web.app/*', 'https://mathmasterlearning.com/*'];
export const TEAMS_URLS = ['https://desoto.teams.hosting/*'];
// The teacher's SchoolStatus, as they signed in to it on 2026-11-27.
export const SCHOOLSTATUS_URLS = ['https://secure.schoolstatus.com/*'];

/** The one tab open on `urls`; throws a sentence the teacher can act on. */
export const findTab = async (urls, what) => {
  const tabs = await chrome.tabs.query({ url: urls });
  if (tabs.length === 0) throw new Error(`Open ${what} in a tab first.`);
  if (tabs.length > 1) throw new Error(`Close all but one ${what} tab, so the extension knows which one to use.`);
  return tabs[0].id;
};

/** Whether the teacher is looking at this tab now: the active tab of the focused window. */
export const isTabInUse = async (tabId) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.active) return false;
  const window = await chrome.windows.get(tab.windowId).catch(() => null);
  return Boolean(window?.focused);
};

// Chrome cannot run a script in a page that is loading or being replaced.
const NAVIGATING = /frame (with id \d+ )?(was|is) removed|no frame with id|cannot access contents of url|the tab was closed|error page|document is not available|page has been navigated|cannot access a chrome/i;

const execute = async (tabId, func, args) => {
  let frames;
  try {
    frames = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
  } catch (error) {
    if (NAVIGATING.test(String(error?.message || error))) throw Object.assign(new Error('navigating'), { navigating: true });
    throw error;
  }
  const [frame] = frames || [];
  if (!frame) throw Object.assign(new Error('navigating'), { navigating: true });
  if (frame.error) throw new Error(String(frame.error.message || frame.error));
  return frame.result;
};

const pageStep = (pageFunction) => (tabId) => async (action, args) => {
  const result = await execute(tabId, pageFunction, [action, args]);
  if (result === null || result === undefined) throw Object.assign(new Error('navigating'), { navigating: true });
  if (result.error) throw new Error(result.error);
  return result.value;
};

/** One teamsPage step in the TEAMS tab; errors from the page come back as throws. */
export const runInTeams = pageStep(teamsPage);
/** One schoolStatusPage step in the SchoolStatus tab. */
export const runInSchoolStatus = pageStep(schoolStatusPage);

// One call to a MathMaster bridge in the MathMaster tab. Each runs as the
// signed-in teacher, through MathMaster's own callables.
const bridgeCall = (property, missing) => (tabId) => async (method, payload) => {
  const result = await execute(tabId, async (name, input, key) => {
    const api = window[key];
    if (!api || api.version !== 1) return { missing: true };
    try {
      return { value: await api[name](input) };
    } catch (error) {
      return { error: String(error?.message || error) };
    }
  }, [method, payload, property]);
  if (result?.missing) throw new Error(missing);
  if (result?.error) throw new Error(result.error);
  return result?.value;
};

/** window.mathmasterTeamsSync: any teacher screen (TeacherWorkspace installs it). */
export const callTeamsBridge = bridgeCall('mathmasterTeamsSync', 'Sign in to MathMaster as a teacher in that tab (any teacher screen will do), then try again.');
/** window.mathmasterFamilyMessages: the Discipline Tracker, while it is open. */
export const callFamilyBridge = bridgeCall('mathmasterFamilyMessages', 'Open the Discipline Tracker in MathMaster (Teacher → Student Support → Discipline Tracker) and leave it open while messages send.');

/** The Discipline Tracker bridge's five calls, for the SchoolStatus runner. */
export const familyMessagesAdapter = (call) => ({
  status: () => call('status'),
  claim: (input) => call('claim', input),
  start: (input) => call('start', input),
  report: (input) => call('report', input),
  release: (input) => call('release', input),
});

/** One runner id per Chrome profile and job, kept in chrome.storage.local. */
export const runnerIdFor = async (key) => {
  const stored = (await chrome.storage.local.get(key))[key];
  if (stored) return stored;
  const id = `ext-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await chrome.storage.local.set({ [key]: id });
  return id;
};
