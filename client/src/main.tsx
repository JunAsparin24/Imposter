import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameProvider } from './state/GameProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <GameProvider>
      <App />
    </GameProvider>
    </ErrorBoundary>
  </StrictMode>,
);
