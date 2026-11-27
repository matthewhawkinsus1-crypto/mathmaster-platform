// Everything the extension does inside a SchoolStatus page. Chrome injects
// `schoolStatusPage` into the teacher's signed-in SchoolStatus tab
// (chrome.scripting.executeScript, world MAIN), so the function is
// self-contained: it uses nothing from the module around it.
//
// Each call does one small thing on the page it finds and returns plain data.
// `{ waiting: true }` means the page is not there yet; the caller asks again.
// An error means the page is not what was expected, and nothing was changed.
//
// What these rely on was read from SchoolStatus Classic (secure.schoolstatus.com)
// on 2026-11-27, structure only:
//   app        paths under /r/ (My Students /r/my_students, a student's page
//              /r/students/:id/overview); a Rails page with React parts.
//   search     the navbar's "Search Students" box, a react-bootstrap-typeahead
//              (input.rbt-input-main, role=combobox).
//   sign-in    www.schoolstatus.com/log-in (another origin: no step runs there).
//
// NOT MAPPED YET: the student page, the guardians and the message composer.
// Until they are read from SchoolStatus with the teacher, every step but
// `where` refuses, so a run gives its message back and nothing is typed or
// sent.

export async function schoolStatusPage(action, _args = {}) {
  try {
    return { value: await (async () => {
      const onApp = location.origin === 'https://secure.schoolstatus.com' && /^\/r(\/|$)/.test(location.pathname);
      const signin = /log-?in|sign-?in|sessions?\/new/i.test(location.pathname) || !!document.querySelector('input[type=password]');
      if (action === 'where') {
        if (document.readyState !== 'complete') return { waiting: true };
        return { page: signin ? 'signin' : (onApp ? 'app' : 'other') };
      }
      throw new Error(`The step "${String(action).slice(0, 40)}" has not been mapped to SchoolStatus's pages yet, so nothing was done.`);
    })() };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}
