# DDL 三件事

学期 DDL 与每日三件事的本地优先 PWA：把作业、考试、社团的事记下来，每天从中挑出最重要的三件。默认完全离线可用，可选登录 Supabase 做任务多端同步。

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

- `npm run build`：类型检查 + 构建，产物输出到 `dist/`（包含 `manifest.webmanifest`、`sw.js` 和 PWA 图标；SW 注册与更新检查逻辑打包进主 JS，由 `src/pwa.ts` 接管）。
- `npm run typecheck`：只做 TypeScript 类型检查。
- `npm run preview`：本地预览构建产物，默认 `http://localhost:4173`。

构建会把 React、Supabase、Dexie/dayjs、ECharts 拆成独立 vendor 块；统计页仍按需加载，首屏不下载图表库。

## 代码检查与格式化

```bash
npm run lint          # oxlint：0 warning / 0 error 才算过
npm run lint:fix      # 自动修可修项
npm run format        # Prettier 全量格式化（含 Tailwind class 排序）
npm run format:check  # CI 用，只检查不写入
```

**为什么用 oxlint 而不是 ESLint**：本项目用 TypeScript 7，而 `typescript-eslint` 8.x 在启动时会直接抛错（`does not support TS 7.0`，见其 issue #10940），装上就等于装了个跑不起来的脚本，还会因为 peer 依赖冲突让 `npm install` 失败。oxlint 自带解析器、不依赖 TS 的 JS API，规则集覆盖了本项目真正在意的几条：`no-floating-promises`（漏 `catch` 的异步调用）、`rules-of-hooks`、`exhaustive-deps`、`only-export-components`、`no-unused-vars`。等 typescript-eslint 支持 TS ≥ 7.1 后，再决定是否切回。

**Prettier 约定**：`printWidth: 100`、单引号、尾逗号、LF；`prettier-plugin-tailwindcss` 负责 class 顺序。`.prettierignore` 排除了 `README.md`（表格与换行由人控制）、锁文件、构建产物和演示单页。**首次全量格式化必须单独一个 commit**，否则 `git blame` 会被格式噪声淹没。

## 部署：用一个固定、国内可访问的 HTTPS 地址

**先记住三条铁律（都是踩过的坑）：**

1. **装到主屏幕的应用绑定域名**。用带鉴权参数的 24 小时预览链接（EdgeOne 的 `*.edgeone.dev/?eo_time=…`）安装，链接过期后应用直接 401 打不开，只能重装——这是之前「得重新搭建」的真正原因。
2. **Vercel 默认域名（`*.vercel.app`）大陆无法直连**（`ERR_CONNECTION_TIMED_OUT`），国内使用不要选它；它只适合海外访问场景。
3. **必须 HTTPS**：Service Worker 和 PWA 安装只在 HTTPS（或 localhost）下生效。

### 推荐：EdgeOne Pages（腾讯云，免费，国内可达，push 自动部署）

1. 把代码推到 GitHub（同下文 Vercel 流程的第一步）。
2. 登录 [腾讯云 EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)，**创建项目 → 导入 Git 仓库**，构建配置：Build Command `npm run build`，输出目录 `dist`。
3. 部署完成后，进入**部署详情**，找到 Production 部署的**默认域名**（形如 `https://xxx.edgeone.app`，免费、固定、无需备案）。
4. **以后手机上只用这个固定域名**。`main` 分支每次 push 会自动重新部署，应用在手机上自动更新。

> 注意区分两种地址：部署详情/PR 里的「预览地址」是 24 小时临时链接，只能自己临时看看，**不能用来装 PWA**；生产部署的默认域名才是固定地址。
>
> 想要大陆极速访问和自有品牌域名才需要买域名（EdgeOne 免费版走海外可用区节点，大陆访问一般可用，速度中等）。

### 备选：Vercel（仅海外访问场景）

