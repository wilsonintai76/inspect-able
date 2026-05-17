import React from 'react';
import { createRoot } from 'react-dom/client';
import { KioskApp } from './apps/kiosk/KioskApp';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <KioskApp />
    </React.StrictMode>
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Kiosk ServiceWorker registered successfully:', reg.scope))
      .catch(err => console.error('Kiosk ServiceWorker registration failed:', err));
  });
}
