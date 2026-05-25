import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import { KioskApp } from './apps/kiosk/KioskApp';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#4f46e5',
            borderRadius: 8,
            fontFamily: 'system-ui, -apple-system, sans-serif',
          },
        }}
      >
        <AntApp>
          <KioskApp />
        </AntApp>
      </ConfigProvider>
    </React.StrictMode>
  );
}
