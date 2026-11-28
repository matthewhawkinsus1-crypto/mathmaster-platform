// The MathMaster extension's page: TEAMS grades (automatic sync, and each
// class by hand) and SchoolStatus family messages. Text only: nothing from
// MathMaster, TEAMS or SchoolStatus is ever put into the page as HTML.

import {
  MATHMASTER_URLS, SCHOOLSTATUS_URLS, TEAMS_URLS,
  callFamilyBridge, callTeamsBridge, familyMessagesAdapter, findTab, runInSchoolStatus, runInTeams, runnerIdFor,
} from './lib/chromeTabs.js';
import { withTeamsLock } from './lib/lock.js';
import { describeRun } from './lib/teams/schedule.js';
import { createTeamsAdapter } from './lib/teams/teamsAdapter.js';
import { runTeamsSync } from './lib/teams/runner.js';
import { createSchoolStatusAdapter } from './lib/schoolstatus/schoolStatusAdapter.js';
import { runFamilyMessages } from './lib/schoolstatus/runner.js';

const $ = (selector) => document.querySelector(selector);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  children.flat().forEach((child) => node.append(child instanceof Node ? child : document.createTextNode(String(child))));
  return node;
};
const logTo = (box) => (line) => {
  box.textContent += `[${new Date().toLocaleTimeString()}] ${line}\n`;
  box.scrollTop = box.scrollHeight;
};

/* ------------------------------------------------ TEAMS: automatic sync */

const showAuto = async () => {
  const { teamsSyncAuto = false, teamsSyncLastRun = null, teamsSyncLog = [] } = await chrome.storage.local.get(['teamsSyncAuto', 'teamsSyncLastRun', 'teamsSyncLog']);
  $('#auto').checked = teamsSyncAuto;
  $('#last').textContent = describeRun(teamsSyncLastRun);
  const { nextAt } = await chrome.runtime.sendMessage({ type: 'teamsSync.nextAt' });
  $('#next').textContent = teamsSyncAuto && nextAt ? `Next automatic sync: ${new Date(nextAt).toLocaleTimeString()} (only between 6 am and 10 pm).` : 'Automatic sync is off.';
  $('#autoLog').textContent = teamsSyncLog.join('\n');
};
$('#auto').onchange = async (event) => {
  await chrome.runtime.sendMessage({ type: 'teamsSync.setAuto', enabled: event.target.checked });
  showAuto();
};
$('#runNow').onclick = async () => {
  $('#runNow').disabled = true;
  $('#last').textContent = 'Syncing every linked class now…';
  try {
    await chrome.runtime.sendMessage({ type: 'teamsSync.runNow' });
  } finally {
    $('#runNow').disabled = false;
    showAuto();
  }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.teamsSyncLastRun || changes.teamsSyncLog || changes.teamsSyncAuto)) showAuto();
});

/* ------------------------------------------------ TEAMS: each class */

const log = logTo($('#log'));
let teamsBusy = false;
const setTeamsBusy = (value) => {
  teamsBusy = value;
  document.querySelectorAll('#classes button, #refresh').forEach((button) => { button.disabled = value; });
};
const mathmaster = async () => callTeamsBridge(await findTab(MATHMASTER_URLS, 'MathMaster'));
const teams = async () => createTeamsAdapter({ run: runInTeams(await findTab(TEAMS_URLS, 'DeSoto TEAMS')), log });

const STATUS_WORDS = { queued: 'queued', delivered: 'sent, not yet seen in TEAMS', verified: 'verified in TEAMS', preserved: 'kept as the teacher set it', held: 'held', excused: 'excused', blocked: 'blocked' };

