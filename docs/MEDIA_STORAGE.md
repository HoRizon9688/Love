# 私有媒体存储

首次配置可先按 [云端测试准备步骤](CLOUD_TEST_SETUP.md) 创建测试项目和私有桶。

新增媒体可以使用 Cloudflare R2。应用沿用相册、时光轴、头像和声音胶囊的组件，以及图片压缩、缩略图、视频封面和上传队列。旧文件沿用 Supabase Storage 路径。新版应用可同时读取两种路径。

## 授权与传输

1. 客户端把 Supabase 会话令牌交给 Worker。Worker 向 Supabase 验证登录身份，再调用仅允许服务端角色执行的 `media_broker`。数据库核对当前情侣成员、文件类型、路径结构和相册归属。
2. 数据库为逻辑媒体引用分配随机 R2 对象键。Worker 只为该键签发短时 PUT，并绑定内容类型、字节数和 `If-None-Match: *`。相同文件失败后沿用原预留重试。Worker 核验 R2 HEAD 的大小和类型后，才将对象标记为可读。
3. 两位成员可获得有效期 5 分钟的 GET 地址。音视频支持直接请求 R2 的 Range，Worker 只处理授权和元数据。签名地址有效期间，持有者可重复访问，因此应保密。R2 的签名地址和文件字节不写入应用的持久缓存。缩略图地址最多在内存中复用 30 秒。[R2 签名地址](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) · [R2 条件写入](https://developers.cloudflare.com/r2/api/s3/extensions/)
4. 删除后停止签发新地址。相册对象允许情侣成员删除，时光照片、头像和声音胶囊只允许上传者删除。后台定时任务在上传授权和传输宽限期结束后清理对象，避免旧上传地址重新写入已删除文件。

相册视频由设备直接上传，失败时在当前会话重传整份文件。服务端支持最高 1 GiB 的视频预留，应用的相册选择仍按现有上限限制。跨重启恢复业务提交、断点分段上传、已确认但未绑定到业务记录的孤儿扫描仍待实现。

## 配置测试环境

1. 使用独立测试项目应用 [空库迁移链](../supabase/bootstrap/README.md)，包括 `20261109000900_private_media.sql`。已有生产库的迁移和数据切换应另行演练。
2. 在 Cloudflare 创建私有 R2 桶，关闭公开开发 URL 和公开域名。参照 [CORS 示例](../workers/media/r2-cors.example.json) 填写实际网页和原生来源。Android 和 iOS 包上线前分别确认实际请求 Origin。[R2 CORS 配置](https://developers.cloudflare.com/r2/buckets/cors/)
3. 在 [Worker 配置](../workers/media/wrangler.jsonc) 填写公开的 `SUPABASE_URL`、`SUPABASE_PUBLIC_KEY`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME` 和 `ALLOWED_ORIGINS`。`MEDIA_BUCKET` 绑定指向同一个私有桶。R2 S3 凭据只授权该桶。
4. 在 `workers/media/` 执行 `npm ci`。通过 Worker Secrets 配置 `SUPABASE_SERVICE_KEY`、`R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY`。本地使用被 Git 忽略的 `.dev.vars`。应用和网页构建只设置下面两个公开变量。部署操作应在测试项目和私有测试桶准备好后执行。

```env
NUXT_PUBLIC_MEDIA_STORAGE_PROVIDER=r2
NUXT_PUBLIC_MEDIA_WORKER_URL=https://your-media-worker.example
```

设为 `supabase` 时，新上传回到原有存储。该模式需要已经配置相应的私有桶和 RLS。空库迁移链没有创建这些旧桶。已经写入的 R2 文件仍需保留 Worker 地址才能读取。

## 验证

```powershell
npm test
npm --prefix workers/media test
npm --prefix workers/media run typecheck
```

云端验收使用两个绑定账号和一个独立账号。验证相册图片与视频、录音上传、伴侣预览和下载、过期重签、单个文件失败重试和删除。第三账号应无法取得任何对象的上传或读取授权。
