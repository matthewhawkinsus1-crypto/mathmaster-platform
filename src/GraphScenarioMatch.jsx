import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import useUndoHistory from './useUndoHistory';
import { stableStringify } from './scenarioResponseUtils';
import './GraphScenarioMatch.css';

const getPartGrade = (feedback, id) => feedback?.partGrades?.find((part) => part.id === id);

const isVisibleInside = (childRect, paneRect) => (
  childRect.bottom > paneRect.top + 8
  && childRect.top < paneRect.bottom - 8
  && childRect.right > paneRect.left
  && childRect.left < paneRect.right
);

export default function GraphScenarioMatch({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const scenarios = useMemo(
    () => (Array.isArray(question.scenarios) ? question.scenarios.filter((item) => item?.id) : []),
    [question.scenarios],
  );
  const graphs = useMemo(
    () => (Array.isArray(question.graphs) ? question.graphs.filter((item) => item?.id && item?.graph) : []),
    [question.graphs],
  );
  const correctMatches = question.correctMatches || Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.graphId]));
  const history = useUndoHistory({}, 80, draftKey ? `${draftKey}:graph-scenario-match` : null);
  const matches = history.value || {};

  const [selectedGraphId, setSelectedGraphId] = useState('');
  const [draggedGraphId, setDraggedGraphId] = useState('');
  const [zoomedGraphId, setZoomedGraphId] = useState('');
  const [connectors, setConnectors] = useState([]);
  const [connectorSize, setConnectorSize] = useState({ width: 1, height: 1 });

  const boardRef = useRef(null);
  const graphPaneRef = useRef(null);
  const scenarioPaneRef = useRef(null);
  const graphRefs = useRef(new Map());
  const scenarioRefs = useRef(new Map());

  const graphById = useMemo(() => new Map(graphs.map((graph) => [graph.id, graph])), [graphs]);
  const scenarioById = useMemo(() => new Map(scenarios.map((scenario) => [scenario.id, scenario])), [scenarios]);

  const assignGraph = useCallback((scenarioId, graphId) => {
    history.setValue((currentValue) => {
      const next = { ...(currentValue || {}) };

      // One graph can only belong to one scenario. Moving a graph automatically
      // releases its old scenario instead of making the student clean it up first.
      Object.keys(next).forEach((key) => {
        if (graphId && key !== scenarioId && next[key] === graphId) delete next[key];
      });

      if (graphId) next[scenarioId] = graphId;
      else delete next[scenarioId];
      return next;
    });
    setSelectedGraphId('');
  }, [history]);

  const parts = scenarios.map((scenario) => ({
    id: `match:${scenario.id}`,
    label: scenario.title || scenario.id,
    isComplete: Boolean(matches[scenario.id]),
    isCorrect: matches[scenario.id] === correctMatches[scenario.id],
    response: matches[scenario.id] || '',
  }));
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);
  const matchedCount = parts.filter((part) => part.isComplete).length;

  useEffect(() => {
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: stableStringify(matches),
      questionDetails: `${question.prompt || 'Match each scenario to a graph.'} Matches: ${JSON.stringify(matches)}`,
      parts,
    });
  }, [isComplete, isCorrect, matches, onStateChange, question.prompt]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last graph match' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  useEffect(() => {
    if (!zoomedGraphId) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setZoomedGraphId('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedGraphId]);

  const updateConnectors = useCallback(() => {
    const board = boardRef.current;
    const graphPane = graphPaneRef.current;
    const scenarioPane = scenarioPaneRef.current;
    if (!board || !graphPane || !scenarioPane) {
      setConnectors([]);
      return;
    }

    const boardRect = board.getBoundingClientRect();
    const graphPaneRect = graphPane.getBoundingClientRect();
    const scenarioPaneRect = scenarioPane.getBoundingClientRect();
    setConnectorSize({ width: Math.max(1, boardRect.width), height: Math.max(1, boardRect.height) });
    const next = [];

    Object.entries(matches).forEach(([scenarioId, graphId]) => {
      const graphNode = graphRefs.current.get(graphId);
      const scenarioNode = scenarioRefs.current.get(scenarioId);
      if (!graphNode || !scenarioNode) return;

      const graphRect = graphNode.getBoundingClientRect();
      const scenarioRect = scenarioNode.getBoundingClientRect();

      // Desktop banks scroll independently. Keep the permanent match labels on
      // every card, but only draw the connector when both endpoints are visible.
      if (!isVisibleInside(graphRect, graphPaneRect) || !isVisibleInside(scenarioRect, scenarioPaneRect)) return;

      const startX = graphPaneRect.right - boardRect.left - 2;
      const endX = scenarioPaneRect.left - boardRect.left + 2;
      const startY = graphRect.top + graphRect.height / 2 - boardRect.top;
      const endY = scenarioRect.top + scenarioRect.height / 2 - boardRect.top;
      const middleX = (startX + endX) / 2;

      next.push({
        id: `${graphId}:${scenarioId}`,
        path: `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`,
        startX,
        startY,
        endX,
        endY,
      });
    });

    setConnectors(next);
  }, [matches]);

  useLayoutEffect(() => {
    updateConnectors();
    const frame = requestAnimationFrame(updateConnectors);
    return () => cancelAnimationFrame(frame);
  }, [selectedGraphId, updateConnectors]);

  useEffect(() => {
    const graphPane = graphPaneRef.current;
    const scenarioPane = scenarioPaneRef.current;
    const handleLayout = () => updateConnectors();

    graphPane?.addEventListener('scroll', handleLayout, { passive: true });
    scenarioPane?.addEventListener('scroll', handleLayout, { passive: true });
    window.addEventListener('resize', handleLayout);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleLayout) : null;
    if (observer && boardRef.current) observer.observe(boardRef.current);

    return () => {
      graphPane?.removeEventListener('scroll', handleLayout);
      scenarioPane?.removeEventListener('scroll', handleLayout);
      window.removeEventListener('resize', handleLayout);
      observer?.disconnect();
    };
  }, [updateConnectors]);

  const scrollMatchPane = useCallback((pane, amount) => {
    if (!pane) return;
    pane.scrollTo({
      top: Math.max(0, Math.min(pane.scrollHeight - pane.clientHeight, pane.scrollTop + amount)),
      behavior: 'smooth',
    });
  }, []);

  const handlePaneWheel = useCallback((event) => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    const pane = event.currentTarget;
    const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
    if (maxScrollTop <= 0) return;

    const multiplier = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? pane.clientHeight
        : 1;
    const delta = event.deltaY * multiplier;
    const nextTop = Math.max(0, Math.min(maxScrollTop, pane.scrollTop + delta));

    // Chromium occasionally hands wheel/trackpad movement to the outer assignment
    // page when the pointer is over a nested interactive element. Own the wheel
    // while this pane can actually move, then let the page take over at the ends.
    if (Math.abs(nextTop - pane.scrollTop) > 0.5) {
      event.preventDefault();
      pane.scrollTop = nextTop;
    }
  }, []);

  const handlePaneKeyDown = useCallback((event) => {
    const pane = event.currentTarget;
    const step = Math.max(90, Math.round(pane.clientHeight * 0.35));
    const page = Math.max(160, Math.round(pane.clientHeight * 0.82));

    if (event.key === 'ArrowDown') { event.preventDefault(); scrollMatchPane(pane, step); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); scrollMatchPane(pane, -step); }
    else if (event.key === 'PageDown') { event.preventDefault(); scrollMatchPane(pane, page); }
    else if (event.key === 'PageUp') { event.preventDefault(); scrollMatchPane(pane, -page); }
    else if (event.key === 'Home') { event.preventDefault(); pane.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (event.key === 'End') { event.preventDefault(); pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' }); }
  }, [scrollMatchPane]);

  const selectGraph = (graphId) => {
    setSelectedGraphId((current) => (current === graphId ? '' : graphId));
  };

  const selectScenario = (scenarioId) => {
    if (selectedGraphId) {
      assignGraph(scenarioId, selectedGraphId);
      return;
    }

    // Clicking an already-matched scenario selects its graph so the student can
    // immediately move that graph to a different scenario if desired.
    const existingGraphId = matches[scenarioId];
    if (existingGraphId) setSelectedGraphId(existingGraphId);
  };

  const selectedGraph = graphById.get(selectedGraphId);
  const zoomedGraph = graphById.get(zoomedGraphId);

  return (
    <div className="graph-scenario-match-tool">
      <div className="graph-scenario-match-heading-row">
        <div>
          <h2>Visual Match Board</h2>
          <p className="graph-scenario-match-subtitle">Keep the graphs and stories side by side while you compare them.</p>
        </div>
        <div className="graph-scenario-match-progress" aria-live="polite">
          <strong>{matchedCount} of {scenarios.length}</strong>
          <span>matched</span>
        </div>
      </div>

      <QuestionPrompt>{question.prompt || 'Match each scenario to the graph that tells its story.'}</QuestionPrompt>

      <div className="graph-scenario-match-instructions" aria-live="polite">
        <div>
          <strong>{selectedGraph ? `${selectedGraph.label || selectedGraph.id} selected` : '1. Select a graph'}</strong>
          <span>{selectedGraph ? '2. Now select the scenario that tells its story.' : 'Click a graph, or drag it directly onto a scenario.'}</span>
        </div>
        <div className="graph-scenario-match-actions">
          {selectedGraph && (
            <button type="button" onClick={() => setSelectedGraphId('')}>Cancel selection</button>
          )}
          {matchedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                history.setValue({});
                setSelectedGraphId('');
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="graph-scenario-match-board" ref={boardRef}>
        <svg
          className="graph-scenario-connector-layer"
          aria-hidden="true"
          viewBox={`0 0 ${connectorSize.width} ${connectorSize.height}`}
          preserveAspectRatio="none"
        >
          {connectors.map((connector) => (
            <g key={connector.id}>
              <path d={connector.path} className="graph-scenario-connector-path" />
              <circle cx={connector.startX} cy={connector.startY} r="5" className="graph-scenario-connector-dot" />
              <circle cx={connector.endX} cy={connector.endY} r="5" className="graph-scenario-connector-dot" />
            </g>
          ))}
        </svg>

        <section className="graph-scenario-bank graph-scenario-graph-bank" aria-label="Graph bank">
          <div className="graph-scenario-bank-header">
            <div>
              <span>Graph bank</span>
              <strong>Compare the graphs</strong>
            </div>
            <small>Scroll this side independently</small>
          </div>

          <div
            className="graph-scenario-scroll-pane"
            ref={graphPaneRef}
            tabIndex={0}
            role="region"
            aria-label="Scrollable graph bank"
            onWheel={handlePaneWheel}
            onKeyDown={handlePaneKeyDown}
          >
            {graphs.map((graphChoice) => {
              const matchedScenarioId = Object.entries(matches).find(([, graphId]) => graphId === graphChoice.id)?.[0] || '';
              const matchedScenario = scenarioById.get(matchedScenarioId);
              const grade = matchedScenarioId ? getPartGrade(feedback, `match:${matchedScenarioId}`) : null;
              const selected = selectedGraphId === graphChoice.id;
              const stateClass = grade
                ? grade.isCorrect ? 'is-correct' : 'is-incorrect'
                : matchedScenarioId ? 'is-matched' : selected ? 'is-selected' : '';

              return (
                <article
                  key={graphChoice.id}
                  ref={(node) => {
                    if (node) graphRefs.current.set(graphChoice.id, node);
                    else graphRefs.current.delete(graphChoice.id);
                  }}
                  className={`graph-scenario-graph-card ${stateClass}`}
                  draggable
                  onDragStart={() => {
                    setDraggedGraphId(graphChoice.id);
                    setSelectedGraphId(graphChoice.id);
                  }}
                  onDragEnd={() => setDraggedGraphId('')}
                >
                  <div className="graph-scenario-card-topline">
                    <div>
                      <strong>{graphChoice.label || graphChoice.id}</strong>
                      <span>
                        {grade
                          ? grade.isCorrect ? 'Correct match' : 'Reconsider this match'
                          : matchedScenario
                            ? `Matched to ${matchedScenario.title || matchedScenario.id}`
                            : selected ? 'Selected — choose a scenario' : 'Available'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="graph-scenario-zoom-button"
                      onClick={() => setZoomedGraphId(graphChoice.id)}
                      aria-label={`Enlarge ${graphChoice.label || graphChoice.id}`}
                    >
                      ⤢ Zoom
                    </button>
                  </div>

                  <button
                    type="button"
                    className="graph-scenario-graph-select"
                    aria-pressed={selected}
                    onClick={() => selectGraph(graphChoice.id)}
                  >
                    <div className="graph-scenario-graph-preview">
                      <GraphDisplay graph={graphChoice.graph} title={graphChoice.label || 'Graph choice'} />
                    </div>
                    <span className="graph-scenario-select-callout">
                      {selected ? 'Selected' : matchedScenario ? 'Select to change this match' : 'Select this graph'}
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <div className="graph-scenario-board-gutter" aria-hidden="true" />

        <section className="graph-scenario-bank graph-scenario-story-bank" aria-label="Scenario bank">
          <div className="graph-scenario-bank-header">
            <div>
              <span>Scenario bank</span>
              <strong>Find the matching story</strong>
            </div>
            <small>{selectedGraph ? `Connect ${selectedGraph.label || selectedGraph.id}` : 'Scroll this side independently'}</small>
          </div>

          <div
            className="graph-scenario-scroll-pane"
            ref={scenarioPaneRef}
            tabIndex={0}
            role="region"
            aria-label="Scrollable scenario bank"
            onWheel={handlePaneWheel}
            onKeyDown={handlePaneKeyDown}
          >
            {scenarios.map((scenario, index) => {
              const grade = getPartGrade(feedback, `match:${scenario.id}`);
              const matchedGraph = graphById.get(matches[scenario.id]);
              const stateClass = grade
                ? grade.isCorrect ? 'is-correct' : 'is-incorrect'
                : matchedGraph ? 'is-matched' : selectedGraph ? 'is-ready' : '';

              return (
                <article
                  key={scenario.id}
                  ref={(node) => {
                    if (node) scenarioRefs.current.set(scenario.id, node);
                    else scenarioRefs.current.delete(scenario.id);
                  }}
                  className={`graph-scenario-story-card ${stateClass}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedGraphId) assignGraph(scenario.id, draggedGraphId);
                    setDraggedGraphId('');
                  }}
                >
                  <button
                    type="button"
                    className="graph-scenario-story-select"
                    onClick={() => selectScenario(scenario.id)}
                  >
                    <div className="graph-scenario-story-copy">
                      <span className="graph-scenario-story-number">Scenario {index + 1}</span>
                      <h3>{scenario.title || `Scenario ${index + 1}`}</h3>
                      <p>{scenario.description}</p>
                      {scenario.quantities && <p className="graph-scenario-quantities">{scenario.quantities}</p>}
                    </div>
                    <div className="graph-scenario-story-match">
                      <span>Matching graph</span>
                      <strong>
                        {matchedGraph
                          ? matchedGraph.label || matchedGraph.id
                          : selectedGraph ? `Connect ${selectedGraph.label || selectedGraph.id}` : 'Not matched yet'}
                      </strong>
                    </div>
                  </button>

                  {matchedGraph && (
                    <button type="button" className="graph-scenario-unmatch-button" onClick={() => assignGraph(scenario.id, '')}>
                      Disconnect
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="graph-scenario-mobile-match-summary" aria-label="Current matches">
        {scenarios.map((scenario) => {
          const matchedGraph = graphById.get(matches[scenario.id]);
          if (!matchedGraph) return null;
          return (
            <button key={scenario.id} type="button" onClick={() => setSelectedGraphId(matchedGraph.id)}>
              <strong>{matchedGraph.label || matchedGraph.id}</strong><span>↔</span><span>{scenario.title || scenario.id}</span>
            </button>
          );
        })}
      </div>

      <p className="graph-scenario-submit-note">
        Match every scenario, then use <strong>Submit Answer</strong> below to check the complete set.
      </p>

      {zoomedGraph && (
        <div
          className="graph-scenario-zoom-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setZoomedGraphId('');
          }}
        >
          <section className="graph-scenario-zoom-dialog" role="dialog" aria-modal="true" aria-label={`Enlarged ${zoomedGraph.label || zoomedGraph.id}`}>
            <div className="graph-scenario-zoom-header">
              <div><span>Graph detail</span><h3>{zoomedGraph.label || zoomedGraph.id}</h3></div>
              <button type="button" onClick={() => setZoomedGraphId('')}>✕ Close</button>
            </div>
            <div className="graph-scenario-zoom-graph">
              <GraphDisplay graph={zoomedGraph.graph} title={zoomedGraph.label || 'Graph choice'} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
