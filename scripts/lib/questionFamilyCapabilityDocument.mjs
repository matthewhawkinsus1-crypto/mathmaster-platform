/*
 * THE QUESTION FAMILY CAPABILITY REPORT, AS A DOCUMENT.
 *
 * Renders buildQuestionFamilyCapabilityReport()
 * (functions/shared/questionFamilyCapabilities.mjs) as the markdown and JSON
 * committed under docs/question-families/. Both are generated, never
 * hand-edited, so neither can claim a capability the code does not have:
 * tests/platform/questionFamilyCapabilities.test.mjs fails when they are
 * stale. Regenerate with:
 *
 *   node scripts/report-question-family-capabilities.mjs --write
 *
 * Pure: report in, text out.
 */

export const CAPABILITY_MARKDOWN_PATH = 'docs/question-families/QUESTION_FAMILY_CAPABILITIES.md';
export const CAPABILITY_JSON_PATH = 'docs/question-families/question-family-capabilities.json';

const cell = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .replace(/\|/g, '\\|')
  .trim();

const count = (value) => Number(value).toLocaleString('en-US');
const capacityText = ({ capacity, exact }) => `${exact ? '' : 'about '}${count(capacity)}`;
const listOrDash = (values) => (Array.isArray(values) && values.length ? values.join(', ') : '—');
const valueText = (value) => (Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value));

const toolText = (tool) => `\`${tool.tool}\`${tool.mode ? ` (${tool.mode})` : ''}`;
const toolsText = (family) => family.tools
  .slice()
  .sort((left, right) => Number(right.default) - Number(left.default))
  .map((tool) => (family.tools.length > 1 && tool.default ? `${toolText(tool)} default` : toolText(tool)))
  .join(', ');

const gradingText = (family) => {
  const graded = family.tools.filter((tool) => tool.serverGraded);
  if (graded.length === family.tools.length) return 'yes — shared server grader';
  if (!graded.length) return `no (${family.tools.map((tool) => tool.reason).join('; ')})`;
  return `only ${graded.map(toolText).join(', ')}`;
};

const reducedText = (family) => {
  if (!family.reducedComplexity.length) return '—';
  return family.reducedComplexity.map((support) => {
    const narrows = Object.entries(support.narrows).map(([name, value]) => `${name} ${valueText(value)}`).join(', ');
    const keeps = support.keeps.length ? `; keeps ${support.keeps.join(', ')}` : '';
    return `${support.support}: ${narrows}${keeps}`;
  }).join('<br>');
};

const pinningText = (family) => (family.unpinnedReferenceMeansThisVersion
  ? `v${family.version} · what an unpinned reference means`
  : `v${family.version} · only when pinned (\`"version": ${family.version}\`)`);

const summaryRow = (family) => `| \`${family.id}\` | ${pinningText(family)} | ${cell(listOrDash(family.solutionCases))} | ${cell(listOrDash(family.coefficientForms))} | ${cell(toolsText(family))} | ${cell(gradingText(family))} | ${family.recovery.ready ? 'yes' : `no (${family.recovery.issues.join(', ')})`} | ${cell(`${capacityText(family.capacity[0])} — ${family.classOf30}`)} | ${cell(reducedText(family))} |`;

const STRICT_TEXT = 'strict — an unknown constraint, a value it does not list, or a tool it cannot fill stops generation with a message naming what is allowed. Nothing falls back to a default.';
const FALLBACK_TEXT = 'fallback — an invalid or unknown constraint is reported by Pre-Flight and its default is used (the behavior every shipped v1 question was written against).';

const allowedText = (knob) => {
  if (knob.kind === 'range') return `whole-number range inside [${knob.limits.join(', ')}]`;
  if (knob.kind === 'choice' || knob.kind === 'boolean') return knob.values.map((value) => `\`${JSON.stringify(value)}\``).join(', ');
  return '—';
};

const strataText = (profile) => (profile.strata
  ? profile.strata.map((entry) => `${Object.values(entry.stratum).join(' · ')}: ${capacityText(entry)}`).join('; ')
  : '—');

