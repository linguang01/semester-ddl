import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import { initPwa } from './pwa';
import './index.css';

dayjs.locale('zh-cn');

// 注册 Service Worker 并接管主动更新检查（前台切换/网络恢复/每小时）
initPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