const showResult = (card, result, dryRun) => {
  card.querySelector('.result')?.remove();
  const box = el('div', { className: 'result' });
  const response = result.response || {};
  const headline = {
    preview: 'Preview: nothing was changed in TEAMS.',
    done: 'Sync finished: TEAMS matches MathMaster for this class.',
    busy: 'Another TEAMS tab is syncing this class. Try again in a few minutes.',
    unfinished: 'The sync stopped before finishing. Run it again: it picks up where it left off.',
    work: 'The sync stopped before finishing. Run it again: it picks up where it left off.',
  }[result.status] || `Sync status: ${result.status}`;
  box.append(el('p', { className: result.status === 'done' || dryRun ? 'ok' : 'warn' }, headline));
  if (!dryRun) box.append(el('p', {}, `${result.applied} change(s) applied in TEAMS${result.failed ? `, ${result.failed} failed` : ''}.`));
  if (dryRun && response.ops?.length) {
    const counts = response.ops.reduce((acc, op) => ({ ...acc, [op.type]: (acc[op.type] || 0) + 1 }), {});
    const words = { createColumn: 'new TEAMS assignment(s)', setWeight: '#Count change(s)', importScores: 'grade import(s)', clearScores: 'clear(s)' };
    box.append(el('p', {}, `A sync would make: ${Object.entries(counts).map(([type, n]) => `${n} ${words[type] || type}`).join(', ')}${response.remainingOps ? `, then ${response.remainingOps} more` : ''}.`));
  }
  const summary = Object.entries(response.summary || {}).filter(([, n]) => n > 0);
  if (summary.length) {
    box.append(el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Grades'), el('th', {}, 'Count'))),
      el('tbody', {}, summary.map(([status, n]) => el('tr', {}, el('td', {}, STATUS_WORDS[status] || status), el('td', {}, n))))));
  }
  if (response.unreadSections?.length) box.append(el('p', { className: 'warn' }, `Not read: ${response.unreadSections.join(', ')}. Nothing is written for this class until every linked section is read.`));
  const exceptions = response.exceptions || [];
  if (exceptions.length) {
    const byMessage = new Map();
    exceptions.forEach((item) => byMessage.set(item.message || item.code, (byMessage.get(item.message || item.code) || 0) + 1));
    box.append(el('p', { className: 'warn' }, 'Needs your decision:'));
    box.append(el('ul', {}, [...byMessage].map(([text, n]) => el('li', {}, `${text}${n > 1 ? ` (${n})` : ''}`))));
  }
  card.append(box);
};

// Grade Export open: send its current grades first. Any other screen: use
// what MathMaster last published (it publishes every 30 minutes).
const publishIfGradeExportIsOpen = async (call, entry) => {
  try {
    const published = await call('publish', { classId: entry.classId });
    log(`MathMaster has ${published.targetCount} lesson section(s) for this marking period${published.droppedRows ? `; ${published.droppedRows} row(s) were not on the class roster and were left out` : ''}.`);
  } catch (error) {
    if (!/Open Grade Export/.test(error.message)) throw error;
    log(`Using the grades MathMaster last published${entry.targetsPublishedAt ? ` (${new Date(entry.targetsPublishedAt).toLocaleTimeString()})` : ''}. Open Grade Export to send the newest first.`);
  }
};

const syncClass = async (entry, card, dryRun) => {
  if (teamsBusy) return;
  setTeamsBusy(true);
  try {
    const outcome = await withTeamsLock('page', async () => {
      const sections = entry.sections.map((section) => section.sectionRef);
      log(`${dryRun ? 'Preview' : 'Sync'}: ${entry.label} (${sections.join(', ')})`);
      const call = await mathmaster();
      const adapter = await teams();
      await publishIfGradeExportIsOpen(call, entry);
      const id = await runnerIdFor('teamsSyncRunnerId');
      return runTeamsSync({
        mathmaster: { step: (payload) => call('step', { classId: entry.classId, runnerId: id, ...payload }) },
        teams: adapter,
        sections,
        dryRun,
        log,
      });
    });
    if (outcome.locked) throw new Error('A sync is already running (automatic or from this page). Try again when it finishes.');
    log(`${dryRun ? 'Preview' : 'Sync'} ${outcome.value.status}.`);
    showResult(card, outcome.value, dryRun);
  } catch (error) {
    log(`Stopped: ${error.message}`);
    card.querySelector('.result')?.remove();
    card.append(el('div', { className: 'result' }, el('p', { className: 'bad' }, `Stopped: ${error.message}`)));
  } finally {
    setTeamsBusy(false);
  }
};