const familySection = (family) => {
  const declared = family.declared || {};
  const lines = [
    `### \`${family.id}\` v${family.version}`,
    '',
    `${family.title}.`,
    '',
    `- **Pinning:** ${family.unpinnedReferenceMeansThisVersion
      ? 'an unpinned reference (`questionFamily` without `version`) means this version.'
      : `used only by a slot that says \`"version": ${family.version}\`; an unpinned reference still means v1, so no existing question changes.`}`,
    `- **Constraint policy:** ${family.constraintPolicy === 'strict' ? STRICT_TEXT : FALLBACK_TEXT}`,
    `- **Alignments:** ${listOrDash(family.alignments)}`,
    `- **Answered in:** ${toolsText(family)}${declared.targetTool?.workspaces ? ` — Step Algebra ${declared.targetTool.workspaces.join(' and ')} workspace${declared.targetTool.workspaces.length === 1 ? '' : 's'}` : ''}${declared.targetTool?.methods ? ` — methods ${declared.targetTool.methods.join(', ')} (default ${declared.targetTool.defaultMethod})` : ''}`,
    `- **Server grading:** ${gradingText(family)}`,
    `- **Recovery:** ${family.recovery.ready ? 'ready — fresh versions from the same family, marked by the server' : `not ready (${family.recovery.issues.join(', ')})`}`,
  ];
  if (declared.independentVerification) lines.push(`- **Independent verification:** ${declared.independentVerification}`);
  if (declared.exactArithmetic) lines.push('- **Arithmetic:** exact rationals throughout; a fraction is never shown or keyed as a decimal.');
  if (declared.notes) lines.push(`- **Note:** ${declared.notes}`);
  lines.push(
    '',
    '| Constraint | Kind | Default | Allowed | Concept (no support may change it) |',
    '| --- | --- | --- | --- | --- |',
    ...family.constraints.map((knob) => `| \`${knob.name}\` | ${knob.kind} | \`${valueText(knob.default)}\` | ${cell(allowedText(knob))} | ${knob.concept ? 'yes' : '—'} |`),
    '',
    '| Setting | Distinct questions | Per case / shape |',
    '| --- | --- | --- |',
    ...family.capacity.map((profile) => `| ${cell(profile.label)} | ${capacityText(profile)} | ${cell(strataText(profile))} |`),
    '',
  );
  if (family.reducedComplexity.length) {
    family.reducedComplexity.forEach((support) => {
      lines.push(`- **${support.support}:** ${Object.entries(support.narrows).map(([name, value]) => `\`${name}\` ${valueText(value)}`).join(', ')} — about ${count(support.capacity)} distinct questions${support.keeps.length ? `; never changes ${support.keeps.map((name) => `\`${name}\``).join(', ')}` : ''}.`);
    });
    lines.push('');
  }
  return lines;
};

export const renderQuestionFamilyCapabilityMarkdown = (report) => [
  '# Question Family capabilities',
  '',
  '> Generated by `node scripts/report-question-family-capabilities.mjs --write` from',
  '> `functions/shared/questionFamilyCapabilities.mjs`. Do not edit by hand:',
  '> `tests/platform/questionFamilyCapabilities.test.mjs` fails when this file is stale.',
  '',
  'Every registered Question Family version, computed from the family itself: the constraints an',
  'author may set, the tool a student answers in and whether the server marks it, whether the',
  'family is ready for automatic Recovery, how many distinct questions it can make, and what',
  'the reduced-complexity support changes. "Solution cases" and "coefficient forms" are what the',
  'family declares about itself (— for a version that declares nothing).',
  '',
  `Capacity is measured the way Pre-Flight measures it (a budget of ${count(report.capacityBudget)} candidates per list; "about" marks`,
  'an estimate). A mixed slot interleaves its cases so every run of seats covers each case once;',
  'its capacity is that balanced part. "Class of 30" is the default setting against a class of',
  `${report.referenceClass} seated students.`,
  '',
  '## Summary',
  '',
  '| Family | Version | Solution cases | Coefficient forms | Target tool | Server grading | Recovery ready | Class of 30 (default setting) | Reduced complexity |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...report.families.map(summaryRow),
  '',
  '## Families',
  '',
  ...report.families.flatMap(familySection),
].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');

export const renderQuestionFamilyCapabilityJson = (report) => `${JSON.stringify(report, null, 2)}\n`;
