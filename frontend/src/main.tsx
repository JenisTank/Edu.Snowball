import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@snowball/ui/styles.css';
import './index.css';
import { applyTheme, loadTheme } from '@snowball/ui/theme';
import { ErrorBoundary } from '@snowball/ui/components';
import { BUMBLEB_THEME } from './lib/appTheme';
const saved = localStorage.getItem('theme-v1') || localStorage.getItem('firm-theme-v1');
applyTheme(saved ? loadTheme() : BUMBLEB_THEME);

// PWA: register the service worker (makes the parent portal installable on phones)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
);
