import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';

import '@mantine/core/styles.css';
import './index.css';

import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se ha encontrado el elemento #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider
      defaultColorScheme="dark"
      theme={{
        primaryColor: 'indigo',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <App />
    </MantineProvider>
  </StrictMode>,
);