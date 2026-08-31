// The Digital SAT certification sweep's grouping key and its two exemptions.
//
// These live apart from the sweep itself so they can be tested without running
// it. Each one narrows what the audit reports, so each is a place where a real
// defect could be hidden by accident - which is why they are here rather than
// inline, and why tests/platform/digitalSatAuditRules.test.mjs asserts both
// directions: the case the exemption is for, and the case it must not cover.

// The grouping key for "families that belong to the same standard". The 80
// native SAT families carry no TEKS alignment key at all, so keying on `texas:`
// alone dropped every one of them into a single empty-string bucket - area and
// volume compared against percentages, circles against inference - which
// inflated the same-standard clone counts and reported 71 standards where the
// bank teaches 71 TEKS codes plus 9 native SAT skills. `assessedConstruct`
// carries both forms (`A.10A`, `SAT-native:areaVolume`), so it is the key.
export const codeOf = (q) => {
  const texas = String((q.alignmentKeys || []).find((k) => /^texas:/i.test(String(k))) || '')
    .replace(/^texas:/i, '').toUpperCase();
  if (texas) return texas;
  return String(q.assessedConstruct || (q.assessmentContext || {}).nativeSkillId || '').toUpperCase();
};

// "How many solutions does this have?" has exactly one honest option set:
// 0, 1, 2, 3. That is an equally spaced ladder, and flagging it would be asking
// the item to offer a count nobody could reach. The exemption is deliberately
// narrow - the run must start at 0 and step by 1 - so it cannot cover a
// key+1/key+2/key+3 distractor set, which is what the ladder rule exists to
// catch. `sorted` is ascending.
export const isCountOptionSet = (sorted) => Array.isArray(sorted)
  && sorted.length > 0
  && sorted[0] === 0
  && sorted.every((value, index) => value === index);

// A family whose only generator parameter is `variant` has no mathematics in
// its generator at all - that parameter exists to seed the option shuffle on an
// otherwise static item. Comparing two of those to each other says nothing
// about whether the items duplicate one another, and counting it as a clone
// fired on every pair of static families in a standard. Same-tier clone
// detection still covers them; only the cross-tier and generator checks skip.
export const isComputational = (q) => Object.keys((q.generator || {}).parameters || {})
  .some((key) => key !== 'variant');
