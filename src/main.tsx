import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { watchSafeAreaInsets } from './utils/safeArea';
import './index.css';

// Measure the device's display cutout (front camera) and system bars before the
// first paint, so no top bar can ever start underneath the camera. Re-measured
// on resize / rotation / foreground.
watchSafeAreaInsets();

createRoot(document.getElementById('root')!).render(<App />);
