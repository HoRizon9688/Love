# 原项目功能矩阵

审计基线为 `HoRizon9688/Love@870c1f5905a7f483eab59efab4159024ef887b8b`，与 `XTH-LOVE/Love` 的 `main` 同提交。原项目是由 `app/app.vue` 驱动的单壳应用。导航项和弹层主要在壳层注册，Nuxt 服务端路由主要用于音乐。下表的「已接入」指找到现行入口和实现，真实后端与原生交互的验证结果见 [开发任务与基线](DEVELOPMENT_TASKS.md)。

| # | 功能 | 现行入口、数据及行为 | 处置 |
| --- | --- | --- | --- |
| 1 | 注册、登录、绑定、解除 | `AuthFlow.vue`、`useCoupleAuth`、`AccountPanel.vue`、`useAccountManagement`。用户名／密码经 `account-auth`，另有邮箱、OAuth 及恢复流程。`profiles`、`couples`、`couple_members`、`invitations` 与 RPC | 保留。封闭注册、重做事务和成员约束，打通移动端回调 |
| 2 | 首页、恋爱天数、情侣封面 | `HomePage.vue`、`LoveDuration.vue`、壳层封面选择，`couples.relationship_start` 与封面 SQL、头像和相册媒体 | 复用界面。替换媒体解析，保留日期与封面编辑 |
| 3 | 相册、照片和视频 | `AlbumView.vue`、`useAlbums`、`albums/album_photos`。相册与媒体管理、缩略图、原图、视频封面、实时刷新 | 保留。子表增加 `couple_id`，统一 R2 媒体和队列 |
| 4 | 时光轴、共同回忆、图文日记 | `TimelineView.vue`、`useMemories`、`memories`。手写、图片、日期、手填地点 | 保留手写日记和地点文字。移除 AI 写作入口与地图服务 |
| 5 | 实时聊天 | `ChatPanel.vue`、`useMessages`、`messageState.ts`、`messages`。文本、表情、贴纸、图像、视频和异步语音 | 保留录音、预览和回放。拆除实时开麦、通话及位置分支 |
| 6 | 消息已读、撤回与历史 | `useMessages` 中的分页、Realtime 合并、`read_at` 和 SQL 更新守卫。撤回通过发送人删除消息行，并尝试清理附件 | 保留。补发件人撤回／收件人已读授权、同时间戳分页和重连测试 |
| 7 | 纪念日、倒计时、提醒 | `AnniversaryView.vue`、`useAnniversaries`、`useAnniversaryReminders`、`anniversaries`。原生本地通知与 Web 前台回退 | 保留。验证双端授权、重复提醒和解绑取消 |
| 8 | 共同清单和实时同步 | `TogetherListView.vue`、`useTogetherList`、`together_items`、更新守卫与 Realtime | 保留 |
| 9 | 共享日历 | `SharedCalendarView.vue`、`useSharedCalendar`、`calendarOccurrences.ts`，`shared_events/shared_event_tasks`，重复事件、任务和提醒 | 保留。补跨空间父子约束、时区和重复事件测试 |
| 10 | 每日打卡、连续天数、历史、保护 | `008/016–018` 有数据库实现。当前 HEAD 的 `StreakHistoryPanel.vue`、`useStreakHistory`、`useStreakReminders` 是未接入壳层的遗留代码，宠物签到组件已在 `5059525` 移除 | **保留并恢复入口**。借用历史界面与 Git 中旧组件交互，重写无宠物契约，恢复双人打卡、历史和保护 |
| 11 | 每日心情 | `MoodCheckinWidget.vue`、`useMoodCheckin`、`mood_checkins` | 保留。它是独立功能，需与双人连续打卡分别验收 |
| 12 | 每日问答 | `DailyQuestionCard.vue`、`useDailyQuestions`、`daily_questions/daily_answers`。独立题库与答题，`026/033` 包含兼容和 RLS | 保留。问答不依赖生成式 AI，需审计答案在 UI、数据库及活动流的可见时机 |
| 13 | 手写情书 | `LoveLetterCard.vue` 与聊天内手写情书交互，`couple_letters`、`007_letters_realtime.sql` 和独立实时订阅 | 保留手动编写、保存／发送及查看。删除 AI 草稿生成链路 |
| 14 | 未来邮箱 | `FutureMailboxPanel.vue`、`useFutureMailbox`、`future_letters` 与 `021` RPC | 保留。数据库时间控制解封，活动流与导出也要遵循正文可见规则 |
| 15 | 声音胶囊 | `VoiceCapsulePanel.vue`、`useVoiceCapsules`、`voice_capsules` 和独立媒体 | 保留。与聊天共用可复用录音能力，R2 授权纳入声音胶囊可见性 |
| 16 | 情话与浪漫组件 | `LoveQuoteCarousel.vue`、`LoveSky.vue`、`RomanceGiftExperience.vue`、GSAP 和减少动画设置 | 复用现有文案、动画和交互 |
| 17 | 恋爱故事、照片互动、彩蛋 | `RomanceGiftExperience.vue`、`useStoryShare`、`EasterEggPanel.vue`；`story_share_links`、`couple_easter_eggs`、`memory_favorites/reactions/comments` | 保留。故事链接继续要求情侣成员身份、过期与撤销；禁止媒体签名成为长期公开链接 |
| 18 | 通知中心、设置、安全 | `NotificationCenterPanel.vue`、`useActivityFeed`、`useNotificationCenter`、`AccountPanel.vue`、`SecurityCenterPanel.vue`。活动流、消息、纪念日、上传状态与本地已读；安全包含恢复码、登录设备提示和注销 | 保留。移除 AI、音乐、宠物和通话通知分支。当前远程 Android Push 的调用链面向来电，本地提醒与前台通知独立 |
| 19 | 版本更新、导出与隐私 | `useAppUpdate`、`AppUpdatePrompt.vue`、`public/app-update.json`、`useAccountSecurity.exportData`。原版更新指向上游，导出为 JSON 且有可选表降级 | 保留。换用自有更新源，核对导出覆盖范围、媒体、解绑清理和文件分享 |

