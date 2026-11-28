// The MathMaster extension's background: the toolbar button opens its page,
// and a Chrome alarm runs the TEAMS sync every 30 minutes, 6 am–10 pm
// Central, when the teacher has turned automatic sync on (lib/teams/schedule.js).
//
// Each timed run is recorded for the page (chrome.storage.local
// teamsSyncLastRun, and teamsSyncLog: class labels, counts and TEAMS's own
// messages, never a student's name).

import { TEAMS_TIMER, nextSyncAt, runTimedTeamsSync, skipReason } from './lib/teams/schedule.js';
import { MATHMASTER_URLS, TEAMS_URLS, callTeamsBridge, findTab, isTabInUse, runInTeams, runnerIdFor } from './lib/chromeTabs.js';
import { createTeamsAdapter } from './lib/teams/teamsAdapter.js';
import { readTeamsLock, withTeamsLock } from './lib/lock.js';

const ALARM = 'mathmaster-teams-sync';
const LOG_MAX = 300;

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('panel.html');
  const [tab] = await chrome.tabs.query({ url });
  if (tab) await chrome.tabs.update(tab.id, { active: true });
  else await chrome.tabs.create({ url });
});

const ensureAlarm = async () => {
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, { when: nextSyncAt(Date.now()), periodInMinutes: TEAMS_TIMER.periodMinutes });
  }
};
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

const appendLog = async (line) => {
  const { teamsSyncLog = [] } = await chrome.storage.local.get('teamsSyncLog');
  const stamped = `[${new Date().toLocaleString()}] ${line}`;
  await chrome.storage.local.set({ teamsSyncLog: [...teamsSyncLog, stamped].slice(-LOG_MAX) });
};

/** One run: `timer` (the alarm) or `now` (the page's Run now, any hour). */
const runTeamsSyncFromBackground = async (trigger) => {
  const at = Date.now();
  const record = async (run) => {
    await chrome.storage.local.set({ teamsSyncLastRun: { at, trigger, ...run } });
    return run;
  };
  if (trigger === 'timer') {
    const { teamsSyncAuto = false } = await chrome.storage.local.get('teamsSyncAuto');
    const skipped = skipReason({ enabled: teamsSyncAuto, nowMs: at, lock: await readTeamsLock() });
    // A timer that is off says nothing; anything else is worth knowing.
    if (skipped) return teamsSyncAuto ? record({ skipped }) : { skipped };
  }
  const outcome = await withTeamsLock(trigger, async () => {
    let mathmasterTab;
    let teamsTab;
    try {
      mathmasterTab = await findTab(MATHMASTER_URLS, 'MathMaster');
      teamsTab = await findTab(TEAMS_URLS, 'DeSoto TEAMS');
    } catch (error) {
      return record({ skipped: error.message });
    }
    if (trigger === 'timer' && await isTabInUse(teamsTab)) {
      return record({ skipped: 'You were using the TEAMS tab, so it was left alone; the next sync will try again.' });
    }
    await appendLog(`${trigger === 'timer' ? 'Automatic' : 'Requested'} sync started.`);
    try {
      const call = callTeamsBridge(mathmasterTab);
      const result = await runTimedTeamsSync({
        bridge: { listClasses: () => call('listClasses'), step: (payload) => call('step', payload) },
        teams: createTeamsAdapter({ run: runInTeams(teamsTab), log: appendLog }),
        runnerId: await runnerIdFor('teamsSyncRunnerId'),
        log: appendLog,
      });
      await appendLog('Sync finished.');
      return record(result);
    } catch (error) {
      await appendLog(`Sync stopped: ${error.message}`);
      return record({ error: String(error.message).slice(0, 240) });
    }
  });
  if (outcome.locked) return record({ skipped: 'Another sync is still running.' });
  return outcome.value;
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runTeamsSyncFromBackground('timer').catch((error) => appendLog(`Automatic sync failed: ${error.message}`));
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'teamsSync.runNow') {
    runTeamsSyncFromBackground('now').then(respond, (error) => respond({ error: error.message }));
    return true;
  }
  if (message?.type === 'teamsSync.setAuto') {
    chrome.storage.local.set({ teamsSyncAuto: message.enabled === true })
      .then(ensureAlarm)
      .then(async () => respond({ enabled: message.enabled === true, nextAt: (await chrome.alarms.get(ALARM))?.scheduledTime || null }));
    return true;
  }
  if (message?.type === 'teamsSync.nextAt') {
    ensureAlarm().then(async () => respond({ nextAt: (await chrome.alarms.get(ALARM))?.scheduledTime || null }));
    return true;
  }
  return false;
});
