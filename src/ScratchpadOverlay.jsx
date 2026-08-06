import { useEffect, useMemo, useRef, useState } from 'react';
import QuestionPrompt from './QuestionPrompt';
import useUndoHistory from './useUndoHistory';

const COLORS = [
  { id: 'black', label: 'Black', value: '#202124' },
  { id: 'blue', label: 'Blue', value: '#1a73e8' },
  { id: 'red', label: 'Red', value: '#d93025' },
];

const MAX_EXPORT_WIDTH = 1200;
const MAX_EXPORT_HEIGHT = 900;
const MAX_DATA_URL_LENGTH = 700_000;

const drawStroke = (context, stroke, scaleX = 1, scaleY = 1) => {
  if (!stroke?.points?.length) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color || '#202124';
  context.lineWidth = (stroke.tool === 'eraser' ? 26 : 3.2) * ((scaleX + scaleY) / 2);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point[0] * scaleX;
    const y = point[1] * scaleY;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (stroke.points.length === 1) {
    const [x, y] = stroke.points[0];
    context.lineTo(x * scaleX + 0.01, y * scaleY + 0.01);
  }
  context.stroke();
  context.restore();
};

const eventPoint = (event, canvas) => {
  const rectangle = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return [
    ((clientX - rectangle.left) / rectangle.width) * canvas.width,
    ((clientY - rectangle.top) / rectangle.height) * canvas.height,
  ];
};

const buildCompressedDataUrl = (sourceCanvas) => {
  const scale = Math.min(
    1,
    MAX_EXPORT_WIDTH / sourceCanvas.width,
    MAX_EXPORT_HEIGHT / sourceCanvas.height,
  );
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const context = exportCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

  for (const quality of [0.78, 0.66, 0.54, 0.42]) {
    const value = exportCanvas.toDataURL('image/webp', quality);
    if (value.length <= MAX_DATA_URL_LENGTH) return value;
  }
  return exportCanvas.toDataURL('image/jpeg', 0.42);
};