1. 代码推到 GitHub 后，在 [vercel.com](https://vercel.com) 点 **Add New… → Project → Import**。
2. 配置：Framework Preset `Vite`，Build Command `npm run build`，Output Directory `dist`。
3. 得到 `https://xxx.vercel.app` 地址。

> 大陆网络直连 `*.vercel.app` 会超时，属平台限制而非应用问题。

## 手机使用：安装到主屏幕

**前提：必须用上面说的「固定生产域名」打开**（HTTPS）。局域网 IP、24 小时预览链接都不行。

**之前从预览链接/Vercel 装过的，做一次迁移（只需一次）：**

1. 删掉手机主屏幕上的旧图标；
2. 用固定生产域名在浏览器打开应用，重新「添加到主屏幕」；
3. 打开「设置 → 版本与更新」核对版本号和构建时间——以后就不用再管了。

安装完成后从主屏幕图标打开：应用会以独立窗口（standalone）运行，没有浏览器地址栏，支持离线打开。

- **Android / 桌面 Chrome**：打开页面 → 右上角设置 → 「安装到手机」，或直接在 Chrome 菜单里选「安装应用 / 添加到主屏幕」。
- **iPhone / iPad**：Safari 打开页面 → 点底部「分享」按钮 → 选择「添加到主屏幕」。

## 应用更新机制（重要）

部署新版本后，手机上的应用会自动更新，**不需要重新安装、不需要清数据**：

- **应用打开、从后台切回前台、网络恢复、iOS 从缓存恢复页面**时，都会主动检查 `sw.js` 是否有新版本（不再只依赖浏览器「打开页面才检查」的被动机制）；
- **页面一直开着**时，每小时也会自动检查一次；
- 发现新版本后自动下载；没有弹窗/表单时会等切到后台再刷新，有未保存内容时不会强制刷新；
- 也可以在「设置 → 版本与更新」里点「**检查更新**」立即检查；那里同时显示**当前版本号、git 短哈希、构建时间和当前访问地址**。如果地址显示的是 `edgeone.dev` 或 `vercel.app`，面板会直接警告你：这个地址装的应用没法长期用，请迁移到固定生产域名。

配套的缓存策略已写进部署配置（`vercel.json` / `edgeone.json`）：

- `sw.js`、`index.html`、`manifest.webmanifest` 配置 `Cache-Control: no-cache`——这三个文件必须每次回源校验，否则 CDN 边缘节点缓存旧 `sw.js`，浏览器永远发现不了新版本（这正是之前「手机上不更新」的根因之一）；
- `/assets/*` 文件名带内容哈希，配置为一年不可变缓存，保证加载速度。

部署后可以验证：`curl -I https://你的地址/sw.js`，响应头应包含 `Cache-Control: no-cache`。

> 若 EdgeOne 不识别 `edgeone.json` 里的 `headers` 字段（以官方文档为准）导致部署报错，删掉该字段后在 EdgeOne 控制台手动配置同样的缓存规则即可。

**两个前提，缺一不可**：

1. **访问地址必须固定**：装到主屏幕的应用绑定部署域名。用 24 小时预览链接（`*.edgeone.dev`）安装的应用，链接过期后直接 401，任何自动更新机制都救不了，只能从固定生产域名重装一次。
2. **必须 HTTPS**：Service Worker 只在 HTTPS（或 localhost）下生效。

## 外观：深浅色自动切换

- 默认跟随本地时间自动切换：**6:00–17:59 浅色，18:00–次日 5:59 深色**。
- 页面开着跨过切换点时也会自动换主题，无需刷新。
- 在「设置 → 外观」里可以固定为浅色或深色；选「自动」恢复按时段切换。

## 数据存储

任务与今日选择始终先写入浏览器本地的 **IndexedDB**（通过 [Dexie](https://dexie.org) 访问），离线可正常使用。不配置 Supabase 或未登录时，数据不会上传；登录后仅任务会同步到当前账号，今日选择仍只保存在本机。

### 可选：启用 Supabase 云同步

1. 在 Supabase 项目执行 [`supabase/schema.sql`](supabase/schema.sql)。不要跳过：其中包含 `(user_id, id)` 复合主键、RLS、原子条件写函数 `sync_tasks`、`replica identity full`（Realtime 事件完整性）以及墓碑清理定时任务；**旧版部署必须重新执行一次**。
2. 复制 [`.env.example`](.env.example) 为 `.env.local`，填入 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
3. 重新构建/部署后在「设置 → 账号与同步」注册或登录。

> 墓碑清理依赖 `pg_cron`。若未启用，脚本会 `RAISE NOTICE` 跳过（不影响其它语句），可在 Dashboard → Database → Extensions 启用后重跑末尾那段 SQL；不想装扩展就每季度手动执行一次文件末尾注释里的 `DELETE`。

同步规则：

- 本地写入优先，云端写入失败不影响当前操作；网络恢复、回到前台、每 5 分钟会自动重试，单次失败还会按 5s→10s→…→5 分钟退避补推。
- `updatedAt` 新者胜；时间相同但内容冲突时固定采用远端，保证多设备最终收敛。
- 云端写入通过数据库函数做**严格条件更新**，慢请求或并发请求不能把新数据回滚成旧值。
- 编辑表单保存时携带「打开表单时的版本」做乐观并发校验：期间被其他设备改过会弹「覆盖 / 放弃」，不再静默覆盖。
- 删除使用软删除墓碑，其他设备拉取后会同时清理「今日三件事」里的引用；墓碑由云端定时清理（保留 90 天），本地墓碑不清。
- 一个浏览器工作区只绑定一个账号。登录另一个账号时会停止同步并要求明确选择：复制本机任务并切换，或退出当前账号。

## 数据迁移：导出 / 导入

入口：右上角设置 → 数据备份。

- **导出备份**：点击「导出备份」，会下载一个 JSON 文件（`ddl-backup-时间.json`），只包含当前可见任务，不导出已删除墓碑。
- **导入备份**：点击「导入备份」选择 JSON 文件，确认后合并写入。导入前会自动下载一份当前数据的备份，便于回退。
- **合并策略**：
  - 按任务 `id` 合并，相同 id 的任务以备份文件为准，并视为一次新的本地修改；备份中不存在的本地任务不会删除；
  - 旧备份中的非 UUID ID 会自动重映射，并同步改写今日选择引用；
  - 今日选择按日期合并，同一天的选择以备份文件为准，且每天最多保留 3 条；
  - 备份里的墓碑不会导入，避免旧备份复活已删除任务；
  - 无法解析的记录会被跳过，并在导入结果中显示数量。
- **覆盖导入（Gist）**：备份中的任务覆盖本地；备份中不存在的本地任务会写成删除墓碑并同步到云端，不会在下次同步时“复活”。

## 已知限制

- **今日选择不跨设备同步，且这是明确的产品决策（不做）**：「今日三件事」表达的是「此刻在这台设备上先做哪三件」的本地决策，跨设备同步只会制造无意义的互相覆盖。因此该模块只保留本机读写，不参与云端同步，也不对外暴露仅供同步使用的接口。
- **云同步需要自行配置 Supabase**。未配置时仍可完整离线使用。
- **本机工作区只绑定一个云账号**。切换账号需在冲突提示中明确选择“复制并切换”，或先导出备份后清理站点数据。
- **清除浏览器站点数据会丢失本地数据**，无法找回，建议定期导出备份。
- **没有后台通知**。应用不会在关闭标签页后推送 DDL 提醒，请把应用放到主屏幕养成每天打开的习惯。
- **PWA 安装需要 HTTPS**。局域网 IP 的 HTTP 地址不支持安装与离线缓存，正式使用请部署到 HTTPS 地址。

## 测试

```bash
npm test          # 跑一遍（vitest run）
npm run test:watch
npm run typecheck
```

当前测试只覆盖纯逻辑层，不依赖浏览器 IndexedDB：

- 备份解析：子任务 / 实际耗时保真，旧 ID 重映射，墓碑过滤，时间戳规范化；
- 同步合并：跨时区时间戳、远端/本地胜负、同时间戳冲突收敛；
- 自然语言：下周日期、非法日期、2 月 31 日、深夜/中午时段；
- 自动挑选：DDL 分桶 → 优先级 → 耗时的排序规则；
- 进度口径：已完成拦截、逾期与剩余 24 小时切小时精度、自然日天数不向上取整；
- 统计口径：近 7 天按自然日落位、`isCompleted` 旧字段兼容、未知类型归入「其他」、本周预计/实际耗时聚合；
- 云同步行完整性：整行才允许落库，Realtime 半行（只带主键 + 变更列）一律拒绝并改走精确补拉。

## 技术栈

- **React 19 + TypeScript 7**：界面与类型
- **Vite 8**：构建与开发服务器
- **Tailwind CSS 4**：样式（含深浅色主题）
- **Dexie 4**：IndexedDB 数据层
- **Supabase**：可选账号与任务云同步（RLS + Realtime + 原子条件写）
- **vite-plugin-pwa / Workbox**：manifest、Service Worker 与离线缓存
- **dayjs**：日期处理
- **oxlint + Prettier**：静态检查与代码格式（CI 全跑，见「代码检查与格式化」）

## 迭代日志

### 2026-11-06 · 新增事项默认 16:30 + 快捷天数

背景：默认 DDL 由 23:59 改为 16:30，同时在日期选择器下方加 +1/+3/+7 快捷按钮与自定义天数输入框。

- **口径集中**：`src/utils/date.ts` 新增 `atDefaultDeadline()`、`deadlineAfterDays()`、`defaultNewTaskDeadline()`，表单默认值、标题解析、智能录入共用一套计算，不再散落硬编码的 `23:59`。
- **边缘场景：16:30 已过**。下午 5 点后打开新增表单时，若默认值仍是「今天 16:30」，一保存就被「DDL 必须是未来时间」拦下，用户会以为表单坏了。处理方式是 `defaultNewTaskDeadline()` 判断今天 16:30 是否已过，已过则顺延到明天 16:30。
- **交互决策：快捷按钮是覆盖，不是累加**。点 +3 就是 3 天后，点 +7 就是 7 天后。理由是按钮语义为「绝对天数」，累加会让结果不可预测，还得额外提供重置入口。
- **优先级冲突：标题解析 > 快捷按钮**。标题解析是核心卖点，`parseDateTime` 一旦识别到时间就覆盖手动选择。为避免用户以为按钮失灵，冲突时在 DDL 下方给出提示「检测到标题包含时间，已覆盖快捷选择「+3天」」；手动改时间或再点按钮会清掉该提示。
- **不做浏览器层 `min` 硬限制**，继续靠提交校验兜底：移动端 `min` 表现不一致，且编辑已完成的历史任务时需要允许过去时间。
- **回归测试**：新增 `src/utils/__tests__/date.test.ts`，覆盖 16:30 前后分支、恰好 16:30、跨月跨年顺延，以及 +1/+3/+7 与自定义天数。

### 2026-11-13 · 代码质量与同步可靠性

- **同步正确性**：时间戳改为数值比较；仅推送明确更新的任务；Supabase 写入走原子条件 RPC，避免慢旧请求覆盖新数据；全量拉取显式分页。
- **跨账号隔离**：工作区绑定账号，换账号必须显式确认；切换时清理旧推送队列、Realtime 与在途同步结果。
- **备份可靠性**：导出过滤墓碑；导入重映射非 UUID、过滤删除记录、更新 `updatedAt`；覆盖导入用墓碑代替物理清库，防止云端旧数据复活。
- **数据自愈**：Dexie v3 迁移修复旧非 UUID ID；远端删除同步清理今日选择；悬空选择不再占三个名额。
- **交互修复**：实际耗时可清空；子任务写入串行且失败回滚；弹窗 Esc 只关最上层；跨午夜日历/统计刷新；未保存表单不会被 PWA 强制刷新。
- **性能与结构**：设置/登录/统计按需加载，第三方依赖拆 vendor 块，任务筛选缓存并对高频列表做渲染隔离；统一弹窗与子任务清洗逻辑。

### 2026-11-15 · 全量代码审查：正确性、可维护性与白屏兜底

- **同步串号（P1）**：`mergeLocalWorkspaceIntoAccount` 复制工作区前未清空待推送队列。切换账号后、确认复制前产生的编辑仍带着旧 `id`，复制会重建主键，这些旧条目一旦被 flush 推上去就是一批重复任务。现在复制前先 `clearPendingPushes()`。
- **推送失败无重试（P1）**：此前推送失败只写 `lastError`，队列原地不动，只能等用户再改一次或 5 分钟后的全量同步兜底。新增指数退避重试（5s→10s→20s…上限 5 分钟），成功或切账号时归零；账号冲突/会话取消不重试，避免无意义抖动。
- **白屏无兜底（P1）**：新增 `ErrorBoundary` 包裹 `App`。任何渲染异常（脏数据、chunk 加载失败）不再卸载整棵树，而是给出「数据仍在 IndexedDB」的说明，支持崩溃后**先导出备份再刷新**（备份模块用动态 import，避免自身加载失败连带拖垮兜底页）。
- **统计口径不一致（P2）**：三张统计图原先直接用 `status === 'done'`，绕过了全应用统一的 `isTaskDone`（兼容旧备份的 `isCompleted`），导致同一份数据列表显示已完成、统计却不算。抽出 `completedAtMs()` 统一入口。
- **饼图脏数据（P2）**：`typeDistribution` 遇到非法 `type` 会写出 `undefined` 计数，ECharts 拿到 NaN 直接不渲染整张图。改为未知类型归入「其他」。
- **耗时上限三处漂移（P2）**：`100` 这个上限分散在 `useTasks`（新增/更新）、`TaskFormSheet`（校验 + input 属性）、`backup`（导入）四处，且更新路径只挡负数不挡上限。抽出 `utils/taskLimits.ts` 作为唯一真源，四处共用。
- **历史任务改不动（P2）**：表单把预计耗时下限写成 `> 0`，而导入的历史任务普遍是 `0`（未估算），这类任务只改标题也会被耗时校验拦住、永远存不了。下限改为 0，与数据层/导入层对齐。
- **逾期判断自相矛盾（P2）**：`AllTasksView` 的逾期徽标不传 `now`（用真实当前时间），进度条用 `useNow()` 的 60 秒快照，跨过 DDL 的那一分钟会出现「还剩 1 小时」和「已逾期」同时出现。改为共用同一个 `now`。
- **下载逻辑重复（P3）**：备份 JSON 与日历 ICS 各写了一份 `a[download] + ObjectURL + 延迟回收`。抽出 `utils/download.ts`，新增导出格式直接复用。
- **弹窗关闭时机（P3）**：设置面板导入/导出/Gist 操作进行中仍可点遮罩或按 Esc 关闭，操作还在跑、面板已卸载，用户看不到结果。忙碌期间禁用两种关闭方式。
- **无障碍（P3）**：DDL 进度条补 `aria-label`，读屏不再只播报一个无名字的百分比。
- **回归测试**：新增 `src/utils/__tests__/stats.test.ts`（近 7 天落位、`isCompleted` 兼容、未知类型兜底、本周耗时聚合），测试总数 40 → 46。

### 2026-11-15 · 数据完整性与并发冲突（第二轮）

按「不做今日选择同步 / 云端 SQL + 客户端兜底 / 只清云端墓碑 / 按副作用拆分 / 补工程化 / 乐观并发」六项结论，先落地三项防丢数据的：

- **Realtime 半行数据（P1）**：默认 `REPLICA IDENTITY` 下 UPDATE 事件只带主键与变更列，`rowToTask(payload.new)` 会把任务写成空标题、缺子任务的残缺行。云端执行 `alter table public.tasks replica identity full;`（已写入 `schema.sql`），客户端再由 `src/lib/taskRow.ts` 的 `isCompleteTaskRow` 判定完整性——不完整就按 id 精确补拉一次（`pullRemoteRow`），绝不落后半行。两道防线互不依赖：忘跑 SQL 也不会写坏本地数据。
- **编辑期间被其他设备修改（P1）**：表单打开时记下 `task.updatedAt`，`updateTask` 在同一 Dexie 事务里「读 → 比 → 写」，版本不一致抛 `TaskConflictError`；表单不再静默覆盖，而是弹「覆盖保存 / 放弃修改」，放弃后界面即同步为最新版本。版本比较走 `timestampMs`（毫秒）而不是字符串——本地 `Z` 与云端 `+00:00` 直接比字符串会把同一次修改误判成冲突。
- **墓碑永久堆积（P2）**：只在云端清。`schema.sql` 末尾用 `pg_cron` 每天 04:00 物理删除 `deleted and updated_at < now() - interval '90 days'` 的行；未启用 `pg_cron` 时 `RAISE NOTICE` 跳过，不影响其它语句。**本地墓碑一行不动**——本地删了云端还在，下次全量同步原样拉回来；未登录时物理删也一样，登录后云端那条会复活。
- **今日选择不同步定案（决策）**：确认不做跨设备同步，同时删除 `useDailySelection` 里仅服务于同步/调试的三个危险接口：`selection` 原文、按日期直读 `getSelection`、`clearSelection`（清空某天）。现在对外只有「id 列表 + 加/减/整体覆盖」三个写操作，调用方无法绕过 3 个名额与完成态校验。
- **测试**：新增 `src/lib/__tests__/taskRow.test.ts`（整行通过、半行拒绝、缺 `sub_tasks` 拒绝、类型错误拒绝），测试总数 46 → 51。

### 2026-11-15 · 按副作用拆分 + 工程化兜底（第三轮）

- **App 从 550 行降到 391 行（含 JSX）**：按「副作用」而不是「JSX」切分，避免拆完还要靠 props 打洞。
  - `hooks/useTaskActions.ts`（218 行）：任务增删改、勾选、子任务、今日三件事的增删与一键生成，以及「已删除选择不占名额」的过滤。
  - `hooks/useAccountSwitch.ts`（104 行）：账号绑定冲突、复制并切换、退出、手动同步。
  - App 只剩布局、当前 tab、弹层编排与专注计时。
- **确认框改成注入而不是依赖**：`useTaskActions` 需要弹「是否覆盖今日选择」，这里注入 `requestConfirm(message, onConfirm)`，hook 不再持有 `setConfirmState`，也就不会把 UI 状态反向依赖进业务层。
- **换账号复制的一个真实隐患**：原逻辑「复制成功 → 同步成功才关提示」，若同步失败弹窗仍在，用户再点一次「复制并切换」就会复制出**第二份**任务（`bindSyncOwner` 早已执行）。现在复制成功即关提示，同步失败只提示「稍后自动重试」。
- **归属冲突不再用 effect + setState**：改在渲染期从 `getBoundSyncUserId()` 派生。绑定关系只会在登录 / 复制 / 退出时变化，派生天然不会出现「effect 还没跑完 UI 已闪一下」的中间态。
- **专注计时解构取用**：`useFocusTimer()` 每次渲染返回新对象，整体进依赖数组会让「任务失效即停止」的 effect 在每 500ms 计时里重跑；解构出字段与方法后依赖精确到单个函数。
- **静态检查落地（oxlint）**：`typescript-eslint` 8.x 启动即抛 `does not support TS 7.0`，装上会让 `npm install` 因 peer 冲突失败——所以改用自带解析器的 oxlint，规则锁定 `no-floating-promises`、`rules-of-hooks`、`exhaustive-deps`、`only-export-components`、`no-unused-vars`。当前 **0 warning / 0 error**。
- **Prettier 全量格式化**：`printWidth 100` + 单引号 + `prettier-plugin-tailwindcss`（class 顺序统一）。`.prettierignore` 保护 README、锁文件与构建产物。
- **CI**：`deploy.yml` 在 `npm ci` 之后依次跑 lint → format check → test → build，四个任一失败即不部署。
- **验证**：`tsc --noEmit` 通过；`oxlint` 0/0；`prettier --check` 全通过；vitest 8 文件 51 项通过；`npm run build` 通过；`npm ci --dry-run` 通过（lockfile 与 package.json 一致）。