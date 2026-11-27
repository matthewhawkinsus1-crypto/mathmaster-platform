// The messages page. It finds the teacher's MathMaster and SchoolStatus tabs,
// shows the switch (off / TEST / LIVE) and the queue, and runs the send loop
// (lib/runner.js) while the teacher watches. In test mode the teacher
// confirms each message here before Send.
//
// Text only: nothing from MathMaster or SchoolStatus is ever put into the
// page as HTML.

import { MATHMASTER_URLS, SCHOOLSTATUS_URLS, callMathMaster, findTab, mathmasterAdapter, runInSchoolStatus } from './lib/chromeTabs.js';
import { createSchoolStatusAdapter } from './lib/schoolStatusAdapter.js';
import { schoolStatusPage } from './lib/schoolStatusPage.js';
import { runFamilyMessages } from './lib/runner.js';

const $ = (selector) => document.querySelector(selector);
const logBox = $('#log');
const log = (line) => {
  logBox.textContent += `[${new Date().toLocaleTimeString()}] ${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
};

// One runner id per browser profile, so the server knows this tab's claims.
const runnerId = async () => {
  const { familyMessagesRunnerId } = await chrome.storage.local.get('familyMessagesRunnerId');
  if (familyMessagesRunnerId) return familyMessagesRunnerId;
  const id = `ext-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await chrome.storage.local.set({ familyMessagesRunnerId: id });
  return id;
};

const mathmaster = async () => mathmasterAdapter(callMathMaster(await findTab(MATHMASTER_URLS, 'MathMaster')));
const schoolstatus = async () => createSchoolStatusAdapter({ run: runInSchoolStatus(await findTab(SCHOOLSTATUS_URLS, 'SchoolStatus'), schoolStatusPage) });

let running = false;
let stopRequested = false;
let pendingConfirm = null;

const setRunning = (value) => {
  running = value;
  $('#refresh').disabled = value;
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
  $('#counts').textContent = status
    ? `${status.queued} queued · ${status.inFlight} sending now · ${status.needsTeacher} need you on the Discipline Tracker`
    : '—';
  $('#send').dataset.ready = mode !== 'off' && status?.queued > 0 ? 'yes' : 'no';
  setRunning(running);
};

const refresh = async () => {
  try {
    showStatus(await (await mathmaster()).status());
  } catch (error) {
    showStatus(null);
    $('#banner').className = 'banner off';
    $('#banner').textContent = error.message;
  }
};

// The test-mode check: the exact message, its student and SchoolStatus's
// recipient count. Resolves true only on "Send this test message".
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
  if (running) return;
  stopRequested = false;
  setRunning(true);
  try {
    const result = await runFamilyMessages({
      mathmaster: await mathmaster(),
      schoolstatus: await schoolstatus(),
      runnerId: await runnerId(),
      confirmTest,
      shouldStop: () => stopRequested,
      log,
    });
    const { sent, failed, unknown, released, notStarted } = result.counts;
    log(`Run ${result.stopped ? `stopped: ${result.reason}` : 'finished'}. Sent ${sent}, not sent ${failed + notStarted}, unknown ${unknown}, given back ${released}.`);
    if (unknown) log('Unknown messages wait for you on the Discipline Tracker: check SchoolStatus, then choose "It was sent" or "Send again".');
  } catch (error) {
    log(`Stopped: ${error.message}`);
  } finally {
    setRunning(false);
    refresh();
  }
};

$('#stop').onclick = () => {
  stopRequested = true;
  log('Stopping after this step…');
  if (pendingConfirm) pendingConfirm(false);
};
$('#refresh').onclick = () => { if (!running) refresh(); };
refresh();
