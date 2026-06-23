import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminMobileApp } from './apps/admin-mobile/AdminMobileApp';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AdminMobileApp />
    </React.StrictMode>
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Admin Mobile ServiceWorker registered:', reg.scope))
      .catch(err => console.error('Admin Mobile ServiceWorker failed:', err));
  });
}