## 其他能力

- 保留品牌启动页、首次引导与邀请提示、账户昵称和头像、成员在线状态、离线提示、同步状态、上传进度与失败重试、服务状态面板、关于页和减少动画设置。现行 `useCouplePresence` 仅发布在线时间，需改用带成员授权的私有频道。
- Web/PWA、Electron、公开介绍页及下载页在原版存在。移动阶段保留源码和可复用入口，发布需切换上游域名、服务、下载和更新配置，PWA 的业务缓存需重新审视。Windows EXE 不在移动包验收范围内。
- 心动 AI、一起听、实时通话与位置共享有现行入口。宠物只有数据库、模型、依赖和旧文档等残留。逐层删除表见 [排除模块](REMOVE_MODULES.md)。

## 高耦合复用点

| 复用点 | 需要拆分或调整的边界 |
| --- | --- |
| `app/app.vue` | 首屏引导、登录与绑定、导航、消息和成员的订阅生命周期，与通话、开麦、音乐和 AI 的加载与退出混在一起 |
| `ChatPanel.vue`、`useMessages.ts`、`messageState.ts` | 异步录音和一般聊天独立于通话、位置卡及实时位置。保留分页、已读、撤回、表情、媒体失败重试 |
| `useActivityFeed.ts`、`useNotificationCenter.ts`、`036` | 动态、通知类型和导航目的地覆盖多个模块。共用日志必须保护原表隐藏字段与撤回状态 |
| `useMediaUrls.ts`、`useMediaUploadQueue.ts`、`uploadQueuePersistence.ts` | Supabase 路径、签名、Tus 和缓存跨头像、封面、相册、回忆、聊天与声音胶囊共用。保留图片变体与队列交互，替换传输和租户缓存边界 |
| `useCoupleAuth.ts`、`useAccountManagement.ts`、`useAccountSecurity.ts`、`account-auth/account-security` | 账户、邀请码、退出、导出和注销跨 RPC、Auth 管理与媒体。尤其 `030` 直接更新排除表 |
| `StreakHistoryPanel.vue`、`useStreakHistory.ts`、`008/016–018` | 历史 payload、里程碑和状态依赖宠物字段。每日心情、活动流与签到历史分别保留 |
| `useSpaceStatus.ts`、`useSystemAlerts.ts`、`usePushNotifications.ts`、原生工程 | 保留状态、录音和本地提醒，移除来电诊断、来电广播和来电服务。后台普通消息推送属于独立配置与验收项 |
