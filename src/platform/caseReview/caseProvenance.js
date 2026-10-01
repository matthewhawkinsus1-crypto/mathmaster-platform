/*
 * HOW THE CASE REVIEW KNOWS WHAT IT SAYS.
 *
 * Every fact the Student Case Review prints carries one of six provenance
 * categories, and the teacher can open any important fact to see the records
 * it came from. The categories are the brief's, word for word:
 *
 *   Direct platform record        stored by MathMaster when it happened
 *   Derived from platform records worked out, deterministically, from stored records
 *   Staff documented              entered by a teacher or provider
 *   Imported SIS snapshot         from a gradebook file the teacher imported
 *   Legacy record with limitation stored before today's model; what it cannot show is named
 *   Not recorded                  MathMaster has no record either way
 *
 * The PR #401 support evidence system has its own five levels
 * (functions/shared/supportEvidenceModel.mjs PROVENANCE). They map onto these
 * without ever being upgraded: "configured only" — a profile with no
 * documented dates or source — is a legacy record with a limitation, never a
 * record that a support was delivered.
 *
 * "Not recorded" is never a negative fact. No engagement record is not zero
 * engagement; no calculator record is not "the calculator was unavailable".
 */
import { PROVENANCE } from '../../../functions/shared/supportEvidenceModel.mjs';

export const CASE_PROVENANCE = Object.freeze({
  DIRECT: 'direct-record',
  DERIVED: 'derived',
  STAFF: 'staff-documented',
  SIS: 'imported-sis',
  LEGACY: 'legacy-limited',
  NOT_RECORDED: 'not-recorded',
});

export const CASE_PROVENANCE_LABEL = Object.freeze({
  'direct-record': 'Direct platform record',
  derived: 'Derived from platform records',
  'staff-documented': 'Staff documented',
  'imported-sis': 'Imported SIS snapshot',
  'legacy-limited': 'Legacy record with limitation',
  'not-recorded': 'Not recorded',
});

/** The legend printed with every case review, so a word means one thing everywhere. */
export const CASE_PROVENANCE_LEGEND = Object.freeze([
  { level: 'direct-record', term: 'Direct platform record', meaning: 'Stored by MathMaster at the time it happened — for example a graded attempt, a server-timed active minute, or a grade export file.' },
  { level: 'derived', term: 'Derived from platform records', meaning: 'Worked out by a fixed rule from stored records, which are named — for example "corrected on a later attempt" from a question\'s attempt record.' },
  { level: 'staff-documented', term: 'Staff documented', meaning: 'Entered by a teacher or provider in MathMaster, with who entered it and when.' },
  { level: 'imported-sis', term: 'Imported SIS snapshot', meaning: 'Read from an official gradebook file a teacher imported for comparison. MathMaster does not change any grade because of it.' },
  { level: 'legacy-limited', term: 'Legacy record with limitation', meaning: 'Stored before MathMaster recorded this kind of fact fully — for example time counted by the student\'s browser, or a support profile saved before versioning. The limitation is named beside it.' },
  { level: 'not-recorded', term: 'Not recorded', meaning: 'MathMaster has no record either way. This is not evidence that something did not happen outside the platform.' },
]);

// Strongest first. Combining facts takes the weakest: a statement built from a
// direct record and a derivation is a derivation.
const RANK = Object.freeze({
  'direct-record': 6,
  'staff-documented': 5,
  'imported-sis': 4,
  derived: 3,
  'legacy-limited': 2,
  'not-recorded': 1,
});

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const isCaseProvenance = (level) => Object.prototype.hasOwnProperty.call(RANK, level);

/** PR #401's level, as a case-review category. Unknown levels are never promoted. */
export const fromSupportProvenance = (level) => {
  if (level === PROVENANCE.RECORDED) return CASE_PROVENANCE.DIRECT;
  if (level === PROVENANCE.DOCUMENTED) return CASE_PROVENANCE.STAFF;
  if (level === PROVENANCE.DERIVED) return CASE_PROVENANCE.DERIVED;
  if (level === PROVENANCE.CONFIGURED) return CASE_PROVENANCE.LEGACY;
  return CASE_PROVENANCE.NOT_RECORDED;
};

export const weakestProvenance = (levels = []) => {
  const known = list(levels).filter(isCaseProvenance);
  if (!known.length) return CASE_PROVENANCE.NOT_RECORDED;
  return known.reduce((weakest, level) => (RANK[level] < RANK[weakest] ? level : weakest));
};

export const strongestProvenance = (levels = []) => {
  const known = list(levels).filter(isCaseProvenance);
  if (!known.length) return CASE_PROVENANCE.NOT_RECORDED;
  return known.reduce((strongest, level) => (RANK[level] > RANK[strongest] ? level : strongest));
};

/**
 * A named record behind a fact. `path` is the store (for example
 * "grades/{student}/evidenceEvents"), `ids` the records used, `detail` what
 * was read from them. Ids are capped so a fact never carries hundreds.
 */
export const caseSource = ({ label, detail = '', path = '', ids = [], provenance = null } = {}) => ({
  label: clean(label) || 'MathMaster record',
  detail: clean(detail),
  path: clean(path),
  ids: list(ids).map(clean).filter(Boolean).slice(0, 50),
  idsTruncated: list(ids).length > 50,
  provenance: isCaseProvenance(provenance) ? provenance : null,
});

/** One statement the case review makes, with how it is known. */
export const caseFact = ({
  key, text, provenance, sources = [], limitation = '', value = null, section = '',
} = {}) => {
  if (!isCaseProvenance(provenance)) throw new Error(`A case fact needs a known provenance (got "${provenance}").`);
  const statement = clean(text);
  if (!statement) throw new Error('A case fact needs text.');
  return {
    key: clean(key),
    text: statement,
    provenance,
    provenanceLabel: CASE_PROVENANCE_LABEL[provenance],
    sources: list(sources),
    limitation: clean(limitation),
    value,
    section: clean(section),
  };
};

/** "No MathMaster record …" — the only way the case review states an absence. */
export const notRecordedFact = ({ key, subject, detail = '', section = '' } = {}) => caseFact({
  key,
  text: `No MathMaster record is available for ${clean(subject) || 'this'}.${clean(detail) ? ` ${clean(detail)}` : ''}`,
  provenance: CASE_PROVENANCE.NOT_RECORDED,
  sources: [],
  section,
});

export default CASE_PROVENANCE;
