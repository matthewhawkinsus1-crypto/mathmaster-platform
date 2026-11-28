// Everything the extension does inside a SchoolStatus page. Chrome injects
// `schoolStatusPage` into the teacher's signed-in SchoolStatus tab
// (chrome.scripting.executeScript, world MAIN), so the function is
// self-contained: it uses nothing from the module around it.
//
// Each call does one small thing on the page it finds and returns plain data.
// `{ waiting: true }` means the page is not there yet; the caller asks again.
// An error means the page is not what was expected, and nothing was changed.
// No step returns a guardian's name, number or email, or a message's text.
//
// What these rely on was read from SchoolStatus Classic (secure.schoolstatus.com)
// on 2026-11-27, structure only, with the teacher:
//   app        paths under /r/; My Students is /r/my_students.
//   search     the navbar's "Search Students" box (.student-search-container
//              input.rbt-input-main, a react-bootstrap-typeahead). Typing a
//              student's SIS ID lists that one student (.rbt-menu
//              a.dropdown-item: name, grade, State ID); clicking it opens
//              their page. The menu keeps the LAST search's results for
//              about 1.5 s after typing, until its request
//              (…/typeahead/students?text_filter=…) answers, so the results
//              are read only after that request for this ID has finished,
//              on a freshly loaded page (the typeahead caches answers).
//   student    /r/my_students/students/<uuid>/<tab>. The profile card
//              (.card-profile) has h5.card-title (the name) and labelled
//              values: "SIS ID #:" then span.text-info. Tabs: Overview,
//              Contacts, Attendance, ….
//   contacts   /…/contacts: one card per contact, with h5.card-title (name),
//              the relationship ("Mother", "Father") in the next
//              div.d-flex.align-items-center, and round buttons Call
//              (.icon-phone), Text (.icon-chat), Email (.icon-mail).
//   text       Text opens a sidebar ([class*=SidebarPanel]) with the
//              conversation (ul.media-list-conversation; the teacher's own
//              messages are li.media-current-user, each with
//              [class*=ChatBubble__Text] and a status word in <small>, e.g.
//              "undelivered"), an editable box ([contenteditable=true],
//              placeholder "Send to <student>'s <relationship>"), a counter
//              "0/480", auto-translate to the contact's preferred language,
//              and a Send button ([class*=SendButton], disabled while empty).
//
// NOT YET CHECKED LIVE (no test student exists yet): pasting into the box,
// pressing Send, and what a new text looks like as it is sent. Those steps are
// written to stop (an error, nothing pressed) at anything they do not find.

