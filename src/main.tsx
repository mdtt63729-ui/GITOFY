import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/elevated-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/switch/switch.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/chips/chip-set.js';
import '@material/web/chips/filter-chip.js';
import '@material/web/chips/assist-chip.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/divider/divider.js';
import '@material/web/textfield/outlined-text-field.js';
import {styles as materialTypeScaleStyles} from '@material/web/typography/md-typescale-styles.js';



document.adoptedStyleSheets.push(materialTypeScaleStyles.styleSheet);

createRoot(document.getElementById('root')!).render(<App />);
