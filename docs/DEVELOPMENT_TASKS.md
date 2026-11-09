# 分阶段开发任务与验收

**目标**：复用 Love 小家界面与保留功能，交付只供两位账户使用的 Android APK 和 iPhone IPA。

**技术边界**：Nuxt 4 / Vue 3 / TypeScript、Capacitor、Supabase Auth / PostgreSQL / RLS / Realtime、Cloudflare Workers 与 R2。移动分发使用 Windows Android 构建和 macOS 云 iOS 构建。保留 MIT 版权声明。

**执行边界**：本阶段交付六份文档及原版基线。后续每阶段从测试、最小实现到独立验收，阶段 1 结束后等待下一阶段指令。

## 阶段 1 · 已审计的原版基线

2026-11-09 香港时间。GitHub 连接确认 [上游提交](https://github.com/XTH-LOVE/Love/commit/870c1f5905a7f483eab59efab4159024ef887b8b) 与 [用户 fork 提交](https://github.com/HoRizon9688/Love/commit/870c1f5905a7f483eab59efab4159024ef887b8b) 相同。基线是原版 `1.0.1`，Windows Node `24.21.0`、npm `11.19.0`，按 `package-lock.json` 安装。仓库 CI 配 Node 22，现有 CI 只列出安装、根 tsc 和静态生成。未填写真实 Supabase 环境变量，Playwright 使用本地 Chrome，覆盖 Desktop Chrome 与 Pixel 5 两种视口。

| 检查 | 结果 | 范围和原因 |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | 通过 | 使用独立临时 npm 缓存绕过默认缓存的 `EEXIST/EBADF`，安装 962 个包，项目 postinstall 已执行。设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，桌面端二进制不纳入基线 |
| `npx --no-install tsc --noEmit` | 退出 0 | 对应现有 CI。根 tsconfig 的 `files: []` 与 project references 使该命令不能证明应用或 Vue 模板通过全量类型检查 |
| `npx --no-install tsc --noEmit -p .nuxt/tsconfig.app.json` | 退出 1，66 条 TypeScript 诊断 | 应用 TS 配置检查发现 `SupabaseLike.supabaseUrl` 与 SDK 的 protected 成员不兼容、`$supabase` 可能为 null 等问题。该运行仍未检查 Vue 模板 |
| `npm test` | 20 文件、71 项通过 | 沙箱内 Vitest 在临时转换缓存 rename 抛出 `EPERM`，未进入测试。以同一源码和命令在沙箱外复跑通过 |
| `npm run test:e2e` | 首轮 4 过、2 失败；`--workers=1` 复跑 5 过、1 失败 | 首轮两种视口的注册卡用例都在启动画面等待 `#auth-single-card` 超时。串行复跑中首个桌面用例仍超时，后续移动用例通过。结果与冷启动时序相关，具体启动耗时来源未定位。用例附加的 `?auth-e2e=1` 在应用代码中没有对应分支 |
| `npm run build` | 退出 0 | Nuxt / Nitro 的 Node SSR 产物含 `.output/server/index.mjs`，现有三条音乐服务端路由仍在基线包中 |
| `npm run android:sync` | 通过 | 内含 `nuxt generate`，产出 `.output/public`，Capacitor 同步成功。原版仍包含定位与推送插件。Nuxt/Nitro 有构建警告，未阻止静态产出 |
| `android\gradlew.bat assembleDebug` | 未产出 APK，退出 1 | `JAVA_HOME` 指向不存在的 x86 JDK 路径，可查到的本地 JDK 为 Java 8，未检测到常规 Android SDK 路径或 SDK 环境变量 |
| `npm audit --omit=dev` | 退出 1，13 项 | 2 low、11 moderate、0 high/critical。报告含 Nuxt/Nitro 与 glob/minimatch/archiver 等依赖链。阶段 2 单独判断生产产物可达性并处理锁文件；本阶段未自动修复 |
| Supabase / R2 / 原生 | 静态审计 | 当前无 Docker/Supabase CLI 可用，未运行数据库迁移、远端 Auth/RLS/Realtime 或 R2。原版缺 iOS 工程；无 IPA、无原生真机验收 |

复现时在空配置的 checkout 使用 npm 锁文件、隔离缓存与本地浏览器。以下命令按测试与构建依次执行，避免 Nuxt 并发写入生成目录。

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
npm ci --cache "$env:TEMP\love-baseline-npm" --no-audit --no-fund
npx --no-install tsc --noEmit
npx --no-install tsc --noEmit -p .nuxt/tsconfig.app.json
npm test
$env:NUXT_PUBLIC_SUPABASE_URL = ''
$env:NUXT_PUBLIC_SUPABASE_ANON_KEY = ''
$env:NUXT_PUBLIC_UPDATE_MANIFEST_URL = '/app-update.json'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
npm run test:e2e -- --workers=1
npm run build
npm run android:sync
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
npm audit --omit=dev
```

## 阶段 2 · 本地验证与身份底座

- [ ] **CI 和用例基线。** 在 `.github/workflows/ci.yml` 增加 Vitest、Playwright 和能遍历 Vue SFC 的类型检查，分别验证 Nuxt SSR 与静态产物。修复注册入口的测试夹具和就绪判断，保留双视口断言。评估依赖公告并逐次更新锁文件。验收为无生产凭据可运行、浏览器可交互、核心单元和类型检查有明确退出结果。
- [ ] **新 Supabase 初始化与双人约束。** 按 [数据库计划](DATABASE_PLAN.md) 重建 `supabase/migrations/`，先落身份、成员及权限。加本地 SQL 与 HTTP 测试，覆盖两会话并行接受同码／不同码、过期、重发、三人上限、拒绝额外账户、解绑。验收为两次空库重建和第三人访问失败，应用仍可在测试库注册、配对、退出。
- [ ] **注销和保密契约。** 对 `account-auth/account-security` 和账号相关 composables 写测试，覆盖恢复码并发、离开后访问、已读／撤回角色、隐藏正文、注销失败重试。把账号级安全字段与情侣成员资料拆开，准备限流与最小权限。

## 阶段 3 · 功能拆分与恢复

- [ ] **签到优先。** 在本地数据库恢复无宠物状态、保护和历史 RPC，重接 `StreakHistoryPanel.vue` 和首页手动签到入口。分别验证每天每人一次、双方并发同日只结算一次、历史和保护规则，每日心情仍可独立使用。
- [ ] **消息与活动。** 先测 `ChatPanel.vue`、`useMessages.ts`、`useActivityFeed.ts` 和新活动触发器。验证文字、表情、语音、视频、撤回、已读、历史、活动和通知，禁止跨空间消息与敏感预览。保留手写情书、未来邮箱、声音胶囊以及相关入口。
- [ ] **拆除 A–E。** 按 [排除模块](REMOVE_MODULES.md) 先拆共享逻辑再删除独占代码、资产、插件与 SQL。先改注销与活动流，随后删除引用对象。更新运行依赖和专属测试，保留所有共享断言。验收为新库、包、原生权限、运行请求和配置均通过排除清点。

## 阶段 4 · 私有媒体与双账号集成

- [ ] **Worker + R2。** 实现按用户和空间授权的上传、提交、分段、读取和删除，复用 `useMediaUrls.ts` 与上传队列的可重用部分。覆盖原图、缩略图、视频海报、语音和头像。验收为跨空间拒绝，媒体暂停／续传、过期／清理、Range 播放和重复请求不会重复入库。
- [ ] **保留功能逐项回归。** 两名真实测试账号完成 [19 项矩阵](FEATURE_MATRIX.md)，另用第三账号测试越权。验证回连、未读与提醒、隐藏内容、分享链接、导出以及注销。测试用本地或专用测试项目与桶。

## 阶段 5 · 原生安装、更新与交付

- [ ] **Android。** 设置 JDK/SDK，修改合并 manifest 和返回行为，生成调试与签名 APK，验证双设备或设备与测试机、权限、录音、相册、覆盖安装。
- [ ] **iOS。** 按 [构建计划](IOS_BUILD_PLAN.md) 添加 `@capacitor/ios`、原生工程与 Codemagic workflow，先编译模拟器，再按两台设备做签名 IPA 和真机验收。验证安全区、键盘、OAuth 回调、iOS 录音、通知和弱网。
- [ ] **私下发布。** 审核安装包、账号准入、RLS、密钥注入、更新渠道、备份／恢复和 R2 用量。两位成员完成从新装到使用的验收，之后再安排前端色调和布局调整。
