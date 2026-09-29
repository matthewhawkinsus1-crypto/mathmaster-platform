import React, { useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import CoordinatePlane from '../shared/CoordinatePlane';
import { formatLine, lineFromPoints } from '../graphing2/graphingMath.js';
import {
  deriveLinearMultipleRepresentations,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  parsePointSlopeForm,
  scoreLinearMultipleRepresentations,
  validatePointSlopeEntry,
  validateSlopeEntry,
  validateSlopeInterceptEntry,
  validateStandardFormEntry,
  validateTableEntry,
  validateTwoPointsEntry,
  validateXInterceptEntry,
  validateYInterceptEntry,
} from './linearMultipleRepresentationsMath.js';

const buttonStyle = {
  minHeight: 42,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #c9d6e8',
  background: 'var(--mm-surface, #fff)',
  color: '#172033',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
};

const primaryButtonStyle = {
  ...buttonStyle,
  background: '#1a73e8',
  color: '#fff',
  border: '1px solid #1557b0',
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 42,
  padding: '8px 12px',
  border: '1px solid #c9d6e8',
  borderRadius: 8,
  fontSize: 15,
};

const badgeStyle = (bgColor, textColor) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 800,
  background: bgColor,
  color: textColor,
  letterSpacing: '0.04em',
});

const defaultTableRows = [
  { x: '', y: '' },
  { x: '', y: '' },
  { x: '', y: '' },
  { x: '', y: '' },
];

