// The toolbar button opens (or brings forward) the messages page. Everything
// else runs on that page, while the teacher watches it.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('panel.html');
  const [tab] = await chrome.tabs.query({ url });
  if (tab) await chrome.tabs.update(tab.id, { active: true });
  else await chrome.tabs.create({ url });
});
