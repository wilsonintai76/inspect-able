import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MobileApp } from './apps/mobile/MobileApp';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ChakraProvider value={defaultSystem}>
        <MobileApp />
      </ChakraProvider>
    </React.StrictMode>
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Mobile ServiceWorker registered successfully:', reg.scope))
      .catch(err => console.error('Mobile ServiceWorker registration failed:', err));
  });
}
