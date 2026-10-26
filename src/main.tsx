import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import { UpdatePrompt } from './components/UpdatePrompt';
import './index.css';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {/* PWA 更新提示：registerType='prompt' 时，必须在此挂载才能检测并提示新版本 */}
    <UpdatePrompt />
  </React.StrictMode>,
);
