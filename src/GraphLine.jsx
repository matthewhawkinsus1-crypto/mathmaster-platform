import { useEffect, useRef, useState } from 'react';
import JXG from 'jsxgraph';

export default function GraphLine({ onGrade }) {
  const containerRef = useRef(null);
  const boardRef = useRef(null);
  const [feedback, setFeedback] = useState('');
  
  const [problem, setProblem] = useState({ m: 2, b: -1, text: 'y = 2x - 1' });
  
  // Mastery Logic State
  const [attempts, setAttempts] = useState(0);
  const [hasMastered, setHasMastered] = useState(false);

  // Reusable function to generate a new problem
  const generateProblem = () => {
    let randomM = Math.floor(Math.random() * 7) - 3;
    if (randomM === 0) randomM = 1; 
    const randomB = Math.floor(Math.random() * 11) - 5;

    let mString = randomM === 1 ? 'x' : (randomM === -1 ? '-x' : `${randomM}x`);
    let bString = randomB === 0 ? '' : (randomB > 0 ? ` + ${randomB}` : ` - ${Math.abs(randomB)}`);
    
    setProblem({ m: randomM, b: randomB, text: `y = ${mString}${bString}` });
    
    // Reset state for the new problem
    setAttempts(0);
    setFeedback('');
  };

  // Generate initial problem ONLY when the component first mounts
  useEffect(() => {
    generateProblem();
  }, []);

  // Initialize the Graph
  useEffect(() => {
    if (!containerRef.current || boardRef.current) return;
    containerRef.current.innerHTML = '';

    const board = JXG.JSXGraph.initBoard(containerRef.current, {
      boundingbox: [-10, 10, 10, -10],
      axis: true,
      showCopyright: false
    });

    const p1 = board.create('point', [-3, 3], { name: 'A', snapToGrid: true, color: 'blue', size: 4 });
    const p2 = board.create('point', [4, 2], { name: 'B', snapToGrid: true, color: 'blue', size: 4 });
    board.create('line', [p1, p2], { strokeColor: 'black', strokeWidth: 2 });

    boardRef.current = { p1, p2, board };

    return () => {
      if (boardRef.current && boardRef.current.board) {
        JXG.JSXGraph.freeBoard(boardRef.current.board);
        boardRef.current = null;
      }
    };
  }, []);

  const checkAnswer = () => {
    if (!boardRef.current) return;
    const { p1, p2 } = boardRef.current;
    const m = (p2.Y() - p1.Y()) / (p2.X() - p1.X());
    const b = p1.Y() - (m * p1.X());

    if (Math.abs(m - problem.m) < 0.1 && Math.abs(b - problem.b) < 0.1) {
      setFeedback('Correct! You have mastered this concept.');
      if (!hasMastered) {
        setHasMastered(true);
        if (onGrade) onGrade(true);
      }
    } else {
      if (hasMastered) {
        setFeedback('Incorrect practice attempt. (No points lost!) Try again.');
      } else {
        const newAttempts = attempts + 1;
        if (newAttempts >= 3) {
          setFeedback('Out of attempts! Please read the explanation below before generating a new problem.');
          setAttempts(newAttempts);
          if (onGrade) onGrade(false);
        } else {
          setAttempts(newAttempts);
          setFeedback(`Incorrect. Try checking your slope and y-intercept. You have ${3 - newAttempts} attempt(s) left.`);
        }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '30px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '500px', alignItems: 'center', marginBottom: '10px' }}>
        <h2>Question 1: Graph the line</h2>
        {hasMastered && <span style={{ background: '#28a745', color: 'white', padding: '5px 10px', borderRadius: '15px', fontSize: '14px', fontWeight: 'bold' }}>Mastered ✓</span>}
      </div>
      
      <p style={{ fontSize: '18px' }}>Create the correct line for: <strong>{problem.text}</strong></p>
      
      {/* The Graph */}
      <div ref={containerRef} style={{ width: '500px', height: '500px', border: '2px solid #333', borderRadius: '8px', backgroundColor: 'white' }}></div>
      
      {/* The Explainer Box - Only shows if they fail 3 times */}
      {attempts >= 3 && !hasMastered && (
        <div style={{ marginTop: '20px', padding: '15px', border: '2px solid #dc3545', borderRadius: '8px', backgroundColor: '#f8d7da', maxWidth: '500px', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#721c24' }}>How to solve this:</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#721c24' }}>
            <li><strong>Step 1:</strong> Find the y-intercept. For <strong>{problem.text}</strong>, the line crosses the vertical y-axis at <strong>{problem.b}</strong>. Put your first point there.</li>
            <li><strong>Step 2:</strong> Find the slope (rise over run). The slope is <strong>{problem.m}</strong>.</li>
            <li><strong>Step 3:</strong> Start at your first point, count up <strong>{problem.m}</strong> space(s) and to the right 1 space, and place your second point there!</li>
          </ul>
        </div>
      )}

      {/* Dynamic Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        {(attempts < 3 || hasMastered) && (
          <button onClick={checkAnswer} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
            Submit Graph
          </button>
        )}
        {attempts >= 3 && !hasMastered && (
          <button onClick={generateProblem} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>
            Generate New Problem
          </button>
        )}
        {hasMastered && (
          <button onClick={generateProblem} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px' }}>
            Practice Another
          </button>
        )}
      </div>
      
      <div style={{ marginTop: '15px', fontWeight: 'bold', fontSize: '18px', color: feedback.includes('Correct') ? 'green' : 'red' }}>
        {feedback}
      </div>
    </div>
  );
}