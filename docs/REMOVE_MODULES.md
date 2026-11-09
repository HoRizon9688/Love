# 排除模块与拆除顺序

以 `870c1f5905a7f483eab59efab4159024ef887b8b` 为清点基线。以下条目用于后续变更，本阶段仅记录。保持原 MIT LICENSE 及作者版权声明。Git 旧提交是审计证据，新安装包、运行依赖、部署和新数据库以最终清单为验收边界。

| 模块 | 前端与配置 | 服务、数据库与资源 | 拆除时保护的能力 |
| --- | --- | --- | --- |
| A 心动 AI | `HeartAiView.vue`、`useHeartAi.ts`、壳层导航、通知中心 `loadWorks/refreshAiWorks`、演示素材、旧宣传入口 | `supabase/functions/heart-ai/`、`003_ai_saved_works.sql`、`setup_heart_ai.sql`、`upgrade_ai_*`，`011` 的 `guard_ai_work_update/save_ai_diary`，`030/036` 的 AI 表引用 | 手写时光与情书继续使用各自表。保留 `026/033` 独立问答、心情和日历。检查原有 AI 写入 `memories` 的普通回忆与 AI 专属记录，旧数据迁移不得批量推断或清理 |
| B 宠物小屋 | HEAD 已无宠物壳层入口；清理 `StreakHistoryPanel.vue` 的宠物奖励文案和演示奖励、`three`、`public/models/Fox.glb` 和对应模型许可随资源一起检查 | `couple_pets`、`couple_pet_rewards`、`ensure_couple_pet/interact_with_couple_pet`，`009/010` 的宠物样式、进化函数及 `008/016–018` 中相关类型和逻辑 | 首先恢复独立签到，保留 `couple_streaks/streak_day_actions/streak_activity_events` 和非宠物里程碑、历史及保护。确认旧组合类型签名与授予的 EXECUTE 均无引用 |
| C 一起听 | `ListenTogetherView.vue`、`useListenTogether/useMusicChat`、`listenTogetherState/listenTogetherPlaylist/musicApi/musicRecording`，导航与通知 | `server/routes/music*.get.ts`、`functions/music*.ts` 两套入口，`027/028`、`music_room_messages/listening_sessions`、实时广播、音乐代理白名单和相关桶策略、`030/036` 引用 | 保留私聊音频、播放器基础能力和录音。本地录音的 MIME 探测有复用价值，先抽成通用媒体能力再移除音乐房引用 |
| D 实时音视频通话 | `CallScreen.vue`、`useCoupleCall/useCoupleLiveMic/useAndroidCallControls`、通话样式、`zegoDiagnostics`、`zego-express-engine-webrtc`、启动及重连钩子、空间状态和导出分支 | `zego-token/send-call-push/turn-credentials`、`_shared/zegoRoom.ts`、`infra/coturn`、`scripts/create-turn-credential.mjs`；`013` 的 `call_records` 与守卫、`029/035` 的私有频道策略，`015` 的来电 token 链路；Android `CallControlsPlugin`、`CallForegroundService`、来电全屏／前台服务和浮层权限 | 保留 `013` 的成员、资料读取及 Realtime 有效部分，保留本地通知、语音消息、声音胶囊、选视频。当前 Android 远程推送与来电耦合，只有在新增普通通知发送链路时才另建私有设备 token 表 |
| E 位置共享 | `ChatPanel.vue` 的 `sendLocation/readCurrentPosition/locationData` 和地图卡，`LocationMap.vue`、`leaflet`、`@capacitor/geolocation`、高德环境变量与地图 CSP；移除遗留的 `messageState.parseLiveLocation` 及专属断言，当前在线 presence 只传在线时间 | 现有一次性位置写入 `messages.content` 的 `::location:` 文本协议。未发现独立 GPS 表或持续定位入口。需同时清点历史消息、活动预览、通知、导出和实时载荷。Android 删除粗略和精确定位及合并清单中的插件权限 | 保留普通聊天、在线状态和时光轴手填地点。若导入旧数据，将旧定位条目转换为无坐标占位，原始副本只留受控备份 |

## 共用逻辑的操作顺序

1. 先写保留功能的回归断言。覆盖聊天录音、读／撤回、未来邮箱、问答、打卡双人并发、通知和注销。原来专测排除功能的用例与对应模块一并调整，保留共有的安全断言。
2. 先改数据库契约。改写 `011/030/036` 中混合逻辑，恢复无宠物打卡，将日期 RPC 与活动触发函数分别命名。用 `pg_depend`、`pg_constraint`、`pg_trigger`、`pg_policies`、`pg_publication_tables`、`pg_proc` 及函数体源码扫查外键、策略、触发器、publication、函数签名、GRANT 和运行时表引用。单靠依赖目录无法发现 PL/pgSQL 函数体里的所有引用。
3. 拆壳层导航、延迟初始化、重连、退出、通知、服务诊断和导出。然后移除聊天复合组件中的位置和通话操作，复用独立录音、预览、媒体队列和相册选择。
4. 删除独占实现、环境项、插件和旧资源后再重建锁文件。核对 `nuxt.config.ts` 的 Vite 预优化和公开配置、`.env.example`、`public/_headers`、Pages/Nitro 路由、`.github/workflows/`、原生合并清单、Android JS 桥、文档和生成的宣传页。检查原生和 Web 包里无相关 chunk、网络请求、资源及权限。旧部署服务是否下线须由项目所有者在独立发布阶段处理。

## 验收

- 在全新 Supabase 实例，从登录、绑定、签到到主动解绑和注销均能完成。数据库中只出现保留对象，实时表清单和 private channel 权限与新设计一致。
- 在 Android 和 iPhone 上，聊天语音和声音胶囊录制会按需询问麦克风权限，选取短视频可播放，应用无定位权限和来电全屏服务。相册选择、纪念日／日历／签到本地提醒及普通通知中心可用。
- 扫查保留的业务入口、生产依赖树、服务路由、SQL 对象、打包资产与网络日志。对历史审计记录、删除断言、用户手填地点这些允许项按上下文区分。
