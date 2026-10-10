// Drive the results screens the way a student and a teacher use them — in a
// real browser, at Chromebook (1366×768) and phone (390×844) sizes.
//
// HOW TO RUN (it starts its own Vite unless SECURE_RESULTS_ORIGIN points at one):
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/browser/secureResults.mjs
//   SECURE_RESULTS_SHOTS=/some/dir …             # where screenshots go
//   SECURE_RESULTS_ORIGIN=http://localhost:5261 …   # reuse a running harness server
//
// WHAT IS REAL. SecureExamReview, TestCycleCard, TestCycleCorrections (with the
// shared RichQuestionRuntime), PathSolutionReview, StandardBadge and the
// teacher's TeacherSecureExamDashboard — the production components — against
// stubbed callables whose payloads have the real shape
// (secureResultsSecureExamStub.js, secureResultsTestCycleStub.js). Nothing
// reaches a network: firebase.js is the emulator module and every non-local
// request is aborted.
//
// WHAT IT CHECKS, as a student or teacher would notice it:
//   - a released course Test reads "71% — 4 of 7 questions correct (1 left
//     blank counts as 0)" and says why points decide it, never "4 of 6";
//   - each question shows the student's answer or "Left blank", whether it was
//     right, the correct answer and the worked solution — a tool item's answer
//     summary once, an older item says no worked solution is stored, and an
//     answer typed in the math editor (stored as LaTeX) is drawn as math;
//   - the results take keyboard focus when they open, and each question is a
//     numbered heading;
//   - skills come weakest first, and "Practise this skill" hands the app the
//     right destination, which the app's own launch (practiceSkillLaunch)
//     sends to My Math Path for a standard and to the CCMR tab for any
//     practice-test skill — never course practice;
//   - a practice test shows an estimated range with its size and the real
//     benchmark, and says it is not an official score; a course Test shows none;
//   - a review the server did not release shows nothing but "not ready";
//   - the card: every skill named in words, even where the server sent the
//     standard's code or "Target N" for a label; what's on the Test sorted by
//     name and only before the Test starts (below the action, which stays on
//     the first screen); Review accuracy by skill with practise links only for
//     skills begun; "Review my Test" in Corrections and after — never while a
//     Retest can be answered, even once retesting is closed; and no
//     retest-cap sentence for a student whose grade already passes;
//   - Corrections → Review my Test → back: the same question, the answer typed
//     and not yet checked still in the box, focus on the corrections heading;
//     card → review → back puts focus on the card's heading;
//   - the teacher form shows the server's time for the chosen length, refuses
//     an empty count, and sends releasePolicy from the "Release results
//     automatically" box;
//   - no sideways scroll, controls in these screens at least 44px, no errors.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PORT = Number(process.env.SECURE_RESULTS_PORT || 5261);
const ORIGIN = process.env.SECURE_RESULTS_ORIGIN || `http://localhost:${PORT}`;
const SHOTS = process.env.SECURE_RESULTS_SHOTS || '/tmp/claude-0/shots-a3';
mkdirSync(SHOTS, { recursive: true });

const DEVICES = [
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
  { id: 'phone', width: 390, height: 844, mobile: true },
];
const MIN_TAP = 44;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const findings = [];
const passes = [];
const check = (ok, label, detail = '') => {
  (ok ? passes : findings).push(detail ? `${label} — ${detail}` : label);
  log(ok ? 'PASS' : 'FAIL', label, detail);
};

let server = null;
if (!process.env.SECURE_RESULTS_ORIGIN) {
  server = spawn('npx', ['vite', '--config', 'tests/browser/secureResults.vite.config.mjs', '--port', String(PORT), '--strictPort'], {
    cwd: repo, stdio: 'ignore', detached: true,
  });
  process.on('exit', () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(ORIGIN)).status < 500) break; } catch { /* not up yet */ }
    await wait(500);
  }
}

const browser = await chromium.launch();
let blockedRequests = 0;
let coldServer = true;

