import { Buffer } from 'buffer';

globalThis.Buffer = Buffer;
if (typeof window !== 'undefined') {
  (window as unknown as Window & { global?: Window }).global = window;
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
