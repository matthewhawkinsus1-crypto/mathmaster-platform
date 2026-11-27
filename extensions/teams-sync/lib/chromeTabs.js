// Chrome glue: find the teacher's two tabs and run one function in each.
// Only this file and panel.js touch chrome.*; the rest is plain modules.

import { teamsPage } from './teamsPage.js';

export const MATHMASTER_URLS = ['https://mathmaster-aleks.web.app/*', 'https://mathmasterlearning.com/*'];
export const TEAMS_URLS = ['https://desoto.teams.hosting/*'];

export const findTab = async (urls, what) => {
  const tabs = await chrome.tabs.query({ url: urls });
  if (tabs.length === 0) throw new Error(`Open ${what} in a tab first.`);
  if (tabs.length > 1) throw new Error(`Close all but one ${what} tab, so the sync knows which one to use.`);
  return tabs[0].id;
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

/** One teamsPage step in the TEAMS tab; errors from the page come back as throws. */
export const runInTeams = (tabId) => async (action, args) => {
  const result = await execute(tabId, teamsPage, [action, args]);
  if (result === null || result === undefined) throw Object.assign(new Error('navigating'), { navigating: true });
  if (result.error) throw new Error(result.error);
  return result.value;
};

/** One call to Grade Transfer's window.mathmasterTeamsSync in the MathMaster tab. */
export const callMathMaster = (tabId) => async (method, payload) => {
  const result = await execute(tabId, async (name, input) => {
    const api = window.mathmasterTeamsSync;
    if (!api || api.version !== 1) return { missing: true };
    try {
      return { value: await api[name](input) };
    } catch (error) {
      return { error: String(error?.message || error) };
    }
  }, [method, payload]);
  if (result?.missing) throw new Error('Open Grade Transfer in MathMaster (Teacher → Grade Transfer) and leave it open while the sync runs.');
  if (result?.error) throw new Error(result.error);
  return result?.value;
};
