import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureFx } from './data/fx';
import { startSync } from './data/sync';
import { hideSplash } from './splash';
import './styles/tokens.css';
import './styles/app.css';
import './theme';

createRoot(document.getElementById('root')!).render(<App />);

startSync();
setTimeout(hideSplash, 8000); // sécurité : l'écran de lancement ne reste jamais bloqué
setTimeout(() => void ensureFx(), 1500);

// Application hors ligne (service worker) – uniquement en production (https)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
  }
}
