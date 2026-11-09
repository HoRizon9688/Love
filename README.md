<p align="center">
  <img src="public/couplespace-mark.svg" width="108" alt="Love小家 logo">
</p>

<h1 align="center">Love小家 · CoupleSpace</h1>

<p align="center">
  一个真正属于两个人的私密生活空间。<br>
  把共同回忆、纪念日、每日打卡和写给对方的信收藏在一起。
</p>

<p align="center">
  <a href="https://github.com/XTH-LOVE/Love-"><img src="https://img.shields.io/github/stars/XTH-LOVE/Love-?style=for-the-badge&color=ff6fae&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/XTH-LOVE/Love-/network/members"><img src="https://img.shields.io/github/forks/XTH-LOVE/Love-?style=for-the-badge&color=9c6ade&label=Forks" alt="GitHub forks"></a>
  <a href="https://github.com/XTH-LOVE/Love-/blob/HEAD/LICENSE"><img src="https://img.shields.io/github/license/XTH-LOVE/Love-?style=for-the-badge&color=7eb8e8" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#为什么做-love小家">为什么做</a> ·
  <a href="#功能一览">功能一览</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#构建与发布">部署</a> ·
  <a href="#参与贡献">参与贡献</a>
</p>

<p align="center">
  <img src="public/login-couple.jpg" width="820" alt="Love小家登录页预览">
</p>

## 安装

本分支用于自托管。网页和 Android 可按下方流程在本地构建。安装与更新使用本项目自行构建的产物。

## 为什么做 Love小家

两位成员可以在各自的设备上记录共同回忆、维护共享计划，或写一封留到未来才打开的信。可以在设置中选择暖色主题。

## English overview

**Love小家 (CoupleSpace)** is a private, realtime space for two people. It combines shared memories, albums, anniversaries, a calendar, daily check-ins, handwritten letters and voice capsules in one calm, romantic interface.

It is built with Nuxt 4, Vue 3, TypeScript and Supabase, and can be shipped as a static web app, an Android application through Capacitor, or a Windows desktop app through Electron. The repository is intentionally self-hostable: authentication, database policies, storage, realtime channels and server-side secrets are documented so developers can build their own private couple space instead of relying on a public social network.

The project is still evolving. Contributions are welcome, especially around accessibility, offline media, testing and platform polish.

## 功能一览

### 首页：你们的共同入口

- 实时显示在一起的天、时、分、秒。
- 支持选择共同封面，并根据照片比例自动适配展示区域。
- 最近共同回忆最多展示 10 项，支持照片和视频预览。
- 今日情话轮播、共同计划、下一个纪念日和情书入口集中在首页。
- 首页展示共同动态和系统通知入口。
- 支持开屏动画、一次性软件声明、版本更新提示和关于软件页面。

### 时光轴：把故事写下来

- 按日期记录文字、地点、照片和视频。
- 支持编辑、删除和回看已经保存的共同回忆。
- 每条内容显示记录日期、地点和上传成员。
- 适合记录第一次旅行、生日、见面、纪念日和普通但值得记住的一天。

### 相册：照片和视频分开管理

- 创建多个相册，按相册、照片、视频和时光轴来源筛选。
- 支持一次选择多张照片或多个视频上传。
- 图片上传前进行客户端压缩，减少手机端等待时间。
- 图片和视频支持预览、全屏查看、下载和删除。
- 每项媒体显示拍摄日期和添加者。
- 使用签名地址、浏览器缓存和分批加载，避免每次打开都重新等待全部媒体。

### 纪念日：重要日子不再错过

- 设置在一起的日期，并实时计算共同经历的时间。
- 创建可重复的纪念日、旅行日、生日和自定义日期。
- 显示下一个即将到来的特别日子和剩余天数。

### 清单：一起完成的小事

- 创建共同计划、备注、分类、优先级和计划日期。
- 任意一方完成后，另一方可以实时看到状态变化。
- 首页显示待完成事项和完成进度。