export default function LinearMultipleRepresentationsBoard({ questionData = {}, onAction }) {
  const canonicalFacts = useMemo(() => deriveLinearMultipleRepresentations(questionData), [questionData]);
  const givenKind = questionData.source?.kind || 'standardForm';
  const feedbackTiming = questionData.feedbackTiming === 'submitOnly' ? 'submitOnly' : 'guided';

  // Persistent inputs for all representations
  const [standardFormEquation, setStandardFormEquation] = usePersistentToolState('standardFormEquation', '');
  const [slopeInterceptEquation, setSlopeInterceptEquation] = usePersistentToolState('slopeInterceptEquation', '');
  const [pointSlopeEquation, setPointSlopeEquation] = usePersistentToolState('pointSlopeEquation', '');

  const [featureSlope, setFeatureSlope] = usePersistentToolState('featureSlope', '');
  const [featureXIntercept, setFeatureXIntercept] = usePersistentToolState('featureXIntercept', '');
  const [featureYIntercept, setFeatureYIntercept] = usePersistentToolState('featureYIntercept', '');
  const [featurePoint1, setFeaturePoint1] = usePersistentToolState('featurePoint1', '');
  const [featurePoint2, setFeaturePoint2] = usePersistentToolState('featurePoint2', '');

  const [tableRows, setTableRows] = usePersistentToolState('tableRows', defaultTableRows);

  const [graph1Points, setGraph1Points] = usePersistentToolState('graph1Points', []);
  const [graph2Points, setGraph2Points] = usePersistentToolState('graph2Points', []);
  const [graph3Points, setGraph3Points] = usePersistentToolState('graph3Points', []);

  const [contextIndependent, setContextIndependent] = usePersistentToolState('contextIndependent', '');
  const [contextDependent, setContextDependent] = usePersistentToolState('contextDependent', '');
  const [contextSlopeMeaning, setContextSlopeMeaning] = usePersistentToolState('contextSlopeMeaning', '');
  const [contextYInterceptMeaning, setContextYInterceptMeaning] = usePersistentToolState('contextYInterceptMeaning', '');
  const [contextXInterceptMeaning, setContextXInterceptMeaning] = usePersistentToolState('contextXInterceptMeaning', '');
  const [contextDomain, setContextDomain] = usePersistentToolState('contextDomain', '');

  const [cardChecks, setCardChecks] = usePersistentToolState('cardChecks', {});
  const [expandedCards, setExpandedCards] = usePersistentToolState('expandedCards', {
    equationForms: true,
    features: true,
    table: true,
    graph1: true,
    graph2: true,
    graph3: true,
    context: true,
  });

  // Presentation-only transient UI state
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [notice, setNotice] = useState('');
  const [enlargedGraph, setEnlargedGraph] = useState(null);

  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  // Response object
  const currentResponse = useMemo(() => ({
    standardFormEquation,
    slopeInterceptEquation,
    pointSlopeEquation,
    featureSlope,
    featureXIntercept,
    featureYIntercept,
    featurePoint1,
    featurePoint2,
    tableRows,
    graph1Points,
    graph2Points,
    graph3Points,
    contextIndependent,
    contextDependent,
    contextSlopeMeaning,
    contextYInterceptMeaning,
    contextXInterceptMeaning,
    contextDomain,
  }), [
    standardFormEquation, slopeInterceptEquation, pointSlopeEquation,
    featureSlope, featureXIntercept, featureYIntercept, featurePoint1, featurePoint2,
    tableRows, graph1Points, graph2Points, graph3Points,
    contextIndependent, contextDependent, contextSlopeMeaning, contextYInterceptMeaning, contextXInterceptMeaning, contextDomain,
  ]);

  // Live scoring result
  const liveResult = useMemo(() => scoreLinearMultipleRepresentations(questionData, currentResponse), [questionData, currentResponse]);

  // Graph lines
  const graph1Line = useMemo(() => (graph1Points.length >= 2 ? lineFromPoints(graph1Points[0], graph1Points[1]) : null), [graph1Points]);
  const graph2Line = useMemo(() => (graph2Points.length >= 2 ? lineFromPoints(graph2Points[0], graph2Points[1]) : null), [graph2Points]);
  const graph3Line = useMemo(() => (graph3Points.length >= 2 ? lineFromPoints(graph3Points[0], graph3Points[1]) : null), [graph3Points]);

  const graphBounds = useMemo(() => {
    if (questionData.graphBounds) return questionData.graphBounds;
    const xPad = 8;
    const yPad = 8;
    return { xMin: -xPad, xMax: xPad, yMin: -yPad, yMax: yPad };
  }, [questionData]);

  // Card check handler (guided mode only; never locks any other card!)
  const checkCard = (cardId, validatorFn) => {
    clearFeedback();
    const result = validatorFn();
    setCardChecks((prev) => ({
      ...prev,
      [cardId]: {
        checked: true,
        isCorrect: Boolean(result.isCorrect),
        error: result.error || null,
      },
    }));
    if (result.isCorrect) {
      setNotice('Card checked: Correct!');
    } else {
      setNotice(result.error || 'Check this card again.');
    }
  };

  // Toggle card expansion
  const toggleCard = (cardKey) => {
    setExpandedCards((prev) => ({ ...prev, [cardKey]: !prev[cardKey] }));
  };

  // Check if graph constructions are all completed and correct
  const allGraphsCorrect = Boolean(
    liveResult.parts.graph1 && liveResult.parts.graph2 && liveResult.parts.graph3,
  );

  // Table row editing
  const handleTableCellChange = (index, field, value) => {
    clearFeedback();
    setTableRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addTableRow = () => {
    clearFeedback();
    setTableRows((prev) => [...prev, { x: '', y: '' }]);
  };

  const removeTableRow = (index) => {
    clearFeedback();
    setTableRows((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));
  };

  // Status strip counts
  const formsTotal = givenKind === 'standardForm' || givenKind === 'slopeIntercept' || givenKind === 'pointSlope' ? 2 : 3;
  const formsDone = [
    givenKind !== 'standardForm' && liveResult.parts.standardForm,
    givenKind !== 'slopeIntercept' && liveResult.parts.slopeIntercept,
    givenKind !== 'pointSlope' && liveResult.parts.pointSlope,
  ].filter(Boolean).length;

  const featuresTotal = 4;
  const featuresDone = [
    liveResult.parts.slope,
    liveResult.parts.xIntercept,
    liveResult.parts.yIntercept,
    liveResult.parts.twoPoints,
  ].filter(Boolean).length;

  const tableTotal = givenKind === 'table' ? 0 : 1;
  const tableDone = givenKind === 'table' ? 0 : (liveResult.parts.table ? 1 : 0);

  const graphsTotal = 3;
  const graphsDone = [
    liveResult.parts.graph1,
    liveResult.parts.graph2,
    liveResult.parts.graph3,
  ].filter(Boolean).length;

  const hasContext = Boolean(questionData.context && Object.keys(questionData.context).length > 0);
  const contextTotal = hasContext ? 4 : 0;
  const contextDone = hasContext ? [
    liveResult.parts.contextIndependent,
    liveResult.parts.contextDependent,
    liveResult.parts.contextSlopeMeaning,
    liveResult.parts.contextYInterceptMeaning,
  ].filter(Boolean).length : 0;

  // Final submit handler
  const handleBoardSubmit = () => {
    submit(
      { isCorrect: liveResult.isCorrect, score: liveResult.score },
      currentResponse,
      {
        parts: liveResult.parts,
        evidence: liveResult.evidence,
        canonicalFacts: liveResult.canonicalFacts,
      },
    );
  };

  // Given representation display text
  const givenDisplay = useMemo(() => {
    if (givenKind === 'standardForm') return questionData.source?.equation || canonicalFacts.standardEquation;
    if (givenKind === 'slopeIntercept') return questionData.source?.equation || canonicalFacts.slopeInterceptEquation;
    if (givenKind === 'pointSlope') return questionData.source?.equation || `y − (${canonicalFacts.yInterceptNumber}) = ${canonicalFacts.slopeNumber}(x − 0)`;
    if (givenKind === 'twoPoints') {
      const pts = questionData.source?.points || [questionData.source?.first, questionData.source?.second];
      return pts ? `Points (${pts[0].join(', ')}) and (${pts[1].join(', ')})` : 'Two given points';
    }
    if (givenKind === 'scenario') return questionData.source?.prompt || questionData.prompt || 'Given word scenario';
    if (givenKind === 'graph') return 'Given initial graph';
    return 'Given initial relationship';
  }, [givenKind, questionData, canonicalFacts]);

  return (
    <ToolShell
      title="Linear Multiple Representations Board"
      subtitle={questionData.prompt || 'Represent this linear relationship across multiple equation forms, key features, a table of values, and three distinct graphing methods.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Concise Status Strip */}
        <div
          role="region"
          aria-label="Representation Board Progress"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '10px 16px',
            background: 'var(--mm-surface-subtle, #f1f5f9)',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14, fontWeight: 700, color: '#334155' }}>
            <span>Forms {formsDone}/{formsTotal}</span>
            <span>·</span>
            <span>Features {featuresDone}/{featuresTotal}</span>
            {tableTotal > 0 && (
              <>
                <span>·</span>
                <span>Table {tableDone}/{tableTotal}</span>
              </>
            )}
            <span>·</span>
            <span>Graphs {graphsDone}/{graphsTotal}</span>
            {hasContext && (
              <>
                <span>·</span>
                <span>Context {contextDone}/{contextTotal}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={badgeStyle('#e0e7ff', '#3730a3')}>Free-Order Mode</span>
            {feedbackTiming === 'guided' ? (
              <span style={badgeStyle('#dcfce7', '#166534')}>Guided Feedback</span>
            ) : (
              <span style={badgeStyle('#fef3c7', '#92400e')}>Submit-Only Feedback</span>
            )}
          </div>
        </div>

        {/* Starting Given Representation Banner */}
        <div
          style={{
            padding: '14px 18px',
            background: '#eff6ff',
            border: '2px solid #bfdbfe',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
              <strong style={{ fontSize: 15, color: '#1e3a8a' }}>Starting Representation</strong>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#172554', fontFamily: 'monospace' }}>
              {givenDisplay}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#1e40af', maxWidth: 360 }}>
            Complete the remaining representations in any order. Work does not unlock in steps.
          </div>
        </div>

        {notice ? (
          <div
            role="status"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {notice}
          </div>
        ) : null}

        {/* Two-Column Responsive Card Board */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* CATEGORY 1: EQUATION FORMS */}
          <Panel title="Equation Forms">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Standard Form Card */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="standardFormInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    Standard Form (Ax + By = C)
                  </label>
                  {givenKind === 'standardForm' ? (
                    <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                  ) : cardChecks.standardForm?.isCorrect ? (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  ) : null}
                </div>
                {givenKind === 'standardForm' ? (
                  <input
                    id="standardFormInput"
                    readOnly
                    value={givenDisplay}
                    style={{ ...inputStyle, background: '#f8fafc', color: '#475569', fontWeight: 700 }}
                  />
                ) : (
                  <>
                    <input
                      id="standardFormInput"
                      placeholder="e.g. x - 2y = 6"
                      value={standardFormEquation}
                      onChange={(e) => {
                        clearFeedback();
                        setStandardFormEquation(e.target.value);
                      }}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Use integer coefficients with no common factors and a positive leading coefficient.
                    </div>
                    {feedbackTiming === 'guided' && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => checkCard('standardForm', () => validateStandardFormEntry(standardFormEquation, canonicalFacts))}
                          style={buttonStyle}
                        >
                          Check Standard Form
                        </button>
                        {cardChecks.standardForm?.checked && !cardChecks.standardForm?.isCorrect && (
                          <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.standardForm.error}</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Slope-Intercept Form Card */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="slopeInterceptInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    Slope-Intercept Form (y = mx + b)
                  </label>
                  {givenKind === 'slopeIntercept' ? (
                    <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                  ) : cardChecks.slopeIntercept?.isCorrect ? (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  ) : null}
                </div>
                {givenKind === 'slopeIntercept' ? (
                  <input
                    id="slopeInterceptInput"
                    readOnly
                    value={givenDisplay}
                    style={{ ...inputStyle, background: '#f8fafc', color: '#475569', fontWeight: 700 }}
                  />
                ) : (
                  <>
                    <input
                      id="slopeInterceptInput"
                      placeholder="e.g. y = 1/2x - 3"
                      value={slopeInterceptEquation}
                      onChange={(e) => {
                        clearFeedback();
                        setSlopeInterceptEquation(e.target.value);
                      }}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Isolate y on the left side and express the right side in simplified mx + b form.
                    </div>
                    {feedbackTiming === 'guided' && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => checkCard('slopeIntercept', () => validateSlopeInterceptEntry(slopeInterceptEquation, canonicalFacts))}
                          style={buttonStyle}
                        >
                          Check Slope-Intercept
                        </button>
                        {cardChecks.slopeIntercept?.checked && !cardChecks.slopeIntercept?.isCorrect && (
                          <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.slopeIntercept.error}</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Point-Slope Form Card */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="pointSlopeInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    Point-Slope Form (y − y₁ = m(x − x₁))
                  </label>
                  {givenKind === 'pointSlope' ? (
                    <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                  ) : cardChecks.pointSlope?.isCorrect ? (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  ) : null}
                </div>
                {givenKind === 'pointSlope' ? (
                  <input
                    id="pointSlopeInput"
                    readOnly
                    value={givenDisplay}
                    style={{ ...inputStyle, background: '#f8fafc', color: '#475569', fontWeight: 700 }}
                  />
                ) : (
                  <>
                    <input
                      id="pointSlopeInput"
                      placeholder="e.g. y + 2 = 1/2(x - 2)"
                      value={pointSlopeEquation}
                      onChange={(e) => {
                        clearFeedback();
                        setPointSlopeEquation(e.target.value);
                      }}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Choose any valid point on the line paired with the exact slope. Multiple valid equations are accepted!
                    </div>
                    {feedbackTiming === 'guided' && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => checkCard('pointSlope', () => validatePointSlopeEntry(pointSlopeEquation, canonicalFacts))}
                          style={buttonStyle}
                        >
                          Check Point-Slope
                        </button>
                        {cardChecks.pointSlope?.checked && !cardChecks.pointSlope?.isCorrect && (
                          <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.pointSlope.error}</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </Panel>

          {/* CATEGORY 2: KEY FEATURES */}
          <Panel title="Key Features">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Slope */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="featureSlopeInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    Slope (m)
                  </label>
                  {cardChecks.featureSlope?.isCorrect && (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  )}
                </div>
                <input
                  id="featureSlopeInput"
                  placeholder="e.g. 1/2 or 0.5"
                  value={featureSlope}
                  onChange={(e) => {
                    clearFeedback();
                    setFeatureSlope(e.target.value);
                  }}
                  style={inputStyle}
                />
                {feedbackTiming === 'guided' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => checkCard('featureSlope', () => validateSlopeEntry(featureSlope, canonicalFacts))}
                      style={buttonStyle}
                    >
                      Check Slope
                    </button>
                    {cardChecks.featureSlope?.checked && !cardChecks.featureSlope?.isCorrect && (
                      <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.featureSlope.error}</span>
                    )}
                  </div>
                )}
              </div>

              {/* x-intercept */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="featureXInterceptInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    x-Intercept (as ordered pair)
                  </label>
                  {cardChecks.featureXIntercept?.isCorrect && (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  )}
                </div>
                <input
                  id="featureXInterceptInput"
                  placeholder="e.g. (6, 0)"
                  value={featureXIntercept}
                  onChange={(e) => {
                    clearFeedback();
                    setFeatureXIntercept(e.target.value);
                  }}
                  style={inputStyle}
                />
                {feedbackTiming === 'guided' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => checkCard('featureXIntercept', () => validateXInterceptEntry(featureXIntercept, canonicalFacts))}
                      style={buttonStyle}
                    >
                      Check x-Intercept
                    </button>
                    {cardChecks.featureXIntercept?.checked && !cardChecks.featureXIntercept?.isCorrect && (
                      <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.featureXIntercept.error}</span>
                    )}
                  </div>
                )}
              </div>

              {/* y-intercept */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="featureYInterceptInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    y-Intercept (as ordered pair)
                  </label>
                  {cardChecks.featureYIntercept?.isCorrect && (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  )}
                </div>
                <input
                  id="featureYInterceptInput"
                  placeholder="e.g. (0, -3)"
                  value={featureYIntercept}
                  onChange={(e) => {
                    clearFeedback();
                    setFeatureYIntercept(e.target.value);
                  }}
                  style={inputStyle}
                />
                {feedbackTiming === 'guided' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => checkCard('featureYIntercept', () => validateYInterceptEntry(featureYIntercept, canonicalFacts))}
                      style={buttonStyle}
                    >
                      Check y-Intercept
                    </button>
                    {cardChecks.featureYIntercept?.checked && !cardChecks.featureYIntercept?.isCorrect && (
                      <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.featureYIntercept.error}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Two points */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                    Two Points on the Line
                  </span>
                  {cardChecks.featureTwoPoints?.isCorrect && (
                    <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    placeholder="Point 1: (x, y)"
                    value={featurePoint1}
                    onChange={(e) => {
                      clearFeedback();
                      setFeaturePoint1(e.target.value);
                    }}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Point 2: (x, y)"
                    value={featurePoint2}
                    onChange={(e) => {
                      clearFeedback();
                      setFeaturePoint2(e.target.value);
                    }}
                    style={inputStyle}
                  />
                </div>
                {feedbackTiming === 'guided' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => checkCard('featureTwoPoints', () => validateTwoPointsEntry(featurePoint1, featurePoint2, canonicalFacts))}
                      style={buttonStyle}
                    >
                      Check Two Points
                    </button>
                    {cardChecks.featureTwoPoints?.checked && !cardChecks.featureTwoPoints?.isCorrect && (
                      <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.featureTwoPoints.error}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {/* CATEGORY 3: TABLE OF VALUES */}
          <Panel title="Table of Values">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#475569' }}>
                  {givenKind === 'table' ? 'Starting given table' : 'Enter at least 4 ordered pairs that satisfy the line.'}
                </span>
                {givenKind === 'table' ? (
                  <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                ) : cardChecks.table?.isCorrect ? (
                  <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                ) : null}
              </div>

              {givenKind === 'table' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: 8, border: '1px solid #cbd5e1' }}>x</th>
                      <th style={{ padding: 8, border: '1px solid #cbd5e1' }}>y</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(questionData.source?.rows || []).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>{row.x}</td>
                        <td style={{ padding: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>{row.y}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: 8, border: '1px solid #cbd5e1' }}>x</th>
                        <th style={{ padding: 8, border: '1px solid #cbd5e1' }}>y</th>
                        <th style={{ padding: 8, border: '1px solid #cbd5e1', width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>
                            <input
                              placeholder="x"
                              value={row.x}
                              onChange={(e) => handleTableCellChange(idx, 'x', e.target.value)}
                              style={{ ...inputStyle, textAlign: 'center', minHeight: 36 }}
                            />
                          </td>
                          <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>
                            <input
                              placeholder="y"
                              value={row.y}
                              onChange={(e) => handleTableCellChange(idx, 'y', e.target.value)}
                              style={{ ...inputStyle, textAlign: 'center', minHeight: 36 }}
                            />
                          </td>
                          <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>
                            {tableRows.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeTableRow(idx)}
                                style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', color: '#b91c1c' }}
                                aria-label={`Remove row ${idx + 1}`}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={addTableRow}
                      style={{ ...buttonStyle, fontSize: 13 }}
                    >
                      + Add Row
                    </button>
                    {feedbackTiming === 'guided' && (
                      <button
                        type="button"
                        onClick={() => checkCard('table', () => validateTableEntry(tableRows, canonicalFacts, 4))}
                        style={buttonStyle}
                      >
                        Check Table
                      </button>
                    )}
                  </div>
                  {cardChecks.table?.checked && !cardChecks.table?.isCorrect && (
                    <div style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.table.error}</div>
                  )}
                </>
              )}
            </div>
          </Panel>

          {/* CATEGORY 4: THREE INDEPENDENT GRAPHS */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Three Separate Graph Constructions of the Same Line">
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 14 }}>
                Construct the same mathematical relationship using three distinct methods. Each graph maintains its own independent workspace.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
                  gap: 16,
                }}
              >
                {/* GRAPH 1 — INTERCEPTS */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15, color: '#1e293b' }}>Graph 1: Intercepts Method</strong>
                    {liveResult.parts.graph1 && (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Plot the line’s x-intercept and y-intercept to construct the line.
                  </div>
                  <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                    <CoordinatePlane
                      xMin={graphBounds.xMin}
                      xMax={graphBounds.xMax}
                      yMin={graphBounds.yMin}
                      yMax={graphBounds.yMax}
                      snapStep={1}
                      plottedPoints={graph1Points}
                      lines={graph1Line ? [graph1Line] : []}
                      onPlot={(pt) => {
                        clearFeedback();
                        setGraph1Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                      }}
                      onMovePoint={(idx, pt) => {
                        clearFeedback();
                        setGraph1Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                      {graph1Points.length} / 2 points plotted
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setGraph1Points((prev) => prev.slice(0, -1));
                        }}
                        disabled={graph1Points.length === 0}
                        style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setGraph1Points([]);
                        }}
                        disabled={graph1Points.length === 0}
                        style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                      >
                        Clear
                      </button>
                      {feedbackTiming === 'guided' && (
                        <button
                          type="button"
                          onClick={() => checkCard('graph1', () => evaluateGraph1Intercepts(graph1Points, canonicalFacts))}
                          style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                        >
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                  {cardChecks.graph1?.checked && !cardChecks.graph1?.isCorrect && (
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>
                      Plot both the actual x-intercept and y-intercept for this line.
                    </div>
                  )}
                </div>

                {/* GRAPH 2 — SLOPE-INTERCEPT */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15, color: '#1e293b' }}>Graph 2: Slope-Intercept Method</strong>
                    {liveResult.parts.graph2 && (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Plot the y-intercept, then use the slope (rise/run) to locate a second point.
                  </div>
                  <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                    <CoordinatePlane
                      xMin={graphBounds.xMin}
                      xMax={graphBounds.xMax}
                      yMin={graphBounds.yMin}
                      yMax={graphBounds.yMax}
                      snapStep={1}
                      plottedPoints={graph2Points}
                      lines={graph2Line ? [graph2Line] : []}
                      onPlot={(pt) => {
                        clearFeedback();
                        setGraph2Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                      }}
                      onMovePoint={(idx, pt) => {
                        clearFeedback();
                        setGraph2Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                      {graph2Points.length} / 2 points plotted
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setGraph2Points((prev) => prev.slice(0, -1));
                        }}
                        disabled={graph2Points.length === 0}
                        style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setGraph2Points([]);
                        }}
                        disabled={graph2Points.length === 0}
                        style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                      >
                        Clear
                      </button>
                      {feedbackTiming === 'guided' && (
                        <button
                          type="button"
                          onClick={() => checkCard('graph2', () => evaluateGraph2SlopeIntercept(graph2Points, canonicalFacts))}
                          style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                        >
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                  {cardChecks.graph2?.checked && !cardChecks.graph2?.isCorrect && (
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>
                      Start at the y-intercept (0, b), then use rise over run for your second point.
                    </div>
                  )}
                </div>

                {/* GRAPH 3 — POINT-SLOPE */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15, color: '#1e293b' }}>Graph 3: Point-Slope Method</strong>
                    {liveResult.parts.graph3 && (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Plot your chosen point from point-slope form, then use slope to locate a second point.
                  </div>
                  <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                    <CoordinatePlane
                      xMin={graphBounds.xMin}
                      xMax={graphBounds.xMax}
                      yMin={graphBounds.yMin}
                      yMax={graphBounds.yMax}
                      snapStep={1}
                      plottedPoints={graph3Points}
                      lines={graph3Line ? [graph3Line] : []}
                      onPlot={(pt) => {
                        clearFeedback();
                        setGraph3Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                      }}
                      onMovePoint={(idx, pt) => {
                        clearFeedback();
                        setGraph3Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                      {graph3Points.length} / 2 points plotted
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setGraph3Points((prev) => prev.slice(0, -1));
                        }}
                        disabled={graph3Points.length === 0}
                        style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setGraph3Points([]);
                        }}
                        disabled={graph3Points.length === 0}
                        style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                      >
                        Clear
                      </button>
                      {feedbackTiming === 'guided' && (
                        <button
                          type="button"
                          onClick={() => {
                            const psPoint = parsePointSlopeForm(pointSlopeEquation)?.point;
                            checkCard('graph3', () => evaluateGraph3PointSlope(graph3Points, canonicalFacts, psPoint));
                          }}
                          style={{ ...buttonStyle, minHeight: 36, padding: '4px 8px', fontSize: 12 }}
                        >
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                  {cardChecks.graph3?.checked && !cardChecks.graph3?.isCorrect && (
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>
                      Plot your point from point-slope form, then step with the slope to your second point.
                    </div>
                  )}
                </div>
              </div>

              {/* FINAL GRAPH COMPARISON OVERLAY (Instructional; only after all 3 completed) */}
              {allGraphsCorrect && (
                <div
                  style={{
                    marginTop: 20,
                    padding: 16,
                    background: '#f8fafc',
                    border: '2px solid #10b981',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={badgeStyle('#10b981', '#fff')}>DISCOVERY</span>
                    <strong style={{ fontSize: 16, color: '#065f46' }}>
                      All Three Methods Trace the Identical Line!
                    </strong>
                  </div>
                  <div style={{ fontSize: 14, color: '#334155', marginBottom: 12 }}>
                    Compare your constructions below. Whether you started with intercepts, slope-intercept, or point-slope, every method lands on the exact same linear relationship: <strong>{canonicalFacts.slopeInterceptEquation}</strong>.
                  </div>
                  <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
                    <CoordinatePlane
                      xMin={graphBounds.xMin}
                      xMax={graphBounds.xMax}
                      yMin={graphBounds.yMin}
                      yMax={graphBounds.yMax}
                      snapStep={1}
                      plottedPoints={[
                        ...(graph1Points || []),
                        ...(graph2Points || []),
                        ...(graph3Points || []),
                      ]}
                      lines={graph1Line ? [graph1Line] : []}
                    />
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
                    Green overlay: Intercepts · Slope-Intercept · Point-Slope points unified on the line.
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* CATEGORY 5: CONTEXT (If present / scenario mode) */}
          {hasContext && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Panel title="Real-World Context & Meanings">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                    <label htmlFor="contextIndependentInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                      Independent Quantity (x)
                    </label>
                    <input
                      id="contextIndependentInput"
                      placeholder="e.g. time in hours"
                      value={contextIndependent}
                      onChange={(e) => {
                        clearFeedback();
                        setContextIndependent(e.target.value);
                      }}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                    <label htmlFor="contextDependentInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                      Dependent Quantity (y)
                    </label>
                    <input
                      id="contextDependentInput"
                      placeholder="e.g. candle height in inches"
                      value={contextDependent}
                      onChange={(e) => {
                        clearFeedback();
                        setContextDependent(e.target.value);
                      }}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                    <label htmlFor="contextSlopeMeaningInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                      Meaning of Slope
                    </label>
                    <input
                      id="contextSlopeMeaningInput"
                      placeholder="e.g. burns down 2 inches per hour"
                      value={contextSlopeMeaning}
                      onChange={(e) => {
                        clearFeedback();
                        setContextSlopeMeaning(e.target.value);
                      }}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                    <label htmlFor="contextYInterceptMeaningInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                      Meaning of y-Intercept
                    </label>
                    <input
                      id="contextYInterceptMeaningInput"
                      placeholder="e.g. initial height of 18 inches"
                      value={contextYInterceptMeaning}
                      onChange={(e) => {
                        clearFeedback();
                        setContextYInterceptMeaning(e.target.value);
                      }}
                      style={inputStyle}
                    />
                  </div>
                  {questionData.domain && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                      <label htmlFor="contextDomainInput" style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                        Reasonable Domain
                      </label>
                      <input
                        id="contextDomainInput"
                        placeholder="e.g. 0 <= x <= 9"
                        value={contextDomain}
                        onChange={(e) => {
                          clearFeedback();
                          setContextDomain(e.target.value);
                        }}
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          )}
        </div>

        {/* Board Submission & Cross-Representation Consistency Section */}
        <div
          style={{
            marginTop: 10,
            padding: 18,
            background: 'var(--mm-surface-subtle, #f8fafc)',
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                Complete Board Verification
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Grades all required representations and checks coherence across your completed representations.
              </div>
            </div>
            <button
              type="button"
              onClick={handleBoardSubmit}
              style={{ ...primaryButtonStyle, minHeight: 46, padding: '10px 24px', fontSize: 15 }}
            >
              Submit Representation Board
            </button>
          </div>

          {feedback && (
            <div
              role="alert"
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: feedback.isCorrect ? '#dcfce7' : '#fee2e2',
                border: `1px solid ${feedback.isCorrect ? '#86efac' : '#fca5a5'}`,
                color: feedback.isCorrect ? '#14532d' : '#7f1d1d',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                {feedback.isCorrect ? 'Outstanding! All representations are correct and fully coherent.' : 'Your representation board needs another look.'}
              </div>
              <div style={{ fontSize: 13 }}>
                Score: {Math.round(feedback.score * 100)}%
              </div>
              {liveResult.evidence?.crossRepresentationConsistency?.disagreements?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>
                  Cross-representation disagreements found:
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {liveResult.evidence.crossRepresentationConsistency.disagreements.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
