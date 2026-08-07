import { useMemo, useState } from 'react';
import {
  TEXAS_MATH_ACTIVE_COURSES,
  getTexasStandard,
  getTexasStandardsForCourse,
  getTexasVerticalAlignment,
} from './texasStandards.js';
import {
  DOK_LEVELS,
  INSTRUCTIONAL_LEVELS,
  QUESTION_PURPOSES,
  TEKS_EVIDENCE_LEVELS,
  buildCanonicalQuestionMetadataPatch,
  normalizeQuestionInstructionalMetadata,
} from './questionMetadata.js';

const splitCodes = (value) => String(value || '')
  .split(/[\n,;]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const codesToText = (items = []) => items.map((entry) => entry.code).join(', ');
const unique = (values) => [...new Set(values.filter(Boolean))];

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 10px',
  border: '1px solid #bdc7d6',
  borderRadius: '7px',
  background: '#fff',
};


const coursePlaceholder = (courseId, role = 'primary') => {
  const examples = {
    grade6: { primary: '6.6A, 6.4B', secondary: '6.1D', prerequisite: 'Example: 6.2A' },
    grade7: { primary: '7.7, 7.4A', secondary: '7.1D', prerequisite: 'Example: 6.6A, 6.6C' },
    grade8: { primary: '8.5I, 8.4C', secondary: '8.1D', prerequisite: 'Example: 7.4A, 7.7' },
    algebra1: { primary: 'A.2A, A.1D', secondary: 'A.1D', prerequisite: 'Example: 8.5I, 8.9' },
    algebra2: { primary: 'A2.4F, A2.1D', secondary: 'A2.1D', prerequisite: 'Example: A.8A, A.11B' },
  };
  return examples[courseId]?.[role] || examples.algebra1[role];
};

const standardBadge = (standard) => {
  if (standard?.classification === 'readiness') return ['#e6f4ea', '#137333', 'Readiness'];
  if (standard?.classification === 'supporting') return ['#e8f0fe', '#174ea6', 'Supporting'];
  if (standard?.classification === 'process') return ['#f1f3f4', '#5f6368', 'Process'];
  return ['#f3e8fd', '#7b1fa2', 'Course TEKS'];
};