### 每日打卡与互动

- 两位成员每天各打卡一次，双方完成后计入连续记录。可查看历史日历、最高连续天数和保护卡。
- 记录每日心情、回答每日问答，或在共享日历里安排下一次见面。
- 保留手写情书、未来邮箱、声音胶囊、共同故事和秘密彩蛋。

## 视觉与交互

- 桌面端：浮动玻璃侧边栏，适合宽屏持续使用。
- 手机端：浮动底部导航，避开状态栏和系统导航区域。
- 大圆角、半透明表面、三套可切换的暖色主题和柔和阴影。
- 使用 Manrope 与 Nunito Sans，兼顾英文产品信息和中文界面阅读。
- 使用 Lucide 图标，按钮保留清晰的图标、状态和无障碍标签。
- 上传、加载、失败重试、空状态和移动端安全区均有独立处理。

## 技术栈

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| Web 应用 | Nuxt 4、Vue 3、TypeScript | SSR、静态生成和组件化界面 |
| 样式与交互 | CSS、玻璃质感设计、Lucide | 响应式布局、主题和图标系统 |
| 用户与数据 | Supabase Auth、Postgres、RLS | 登录、情侣空间、数据隔离和权限控制 |
| 实时能力 | Supabase Realtime | 打卡、在线状态和共同数据同步 |
| 私密媒体 | Supabase Storage | 照片、视频、语音和短期签名地址 |
| 服务端能力 | Supabase Edge Functions | 账户登录、恢复与安全管理 |
| 移动端 | Capacitor Android | Android APK 构建和系统能力接入 |
| 桌面端 | Electron | 加载指定部署的 Windows 桌面壳 |

## 项目结构

```text
CoupleSpace/
├─ app/
│  ├─ app.vue                 # 应用壳、导航、首页和全局状态
│  ├─ components/             # 首页、相册、时光、日历和打卡界面
│  ├─ composables/            # Auth、Realtime、媒体缓存和业务逻辑
│  └─ plugins/supabase.ts     # Supabase 客户端初始化
├─ public/
│  ├─ couplespace-mark.svg    # 品牌图标
│  └─ login-couple.jpg        # 登录页视觉资源
├─ supabase/
│  ├─ bootstrap/              # 从新空库初始化的迁移链
│  ├─ migrations/             # 原版迁移历史
│  └─ functions/              # 账户相关 Edge Functions
├─ android/                   # Capacitor Android 工程
├─ desktop/                   # Electron Windows 桌面壳
├─ capacitor.config.json
├─ nuxt.config.ts
└─ package.json
```

## 快速开始

### 1. 克隆项目

打开本分支所在的仓库目录，安装依赖并复制配置模板。

```powershell
npm install
Copy-Item .env.example .env
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，至少配置：

```env
NUXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

原生端如需更新检查，将 `NUXT_PUBLIC_UPDATE_MANIFEST_URL` 设为自己的部署地址。

### 3. 初始化 Supabase

新空库按 [迁移说明](supabase/bootstrap/README.md) 使用 `supabase/bootstrap/` 的版本链。先在独立的本地实例验证。根目录 `supabase/migrations/` 对应旧部署的历史，和新链分开使用。

账户注册、恢复和注销依赖 `account-auth` 与 `account-security`。测试环境可以使用本地预置账号。启用注册前先按部署计划落实双账号准入。真实服务密钥只配置在服务端。

### 4. 启动开发环境

```bash
npm run dev -- --host 127.0.0.1 --port 3200
```

## 构建与发布

### Web 静态站点

```bash
npm run generate
```

生成结果位于 `.output/public/`，可部署到 Cloudflare Pages、Netlify、Vercel 静态托管或任意静态服务器。

### Android APK

```bash
npm run android:apk
```

该命令会先生成静态网页、同步 Capacitor 工程，再构建 Debug APK。正式发布前请在 Android Studio 中配置签名和 Release 构建。

