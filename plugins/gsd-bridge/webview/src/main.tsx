import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app-shell';
import './theme.css';

const container = document.getElementById('root');
if (!container) throw new Error('GSD webview: missing #root in index.html');
createRoot(container).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
