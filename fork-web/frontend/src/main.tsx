import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { MatchScreen } from './components/MatchScreen';
import { MatchProvider } from './state/MatchContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MatchProvider>
      <MatchScreen />
    </MatchProvider>
  </StrictMode>,
);
