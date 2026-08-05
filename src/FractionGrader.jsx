import { useState } from 'react';

export default function FractionGrader({ onGrade }) {
  const [numerator, setNumerator] = useState('');
  const [denominator, setDenominator] = useState('');
  const [hasGraded, setHasGraded] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const checkAnswer = () => {
    // The question is 1/2 + 1/3. The correct answer is 5/6.
    const num = parseInt(numerator);
    const den = parseInt(denominator);
    const correct = num === 5 && den === 6;
    
    setIsCorrect(correct);
    setHasGraded(true);
    onGrade(correct);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#202124' }}>Fraction Addition</h2>
      <p style={{ fontSize: '18px', color: '#5f6368' }}>Solve the equation below by finding a common denominator.</p>
      
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', margin: '40px 0', fontSize: '24px', fontWeight: 'bold', color: '#1a73e8' }}>
        <span>1/2</span>
        <span>+</span>
        <span>1/3</span>
        <span>=</span>
        
        <div style={{ display: 'flex', flexDirection: 'column', width: '70px' }}>
          <input 
            type="number" 
            value={numerator} 
            onChange={(e) => setNumerator(e.target.value)} 
            placeholder="Num"
            style={{ textAlign: 'center', fontSize: '18px', padding: '8px', border: '2px solid #dadce0', borderRadius: '4px', outline: 'none' }} 
          />
          <div style={{ height: '3px', background: '#202124', margin: '6px 0', borderRadius: '2px' }}></div>
          <input 
            type="number" 
            value={denominator} 
            onChange={(e) => setDenominator(e.target.value)} 
            placeholder="Den"
            style={{ textAlign: 'center', fontSize: '18px', padding: '8px', border: '2px solid #dadce0', borderRadius: '4px', outline: 'none' }} 
          />
        </div>
      </div>
      
      <button 
        onClick={checkAnswer}
        style={{ padding: '12px 24px', fontSize: '16px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s', boxShadow: '0 4px 6px rgba(26, 115, 232, 0.2)' }}
      >
        Submit Answer
      </button>
      
      {hasGraded && (
        <div style={{ marginTop: '25px', padding: '15px', borderRadius: '8px', backgroundColor: isCorrect ? '#e6f4ea' : '#fce8e6', color: isCorrect ? '#137333' : '#c5221f', fontSize: '16px', fontWeight: 'bold' }}>
          {isCorrect ? 'Correct! 5/6 is the right answer.' : 'Not quite! Hint: The common denominator for 2 and 3 is 6.'}
        </div>
      )}
    </div>
  );
}