const openPage = async (context, query) => {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/secureResults.html?${query}`, { waitUntil: 'load', timeout: coldServer ? 180000 : 30000 });
  coldServer = false;
  return { page, errors };
};

// Controls this package owns: the results header and skill list, the card,
// corrections' own buttons, and the teacher form. (StandardBadge chips and the
// question runtime have their own certifications.)
const layout = async (page, label, scopes, { minElements = 20 } = {}) => {
  const result = await page.evaluate(({ minTap, selectors }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const controls = selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((element, index, all) => all.indexOf(element) === index && visible(element) && !element.disabled);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      elements: document.querySelectorAll('*').length,
      small: controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) };
      }).filter((entry) => Math.min(entry.width, entry.height) < minTap),
    };
  }, { minTap: MIN_TAP, selectors: scopes });
  check(result.elements >= minElements, `${label}: not a white screen`, `${result.elements} elements`);
  check(result.scrollWidth <= result.clientWidth, `${label}: no sideways scroll`, `${result.scrollWidth} vs ${result.clientWidth}`);
  check(result.small.length === 0, `${label}: controls at least ${MIN_TAP}px`, result.small.map((entry) => `${entry.text} ${entry.width}x${entry.height}`).join(', '));
};

/*
 * MathLive draws a <math-span> only once it has been on screen (its own
 * IntersectionObserver), so a full-page screenshot of a long results page
 * would show every formula below the first screen as a blank. Scroll through
 * the page first, the way a student reads it, then back to the top.
 */
const renderAllMath = async (page) => {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => { setTimeout(resolve, 120); });
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
};
const shot = async (page, device, name) => {
  await renderAllMath(page);
  await page.screenshot({ path: path.join(SHOTS, `${device.id}-${name}.png`), fullPage: true });
};
const text = (locator) => locator.evaluate((element) => element.innerText.replace(/\s+/g, ' ').trim());
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const noErrors = (errors, label) => check(errors.length === 0, `${label}: no console errors`, errors[0] || '');
const inFirstScreen = async (page, locator, label) => {
  const box = await locator.boundingBox();
  const height = await page.evaluate(() => document.documentElement.clientHeight);
  check(Boolean(box) && box.y + box.height <= height + 1, `${label}: on the first screen`, box ? `bottom ${Math.round(box.y + box.height)} of ${height}` : 'missing');
};

const REVIEW_SCOPES = ['main > header button', 'section[aria-labelledby="results-by-skill"] button', '[role="alert"] ~ button', '[role="status"] ~ button'];
const CARD_SCOPES = ['[data-test-cycle-stage] button'];
const focused = (page) => page.evaluate(() => {
  const element = document.activeElement;
  if (!element || element === document.body) return 'BODY';
  return `${element.tagName}${element.hasAttribute('data-corrections-heading') ? '[data-corrections-heading]' : ''}:${(element.textContent || '').trim().slice(0, 50)}`;
});
// A skill shown by its code, or by the blueprint normalizer's placeholder.
const CODE_LIKE = /texas:|\bTarget \d+\b|\b(?:[A-Z]\d?|\d)\.\d+[A-Z]?\s·/;

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.mobile, hasTouch: device.mobile, deviceScaleFactor: device.mobile ? 3 : 1,
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blockedRequests += 1;
    return route.abort();
  });
  const at = (label) => `${device.id} ${label}`;

  /* --- a released course Test ------------------------------------------- */
  {
    const { page, errors } = await openPage(context, 'scene=review&session=course-test');
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    const score = await text(page.locator('[data-results-score]'));
    check(score.includes('71%') && score.includes('4 of 7 questions correct (1 left blank counts as 0).'), at('course score counts planned questions'), score);
    check(score.includes('Some questions are worth more than others, so your score is based on points (6 of 8.5).'), at('course score explains weighting'), score);
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1', null, { timeout: 5000 }).catch(() => {});
    check((await focused(page)).startsWith('H1:Unit 3 Test'), at('the results take focus at their heading'), await focused(page));
    const headings = await page.locator('article[data-result-status] h3').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
    check(headings.join('|') === 'Question 1|Question 2|Question 3|Question 4|Question 5|Question 6|Question 7', at('each question is a numbered heading'), headings.join('|'));
    const statuses = await page.locator('article[data-result-status]').evaluateAll((nodes) => nodes.map((node) => node.dataset.resultStatus));
    check(statuses.join(',') === 'correct,incorrect,blank,partial,correct,correct,correct', at('each question has its server result'), statuses.join(','));
    const articles = page.locator('article[data-result-status]');
    const q2 = await text(articles.nth(1));
    check(/Incorrect/.test(q2) && /Your answer/i.test(q2) && /Correct answer/i.test(q2) && /Multiply 3 by EVERY term/.test(q2), at('a wrong answer shows the right one and the worked solution'), q2.slice(0, 160));
    const q3 = await text(articles.nth(2).locator('[data-result-block="yours"]'));
    check(/Left blank/.test(q3), at('a blank question says "Left blank"'), q3);
    const q4 = await text(articles.nth(3));
    const summaryCount = (q4.match(/A line through/g) || []).length;
    check(/Points plotted/.test(q4) && /Part credit/.test(q4) && summaryCount === 1, at('a tool item: work read back, answer summary shown once'), `summary x${summaryCount}`);
    const q5 = await text(articles.nth(4));
    check(/A worked solution isn't available for this question\./.test(q5) && !/Correct answer/i.test(q5), at('an older item says no worked solution is stored'), q5.slice(0, 120));
    // Typed as 3/4 in the math editor, stored as \frac34: shown as a fraction.
    const editorAnswer = articles.nth(6).locator('[data-result-block="yours"]');
    const editorText = await text(editorAnswer);
    const editorMath = await editorAnswer.locator('math-span').count();
    check(editorMath === 1 && !/\\frac|\\left|\\right/.test(editorText), at('a math-editor answer is drawn as math, not LaTeX'), `${editorMath} math-span; "${editorText}"`);
    await articles.nth(6).screenshot({ path: path.join(SHOTS, `${device.id}-review-editor-answer.png`) });
    const skills = await page.locator('[data-skill-result]').evaluateAll((nodes) => nodes.map((node) => node.dataset.skillResult));
    check(skills.join(',') === 'skill:texas:A.3B,skill:texas:A.5A,skill:texas:A.2A', at('skills weakest first'), skills.join(','));
    const skillText = await text(page.locator('section[aria-labelledby="results-by-skill"]'));
    check(!/A\.3B|texas:/.test(skillText), at('skills are named, not coded'), skillText.slice(0, 120));
    check(await page.locator('#results-estimate').count() === 0, at('a course Test gets no outside-score estimate'));
    await layout(page, at('course results'), REVIEW_SCOPES);
    await shot(page, device, 'review-course-test');
    await page.locator('[data-skill-result] button').first().click();
    const practised = await page.evaluate(() => window.__practised);
    const launched = await page.evaluate(() => window.__launches);
    check(JSON.stringify(practised[0]) === JSON.stringify({ alignmentKey: 'texas:A.3B', framework: null, domainId: null })
      && JSON.stringify(launched[0]) === JSON.stringify({ teksCode: 'A.3B', tab: null }), at('practise a course skill → My Math Path on the standard'), `${JSON.stringify(practised[0])} → ${JSON.stringify(launched[0])}`);
    noErrors(errors, at('course results'));
    await page.close();
  }

  /* --- a released SAT practice test -------------------------------------- */
  {
    const { page, errors } = await openPage(context, 'scene=review&session=sat-practice');
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    const score = await text(page.locator('[data-results-score]'));
    check(score.includes('40%') && score.includes('4 of 10 questions correct (3 left blank count as 0).'), at('practice score counts never-opened questions'), score);
    const estimate = await text(page.locator('section[aria-labelledby="results-estimate"]'));
    check(/Your estimated SAT Math score/.test(estimate) && /About 350–540/.test(estimate) && /on the 200–800 scale/.test(estimate), at('the estimate is a range on the real scale'), estimate.slice(0, 140));
    check(/Based on 10 questions — the real test has 44\. A short practice test is only a rough estimate/.test(estimate), at('the estimate says how rough it is'));
    check(/college-readiness benchmark \(530\) is inside that range/.test(estimate), at('the benchmark is the real one, honestly placed'));
    check(/not an official SAT score/.test(estimate), at('never presented as an official score'));
    const list = await text(page.locator('section[aria-labelledby="results-questions"] > div').first());
    check(/2 questions were never opened\./.test(list), at('never-opened questions are accounted for'), list);
    const skills = await page.locator('[data-skill-result]').evaluateAll((nodes) => nodes.map((node) => node.dataset.skillResult));
    check(skills[0] === 'domain:geometryTrigonometry' && skills.includes('domain:algebra'), at('practice skills are the exam\'s domains'), skills.join(','));
    await page.locator('[data-skill-result] button').first().click();
    const practised = await page.evaluate(() => window.__practised);
    const launched = await page.evaluate(() => window.__launches);
    check(JSON.stringify(practised[0]) === JSON.stringify({ alignmentKey: 'texas:G.9A', framework: 'digitalSAT', domainId: 'geometryTrigonometry' })
      && JSON.stringify(launched[0]) === JSON.stringify({ teksCode: null, tab: 'ccmr' }), at('practise a domain → the exam\'s practice (CCMR tab), not course practice'), `${JSON.stringify(practised[0])} → ${JSON.stringify(launched[0])}`);
    await layout(page, at('practice results'), REVIEW_SCOPES);
    await shot(page, device, 'review-sat-practice');
    noErrors(errors, at('practice results'));
    await page.close();
  }

  /* --- a review the server would not hand out ----------------------------- */
  {
    const { page, errors } = await openPage(context, 'scene=review&session=unreleased');
    await page.waitForSelector('main [role="status"], [role="status"]', { timeout: 15000 });
    const body = await bodyText(page);
    check(/Your results aren't ready yet\./.test(body), at('unreleased: "not ready"'));
    check(await page.locator('article, [data-results-score], [data-skill-result]').count() === 0 && !/Correct answer|Score|\d+%/i.test(body), at('unreleased: no score, no question, no answer'), body.slice(0, 120));
    await layout(page, at('unreleased'), REVIEW_SCOPES, { minElements: 8 });
    await shot(page, device, 'review-unreleased');
    noErrors(errors, at('unreleased'));
    await page.close();
  }

  /* --- an open review the server stops offering --------------------------- */
  // Wherever a review was opened from, it asks again on coming back to the
  // tab (and on focus, and every 30 seconds): a refusal closes it, its
  // answers and solutions gone, the server's reason in their place.
  const closesOnRefusal = async (page, label) => {
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    await page.evaluate(() => {
      window.__reviewRefusal = 'This review opens again when you finish the test you are taking now.';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const closed = await page.waitForSelector('[data-results-score]', { state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
    const body = await bodyText(page);
    check(closed && !/Correct answer|Worked solution/i.test(body) && await page.locator('article[data-result-status]').count() === 0, at(`${label}: the review closes, nothing of it left`), body.slice(0, 160));
    check(/This review opens again when you finish the test you are taking now\./.test(body), at(`${label}: the server's reason is shown`), body.slice(0, 160));
  };
  {
    const { page, errors } = await openPage(context, 'scene=review&session=course-test');
    await closesOnRefusal(page, 'a review opened on its own (the Tests & Exams list)');
    noErrors(errors, at('revoked review'));
    await page.close();
  }

  /* --- dark theme, the long results page --------------------------------- */
  {
    const { page, errors } = await openPage(context, 'scene=review&session=course-test&theme=dark');
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    await shot(page, device, 'review-course-test-dark');
    noErrors(errors, at('dark results'));
    await page.close();
  }

  /* --- the card, stage by stage ------------------------------------------ */
  const openCard = async (stage, shownAs = stage) => {
    const opened = await openPage(context, `scene=card&stage=${stage}`);
    await opened.page.waitForSelector(`[data-test-cycle-stage="${shownAs}"]`, { timeout: 15000 });
    return opened;
  };
  const noCodes = async (page, label) => {
    const body = await bodyText(page);
    check(!CODE_LIKE.test(body), `${label}: every skill is named in words`, body.match(CODE_LIKE)?.[0] || '');
  };
  const cardButton = (page, name) => page.locator('[data-test-cycle-stage] button', { hasText: name });

  {
    const { page, errors } = await openCard('review');
    const body = await bodyText(page);
    check(/Review: 6 of 9 questions answered\. Answer every Review question to unlock your Test\./.test(body), at('review: the teacher\'s gate, stated'));
    check(!/do not have to be correct/.test(body), at('review: no "they do not have to be correct"'));
    const rows = await page.locator('[data-review-skill]').evaluateAll((nodes) => nodes.map((node) => node.innerText.replace(/\s+/g, ' ')));
    check(rows.length === 3 && /1 of 3 correct/.test(rows[0]) && /Not started/.test(rows[2]), at('review: accuracy by skill, weakest first'), rows.join(' / '));
    check(rows[1].startsWith('Solving linear equations'), at('review: a skill the server sent as its code is named in words'), rows[1]);
    const practiseButtons = await page.locator('[data-review-skill]').evaluateAll((nodes) => nodes.map((node) => node.querySelectorAll('button').length));
    check(practiseButtons.join(',') === '1,1,0', at('review: practise links only for skills begun'), practiseButtons.join(','));
    await inFirstScreen(page, cardButton(page, 'Continue Review'), at('review action'));
    const skills = await text(page.locator('[data-test-skills]'));
    check(/What's on your Test/.test(skills) && /Solving linear equations · 4 questions/.test(skills), at('review: what\'s on the Test, with counts'), skills.slice(0, 120));
    const skillNames = await page.locator('[data-test-skills] li').evaluateAll((nodes) => nodes.map((node) => node.innerText.split(' · ')[0].trim()));
    check(skillNames.join('|') === 'Domain and range of linear functions|Rate of change from tables and graphs|Solving linear equations|Writing linear equations from a table or graph',
      at('review: what\'s on the Test is sorted by name, not by question order'), skillNames.join('|'));
    await noCodes(page, at('card review'));
    check(/If you retest/.test(body), at('review: the retest rule is still relevant'));
    await page.locator('[data-review-skill] button').first().click();
    const practised = await page.evaluate(() => window.__practised);
    check(JSON.stringify(practised[0]) === JSON.stringify({ alignmentKey: 'texas:A.3B', framework: null, domainId: null }), at('review: practise the weakest skill'), JSON.stringify(practised[0]));
    await layout(page, at('card review'), CARD_SCOPES);
    await shot(page, device, 'card-review');
    noErrors(errors, at('card review'));
    await page.close();
  }

  {
    const { page, errors } = await openCard('test');
    await inFirstScreen(page, cardButton(page, 'Start Test'), at('test action'));
    check(await cardButton(page, 'Review my Test').count() === 0, at('test: no review of anything yet'));
    check(/What's on your Test/.test(await text(page.locator('[data-test-skills]'))), at('test: what\'s on it'));
    await noCodes(page, at('card test'));
    await layout(page, at('card test'), CARD_SCOPES);
    await shot(page, device, 'card-test');
    noErrors(errors, at('card test'));
    await page.close();
  }

  {
    // Under way: the list beside it would be a map of the questions.
    const { page, errors } = await openCard('testInProgress', 'test');
    await inFirstScreen(page, cardButton(page, 'Resume Test'), at('test in progress action'));
    check(await page.locator('[data-test-skills]').count() === 0, at('test in progress: no skills list once the Test has started'));
    await shot(page, device, 'card-test-in-progress');
    noErrors(errors, at('card test in progress'));
    await page.close();
  }

  {
    const { page, errors } = await openCard('corrections');
    const skills = await text(page.locator('[data-test-skills]'));
    check(/What's on your Retest/.test(skills) && /drawn from these Test skills — mostly the ones you missed/.test(skills) && !/· \d+ questions?/.test(skills), at('corrections: the Retest\'s skills, no Test counts'), skills.slice(0, 160));
    await noCodes(page, at('card corrections'));
    check(/If you retest/.test(await bodyText(page)), at('corrections: the retest rule is shown'));
    await shot(page, device, 'card-corrections');
    // From the card.
    await cardButton(page, 'Review my Test').click();
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    const back = page.locator('main > header button');
    check(/Back to my assessment/.test(await back.innerText()), at('card → Review my Test: back to the card'));
    await back.click();
    await page.waitForSelector('[data-test-cycle-stage="corrections"]', { timeout: 15000 });
    await page.waitForFunction(() => document.activeElement?.tagName === 'H2', null, { timeout: 5000 }).catch(() => {});
    check((await focused(page)).startsWith('H2:Unit 3 Test Cycle'), at('card → review → back: focus on the card heading'), await focused(page));
    // From inside Corrections.
    await cardButton(page, 'Continue Corrections').click();
    // The shared runtime's answer field: the math editor for a number, or a text box.
    const answerField = page.locator('section[aria-label="Practice question"] [data-secure-answer-editor]').first();
    await answerField.waitFor({ state: 'visible', timeout: 15000 });
    const editorKind = await answerField.getAttribute('data-secure-answer-editor');
    const readAnswer = () => (editorKind === 'math'
      ? answerField.locator('math-field').evaluate((element) => element.value)
      : answerField.inputValue());
    const heading = await text(page.locator('[data-corrections-heading]'));
    check(heading === 'Solving linear equations', at('corrections: headed by the skill, not its code'), heading);
    // Corrections' own controls; the answer editor's keypad is certified with the editor.
    await layout(page, at('corrections'), ['[data-test-cycle-corrections] > section:first-child button', '[data-test-cycle-corrections] > div:last-child button', 'section[aria-label="Practice question"] form button[type="submit"]']);
    // An answer typed and not yet checked, then the Test review from the bottom of the page.
    if (editorKind === 'math') {
      await answerField.locator('math-field').click();
      await page.keyboard.type('5');
    } else {
      await answerField.fill('5');
    }
    check(await readAnswer() === '5', at(`corrections: an answer typed in the ${editorKind} editor`), `"${await readAnswer()}"`);
    await shot(page, device, 'corrections-with-review-link');
    const issuesBefore = await page.evaluate(() => window.__correctionIssues);
    const bottomReview = page.locator('button', { hasText: 'Review my Test' }).last();
    await bottomReview.scrollIntoViewIfNeeded();
    await bottomReview.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    check(/Back to my corrections/.test(await page.locator('main > header button').innerText()), at('corrections → Review my Test: back to corrections'));
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1', null, { timeout: 5000 }).catch(() => {});
    check((await focused(page)).startsWith('H1:'), at('corrections → Review my Test: focus on the results heading'), await focused(page));
    // The review names the skill as the card does (the teacher's label).
    const reviewSkills = await text(page.locator('section[aria-labelledby="results-by-skill"]'));
    check(/Rate of change from tables and graphs/.test(reviewSkills), at('the review uses the card\'s name for a skill'), reviewSkills.slice(0, 120));
    await shot(page, device, 'corrections-opened-test-review');
    await page.locator('main > header button').click();
    await answerField.waitFor({ state: 'visible', timeout: 15000 });
    check(/Corrections ·/i.test(await bodyText(page)), at('corrections: back where the student was'));
    const kept = await readAnswer();
    check(kept === '5', at('corrections: the answer typed before opening the review is still there'), `"${kept}"`);
    check(await page.evaluate(() => window.__correctionIssues) === issuesBefore, at('corrections: the question was not reloaded'));
    await page.waitForFunction(() => document.activeElement?.hasAttribute?.('data-corrections-heading'), null, { timeout: 5000 }).catch(() => {});
    check((await focused(page)).startsWith('H1[data-corrections-heading]'), at('corrections: focus back on the corrections heading'), await focused(page));
    await shot(page, device, 'corrections-after-review');
    const opened = await page.evaluate(() => window.__reviewsOpened);
    check(opened.every((id) => id === 'course-test'), at('only the released Test was opened'), opened.join(','));
    noErrors(errors, at('corrections'));
    await page.close();
  }

  // An open Test review closes the moment the server stops offering it: the
  // teacher opens the Retest while the answers and solutions are on screen.
  // (The card asks again on coming back to the tab, on focus, on a grade
  // change and every 30 seconds; coming back to the tab is driven here.)
  for (const from of ['card', 'corrections']) {
    const { page, errors } = await openCard('corrections');
    if (from === 'card') {
      await cardButton(page, 'Review my Test').click();
    } else {
      await cardButton(page, 'Continue Corrections').click();
      const link = page.locator('button', { hasText: 'Review my Test' }).last();
      await link.waitFor({ state: 'visible', timeout: 15000 });
      await link.click();
    }
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    await page.evaluate(() => { window.__stageOverride = 'retest'; document.dispatchEvent(new Event('visibilitychange')); });
    const closed = await page.waitForSelector('[data-results-score]', { state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
    check(closed, at(`a Test review opened from ${from} closes when the Retest opens`));
    const stage = await page.locator('[data-test-cycle-stage]').first().getAttribute('data-test-cycle-stage').catch(() => null);
    check(stage === 'retest', at(`a Test review opened from ${from}: back on the card, at the Retest`), String(stage));
    noErrors(errors, at(`revoked Test review from ${from}`));
    await page.close();
  }

  {
    const { page, errors } = await openCard('retest');
    check(await cardButton(page, 'Review my Test').count() === 0, at('retest: no Test review while a Retest can be answered'));
    const retestSkills = await text(page.locator('[data-test-skills]'));
    check(/What's on your Retest/.test(retestSkills) && /drawn from these Test skills — mostly the ones you missed/.test(retestSkills), at('retest: what\'s on it, without promising every skill'), retestSkills.slice(0, 140));
    check(/If you retest/.test(await bodyText(page)), at('retest: the cap is shown to a student below passing'));
    await inFirstScreen(page, cardButton(page, 'Start Retest'), at('retest action'));
    await layout(page, at('card retest'), CARD_SCOPES);
    await shot(page, device, 'card-retest');
    noErrors(errors, at('card retest'));
    await page.close();
  }

  {
    // A teacher opened a retest after an 85: a 70% cap cannot raise it.
    const { page, errors } = await openCard('retestAfterPass', 'retest');
    const body = await bodyText(page);
    check(!/If you retest|up to 70%/.test(body), at('retest after a pass: no retest-cap sentence'), body.match(/If you retest[^.]*\./)?.[0] || '');
    await shot(page, device, 'card-retest-after-pass');
    noErrors(errors, at('card retest after pass'));
    await page.close();
  }

  {
    // Retesting closed with a Retest under way: the server holds the review back, and so does the card.
    const { page, errors } = await openCard('retestClosed');
    check(await page.locator('button', { hasText: /Review my (Test|Retest)/ }).count() === 0, at('retest closed while a Retest is open: no Test review offered'));
    check(!/If you retest/.test(await bodyText(page)), at('retest closed: no retest-cap sentence'));
    await layout(page, at('card retest closed'), CARD_SCOPES);
    await shot(page, device, 'card-retest-closed');
    noErrors(errors, at('card retest closed'));
    await page.close();
  }

  {
    const { page, errors } = await openCard('passed');
    const body = await bodyText(page);
    check(!/If you retest|up to 70%/.test(body), at('passed: no retest-cap sentence'), body.match(/If you retest[^.]*\./)?.[0] || '');
    check(await cardButton(page, 'Review Test').count() === 1 && await cardButton(page, 'Review my Test').count() === 0, at('passed: one way into the Test review'));
    check(await page.locator('[data-test-skills]').count() === 0, at('passed: nothing left to prepare for'));
    await layout(page, at('card passed'), CARD_SCOPES);
    await shot(page, device, 'card-passed');
    // The card's main "Review Test" re-checks too (a teacher resets the Test while it is open).
    await cardButton(page, 'Review Test').click();
    await closesOnRefusal(page, 'passed: a review opened from "Review Test"');
    noErrors(errors, at('card passed'));
    await page.close();
  }

  {
    const { page, errors } = await openCard('complete');
    check(!/If you retest/.test(await bodyText(page)), at('complete: no retest-cap sentence'));
    check(await cardButton(page, 'Review Retest').count() === 1, at('complete: the Retest review is the main action'));
    await layout(page, at('card complete'), CARD_SCOPES);
    await shot(page, device, 'card-complete');
    await cardButton(page, 'Review my Test').click();
    await page.waitForSelector('[data-results-score]', { timeout: 15000 });
    const opened = await page.evaluate(() => window.__reviewsOpened);
    check(opened[opened.length - 1] === 'course-test', at('complete: "Review my Test" opens the original Test'), opened.join(','));
    noErrors(errors, at('card complete'));
    await page.close();
  }

  /* --- the teacher's practice-test form ---------------------------------- */
  {
    const { page, errors } = await openPage(context, 'scene=teacher');
    await page.waitForSelector('[data-practice-test-time]', { timeout: 15000 });
    const time = () => text(page.locator('[data-practice-test-time]'));
    check(/10 questions · 16 minutes — the real test's pace \(70 minutes for 44\)/.test(await time()), at('teacher: SAT 10 questions → 16 minutes'), await time());
    const release = page.locator('label', { hasText: 'Release results automatically when the student submits.' }).locator('input[type="checkbox"]');
    check(await release.isChecked(), at('teacher: automatic release is the default'));
    await page.locator('select').nth(1).selectOption('tsia2');
    check(/10 questions · untimed, like the real TSIA2 Mathematics\./.test(await time()), at('teacher: TSIA2 stays untimed'), await time());
    await page.locator('select').nth(1).selectOption('act');
    // An empty box is no count: nothing to create, and the line says what is missing.
    await page.locator('select').nth(0).selectOption('stu-1');
    await page.locator('input[type="number"]').fill('');
    check(/Enter how many questions — 1 to 45\./.test(await time()) && await page.locator('form button[type="submit"]').isDisabled(),
      at('teacher: an empty count creates nothing'), await time());
    await shot(page, device, 'teacher-empty-count');
    await page.locator('input[type="number"]').fill('45');
    check(/All 45 questions · 50 minutes — the full ACT Mathematics time\./.test(await time()), at('teacher: the full-length line names the count'), await time());
    await page.locator('input[type="number"]').fill('20');
    check(/20 questions · 23 minutes — the real test's pace \(50 minutes for 45\)/.test(await time()), at('teacher: ACT 20 questions → 23 minutes'), await time());
    await layout(page, at('teacher form'), ['form button', 'form select', 'form input']);
    await shot(page, device, 'teacher-create');
    await release.uncheck();
    await page.locator('form button[type="submit"]').click();
    await page.waitForSelector('p[role="status"]', { timeout: 15000 });
    await release.check();
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => (window.__created || []).length === 2, null, { timeout: 15000 });
    const created = await page.evaluate(() => window.__created);
    check(created[0].releasePolicy === 'teacher' && created[1].releasePolicy === 'automatic' && created[0].questionCount === 20 && created[0].examType === 'act',
      at('teacher: the box decides releasePolicy, the count is what was shown'), JSON.stringify(created));
    await shot(page, device, 'teacher-created');
    noErrors(errors, at('teacher form'));
    await page.close();
  }

  await context.close();
}

await browser.close();
log(`blocked ${blockedRequests} non-local request(s) — no production contact`);
log(`${passes.length} passed, ${findings.length} failed. Screenshots: ${SHOTS}`);
if (findings.length) {
  findings.forEach((finding) => log('  FAIL', finding));
  process.exit(1);
}
process.exit(0);
