// The sync page. It finds the teacher's MathMaster and TEAMS tabs, lists the
// classes Grade Transfer can sync, links a class to its TEAMS section(s), and
// runs a preview or a sync (lib/runner.js) while the teacher watches.

import { MATHMASTER_URLS, TEAMS_URLS, callMathMaster, findTab, runInTeams } from './lib/chromeTabs.js';
import { createTeamsAdapter } from './lib/teamsAdapter.js';
import { runTeamsSync } from './lib/runner.js';

const $ = (selector) => document.querySelector(selector);
const logBox = $('#log');
const log = (line) => {
  const stamp = new Date().toLocaleTimeString();
  logBox.textContent += `[${stamp}] ${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
};
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  children.flat().forEach((child) => node.append(child instanceof Node ? child : document.createTextNode(String(child))));
  return node;
};

// One runner id per browser profile, so the server's lease knows this tab's
// batches from another computer's.
const runnerId = async () => {
  const { teamsSyncRunnerId } = await chrome.storage.local.get('teamsSyncRunnerId');
  if (teamsSyncRunnerId) return teamsSyncRunnerId;
  const id = `ext-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await chrome.storage.local.set({ teamsSyncRunnerId: id });
  return id;
};

let running = false;
const setRunning = (value) => {
  running = value;
  document.querySelectorAll('button').forEach((button) => { button.disabled = value; });
};

const mathmaster = async () => callMathMaster(await findTab(MATHMASTER_URLS, 'MathMaster'));
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

const syncClass = async (entry, card, dryRun) => {
  if (running) return;
  setRunning(true);
  try {
    const sections = entry.sections.map((section) => section.sectionRef);
    log(`${dryRun ? 'Preview' : 'Sync'}: ${entry.label} (${sections.join(', ')})`);
    const call = await mathmaster();
    const adapter = await teams();
    const readbacks = {};
    for (const ref of sections) {
      log(`Reading TEAMS section ${ref}…`);
      readbacks[ref] = await adapter.readSection(ref);
    }
    const starts = Object.values(readbacks).map((readback) => readback.markingPeriods?.[0]?.start).filter(Boolean).sort();
    const published = await call('publish', { classId: entry.classId, dueOnOrAfter: starts[0] || '' });
    log(`MathMaster has ${published.targetCount} lesson section(s) for this marking period${published.droppedRows ? `; ${published.droppedRows} row(s) were not on the class roster and were left out` : ''}.`);
    const id = await runnerId();
    const result = await runTeamsSync({
      mathmaster: { step: (payload) => call('step', { classId: entry.classId, runnerId: id, ...payload }) },
      teams: adapter,
      sections,
      dryRun,
      initialReadbacks: readbacks,
      log,
    });
    log(`${dryRun ? 'Preview' : 'Sync'} ${result.status}.`);
    showResult(card, result, dryRun);
  } catch (error) {
    log(`Stopped: ${error.message}`);
    card.querySelector('.result')?.remove();
    card.append(el('div', { className: 'result' }, el('p', { className: 'bad' }, `Stopped: ${error.message}`)));
  } finally {
    setRunning(false);
  }
};

const linkSections = async (entry, card) => {
  if (running) return;
  setRunning(true);
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
      setRunning(true);
      try {
        await (await mathmaster())('linkSections', { classId: entry.classId, sections: chosen });
        log(`Linked ${entry.label} to ${chosen.map((item) => item.sectionRef).join(', ')}.`);
        await loadClasses();
      } catch (error) {
        log(`Could not link: ${error.message}`);
      } finally {
        setRunning(false);
      }
    };
    set.append(save);
    card.append(set);
  } catch (error) {
    log(`Stopped: ${error.message}`);
  } finally {
    setRunning(false);
  }
};

const loadClasses = async () => {
  const list = $('#classes');
  list.textContent = '';
  try {
    const classes = await (await mathmaster())('listClasses');
    if (!classes.length) { list.append(el('p', {}, 'Grade Transfer shows no classes you can sync.')); return; }
    classes.forEach((entry) => {
      const card = el('section', { className: 'card' });
      card.append(el('h2', {}, entry.label));
      const meta = entry.sections.length
        ? `TEAMS: ${entry.sections.map((section) => section.sectionRef).join(' + ')}`
        : 'Not linked to TEAMS yet.';
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

$('#refresh').onclick = () => { if (!running) loadClasses(); };
loadClasses();