export async function schoolStatusPage(action, args = {}) {
  try {
    return { value: await (async () => {
      const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
      const shown = (el) => {
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        const box = el?.getBoundingClientRect?.();
        return !!box && box.width > 0 && box.height > 0;
      };
      const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
      const onApp = location.origin === 'https://secure.schoolstatus.com' && /^\/r(\/|$)/.test(location.pathname);
      const studentPath = /^\/r\/my_students\/students\/([0-9a-f-]{20,})\/([a-z_]+)/.exec(location.pathname);
      const busy = () => document.readyState !== 'complete';
      const searchInput = () => [...document.querySelectorAll('.student-search-container input.rbt-input-main')].find(shown) || null;
      const resultItems = () => [...document.querySelectorAll('.rbt-menu a.dropdown-item')].filter(shown);
      const profile = () => document.querySelector('.card-profile');
      const panel = () => [...document.querySelectorAll('[class*=SidebarPanel]')].find(shown) || null;
      const box = () => panel()?.querySelector('[contenteditable=true]') || null;
      const sendButton = () => panel()?.querySelector('button[class*=SendButton]') || null;
      const ownBubbles = () => [...(panel()?.querySelectorAll('.media-list-conversation li.media-current-user') || [])];
      const contactCards = () => [...document.querySelectorAll('button.rounded-circle')]
        .filter((button) => button.querySelector('.icon-chat'))
        .map((chat) => {
          let card = chat;
          for (let i = 0; i < 8 && card && !card.querySelector('h5.card-title'); i += 1) card = card.parentElement;
          return { chat, card };
        })
        .filter((entry) => entry.card && shown(entry.chat));
      const relationshipOf = (card) => norm(card.querySelector('h5.card-title')?.nextElementSibling?.textContent);
      const typedText = () => norm(box()?.innerText);
      const setValue = (input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };

      switch (action) {
        case 'where': {
          if (busy()) return { waiting: true };
          const signin = /log-?in|sign-?in|sessions?\/new/i.test(location.pathname) || !!document.querySelector('input[type=password]');
          return { page: signin ? 'signin' : (onApp ? 'app' : 'other'), student: !!studentPath, tab: studentPath?.[2] || '' };
        }
        case 'home': {
          if (!onApp) throw new Error('Not on SchoolStatus.');
          // Always a fresh load: it empties the search box's cache, and the
          // marker tells `atHome` the old page has gone.
          window.__mmLeaving = true;
          location.assign('/r/my_students');
          return { ok: true };
        }
        case 'atHome': {
          if (window.__mmLeaving || busy() || location.pathname !== '/r/my_students' || !searchInput()) return { waiting: true };
          return { ok: true };
        }
        case 'search': {
          const input = searchInput();
          if (!input) return { waiting: true };
          const id = String(args.sisStudentId || '');
          if (!/^\d{1,20}$/.test(id)) throw new Error('A district ID is digits only.');
          input.focus();
          setValue(input, '');
          await sleep(150);
          window.__mmSearch = { id, at: performance.now() };
          setValue(input, id);
          return { ok: true };
        }
        case 'searchResults': {
          const asked = window.__mmSearch;
          if (!asked || asked.id !== String(args.sisStudentId || '')) throw new Error('No search for this district ID was started.');
          // This search's own request, finished after it was typed.
          const answered = performance.getEntriesByType('resource').find((entry) => {
            try {
              const url = new URL(entry.name);
              return url.pathname.endsWith('/typeahead/students') && url.searchParams.get('text_filter') === asked.id && entry.startTime >= asked.at - 5 && entry.responseEnd > 0;
            } catch { return false; }
          });
          if (!answered || performance.now() - answered.responseEnd < 500) return { waiting: true };
          const menu = document.querySelector('.rbt-menu');
          if (!menu) return { waiting: true };
          const items = resultItems();
          // "No matches found." shows as a disabled item.
          const empty = !items.length || items.every((item) => item.classList.contains('disabled') || /no matches|no results/i.test(item.textContent));
          return { count: empty ? 0 : items.filter((item) => !item.classList.contains('disabled')).length };
        }
        case 'openResult': {
          const items = resultItems().filter((item) => !item.classList.contains('disabled'));
          if (items.length !== 1) throw new Error(`Expected one search result, found ${items.length}.`);
          items[0].click();
          return { ok: true };
        }
        case 'readStudent': {
          if (busy() || !studentPath || !profile()) return { waiting: true };
          const card = profile();
          const label = [...card.querySelectorAll('span')].find((span) => norm(span.textContent) === 'SIS ID #:');
          return {
            studentKey: studentPath[1],
            sis: norm(label?.nextElementSibling?.textContent),
            name: norm(card.querySelector('h5.card-title')?.textContent),
          };
        }
        case 'openContacts': {
          if (!studentPath) throw new Error('Not on a student\'s page.');
          if (studentPath[2] === 'contacts') return { ok: true };
          const link = [...document.querySelectorAll('a')].find((a) => new RegExp(`/students/${studentPath[1]}/contacts$`).test(a.getAttribute('href') || ''));
          if (!link) throw new Error('The student\'s Contacts tab was not found.');
          link.click();
          return { ok: true };
        }
        case 'readContacts': {
          if (busy() || studentPath?.[2] !== 'contacts' || studentPath[1] !== args.studentKey) return { waiting: true };
          const heading = [...document.querySelectorAll('h4')].find((h) => norm(h.textContent) === 'Contacts');
          if (!heading) return { waiting: true };
          const cards = contactCards();
          // Give the cards a moment to draw after the heading.
          if (!cards.length && Date.now() - (window.__mmContactsSeenAt ||= Date.now()) < 3000) return { waiting: true };
          delete window.__mmContactsSeenAt;
          return { contacts: cards.map((entry, index) => ({ index, relationship: relationshipOf(entry.card), canText: !entry.chat.disabled })) };
        }
        case 'openThread': {
          const cards = contactCards();
          const entry = cards[args.index];
          if (!entry || relationshipOf(entry.card) !== args.relationship) throw new Error('The contact list changed; nothing was opened.');
          entry.chat.click();
          return { ok: true };
        }
        case 'readThread': {
          const editable = box();
          if (!editable) return { waiting: true };
          const placeholder = norm(editable.getAttribute('placeholder'));
          if (!placeholder.endsWith(`'s ${args.relationship}`)) return { waiting: true };
          const counter = /(\d+)\s*\/\s*(\d+)/.exec(norm(panel().querySelector('[class*=Counter]')?.textContent));
          return { ready: true, maxLength: counter ? Number(counter[2]) : null, own: ownBubbles().length, typedLength: typedText().length };
        }
        case 'fill': {
          const editable = box();
          if (!editable) throw new Error('The text box is not open.');
          if (!norm(editable.getAttribute('placeholder')).endsWith(`'s ${args.relationship}`)) throw new Error('The open text box is for someone else.');
          const body = String(args.body || '');
          editable.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          document.execCommand('insertText', false, body);
          await sleep(200);
          const counter = /(\d+)\s*\/\s*(\d+)/.exec(norm(panel().querySelector('[class*=Counter]')?.textContent));
          return { exact: typedText() === norm(body), counted: counter ? Number(counter[1]) : null, sendEnabled: !!sendButton() && !sendButton().disabled };
        }
        case 'clear': {
          const editable = box();
          if (!editable) return { ok: true, empty: true };
          editable.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          await sleep(150);
          return { ok: true, empty: typedText() === '' };
        }
        case 'pressSend': {
          // The last look before a text goes to a family: the right person,
          // exactly this message, and a Send button that is ready.
          const editable = box();
          const button = sendButton();
          if (!editable || !button) throw new Error('The text box is not open.');
          if (!norm(editable.getAttribute('placeholder')).endsWith(`'s ${args.relationship}`)) throw new Error('The open text box is for someone else.');
          if (typedText() !== norm(args.body)) throw new Error('The text box does not hold exactly this message.');
          if (button.disabled) throw new Error('SchoolStatus\'s Send button is not ready.');
          button.click();
          return { pressed: true };
        }
        case 'readSent': {
          const own = ownBubbles();
          const error = [...document.querySelectorAll('.ant-message-error, .ant-notification-notice-error, .alert-danger')].some(shown);
          if (own.length <= Number(args.ownBefore)) return { appeared: false, error, stillTyped: typedText().length > 0 };
          const newest = own[own.length - 1];
          const status = norm(newest.querySelector('small')?.textContent).toLowerCase();
          const shownText = norm(newest.querySelector('[class*=ChatBubble__Text]')?.textContent);
          return { appeared: true, status, textMatches: shownText === norm(args.body), error };
        }
        default:
          throw new Error(`Unknown step "${String(action).slice(0, 40)}".`);
      }
    })() };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}
