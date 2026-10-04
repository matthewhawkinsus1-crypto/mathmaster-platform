// A QUESTION FAMILY PIN THAT WILL NOT REPLAY IS CONTAINED TO ITS QUESTION.
//
//   npx vite --host 127.0.0.1 --port 5198 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5198 node tests/browser/familyPinContainment.mjs [--slow]
//
// Student assignment, already-correct answer, teacher preview, an
// unanticipated throw while a question is prepared, and a Recovery
// assessment. In each: the broken question shows a question-level panel, the
// student can leave and come back, the other questions work, a reload does not
// turn it into an app crash, and nothing is graded, spent, pinned or erased.
// `--slow` adds 6× CPU throttling (a Chromebook).
//
// Exit code 1 on any finding.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5198';
const SLOW = process.argv.includes('--slow');
const ONLY = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length);

const findings = [];
let checks = 0;
const step = (text) => { checks += 1; console.log(`  ✓ ${text}`); };
const fail = (text, detail = null) => { findings.push({ text, detail }); console.log(`  ✗ ${text}${detail ? `\n${typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}` : ''}`); };
const expect = (condition, text, detail = null) => (condition ? step(text) : fail(text, detail));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

const open = async (query) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  if (SLOW) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  }
  await page.goto(`${ORIGIN}/tests/browser/familyPinContainment.html?${query}`, { timeout: 300000 });
  return { context, page, pageErrors };
};

const api = (page, expr, ...args) => page.evaluate(([source, values]) => {
  // eslint-disable-next-line no-new-func
  return new Function('pins', 'args', `return (${source})(pins, ...args);`)(window.__pins, values);
}, [expr.toString(), args]);

