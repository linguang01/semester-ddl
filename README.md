# DDL 三件事

学期 DDL 与每日三件事的本地优先 PWA：把作业、考试、社团的事记下来，每天从中挑出最重要的三件。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端里显示的地址（默认 `http://localhost:5173`）。

## 构建与预览

```bash
npm run build
npm run preview
```

- `npm run build`：类型检查 + 构建，产物输出到 `dist/`（包含 `manifest.webmanifest`、`sw.js`、`registerSW.js` 和 PWA 图标）。
- `npm run preview`：本地预览构建产物，默认 `http://localhost:4173`。

## 部署到 Vercel（GitHub 方式）

### 第一步：把代码推到 GitHub（仅第一次需要）

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
gh repo create semester-ddl --public --source=. --push
```

（没有 `gh` 的话，在 github.com 新建空仓库，然后执行 `git remote add origin <仓库地址>` 和 `git push -u origin main`。）

### 第二步：在 Vercel 导入仓库

1. 用 GitHub 账号登录 [vercel.com](https://vercel.com)。
2. 点 **Add New… → Project**，在列表里选择刚推送的仓库，点 **Import**。
3. 部署配置：
   - **Framework Preset**：`Vite`
   - **Build Command**：`npm run build`
   - **Output Directory**：`dist`
   - 其余保持默认
4. 点 **Deploy**，等构建完成，Vercel 会给一个 `https://xxx.vercel.app` 地址。

> **手机上验收必须用这个 HTTPS 地址打开，不要用局域网 IP（192.168.x.x）。** PWA 安装和 Service Worker 只在 HTTPS（或 localhost）下生效。

## 手机使用：安装到主屏幕

**前提：必须通过 HTTPS 地址访问**（例如 Vercel 的 `https://xxx.vercel.app`）。用局域网 IP 的 HTTP 地址打开时，安装提示不会出现，这是浏览器安全限制，属预期行为。

安装完成后从主屏幕图标打开：应用会以独立窗口（standalone）运行，没有浏览器地址栏，支持离线打开。

- **Android / 桌面 Chrome**：打开页面 → 右上角设置 → 「安装到手机」，或直接在 Chrome 菜单里选「安装应用 / 添加到主屏幕」。
- **iPhone / iPad**：Safari 打开页面 → 点底部「分享」按钮 → 选择「添加到主屏幕」。

## 外观：深浅色自动切换

- 默认跟随本地时间自动切换：**6:00–17:59 浅色，18:00–次日 5:59 深色**。
- 页面开着跨过切换点时也会自动换主题，无需刷新。
- 在「设置 → 外观」里可以固定为浅色或深色；选「自动」恢复按时段切换。

## 数据存储

所有数据保存在浏览器本地的 **IndexedDB**（通过 [Dexie](https://dexie.org) 访问），不上传任何服务器，不需要账号。

## 数据迁移：导出 / 导入

入口：右上角设置 → 数据备份。

- **导出备份**：点击「导出备份」，会下载一个 JSON 文件（`ddl-backup-时间.json`）。
- **导入备份**：点击「导入备份」选择 JSON 文件，确认后合并写入。导入前会自动下载一份当前数据的备份，便于回退。
- **合并策略**：
  - 按任务 `id` 合并，相同 id 的任务以备份文件里的版本覆盖；
  - 今日选择按日期合并，同一天的选择以备份文件为准，且每天最多保留 3 条；
  - 现有数据不会被删除，重复内容不会产生副本；
  - 无法解析的记录会被跳过，并在导入结果中显示数量。

## 已知限制

- **数据不跨设备自动同步**。换设备或换浏览器请用「导出备份 / 导入备份」手动迁移。
- **清除浏览器站点数据会丢失本地数据**，无法找回，建议定期导出备份。
- **没有后台通知**。应用不会在关闭标签页后推送 DDL 提醒，请把应用放到主屏幕养成每天打开的习惯。
- **PWA 安装需要 HTTPS**。局域网 IP 的 HTTP 地址不支持安装与离线缓存，正式使用请部署到 HTTPS 地址。

## 技术栈

- **React 19 + TypeScript**：界面与类型
- **Vite 8**：构建与开发服务器
- **Tailwind CSS 4**：样式（含深浅色主题）
- **Dexie 4**：IndexedDB 数据层
- **vite-plugin-pwa / Workbox**：manifest、Service Worker 与离线缓存
- **dayjs**：日期处理