// CAN EVERY REGISTRY TOOL'S WORK REACH THE SERVER BACKUP?
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/toolDraftSyncSweep.mjs          # check
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/toolDraftSyncSweep.mjs --write  # refresh the fixture
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed)
//
// The workspace sync refuses a whole tool record over one forbidden key or an
// oversized field, and a refused record is invisible to the student — their
// work looks saved. Source contracts (tests/platform/toolDraftSyncContract)
// catch a forbidden key written literally; they cannot see a spread verdict or
// a history that grows. This sweep can.
//
// Every registry tool is mounted under a real student draft key
// (toolOpenAudit.html?draft=1) and worked like an impatient student: every
// field typed into (a negative fraction), every select changed, every plane
// tapped, every Check / Record / Add / Plot pressed, twice over. Then each
// stored workspace record is read back and run through the REAL sanitizer, and
// the development-time sync audit is asked what it refused.
//
// Findings land in tests/platform/fixtures/toolDraftSyncFindings.json, which
// the ordinary suite asserts is empty AND covers every draft-backed tool — so a
// new tool cannot ship unswept, and a regression fails with no browser needed.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FIXTURE = path.join(repo, 'tests/platform/fixtures/toolDraftSyncFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const WRITE = process.argv.includes('--write');
const ONLY = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const { sanitizeWorkspaceDraftValue, explainWorkspaceDraftRejection } = await import(path.join(repo, 'functions/shared/workspaceDraftSchema.mjs'));
const { draftBackedToolIds } = await import(path.join(repo, 'src/tools/toolStatePersistence.js'));

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();

// Buttons that commit work, never ones that throw it away.
const COMMIT = /^(check|verify|record|save|add|plot|apply|lock|confirm|submit|place|use|build|test|show my|next)/i;
const DESTROY = /(reset|start over|clear|remove|delete|undo|hint|enlarge|about|how to|hide|show math|close|cancel)/i;

const workOnce = async () => {
  // Typed fields: a negative fraction is the value most likely to take an
  // unusual path through a tool's parsing and storage.
  const fields = await page.locator('[data-audit-root] input:not([type=radio]):not([type=checkbox]):not([type=range]):not([disabled]), [data-audit-root] math-field').all();
  for (const field of fields.slice(0, 24)) {
    if (!(await field.isVisible().catch(() => false))) continue;
    const tag = await field.evaluate((node) => node.tagName.toLowerCase());
    const type = await field.evaluate((node) => (node.getAttribute('type') || '').toLowerCase());
    try {
      if (tag === 'math-field') {
        await field.evaluate((node) => { node.value = '-2/3'; node.dispatchEvent(new Event('input', { bubbles: true })); });
      } else {
        await field.fill(type === 'number' ? '-2' : '-2/3', { timeout: 1500 });
      }
    } catch { /* a field that refuses input is a finding for another gate */ }
  }
  const selects = await page.locator('[data-audit-root] select:not([disabled])').all();
  for (const select of selects.slice(0, 12)) {
    try {
      const values = await select.evaluate((node) => [...node.options].map((option) => option.value).filter(Boolean));
      if (values.length) await select.selectOption(values[Math.min(1, values.length - 1)], { timeout: 1500 });
    } catch { /* ignore */ }
  }
  const radios = await page.locator('[data-audit-root] input[type=radio]:not([disabled]), [data-audit-root] [role=radio]').all();
  for (const radio of radios.slice(0, 8)) {
    try { if (await radio.isVisible()) await radio.click({ timeout: 1500 }); } catch { /* ignore */ }
  }
  const planes = await page.locator('[data-audit-root] svg[role=application]').all();
  for (const plane of planes.slice(0, 3)) {
    try {
      const box = await plane.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45);
      await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.6);
    } catch { /* ignore */ }
  }
  const buttons = await page.locator('[data-audit-root] button:not([disabled])').all();
  for (const button of buttons.slice(0, 30)) {
    try {
      if (!(await button.isVisible())) continue;
      const text = (await button.textContent() || '').trim();
      if (!COMMIT.test(text) || DESTROY.test(text)) continue;
      await button.click({ timeout: 1500 });
      await page.waitForTimeout(80);
    } catch { /* ignore */ }
  }
};

const toolIds = ONLY.length ? ONLY : draftBackedToolIds();
const tools = [];
const findings = [];

for (const toolId of toolIds) {
  const consoleLines = [];
  const onConsole = (message) => { if (/\[MathMaster draft sync\]/.test(message.text())) consoleLines.push(message.text()); };
  page.on('console', onConsole);
  const row = { toolId, mounted: false, records: 0, largestRecordBytes: 0, persistedFields: [] };
  try {
    await page.goto(`${ORIGIN}/tests/browser/toolOpenAudit.html?tool=${toolId}&draft=1`, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('[data-audit-root]')?.children.length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    row.mounted = !(await page.locator('[data-audit-error]').count());
    await workOnce();
    await page.waitForTimeout(400);
    await workOnce();
    await page.waitForTimeout(600);
    const stored = await page.evaluate(() => {
      const prefix = window.__TOOL_DRAFT_KEY__;
      const out = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (prefix && key && key.startsWith(prefix)) out.push({ key, raw: window.localStorage.getItem(key) });
      }
      return { out, rejections: window.__DRAFT_SYNC_REJECTIONS__() };
    });
    stored.out.forEach(({ key, raw }) => {
      let value;
      try { value = JSON.parse(raw)?.value; } catch { value = undefined; }
      row.records += 1;
      const check = sanitizeWorkspaceDraftValue(value);
      if (check.ok) {
        row.largestRecordBytes = Math.max(row.largestRecordBytes, check.bytes);
        if (value && typeof value === 'object' && !Array.isArray(value)) row.persistedFields.push(...Object.keys(value));
      } else {
        const why = explainWorkspaceDraftRejection(value);
        findings.push({ toolId, key, detail: `${why.reason}${why.path ? ` at ${why.path}` : ''}${why.largest?.length ? ` (largest: ${why.largest.map((f) => `${f.path}=${f.bytes}`).join(', ')})` : ''}` });
      }
    });
    stored.rejections.forEach((entry) => {
      if (!findings.some((finding) => finding.key === entry.key)) findings.push({ toolId, key: entry.key, detail: `${entry.reason}${entry.path ? ` at ${entry.path}` : ''} (reported by the write audit)` });
    });
    consoleLines.forEach((line) => { if (!findings.some((finding) => finding.toolId === toolId)) findings.push({ toolId, key: null, detail: line.slice(0, 300) }); });
    row.persistedFields = [...new Set(row.persistedFields)].sort();
  } catch (error) {
    findings.push({ toolId, key: null, detail: `sweep could not run: ${String(error?.message || error).split('\n')[0]}` });
  }
  page.off('console', onConsole);
  tools.push(row);
  console.log(`${toolId.padEnd(28)} mounted=${row.mounted} records=${row.records} largest=${row.largestRecordBytes}B fields=${row.persistedFields.length}`);
}

await browser.close();

if (WRITE) {
  writeFileSync(FIXTURE, `${JSON.stringify({ generatedAt: new Date().toISOString(), origin: ORIGIN, tools, findings }, null, 2)}\n`);
  console.log(`\nwrote ${findings.length} finding(s) to ${path.relative(repo, FIXTURE)}`);
}
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.toolId}] ${finding.detail}`));
  process.exit(1);
}
console.log('\nEvery swept tool record passes the real draft sanitizer.');
