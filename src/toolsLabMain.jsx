import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MathToolsLab from './dev/MathToolsLab';
import './index.css';

createRoot(document.getElementById('root')).render(<StrictMode><MathToolsLab /></StrictMode>);
