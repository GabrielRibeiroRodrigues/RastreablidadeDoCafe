import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';
import { installGlobalErrorReporting } from './lib/error-reporting';

installGlobalErrorReporting();

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