export default function ScratchpadOverlay({
  open,
  questionDetails,
  initialDataUrl = '',
  onSave,
  onClose,
  readOnly = false,
}) {
  const canvasRef = useRef(null);
  const backgroundRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const clearBackupRef = useRef(null);
  const [clearBackupAvailable, setClearBackupAvailable] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#202124');
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const strokeHistory = useUndoHistory([]);
  const strokes = strokeHistory.value;

  const compactQuestion = useMemo(
    () => String(questionDetails || 'Use this space to show your work.').slice(0, 700),
    [questionDetails],
  );

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (backgroundRef.current) {
      context.drawImage(backgroundRef.current, 0, 0, canvas.width, canvas.height);
    }
    strokes.forEach((stroke) => drawStroke(context, stroke));
    context.restore();
  };

  useEffect(() => {
    if (!open) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resize = () => {
      const rectangle = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(720, Math.round(rectangle.width * ratio));
      const height = Math.max(520, Math.round(rectangle.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        redraw();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    strokeHistory.reset([]);
    backgroundRef.current = null;
    clearBackupRef.current = null;
    setClearBackupAvailable(false);
    setMessage('');
    if (!initialDataUrl) {
      window.requestAnimationFrame(redraw);
      return;
    }
    const image = new Image();
    image.onload = () => {
      backgroundRef.current = image;
      redraw();
    };
    image.onerror = () => {
      setMessage('The saved scratchpad could not be loaded. A new blank page is ready.');
      redraw();
    };
    image.src = initialDataUrl;
  }, [open, initialDataUrl]);

  useEffect(() => {
    if (open) redraw();
  }, [strokes, open]);

  const startStroke = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || saving || readOnly) return;
    const point = eventPoint(event, canvas);
    if (!point) return;
    clearBackupRef.current = null;
    setClearBackupAvailable(false);
    activeStrokeRef.current = {
      tool,
      color,
      points: [point],
    };
    setDrawing(true);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const extendStroke = (event) => {
    const canvas = canvasRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !drawing || !stroke) return;
    const point = eventPoint(event, canvas);
    if (!point) return;
    const previous = stroke.points[stroke.points.length - 1];
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 2) return;
    stroke.points.push(point);
    redraw();
    drawStroke(canvas.getContext('2d'), stroke);
  };

  const finishStroke = (event) => {
    const canvas = canvasRef.current;
    if (!drawing || !activeStrokeRef.current) return;
    setDrawing(false);
    canvas?.releasePointerCapture?.(event.pointerId);
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    strokeHistory.setValue((current) => [...current, finished]);
  };

  const clearAll = () => {
    clearBackupRef.current = {
      strokes: [...strokes],
      background: backgroundRef.current,
    };
    setClearBackupAvailable(true);
    strokeHistory.reset([]);
    backgroundRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
    setMessage('Scratchpad cleared. Undo will restore the cleared page.');
  };

  const undoScratchpad = () => {
    if (strokeHistory.canUndo) {
      strokeHistory.undo();
      setMessage('Last stroke removed.');
      return;
    }
    if (clearBackupRef.current) {
      backgroundRef.current = clearBackupRef.current.background;
      strokeHistory.reset(clearBackupRef.current.strokes);
      clearBackupRef.current = null;
      setClearBackupAvailable(false);
      window.requestAnimationFrame(redraw);
      setMessage('Cleared work restored.');
    }
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving || readOnly) return;
    setSaving(true);
    setMessage('');
    try {
      const dataUrl = buildCompressedDataUrl(canvas);
      if (dataUrl.length > MAX_DATA_URL_LENGTH * 1.25) {
        throw new Error('The scratchpad is still too large. Clear unnecessary marks and save again.');
      }
      await onSave?.(dataUrl, {
        width: canvas.width,
        height: canvas.height,
        byteEstimate: Math.round((dataUrl.length * 3) / 4),
      });
      setMessage('Student work saved.');
      onClose?.();
    } catch (error) {
      setMessage(error?.message || 'The scratchpad could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen scratchpad"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30000,
        background: '#f4f6f8',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        animation: 'scratchpadSlideUp 220ms ease-out',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 18px',
          background: '#fff',
          borderBottom: '1px solid #dfe3e7',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div>
          <strong style={{ fontSize: '18px', color: '#202124' }}>Student Scratchpad</strong>
          <div style={{ fontSize: '12px', color: '#5f6368', marginTop: '2px' }}>
            {readOnly ? 'This saved scratchpad is read-only because the question is locked.' : 'Draw with a mouse, stylus, or finger. Work is compressed before saving.'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          style={{ border: '1px solid #c5d5ef', borderRadius: '8px', padding: '9px 14px', background: '#fff', fontWeight: 'bold' }}
        >
          Close
        </button>
      </header>

      <main style={{ position: 'relative', minHeight: 0, padding: '14px' }}>
        <div
          style={{
            position: 'absolute',
            top: '26px',
            left: '26px',
            zIndex: 3,
            maxWidth: 'min(520px, calc(100% - 52px))',
            padding: '10px 13px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.86)',
            border: '1px solid rgba(26,115,232,0.28)',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none',
            color: '#3c4043',
            fontSize: '13px',
          }}
        >
          <strong style={{ color: '#174ea6' }}>Current question</strong>
          <QuestionPrompt style={{ margin: '4px 0 0', fontSize: '13px', lineHeight: 1.45, color: '#3c4043', textAlign: 'left' }}>
            {compactQuestion}
          </QuestionPrompt>
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={(event) => drawing && finishStroke(event)}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            minHeight: '520px',
            borderRadius: '14px',
            background: '#fff',
            boxShadow: '0 10px 30px rgba(60,64,67,0.16)',
            touchAction: readOnly ? 'auto' : 'none',
            cursor: readOnly ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
          }}
        />
      </main>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #dfe3e7',
        }}
      >
        {readOnly ? (
          <strong style={{ color: '#5f6368' }}>Read-only saved student work</strong>
        ) : <>
        <button type="button" onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} style={{ padding: '9px 13px', borderRadius: '8px', border: tool === 'pen' ? '2px solid #1a73e8' : '1px solid #c5d5ef', background: tool === 'pen' ? '#e8f0fe' : '#fff', fontWeight: 'bold' }}>✎ Pen</button>
        {COLORS.map((item) => (
          <button
            type="button"
            key={item.id}
            title={`${item.label} ink`}
            aria-label={`${item.label} ink`}
            onClick={() => { setColor(item.value); setTool('pen'); }}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              border: color === item.value && tool === 'pen' ? '4px solid #f9ab00' : '3px solid #fff',
              outline: `1px solid ${item.value}`,
              background: item.value,
            }}
          />
        ))}
        <button type="button" onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} style={{ padding: '9px 13px', borderRadius: '8px', border: tool === 'eraser' ? '2px solid #1a73e8' : '1px solid #c5d5ef', background: tool === 'eraser' ? '#e8f0fe' : '#fff', fontWeight: 'bold' }}>▱ Eraser</button>
        <button type="button" onClick={undoScratchpad} disabled={!strokeHistory.canUndo && !clearBackupAvailable} style={{ padding: '9px 13px', borderRadius: '8px', border: '1px solid #c5d5ef', background: '#fff', fontWeight: 'bold', opacity: strokeHistory.canUndo || clearBackupAvailable ? 1 : 0.45 }}>↶ Undo</button>
        <button type="button" onClick={clearAll} style={{ padding: '9px 13px', borderRadius: '8px', border: '1px solid #e0b4b0', background: '#fff', color: '#a50e0e', fontWeight: 'bold' }}>Clear All</button>
        <button type="button" onClick={save} disabled={saving} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: saving ? '#dadce0' : '#188038', color: '#fff', fontWeight: 'bold' }}>{saving ? 'Saving…' : 'Save & Close'}</button>
        </>}
        {message && <span role="status" style={{ width: '100%', textAlign: 'center', color: message.includes('could not') || message.includes('too large') ? '#c5221f' : '#137333', fontWeight: 'bold', fontSize: '13px' }}>{message}</span>}
      </footer>
    </div>
  );
}