### Windows 桌面软件

```bash
npm run desktop:dev
npm run desktop:exe
```

Electron 默认加载本地 `http://127.0.0.1:3200/`。若使用自己的部署，在启动进程中设置 `LOVE_HOME_DESKTOP_URL` 和对应的 `NUXT_PUBLIC_SUPABASE_URL`。安装包输出到 `desktop-dist/`。

### 版本更新

版本号维护在 `package.json` 和 Nuxt runtime config 中。网页和桌面端使用在线更新清单，Android 通过 APK 下载入口提示用户安装新版本。完整流程见 [APP_UPDATE.md](APP_UPDATE.md)。

## 安全与隐私设计

情侣空间通过账号和成员关系保护照片、视频、录音和共同记录。

- 每个用户属于一个情侣空间，业务查询以 `couple_id` 为边界。
- Supabase Postgres 使用 RLS 限制同一情侣空间之外的访问。
- 私密媒体使用 Storage 签名地址，不把公开永久文件 URL 作为主要访问方式。
- 前端只使用 Supabase anon key；service role key 只允许放在服务端。
- 账户设置中不会显示用户密码，只提供修改或重置能力。
- 生产环境必须使用 HTTPS，并按实际部署域名配置认证回调地址。

## 当前状态

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Web 登录与情侣空间 | ✅ 可用 | 需要配置 Supabase Auth 和数据库 |
| 首页、相册、时光、纪念日、清单 | ✅ 可用 | 支持真实数据和演示模式 |
| 双人打卡与历史 | ✅ 已通过本地双账号验证 | 需要空库迁移链 |
| Android / Windows 构建 | 提供构建入口 | 本地构建需要对应工具链，分发需要签名 |

## 路线图

- [ ] 媒体上传断点续传、离线队列和更智能的本地缓存。
- [x] PWA 安装清单、Service Worker 离线应用壳和安装提示。
- [ ] 桌面通知和跨设备同步优化。
- [ ] 多语言界面与更完善的无障碍支持。
- [ ] 面向贡献者的组件文档和端到端测试。

## 贡献指南

欢迎提交 Issue、改进建议、UI 方案和 Pull Request。

1. Fork 本仓库并创建功能分支。
2. 保持修改范围清晰，避免把真实密钥、个人照片或生产数据提交到仓库。
3. 提交前运行：

   ```bash
   npx tsc --noEmit
   npm run generate
   git diff --check
   ```

4. 在 Pull Request 中说明：修改背景、实现方式、测试结果以及是否涉及数据库迁移。

## 常见问题

### 为什么登录后页面还是演示模式？

检查 `.env` 中的 Supabase URL 和 anon key，确认当前部署环境也配置了相同变量，并重新生成或重新部署静态文件。

### 为什么照片加载失败或很慢？

确认 Storage bucket、RLS、签名地址和部署域名配置正确。项目会使用签名地址、图片变换、浏览器 Cache Storage 和分批加载，但首次访问大视频仍然受网络和文件大小影响。

### 能不能只使用网页，不构建 APK？

可以。运行 `npm run generate` 后，把 `.output/public/` 部署到静态托管即可。Android 和 Windows 是额外的发布形态，不是 Web 使用的前置条件。

## 开源协议

本项目使用 [MIT License](LICENSE)。欢迎学习、修改和提交改进，也请在使用第三方服务时遵守对应服务条款和许可证。

## 支持项目

如果 Love小家对你有帮助，欢迎：

- 点一个 Star，让更多人看到这个项目。
- Fork 后做出你们自己的情侣空间主题。
- 提交一个 Issue，告诉我你最想要的功能。
- 分享给正在寻找私密共同空间的情侣或开发者。

<p align="center">
  <strong>愿每一段认真相爱的日常，都有一个值得回来的地方。</strong><br>
  <a href="https://github.com/XTH-LOVE/Love-">访问上游 GitHub 项目</a>
</p>