const failurePanel = (page) => page.locator('[data-question-resolution-failure]');
const settle = async (page) => {
  await page.waitForFunction(() => !document.body.textContent.includes('Opening Work View…'), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(SLOW ? 900 : 300);
};
const uncaught = async (page) => (await api(page, (pins) => pins.errors())).filter((entry) => entry.source === 'react.uncaught' || entry.source === 'window.error');
const submitVisible = async (page) => page.getByRole('button', { name: /^Submit/ }).count();
const goTo = async (page, index) => {
  await page.locator(`[data-nav="${index}"]`).click();
  await settle(page);
};
const questionRendered = async (page) => page.locator('[data-question-stage] input, [data-question-stage] math-field, [data-question-stage] [contenteditable="true"], [data-question-stage] button[aria-label*="operation" i], [data-question-stage] .mathmaster-step-algebra').count();
const noCrash = async (page, where) => {
  const thrown = await uncaught(page);
  const navigation = await page.locator('nav[aria-label="Assignment questions"], nav[aria-label="Recovery questions"]').count();
  expect(!thrown.length && navigation === 1, `no app crash ${where} (navigation still mounted)`, thrown);
};

async function studentJourney(q1 = 'attempted') {
  console.log(`\nStudent assignment — Q1's canonical pin will not replay (Q1 ${q1})${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open(`mode=student&q1=${q1}`);
  await page.waitForSelector('[data-harness-question]', { timeout: 120000 });
  await settle(page);
  const trackerBefore = await api(page, (pins) => pins.trackerStored());

  const panel = failurePanel(page);
  expect(await panel.count() === 1, 'Q1 shows a question-level failure panel instead of a different question');
  expect(await panel.getAttribute('data-question-resolution-failure') === 'pin-fingerprint-mismatch', 'classified pin-fingerprint-mismatch', await panel.getAttribute('data-question-resolution-failure'));
  expect(await panel.getAttribute('data-question-resolution-recovery') === 'needs-repair', 'recovery: needs a teacher\'s repair');
  const text = await panel.innerText();
  expect(/needs your teacher/i.test(text) && /not showing you a different one/i.test(text), 'the student is told plainly, in non-technical words', text);
  expect(/recorded answers, attempts and grade/i.test(text), 'the student is told their recorded work is kept', text);
  expect(!/at \w+ \(|\.jsx:\d|TypeError|stack/i.test(text), 'no stack trace on screen', text);
  expect(!/1\|1\|1|harness-student/i.test(await page.content()), 'no fingerprint values or student id in the page');
  expect(await submitVisible(page) === 0, 'no Submit button on the failed question');
  await noCrash(page, 'on load');

  // The panel's own way out.
  await page.getByRole('button', { name: /Go to Question 2/ }).click();
  await settle(page);
  expect(await api(page, (pins) => pins.current()) === 1, 'the panel\'s "Go to Question 2" moves on');
  expect(await failurePanel(page).count() === 0 && await questionRendered(page) > 0, 'Q2 renders its question');
  await goTo(page, 2);
  expect(await failurePanel(page).count() === 0 && await questionRendered(page) > 0, 'Q3 renders its question');
  await goTo(page, 0);
  expect(await failurePanel(page).count() === 1, 'returning to Q1 shows the same contained panel');
  await noCrash(page, 'after navigating away and back');

  // Pressing Enter on the failed question submits nothing.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  await page.reload();
  await page.waitForSelector('[data-harness-question]', { timeout: 120000 });
  await settle(page);
  expect(await failurePanel(page).count() === 1, 'after a reload, Q1 is still the contained panel');
  await noCrash(page, 'after reload');
  await goTo(page, 1);
  expect(await questionRendered(page) > 0, 'after a reload, Q2 still renders');

  const events = await api(page, (pins) => pins.events());
  expect(events.grades === 0 && events.stepGrades === 0, 'no attempt was spent and no grade written', events);
  expect(events.checkpoints === 0, 'no checkpoint was written for the failed question', events);
  expect(await api(page, (pins) => pins.trackerStored()) === trackerBefore, 'the grade record (attempts, history, canonical pin) is byte-identical');
  const pins = await api(page, (store) => store.devicePins());
  expect(!pins.some((key) => key.includes('q1-two-step')), 'no device pin was written for Q1 (nothing replaced the original)', pins);
  expect(pins.some((key) => key.includes('q2-intercepts')), 'Q2\'s delivery was pinned as usual', pins);
  const diagnostics = await api(page, (store) => store.diagnostics());
  const recorded = diagnostics.find((entry) => entry.kind === 'question-resolution-failure');
  expect(Boolean(recorded) && /pin-fingerprint-mismatch/.test(recorded.message) && /q1-two-step/.test(recorded.message) && /linear\.twoStepEquation/.test(recorded.message) && /pin=canonical/.test(recorded.message), 'a diagnostic names assignment, question, family, pin kind and classification', recorded);
  expect(!JSON.stringify(diagnostics).includes('harness-student'), 'the diagnostic carries no student id');
  await context.close();
}

async function faultJourney() {
  console.log(`\nAn unanticipated throw while Q3 is prepared (above QuestionModuleBoundary)${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open('mode=student&fault=1&start=2');
  await page.waitForSelector('[data-harness-question]', { timeout: 120000 });
  await settle(page);
  const panel = failurePanel(page);
  expect(await panel.count() === 1 && await panel.getAttribute('data-question-resolution-recovery') === 'retry', 'Q3 shows a retryable question-level panel, not an app crash', await panel.count());
  await noCrash(page, 'when a question throws during preparation');
  await goTo(page, 1);
  expect(await questionRendered(page) > 0, 'Q2 is reachable while Q3 is failing');
  await goTo(page, 2);
  expect(await failurePanel(page).count() === 1, 'Q3 is still contained after returning');
  // The condition clears; Try again prepares the question afresh.
  await api(page, (pins) => pins.clearFault());
  await page.getByRole('button', { name: 'Try again' }).click();
  await settle(page);
  expect(await failurePanel(page).count() === 0 && await questionRendered(page) > 0, 'Try again succeeds once the transient condition clears');
  const events = await api(page, (pins) => pins.events());
  expect(events.grades === 0, 'retrying spent nothing', events);
  const diagnostics = await api(page, (store) => store.diagnostics());
  expect(diagnostics.some((entry) => entry.kind === 'question-resolution-error' && /q3-area/.test(entry.message)), 'the throw was recorded with its question', diagnostics);
  await context.close();
}

async function previewJourney() {
  console.log(`\nTeacher preview — Q1's family is not in this build, Q3 throws${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open('mode=preview&fault=1');
  await page.waitForSelector('[data-harness-question]', { timeout: 120000 });
  await settle(page);
  const panel = failurePanel(page);
  expect(await panel.count() === 1, 'teacher preview: Q1 is a contained panel');
  expect(await page.locator('[data-teacher-resolution-detail]').count() === 1, 'the teacher sees the technical classification');
  expect(/family-unknown/.test(await page.locator('[data-teacher-resolution-detail]').innerText()), 'classified family-unknown');
  await noCrash(page, 'in teacher preview');
  await goTo(page, 1);
  expect(await questionRendered(page) > 0, 'teacher preview: Q2 renders');
  await goTo(page, 2);
  expect(await failurePanel(page).count() === 1, 'teacher preview: a throwing Q3 is contained');
  await noCrash(page, 'in teacher preview after a throw');
  await context.close();
}

async function recoveryJourney() {
  console.log(`\nRecovery assessment — item 1's pin will not replay${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open('mode=recovery');
  await page.waitForSelector('[data-recovery-runner="assessment"]', { timeout: 120000 });
  await settle(page);
  expect(await failurePanel(page).count() === 1, 'item 1 is a contained panel, never a substitute question');
  expect(await failurePanel(page).getAttribute('data-question-resolution-failure') === 'pin-fingerprint-mismatch', 'classified pin-fingerprint-mismatch');
  await noCrash(page, 'in the Recovery runner');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await settle(page);
  expect(await failurePanel(page).count() === 0 && await page.locator('input, math-field').count() > 0, 'item 2 renders');
  await page.getByRole('button', { name: /^Question 3/ }).click();
  await settle(page);
  expect(await failurePanel(page).count() === 0 && await page.locator('input, math-field').count() > 0, 'item 3 renders');
  await page.getByRole('button', { name: /^Question 1/ }).click();
  await settle(page);
  expect(await failurePanel(page).count() === 1, 'item 1 is still contained on return');
  expect(await page.getByRole('button', { name: 'Back' }).count() === 1, 'the student can always leave the Recovery');
  await noCrash(page, 'after moving through the Recovery');
  await context.close();
}

async function recoveryUnreadablePinJourney() {
  console.log(`\nRecovery assessment — item 2's stored pin is unreadable (null after normalization)${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open('mode=recovery&nullPin=1');
  await page.waitForSelector('[data-recovery-runner="assessment"]', { timeout: 120000 });
  await settle(page);
  await page.getByRole('button', { name: /^Question 2/ }).click();
  await settle(page);
  expect(await failurePanel(page).getAttribute('data-question-resolution-failure') === 'pin-malformed', 'item 2 is a contained pin-malformed panel (on main: item.pin.variant threw and replaced the app)');
  await noCrash(page, 'on an unreadable plan pin');
  await page.getByRole('button', { name: /^Question 3/ }).click();
  await settle(page);
  expect(await failurePanel(page).count() === 0 && await page.locator('input, math-field').count() > 0, 'item 3 renders');
  await context.close();
}

async function recoveryPracticeEmptyJourney() {
  console.log(`\nRecovery Practice with nothing left to offer (nextPracticeItem: null)${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open('mode=recovery-practice');
  await page.waitForSelector('[data-recovery-runner="practice"]', { timeout: 120000 });
  await settle(page);
  expect(/no practice question to show/i.test(await page.locator('body').innerText()), 'the runner says so (on main: resolveQuestionMaximumAttempts(null) threw and replaced the app)');
  expect(!(await uncaught(page)).length, 'no uncaught error');
  await context.close();
}

async function damagedContextJourney() {
  console.log(`\nReal data: Q3's authored word-problem context holds a null quantity${SLOW ? ' [6× CPU]' : ''}`);
  const { context, page } = await open('mode=student&context=null-quantity&start=2');
  await page.waitForSelector('[data-harness-question]', { timeout: 120000 });
  await settle(page);
  expect(await failurePanel(page).count() === 0 && await questionRendered(page) > 0, 'Q3 renders (on main this threw in QuestionEngine and unmounted the whole tree)');
  await noCrash(page, 'with a damaged authored context');
  await context.close();
}

const journeys = { student: () => studentJourney('attempted'), correct: () => studentJourney('correct'), fault: faultJourney, preview: previewJourney, recovery: recoveryJourney, 'recovery-null-pin': recoveryUnreadablePinJourney, 'recovery-practice': recoveryPracticeEmptyJourney, context: damagedContextJourney };
for (const [name, run] of Object.entries(journeys)) {
  if (ONLY && ONLY !== name) continue;
  try {
    await run();
  } catch (error) {
    fail(`${name} journey threw`, error.stack || error.message);
  }
}
await browser.close();

console.log(`\n${checks} checks passed, ${findings.length} finding${findings.length === 1 ? '' : 's'}${SLOW ? ' (6× CPU)' : ''}`);
process.exit(findings.length ? 1 : 0);
