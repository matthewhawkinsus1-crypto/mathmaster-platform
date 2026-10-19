/*
 * axe-core, in a Playwright page, normalised for the ratchet.
 *
 *   const result = await auditAccessibility(page, { name: 'student-home', viewport: 'desktop' });
 *   result.counts    { 'student-home|desktop|color-contrast': 3, ... }   (the ratchet unit)
 *   result.details   per key: impact, help, helpUrl, stable targets, examples
 *
 * axe is injected from node_modules (page.addScriptTag({ path })), never a
 * CDN, and runs only the WCAG 2.0 / 2.1 A and AA rules. Targets are normalised
 * by scripts/lib/accessibilityRatchet.mjs (stableTarget) so React useId values
 * and numeric suffixes do not make a run differ from the last.
 *
 * `include` / `exclude` are CSS selectors (or arrays of them) handed to axe's
 * context: audit one region, or leave out harness-only chrome.
 */
import { createRequire } from 'node:module';
import { normalizeViolations, stableTarget, WCAG_TAGS } from '../../scripts/lib/accessibilityRatchet.mjs';

const require = createRequire(import.meta.url);
export const AXE_PATH = require.resolve('axe-core/axe.min.js');
export const AXE_VERSION = require('axe-core/package.json').version;

const asList = (value) => (value == null ? [] : (Array.isArray(value) ? value : [value]));

/*
 * Waits for what an audit must not race: web fonts, MathLive's custom element
 * (every <math-field> upgraded with its shadow root, every static math span
 * rendered), and two quiet animation frames.
 */
export const settleForAudit = async (page, { timeout = 20_000 } = {}) => {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForFunction(() => {
    const fields = [...document.querySelectorAll('math-field')];
    if (fields.length && !window.customElements?.get('math-field')) return false;
    if (fields.some((field) => !field.shadowRoot)) return false;
    // Static math (math-span / math-div) renders into its own shadow root.
    const spans = [...document.querySelectorAll('math-span, math-div')];
    if (spans.some((span) => window.customElements?.get(span.localName) && !span.shadowRoot)) return false;
    return true;
  }, null, { timeout }).catch(() => {});
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
};

export const auditAccessibility = async (page, { name, viewport = 'default', include = null, exclude = null } = {}) => {
  if (!name) throw new Error('auditAccessibility: name (the screen id) is required');
  const hasAxe = await page.evaluate(() => typeof window.axe?.run === 'function');
  if (!hasAxe) await page.addScriptTag({ path: AXE_PATH });
  const raw = await page.evaluate(async ({ tags, include: inc, exclude: exc }) => {
    const context = {};
    if (inc.length) context.include = inc.map((selector) => [selector]);
    else context.include = [['html']];
    if (exc.length) context.exclude = exc.map((selector) => [selector]);
    const result = await window.axe.run(context, {
      runOnly: { type: 'tag', values: tags },
      // Incomplete ("needs review") results are reported, never ratcheted.
      resultTypes: ['violations', 'incomplete'],
      // The ratchet counts nodes, so every node must be reported.
      elementRef: false,
    });
    return {
      testEngine: result.testEngine?.version || null,
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        tags: violation.tags,
        nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
      })),
      incomplete: result.incomplete.map((entry) => ({
        id: entry.id,
        help: entry.help,
        helpUrl: entry.helpUrl,
        nodes: entry.nodes.map((node) => ({ target: node.target })),
      })),
    };
  }, { tags: [...WCAG_TAGS], include: asList(include), exclude: asList(exclude) });
  const normalized = normalizeViolations({ screen: name, viewport, violations: raw.violations });
  // What axe could not decide (e.g. contrast over a gradient or an image):
  // for a person to look at, not a failure.
  const needsReview = raw.incomplete.map((entry) => ({
    ruleId: entry.id,
    help: entry.help,
    helpUrl: entry.helpUrl,
    nodes: entry.nodes.length,
    targets: entry.nodes.map((node) => stableTarget(node.target)).sort().slice(0, 8),
  })).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  return { name, viewport, axeVersion: raw.testEngine, ...normalized, needsReview };
};