const linkSections = async (entry, card) => {
  if (teamsBusy) return;
  setTeamsBusy(true);
  try {
    const adapter = await teams();
    log('Reading your TEAMS course sections…');
    const sections = await adapter.listSections();
    card.querySelector('fieldset')?.remove();
    const linked = new Set(entry.sections.map((section) => section.sectionRef));
    const set = el('fieldset', {}, el('legend', {}, `TEAMS section(s) for ${entry.label}: an inclusion class has two`));
    sections.forEach((section) => {
      const box = el('input', { type: 'checkbox', value: section.sectionRef, checked: linked.has(section.sectionRef) });
      set.append(el('label', {}, box, ` ${section.sectionRef} · ${section.description} · period ${section.period} (${section.day} day)`));
    });
    const save = el('button', { type: 'button', className: 'primary' }, 'Save sections');
    save.onclick = async () => {
      const chosen = [...set.querySelectorAll('input:checked')].map((box) => {
        const section = sections.find((item) => item.sectionRef === box.value);
        return { sectionRef: box.value, label: `${section.description} · period ${section.period}` };
      });
      if (chosen.length < 1 || chosen.length > 3) { log('Choose one to three TEAMS sections.'); return; }
      setTeamsBusy(true);
      try {
        await (await mathmaster())('linkSections', { classId: entry.classId, sections: chosen });
        log(`Linked ${entry.label} to ${chosen.map((item) => item.sectionRef).join(', ')}.`);
        await loadClasses();
      } catch (error) {
        log(`Could not link: ${error.message}`);
      } finally {
        setTeamsBusy(false);
      }
    };
    set.append(save);
    card.append(set);
  } catch (error) {
    log(`Stopped: ${error.message}`);
  } finally {
    setTeamsBusy(false);
  }
};

const loadClasses = async () => {
  const list = $('#classes');
  list.textContent = '';
  try {
    const classes = await (await mathmaster())('listClasses');
    if (!classes.length) { list.append(el('p', {}, 'MathMaster shows no classes you can sync.')); return; }
    classes.forEach((entry) => {
      const card = el('section', { className: 'card' });
      card.append(el('h3', {}, entry.label));
      const meta = entry.sections.length ? `TEAMS: ${entry.sections.map((section) => section.sectionRef).join(' + ')}` : 'Not linked to TEAMS yet.';
      const last = entry.lastStep?.at ? ` · Last sync ${new Date(entry.lastStep.at).toLocaleString()} (${entry.lastStep.status})` : '';
      card.append(el('p', { className: 'meta' }, meta + last));
      const buttons = el('div', { className: 'row' });
      const link = el('button', { type: 'button' }, entry.sections.length ? 'Change TEAMS sections' : 'Link TEAMS sections');
      link.onclick = () => linkSections(entry, card);
      buttons.append(link);
      if (entry.sections.length) {
        const preview = el('button', { type: 'button' }, 'Preview');
        preview.onclick = () => syncClass(entry, card, true);
        const sync = el('button', { type: 'button', className: 'primary' }, 'Sync');
        sync.onclick = () => syncClass(entry, card, false);
        buttons.append(preview, sync);
      }
      card.append(buttons);
      list.append(card);
    });
  } catch (error) {
    list.append(el('p', { className: 'bad' }, error.message));
  }
};
$('#refresh').onclick = () => { if (!teamsBusy) loadClasses(); };

/* ------------------------------------------------ SchoolStatus messages */

