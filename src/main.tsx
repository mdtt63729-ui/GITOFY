import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { watchSafeAreaInsets } from './utils/safeArea';
import { installGlobalErrorHandlers } from './utils/errorLog';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './index.css';

// Measure the device's display cutout (front camera) and system bars before the
// first paint, so no top bar can ever start underneath the camera. Re-measured
// on resize / rotation / foreground.
watchSafeAreaInsets();

// Catch uncaught errors and rejected promises, and keep one broken screen
// from taking the whole app down. The log stays on the device.
installGlobalErrorHandlers();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
