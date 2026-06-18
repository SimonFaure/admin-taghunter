import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// Initialize i18next (chrome translations) before the app renders.
import './i18n';
import { registerCatalogFonts } from './fonts/registerCatalogFonts';

// Make the bundled curated fonts available to the Typography picker preview
// and the scenario preview renderer.
registerCatalogFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
