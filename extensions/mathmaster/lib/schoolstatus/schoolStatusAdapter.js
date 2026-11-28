// The SchoolStatus side of the runner (runner.js): each runner step as small
// page steps (schoolStatusPage.js), waiting through SchoolStatus's loads.
//
// `run(action, args)` runs one schoolStatusPage step in the teacher's
// SchoolStatus tab. While the tab navigates, Chrome cannot run a step, so
// `run` may reject with `{ navigating: true }`; that counts as "not there
// yet", like `{ waiting: true }`. Anything the page does not recognize ends
// the run (stopRun): the extension never guesses on a page that can text a
// family.
//
// Names, numbers and message text read from the page stay in this module's
// variables for the checks below; nothing here logs them.

import { sameStudentName, stopRun } from './runner.js';

export const PAGE_TIMEOUT_MS = 30000;
// After Send: how long to wait for the new text in the conversation, then
// for SchoolStatus to mark it undelivered.
export const SENT_TIMEOUT_MS = 20000;
export const DELIVERY_WAIT_MS = 8000;

// The contacts who get the text: parents and guardians, as SchoolStatus
// labels them. Anyone else it lists (an emergency contact, a grandparent who
// is not a guardian, the student) is left out and counted in the log.
const GUARDIAN = /^(mother|father|parent|guardian|legal guardian|step[- ]?mother|step[- ]?father|step[- ]?parent|foster (mother|father|parent)|parent\/guardian)$/i;
export const isParentOrGuardian = (relationship) => GUARDIAN.test(String(relationship ?? '').replace(/\s+/g, ' ').trim());

/** One district number, however many leading zeros it was written with. */
export const sameDistrictId = (left, right) => {
  const canonical = (value) => (/^\d{1,20}$/.test(String(value ?? '').trim()) ? String(value).trim().replace(/^0+(?=\d)/, '') : '');
  const a = canonical(left);
  return Boolean(a) && a === canonical(right);
};

export const createSchoolStatusAdapter = ({
  run, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = PAGE_TIMEOUT_MS, sentTimeoutMs = SENT_TIMEOUT_MS, deliveryWaitMs = DELIVERY_WAIT_MS, now = () => Date.now(),
}) => {
  const until = async (action, args = {}, limitMs = timeoutMs) => {
    const started = now();
    for (;;) {
      let result;
      try {
        result = await run(action, args);
      } catch (error) {
        if (!error?.navigating) throw stopRun(`SchoolStatus: ${String(error?.message || error).slice(0, 200)}`);
        result = { waiting: true };
      }
      if (!result?.waiting) return result;
      if (now() - started > limitMs) throw stopRun(`SchoolStatus did not finish loading (${action}). Check the SchoolStatus tab: are you still signed in?`);
      await wait(400);
    }
  };

  // The guardian whose text box is open, and what it held before Send.
  let current = null;

  const goHome = async () => {
    await until('home');
    await until('atHome');
  };

  return {
    async where() {
      const here = await until('where');
      if (here.page === 'signin') throw stopRun('SchoolStatus is signed out. Sign in in that tab, then run again.');
      if (here.page !== 'app') throw stopRun('The SchoolStatus tab is not on SchoolStatus. Open it, then run again.');
      return here;
    },

    async findStudent({ sisStudentId, studentName }) {
      current = null;
      await goHome();
      await until('search', { sisStudentId });
      const { count } = await until('searchResults', { sisStudentId });
      if (count === 0) return { ok: false, reason: 'No SchoolStatus student has that district ID.' };
      if (count > 1) return { ok: false, reason: `SchoolStatus found ${count} students for that district ID.` };
      await until('openResult');
      const student = await until('readStudent');
      if (!sameDistrictId(student.sis, sisStudentId)) return { ok: false, reason: 'The student SchoolStatus opened has a different SIS ID.' };
      if (!sameStudentName(studentName, student.name)) return { ok: false, reason: 'The name SchoolStatus shows does not match MathMaster\'s.' };
      await until('openContacts');
      const { contacts } = await until('readContacts', { studentKey: student.studentKey });
      const guardians = contacts.filter((contact) => isParentOrGuardian(contact.relationship) && contact.canText)
        .map((contact) => ({ index: contact.index, relationship: contact.relationship }));
      return { ok: true, guardians, skipped: contacts.length - guardians.length };
    },

    async openThread(guardian) {
      await until('openThread', guardian);
      const thread = await until('readThread', { relationship: guardian.relationship });
      current = { ...guardian, own: thread.own, body: '' };
      if (thread.typedLength > 0) {
        // Something is already typed in this box (a draft): clear it first.
        const cleared = await until('clear');
        if (!cleared.empty) return { ok: false, reason: 'The text box already held a draft that could not be cleared.' };
      }
      return { ok: true, maxLength: thread.maxLength };
    },

    async fill({ body }) {
      if (!current) throw stopRun('No text box is open.');
      const result = await until('fill', { body, relationship: current.relationship });
      if (!result.exact) throw stopRun('SchoolStatus did not take the message exactly as written.');
      if (result.counted !== null && result.counted !== String(body).length) throw stopRun(`SchoolStatus counted ${result.counted} characters, not ${String(body).length}.`);
      if (!result.sendEnabled) throw stopRun('SchoolStatus\'s Send button did not become ready.');
      current.body = body;
    },

    async discard() {
      await until('clear');
    },

    async pressSend() {
      if (!current?.body) throw stopRun('Nothing is ready to send.');
      await until('pressSend', { body: current.body, relationship: current.relationship });
    },

    async confirmSent() {
      if (!current) return { seen: false, reason: 'No text box was open.' };
      const started = now();
      let appearedAt = null;
      for (;;) {
        let read;
        try {
          read = await run('readSent', { ownBefore: current.own, body: current.body });
        } catch (error) {
          if (!error?.navigating) return { seen: false, reason: `SchoolStatus: ${String(error?.message || error).slice(0, 160)}` };
          read = { appeared: false };
        }
        if (read?.appeared) {
          appearedAt ??= now();
          if (/undelivered|failed|error/.test(read.status || '')) return { seen: true, delivered: false, reason: read.status };
          // Give SchoolStatus a few seconds to say it could not deliver.
          if (now() - appearedAt >= deliveryWaitMs) return { seen: true, delivered: true, reason: read.status || '' };
        } else if (read?.error) {
          return { seen: false, reason: 'SchoolStatus showed an error after Send.' };
        }
        if (!appearedAt && now() - started > sentTimeoutMs) return { seen: false, reason: 'SchoolStatus did not show the text in the conversation.' };
        await wait(500);
      }
    },

    home: goHome,
  };
};
