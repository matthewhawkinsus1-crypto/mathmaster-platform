// Checks every teacher-workflow journey makes, whatever it drives.
//
// A callable the harness does not implement fails loudly (fakeFunctions.js):
// it rejects as an undeployed function would and logs one console error. A
// journey that reaches one has walked a path the harness cannot vouch for, so
// the runner reports it — collected from the console, which survives the page
// loads a journey makes (window state does not).

const UNIMPLEMENTED = /^\[teacher harness\] callable "([^"]+)" is not implemented/;

/** Start collecting; returns a function that lists the callables reached so far. */
export const watchUnimplementedCallables = (page) => {
  const names = [];
  page.on('console', (message) => {
    const match = UNIMPLEMENTED.exec(message.text());
    if (match) names.push(match[1]);
  });
  return () => [...new Set(names)];
};

export default watchUnimplementedCallables;
