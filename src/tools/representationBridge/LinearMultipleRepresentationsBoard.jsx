import React, { useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import CoordinatePlane from '../shared/CoordinatePlane';
import MathInput from '../../MathInput.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import { lineFromPoints } from '../graphing2/graphingMath.js';
import {
  deriveLinearMultipleRepresentations,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  expandGraphBoundsForAnchor,
  parsePointSlopeForm,
  resolveLinearMultipleRepresentationsGraphBounds,
  resolveSnapStep,
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

const ghostButtonStyle = {
  ...buttonStyle,
  background: 'transparent',
  border: 'none',
  padding: '4px 8px',
  minHeight: 32,
  color: '#1a73e8',
  fontSize: 13,
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
    graphing: true,
    context: true,
    graph1: true,
    graph2: false,
    graph3: false,
  });

  // Presentation-only transient UI state
  const [notice, setNotice] = useState('');
  const [enlargedGraph, setEnlargedGraph] = useState(null);

  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const studentPsPoint = useMemo(() => {
    if (!pointSlopeEquation) return null;
    const parsed = parsePointSlopeForm(pointSlopeEquation);
    return parsed?.point || null;
  }, [pointSlopeEquation]);

  // Snap step for coordinate plane
  const graphSnapStep = useMemo(() => resolveSnapStep(questionData, canonicalFacts), [questionData, canonicalFacts]);

  const graph3SnapStep = useMemo(() => {
    const extra = [];
    if (studentPsPoint) extra.push(studentPsPoint);
    if (canonicalFacts.sourcePoint) extra.push(canonicalFacts.sourcePoint);
    return resolveSnapStep(questionData, canonicalFacts, extra);
  }, [questionData, canonicalFacts, studentPsPoint]);

  // Context metadata and choice banks
  const contextData = questionData.source?.context || questionData.context || {};
  const contextChoices = useMemo(() => {
    const rawBanks = contextData?.choiceBanks || contextData?.choices || {};
    const out = {};
    ['independentQuantity', 'dependentQuantity', 'slopeMeaning', 'yInterceptMeaning', 'xInterceptMeaning', 'domain'].forEach((k) => {
      if (Array.isArray(rawBanks[k])) {
        out[k] = rawBanks[k];
      } else if (contextData?.[k]?.choices && Array.isArray(contextData[k].choices)) {
        out[k] = contextData[k].choices;
      }
    });
    return out;
  }, [contextData]);

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
    return resolveLinearMultipleRepresentationsGraphBounds(questionData, canonicalFacts);
  }, [questionData, canonicalFacts]);

  const graph1Bounds = graphBounds;
  const graph2Bounds = graphBounds;

  const graph3Bounds = useMemo(() => {
    let bounds = graphBounds;
    if (canonicalFacts.sourcePoint) {
      bounds = expandGraphBoundsForAnchor(bounds, canonicalFacts.sourcePoint, canonicalFacts);
    }
    if (studentPsPoint) {
      bounds = expandGraphBoundsForAnchor(bounds, studentPsPoint, canonicalFacts);
    }
    return bounds;
  }, [graphBounds, canonicalFacts, studentPsPoint]);

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

  // Toggle card expansion (never clears any student work)
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

  // Graph 3 point-slope anchor determination:
  // Case A: Given point-slope -> uses given point
  // Case B: Student authored valid point-slope -> uses that student's point
  // Case C: Student opens Graph 3 before authoring point-slope -> anchor is null, allows free point on line
  const checkGraph3 = () => {
    let psAnchor = null;
    if (givenKind === 'pointSlope') {
      if (canonicalFacts.sourcePoint) {
        psAnchor = canonicalFacts.sourcePoint;
      } else if (questionData.source?.point) {
        psAnchor = questionData.source.point;
      } else if (questionData.source?.equation) {
        const parsed = parsePointSlopeForm(questionData.source.equation);
        if (parsed?.point) psAnchor = parsed.point;
      }
    } else if (pointSlopeEquation) {
      const parsed = parsePointSlopeForm(pointSlopeEquation);
      if (parsed?.point) psAnchor = parsed.point;
    }
    checkCard('graph3', () => evaluateGraph3PointSlope(graph3Points, canonicalFacts, psAnchor));
  };

  // Status strip counts
  const formsTotal = givenKind === 'standardForm' || givenKind === 'slopeIntercept' || givenKind === 'pointSlope' ? 2 : 3;
  const formsDone = [
    givenKind !== 'standardForm' && liveResult.parts.standardForm,
    givenKind !== 'slopeIntercept' && liveResult.parts.slopeIntercept,
    givenKind !== 'pointSlope' && liveResult.parts.pointSlope,
  ].filter(Boolean).length;

  const featuresTotal = givenKind === 'twoPoints' ? 3 : 4;
  const featuresDone = [
    liveResult.parts.slope,
    liveResult.parts.xIntercept,
    liveResult.parts.yIntercept,
    givenKind !== 'twoPoints' && liveResult.parts.twoPoints,
  ].filter(Boolean).length;

  const tableTotal = givenKind === 'table' ? 0 : 1;
  const tableDone = givenKind === 'table' ? 0 : (liveResult.parts.table ? 1 : 0);

  const graphsTotal = 3;
  const graphsDone = [
    liveResult.parts.graph1,
    liveResult.parts.graph2,
    liveResult.parts.graph3,
  ].filter(Boolean).length;

  const contextKeys = useMemo(() => {
    const keys = [];
    if (contextData.independentQuantity != null) keys.push('contextIndependent');
    if (contextData.dependentQuantity != null) keys.push('contextDependent');
    if (contextData.slopeMeaning != null) keys.push('contextSlopeMeaning');
    if (contextData.yInterceptMeaning != null) keys.push('contextYInterceptMeaning');
    if (contextData.xInterceptMeaning != null) keys.push('contextXInterceptMeaning');
    if (contextData.domain != null || questionData.domain != null) keys.push('contextDomain');
    return keys;
  }, [contextData, questionData.domain]);

  const hasContext = contextKeys.length > 0;
  const contextTotal = contextKeys.length;
  const contextDone = contextKeys.filter((key) => liveResult.parts[key]).length;

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
      return pts ? `(${pts[0].join(', ')}) \\text{ and } (${pts[1].join(', ')})` : 'Two given points';
    }
    if (givenKind === 'scenario') return questionData.source?.prompt || questionData.prompt || 'Given word scenario';
    if (givenKind === 'graph') return 'Given initial graph';
    return 'Given initial relationship';
  }, [givenKind, questionData, canonicalFacts]);

  // Enlarged graph configuration
  const enlargedGraphConfig = useMemo(() => {
    if (enlargedGraph === 'graph1') {
      return {
        id: 'graph1',
        title: 'Graph 1: Intercepts Method',
        subtitle: 'Standard Form Focus',
        taskInstruction: 'Plot both the x-intercept and y-intercept on the axes to construct the line.',
        points: graph1Points,
        line: graph1Line,
        errorHint: 'Plot both the actual x-intercept and y-intercept for this line.',
        checkResult: cardChecks.graph1,
        onPlot: (pt) => {
          clearFeedback();
          setGraph1Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
        },
        onMovePoint: (idx, pt) => {
          clearFeedback();
          setGraph1Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
        },
        onUndo: () => {
          clearFeedback();
          setGraph1Points((prev) => prev.slice(0, -1));
        },
        onClear: () => {
          clearFeedback();
          setGraph1Points([]);
        },
        onCheck: () => checkCard('graph1', () => evaluateGraph1Intercepts(graph1Points, canonicalFacts)),
      };
    }
    if (enlargedGraph === 'graph2') {
      return {
        id: 'graph2',
        title: 'Graph 2: Slope-Intercept Method',
        subtitle: 'Slope & y-Intercept Focus',
        taskInstruction: 'Plot the y-intercept (0, b), then use the slope (rise / run) to plot a second point.',
        points: graph2Points,
        line: graph2Line,
        errorHint: 'Start at the y-intercept (0, b), then step with rise over run for your second point.',
        checkResult: cardChecks.graph2,
        onPlot: (pt) => {
          clearFeedback();
          setGraph2Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
        },
        onMovePoint: (idx, pt) => {
          clearFeedback();
          setGraph2Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
        },
        onUndo: () => {
          clearFeedback();
          setGraph2Points((prev) => prev.slice(0, -1));
        },
        onClear: () => {
          clearFeedback();
          setGraph2Points([]);
        },
        onCheck: () => checkCard('graph2', () => evaluateGraph2SlopeIntercept(graph2Points, canonicalFacts)),
      };
    }
    if (enlargedGraph === 'graph3') {
      return {
        id: 'graph3',
        title: 'Graph 3: Point-Slope Method',
        subtitle: 'Point-Slope Anchor Focus',
        taskInstruction: 'Plot your point from point-slope form, then use the slope to locate a second point.',
        points: graph3Points,
        line: graph3Line,
        errorHint: 'Plot your chosen point from point-slope form, then use slope to locate a second point.',
        checkResult: cardChecks.graph3,
        onPlot: (pt) => {
          clearFeedback();
          setGraph3Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
        },
        onMovePoint: (idx, pt) => {
          clearFeedback();
          setGraph3Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
        },
        onUndo: () => {
          clearFeedback();
          setGraph3Points((prev) => prev.slice(0, -1));
        },
        onClear: () => {
          clearFeedback();
          setGraph3Points([]);
        },
        onCheck: checkGraph3,
      };
    }
    return null;
  }, [
    enlargedGraph,
    graph1Points,
    graph1Line,
    graph2Points,
    graph2Line,
    graph3Points,
    graph3Line,
    cardChecks,
    canonicalFacts,
    pointSlopeEquation,
    givenKind,
    questionData,
  ]);

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
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
              <strong style={{ fontSize: 15, color: '#1e3a8a' }}>Starting Representation</strong>
            </div>
            {givenKind === 'graph' ? (
              <div style={{ marginTop: 8 }}>
                <CoordinatePlane
                  xMin={graphBounds.xMin}
                  xMax={graphBounds.xMax}
                  yMin={graphBounds.yMin}
                  yMax={graphBounds.yMax}
                  width={360}
                  height={240}
                  points={questionData.source?.points || (canonicalFacts.twoPoints ? [canonicalFacts.twoPoints.point1, canonicalFacts.twoPoints.point2] : [])}
                  lines={canonicalFacts.displayLine ? [canonicalFacts.displayLine] : []}
                  snapStep={graphSnapStep}
                  pointHoverEnabled={false}
                  enlargeable={false}
                  ariaLabel="Given starting line graph"
                />
              </div>
            ) : (
              <div style={{ fontSize: 17, fontWeight: 800, color: '#172554', marginTop: 4 }}>
                <MathDisplay value={givenDisplay} inline={true} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#1e40af', maxWidth: 360 }}>
            Complete the remaining representations in any order you choose. No representation is locked.
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {formsDone}/{formsTotal} completed
              </span>
              <button
                type="button"
                onClick={() => toggleCard('equationForms')}
                style={ghostButtonStyle}
                aria-label={expandedCards.equationForms ? 'Collapse equation forms' : 'Expand equation forms'}
              >
                {expandedCards.equationForms ? '▾ Collapse' : '▸ Expand'}
              </button>
            </div>

            {!expandedCards.equationForms ? (
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                {standardFormEquation && <div>Standard: <MathDisplay value={standardFormEquation} inline /></div>}
                {slopeInterceptEquation && <div>Slope-Int: <MathDisplay value={slopeInterceptEquation} inline /></div>}
                {pointSlopeEquation && <div>Point-Slope: <MathDisplay value={pointSlopeEquation} inline /></div>}
                {!standardFormEquation && !slopeInterceptEquation && !pointSlopeEquation && <em>No equations entered yet</em>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Standard Form Card */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                      Standard Form (Ax + By = C)
                    </label>
                    {givenKind === 'standardForm' ? (
                      <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                    ) : cardChecks.standardForm?.isCorrect ? (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    ) : null}
                  </div>
                  {givenKind === 'standardForm' ? (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
                      <MathDisplay value={givenDisplay} inline />
                    </div>
                  ) : (
                    <>
                      <MathInput
                        toolProfile="equation"
                        placeholder="Ax + By = C"
                        ariaLabel="Standard form equation"
                        value={standardFormEquation}
                        onChange={(val) => {
                          clearFeedback();
                          setStandardFormEquation(val);
                        }}
                        onSubmit={() => checkCard('standardForm', () => validateStandardFormEntry(standardFormEquation, canonicalFacts))}
                      />
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Use integer coefficients with no common factors and a positive leading coefficient.
                      </div>
                      {feedbackTiming === 'guided' && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                      Slope-Intercept Form (y = mx + b)
                    </label>
                    {givenKind === 'slopeIntercept' ? (
                      <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                    ) : cardChecks.slopeIntercept?.isCorrect ? (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    ) : null}
                  </div>
                  {givenKind === 'slopeIntercept' ? (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
                      <MathDisplay value={givenDisplay} inline />
                    </div>
                  ) : (
                    <>
                      <MathInput
                        toolProfile="equation"
                        placeholder="y = mx + b"
                        ariaLabel="Slope-intercept form equation"
                        value={slopeInterceptEquation}
                        onChange={(val) => {
                          clearFeedback();
                          setSlopeInterceptEquation(val);
                        }}
                        onSubmit={() => checkCard('slopeIntercept', () => validateSlopeInterceptEntry(slopeInterceptEquation, canonicalFacts))}
                      />
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Keep exact simplified fractions for slope and y-intercept.
                      </div>
                      {feedbackTiming === 'guided' && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                      Point-Slope Form: y − y₁ = m(x − x₁)
                    </label>
                    {givenKind === 'pointSlope' ? (
                      <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                    ) : cardChecks.pointSlope?.isCorrect ? (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    ) : null}
                  </div>
                  {givenKind === 'pointSlope' ? (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
                      <MathDisplay value={givenDisplay} inline />
                    </div>
                  ) : (
                    <>
                      <MathInput
                        toolProfile="equation"
                        placeholder="y - y1 = m(x - x1)"
                        ariaLabel="Point-slope form equation"
                        value={pointSlopeEquation}
                        onChange={(val) => {
                          clearFeedback();
                          setPointSlopeEquation(val);
                        }}
                        onSubmit={() => checkCard('pointSlope', () => validatePointSlopeEntry(pointSlopeEquation, canonicalFacts))}
                      />
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Any valid point on this line may be used as your anchor point (x₁, y₁).
                      </div>
                      {feedbackTiming === 'guided' && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
            )}
          </Panel>

          {/* CATEGORY 2: KEY FEATURES */}
          <Panel title="Key Features">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {featuresDone}/{featuresTotal} completed
              </span>
              <button
                type="button"
                onClick={() => toggleCard('features')}
                style={ghostButtonStyle}
                aria-label={expandedCards.features ? 'Collapse features' : 'Expand features'}
              >
                {expandedCards.features ? '▾ Collapse' : '▸ Expand'}
              </button>
            </div>

            {!expandedCards.features ? (
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                <div>m: {featureSlope || '—'} · x-int: {featureXIntercept || '—'} · y-int: {featureYIntercept || '—'}</div>
                {(featurePoint1 || featurePoint2) && <div>Points: {featurePoint1 || '—'} and {featurePoint2 || '—'}</div>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Slope */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>Slope (m)</label>
                    {cardChecks.slope?.isCorrect && (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    )}
                  </div>
                  <MathInput
                    toolProfile="number"
                    placeholder="e.g. 1/2 or -3"
                    ariaLabel="Slope value"
                    value={featureSlope}
                    onChange={(val) => {
                      clearFeedback();
                      setFeatureSlope(val);
                    }}
                    onSubmit={() => checkCard('slope', () => validateSlopeEntry(featureSlope, canonicalFacts))}
                  />
                  {feedbackTiming === 'guided' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => checkCard('slope', () => validateSlopeEntry(featureSlope, canonicalFacts))}
                        style={buttonStyle}
                      >
                        Check Slope
                      </button>
                      {cardChecks.slope?.checked && !cardChecks.slope?.isCorrect && (
                        <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.slope.error}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* x-intercept */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>x-Intercept</label>
                    {cardChecks.xIntercept?.isCorrect && (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    )}
                  </div>
                  <MathInput
                    toolProfile="orderedPair"
                    placeholder="(x, 0)"
                    ariaLabel="x-intercept ordered pair"
                    value={featureXIntercept}
                    onChange={(val) => {
                      clearFeedback();
                      setFeatureXIntercept(val);
                    }}
                    onSubmit={() => checkCard('xIntercept', () => validateXInterceptEntry(featureXIntercept, canonicalFacts))}
                  />
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Enter as an ordered pair: (x, 0).
                  </div>
                  {feedbackTiming === 'guided' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => checkCard('xIntercept', () => validateXInterceptEntry(featureXIntercept, canonicalFacts))}
                        style={buttonStyle}
                      >
                        Check x-Intercept
                      </button>
                      {cardChecks.xIntercept?.checked && !cardChecks.xIntercept?.isCorrect && (
                        <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.xIntercept.error}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* y-intercept */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>y-Intercept</label>
                    {cardChecks.yIntercept?.isCorrect && (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    )}
                  </div>
                  <MathInput
                    toolProfile="orderedPair"
                    placeholder="(0, y)"
                    ariaLabel="y-intercept ordered pair"
                    value={featureYIntercept}
                    onChange={(val) => {
                      clearFeedback();
                      setFeatureYIntercept(val);
                    }}
                    onSubmit={() => checkCard('yIntercept', () => validateYInterceptEntry(featureYIntercept, canonicalFacts))}
                  />
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Enter as an ordered pair: (0, y).
                  </div>
                  {feedbackTiming === 'guided' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => checkCard('yIntercept', () => validateYInterceptEntry(featureYIntercept, canonicalFacts))}
                        style={buttonStyle}
                      >
                        Check y-Intercept
                      </button>
                      {cardChecks.yIntercept?.checked && !cardChecks.yIntercept?.isCorrect && (
                        <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.yIntercept.error}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Two Distinct Points on Line */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>Two Distinct Points</label>
                    {givenKind === 'twoPoints' ? (
                      <span style={badgeStyle('#2563eb', '#fff')}>GIVEN</span>
                    ) : cardChecks.twoPoints?.isCorrect ? (
                      <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                    ) : null}
                  </div>
                  {givenKind === 'twoPoints' ? (
                    <div>
                      <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>
                        Point 1: ({canonicalFacts.twoPoints?.point1 ? canonicalFacts.twoPoints.point1.join(', ') : 'x₁, y₁'}) &nbsp;·&nbsp; Point 2: ({canonicalFacts.twoPoints?.point2 ? canonicalFacts.twoPoints.point2.join(', ') : 'x₂, y₂'})
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        These points were provided as the starting representation.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <MathInput
                          toolProfile="orderedPair"
                          placeholder="Point 1 (x, y)"
                          ariaLabel="First distinct point"
                          value={featurePoint1}
                          onChange={(val) => {
                            clearFeedback();
                            setFeaturePoint1(val);
                          }}
                          onSubmit={() => checkCard('twoPoints', () => validateTwoPointsEntry(featurePoint1, featurePoint2, canonicalFacts))}
                        />
                        <MathInput
                          toolProfile="orderedPair"
                          placeholder="Point 2 (x, y)"
                          ariaLabel="Second distinct point"
                          value={featurePoint2}
                          onChange={(val) => {
                            clearFeedback();
                            setFeaturePoint2(val);
                          }}
                          onSubmit={() => checkCard('twoPoints', () => validateTwoPointsEntry(featurePoint1, featurePoint2, canonicalFacts))}
                        />
                      </div>
                      {feedbackTiming === 'guided' && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => checkCard('twoPoints', () => validateTwoPointsEntry(featurePoint1, featurePoint2, canonicalFacts))}
                            style={buttonStyle}
                          >
                            Check Points
                          </button>
                          {cardChecks.twoPoints?.checked && !cardChecks.twoPoints?.isCorrect && (
                            <span style={{ fontSize: 12, color: '#b91c1c' }}>{cardChecks.twoPoints.error}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* CATEGORY 3: NUMERICAL TABLE */}
          {tableTotal > 0 && (
            <Panel title="Table of Values">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {tableDone ? '✓ Completed' : '4 rows required'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCard('table')}
                  style={ghostButtonStyle}
                  aria-label={expandedCards.table ? 'Collapse table' : 'Expand table'}
                >
                  {expandedCards.table ? '▾ Collapse' : '▸ Expand'}
                </button>
              </div>

              {!expandedCards.table ? (
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                  {tableRows.filter(r => r.x && r.y).length} / 4 rows filled
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Enter at least 4 distinct (x, y) pairs satisfying the relationship.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>x</th>
                        <th style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>y</th>
                        <th style={{ width: 44 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.x}
                              onChange={(e) => handleTableCellChange(idx, 'x', e.target.value)}
                              placeholder={`x${idx + 1}`}
                              style={{ ...inputStyle, textAlign: 'center' }}
                              aria-label={`Row ${idx + 1} x`}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.y}
                              onChange={(e) => handleTableCellChange(idx, 'y', e.target.value)}
                              placeholder={`y${idx + 1}`}
                              style={{ ...inputStyle, textAlign: 'center' }}
                              aria-label={`Row ${idx + 1} y`}
                            />
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            {tableRows.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeTableRow(idx)}
                                style={{ ...buttonStyle, minHeight: 32, padding: '4px 8px', fontSize: 12, color: '#b91c1c' }}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" onClick={addTableRow} style={buttonStyle}>
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
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>
                      {cardChecks.table.error}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          )}

          {/* CATEGORY 4: GRAPHING (Three Distinct Graphing Methods) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <Panel title="Three Separate Graphing Methods">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, color: '#475569' }}>
                  Construct the line using three distinct graphing methods.
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                  {graphsDone}/3 graphs complete
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                {/* GRAPH 1 — INTERCEPTS */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15, color: '#1e293b' }}>Graph 1: Intercepts Method</strong>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {liveResult.parts.graph1 && (
                        <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEnlargedGraph('graph1')}
                        style={ghostButtonStyle}
                        aria-label="Enlarge Graph 1"
                      >
                        ⤢ Enlarge
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCard('graph1')}
                        style={ghostButtonStyle}
                        aria-label={expandedCards.graph1 ? 'Collapse Graph 1' : 'Expand Graph 1'}
                      >
                        {expandedCards.graph1 ? '▾' : '▸'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Plot both the x-intercept and y-intercept on the axes as your evidence.
                  </div>

                  {!expandedCards.graph1 ? (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                      {graph1Points.length} / 2 points plotted {graph1Points.length > 0 && `(${graph1Points.map(p => `(${p[0]}, ${p[1]})`).join(', ')})`}
                    </div>
                  ) : (
                    <>
                      <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                        <CoordinatePlane
                          xMin={graph1Bounds.xMin}
                          xMax={graph1Bounds.xMax}
                          yMin={graph1Bounds.yMin}
                          yMax={graph1Bounds.yMax}
                          snapStep={graphSnapStep}
                          points={graph1Points}
                          lines={graph1Line ? [graph1Line] : []}
                          onPlot={(pt) => {
                            clearFeedback();
                            setGraph1Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                          }}
                          onMovePoint={(idx, pt) => {
                            clearFeedback();
                            setGraph1Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
                          }}
                          enlargeable={false}
                          ariaLabel="Coordinate plane for Graph 1: Intercepts"
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
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
                    </>
                  )}
                </div>

                {/* GRAPH 2 — SLOPE-INTERCEPT */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15, color: '#1e293b' }}>Graph 2: Slope-Intercept Method</strong>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {liveResult.parts.graph2 && (
                        <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEnlargedGraph('graph2')}
                        style={ghostButtonStyle}
                        aria-label="Enlarge Graph 2"
                      >
                        ⤢ Enlarge
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCard('graph2')}
                        style={ghostButtonStyle}
                        aria-label={expandedCards.graph2 ? 'Collapse Graph 2' : 'Expand Graph 2'}
                      >
                        {expandedCards.graph2 ? '▾' : '▸'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Plot the y-intercept, then use the slope (rise/run) to locate a second point.
                  </div>

                  {!expandedCards.graph2 ? (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                      {graph2Points.length} / 2 points plotted {graph2Points.length > 0 && `(${graph2Points.map(p => `(${p[0]}, ${p[1]})`).join(', ')})`}
                    </div>
                  ) : (
                    <>
                      <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                        <CoordinatePlane
                          xMin={graph2Bounds.xMin}
                          xMax={graph2Bounds.xMax}
                          yMin={graph2Bounds.yMin}
                          yMax={graph2Bounds.yMax}
                          snapStep={graphSnapStep}
                          points={graph2Points}
                          lines={graph2Line ? [graph2Line] : []}
                          onPlot={(pt) => {
                            clearFeedback();
                            setGraph2Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                          }}
                          onMovePoint={(idx, pt) => {
                            clearFeedback();
                            setGraph2Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
                          }}
                          enlargeable={false}
                          ariaLabel="Coordinate plane for Graph 2: Slope-Intercept"
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
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
                    </>
                  )}
                </div>

                {/* GRAPH 3 — POINT-SLOPE */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15, color: '#1e293b' }}>Graph 3: Point-Slope Method</strong>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {liveResult.parts.graph3 && (
                        <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEnlargedGraph('graph3')}
                        style={ghostButtonStyle}
                        aria-label="Enlarge Graph 3"
                      >
                        ⤢ Enlarge
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCard('graph3')}
                        style={ghostButtonStyle}
                        aria-label={expandedCards.graph3 ? 'Collapse Graph 3' : 'Expand Graph 3'}
                      >
                        {expandedCards.graph3 ? '▾' : '▸'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    Plot your chosen point from point-slope form, then use slope to locate a second point.
                  </div>

                  {!expandedCards.graph3 ? (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                      {graph3Points.length} / 2 points plotted {graph3Points.length > 0 && `(${graph3Points.map(p => `(${p[0]}, ${p[1]})`).join(', ')})`}
                    </div>
                  ) : (
                    <>
                      <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
                        <CoordinatePlane
                          xMin={graph3Bounds.xMin}
                          xMax={graph3Bounds.xMax}
                          yMin={graph3Bounds.yMin}
                          yMax={graph3Bounds.yMax}
                          snapStep={graph3SnapStep}
                          points={graph3Points}
                          lines={graph3Line ? [graph3Line] : []}
                          onPlot={(pt) => {
                            clearFeedback();
                            setGraph3Points((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                          }}
                          onMovePoint={(idx, pt) => {
                            clearFeedback();
                            setGraph3Points((prev) => prev.map((p, i) => (i === idx ? pt : p)));
                          }}
                          enlargeable={false}
                          ariaLabel="Coordinate plane for Graph 3: Point-Slope"
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
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
                              onClick={checkGraph3}
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
                    </>
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
                    Compare your constructions below. Whether you started with intercepts, slope-intercept, or point-slope, every method lands on the exact same linear relationship: <strong><MathDisplay value={canonicalFacts.slopeInterceptEquation} inline /></strong>.
                  </div>
                  <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
                    <CoordinatePlane
                      xMin={(graph3Points.length > 0 ? graph3Bounds : graphBounds).xMin}
                      xMax={(graph3Points.length > 0 ? graph3Bounds : graphBounds).xMax}
                      yMin={(graph3Points.length > 0 ? graph3Bounds : graphBounds).yMin}
                      yMax={(graph3Points.length > 0 ? graph3Bounds : graphBounds).yMax}
                      snapStep={graphSnapStep}
                      points={[
                        ...(graph1Points || []),
                        ...(graph2Points || []),
                        ...(graph3Points || []),
                      ]}
                      lines={graph1Line ? [graph1Line] : []}
                      enlargeable={false}
                      ariaLabel="Combined overlay of all three graph methods"
                    />
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
                    Unified overlay: Intercepts · Slope-Intercept · Point-Slope points together on the line.
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* CATEGORY 5: CONTEXT (If present / scenario mode) */}
          {hasContext && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Panel title="Real-World Context & Meanings">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>
                    {contextDone}/{contextTotal} components completed
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCard('context')}
                    style={ghostButtonStyle}
                    aria-label={expandedCards.context ? 'Collapse context' : 'Expand context'}
                  >
                    {expandedCards.context ? '▾ Collapse' : '▸ Expand'}
                  </button>
                </div>

                {!expandedCards.context ? (
                  <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                    Context summary: {contextDone}/{contextTotal} questions answered
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {/* Independent Quantity */}
                    {contextData.independentQuantity != null && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                            Independent Quantity (x)
                          </label>
                          {liveResult.parts.contextIndependent && (
                            <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                          )}
                        </div>
                        {contextChoices.independentQuantity?.length ? (
                          <select
                            value={contextIndependent}
                            onChange={(e) => {
                              clearFeedback();
                              setContextIndependent(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Independent quantity selection"
                          >
                            <option value="">Select quantity...</option>
                            {contextChoices.independentQuantity.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            placeholder="e.g. time in hours"
                            value={contextIndependent}
                            onChange={(e) => {
                              clearFeedback();
                              setContextIndependent(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Independent quantity"
                          />
                        )}
                      </div>
                    )}

                    {/* Dependent Quantity */}
                    {contextData.dependentQuantity != null && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                            Dependent Quantity (y)
                          </label>
                          {liveResult.parts.contextDependent && (
                            <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                          )}
                        </div>
                        {contextChoices.dependentQuantity?.length ? (
                          <select
                            value={contextDependent}
                            onChange={(e) => {
                              clearFeedback();
                              setContextDependent(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Dependent quantity selection"
                          >
                            <option value="">Select quantity...</option>
                            {contextChoices.dependentQuantity.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            placeholder="e.g. candle height in inches"
                            value={contextDependent}
                            onChange={(e) => {
                              clearFeedback();
                              setContextDependent(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Dependent quantity"
                          />
                        )}
                      </div>
                    )}

                    {/* Meaning of Slope */}
                    {contextData.slopeMeaning != null && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                            Meaning of Slope
                          </label>
                          {liveResult.parts.contextSlopeMeaning && (
                            <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                          )}
                        </div>
                        {contextChoices.slopeMeaning?.length ? (
                          <select
                            value={contextSlopeMeaning}
                            onChange={(e) => {
                              clearFeedback();
                              setContextSlopeMeaning(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Meaning of slope selection"
                          >
                            <option value="">Select interpretation...</option>
                            {contextChoices.slopeMeaning.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            placeholder="e.g. candle burns down 2 inches per hour"
                            value={contextSlopeMeaning}
                            onChange={(e) => {
                              clearFeedback();
                              setContextSlopeMeaning(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Meaning of slope"
                          />
                        )}
                      </div>
                    )}

                    {/* Meaning of y-Intercept */}
                    {contextData.yInterceptMeaning != null && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                            Meaning of y-Intercept
                          </label>
                          {liveResult.parts.contextYInterceptMeaning && (
                            <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                          )}
                        </div>
                        {contextChoices.yInterceptMeaning?.length ? (
                          <select
                            value={contextYInterceptMeaning}
                            onChange={(e) => {
                              clearFeedback();
                              setContextYInterceptMeaning(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Meaning of y-intercept selection"
                          >
                            <option value="">Select interpretation...</option>
                            {contextChoices.yInterceptMeaning.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            placeholder="e.g. initial height of 18 inches"
                            value={contextYInterceptMeaning}
                            onChange={(e) => {
                              clearFeedback();
                              setContextYInterceptMeaning(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Meaning of y-intercept"
                          />
                        )}
                      </div>
                    )}

                    {/* Meaning of x-Intercept */}
                    {contextData.xInterceptMeaning != null && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                            Meaning of x-Intercept
                          </label>
                          {liveResult.parts.contextXInterceptMeaning && (
                            <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                          )}
                        </div>
                        {contextChoices.xInterceptMeaning?.length ? (
                          <select
                            value={contextXInterceptMeaning}
                            onChange={(e) => {
                              clearFeedback();
                              setContextXInterceptMeaning(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Meaning of x-intercept selection"
                          >
                            <option value="">Select interpretation...</option>
                            {contextChoices.xInterceptMeaning.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            placeholder="e.g. candle is completely burned out"
                            value={contextXInterceptMeaning}
                            onChange={(e) => {
                              clearFeedback();
                              setContextXInterceptMeaning(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Meaning of x-intercept"
                          />
                        )}
                      </div>
                    )}

                    {/* Reasonable Domain */}
                    {(contextData.domain != null || questionData.domain != null) && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                            Reasonable Domain
                          </label>
                          {liveResult.parts.contextDomain && (
                            <span style={badgeStyle('#dcfce7', '#166534')}>✓ Correct</span>
                          )}
                        </div>
                        {contextChoices.domain?.length ? (
                          <select
                            value={contextDomain}
                            onChange={(e) => {
                              clearFeedback();
                              setContextDomain(e.target.value);
                            }}
                            style={inputStyle}
                            aria-label="Reasonable domain selection"
                          >
                            <option value="">Select reasonable domain...</option>
                            {contextChoices.domain.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <MathInput
                            toolProfile="inequality"
                            placeholder="e.g. 0 ≤ x ≤ 9"
                            ariaLabel="Reasonable domain"
                            value={contextDomain}
                            onChange={(val) => {
                              clearFeedback();
                              setContextDomain(val);
                            }}
                          />
                        )}
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          Enter as an inequality (e.g. 0 ≤ x ≤ 9) or interval [0, 9].
                        </div>
                      </div>
                    )}
                  </div>
                )}
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

      {/* Enlarged Graph Work View Modal */}
      {enlargedGraph && enlargedGraphConfig && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged ${enlargedGraphConfig.title}`}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 720,
              width: '100%',
              maxHeight: '94vh',
              overflowY: 'auto',
              padding: 20,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>{enlargedGraphConfig.title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{enlargedGraphConfig.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setEnlargedGraph(null)}
                style={{ ...buttonStyle, minHeight: 38, padding: '6px 12px' }}
                aria-label="Close enlarged graph"
              >
                ✕ Close
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: 13, color: '#334155' }}>
              <strong>Task: </strong>{enlargedGraphConfig.taskInstruction}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {(enlargedGraph === 'graph3' ? graph3SnapStep : graphSnapStep) === 1
                  ? 'Points snap to whole numbers.'
                  : `Points snap to the nearest ${enlargedGraph === 'graph3' ? graph3SnapStep : graphSnapStep}.`}
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <CoordinatePlane
                xMin={(enlargedGraph === 'graph3' ? graph3Bounds : graphBounds).xMin}
                xMax={(enlargedGraph === 'graph3' ? graph3Bounds : graphBounds).xMax}
                yMin={(enlargedGraph === 'graph3' ? graph3Bounds : graphBounds).yMin}
                yMax={(enlargedGraph === 'graph3' ? graph3Bounds : graphBounds).yMax}
                width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 64 : 560)}
                height={380}
                snapStep={enlargedGraph === 'graph3' ? graph3SnapStep : graphSnapStep}
                points={enlargedGraphConfig.points}
                lines={enlargedGraphConfig.line ? [enlargedGraphConfig.line] : []}
                onPlot={enlargedGraphConfig.onPlot}
                onMovePoint={enlargedGraphConfig.onMovePoint}
                enlargeable={false}
                ariaLabel={enlargedGraphConfig.title}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
                {enlargedGraphConfig.points.length} / 2 points plotted
                {enlargedGraphConfig.points.length > 0 && `: ${enlargedGraphConfig.points.map(p => `(${p[0]}, ${p[1]})`).join(', ')}`}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={enlargedGraphConfig.onUndo}
                  disabled={enlargedGraphConfig.points.length === 0}
                  style={buttonStyle}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={enlargedGraphConfig.onClear}
                  disabled={enlargedGraphConfig.points.length === 0}
                  style={buttonStyle}
                >
                  Clear / Start over
                </button>
                {feedbackTiming === 'guided' && (
                  <button
                    type="button"
                    onClick={enlargedGraphConfig.onCheck}
                    style={primaryButtonStyle}
                  >
                    Check construction
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEnlargedGraph(null)}
                  style={{ ...buttonStyle, background: '#f1f5f9' }}
                >
                  Done
                </button>
              </div>
            </div>

            {enlargedGraphConfig.checkResult?.checked && (
              <div style={{ marginTop: 4 }}>
                <ResultPill ok={enlargedGraphConfig.checkResult.isCorrect}>
                  {enlargedGraphConfig.checkResult.isCorrect ? 'Correct construction' : 'Not yet'}
                </ResultPill>
                {!enlargedGraphConfig.checkResult.isCorrect && (
                  <p style={{ margin: '6px 0 0', color: '#b91c1c', fontSize: 13 }}>
                    {enlargedGraphConfig.errorHint}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}
