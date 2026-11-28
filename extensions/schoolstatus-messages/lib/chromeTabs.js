// Chrome glue: find the teacher's MathMaster and SchoolStatus tabs and run
// one function in each. Only this file and panel.js touch chrome.*; the rest
// is plain modules that node tests import.

export const MATHMASTER_URLS = ['https://mathmaster-aleks.web.app/*', 'https://mathmasterlearning.com/*'];
// The teacher's SchoolStatus, as they signed in to it on 2026-11-27.
export const SCHOOLSTATUS_URLS = ['https://secure.schoolstatus.com/*'];

export const findTab = async (urls, what) => {
  const tabs = await chrome.tabs.query({ url: urls });
  if (tabs.length === 0) throw new Error(`Open ${what} in a tab first.`);
  if (tabs.length > 1) throw new Error(`Close all but one ${what} tab, so the extension knows which one to use.`);
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

/** One page step (schoolStatusPage.js) in the SchoolStatus tab; page errors come back as throws. */
export const runInSchoolStatus = (tabId, pageStep) => async (action, args) => {
  const result = await execute(tabId, pageStep, [action, args]);
  if (result === null || result === undefined) throw Object.assign(new Error('navigating'), { navigating: true });
  if (result.error) throw new Error(result.error);
  return result.value;
};

/** One call to the Discipline Tracker's window.mathmasterFamilyMessages in the MathMaster tab. */
export const callMathMaster = (tabId) => async (method, payload) => {
  const result = await execute(tabId, async (name, input) => {
    const api = window.mathmasterFamilyMessages;
    if (!api || api.version !== 1) return { missing: true };
    try {
      return { value: await api[name](input) };
    } catch (error) {
      return { error: String(error?.message || error) };
    }
  }, [method, payload]);
  if (result?.missing) throw new Error('Open the Discipline Tracker in MathMaster (Teacher → Student Support → Discipline Tracker) and leave it open while messages send.');
  if (result?.error) throw new Error(result.error);
  return result?.value;
};

/** The bridge's five calls, for the runner. */
export const mathmasterAdapter = (call) => ({
  status: () => call('status'),
  claim: (input) => call('claim', input),
  start: (input) => call('start', input),
  report: (input) => call('report', input),
  release: (input) => call('release', input),
});
