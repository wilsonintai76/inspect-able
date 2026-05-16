import React from 'react';
import { createRoot } from 'react-dom/client';
import { KioskApp } from './apps/kiosk/KioskApp';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <KioskApp onBack={() => { window.location.href = '/'; }} />
    </React.StrictMode>
  );
}
