import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// No StrictMode: its double-run effects would send join/rejoin socket events twice in dev.
createRoot(document.getElementById('root')!).render(<App />);