export default function QuestionStandardsEditor({ question, onApply, onCancel }) {
  const metadata = useMemo(() => normalizeQuestionInstructionalMetadata(question), [question]);
  const initialCourse = metadata.standards.primary.map((entry) => getTexasStandard(entry.code)?.courseId).find(Boolean) || 'algebra1';
  const [browseCourseId, setBrowseCourseId] = useState(initialCourse);
  const [primaryCodes, setPrimaryCodes] = useState(codesToText(metadata.standards.primary));
  const [primaryLevel, setPrimaryLevel] = useState(metadata.standards.primary[0]?.level || 'assessed');
  const [secondaryCodes, setSecondaryCodes] = useState(codesToText(metadata.standards.secondary));
  const [prerequisiteCodes, setPrerequisiteCodes] = useState(codesToText(metadata.standards.prerequisite));
  const [dok, setDok] = useState(metadata.complexity.level || 2);
  const [band, setBand] = useState(metadata.difficulty.generatorBand || 3);
  const [purpose, setPurpose] = useState(metadata.purpose || 'independentPractice');
  const [evidenceWeight, setEvidenceWeight] = useState(metadata.evidenceWeight ?? 0.75);
  const [differentiationMode, setDifferentiationMode] = useState(metadata.differentiation.mode || 'recommend');

  const primaryResolved = splitCodes(primaryCodes).map((code) => getTexasStandard(code)).filter(Boolean);
  const purposeDefinition = QUESTION_PURPOSES.find((item) => item.key === purpose) || QUESTION_PURPOSES[3];
  const browseStandards = getTexasStandardsForCourse(browseCourseId);
  const suggestedPrerequisites = unique(primaryResolved.flatMap((standard) => getTexasVerticalAlignment(standard.code).prior.map((item) => item.code)));

  const apply = () => {
    const next = buildCanonicalQuestionMetadataPatch({
      question,
      primaryCodes: splitCodes(primaryCodes),
      primaryLevel,
      secondaryCodes: splitCodes(secondaryCodes),
      prerequisiteCodes: splitCodes(prerequisiteCodes),
      dok,
      generatorBand: band,
      instructionalLevel: INSTRUCTIONAL_LEVELS.find((entry) => entry.band === Number(band))?.key,
      purpose,
      evidenceWeight,
      differentiationMode,
    });
    onApply(next);
  };

  return (
    <section style={{ marginTop: '14px', padding: '15px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #c6d8f1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, color: '#174ea6' }}>Texas Standards & Difficulty</h4>
          <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: '12px' }}>Tag grade-level targets and earlier-course prerequisites separately. JSON and the editor use the same canonical metadata.</p>
        </div>
        <span style={{ padding: '4px 8px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontWeight: 800, fontSize: '11px' }}>TEKS · DOK · VERTICAL ALIGNMENT</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <strong style={{ fontSize: '12px' }}>Browse TEKS from</strong>
        <select value={browseCourseId} onChange={(event) => setBrowseCourseId(event.target.value)} style={{ ...fieldStyle, width: '190px' }}>
          {TEXAS_MATH_ACTIVE_COURSES.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}
        </select>
        <span style={{ color: '#5f6368', fontSize: '11px' }}>{browseStandards.length} loaded expectations</span>
      </div>

      <datalist id="texas-math-teks-codes">
        {browseStandards.map((standard) => <option key={standard.code} value={standard.code}>{standard.description}</option>)}
      </datalist>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: '12px' }}>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Primary grade-level TEKS
          <input list="texas-math-teks-codes" value={primaryCodes} onChange={(event) => setPrimaryCodes(event.target.value)} placeholder={coursePlaceholder(browseCourseId, 'primary')} style={{ ...fieldStyle, marginTop: '5px' }} />
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Primary evidence level
          <select value={primaryLevel} onChange={(event) => setPrimaryLevel(event.target.value)} style={{ ...fieldStyle, marginTop: '5px' }}>
            {TEKS_EVIDENCE_LEVELS.filter((entry) => entry.key !== 'prerequisite').map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Secondary / process TEKS
          <input value={secondaryCodes} onChange={(event) => setSecondaryCodes(event.target.value)} placeholder={coursePlaceholder(browseCourseId, 'secondary')} style={{ ...fieldStyle, marginTop: '5px' }} />
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Prerequisite TEKS — may be earlier course
          <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
            <input value={prerequisiteCodes} onChange={(event) => setPrerequisiteCodes(event.target.value)} placeholder={coursePlaceholder(browseCourseId, 'prerequisite')} style={fieldStyle} />
            {suggestedPrerequisites.length > 0 && <button type="button" onClick={() => setPrerequisiteCodes(unique([...splitCodes(prerequisiteCodes), ...suggestedPrerequisites]).join(', '))} title="Add MathMaster vertical-alignment suggestions" style={{ border: '1px solid #bdc7d6', background: '#fff', borderRadius: '7px', whiteSpace: 'nowrap' }}>Add prior</button>}
          </div>
        </label>
      </div>

      {primaryResolved.length > 0 && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '7px' }}>
          {primaryResolved.map((standard) => {
            const [background, color, label] = standardBadge(standard);
            const vertical = getTexasVerticalAlignment(standard.code);
            return (
              <div key={standard.code} style={{ padding: '9px 10px', borderRadius: '8px', background: '#fff', border: '1px solid #d9e2ef', fontSize: '12px' }}>
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{standard.code}</strong>
                  <span style={{ color: '#5f6368' }}>{standard.course}</span>
                  <span style={{ padding: '2px 6px', borderRadius: '999px', background, color, fontSize: '10px', fontWeight: 900 }}>{label}</span>
                  {standard.reportingCategory ? <span style={{ color: '#5f6368' }}>RC {standard.reportingCategory}</span> : null}
                </div>
                <div style={{ color: '#5f6368', marginTop: '4px' }}>{standard.description}</div>
                {vertical.prior.length > 0 && <div style={{ marginTop: '5px', color: '#7a4f00' }}><strong>Prior-course links:</strong> {vertical.prior.map((item) => item.code).join(', ')}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginTop: '14px' }}>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Cognitive complexity
          <select value={dok} onChange={(event) => setDok(Number(event.target.value))} style={{ ...fieldStyle, marginTop: '5px' }}>
            {DOK_LEVELS.map((entry) => <option key={entry.level} value={entry.level}>{entry.label}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Instructional difficulty
          <select value={band} onChange={(event) => setBand(Number(event.target.value))} style={{ ...fieldStyle, marginTop: '5px' }}>
            {INSTRUCTIONAL_LEVELS.map((entry) => <option key={entry.band} value={entry.band}>Band {entry.band} — {entry.label}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Question purpose
          <select value={purpose} onChange={(event) => { const next = event.target.value; setPurpose(next); setEvidenceWeight(QUESTION_PURPOSES.find((item) => item.key === next)?.defaultWeight ?? 0.75); }} style={{ ...fieldStyle, marginTop: '5px' }}>
            {QUESTION_PURPOSES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Evidence weight
          <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
            <input type="number" min="0" max="2" step="0.05" value={evidenceWeight} onChange={(event) => setEvidenceWeight(event.target.value)} style={fieldStyle} />
            <button type="button" onClick={() => setEvidenceWeight(purposeDefinition.defaultWeight)} title="Use recommended weight" style={{ border: '1px solid #bdc7d6', background: '#fff', borderRadius: '7px', whiteSpace: 'nowrap' }}>Default</button>
          </div>
        </label>
        <label style={{ fontWeight: 800, fontSize: '13px' }}>Differentiation
          <select value={differentiationMode} onChange={(event) => setDifferentiationMode(event.target.value)} style={{ ...fieldStyle, marginTop: '5px' }}>
            <option value="off">Off</option>
            <option value="recommend">Recommend band</option>
            <option value="auto">Auto when authored band variants exist</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: '12px', padding: '9px 10px', borderRadius: '8px', background: '#fff8e1', color: '#704d00', fontSize: '11px', lineHeight: 1.45 }}>
        <strong>Vertical differentiation rule:</strong> the primary TEKS remains the grade-level learning target. Earlier-course TEKS are stored as prerequisite evidence and may drive intervention or prerequisite practice; they do not silently replace the target standard.
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={apply} style={{ background: '#1a73e8', color: '#fff', border: 0, borderRadius: '7px', padding: '9px 13px', fontWeight: 800 }}>Apply Standards</button>
      </div>
    </section>
  );
}
