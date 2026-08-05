import { useState, useEffect } from 'react';

export default function NumberLine({ onGrade }) {
  const [feedback, setFeedback] = useState('');
  
  const [pointValue, setPointValue] = useState(0); 
  const [isOpen, setIsOpen] = useState(false); 
  const [isGreaterThan, setIsGreaterThan] = useState(true); 

  const [problem, setProblem] = useState({ targetValue: 3, targetIsOpen: false, targetIsGreaterThan: false, text: 'x ≤ 3' });
  
  const [attempts, setAttempts] = useState(0);
  const [hasMastered, setHasMastered] = useState(false);

  const generateProblem = () => {
    const randomValue = Math.floor(Math.random() * 17) - 8;
    const randomIsOpen = Math.random() > 0.5;
    const randomIsGreaterThan = Math.random() > 0.5;

    let symbol = '';
    if (randomIsGreaterThan && !randomIsOpen) symbol = '≥';
    if (randomIsGreaterThan && randomIsOpen) symbol = '>';
    if (!randomIsGreaterThan && !randomIsOpen) symbol = '≤';
    if (!randomIsGreaterThan && randomIsOpen) symbol = '<';

    setProblem({
      targetValue: randomValue,
      targetIsOpen: randomIsOpen,
      targetIsGreaterThan: randomIsGreaterThan,
      text: `x ${symbol} ${randomValue}`
    });
    
    setAttempts(0);
    setFeedback('');
    setPointValue(0); // Reset dot to center
  };

  useEffect(() => {
    generateProblem();
  }, []);

  const visualPercentage = ((pointValue + 10) / 20) * 100;

  const checkAnswer = () => {
    if (pointValue === problem.targetValue && isOpen === problem.targetIsOpen && isGreaterThan === problem.targetIsGreaterThan) {
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
          setFeedback(`Incorrect. Check your point position, circle type, and shading. You have ${3 - newAttempts} attempt(s) left.`);
        }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '10px' }}>
        <h2>Question 3: Graph the inequality</h2>
        {hasMastered && <span style={{ background: '#28a745', color: 'white', padding: '5px 10px', borderRadius: '15px', fontSize: '14px', fontWeight: 'bold' }}>Mastered ✓</span>}
      </div>

      <p style={{ fontSize: '18px' }}>Graph the region for: <strong>{problem.text}</strong></p>
      
      <div style={{ display: 'flex', gap: '15px', marginBottom: '40px' }}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #333', background: '#f8f9fa' }}
        >
          Toggle: {isOpen ? 'Open Circle (○)' : 'Closed Circle (●)'}
        </button>
        <button 
          onClick={() => setIsGreaterThan(!isGreaterThan)}
          style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #333', background: '#f8f9fa' }}
        >
          Shade: {isGreaterThan ? 'Right (Greater)' : 'Left (Less)'}
        </button>
      </div>
      
      <div style={{ position: 'relative', width: '100%', height: '60px', marginBottom: '20px' }}>
        <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '4px', backgroundColor: '#333', transform: 'translateY(-50%)' }}></div>

        <div style={{ 
          position: 'absolute', top: '50%', height: '12px', backgroundColor: 'rgba(0, 123, 255, 0.4)', transform: 'translateY(-50%)',
          left: isGreaterThan ? `${visualPercentage}%` : '0%',
          right: isGreaterThan ? '0%' : `${100 - visualPercentage}%`
        }}></div>

        <input 
          type="range" min="-10" max="10" step="1" value={pointValue}
          onChange={(e) => setPointValue(Number(e.target.value))}
          style={{ position: 'absolute', top: '50%', left: '0', width: '100%', transform: 'translateY(-50%)', opacity: 0, cursor: 'pointer', zIndex: 10 }} 
        />

        <div style={{
          position: 'absolute', top: '50%', left: `${visualPercentage}%`, transform: 'translate(-50%, -50%)',
          width: '20px', height: '20px', borderRadius: '50%', border: '4px solid #007bff',
          backgroundColor: isOpen ? 'white' : '#007bff', pointerEvents: 'none', zIndex: 5
        }}></div>

        <div style={{ position: 'absolute', top: '100%', left: '0', transform: 'translateX(-50%)', fontWeight: 'bold' }}>-10</div>
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', fontWeight: 'bold' }}>0</div>
        <div style={{ position: 'absolute', top: '100%', left: '100%', transform: 'translateX(-50%)', fontWeight: 'bold' }}>10</div>
        
        <div style={{ position: 'absolute', top: '-30px', left: `${visualPercentage}%`, transform: 'translateX(-50%)', fontWeight: 'bold', color: '#007bff' }}>
          x = {pointValue}
        </div>
      </div>
      
      {/* The Explainer Box */}
      {attempts >= 3 && !hasMastered && (
        <div style={{ marginTop: '20px', padding: '15px', border: '2px solid #dc3545', borderRadius: '8px', backgroundColor: '#f8d7da', width: '100%', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#721c24' }}>How to solve this:</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#721c24' }}>
            <li><strong>Point Position:</strong> Move the dot to exactly <strong>{problem.targetValue}</strong>.</li>
            <li><strong>Circle Type:</strong> Because the symbol is <strong>{problem.text.split(' ')[1]}</strong>, the circle should be <strong>{problem.targetIsOpen ? 'Open' : 'Closed'}</strong>.</li>
            <li><strong>Shading:</strong> Because the symbol points to the <strong>{problem.targetIsGreaterThan ? 'right' : 'left'}</strong>, shade the line to the <strong>{problem.targetIsGreaterThan ? 'right' : 'left'}</strong>.</li>
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
        {(attempts < 3 || hasMastered) && (
          <button onClick={checkAnswer} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
            Submit Number Line
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