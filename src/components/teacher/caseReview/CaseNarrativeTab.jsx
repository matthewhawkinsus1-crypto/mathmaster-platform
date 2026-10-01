import { useMemo, useState } from 'react';
import { FORBIDDEN_CONCLUSIONS } from '../../../platform/caseReview/narrativeGuard.js';
import { CASE_PROVENANCE_LABEL } from '../../../platform/caseReview/caseProvenance.js';
import { EmptyNote, FactItem } from './CaseReviewParts.jsx';

/*
 * FACTS AVAILABLE FOR TEACHER NARRATIVE — sentences a teacher may lift into a
 * parent, administrator or ARD narrative. Each is a fixed, guard-checked
 * template filled from the records (narrativeFacts.js), shows how it is
 * known, and opens to the records it came from. The teacher writes the
 * narrative; MathMaster supplies only facts.
 */

const CATEGORY_ORDER = [
  { key: 'completion', label: 'Completion' },
  { key: 'performance', label: 'Performance by section' },
  { key: 'attempts', label: 'Attempts and retries' },
  { key: 'deadlines', label: 'Due dates and extensions' },
  { key: 'skills', label: 'Skills (grade-level work)' },
  { key: 'supports', label: 'Support records' },
  { key: 'engagement', label: 'Work time and Practice Mode' },
  { key: 'gradebook', label: 'Official gradebook (imported)' },
  { key: 'evidence-gaps', label: 'What MathMaster does not contain' },
];

const FAMILY_LABEL = {
  'compliance-verdict': 'whether a plan was implemented, or whether anyone complied',
  'negative-from-absence': 'that something did not happen because no record exists',
  causation: 'that a support, a condition or the student caused a result',
  'motive-or-effort': 'the student\'s motive or effort (for example, "chose not to try")',
  'disability-attribution': 'that a disability caused a result',
  counterfactual: 'what would have happened with or without a support',
  'proof-claim': 'that the records prove anything',
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export default function CaseNarrativeTab({ model }) {
  const [copied, setCopied] = useState('');
  const groups = useMemo(() => {
    const byCategory = new Map();
    model.narrativeFacts.forEach((fact) => {
      if (!byCategory.has(fact.category)) byCategory.set(fact.category, []);
      byCategory.get(fact.category).push(fact);
    });
    const known = CATEGORY_ORDER.filter((entry) => byCategory.has(entry.key)).map((entry) => ({ ...entry, facts: byCategory.get(entry.key) }));
    const other = [...byCategory.keys()].filter((key) => !CATEGORY_ORDER.some((entry) => entry.key === key))
      .map((key) => ({ key, label: key, facts: byCategory.get(key) }));
    return [...known, ...other];
  }, [model.narrativeFacts]);

  const copy = async (text, label) => {
    const ok = await copyText(text);
    setCopied(ok ? label : 'Copying is blocked in this browser; select the text instead.');
  };
  const allText = model.narrativeFacts.map((fact) => `${fact.text} [${CASE_PROVENANCE_LABEL[fact.provenance] || fact.provenance}]`).join('\n');

  return (
    <>
      <section className="cr-section" aria-labelledby="cr-facts" data-case-facts>
        <h2 id="cr-facts">Facts available for teacher narrative ({model.narrativeFacts.length})</h2>
        <p className="cr-note">
          Each sentence states what MathMaster recorded, with how it is known. Open "Where this comes from" to see the records behind it.
          You write the narrative; these are facts you may use in it.
        </p>
        <div className="tw-row" style={{ gap: 8, alignItems: 'center' }}>
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => copy(allText, 'All facts copied.')} disabled={!model.narrativeFacts.length}>Copy all facts</button>
          {copied && <span className="cr-note" role="status">{copied}</span>}
        </div>
        {groups.length ? groups.map((group) => (
          <div key={group.key} className="cr-section" data-fact-category={group.key}>
            <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>{group.label}</h3>
            <ul className="cr-facts">
              {group.facts.map((fact) => <FactItem key={fact.key} fact={fact} onCopy={(text) => copy(text, 'Fact copied.')} />)}
            </ul>
          </div>
        )) : <EmptyNote>No facts can be stated from the records in this selection.</EmptyNote>}
      </section>

      <section className="cr-section" aria-labelledby="cr-never">
        <h2 id="cr-never">What this case review never states</h2>
        <p className="cr-note">These are conclusions for the people who know the student and the plan. No MathMaster record can establish them, so no generated sentence says:</p>
        <ul className="cr-lines">
          {FORBIDDEN_CONCLUSIONS.map((family) => <li key={family.id}>{FAMILY_LABEL[family.id] || family.reason}</li>)}
        </ul>
        <p className="cr-note">Where a record is missing, the fact says "MathMaster does not contain a record …" — the absence of a record is not evidence that something did not happen.</p>
      </section>
    </>
  );
}