const ssLog = logTo($('#ssLog'));
let ssRunning = false;
let stopRequested = false;
let pendingConfirm = null;
const familyMessages = async () => familyMessagesAdapter(callFamilyBridge(await findTab(MATHMASTER_URLS, 'MathMaster')));
const schoolstatus = async () => createSchoolStatusAdapter({ run: runInSchoolStatus(await findTab(SCHOOLSTATUS_URLS, 'SchoolStatus')) });

const setSsRunning = (value) => {
  ssRunning = value;
  $('#ssRefresh').disabled = value;
  $('#send').disabled = value || $('#send').dataset.ready !== 'yes';
  $('#stop').disabled = !value;
};

const showStatus = (status) => {
  const banner = $('#banner');
  const mode = status?.mode || 'off';
  banner.className = `banner ${mode}`;
  banner.textContent = {
    test: `TEST MODE: only test students (${(status.testDistrictIds || []).join(', ') || 'none listed'}), and you confirm every message here before it goes.`,
    live: 'LIVE: messages go to families.',
    off: 'Sending to families is turned off in MathMaster (Discipline Tracker → Messages to families).',
  }[mode] || `Unknown mode: ${mode}`;
  $('#counts').textContent = status ? `${status.queued} queued · ${status.inFlight} sending now · ${status.needsTeacher} need you on the Discipline Tracker` : '—';
  $('#send').dataset.ready = mode !== 'off' && status?.queued > 0 ? 'yes' : 'no';
  setSsRunning(ssRunning);
};

const refreshMessages = async () => {
  try {
    showStatus(await (await familyMessages()).status());
  } catch (error) {
    showStatus(null);
    $('#banner').className = 'banner off';
    $('#banner').textContent = error.message;
  }
};

// The test-mode check: the exact message and who gets it. True only on "Send this test message".
const confirmTest = (preview) => new Promise((resolve) => {
  const card = $('#confirm');
  $('#c-student').textContent = preview.studentName || '';
  $('#c-id').textContent = preview.sisStudentId || '';
  const recipients = preview.recipients || [];
  $('#c-recipients').textContent = `${recipients.length} text${recipients.length === 1 ? '' : 's'}, one to each: ${recipients.join(', ')}`;
  $('#c-body').textContent = preview.body;
  card.hidden = false;
  card.scrollIntoView({ block: 'center' });
  const done = (answer) => {
    card.hidden = true;
    ['#c-student', '#c-id', '#c-recipients', '#c-body'].forEach((selector) => { $(selector).textContent = ''; });
    pendingConfirm = null;
    resolve(answer);
  };
  pendingConfirm = done;
  $('#c-yes').onclick = () => done(true);
  $('#c-no').onclick = () => done(false);
  $('#c-yes').focus();
});

$('#send').onclick = async () => {
  if (ssRunning) return;
  stopRequested = false;
  setSsRunning(true);
  try {
    const result = await runFamilyMessages({
      mathmaster: await familyMessages(),
      schoolstatus: await schoolstatus(),
      runnerId: await runnerIdFor('familyMessagesRunnerId'),
      confirmTest,
      shouldStop: () => stopRequested,
      log: ssLog,
    });
    const { sent, failed, unknown, released, notStarted } = result.counts;
    ssLog(`Run ${result.stopped ? `stopped: ${result.reason}` : 'finished'}. Sent ${sent}, not sent ${failed + notStarted}, unknown ${unknown}, given back ${released}.`);
    if (unknown) ssLog('Unknown messages wait for you on the Discipline Tracker: check SchoolStatus, then choose "It was sent" or "Send again".');
  } catch (error) {
    ssLog(`Stopped: ${error.message}`);
  } finally {
    setSsRunning(false);
    refreshMessages();
  }
};
$('#stop').onclick = () => {
  stopRequested = true;
  ssLog('Stopping after this step…');
  if (pendingConfirm) pendingConfirm(false);
};
$('#ssRefresh').onclick = () => { if (!ssRunning) refreshMessages(); };

showAuto();
loadClasses();
refreshMessages();
